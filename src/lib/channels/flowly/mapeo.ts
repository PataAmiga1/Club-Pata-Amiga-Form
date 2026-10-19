// Con extensión .ts: así también lo cargan las pruebas con node --test.
import { etiquetaPorTipo, unir } from "../etiquetas.ts";
import type {
  AdjuntoFlowly,
  CanalFlowly,
  ConversacionFlowly,
  DatosMensaje,
  EventoFlowly,
  MensajeFlowly,
  ReferralFlowly,
} from "./tipos";

/**
 * Traducción de lo que manda Flowly a lo que guarda la plataforma.
 *
 * Todo aquí es puro (sin base de datos ni red): se prueba suelto con
 * node --test y el webhook solo orquesta.
 */

/** Prefijo de los `actor` que manda ESTA plataforma. Lo demás es de fuera. */
export const PREFIJO_ACTOR = "pa-";
export const ACTOR_AGENTE = "pa-agente-ventas";
export const ACTOR_SISTEMA = "pa-sistema";

/** Actor para una persona del equipo: opaco para Flowly, legible para nosotros. */
export function actorDeEquipo(userId: string): string {
  return `${PREFIJO_ACTOR}equipo:${userId}`.slice(0, 200);
}

export function esActorPropio(actor: string | null | undefined): boolean {
  return typeof actor === "string" && actor.startsWith(PREFIJO_ACTOR);
}

const CANALES: CanalFlowly[] = ["whatsapp", "instagram", "facebook"];

export function esCanalFlowly(c: unknown): c is CanalFlowly {
  return typeof c === "string" && (CANALES as string[]).includes(c);
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

// ------------------------------------------------------------ eventos ------

/** Valida el sobre de una entrega. null = no es un evento de Flowly. */
export function leerEvento(cuerpo: unknown): EventoFlowly | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const c = cuerpo as Record<string, unknown>;
  const id = texto(c.id);
  const event = texto(c.event);
  if (!id || !event) return null;
  const data = c.data && typeof c.data === "object" ? (c.data as Record<string, unknown>) : {};
  return { id, event, created_at: texto(c.created_at), data };
}

function leerAdjunto(a: unknown): AdjuntoFlowly | null {
  if (!a || typeof a !== "object") return null;
  const r = a as Record<string, unknown>;
  const id = texto(r.id);
  if (!id) return null;
  return {
    id,
    kind: texto(r.kind) ?? "document",
    mime_type: texto(r.mime_type),
    filename: texto(r.filename),
    size: typeof r.size === "number" ? r.size : null,
    caption: texto(r.caption),
    status: texto(r.status) ?? "pending",
    failure: texto(r.failure),
    url: texto(r.url),
    url_expires_at: texto(r.url_expires_at),
  };
}

function leerMensaje(m: unknown): MensajeFlowly | null {
  if (!m || typeof m !== "object") return null;
  const r = m as Record<string, unknown>;
  const id = texto(r.id);
  const direction = r.direction === "in" || r.direction === "out" ? r.direction : null;
  if (!id || !direction) return null;
  const adjuntos = Array.isArray(r.attachments)
    ? r.attachments.map(leerAdjunto).filter((a): a is AdjuntoFlowly => a !== null)
    : [];
  const primero = leerAdjunto(r.attachment) ?? adjuntos[0] ?? null;
  const sentBy =
    r.sent_by === "agent" || r.sent_by === "human" || r.sent_by === "system"
      ? r.sent_by
      : null;
  const status =
    r.status === "queued" ||
    r.status === "sent" ||
    r.status === "delivered" ||
    r.status === "read" ||
    r.status === "failed"
      ? r.status
      : null;
  return {
    id,
    direction,
    type: texto(r.type) ?? "text",
    body: typeof r.body === "string" ? r.body : null,
    status,
    created_at: texto(r.created_at) ?? new Date().toISOString(),
    error: texto(r.error),
    sent_by: sentBy,
    actor: texto(r.actor),
    attachment: primero,
    attachments: adjuntos.length ? adjuntos : primero ? [primero] : [],
    referral: direction === "in" ? mapearReferral(r.referral) : null,
  };
}

/** Payload de message.received / message.sent / message.updated. */
export function leerDatosMensaje(data: Record<string, unknown>): DatosMensaje | null {
  const canal = data.channel;
  const conversationId = texto(data.conversation_id);
  const message = leerMensaje(data.message);
  if (!esCanalFlowly(canal) || !conversationId || !message) return null;
  return {
    channel: canal,
    conversation_id: conversationId,
    connection_id: texto(data.connection_id),
    message,
  };
}

/** El objeto conversación (conversation.updated, GET, PATCH). */
export function leerConversacion(c: unknown): ConversacionFlowly | null {
  if (!c || typeof c !== "object") return null;
  const r = c as Record<string, unknown>;
  const id = texto(r.id);
  if (!id || !esCanalFlowly(r.channel)) return null;
  const contacto = (r.contact && typeof r.contact === "object" ? r.contact : {}) as Record<
    string,
    unknown
  >;
  return {
    id,
    channel: r.channel,
    contact: { name: texto(contacto.name), handle: texto(contacto.handle) },
    connection_id: texto(r.connection_id) ?? "",
    unread: r.unread === true,
    last_message_at: texto(r.last_message_at),
    last_activity_at: texto(r.last_activity_at) ?? new Date().toISOString(),
    agent_enabled: r.agent_enabled === true,
    agent_enabled_override:
      typeof r.agent_enabled_override === "boolean" ? r.agent_enabled_override : null,
    taken_over_by: texto(r.taken_over_by),
    taken_over_at: texto(r.taken_over_at),
    first_referral: mapearReferral(r.first_referral),
    last_referral: mapearReferral(r.last_referral),
  };
}

// --------------------------------------------------------- atribución ------

const LLAVES_REFERRAL = [
  "message_id",
  "meta_source",
  "source_id",
  "ad_id",
  "source_url",
  "headline",
  "body",
  "media_type",
  "image_url",
  "video_url",
  "thumbnail_url",
  "ctwa_clid",
  "welcome_message",
  "ref",
  "referral_type",
  "post_id",
  "product_id",
] as const;

/**
 * ÚNICO punto que lee el `referral` de Flowly (contrato §4.5): en
 * `message.referral` y en `conversation.first_referral` / `last_referral`.
 *
 * Flowly ya lo entrega normalizado y con todas sus llaves; aquí solo se
 * valida el tipo de cada una (lo que no sea texto queda null, una llave nueva
 * de Flowly se ignora) para guardarlo tal cual. Regla del contrato: se
 * decide por `referral !== null`, nunca por si una llave viene o no.
 */
export function mapearReferral(raw: unknown): ReferralFlowly | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const leer = (k: string): string | null => {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  };
  const resto = Object.fromEntries(LLAVES_REFERRAL.map((k) => [k, leer(k)])) as Record<
    (typeof LLAVES_REFERRAL)[number],
    string | null
  >;
  return {
    channel: esCanalFlowly(r.channel) ? r.channel : null,
    received_at: leer("received_at"),
    source_type: (leer("source_type") ?? "unknown").toLowerCase(),
    ...resto,
  };
}

/** ¿Fue un anuncio pagado? (y no una publicación o un enlace m.me / ig.me). */
export function esAnuncio(r: ReferralFlowly | null | undefined): boolean {
  return Boolean(r && (r.source_type === "ad" || r.ad_id));
}

/**
 * Fuente del contacto/oportunidad según lo que lo trajo: un anuncio da
 * whatsapp_ad / instagram_ad / messenger_ad; una publicación o un enlace no
 * cambian la fuente (sigue siendo el canal).
 */
export function fuenteDeReferral(canal: CanalFlowly, r: ReferralFlowly | null | undefined): string {
  return esAnuncio(r) ? fuenteDeAnuncio(canal) : canal;
}

/** Fuente del contacto/oportunidad cuando llegó por anuncio. */
export function fuenteDeAnuncio(canal: CanalFlowly): string {
  return canal === "whatsapp"
    ? "whatsapp_ad"
    : canal === "instagram"
      ? "instagram_ad"
      : "messenger_ad";
}

/**
 * ¿Hay que reemplazar el `last_referral` guardado? Solo si el nuevo es más
 * reciente: uno viejo que llega tarde (o reenviado) no lo regresa (§4.5).
 */
export function esReferralMasReciente(
  guardado: ReferralFlowly | null | undefined,
  nuevo: ReferralFlowly | null | undefined,
): boolean {
  if (!nuevo) return false;
  if (!guardado) return true;
  const a = guardado.received_at ? Date.parse(guardado.received_at) : NaN;
  const b = nuevo.received_at ? Date.parse(nuevo.received_at) : NaN;
  if (Number.isNaN(b)) return false;
  if (Number.isNaN(a)) return true;
  return b > a;
}

/** Texto del sello del hilo: «Llegó por anuncio · <titular>». */
export function selloDeReferral(r: ReferralFlowly | null | undefined): string | null {
  if (!r) return null;
  const origen =
    r.source_type === "ad" || r.ad_id
      ? "Llegó por anuncio"
      : r.source_type === "post"
        ? "Llegó por una publicación"
        : r.source_type === "link"
          ? "Llegó por un enlace"
          : "Llegó por anuncio";
  return r.headline ? `${origen} · ${r.headline}` : origen;
}

// ----------------------------------------------------------- mensajes ------

/**
 * Texto que se guarda en channel_messages.content (que no admite null).
 * Texto normal tal cual; un archivo, con la MISMA etiqueta que el camino
 * directo de Meta («[Nota de voz]», «[Documento: receta.pdf]», etiquetas.ts) y
 * su pie si lo trae; una plantilla, con su nombre (Flowly manda el NOMBRE, no
 * el texto llenado).
 */
export function contenidoDeMensaje(m: MensajeFlowly): string {
  const cuerpo = m.body?.trim() ?? "";
  if (m.type === "text") return cuerpo || "(mensaje vacío)";
  if (m.type === "template") return `[plantilla ${cuerpo || "sin nombre"}]`;

  const kind = m.attachment?.kind ?? (m.type === "file" ? "document" : m.type);
  return unir(etiquetaPorTipo(kind, { nombre: m.attachment?.filename }), cuerpo);
}

/** ¿Trae algo que la IA pueda leer? Un audio o una foto sin pie, no. */
export function tieneTextoLegible(m: MensajeFlowly): boolean {
  return Boolean(m.body && m.body.trim());
}

/**
 * Resumen de adjuntos para channel_messages.attachments. SIN la url: dura una
 * hora y se pide de nuevo a Flowly cuando haga falta.
 */
export function adjuntosParaGuardar(m: MensajeFlowly) {
  return m.attachments.map((a) => ({
    origen: "flowly",
    flowly_attachment_id: a.id,
    kind: a.kind,
    mime_type: a.mime_type,
    nombre: a.filename,
    size: a.size,
    status: a.status,
    failure: a.failure,
  }));
}

export type OrigenSaliente =
  /** Lo mandamos nosotros (equipo, agente o sistema): ya está guardado. */
  | "propio"
  /** Alguien contestó desde la app de WhatsApp Business / Business Suite / IG. */
  | "telefono"
  /** El operador de Flowly desde su consola. */
  | "operador"
  /** Mensaje automático de Flowly (sent_by y actor nulos). */
  | "flowly"
  /** Otra plataforma con la misma llave (no debería pasar). */
  | "otro";

export function origenDeSaliente(m: MensajeFlowly): OrigenSaliente {
  if (esActorPropio(m.actor)) return "propio";
  if (m.actor === "native_app") return "telefono";
  if (m.actor === "operator") return "operador";
  if (!m.sent_by && !m.actor) return "flowly";
  return "otro";
}

/** Columnas de channel_messages para un saliente que NO mandamos nosotros. */
export function filaDeSalienteExterno(m: MensajeFlowly) {
  const origen = origenDeSaliente(m);
  return {
    direction: "out" as const,
    // La tabla solo distingue contacto / ia / equipo: una persona del negocio
    // escribiendo desde su teléfono es "equipo".
    sender: m.sent_by === "agent" ? ("ai" as const) : ("admin" as const),
    content: contenidoDeMensaje(m),
    flowly_message_id: m.id,
    delivery_status: m.status,
    external_actor:
      origen === "telefono"
        ? "native_app"
        : origen === "operador"
          ? "operator"
          : origen === "flowly"
            ? "flowly"
            : (m.actor ?? "desconocido"),
    send_error: m.status === "failed" ? (m.error ?? "Meta no entregó el mensaje.") : null,
    sent_at: m.status === "failed" ? null : m.created_at,
    created_at: m.created_at,
    attachments: adjuntosParaGuardar(m),
  };
}

/**
 * Un saliente de una PERSONA de fuera (teléfono, consola) apaga la IA en el
 * hilo: Flowly ya la apagó de su lado (§6.3) y aquí se refleja.
 */
export function apagaIA(m: MensajeFlowly): boolean {
  const origen = origenDeSaliente(m);
  return m.sent_by === "human" && (origen === "telefono" || origen === "operador" || origen === "otro");
}

// ------------------------------------------------------ conversaciones -----

/**
 * external_user_id de una conversación de Flowly. En WhatsApp el handle es el
 * número en dígitos —el mismo wa_id que guardaba el camino directo—, así que
 * una conversación vieja del mismo número se reutiliza en vez de duplicarse.
 * Messenger no trae handle: se usa el id de Flowly.
 */
export function externalUserIdFlowly(
  canal: CanalFlowly,
  conversationId: string,
  handle: string | null,
): string {
  if (canal === "whatsapp" && handle) return handle.replace(/\D/g, "") || `flowly:${conversationId}`;
  if (canal === "instagram" && handle) return `ig:${handle.replace(/^@/, "")}`;
  return `flowly:${conversationId}`;
}

/** Identidad del CRM (contact_identities) para resolveContact. */
export function identidadDeContacto(
  canal: CanalFlowly,
  conversationId: string,
  handle: string | null,
): { kind: "whatsapp" | "instagram" | "messenger"; value: string } {
  if (canal === "whatsapp")
    return { kind: "whatsapp", value: handle ? handle.replace(/\D/g, "") : `flowly:${conversationId}` };
  if (canal === "instagram")
    return { kind: "instagram", value: handle ? handle.replace(/^@/, "") : `flowly:${conversationId}` };
  return { kind: "messenger", value: `flowly:${conversationId}` };
}

/** ¿El estado nuevo es al menos tan reciente como el ya aplicado? */
export function esEstadoVigente(aplicadoIso: string | null | undefined, nuevoIso: string | null): boolean {
  if (!aplicadoIso || !nuevoIso) return true;
  return new Date(nuevoIso).getTime() >= new Date(aplicadoIso).getTime();
}

/**
 * Cómo se refleja el interruptor de Flowly en el hilo local.
 *
 * Por FLANCOS, comparando con lo último que se reflejó (`tomadoPorAntes`):
 * - `human_takeover` (nuestro interruptor por hilo) se ENCIENDE cuando Flowly
 *   reporta una toma NUEVA (alguien desde el teléfono, la consola o nuestro
 *   equipo).
 * - Se APAGA solo cuando Flowly tenía una toma y ya no la tiene (alguien la
 *   devolvió al agente). Si Flowly nunca supo de nuestra toma —p. ej. porque el
 *   PATCH falló—, un evento cualquiera (nombre, leído) NO deshace la toma local.
 * - El apagado general de la cuenta o del cliente NO es una toma humana: queda
 *   solo en flowly_agent_enabled, y la IA igual no responde porque Flowly lo
 *   consulta en cada turno.
 */
export function reflejoDeConversacion(
  c: ConversacionFlowly,
  tomadoPorAntes?: string | null,
): {
  flowly_agent_enabled: boolean;
  flowly_agent_override: boolean | null;
  flowly_taken_over_by: string | null;
  human_takeover?: boolean;
} {
  const base = {
    flowly_agent_enabled: c.agent_enabled,
    flowly_agent_override: c.agent_enabled_override,
    flowly_taken_over_by: c.taken_over_by,
  };
  const tomadaAhora = Boolean(c.taken_over_by) && c.agent_enabled_override === false;
  if (tomadaAhora && c.taken_over_by !== (tomadoPorAntes ?? null))
    return { ...base, human_takeover: true };
  if (!c.taken_over_by && tomadoPorAntes && c.agent_enabled_override !== false)
    return { ...base, human_takeover: false };
  return base;
}

/** Estado de una plantilla de Meta → el de la tabla whatsapp_templates. */
export function estadoPlantilla(status: string): "aprobada" | "pendiente" | "rechazada" | "pausada" {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return "aprobada";
    case "REJECTED":
      return "rechazada";
    case "PAUSED":
    case "DISABLED":
      return "pausada";
    default:
      return "pendiente";
  }
}

export function categoriaPlantilla(cat: string): "utility" | "marketing" | "authentication" {
  const c = cat.toLowerCase();
  return c === "marketing" || c === "authentication" ? c : "utility";
}

// ------------------------------------------------------------ entregas -----

/** Entrega recibida y no terminada en este tiempo = se puede reprocesar. */
export const REPROCESAR_TRAS_MS = 2 * 60_000;
/** Después de tantos intentos se deja de reprocesar (queda para revisión). */
export const MAX_INTENTOS = 6;

/**
 * Llegó otra vez una entrega con un id que ya teníamos (Flowly reintenta, y
 * dos copias pueden llegar casi juntas). ¿Se ignora o se reprocesa?
 * - procesada: se ignora (dedupe; nunca dos veces el LLM);
 * - en curso hace menos de 2 min: se ignora (la otra copia la está atendiendo);
 * - a medias desde hace más: se reprocesa, hasta MAX_INTENTOS.
 */
export function decisionEntregaRepetida(
  previa: { processed_at: string | null; received_at: string; attempts: number | null } | null,
  ahoraMs = Date.now(),
): "duplicado" | "reprocesar" {
  if (!previa || previa.processed_at) return "duplicado";
  if ((previa.attempts ?? 0) >= MAX_INTENTOS) return "duplicado";
  return ahoraMs - new Date(previa.received_at).getTime() > REPROCESAR_TRAS_MS
    ? "reprocesar"
    : "duplicado";
}
