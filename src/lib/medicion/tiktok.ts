/**
 * API de Eventos de TikTok (Events API 2.0): la parte PURA.
 *
 * Es el gemelo de `capi.ts` (Meta). El píxel de TikTok en el navegador pierde
 * conversiones por las mismas razones que el de Meta (bloqueadores, iOS, la
 * pestaña que se cierra), así que los mismos eventos salen también de nuestro
 * servidor con el MISMO `event_id`; TikTok deduplica por nombre + `event_id`.
 *
 * Aquí solo se valida y se arma el cuerpo. El envío —y los candados de llave
 * y consentimiento— vive en `tiktok-servidor.ts`. Este archivo no importa
 * NADA para poder probarlo con `node --test` (tests/medicion/tiktok.test.mjs).
 *
 * Forma del cuerpo, comprobada el 11-nov-2026 contra la plantilla oficial de
 * TikTok para GTM del lado del servidor (github.com/tiktok/gtm-template-eapi):
 *   POST https://business-api.tiktok.com/open_api/v1.3/event/track/
 *   cabeceras: Content-Type: application/json · Access-Token: <token>
 *   { event_source: "web", event_source_id: <píxel>, test_event_code?,
 *     data: [{ event, event_time, event_id, page: { url },
 *              user: { ttclid, ttp, ip, user_agent }, properties: {...} }] }
 * TikTok contesta HTTP 200 aunque rechace el evento: el resultado real va en
 * el JSON (`code: 0` = aceptado).
 *
 * COINCIDENCIA AVANZADA: APAGADA. A diferencia de la CAPI de Meta, aquí NO se
 * mandan correo, teléfono ni id externo (ni cifrados). El aviso de privacidad
 * (política de cookies 4.5) promete que a TikTok no le llega nada de eso.
 * Prenderla es una decisión del equipo con su texto legal ANTES del código —
 * no una variable de entorno que alguien pueda encender sin querer.
 */

export const URL_EVENTOS_TIKTOK = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

/**
 * Nombres estándar vigentes de TikTok. Desde 2025 TikTok renombró
 * `SubmitForm` → `Lead` y `CompletePayment` → `Purchase`, y pide los nombres
 * nuevos en toda instalación nueva («How to Adopt TikTok's Updated Standard
 * Events», ads.tiktok.com, mayo 2025). Coinciden uno a uno con los de Meta.
 */
export type NombreEventoTikTok =
  | "ViewContent"
  | "Lead"
  | "CompleteRegistration"
  | "InitiateCheckout"
  | "Purchase";

export type EventoTikTok = {
  nombre: NombreEventoTikTok;
  /** El mismo que mandó el navegador (ver `src/lib/medicion/eventos.ts`). */
  eventoId: string;
  /** Segundos Unix. */
  instante: number;
  url: string;
  persona: {
    ip?: string | null;
    agente?: string | null;
    /** Cookie `_ttp` del píxel (identificador del navegador). */
    ttp?: string | null;
    /** Clic en el anuncio (último toque de `pa_origen`). */
    ttclid?: string | null;
  };
  datos?: {
    valor?: number;
    moneda?: string;
    contenidoIds?: string[];
    tipoContenido?: string;
    nombreContenido?: string;
  };
};

/**
 * `_ttp` lo crea el píxel, pero cualquiera puede escribir una cookie: se
 * valida por forma antes de mandarla.
 */
export function cookieTtpValida(valor: string | null | undefined): string | null {
  if (!valor) return null;
  return /^[A-Za-z0-9_.\-]{8,200}$/.test(valor) ? valor : null;
}

/** `ttclid` llega por la URL del anuncio; mismo criterio. */
export function ttclidValido(valor: string | null | undefined): string | null {
  if (!valor) return null;
  return /^[A-Za-z0-9_.\-~]{4,200}$/.test(valor) ? valor : null;
}

/** `properties` del evento: lo mismo que el píxel manda desde el navegador. */
export function propiedadesTikTok(d: EventoTikTok["datos"] = {}): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (typeof d.valor === "number" && Number.isFinite(d.valor)) {
    p.value = Math.round(d.valor * 100) / 100;
    p.currency = (d.moneda || "MXN").toUpperCase();
  }
  if (d.tipoContenido) p.content_type = d.tipoContenido;
  if (d.contenidoIds?.length)
    p.contents = d.contenidoIds.map((id) => ({
      content_id: id,
      ...(d.tipoContenido ? { content_type: d.tipoContenido } : {}),
      quantity: 1,
    }));
  if (d.nombreContenido) p.description = d.nombreContenido;
  return p;
}

/** El cuerpo completo del POST a `/event/track/`. */
export function cuerpoEventosTikTok(
  evento: EventoTikTok,
  pixel: string,
  codigoDePrueba?: string | null,
) {
  const user: Record<string, string> = {};
  const ttclid = ttclidValido(evento.persona.ttclid);
  if (ttclid) user.ttclid = ttclid;
  const ttp = cookieTtpValida(evento.persona.ttp);
  if (ttp) user.ttp = ttp;
  if (evento.persona.ip) user.ip = evento.persona.ip;
  if (evento.persona.agente) user.user_agent = evento.persona.agente;
  const properties = propiedadesTikTok(evento.datos);
  return {
    event_source: "web",
    event_source_id: pixel,
    ...(codigoDePrueba ? { test_event_code: codigoDePrueba } : {}),
    data: [
      {
        event: evento.nombre,
        event_time: Math.floor(evento.instante),
        event_id: evento.eventoId,
        page: { url: evento.url },
        user,
        ...(Object.keys(properties).length ? { properties } : {}),
      },
    ],
  };
}

/**
 * El evento que ya se arma para Meta, convertido para TikTok: mismo nombre,
 * mismo id, mismos datos — y SIN correo, teléfono ni id externo (coincidencia
 * avanzada apagada, ver arriba). Se tipa por forma para no importar `capi.ts`.
 */
export function aEventoTikTok(e: {
  nombre: NombreEventoTikTok;
  eventoId: string;
  instante: number;
  url: string;
  persona: {
    ip?: string | null;
    agente?: string | null;
    ttp?: string | null;
    ttclid?: string | null;
  };
  datos?: EventoTikTok["datos"];
}): EventoTikTok {
  return {
    nombre: e.nombre,
    eventoId: e.eventoId,
    instante: e.instante,
    url: e.url,
    persona: {
      ip: e.persona.ip ?? null,
      agente: e.persona.agente ?? null,
      ttp: e.persona.ttp ?? null,
      ttclid: e.persona.ttclid ?? null,
    },
    ...(e.datos ? { datos: e.datos } : {}),
  };
}

/** ¿TikTok aceptó? Contesta 200 siempre; el veredicto es `code === 0`. */
export function respuestaTikTokAceptada(json: unknown): boolean {
  return Boolean(json && typeof json === "object" && (json as { code?: unknown }).code === 0);
}
