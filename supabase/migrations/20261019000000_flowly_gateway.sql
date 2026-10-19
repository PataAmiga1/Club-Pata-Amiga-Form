-- ============================================================================
-- Flowly como puerta de los canales de Meta (WhatsApp con coexistencia,
-- Messenger e Instagram).
--
-- Hasta hoy el portal de ventas hablaba DIRECTO con Meta. Con Flowly, Meta le
-- entrega todo a Flowly y Flowly nos avisa por webhook firmado; los envíos van
-- por su API (/api/v1). Contrato: docs/PLATFORM-INTEGRATION.md del repo de
-- Flowly.
--
-- Nada de esto borra el camino directo: cada conversación dice por dónde llegó
-- (`provider`) y se le responde por el mismo lado. Las conversaciones viejas
-- siguen en 'direct_meta'.
--
-- Nuestras tablas son CACHÉ de Flowly (la verdad vive allá): la bandeja, el CRM
-- y el agente las leen rápido, y se pueden reconstruir desde su API.
-- ============================================================================

-- ------------------------------------------------------ conversaciones -----

alter table channel_conversations
  add column provider text not null default 'direct_meta'
    check (provider in ('direct_meta', 'flowly')),
  -- Ids de Flowly (no son de Meta): la conversación y la cuenta conectada.
  add column flowly_conversation_id text,
  add column flowly_connection_id   text,
  -- Espejo del interruptor del agente en Flowly. Flowly es quien lo decide
  -- (ve a todos los que escriben: nuestro equipo, su consola y el teléfono);
  -- aquí solo se refleja para pintar la bandeja.
  add column flowly_agent_enabled   boolean,
  add column flowly_agent_override  boolean,
  add column flowly_taken_over_by   text,
  -- Fecha del último estado de Flowly aplicado: sus webhooks pueden llegar
  -- desordenados y uno viejo no debe pisar a uno nuevo.
  add column flowly_state_at        timestamptz,
  -- Atribución (contrato §4.5): el anuncio, publicación o enlace m.me/ig.me
  -- que trajo a la persona. first = primer toque, NUNCA se reemplaza;
  -- last = el más reciente por received_at. Mismo objeto que manda Flowly.
  add column first_referral         jsonb,
  add column last_referral          jsonb;

create unique index idx_channel_conversations_flowly
  on channel_conversations(flowly_conversation_id)
  where flowly_conversation_id is not null;

create index idx_channel_conversations_flowly_conexion
  on channel_conversations(flowly_connection_id)
  where flowly_connection_id is not null;

comment on column channel_conversations.provider is
  'Por dónde llegó y por dónde se le responde: direct_meta (webhook propio de Meta, camino viejo) o flowly.';
comment on column channel_conversations.first_referral is
  'Primer anuncio/publicación/enlace que trajo a la persona (referral de Flowly §4.5: channel, received_at, message_id, source_type, meta_source, source_id, ad_id, source_url, headline, body, media_type, image_url, video_url, thumbnail_url, ctwa_clid, welcome_message, ref, referral_type, post_id, product_id). Nunca se reemplaza. Las URL de medios son del CDN de Meta y caducan.';
comment on column channel_conversations.last_referral is
  'El referral más reciente (por received_at). Igual al primero hasta que la persona llega por otro anuncio.';

-- ----------------------------------------------------------- mensajes ------

alter table channel_messages
  -- Id del mensaje en Flowly: dedupe de entrantes y amarre de estados.
  add column flowly_message_id text,
  -- Idempotency-Key con que se mandó (o se va a mandar) a Flowly. La respuesta
  -- de la IA se guarda ANTES de enviarse con su llave "agent:<id entrante>":
  -- si algo falla a medias, se reenvía EXACTAMENTE ese texto con esa llave y
  -- Flowly nunca lo manda dos veces (contrato §8.2).
  add column idempotency_key   text,
  -- queued → sent → delivered → read, o failed. Solo salientes.
  add column delivery_status   text
    check (delivery_status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  -- Quién lo mandó cuando NO fue la plataforma: 'native_app' (alguien contestó
  -- desde la app de WhatsApp Business / Business Suite / Instagram),
  -- 'operator' (consola de Flowly) o 'flowly' (mensaje automático de Flowly).
  add column external_actor    text;

create unique index idx_channel_messages_flowly
  on channel_messages(flowly_message_id)
  where flowly_message_id is not null;

create unique index idx_channel_messages_idempotency
  on channel_messages(idempotency_key)
  where idempotency_key is not null;

-- ------------------------------------------------- entregas del webhook -----

-- Cada entrega de Flowly, por su id (Flowly-Delivery). Sirve para tres cosas:
-- no procesar dos veces la misma (Flowly reintenta), poder reprocesar las que
-- quedaron a medias (se guarda el cuerpo) y auditar qué llegó.
create table flowly_webhook_events (
  id               text primary key,
  event            text not null,
  payload          jsonb not null,
  event_created_at timestamptz,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  attempts         int not null default 0,
  last_error       text
);

create index idx_flowly_webhook_events_pendientes
  on flowly_webhook_events(received_at)
  where processed_at is null;

comment on table flowly_webhook_events is
  'Entregas del webhook de Flowly. Solo las toca el servidor (service role); sin políticas a propósito.';

alter table flowly_webhook_events enable row level security;

-- -------------------------------------------------- plantillas de WhatsApp --

alter table whatsapp_templates
  add column provider             text not null default 'direct_meta'
    check (provider in ('direct_meta', 'flowly')),
  add column flowly_template_id   text,
  add column flowly_connection_id text,
  -- false = la plantilla necesita algo que la API de Flowly no manda (variable
  -- en encabezado o botón, encabezado con imagen…). Se ve pero no se ofrece.
  add column supported            boolean not null default true;
