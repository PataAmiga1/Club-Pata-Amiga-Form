import { cookies, headers } from "next/headers";
import { reportError } from "@/lib/alerts";
import { COOKIE_MEDICION } from "@/lib/consentimiento";
import {
  VERSION_GRAPH_POR_OMISION,
  cookieFbValida,
  cuerpoCapi,
  ipDelCliente,
  type ContextoDeMedicion,
  type EventoMeta,
} from "./capi";

export { metadataDeMedicion } from "./capi";

/**
 * API de Conversiones de Meta: el ENVÍO.
 *
 * Tres candados, en este orden — si falta cualquiera, no se manda nada y no
 * se avisa a nadie (es el estado normal mientras no se configure):
 *   1. `META_CAPI_ACCESS_TOKEN` (llave del servidor; se genera en el
 *      Administrador de eventos de Meta) y `NEXT_PUBLIC_META_PIXEL_ID`.
 *   2. Consentimiento: la persona aceptó cookies de medición. El servidor lo
 *      sabe por la cookie espejo `pa_medicion` (ver `src/lib/consentimiento.ts`),
 *      o, en el webhook de Stripe, por la metadata `medicion=1` que el checkout
 *      copió de esa cookie.
 *   3. Nunca rompe el flujo: el alta, el pago y el webhook siguen igual aunque
 *      Meta no conteste. Los errores se registran y se avisa al equipo UNA vez
 *      por instancia (un token vencido no puede llenar el correo de alertas).
 *
 * Opcional: `META_CAPI_TEST_EVENT_CODE` manda los eventos a la pestaña «Probar
 * eventos» del Administrador de eventos en vez de contarlos como reales.
 */

let avisado = false;

export function capiConfigurada(): boolean {
  return Boolean(process.env.META_CAPI_ACCESS_TOKEN && process.env.NEXT_PUBLIC_META_PIXEL_ID);
}

export async function enviarEventoMeta(evento: EventoMeta): Promise<void> {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!token || !pixel) return;
  const version = process.env.META_CAPI_API_VERSION || VERSION_GRAPH_POR_OMISION;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpoCapi(evento, process.env.META_CAPI_TEST_EVENT_CODE || null)),
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const detalle = (await res.text().catch(() => "")).slice(0, 400);
      throw new Error(`Meta respondió ${res.status}: ${detalle}`);
    }
  } catch (e) {
    console.error(`[capi] ${evento.nombre} ${evento.eventoId} no se envió`, e);
    if (!avisado) {
      avisado = true;
      await reportError("meta-capi", e, { evento: evento.nombre, eventoId: evento.eventoId }).catch(
        () => {},
      );
    }
  }
}

/**
 * Lee consentimiento, `_fbp`/`_fbc`, IP y navegador de la petición en curso
 * (Server Action o Route Handler). Nunca lanza.
 */
export async function contextoDeMedicion(): Promise<ContextoDeMedicion> {
  try {
    const [galletas, cabeceras] = await Promise.all([cookies(), headers()]);
    return {
      consentido: galletas.get(COOKIE_MEDICION)?.value === "1",
      fbp: cookieFbValida(galletas.get("_fbp")?.value),
      fbc: cookieFbValida(galletas.get("_fbc")?.value),
      ip: ipDelCliente(cabeceras.get("x-forwarded-for"), cabeceras.get("x-real-ip")),
      agente: cabeceras.get("user-agent")?.slice(0, 400) ?? null,
    };
  } catch {
    return { consentido: false, fbp: null, fbc: null, ip: null, agente: null };
  }
}

/** URL pública del sitio, para `event_source_url`. */
export function urlDelSitio(ruta: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pataamiga.mx";
  return `${base.replace(/\/$/, "")}${ruta}`;
}
