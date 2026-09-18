import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider, isUrgent, type ChatMessage } from "@/lib/llm";
import { puedeResponderIA, registrarUso } from "@/lib/llm/gobierno";
import { reportError } from "@/lib/alerts";
import { esMiembro599 } from "@/lib/reintegros-599";
import { estadoDelChatVet, LIMITE_DIARIO_SIN_MEMBRESIA } from "@/lib/chat-vet";

const HISTORY_LIMIT = 20;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { conversationId, message } = await request.json();
  if (typeof message !== "string" || !message.trim() || message.length > 2000) {
    return NextResponse.json({ error: "Mensaje inválido" }, { status: 400 });
  }

  // Abierto a toda cuenta (equipo, 17-sep-2026 — juntas/75): quien no es
  // miembro chatea con límite diario y el chat no le promete beneficios.
  const admin = createAdminClient();
  const [{ data: profile }, { data: pets }, { data: phoneRow }, estado] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, membership_status")
      .eq("id", user.id)
      .single(),
    supabase
      .from("pets")
      .select("name, species, breed, age_years, age_months")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "emergency_phone")
      .maybeSingle(),
    estadoDelChatVet(admin, user.id),
  ]);

  if (!estado.esMiembro && !estado.tieneTelefono) {
    return NextResponse.json(
      { error: "Registra tu teléfono para usar la orientación veterinaria.", motivo: "sin_telefono" },
      { status: 400 },
    );
  }
  if (estado.restantes === 0) {
    return NextResponse.json(
      {
        error: `Usaste tus ${LIMITE_DIARIO_SIN_MEMBRESIA} mensajes de hoy. Con la membresía de Pata Amiga la orientación veterinaria es sin límite, las 24 horas.`,
        motivo: "limite",
      },
      { status: 429 },
    );
  }

  // Find or create the conversation (RLS scopes everything to this member)
  let convId: string = conversationId;
  if (convId) {
    const { data: conv } = await supabase
      .from("vet_conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conv) convId = "";
  }
  if (!convId) {
    const { data: conv, error } = await supabase
      .from("vet_conversations")
      .insert({ user_id: user.id, title: message.slice(0, 80) })
      .select("id")
      .single();
    if (error || !conv) {
      return NextResponse.json({ error: "No se pudo iniciar el chat" }, { status: 500 });
    }
    convId = conv.id;
  }

  const { data: historyRows } = await supabase
    .from("vet_messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  const history: ChatMessage[] = (historyRows ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const messages: ChatMessage[] = [...history, { role: "user", content: message }];

  const veredicto = await puedeResponderIA(admin, {
    canal: "vet",
    conversationId: convId,
    humanTakeover: false,
  });
  if (!veredicto.puede) {
    return NextResponse.json(
      { error: "La orientación no está disponible en este momento. Intenta más tarde." },
      { status: 429 },
    );
  }

  const urgent = isUrgent(message);
  const context = {
    memberName: profile?.first_name ?? null,
    pets: (pets ?? []).map((p) => ({
      name: p.name,
      species: p.species as "dog" | "cat",
      breed: p.breed,
      ageLabel: p.age_months
        ? `${p.age_months} meses`
        : `${p.age_years ?? "?"} ${p.age_years === 1 ? "año" : "años"}`,
    })),
    urgent,
    emergencyPhone: phoneRow?.value ?? null,
    es599: estado.esMiembro ? await esMiembro599(admin, user.id) : false,
    esMiembro: estado.esMiembro,
  };

  let reply: string;
  try {
    reply = await getLLMProvider().complete(messages, context);
  } catch (e) {
    // Alerta: orientación 24/7 caída afecta a todos los miembros
    await reportError("vet-chat", e, { conversationId: convId });
    return NextResponse.json(
      { error: "La orientación no está disponible en este momento. Intenta de nuevo." },
      { status: 502 },
    );
  }

  await supabase.from("vet_messages").insert([
    { conversation_id: convId, role: "user", content: message },
    { conversation_id: convId, role: "assistant", content: reply },
  ]);

  // Sin conversationId/assistantConversationId: esas columnas apuntan a las
  // conversaciones de canal y del asistente; las de vet viven en otra tabla y
  // la llave foránea rechazaría la fila en silencio.
  await registrarUso(admin, {
    agent: "vet",
    model: process.env.LLM_MODEL ?? process.env.LLM_PROVIDER ?? "demo",
    tokensIn: Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4),
    tokensOut: Math.ceil(reply.length / 4),
  });

  return NextResponse.json({
    conversationId: convId,
    reply,
    urgent,
    esMiembro: estado.esMiembro,
    restantes: estado.restantes === null ? null : Math.max(0, estado.restantes - 1),
  });
}
