import type { createAdminClient } from "@/lib/supabase/admin";
import { clienteFlowly } from "./client";
import { ACTOR_SISTEMA, leerConversacion, reflejoDeConversacion } from "./mapeo";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Lleva a Flowly el interruptor del agente de un hilo (contrato §8.1):
 * tomar la conversación o escalarla lo APAGA allá; devolverla al agente lo
 * vuelve a encender.
 *
 * Por qué hace falta: Flowly rechaza cualquier envío del agente con el
 * interruptor apagado, aunque nuestra plataforma no se haya enterado. Que los
 * dos lados digan lo mismo evita que el operador de Flowly vea "agente
 * encendido" en un hilo que el equipo ya tomó.
 *
 * No hace nada si el hilo no es de Flowly. Nunca lanza: si Flowly no contesta,
 * el apagado local ya protege (la IA no corre con human_takeover), y el
 * siguiente turno vuelve a preguntarle a Flowly.
 */
export async function reflejarInterruptorEnFlowly(
  admin: Admin,
  input: { conversationId: string; encendido: boolean; actor?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: hilo } = await admin
      .from("channel_conversations")
      .select("provider, flowly_conversation_id")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (!hilo || hilo.provider !== "flowly" || !hilo.flowly_conversation_id)
      return { ok: true };

    const cliente = clienteFlowly();
    if (!cliente) return { ok: false, error: "Flowly sin configurar" };

    const r = await cliente.cambiarAgente(
      hilo.flowly_conversation_id,
      input.encendido,
      input.actor ?? ACTOR_SISTEMA,
    );
    if (!r.ok) {
      console.error("[flowly] no se pudo cambiar el interruptor del agente", r.codigo, r.mensaje);
      return { ok: false, error: r.paraEquipo };
    }

    const conv = leerConversacion(r.data);
    if (conv) {
      const reflejo = reflejoDeConversacion(conv);
      // El human_takeover local ya lo puso quien llamó; aquí solo el espejo.
      await admin
        .from("channel_conversations")
        .update({
          flowly_agent_enabled: reflejo.flowly_agent_enabled,
          flowly_agent_override: reflejo.flowly_agent_override,
          flowly_taken_over_by: reflejo.flowly_taken_over_by,
          flowly_state_at: new Date().toISOString(),
        })
        .eq("id", input.conversationId);
    }
    return { ok: true };
  } catch (err) {
    console.error("[flowly] interruptor del agente", err);
    return { ok: false, error: "No se pudo avisar a Flowly" };
  }
}
