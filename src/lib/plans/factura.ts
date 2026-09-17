import type Stripe from "stripe";

/**
 * EL RENGLÓN QUE DICE QUÉ PERÍODO SE PAGÓ (sección 9, 17-sep-2026).
 *
 * Una factura normal trae un renglón: el mes o el año cobrado. Pero la de un
 * cambio de plan trae dos o más: un CRÉDITO negativo por el tiempo no usado del
 * plan anterior (con el período viejo) y el cargo del plan nuevo. Tomar «el
 * primer renglón con período» podía quedarse con el crédito: un anual de
 * $6,612 se asentaba como un mes, los montos del peludo dejaban de crecer y la
 * comisión del año caía en un solo mes (comprobado en Stripe test: el crédito
 * viene primero).
 *
 * Regla: el renglón POSITIVO de mayor monto que tenga período. Si no hay
 * ninguno positivo, el primero con período, como antes.
 */
export function lineaDelCobro(invoice: Stripe.Invoice): Stripe.InvoiceLineItem | null {
  const conPeriodo = (invoice.lines?.data ?? []).filter((l) => l.period?.start && l.period?.end);
  const positivos = conPeriodo.filter((l) => (l.amount ?? 0) > 0);
  if (positivos.length) return [...positivos].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
  return conPeriodo[0] ?? null;
}
