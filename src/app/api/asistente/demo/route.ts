import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider, type ChatMessage } from "@/lib/llm";
import { DEMO_TOOLS, executeDemoTool } from "@/lib/llm/demo-tools";
import {
  buildDemoSystemPrompt,
  mensajeDeCierre,
  MENSAJE_SIN_PRESUPUESTO,
} from "@/lib/llm/demo-prompt";
import { leerAjustesIA, registrarUso } from "@/lib/llm/gobierno";
import { inicioDelDia } from "@/lib/zona-horaria";
import { crmEventoDeUsuario } from "@/lib/crm/sync";
import { fetchSiteSettings } from "@/lib/site";
import { notifyTeam, reportError } from "@/lib/alerts";

/**
 * Agente demo para cuentas SIN membresía — sección 6.
 *
 * Ruta aparte de `/api/asistente/chat` a propósito: otro prompt, otras
 * herramientas y otras comprobaciones. No es el asistente de miembros con
 * permisos recortados — un conjunto de herramientas que no se importa aquí no
 * se puede filtrar por error.
 *
 * Todas las condiciones se evalúan EN EL SERVIDOR: que el ajuste esté
 * encendido, que la cuenta no tenga suscripción activa, el tope de mensajes,
 * el ritmo y el tope de gasto del día. El navegador no decide nada.
 */

/** Freno contra abuso: mensajes por minuto de una misma persona. */
const MAX_POR_MINUTO = 6;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const cuerpo = await request.json().catch(() => ({}));
  const mensaje = cuerpo?.message;
  const pedirHumano = cuerpo?.pedirHumano === true;
  const conversationId: string | undefined = cuerpo?.conversationId;

  const admin = createAdminClient();
  const ajustes = await leerAjustesIA(admin);

  // --- 1. ¿Está encendido? -------------------------------------------------
  if ((ajustes.demo_agent_enabled ?? "0") !== "1")
    return NextResponse.json({ error: "La demostración no está disponible." }, { status: 403 });

  // --- 2. ¿Esta cuenta es de alguien SIN membresía? ------------------------
  // Misma consulta que usa loginDestination(). Si tiene plan activo, le toca
  // el asistente real, no este.
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    // Una suscripción por peludo en el $599: sin limit(1), dos filas = null
    // y un miembro de verdad caía en el demo.
    .limit(1)
    .maybeSingle();
  if (sub)
    return NextResponse.json(
      { error: "Tu membresía está activa: usa el asistente completo." },
      { status: 403 },
    );

  // --- 3. Tope de gasto del día -------------------------------------------
  const tope = Number(ajustes.demo_agent_daily_cost_cap_mxn ?? 0);
  if (tope > 0) {
    // El día es el mexicano, igual que el tope general de la IA: si no, este
    // tope se reiniciaría a una hora distinta que el otro.
    const { data: gastos } = await admin
      .from("ai_usage")
      .select("cost_cents")
      .eq("agent", "demo")
      .gte("created_at", inicioDelDia(new Date()).toISOString());
    const gastado = (gastos ?? []).reduce((s, g) => s + (g.cost_cents ?? 0), 0) / 100;
    if (gastado >= tope) {
      await notifyTeam(
        "notify_demo_sin_presupuesto",
        "El agente demo se apagó por tope de gasto",
        `<p>Se llegó al tope diario de $${tope} MXN. El widget queda apagado hasta mañana.</p>`,
      ).catch(() => {});
      return NextResponse.json({ apagado: true, reply: MENSAJE_SIN_PRESUPUESTO });
    }
  }

  // --- 4. La conversación --------------------------------------------------
  let convId = conversationId ?? "";
  if (convId) {
    const { data } = await admin
      .from("assistant_conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", user.id)
      .eq("mode", "demo")
      .maybeSingle();
    if (!data) convId = "";
  }
  if (!convId) {
    const { data, error } = await admin
      .from("assistant_conversations")
      .insert({
        user_id: user.id,
        mode: "demo",
        title: typeof mensaje === "string" ? mensaje.slice(0, 80) : "Demostración",
      })
      .select("id")
      .single();
    if (error || !data)
      return NextResponse.json({ error: "No se pudo iniciar la demostración." }, { status: 500 });
    convId = data.id;

    // Quien prueba la demostración es un prospecto que ya levantó la mano.
    // Su tarjeta queda en "Registro iniciado", que es exactamente donde está.
    await crmEventoDeUsuario(admin, {
      userId: user.id,
      kind: "primer_mensaje",
      summary: "Empezó a usar el asistente de demostración",
      stageKey: "registro_iniciado",
    });
  }

  // --- 5. ¿Pide hablar con una persona? -----------------------------------
  // Se atiende ANTES que el mensaje: es el momento de mayor intención de
  // compra del embudo y no puede depender de que el modelo responda.
  if (pedirHumano) {
    await admin
      .from("assistant_conversations")
      .update({ wants_human: true, wants_human_at: new Date().toISOString() })
      .eq("id", convId);

    const { data: perfil } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", user.id)
      .single();
    await notifyTeam(
      "notify_demo_pide_humano",
      `Un interesado pide hablar con una persona: ${perfil?.email ?? "sin correo"}`,
      `<p><strong>${perfil?.first_name ?? "Alguien"}</strong> (${perfil?.email ?? "sin correo"}) está probando la demostración y pidió que le escriba una persona.</p>
       <p>Su conversación ya es asignable en la bandeja.</p>`,
    ).catch(() => {});
    await crmEventoDeUsuario(admin, {
      userId: user.id,
      kind: "pidio_llamada",
      summary: "Pidió hablar con una persona desde la demostración",
    });

    return NextResponse.json({
      conversationId: convId,
      reply:
        "Listo 🐾 Le avisé al equipo y alguien te va a escribir. Mientras tanto, aquí sigo para lo que quieras preguntar de la membresía.",
    });
  }

  if (typeof mensaje !== "string" || !mensaje.trim() || mensaje.length > 2000)
    return NextResponse.json({ error: "Mensaje inválido" }, { status: 400 });

  // --- 6. Tope de mensajes y ritmo ----------------------------------------
  const { data: historial } = await admin
    .from("assistant_messages")
    .select("role, content, created_at")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(60);

  const delUsuario = (historial ?? []).filter((m) => m.role === "user");
  const delAgente = (historial ?? []).filter((m) => m.role === "assistant");

  const haceUnMinuto = Date.now() - 60_000;
  const recientes = delUsuario.filter(
    (m) => new Date(m.created_at).getTime() > haceUnMinuto,
  ).length;
  if (recientes >= MAX_POR_MINUTO)
    return NextResponse.json(
      { conversationId: convId, reply: "Vas muy rápido 🐾 Dame un momento y seguimos." },
      { status: 429 },
    );

  const maxMensajes = Number(ajustes.demo_agent_max_messages ?? 12);
  const handoff = (ajustes.demo_agent_handoff ?? "1") === "1";
  if (maxMensajes > 0 && delUsuario.length >= maxMensajes) {
    const cierre = mensajeDeCierre(handoff);
    await admin.from("assistant_messages").insert([
      { conversation_id: convId, role: "user", content: mensaje },
      { conversation_id: convId, role: "assistant", content: cierre },
    ]);
    return NextResponse.json({
      conversationId: convId,
      reply: cierre,
      agotado: true,
      ofreceHumano: handoff,
    });
  }

  // --- 7. La respuesta -----------------------------------------------------
  const [{ data: perfil }, settings] = await Promise.all([
    admin.from("profiles").select("first_name").eq("id", user.id).single(),
    fetchSiteSettings(),
  ]);

  const system = buildDemoSystemPrompt({
    nombre: perfil?.first_name ?? null,
    ctaCada: Number(ajustes.demo_agent_cta_every ?? 4),
    respuestasPrevias: delAgente.length,
    handoff,
    contactEmail: settings.contact_email,
  });

  const mensajes: ChatMessage[] = [
    ...(historial ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: mensaje },
  ];

  const usadas: string[] = [];
  let respuesta: string;
  try {
    respuesta = await getLLMProvider().completeWithTools({
      messages: mensajes,
      system,
      tools: DEMO_TOOLS,
      executeTool: async (name, input) => {
        usadas.push(name);
        return executeDemoTool(admin, name, input);
      },
      maxTokens: 700,
    });
  } catch (e) {
    await reportError("agente-demo", e, { conversationId: convId });
    return NextResponse.json(
      { error: "La demostración no está disponible ahora mismo. Intenta de nuevo." },
      { status: 502 },
    );
  }

  await admin.from("assistant_messages").insert([
    { conversation_id: convId, role: "user", content: mensaje },
    { conversation_id: convId, role: "assistant", content: respuesta },
  ]);
  await admin
    .from("assistant_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", convId);

  // Queda la constancia, con las herramientas que se usaron: es lo que permite
  // afirmar que el demo NO tocó datos de miembro.
  await registrarUso(admin, {
    agent: "demo",
    // OJO: va en assistantConversationId, no en conversationId. Esa columna
    // apunta a las conversaciones de CANAL y la llave foránea rechazaría la
    // fila sin decir nada, dejando el tope de gasto sin datos que sumar.
    assistantConversationId: convId,
    model: process.env.LLM_MODEL ?? process.env.LLM_PROVIDER ?? "demo",
    tokensIn: Math.ceil(mensajes.reduce((s, m) => s + m.content.length, 0) / 4),
    tokensOut: Math.ceil(respuesta.length / 4),
    tools: usadas,
  });

  const restantes = maxMensajes > 0 ? maxMensajes - (delUsuario.length + 1) : null;
  return NextResponse.json({
    conversationId: convId,
    reply: respuesta,
    restantes,
    ofreceHumano: handoff,
  });
}
