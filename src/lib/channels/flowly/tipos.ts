/**
 * Formas de la API de Flowly (/api/v1) que usa la plataforma.
 *
 * Se escriben a partir del contrato documentado (PLATFORM-INTEGRATION.md del
 * repo de Flowly), NO copiando código de Flowly: son clientes distintos.
 * Solo tipos: este archivo no tiene código que corra.
 */

export type CanalFlowly = "whatsapp" | "instagram" | "facebook";

export type AdjuntoFlowly = {
  id: string;
  kind: "image" | "document" | "audio" | "video" | "sticker" | string;
  mime_type: string | null;
  filename: string | null;
  size: number | null;
  caption: string | null;
  status: "pending" | "ready" | "failed" | string;
  failure: string | null;
  /** Dura ~1 hora. NUNCA se guarda. */
  url: string | null;
  url_expires_at: string | null;
};

export type MensajeFlowly = {
  id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | null;
  created_at: string;
  error: string | null;
  sent_by: "agent" | "human" | "system" | null;
  actor: string | null;
  attachment: AdjuntoFlowly | null;
  attachments: AdjuntoFlowly[];
};

export type ConversacionFlowly = {
  id: string;
  channel: CanalFlowly;
  contact: { name: string | null; handle: string | null };
  connection_id: string;
  unread: boolean;
  last_message_at: string | null;
  last_activity_at: string;
  agent_enabled: boolean;
  agent_enabled_override: boolean | null;
  taken_over_by: string | null;
  taken_over_at: string | null;
};

export type Elegibilidad = {
  can_send: boolean;
  agent_can_send: boolean;
  reason:
    | "open"
    | "window_closed_template_required"
    | "window_closed_human_agent_unavailable"
    | "no_inbound"
    | string;
};

export type HiloFlowly = ConversacionFlowly & {
  messages: { data: MensajeFlowly[]; next_cursor: string | null };
  eligibility: Elegibilidad;
};

export type ConexionFlowly = {
  id: string;
  channel: CanalFlowly;
  handle: string | null;
  healthy: boolean;
  agent_enabled: boolean;
};

export type PlantillaFlowly = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  connection_id: string;
  variables: number;
  supported: boolean;
  preview: string;
};

/**
 * Atribución de anuncio ya normalizada (la nuestra, no la de Flowly). La forma
 * cruda de Flowly todavía es provisional: se traduce en UN solo lugar,
 * `mapearReferral` en mapeo.ts.
 */
export type AtribucionAnuncio = {
  sourceType: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  body: string | null;
  mediaType: string | null;
  ctwaClid: string | null;
  adId: string | null;
  ref: string | null;
};

/** Sobre de cada entrega del webhook. */
export type EventoFlowly = {
  id: string;
  event: string;
  created_at: string | null;
  data: Record<string, unknown>;
};

/** Payload de message.received / message.sent / message.updated. */
export type DatosMensaje = {
  channel: CanalFlowly;
  conversation_id: string;
  connection_id: string | null;
  message: MensajeFlowly;
  referral: AtribucionAnuncio | null;
};
