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

/** Mensaje entrante ya normalizado, venga del canal que venga. */
export type IncomingMessage = {
  channel: Channel;
  externalUserId: string;
  externalMessageId: string | null;
  displayName: string | null;
  text: string;
};

/**
 * Normaliza el payload del webhook de Meta a una lista de mensajes de texto.
 * Cubre los tres formatos: Messenger / Instagram (entry[].messaging[]) y
 * WhatsApp (entry[].changes[].value.messages[]). Ignora eventos sin texto
 * (reacciones, confirmaciones de lectura, adjuntos por ahora).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload externo de Meta
export function parseMetaWebhook(body: any): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  const isInstagram = body?.object === "instagram";

  for (const entry of body?.entry ?? []) {
    // Messenger / Instagram DM
    for (const event of entry.messaging ?? []) {
      const text = event.message?.text;
      if (!text || event.message?.is_echo) continue; // is_echo = lo que envía la página
      messages.push({
        channel: isInstagram ? "instagram" : "facebook",
        externalUserId: String(event.sender?.id ?? ""),
        externalMessageId: event.message?.mid ?? null,
        displayName: null, // Messenger no manda nombre en el webhook
        text,
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
        if (msg.type !== "text" || !msg.text?.body) continue;
        messages.push({
          channel: "whatsapp",
          externalUserId: String(msg.from),
          externalMessageId: msg.id ?? null,
          displayName: nameByWaId[msg.from] ?? null,
          text: msg.text.body,
        });
      }
    }
  }

  return messages.filter((m) => m.externalUserId);
}
