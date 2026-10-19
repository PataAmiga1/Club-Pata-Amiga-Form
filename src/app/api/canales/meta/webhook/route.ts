import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseMetaWebhook,
  sendChannelMessage,
  verifyMetaSignature,
  type IncomingMessage,
} from "@/lib/channels/meta";
import { reportError } from "@/lib/alerts";
import { vincularContactoDeConversacion } from "@/lib/channels/entrante";
import { responderComoAgenteVentas } from "@/lib/channels/agente-ventas";
import { mapaDeProveedores, proveedorDe } from "@/lib/channels/proveedor";

/**
 * Webhook de Meta para Messenger, Instagram DM y WhatsApp — el agente de
 * ventas responde en automático y todo queda en /admin/conversaciones.
 *
 * CONECTAR: en developers.facebook.com, el coder registra este endpoint
 * (https://<dominio>/api/canales/meta/webhook) como Callback URL del webhook
 * de la app, con el token de verificación META_VERIFY_TOKEN y suscripciones a
 * "messages" (Página, Instagram y WhatsApp). Ver docs/AGENTES-IA.md.
 */

/** Alta del webhook: Meta manda un reto que hay que devolver tal cual. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Token de verificación incorrecto", { status: 403 });
}

/** Mensajes entrantes. Siempre respondemos 200 rápido para que Meta no reintente de más. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  // Falla cerrado: sin META_APP_SECRET se rechaza todo (salvo desarrollo local
  // con META_WEBHOOK_ALLOW_UNSIGNED=1). Ver verifyMetaSignature.
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Firma inválida", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const incoming = parseMetaWebhook(body);
  // Un canal que ya se pasó a Flowly lo atiende su webhook: si Meta todavía
  // nos manda algo de ese canal (transición), no se contesta dos veces.
  const proveedores = await mapaDeProveedores(createAdminClient());
  // Procesar en serie (suelen ser 1-2 mensajes por webhook)
  for (const msg of incoming) {
    if (proveedorDe(proveedores, msg.channel) === "flowly") continue;
    try {
      await handleIncoming(msg);
    } catch (e) {
      await reportError("canales-webhook", e, { channel: msg.channel });
    }
  }

  return NextResponse.json({ received: true });
}

/** Guarda el mensaje, y si la IA no está pausada en esa conversación, responde. */
async function handleIncoming(msg: IncomingMessage) {
  const admin = createAdminClient();

  // Conversación por (canal, id externo) — se crea al primer mensaje
  const { data: conv, error } = await admin
    .from("channel_conversations")
    .upsert(
      {
        channel: msg.channel,
        external_user_id: msg.externalUserId,
        ...(msg.displayName ? { display_name: msg.displayName } : {}),
        last_message_at: new Date().toISOString(),
        status: "open",
      },
      { onConflict: "channel,external_user_id" },
    )
    .select("id, human_takeover, display_name, needs_attention, contact_id")
    .single();
  if (error || !conv) throw error ?? new Error("No se pudo crear la conversación");

  // Guardar el mensaje entrante (dedupe: Meta reintenta webhooks)
  const { error: msgError } = await admin.from("channel_messages").insert({
    conversation_id: conv.id,
    direction: "in",
    sender: "contact",
    // Fotos, notas de voz, documentos…: el texto trae la etiqueta legible
    // («[Imagen]») y aquí queda el detalle para poder descargarlo.
    content: msg.text,
    attachments: msg.adjuntos,
    external_message_id: msg.externalMessageId,
  });
  if (msgError) {
    if (msgError.code === "23505") return; // duplicado: ya procesado
    throw msgError;
  }

  // CRM: al primer mensaje la persona entra como contacto y como oportunidad en
  // "Nuevo prospecto". Se hace después del dedupe para que los reintentos de
  // Meta no generen actividad repetida.
  if (!conv.contact_id) {
    await vincularContactoDeConversacion(admin, {
      conversationId: conv.id,
      channel: msg.channel,
      externalUserId: msg.externalUserId,
      displayName: conv.display_name ?? msg.displayName ?? null,
      texto: msg.text,
    });
  }

  // El turno del agente (gobierno, LLM, guardado) es el mismo que usa Flowly;
  // aquí solo cambia cómo sale la respuesta: directo a Meta. Si el conector no
  // está configurado (dev), el mensaje igual queda en la bandeja para revisión.
  await responderComoAgenteVentas(
    admin,
    {
      conversationId: conv.id,
      channel: msg.channel,
      displayName: conv.display_name ?? msg.displayName,
      texto: msg.text,
      needsAttention: conv.needs_attention,
      humanTakeover: conv.human_takeover,
    },
    {
      enviar: async (respuesta) => {
        await sendChannelMessage(msg.channel, msg.externalUserId, respuesta);
      },
    },
  );
}
