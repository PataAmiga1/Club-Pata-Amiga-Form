import { reportError } from "@/lib/alerts";
import {
  URL_EVENTOS_TIKTOK,
  cuerpoEventosTikTok,
  respuestaTikTokAceptada,
  type EventoTikTok,
} from "./tiktok";

/**
 * API de Eventos de TikTok: el ENVÍO. Gemelo de `capi-servidor.ts` (Meta).
 *
 * Tres candados, en este orden — si falta cualquiera, no se manda nada y no
 * se avisa a nadie (es el estado normal mientras no se configure):
 *   1. `TIKTOK_EVENTS_API_TOKEN` (se genera en el Administrador de eventos de
 *      TikTok → el píxel → Configuración → Generar token de acceso) y
 *      `NEXT_PUBLIC_TIKTOK_PIXEL_ID`.
 *   2. Consentimiento: lo revisa quien llama (`conversiones-servidor.ts`), con
 *      la misma cookie espejo `pa_medicion` o la metadata `medicion=1` de
 *      Stripe que usa Meta.
 *   3. Nunca rompe el flujo: errores al log y aviso al equipo UNA vez por
 *      instancia (un token vencido no puede llenar el correo de alertas).
 *
 * Opcional: `TIKTOK_TEST_EVENT_CODE` manda los eventos a la pestaña «Probar
 * eventos» del Administrador de eventos en vez de contarlos como reales.
 */

let avisado = false;

export function tiktokConfigurado(): boolean {
  return Boolean(process.env.TIKTOK_EVENTS_API_TOKEN && process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID);
}

export async function enviarEventoTikTok(evento: EventoTikTok): Promise<void> {
  const token = process.env.TIKTOK_EVENTS_API_TOKEN;
  const pixel = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  if (!token || !pixel) return;
  try {
    const res = await fetch(URL_EVENTOS_TIKTOK, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": token },
      body: JSON.stringify(
        cuerpoEventosTikTok(evento, pixel, process.env.TIKTOK_TEST_EVENT_CODE || null),
      ),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    const texto = await res.text().catch(() => "");
    let json: unknown = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* respuesta que no es JSON: cuenta como error abajo */
    }
    if (!res.ok || !respuestaTikTokAceptada(json))
      throw new Error(`TikTok respondió ${res.status}: ${texto.slice(0, 400)}`);
  } catch (e) {
    console.error(`[tiktok] ${evento.nombre} ${evento.eventoId} no se envió`, e);
    if (!avisado) {
      avisado = true;
      await reportError("tiktok-events-api", e, {
        evento: evento.nombre,
        eventoId: evento.eventoId,
      }).catch(() => {});
    }
  }
}
