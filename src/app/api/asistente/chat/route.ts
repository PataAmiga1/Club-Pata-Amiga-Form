import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getLLMProvider,
  buildSupportSystemPrompt,
  executeSupportTool,
  SUPPORT_TOOLS,
  type ChatMessage,
} from "@/lib/llm";
import { puedeResponderIA, registrarUso } from "@/lib/llm/gobierno";
import { fetchActivePromosText } from "@/lib/llm/promos";
import { fetchSiteSettings } from "@/lib/site";
import { reportError } from "@/lib/alerts";

const HISTORY_LIMIT = 20;

/**
 * Asistente de soporte del portal de miembros. Mismo patrón que /api/vet/chat
 * pero con herramientas: el modelo consulta datos reales del miembro (RLS)
 * para responder de forma personalizada. Disponible para cualquier usuario
 * autenticado (miembros, embajadores y centros con cuenta).
 */
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

  const [{ data: profile }, settings, { data: extraRow }, promosText] = await Promise.all([
    supabase.from("profiles").select("first_name").eq("id", user.id).single(),
    fetchSiteSettings(),
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "assistant_extra_prompt")
      .maybeSingle(),
    fetchActivePromosText("support"),
  ]);

  // Encontrar o crear la conversación (RLS la limita a este usuario)
  let convId: string = conversationId;
  if (convId) {
    const { data: conv } = await supabase
      .from("assistant_conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conv) convId = "";
  }
  if (!convId) {
    const { data: conv, error } = await supabase
      .from("assistant_conversations")
      .insert({ user_id: user.id, title: message.slice(0, 80) })
      .select("id")
      .single();
    if (error || !conv) {
      return NextResponse.json({ error: "No se pudo iniciar el chat" }, { status: 500 });
    }
    convId = conv.id;
  }

  const { data: historyRows } = await supabase
    .from("assistant_messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  const history: ChatMessage[] = (historyRows ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const admin = createAdminClient();
  const veredicto = await puedeResponderIA(admin, {
    canal: "asistente",
    conversationId: convId,
    humanTakeover: false,
  });
  if (!veredicto.puede) {
    return NextResponse.json(
      { error: "El asistente no está disponible en este momento. Intenta más tarde." },
      { status: 429 },
    );
  }

  const system = buildSupportSystemPrompt({
    memberName: profile?.first_name ?? null,
    contactEmail: settings.contact_email,
    extraPrompt: [extraRow?.value, promosText].filter(Boolean).join("\n\n") || undefined,
  });

  let reply: string;
  try {
    reply = await getLLMProvider().completeWithTools({
      messages: [...history, { role: "user", content: message }],
      system,
      tools: SUPPORT_TOOLS,
      executeTool: (name) => executeSupportTool(supabase, user.id, name),
    });
  } catch (e) {
    await reportError("asistente-chat", e, { conversationId: convId });
    return NextResponse.json(
      { error: "El asistente no está disponible en este momento. Intenta de nuevo." },
      { status: 502 },
    );
  }

  await supabase.from("assistant_messages").insert([
    { conversation_id: convId, role: "user", content: message },
    { conversation_id: convId, role: "assistant", content: reply },
  ]);

  await registrarUso(admin, {
    agent: "soporte",
    assistantConversationId: convId,
    model: process.env.LLM_MODEL ?? process.env.LLM_PROVIDER ?? "demo",
    tokensIn: Math.ceil(
      [...history, { content: message }].reduce((s, m) => s + m.content.length, 0) / 4,
    ),
    tokensOut: Math.ceil(reply.length / 4),
  });

  return NextResponse.json({ conversationId: convId, reply });
}
