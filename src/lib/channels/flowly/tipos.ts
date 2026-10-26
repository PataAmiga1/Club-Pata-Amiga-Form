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
  /** Solo entrantes: el anuncio/enlace que Meta adjuntó a ESTE mensaje (§4.5). */
  referral: ReferralFlowly | null;
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
  /** El primer anuncio/enlace que trajo a la persona. Nunca se reemplaza (§4.5). */
  first_referral: ReferralFlowly | null;
  /** El más reciente (por received_at). Igual al primero hasta que llegue otro. */
  last_referral: ReferralFlowly | null;
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
 * Atribución de anuncio, publicación o enlace (contrato §4.5): el objeto
 * `referral` que Flowly normaliza para los tres canales. Todas las llaves
 * existen siempre; lo que Meta no mandó viene null. Se guarda con esta misma
 * forma (snake_case) en first_referral / last_referral y en
 * custom_fields.anuncio. Se lee en UN solo lugar: `mapearReferral`.
 *
 * Las URL de imagen/video/miniatura son del CDN de Meta, firmadas y de vida
 * corta: sirven para mostrarse un rato, nunca como enlace permanente.
 * `ctwa_clid` es para la API de Conversiones de Meta; no se le muestra al equipo.
 */
export type ReferralFlowly = {
  channel: CanalFlowly | null;
  received_at: string | null;
  message_id: string | null;
  /** ad · post · link · otra palabra de Meta en minúsculas · unknown */
  source_type: string;
  meta_source: string | null;
  source_id: string | null;
  ad_id: string | null;
  source_url: string | null;
  headline: string | null;
  body: string | null;
  media_type: string | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  ctwa_clid: string | null;
  welcome_message: string | null;
  ref: string | null;
  referral_type: string | null;
  post_id: string | null;
  product_id: string | null;
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
};
