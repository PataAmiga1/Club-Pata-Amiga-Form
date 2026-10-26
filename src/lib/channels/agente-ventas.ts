import type { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider, type AgentTool, type ChatMessage } from "@/lib/llm";
import { buildSalesSystemPrompt } from "@/lib/llm/sales-prompt";
import { ALTAS_SON_599 } from "@/lib/plans/planes";
import { ofertaPublica599 } from "@/lib/plans/oferta";
import { leerCatalogo } from "@/lib/catalogo-cuidados";
import { fetchActivePromosText } from "@/lib/llm/promos";
import { notifyTeam } from "@/lib/alerts";
import { registroAbierto } from "@/lib/registro";
import {
  escalarConversacion,
  puedeResponderIA,
  registrarUso,
} from "@/lib/llm/gobierno";
import { debeEscalarPorTexto, type Veredicto } from "@/lib/llm/gobierno-reglas";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * El turno del agente de ventas en una conversación de redes: escalar si hace
 * falta, decidir si la IA puede hablar, generar la respuesta, guardarla y
 * mandarla.
 *
 * Antes vivía dentro del webhook de Meta. Se sacó aquí para que el webhook de
 * Flowly use EXACTAMENTE el mismo gobierno —toma humana, interruptor por canal,
 * tope diario en pesos, persona de guardia, palabras de escalación y el aviso
 * `notify_channel_attention`— sin copiarlo. Lo único que cambia entre caminos
 * es cómo se envía y, en Flowly, un chequeo extra antes de gastar en el LLM.
 */

const HISTORY_LIMIT = 20;

/**
 * Herramienta con la que el agente de ventas mantiene el pipeline al día:
 * clasifica la etapa de la conversación y/o la marca para atención humana.
 */
export const CLASSIFY_TOOL: AgentTool = {
  name: "clasificar_conversacion",
  description:
    "Actualiza la etapa del pipeline de ventas de esta conversación y/o la marca para que el equipo humano la atienda. Úsala en silencio cuando detectes un cambio claro; no la anuncies al contacto.",
  input_schema: {
    type: "object",
    properties: {
      etapa: {
        type: "string",
        enum: ["nuevo", "interesado", "convertido", "descartado", "soporte"],
        description:
          "interesado = pregunta precios/planes/cómo unirse · convertido = confirma que ya se registró o pagó · descartado = dice que no le interesa · soporte = miembro existente con tema de cuenta (no venta)",
      },
      necesita_atencion: {
        type: "boolean",
        description:
          "true si está molesto, pide un humano, menciona abogados/PROFECO o no puedes resolver su tema",
      },
    },
    additionalProperties: false,
  },
};

/** Lo que el turno necesita saber del mensaje y del hilo. */
export type TurnoAgente = {
  conversationId: string;
  channel: string;
  displayName: string | null;
  /** Texto del mensaje entrante (para escalar y para los avisos). */
  texto: string;
  needsAttention: boolean;
  humanTakeover: boolean;
};

export type OpcionesTurno = {
  /**
   * Último chequeo antes de gastar en el LLM. Flowly lo usa para preguntar su
   * interruptor y su ventana en ese momento (contrato §8.2).
   */
  antesDeGenerar?: () => Promise<Veredicto>;
  /**
   * Llave con que se guarda la respuesta ANTES de enviarla. Si ya existe una
   * fila con esa llave, otra corrida está contestando este mensaje: se detiene.
   */
  idempotencyKey?: string;
  /** Manda la respuesta ya guardada (fila `filaId` en channel_messages). */
  enviar: (respuesta: string, filaId: string) => Promise<void>;
};

export type ResultadoTurno =
  | { resultado: "respondio"; filaId: string }
  | { resultado: "no_puede"; motivo: string }
  | { resultado: "en_curso" };

/** Marca la conversación para atención humana y avisa al equipo por correo. */
export async function marcarParaAtencion(
  admin: Admin,
  turno: Pick<TurnoAgente, "conversationId" | "channel" | "displayName" | "texto">,
  reason: string,
) {
  // Deja el motivo a la vista, apaga la IA y se la asigna a quien está de
  // guardia: escalar a "todos" es la forma más segura de que no la tome nadie.
  const { asignadaA } = await escalarConversacion(admin, {
    conversationId: turno.conversationId,
    motivo: reason,
  });
  if (!asignadaA)
    console.warn(
      "[ia] escalación sin persona de guardia configurada (Portal de ventas → IA)",
    );
  // Destinatarios configurables en /admin/sitio → Notificaciones
  await notifyTeam(
    "notify_channel_attention",
    `Conversación de ${turno.channel} necesita atención`,
    `<p>Una conversación en <b>${turno.channel}</b>${turno.displayName ? ` con <b>${turno.displayName}</b>` : ""} fue marcada para atención del equipo (${reason}).</p>
     <p>Último mensaje: «${turno.texto.slice(0, 200)}»</p>
     <p>Revísala en el panel: <b>Conversaciones</b>.</p>`,
  );
}

/**
 * Un turno completo del agente de ventas. El mensaje entrante ya está guardado
 * y ligado al CRM; esto decide si la IA contesta y, si sí, contesta.
 */
export async function responderComoAgenteVentas(
  admin: Admin,
  turno: TurnoAgente,
  op: OpcionesTurno,
): Promise<ResultadoTurno> {
  // Red de seguridad: señales de molestia/humano/legal escalan la conversación
  // (motivo visible, IA apagada y asignada a quien está de guardia).
  let escaladoAhora = false;
  if (debeEscalarPorTexto(turno.texto, turno.needsAttention)) {
    await marcarParaAtencion(admin, turno, "señales en el mensaje");
    escaladoAhora = true;
  }

  // ¿Puede responder la IA? La persona manda sobre el hilo, el hilo sobre el
  // canal, y encima están los topes de gasto y de ritmo. Cuando no puede, se
  // escala a una persona en lugar de dejar al cliente hablando solo.
  //
  // `escaladoAhora` importa: el hilo se leyó ANTES de escalar, así que su
  // `human_takeover` está viejo. Sin esto, el mismo mensaje que pide un humano
  // ("quiero hablar con una persona") recibía además una respuesta de la IA.
  const veredicto = await puedeResponderIA(admin, {
    canal: turno.channel,
    conversationId: turno.conversationId,
    humanTakeover: turno.humanTakeover || escaladoAhora,
  });
  if (!veredicto.puede) {
    if (veredicto.avisar) {
      await escalarConversacion(admin, {
        conversationId: turno.conversationId,
        motivo: veredicto.motivo,
      });
      await notifyTeam(
        "notify_channel_attention",
        `La IA dejó de responder en ${turno.channel}`,
        `<p>${veredicto.motivo}.</p>
         <p>La conversación${turno.displayName ? ` con <b>${turno.displayName}</b>` : ""} quedó marcada para atención del equipo.</p>
         <p>Último mensaje: «${turno.texto.slice(0, 200)}»</p>`,
      );
    }
    return { resultado: "no_puede", motivo: veredicto.motivo };
  }

  if (op.antesDeGenerar) {
    const extra = await op.antesDeGenerar();
    if (!extra.puede) return { resultado: "no_puede", motivo: extra.motivo };
  }

  // Historial reciente para dar contexto al agente (sin notas internas: esas
  // nunca son del cliente ni de la IA).
  const { data: historyRows } = await admin
    .from("channel_messages")
    .select("direction, content")
    .eq("conversation_id", turno.conversationId)
    .eq("internal", false)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history: ChatMessage[] = (historyRows ?? [])
    .reverse()
    .map((m) => ({
      role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  const [{ data: extraRow }, promosText, abierto, oferta599, catalogo] = await Promise.all([
    admin.from("site_settings").select("value").eq("key", "sales_extra_prompt").maybeSingle(),
    fetchActivePromosText("sales"),
    registroAbierto(),
    ALTAS_SON_599 ? ofertaPublica599(admin) : Promise.resolve(null),
    ALTAS_SON_599 ? leerCatalogo(admin) : Promise.resolve([]),
  ]);

  let marcadaPorAgente = turno.needsAttention || escaladoAhora;
  const reply = await getLLMProvider().completeWithTools({
    messages: history,
    system: buildSalesSystemPrompt({
      contactName: turno.displayName,
      extraPrompt: [extraRow?.value, promosText].filter(Boolean).join("\n\n") || undefined,
      // Altas del $599 sin versión publicada: no hay qué vender todavía.
      registroAbierto: abierto && (!ALTAS_SON_599 || oferta599 !== null),
      oferta599,
      catalogo,
    }),
    tools: [CLASSIFY_TOOL],
    executeTool: async (name, input) => {
      if (name !== "clasificar_conversacion") return "Herramienta desconocida";
      const etapa = typeof input.etapa === "string" ? input.etapa : null;
      if (etapa && ["nuevo", "interesado", "convertido", "descartado", "soporte"].includes(etapa)) {
        await admin
          .from("channel_conversations")
          .update({ pipeline_stage: etapa })
          .eq("id", turno.conversationId);
      }
      if (input.necesita_atencion === true && !marcadaPorAgente) {
        marcadaPorAgente = true;
        await marcarParaAtencion(admin, turno, "clasificación del agente IA");
      }
      return "Conversación clasificada";
    },
    maxTokens: 512, // chat de redes: respuestas cortas
  });

  // Constancia del consumo: qué modelo contestó y cuánto costó. Alimenta los
  // topes y el tablero de la IA.
  await registrarUso(admin, {
    agent: "ventas",
    channel: turno.channel,
    conversationId: turno.conversationId,
    model: process.env.LLM_MODEL ?? process.env.LLM_PROVIDER ?? "demo",
    tokensIn: Math.ceil(history.reduce((s, h) => s + h.content.length, 0) / 4),
    tokensOut: Math.ceil(reply.length / 4),
    tools: ["clasificar_conversacion"],
  });

  // Se guarda ANTES de enviar: si el envío falla a medias, el texto exacto
  // queda para reintentarlo sin otra corrida del LLM.
  const { data: fila, error } = await admin
    .from("channel_messages")
    .insert({
      conversation_id: turno.conversationId,
      direction: "out",
      sender: "ai",
      content: reply,
      ...(op.idempotencyKey ? { idempotency_key: op.idempotencyKey } : {}),
    })
    .select("id")
    .single();
  if (error || !fila) {
    // 23505 con llave: otra corrida ya guardó la respuesta de este mensaje.
    if (error?.code === "23505") return { resultado: "en_curso" };
    throw error ?? new Error("No se pudo guardar la respuesta de la IA");
  }

  await admin
    .from("channel_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", turno.conversationId);

  await op.enviar(reply, fila.id);
  return { resultado: "respondio", filaId: fila.id };
}
