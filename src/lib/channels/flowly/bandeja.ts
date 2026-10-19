import type { createAdminClient } from "@/lib/supabase/admin";
import { clienteFlowly, sinConfigurar } from "./client";
import { ACTOR_SISTEMA, actorDeEquipo } from "./mapeo";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Envíos de la bandeja (/ventas/conversaciones) cuando el hilo llegó por
 * Flowly. La fila del mensaje ya está guardada; aquí se manda y se anota.
 *
 * Lo que Flowly decide (ventana de 24 h, cuenta desconectada) llega como
 * negativa con frase en español, y se le muestra tal cual al equipo.
 */

/**
 * Texto libre de una persona del equipo. La llave es la fila: reintentar el
 * mismo mensaje (p. ej. el envío programado) nunca lo duplica.
 *
 * Un envío de una persona apaga la IA en el hilo —Flowly lo hace de su lado
 * (§6.3)— y aquí se refleja para que la bandeja diga lo mismo.
 */
export async function enviarTextoPorFlowly(
  admin: Admin,
  input: {
    conversationId: string;
    flowlyConversationId: string | null;
    filaId: string;
    texto: string;
    userId: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.flowlyConversationId)
    return { ok: false, error: "Este hilo no tiene conversación en Flowly." };
  const cliente = clienteFlowly();
  if (!cliente) return { ok: false, error: sinConfigurar().paraEquipo };

  const llave = `pa-msg:${input.filaId}`;
  const actor = input.userId ? actorDeEquipo(input.userId) : ACTOR_SISTEMA;
  const r = await cliente.enviarTexto({
    conversationId: input.flowlyConversationId,
    body: input.texto,
    sentBy: "human",
    actor,
    idempotencyKey: llave,
  });

  if (r.ok) {
    await admin
      .from("channel_messages")
      .update({
        idempotency_key: llave,
        flowly_message_id: r.data?.id ?? null,
        delivery_status: r.data?.status ?? "sent",
      })
      .eq("id", input.filaId);
    await admin
      .from("channel_conversations")
      .update({ human_takeover: true, flowly_taken_over_by: actor })
      .eq("id", input.conversationId);
    return { ok: true };
  }

  await admin
    .from("channel_messages")
    .update({
      idempotency_key: llave,
      delivery_status: "failed",
      ...(r.messageId ? { flowly_message_id: r.messageId } : {}),
    })
    .eq("id", input.filaId);
  // Flowly apaga al agente ANTES de llamar a Meta: si Meta rechazó el mensaje,
  // el agente igual quedó callado (§6.3).
  if (r.codigo === "send_failed")
    await admin
      .from("channel_conversations")
      .update({ human_takeover: true, flowly_taken_over_by: actor })
      .eq("id", input.conversationId);
  return { ok: false, error: r.paraEquipo };
}

/**
 * Plantilla aprobada de WhatsApp dentro de un hilo de Flowly (§6.4.2). Es la
 * salida cuando la ventana de 24 h ya cerró.
 */
export async function enviarPlantillaPorFlowly(
  admin: Admin,
  input: {
    conversationId: string;
    flowlyConversationId: string | null;
    plantilla: {
      meta_name: string;
      language: string;
      variables: number;
      provider: string | null;
      supported: boolean | null;
    };
    parametros: string[];
    userId: string;
  },
): Promise<{ ok: true; flowlyMessageId: string | null } | { ok: false; error: string }> {
  if (!input.flowlyConversationId)
    return { ok: false, error: "Este hilo no tiene conversación en Flowly." };
  if (input.plantilla.provider !== "flowly")
    return {
      ok: false,
      error: `"${input.plantilla.meta_name}" no viene de Flowly. Sincroniza las plantillas (Plantillas → Sincronizar con Flowly).`,
    };
  if (input.plantilla.supported === false)
    return {
      ok: false,
      error: `"${input.plantilla.meta_name}" necesita algo que Flowly no envía (variable en encabezado o botón). Pide al operador una versión sin eso.`,
    };
  if (input.parametros.length !== input.plantilla.variables)
    return {
      ok: false,
      error: `"${input.plantilla.meta_name}" necesita ${input.plantilla.variables} variables y desde la bandeja solo se llena el nombre.`,
    };

  const cliente = clienteFlowly();
  if (!cliente) return { ok: false, error: sinConfigurar().paraEquipo };

  const actor = actorDeEquipo(input.userId);
  const r = await cliente.enviarPlantilla({
    template: input.plantilla.meta_name,
    language: input.plantilla.language,
    variables: input.parametros,
    conversationId: input.flowlyConversationId,
    sentBy: "human",
    actor,
    // Un clic = un envío intencional nuevo.
    idempotencyKey: `pa-plantilla:${crypto.randomUUID()}`,
  });
  if (!r.ok) return { ok: false, error: r.paraEquipo };

  // Una persona eligió y mandó la plantilla: Flowly apagó al agente (§6.4.3).
  await admin
    .from("channel_conversations")
    .update({ human_takeover: true, flowly_taken_over_by: actor })
    .eq("id", input.conversationId);
  return { ok: true, flowlyMessageId: r.data?.message?.id ?? null };
}
