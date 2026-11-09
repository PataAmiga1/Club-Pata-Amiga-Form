/**
 * ¿Esta suscripción de Stripe todavía se puede mover? (4-nov-2026)
 *
 * Una suscripción cancelada (o incompleta que venció) ya no admite cambios:
 * Stripe solo deja tocar su `metadata` y `cancellation_details`, y cualquier
 * otro `subscriptions.update` revienta con `invalid_canceled_subscription_fields`.
 * Pasó en producción el 4-nov desde /app/cuenta: la fila local seguía diciendo
 * que estaba viva (se perdió el webhook de la baja) y el botón de cancelar
 * mandó el cambio a una suscripción que Stripe ya había terminado.
 *
 * Sin dependencias a propósito: se prueba suelto con `node --test`.
 */

/** Estados de Stripe en los que la suscripción ya terminó para siempre. */
export const ESTADOS_TERMINADOS: readonly string[] = ["canceled", "incomplete_expired"];

/** true si Stripe ya no deja mover esta suscripción. */
export function suscripcionTerminada(status: string | null | undefined): boolean {
  return !!status && ESTADOS_TERMINADOS.includes(status);
}

/**
 * true si el error que devolvió Stripe es el de «esa suscripción ya está
 * cancelada». Respaldo para la carrera entre leerla y cambiarla.
 */
export function esErrorDeSuscripcionTerminada(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown; raw?: { code?: unknown } };
  const code = typeof e.code === "string" ? e.code : typeof e.raw?.code === "string" ? e.raw.code : "";
  if (code === "invalid_canceled_subscription_fields") return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /canceled subscription can only update/i.test(message);
}
