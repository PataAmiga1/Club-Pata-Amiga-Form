import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeam, reportError } from "@/lib/alerts";
import { emitEvent } from "@/lib/crm/events";
import { registrarAtribucion, vincularContactoDeConversacion } from "@/lib/channels/entrante";
import { responderComoAgenteVentas } from "@/lib/channels/agente-ventas";
import { mapaDeProveedores, proveedorDe } from "@/lib/channels/proveedor";
import { reglaFlowly } from "@/lib/llm/gobierno-reglas";
import { clienteFlowly, decisionEnvioAgente, type ClienteFlowly } from "./client";
import {
  ACTOR_AGENTE,
  adjuntosParaGuardar,
  apagaIA,
  atribucionParaGuardar,
  contenidoDeMensaje,
  decisionEntregaRepetida,
  esCanalFlowly,
  esEstadoVigente,
  externalUserIdFlowly,
  filaDeSalienteExterno,
  fuenteDeAnuncio,
  identidadDeContacto,
  leerConversacion,
  leerDatosMensaje,
  MAX_INTENTOS,
  origenDeSaliente,
  REPROCESAR_TRAS_MS,
  reflejoDeConversacion,
  tieneTextoLegible,
} from "./mapeo";
import type { CanalFlowly, ConversacionFlowly, DatosMensaje, EventoFlowly } from "./tipos";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Lo que hace la plataforma con cada evento del webhook de Flowly.
 *
 * Reglas del contrato (§11.4) que guían todo:
 * - Una entrega puede llegar dos veces: se deduplica por su id ANTES de nada
 *   (y antes del LLM), y los registros se amarran a los ids de Flowly.
 * - Pueden llegar desordenadas: todo es upsert por id, y un estado viejo no
 *   pisa uno nuevo.
 * - Son pistas: cuando importa (el turno del agente) se le pregunta a la API.
 */

const COLUMNAS_HILO =
  "id, channel, human_takeover, display_name, needs_attention, contact_id, ad_referral, flowly_state_at, flowly_taken_over_by";

type FilaHilo = {
  id: string;
  channel: string;
  human_takeover: boolean;
  display_name: string | null;
  needs_attention: boolean;
  contact_id: string | null;
  ad_referral: unknown;
  flowly_state_at: string | null;
  flowly_taken_over_by: string | null;
};

// ------------------------------------------------------------ entregas -----

/**
 * Registra la entrega. "nuevo" = procesarla; "duplicado" = ya se procesó o se
 * está procesando; "reprocesar" = llegó antes pero quedó a medias.
 */
export async function registrarEntrega(
  admin: Admin,
  evento: EventoFlowly,
): Promise<"nuevo" | "duplicado" | "reprocesar"> {
  const { error } = await admin.from("flowly_webhook_events").insert({
    id: evento.id,
    event: evento.event,
    payload: evento,
    event_created_at: evento.created_at,
  });
  if (!error) return "nuevo";
  if (error.code !== "23505") throw error;

  const { data } = await admin
    .from("flowly_webhook_events")
    .select("processed_at, received_at, attempts")
    .eq("id", evento.id)
    .maybeSingle();
  return decisionEntregaRepetida(data);
}

/**
 * Procesa una entrega y deja constancia (procesada o con su error). Nunca
 * lanza: corre después de haberle contestado 200 a Flowly.
 */
export async function procesarEntrega(admin: Admin, evento: EventoFlowly): Promise<void> {
  let error: string | null = null;
  let terminada = true;
  try {
    const r = await procesarEvento(admin, evento);
    if (r === "canal_inactivo") {
      terminada = false;
      error = "El canal no está activado para Flowly (Portal de ventas → IA → Proveedor por canal).";
    }
  } catch (e) {
    terminada = false;
    error = e instanceof Error ? e.message : String(e);
    await reportError("flowly-webhook", e, { event: evento.event, delivery: evento.id });
  }

  try {
    const { data } = await admin
      .from("flowly_webhook_events")
      .select("attempts")
      .eq("id", evento.id)
      .maybeSingle();
    await admin
      .from("flowly_webhook_events")
      .update({
        attempts: (data?.attempts ?? 0) + 1,
        last_error: error,
        ...(terminada ? { processed_at: new Date().toISOString() } : {}),
      })
      .eq("id", evento.id);
  } catch (e) {
    console.error("[flowly] no se pudo marcar la entrega", e);
  }
}

/** Despacha por tipo de evento. */
export async function procesarEvento(
  admin: Admin,
  evento: EventoFlowly,
): Promise<"ok" | "ignorado" | "canal_inactivo"> {
  const canal = canalDelEvento(evento);
  if (canal) {
    const mapa = await mapaDeProveedores(admin);
    if (proveedorDe(mapa, canal) !== "flowly") return "canal_inactivo";
  }

  switch (evento.event) {
    case "message.received": {
      const datos = leerDatosMensaje(evento.data);
      if (!datos || datos.message.direction !== "in") return "ignorado";
      await procesarEntrante(admin, datos);
      return "ok";
    }
    case "message.sent": {
      const datos = leerDatosMensaje(evento.data);
      if (!datos || datos.message.direction !== "out") return "ignorado";
      await procesarSaliente(admin, datos);
      return "ok";
    }
    case "message.updated": {
      const datos = leerDatosMensaje(evento.data);
      if (!datos) return "ignorado";
      await procesarActualizado(admin, datos);
      return "ok";
    }
    case "conversation.updated": {
      const conv = leerConversacion(evento.data.conversation);
      if (!conv) return "ignorado";
      await procesarConversacion(admin, conv, evento.created_at);
      return "ok";
    }
    case "conversation.deleted": {
      const id = typeof evento.data.conversation_id === "string" ? evento.data.conversation_id : null;
      if (!id) return "ignorado";
      // El operador borró el contacto en Flowly (típicamente, una solicitud de
      // borrado). Se borra nuestra copia del hilo; el contacto del CRM queda.
      await admin.from("channel_conversations").delete().eq("flowly_conversation_id", id);
      return "ok";
    }
    case "connection.updated":
    case "connection.connected":
    case "connection.disconnected":
      await procesarConexion(admin, evento);
      return "ok";
    default:
      // comment.* y lo que venga después: la bandeja de ventas no lo usa todavía.
      return "ignorado";
  }
}

function canalDelEvento(evento: EventoFlowly): CanalFlowly | null {
  const d = evento.data as Record<string, unknown>;
  if (esCanalFlowly(d.channel)) return d.channel;
  const conv = d.conversation as Record<string, unknown> | undefined;
  if (conv && esCanalFlowly(conv.channel)) return conv.channel;
  return null;
}

// ------------------------------------------------------- conversaciones ----

/**
 * Encuentra o crea el hilo local de una conversación de Flowly.
 *
 * Primero por el id de Flowly. Si no existe, por (canal, external_user_id):
 * en WhatsApp ese es el número, así que un hilo viejo del camino directo con la
 * misma persona se ADOPTA (pasa a provider 'flowly') en vez de duplicarse.
 */
async function asegurarConversacion(
  admin: Admin,
  canal: CanalFlowly,
  flowlyId: string,
  connectionId: string | null,
  conv: ConversacionFlowly | null,
): Promise<FilaHilo> {
  const nombre = conv?.contact.name ?? null;

  const { data: existente } = await admin
    .from("channel_conversations")
    .select(COLUMNAS_HILO)
    .eq("flowly_conversation_id", flowlyId)
    .maybeSingle();
  if (existente) {
    if ((nombre && nombre !== existente.display_name) || connectionId)
      await admin
        .from("channel_conversations")
        .update({
          ...(nombre ? { display_name: nombre } : {}),
          ...(connectionId ? { flowly_connection_id: connectionId } : {}),
        })
        .eq("id", existente.id);
    return { ...existente, display_name: nombre ?? existente.display_name } as FilaHilo;
  }

  const externo = externalUserIdFlowly(canal, flowlyId, conv?.contact.handle ?? null);
  const datosFlowly = {
    provider: "flowly",
    flowly_conversation_id: flowlyId,
    ...(connectionId || conv?.connection_id
      ? { flowly_connection_id: connectionId ?? conv?.connection_id }
      : {}),
    ...(nombre ? { display_name: nombre } : {}),
  };

  const { data: viejo } = await admin
    .from("channel_conversations")
    .select(COLUMNAS_HILO)
    .eq("channel", canal)
    .eq("external_user_id", externo)
    .maybeSingle();
  if (viejo) {
    await admin.from("channel_conversations").update(datosFlowly).eq("id", viejo.id);
    return { ...viejo, display_name: nombre ?? viejo.display_name } as FilaHilo;
  }

  const { data: nuevo, error } = await admin
    .from("channel_conversations")
    .insert({
      channel: canal,
      external_user_id: externo,
      status: "open",
      ...datosFlowly,
    })
    .select(COLUMNAS_HILO)
    .single();
  if (nuevo) return nuevo as FilaHilo;
  if (error?.code === "23505") {
    // Otra entrega lo creó al mismo tiempo.
    const { data: otra } = await admin
      .from("channel_conversations")
      .select(COLUMNAS_HILO)
      .eq("flowly_conversation_id", flowlyId)
      .maybeSingle();
    if (otra) return otra as FilaHilo;
  }
  throw error ?? new Error("No se pudo crear la conversación de Flowly");
}

/** Aplica el estado de Flowly (interruptor, nombre) si no es más viejo que el aplicado. */
async function aplicarEstado(
  admin: Admin,
  hilo: FilaHilo,
  conv: ConversacionFlowly,
  cuando: string | null,
): Promise<FilaHilo> {
  if (!esEstadoVigente(hilo.flowly_state_at, cuando)) return hilo;
  const reflejo = reflejoDeConversacion(conv, hilo.flowly_taken_over_by);
  const cambios: Record<string, unknown> = {
    ...reflejo,
    flowly_state_at: cuando ?? new Date().toISOString(),
    ...(conv.contact.name ? { display_name: conv.contact.name } : {}),
    ...(conv.connection_id ? { flowly_connection_id: conv.connection_id } : {}),
  };
  await admin.from("channel_conversations").update(cambios).eq("id", hilo.id);

  if (reflejo.human_takeover !== undefined && reflejo.human_takeover !== hilo.human_takeover && hilo.contact_id) {
    const quien =
      conv.taken_over_by === "native_app"
        ? "desde la app del teléfono"
        : conv.taken_over_by === "operator"
          ? "desde la consola de Flowly"
          : "desde Flowly";
    await emitEvent(admin, {
      contactId: hilo.contact_id,
      kind: "nota",
      summary: reflejo.human_takeover
        ? `Tomaron la conversación ${quien} (la IA deja de responder en este hilo)`
        : "Devolvieron la conversación al asistente desde Flowly (la IA vuelve a responder)",
      payload: { conversationId: hilo.id, takenOverBy: conv.taken_over_by },
      actorLabel: "Flowly",
    });
  }
  return {
    ...hilo,
    human_takeover: reflejo.human_takeover ?? hilo.human_takeover,
    flowly_taken_over_by: reflejo.flowly_taken_over_by,
    flowly_state_at: (cambios.flowly_state_at as string) ?? hilo.flowly_state_at,
    display_name: conv.contact.name ?? hilo.display_name,
  };
}

async function procesarConversacion(admin: Admin, conv: ConversacionFlowly, cuando: string | null) {
  const { data: hilo } = await admin
    .from("channel_conversations")
    .select(COLUMNAS_HILO)
    .eq("flowly_conversation_id", conv.id)
    .maybeSingle();
  // Un hilo que todavía no conocemos se crea con su primer mensaje.
  if (!hilo) return;
  await aplicarEstado(admin, hilo as FilaHilo, conv, cuando);
}

async function procesarConexion(admin: Admin, evento: EventoFlowly) {
  const c = evento.data.connection as Record<string, unknown> | undefined;
  const id = typeof c?.id === "string" ? c.id : null;
  if (!id) return;

  if (evento.event === "connection.updated" && typeof c?.agent_enabled === "boolean") {
    // Los hilos que heredan el interruptor de la cuenta cambian todos juntos;
    // Flowly no manda un evento por hilo (§11.3).
    await admin
      .from("channel_conversations")
      .update({ flowly_agent_enabled: c.agent_enabled })
      .eq("flowly_connection_id", id)
      .is("flowly_agent_override", null);
  }

  if (evento.event === "connection.disconnected") {
    const removida = evento.data.removed === true;
    await notifyTeam(
      "notify_channel_attention",
      `Se desconectó una cuenta de ${String(c?.channel ?? "redes")} en Flowly`,
      `<p>La cuenta <b>${String(c?.handle ?? id)}</b> (${String(c?.channel ?? "")}) ${
        removida ? "ya no está asignada a Pata Amiga en Flowly" : "dejó de funcionar en Flowly"
      }.</p>
       <p>Mientras no se vuelva a conectar, los mensajes por esa cuenta NO salen (ni del equipo ni de la IA).</p>`,
    );
  }
}

// ----------------------------------------------------------- entrantes -----

/** Un cliente escribió. */
async function procesarEntrante(admin: Admin, datos: DatosMensaje) {
  const cliente = clienteFlowly();
  const m = datos.message;

  // Se lee la conversación de la API: el webhook no trae nombre ni teléfono.
  let conv: ConversacionFlowly | null = null;
  if (cliente) {
    const r = await cliente.obtenerConversacion(datos.conversation_id);
    if (r.ok) conv = leerConversacion(r.data);
    else if (r.codigo === "not_found") return; // ya la borraron en Flowly
  }

  let hilo = await asegurarConversacion(admin, datos.channel, datos.conversation_id, datos.connection_id, conv);
  if (conv) hilo = await aplicarEstado(admin, hilo, conv, new Date().toISOString());

  const contenido = contenidoDeMensaje(m);
  const { error: errorMsg } = await admin.from("channel_messages").insert({
    conversation_id: hilo.id,
    direction: "in",
    sender: "contact",
    content: contenido,
    flowly_message_id: m.id,
    attachments: adjuntosParaGuardar(m),
    created_at: m.created_at,
  });
  const yaGuardado = errorMsg?.code === "23505";
  if (errorMsg && !yaGuardado) throw errorMsg;

  await admin.from("channel_conversations").update({ status: "open" }).eq("id", hilo.id);
  await admin
    .from("channel_conversations")
    .update({ last_message_at: m.created_at })
    .eq("id", hilo.id)
    .lt("last_message_at", m.created_at);

  if (!yaGuardado) {
    // CRM: igual que el camino directo (contacto, primer_mensaje y oportunidad
    // en "Nuevo prospecto"), más la atribución del anuncio si la trae.
    const anuncio = datos.referral ? atribucionParaGuardar(datos.referral, m.created_at) : null;
    const fuente = anuncio ? fuenteDeAnuncio(datos.channel) : datos.channel;
    if (!hilo.contact_id) {
      const { contactId } = await vincularContactoDeConversacion(admin, {
        conversationId: hilo.id,
        channel: datos.channel,
        externalUserId: externalUserIdFlowly(datos.channel, datos.conversation_id, conv?.contact.handle ?? null),
        displayName: hilo.display_name,
        texto: contenido,
        identidad: identidadDeContacto(datos.channel, datos.conversation_id, conv?.contact.handle ?? null),
        fuente,
        anuncio,
      });
      hilo = { ...hilo, contact_id: contactId };
    } else if (anuncio) {
      await registrarAtribucion(admin, {
        conversationId: hilo.id,
        contactId: hilo.contact_id,
        fuente,
        anuncio,
      });
    }
  }

  // Un audio, una foto o un archivo sin texto: la IA no puede leerlo. Queda a
  // la vista del equipo en lugar de recibir una respuesta a ciegas.
  if (!tieneTextoLegible(m)) {
    if (!yaGuardado && !hilo.needs_attention && !hilo.human_takeover)
      await admin
        .from("channel_conversations")
        .update({
          needs_attention: true,
          attention_reason: `Mandó ${contenido.replace(/^\[|\]$/g, "").toLowerCase()} que la IA no puede leer`,
          attention_at: new Date().toISOString(),
          attention_notified_at: null,
        })
        .eq("id", hilo.id);
    return;
  }

  await turnoDelAgente(admin, cliente, hilo, datos);
}

/**
 * El turno del agente para un mensaje entrante (contrato §8.2): una respuesta
 * por mensaje, guardada con su llave antes de enviarse.
 */
async function turnoDelAgente(
  admin: Admin,
  cliente: ClienteFlowly | null,
  hilo: FilaHilo,
  datos: DatosMensaje,
) {
  const llave = `agent:${datos.message.id}`;

  // ¿Ya hay respuesta para este mensaje? Si salió, nada que hacer; si quedó a
  // medias, se reenvía EXACTAMENTE ese texto con la misma llave (sin LLM).
  const { data: previa } = await admin
    .from("channel_messages")
    .select("id, content, flowly_message_id, sent_at, delivery_status")
    .eq("idempotency_key", llave)
    .maybeSingle();
  if (previa) {
    if (!previa.sent_at && (previa.delivery_status === null || previa.delivery_status === "queued") && cliente)
      await enviarRespuestaAgente(admin, cliente, {
        filaId: previa.id,
        conversationIdLocal: hilo.id,
        flowlyConversationId: datos.conversation_id,
        texto: previa.content,
        llave,
      });
    return;
  }

  await responderComoAgenteVentas(
    admin,
    {
      conversationId: hilo.id,
      channel: datos.channel,
      displayName: hilo.display_name,
      texto: datos.message.body ?? "",
      needsAttention: hilo.needs_attention,
      humanTakeover: hilo.human_takeover,
    },
    {
      idempotencyKey: llave,
      // Justo antes del LLM se le pregunta a Flowly, fresco, si el agente puede
      // hablar: ve tomas que nosotros no (el teléfono, su consola).
      antesDeGenerar: async () => {
        if (!cliente)
          return { puede: false, motivo: "Flowly sin configurar (FLOWLY_API_KEY)", avisar: false };
        const r = await cliente.obtenerConversacion(datos.conversation_id);
        if (!r.ok) return { puede: false, motivo: r.paraEquipo, avisar: false };
        const conv = leerConversacion(r.data);
        if (conv) await aplicarEstado(admin, hilo, conv, new Date().toISOString());
        return reglaFlowly({
          agentEnabled: r.data.agent_enabled === true,
          agentCanSend: r.data.eligibility?.agent_can_send === true,
          takenOverBy: r.data.taken_over_by ?? null,
          razon: r.data.eligibility?.reason ?? null,
        });
      },
      enviar: async (respuesta, filaId) => {
        if (!cliente) return;
        await enviarRespuestaAgente(admin, cliente, {
          filaId,
          conversationIdLocal: hilo.id,
          flowlyConversationId: datos.conversation_id,
          texto: respuesta,
          llave,
        });
      },
    },
  );
}

/** Envía (o reenvía) una respuesta del agente ya guardada, y anota el resultado. */
export async function enviarRespuestaAgente(
  admin: Admin,
  cliente: ClienteFlowly,
  input: {
    filaId: string;
    conversationIdLocal: string;
    flowlyConversationId: string;
    texto: string;
    llave: string;
  },
): Promise<"hecho" | "descartar" | "reintentar" | "fallo"> {
  const r = await cliente.enviarTexto({
    conversationId: input.flowlyConversationId,
    body: input.texto,
    sentBy: "agent",
    actor: ACTOR_AGENTE,
    idempotencyKey: input.llave,
  });
  const decision = decisionEnvioAgente(r);

  if (decision === "hecho") {
    await admin
      .from("channel_messages")
      .update({
        ...(r.ok && r.data?.id ? { flowly_message_id: r.data.id } : {}),
        delivery_status: r.ok ? (r.data?.status ?? "sent") : "sent",
        sent_at: new Date().toISOString(),
        send_error: null,
      })
      .eq("id", input.filaId);
  } else if (!r.ok && decision === "descartar") {
    // Normal, no es un error: una persona tomó el hilo mientras el LLM pensaba,
    // o se cerró la ventana. La respuesta queda a la vista, marcada como no
    // enviada, y nunca sale.
    await admin
      .from("channel_messages")
      .update({ delivery_status: "failed", send_error: `La IA no la envió: ${r.paraEquipo}` })
      .eq("id", input.filaId);
    if (r.codigo === "agent_disabled")
      await admin
        .from("channel_conversations")
        .update({ human_takeover: true })
        .eq("id", input.conversationIdLocal);
  } else if (!r.ok && decision === "reintentar") {
    // Nada salió: la tarea de conciliación la reintenta con la MISMA llave.
    await admin
      .from("channel_messages")
      .update({ delivery_status: "queued", send_error: `Pendiente de reintento: ${r.paraEquipo}` })
      .eq("id", input.filaId);
  } else if (!r.ok) {
    await admin
      .from("channel_messages")
      .update({
        delivery_status: "failed",
        send_error: r.paraEquipo,
        ...(r.messageId ? { flowly_message_id: r.messageId } : {}),
      })
      .eq("id", input.filaId);
    if (r.codigo === "unauthorized")
      await reportError("flowly-llave", new Error(r.mensaje), { codigo: r.codigo });
  }
  return decision;
}

// ----------------------------------------------------------- salientes -----

/**
 * Un mensaje salió hacia el cliente. Si lo mandamos nosotros, ya está guardado
 * y solo se amarra su estado. Si lo mandó alguien desde la app del teléfono
 * (coexistencia), la consola de Flowly o Flowly mismo, se guarda aquí — y si
 * fue una persona, la IA se calla en ese hilo, igual que Flowly (§6.3).
 */
async function procesarSaliente(admin: Admin, datos: DatosMensaje) {
  const m = datos.message;
  const origen = origenDeSaliente(m);

  if (origen === "propio") {
    await actualizarEstadoSaliente(admin, datos);
    return;
  }

  const { data: existente } = await admin
    .from("channel_conversations")
    .select(COLUMNAS_HILO)
    .eq("flowly_conversation_id", datos.conversation_id)
    .maybeSingle();
  let hilo = existente as FilaHilo | null;
  if (!hilo) {
    const cliente = clienteFlowly();
    let conv: ConversacionFlowly | null = null;
    if (cliente) {
      const r = await cliente.obtenerConversacion(datos.conversation_id);
      if (r.ok) conv = leerConversacion(r.data);
      else if (r.codigo === "not_found") return;
    }
    hilo = await asegurarConversacion(admin, datos.channel, datos.conversation_id, datos.connection_id, conv);
  }

  const { error } = await admin
    .from("channel_messages")
    .insert({ conversation_id: hilo.id, ...filaDeSalienteExterno(m) });
  if (error) {
    if (error.code === "23505") {
      await actualizarEstadoSaliente(admin, datos);
      return;
    }
    throw error;
  }

  await admin
    .from("channel_conversations")
    .update({ last_message_at: m.created_at })
    .eq("id", hilo.id)
    .lt("last_message_at", m.created_at);

  if (apagaIA(m) && !hilo.human_takeover)
    await admin
      .from("channel_conversations")
      .update({ human_takeover: true })
      .eq("id", hilo.id);

  if (hilo.contact_id) {
    const quien =
      origen === "telefono"
        ? "desde la app del teléfono"
        : origen === "operador"
          ? "desde la consola de Flowly"
          : "por Flowly";
    await emitEvent(admin, {
      contactId: hilo.contact_id,
      kind: "mensaje_enviado",
      summary: `Respondieron ${quien}: "${contenidoDeMensaje(m).slice(0, 120)}"${
        apagaIA(m) && !hilo.human_takeover ? " (la IA deja de responder en este hilo)" : ""
      }`,
      payload: { conversationId: hilo.id, flowlyMessageId: m.id, actor: m.actor },
      actorLabel: origen === "telefono" ? "App del teléfono" : "Flowly",
    });
  }
}

async function actualizarEstadoSaliente(admin: Admin, datos: DatosMensaje) {
  const m = datos.message;
  if (!m.status) return;
  await admin
    .from("channel_messages")
    .update({
      delivery_status: m.status,
      ...(m.status === "failed"
        ? { send_error: m.error ?? "Meta no entregó el mensaje." }
        : {}),
    })
    .eq("flowly_message_id", m.id);
}

/** Estado nuevo de un saliente, o archivo de un entrante que terminó de bajar. */
async function procesarActualizado(admin: Admin, datos: DatosMensaje) {
  const m = datos.message;
  if (m.direction === "out") {
    await actualizarEstadoSaliente(admin, datos);
    return;
  }
  // Si el entrante todavía no está (eventos desordenados), message.received lo
  // traerá; no se crea aquí para no correr el agente dos veces.
  await admin
    .from("channel_messages")
    .update({ attachments: adjuntosParaGuardar(m), content: contenidoDeMensaje(m) })
    .eq("flowly_message_id", m.id);
}

// -------------------------------------------------------- conciliación -----

/**
 * Lo que Flowly pide hacer periódicamente (§11.5), en versión mínima:
 * 1. reprocesar entregas que quedaron a medias (se guardó su cuerpo), y
 * 2. reenviar respuestas del agente que quedaron pendientes, con su misma llave.
 */
export async function conciliar(admin: Admin): Promise<{ entregas: number; respuestas: number }> {
  const hace = (ms: number) => new Date(Date.now() - ms).toISOString();

  const { data: pendientes } = await admin
    .from("flowly_webhook_events")
    .select("id, payload")
    .is("processed_at", null)
    .lt("attempts", MAX_INTENTOS)
    .lt("received_at", hace(REPROCESAR_TRAS_MS))
    .gt("received_at", hace(48 * 3_600_000))
    .order("received_at", { ascending: true })
    .limit(25);
  for (const p of pendientes ?? []) await procesarEntrega(admin, p.payload as EventoFlowly);

  let respuestas = 0;
  const cliente = clienteFlowly();
  if (cliente) {
    const { data: filas } = await admin
      .from("channel_messages")
      .select("id, content, idempotency_key, conversation_id, delivery_status, channel_conversations(flowly_conversation_id)")
      .like("idempotency_key", "agent:%")
      .is("sent_at", null)
      .or("delivery_status.is.null,delivery_status.eq.queued")
      .lt("created_at", hace(REPROCESAR_TRAS_MS))
      // Flowly recuerda las llaves 7 días: después, un reenvío sería un envío nuevo.
      .gt("created_at", hace(6 * 86_400_000))
      .limit(25);
    for (const f of filas ?? []) {
      const rel = f.channel_conversations as unknown;
      const conv = (Array.isArray(rel) ? rel[0] : rel) as { flowly_conversation_id: string | null } | null;
      if (!conv?.flowly_conversation_id || !f.idempotency_key) continue;
      await enviarRespuestaAgente(admin, cliente, {
        filaId: f.id,
        conversationIdLocal: f.conversation_id,
        flowlyConversationId: conv.flowly_conversation_id,
        texto: f.content,
        llave: f.idempotency_key,
      });
      respuestas += 1;
    }
  }

  return { entregas: pendientes?.length ?? 0, respuestas };
}
