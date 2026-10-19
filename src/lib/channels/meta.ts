import { createHmac, timingSafeEqual } from "crypto";

/**
 * Conector de canales de Meta (Messenger, Instagram DM, WhatsApp Cloud API).
 *
 * CONECTAR: todo se configura con variables de entorno de la cuenta del
 * cliente — ver docs/AGENTES-IA.md. Ninguna credencial va en el código.
 *
 *   META_VERIFY_TOKEN        — palabra secreta inventada para el alta del webhook
 *   META_APP_SECRET          — App secret (verificación de firma de webhooks)
 *   META_PAGE_ACCESS_TOKEN   — Page access token (envíos Messenger + Instagram)
 *   WHATSAPP_PHONE_NUMBER_ID — id del número en WhatsApp Cloud API
 *   WHATSAPP_ACCESS_TOKEN    — token del sistema para WhatsApp Cloud API
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type Channel = "facebook" | "instagram" | "whatsapp";

/** ¿Está configurado el conector para poder ENVIAR por este canal? */
export function channelConfigured(channel: Channel): boolean {
  if (channel === "whatsapp") {
    return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  }
  return Boolean(process.env.META_PAGE_ACCESS_TOKEN);
}

/**
 * ¿Se permite aceptar webhooks SIN firma? Solo en desarrollo local y solo si
 * se pide a propósito con META_WEBHOOK_ALLOW_UNSIGNED=1. En Vercel (producción
 * Y pruebas) NODE_ENV es "production", así que ahí nunca aplica.
 */
export function webhookSinFirmaPermitido(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.META_WEBHOOK_ALLOW_UNSIGNED === "1"
  );
}

// Para avisar una sola vez por proceso y no inundar los logs con cada POST.
let avisoSinSecretoDado = false;

/** Solo para pruebas: reinicia el aviso de "una sola vez". */
export function _reiniciarAvisoFirma() {
  avisoSinSecretoDado = false;
}

/**
 * Verifica la firma X-Hub-Signature-256 de un webhook de Meta.
 *
 * Falla CERRADO: sin META_APP_SECRET se rechaza todo. Antes aceptaba todo, y
 * como el webhook crea contactos y oportunidades y despierta al agente de
 * ventas (gasto de Anthropic), cualquiera podía mandarle POSTs sin firmar.
 * La única excepción es el desarrollo local con opt-in explícito
 * (ver webhookSinFirmaPermitido).
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    const permitido = webhookSinFirmaPermitido();
    if (!avisoSinSecretoDado) {
      avisoSinSecretoDado = true;
      if (permitido)
        console.warn(
          "[canales] META_APP_SECRET no configurado — webhook SIN verificar porque META_WEBHOOK_ALLOW_UNSIGNED=1 (solo desarrollo local)",
        );
      else
        console.error(
          "[canales] META_APP_SECRET no configurado — se RECHAZAN todos los webhooks de Meta hasta configurarlo",
        );
    }
    return permitido;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

/**
 * Envía una plantilla APROBADA de WhatsApp.
 *
 * Es la única forma de escribirle a alguien fuera de la ventana de 24 h. Sin
 * esto, una conversación de WhatsApp que se enfría queda en un callejón sin
 * salida — que es exactamente lo que pasa hoy en LynSales.
 *
 * CONECTAR: `meta_name` tiene que existir y estar aprobada en la cuenta de
 * WhatsApp Business del cliente (revisión de Meta, 1–3 semanas).
 */
export async function sendWhatsAppTemplate(
  recipientId: string,
  metaName: string,
  language: string,
  parametros: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!channelConfigured("whatsapp"))
    return { ok: false, error: "El conector de WhatsApp no está configurado" };

  try {
    const res = await fetch(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipientId,
          type: "template",
          template: {
            name: metaName,
            language: { code: language },
            ...(parametros.length > 0
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: parametros.map((p) => ({ type: "text", text: p })),
                    },
                  ],
                }
              : {}),
          },
        }),
      },
    );
    if (!res.ok)
      return { ok: false, error: `Meta rechazó la plantilla: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falló el envío de la plantilla",
    };
  }
}

/**
 * Envía un mensaje de texto por el canal indicado. Devuelve true si Meta lo
 * aceptó. Errores se registran pero no lanzan: el mensaje ya quedó guardado
 * en la BD y el equipo lo ve en /admin/conversaciones.
 */
export async function sendChannelMessage(
  channel: Channel,
  recipientId: string,
  text: string,
): Promise<boolean> {
  if (!channelConfigured(channel)) {
    console.warn(`[canales] Conector ${channel} sin configurar — mensaje NO enviado (solo guardado en BD)`);
    return false;
  }

  try {
    let res: Response;
    if (channel === "whatsapp") {
      // WhatsApp Cloud API — recuerda la ventana de 24 h para respuesta libre
      res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipientId,
          type: "text",
          text: { body: text },
        }),
      });
    } else {
      // Messenger e Instagram DM comparten el endpoint de la página
      res = await fetch(
        `${GRAPH}/me/messages?access_token=${process.env.META_PAGE_ACCESS_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text },
          }),
        },
      );
    }
    if (!res.ok) {
      console.error(`[canales] Envío ${channel} falló:`, res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[canales] Envío ${channel} falló:`, e);
    return false;
  }
}

/**
 * Lo que sabemos de un adjunto entrante (foto, nota de voz, documento…). Se
 * guarda en `channel_messages.attachments` (jsonb, ya existe: no hace falta
 * migración) para poder descargarlo después. Los adjuntos que SUBE el equipo
 * tienen otra forma ({ ruta, nombre }); estos se distinguen por `origen`.
 *
 * WhatsApp da un `media_id` (se descarga con el token del sistema); Messenger
 * e Instagram dan una `url` firmada que caduca.
 */
export type AdjuntoEntrante = {
  origen: "meta";
  tipo: string;
  media_id?: string;
  url?: string;
  mime_type?: string;
  filename?: string;
  latitude?: number;
  longitude?: number;
  payload?: string;
};

/** Mensaje entrante ya normalizado, venga del canal que venga. */
export type IncomingMessage = {
  channel: Channel;
  externalUserId: string;
  externalMessageId: string | null;
  displayName: string | null;
  /**
   * Texto del mensaje. Cuando no es texto (foto, audio, ubicación…) lleva una
   * etiqueta legible entre corchetes —«[Imagen]», «[Nota de voz]»— más el pie
   * de foto si lo trae, para que la bandeja y el agente sepan qué llegó.
   */
  text: string;
  /** Tipo original en Meta: text, image, audio, button, postback… */
  kind: string;
  adjuntos: AdjuntoEntrante[];
};

/** Quita lo vacío y une con espacio: «[Imagen] mira esto». */
function unir(...partes: (string | null | undefined)[]): string {
  return partes
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
}

function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function numero(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function etiquetaUbicacion(nombre?: string, direccion?: string): string {
  const detalle = unir(nombre, direccion && direccion !== nombre ? direccion : undefined);
  return detalle ? `[Ubicación: ${detalle}]` : "[Ubicación]";
}

const NO_SE_PUEDE_MOSTRAR = "[Mensaje que no se puede mostrar]";

/**
 * Un mensaje de WhatsApp a texto legible + adjunto. Devuelve null para lo que
 * no es una persona escribiendo (reacciones, avisos del sistema): eso no debe
 * despertar al agente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload externo de Meta
function normalizarWhatsApp(msg: any): { text: string; adjuntos: AdjuntoEntrante[] } | null {
  const tipo = String(msg?.type ?? "");
  const media = (
    m: { id?: string; mime_type?: string; filename?: string } | undefined,
  ): AdjuntoEntrante => ({
    origen: "meta",
    tipo,
    ...(m?.id ? { media_id: String(m.id) } : {}),
    ...(m?.mime_type ? { mime_type: String(m.mime_type) } : {}),
    ...(m?.filename ? { filename: String(m.filename) } : {}),
  });

  switch (tipo) {
    case "text": {
      const body = texto(msg.text?.body);
      return body ? { text: body, adjuntos: [] } : null;
    }
    case "image":
      return { text: unir("[Imagen]", msg.image?.caption), adjuntos: [media(msg.image)] };
    case "sticker":
      return { text: "[Sticker]", adjuntos: [media(msg.sticker)] };
    case "audio":
      // `voice: true` = nota de voz grabada en el chat; `false` = archivo de audio.
      return {
        text: msg.audio?.voice === false ? "[Audio]" : "[Nota de voz]",
        adjuntos: [media(msg.audio)],
      };
    case "video":
      return { text: unir("[Video]", msg.video?.caption), adjuntos: [media(msg.video)] };
    case "document": {
      const nombre = texto(msg.document?.filename);
      return {
        text: unir(nombre ? `[Documento: ${nombre}]` : "[Documento]", msg.document?.caption),
        adjuntos: [media(msg.document)],
      };
    }
    case "location": {
      const loc = msg.location ?? {};
      const lat = numero(loc.latitude);
      const lon = numero(loc.longitude);
      return {
        text: etiquetaUbicacion(texto(loc.name), texto(loc.address)),
        adjuntos: [
          {
            origen: "meta",
            tipo,
            ...(lat !== undefined ? { latitude: lat } : {}),
            ...(lon !== undefined ? { longitude: lon } : {}),
          },
        ],
      };
    }
    case "contacts": {
      const nombres: string[] = (Array.isArray(msg.contacts) ? msg.contacts : [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload externo de Meta
        .map((c: any) => texto(c?.name?.formatted_name))
        .filter((n: string | undefined): n is string => Boolean(n));
      return {
        text: nombres.length
          ? `[Contacto compartido: ${nombres.join(", ")}]`
          : "[Contacto compartido]",
        adjuntos: [],
      };
    }
    case "button": {
      // Botón de respuesta rápida de una plantilla: vale lo que dice el botón.
      const t = texto(msg.button?.text) ?? texto(msg.button?.payload);
      return {
        text: t ?? "[Botón]",
        adjuntos: msg.button?.payload
          ? [{ origen: "meta", tipo, payload: String(msg.button.payload) }]
          : [],
      };
    }
    case "interactive": {
      const r = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      const t = texto(r?.title);
      return {
        text: t ?? "[Botón]",
        adjuntos: r?.id ? [{ origen: "meta", tipo, payload: String(r.id) }] : [],
      };
    }
    case "reaction":
    case "system":
    case "ephemeral":
      return null;
    default:
      // unsupported, order, request_welcome… Se guarda para que el equipo lo
      // vea, en lugar de perderse en silencio.
      return { text: NO_SE_PUEDE_MOSTRAR, adjuntos: [] };
  }
}

/** Etiqueta + detalle de un adjunto de Messenger / Instagram. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload externo de Meta
function normalizarAdjuntoMessenger(a: any): { etiqueta: string; adjunto: AdjuntoEntrante } {
  const tipo = String(a?.type ?? "");
  const p = a?.payload ?? {};
  const url = texto(p.url);
  const base: AdjuntoEntrante = { origen: "meta", tipo, ...(url ? { url } : {}) };

  switch (tipo) {
    case "image":
      // Messenger manda los stickers como imagen con sticker_id.
      return { etiqueta: p.sticker_id ? "[Sticker]" : "[Imagen]", adjunto: base };
    case "audio":
      return { etiqueta: "[Nota de voz]", adjunto: base };
    case "video":
      return { etiqueta: "[Video]", adjunto: base };
    case "ig_reel":
    case "reel":
      return { etiqueta: "[Reel compartido]", adjunto: base };
    case "file": {
      let nombre = "";
      try {
        nombre = url ? decodeURIComponent(url.split("?")[0].split("/").pop() ?? "") : "";
      } catch {
        nombre = "";
      }
      const valido = /\.[a-z0-9]{2,5}$/i.test(nombre);
      return {
        etiqueta: valido ? `[Documento: ${nombre}]` : "[Documento]",
        adjunto: { ...base, ...(valido ? { filename: nombre } : {}) },
      };
    }
    case "location": {
      const c = p.coordinates ?? {};
      const lat = numero(c.lat);
      const lon = numero(c.long);
      return {
        etiqueta: etiquetaUbicacion(texto(a?.title)),
        adjunto: {
          ...base,
          ...(lat !== undefined ? { latitude: lat } : {}),
          ...(lon !== undefined ? { longitude: lon } : {}),
        },
      };
    }
    case "story_mention":
      return { etiqueta: "[Te mencionó en su historia]", adjunto: base };
    case "share":
      return { etiqueta: "[Publicación compartida]", adjunto: base };
    default:
      return { etiqueta: "[Adjunto]", adjunto: base };
  }
}

/**
 * Normaliza el payload del webhook de Meta a una lista de mensajes.
 * Cubre los tres formatos: Messenger / Instagram (entry[].messaging[]) y
 * WhatsApp (entry[].changes[].value.messages[]).
 *
 * Además del texto conserva lo que manda la gente que llega por anuncios:
 * fotos, notas de voz, videos, documentos, stickers, ubicaciones y respuestas
 * de botones. Lo que no es texto llega con una etiqueta legible («[Imagen]») y
 * el detalle del adjunto aparte. Se ignoran los ecos de la página, las
 * reacciones y las confirmaciones de lectura/entrega.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload externo de Meta
export function parseMetaWebhook(body: any): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  const isInstagram = body?.object === "instagram";

  for (const entry of body?.entry ?? []) {
    // Messenger / Instagram DM
    for (const event of entry.messaging ?? []) {
      const channel: Channel = isInstagram ? "instagram" : "facebook";
      const externalUserId = String(event.sender?.id ?? "");

      // Botón de un menú o de una plantilla de Messenger (no trae `message`).
      if (event.postback) {
        const t = texto(event.postback.title) ?? texto(event.postback.payload);
        messages.push({
          channel,
          externalUserId,
          externalMessageId: event.postback.mid ?? null,
          displayName: null,
          text: t ?? "[Botón]",
          kind: "postback",
          adjuntos: event.postback.payload
            ? [{ origen: "meta", tipo: "postback", payload: String(event.postback.payload) }]
            : [],
        });
        continue;
      }

      const m = event.message;
      if (!m || m.is_echo || m.is_deleted) continue; // is_echo = lo que envía la página
      const piezas: { etiqueta: string; adjunto: AdjuntoEntrante }[] = (
        Array.isArray(m.attachments) ? m.attachments : []
      ).map(normalizarAdjuntoMessenger);
      let text = unir(...piezas.map((p) => p.etiqueta), m.text);
      if (!text && m.is_unsupported) text = NO_SE_PUEDE_MOSTRAR;
      if (!text) continue;

      const adjuntos = piezas.map((p) => p.adjunto);
      if (m.quick_reply?.payload)
        adjuntos.push({ origen: "meta", tipo: "quick_reply", payload: String(m.quick_reply.payload) });

      messages.push({
        channel,
        externalUserId,
        externalMessageId: m.mid ?? null,
        displayName: null, // Messenger no manda nombre en el webhook
        text,
        kind: piezas.length ? piezas[0].adjunto.tipo : "text",
        adjuntos,
      });
    }
    // WhatsApp Cloud API
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (change.field !== "messages" || !value?.messages) continue;
      const nameByWaId = Object.fromEntries(
        (value.contacts ?? []).map(
          (c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? null],
        ),
      );
      for (const msg of value.messages) {
        const normal = normalizarWhatsApp(msg);
        if (!normal) continue;
        messages.push({
          channel: "whatsapp",
          externalUserId: String(msg.from ?? ""),
          externalMessageId: msg.id ?? null,
          displayName: nameByWaId[msg.from] ?? null,
          text: normal.text,
          kind: String(msg.type),
          adjuntos: normal.adjuntos,
        });
      }
    }
  }

  return messages.filter((m) => m.externalUserId);
}

