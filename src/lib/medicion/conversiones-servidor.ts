import { capiConfigurada, enviarEventoMeta } from "./capi-servidor";
import { enviarEventoTikTok, tiktokConfigurado } from "./tiktok-servidor";
import { aEventoTikTok } from "./tiktok";
import type { EventoMeta } from "./capi";

/**
 * Conversiones del servidor: UN evento, a cada plataforma configurada.
 *
 * Los puntos que miden desde el servidor (registro del peludo, webhook de
 * Stripe, activación con tarjeta guardada) llaman aquí en vez de a Meta o a
 * TikTok por separado, para que agregar o quitar una plataforma no obligue a
 * tocar cada flujo.
 *
 * El CONSENTIMIENTO lo revisa quien llama (cookie `pa_medicion` o metadata
 * `medicion=1` de Stripe), igual para las dos. Cada envío se cuida solo:
 * sin su llave no hace nada, y si falla no rompe al otro ni al flujo.
 */

/** ¿Hay al menos una plataforma a la que mandar? */
export function medicionServidorConfigurada(): boolean {
  return capiConfigurada() || tiktokConfigurado();
}

export async function enviarConversion(evento: EventoMeta): Promise<void> {
  await Promise.all([
    capiConfigurada() ? enviarEventoMeta(evento) : Promise.resolve(),
    tiktokConfigurado() ? enviarEventoTikTok(aEventoTikTok(evento)) : Promise.resolve(),
  ]);
}
