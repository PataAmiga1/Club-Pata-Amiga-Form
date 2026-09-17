import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { beneficiosDe } from "@/lib/plans/resolve";
import { sumarDias } from "@/lib/plans/montos";
import { ESTADOS_VIVOS } from "@/lib/plans/suscripciones";
import { diaEnMexico, hoyEnMexico } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * GARANTÍA DE SATISFACCIÓN Y MES GRATIS — membresía $599, sección 6
 * (17-sep-2026). Especificación: juntas/64 §4d.
 */

export type EstadoGarantia = {
  subscriptionId: string;
  petId: string | null;
  petName: string;
  /** La membresía entra en la garantía (del $599, viva, con días configurados). */
  aplica: boolean;
  /** Hoy todavía se puede pedir. */
  dentroDelPlazo: boolean;
  /** Último día para pedirla. */
  venceEl: string | null;
  pagadoCents: number;
  reintegradoCents: number;
  reembolsoCents: number;
  solicitud: { id: string; status: string; refundCents: number } | null;
};

/**
 * Lo que la persona recibiría si pide la garantía HOY: todo lo cobrado por esa
 * membresía (libro de cobros) menos lo que ya se le reintegró de ese peludo
 * (aprobado, parcial o pagado). Nunca negativo.
 *
 * El plazo cuenta desde el día en que entró (su primer cobro): «en los primeros
 * tres meses» = los primeros `garantia_dias` días, incluido el de entrada.
 */
export async function estadoDeGarantia(
  admin: Admin,
  subscriptionRowId: string,
  hoy: string = hoyEnMexico(),
): Promise<EstadoGarantia | null> {
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, pet_id, status, stripe_subscription_id, benefits_snapshot, created_at, pets(name)")
    .eq("id", subscriptionRowId)
    .maybeSingle();
  if (!sub) return null;
  const pet = (Array.isArray(sub.pets) ? sub.pets[0] : sub.pets) as { name?: string } | null;
  const dias = Number(
    beneficiosDe(sub.benefits_snapshot as Record<string, unknown> | null).garantia_dias,
  );

  const [{ data: cobros }, { data: reintegros }, { data: solicitudes }] = await Promise.all([
    sub.stripe_subscription_id
      ? admin
          .from("subscription_payments")
          .select("amount_paid_cents, period_start")
          .eq("stripe_subscription_id", sub.stripe_subscription_id)
          .order("period_start", { ascending: true })
      : Promise.resolve({ data: [] as { amount_paid_cents: number; period_start: string | null }[] }),
    sub.pet_id
      ? admin
          .from("reimbursements")
          .select("amount_approved, status")
          .eq("pet_id", sub.pet_id)
          .in("status", ["approved", "partial", "paid"])
      : Promise.resolve({ data: [] as { amount_approved: number | null; status: string }[] }),
    admin
      .from("guarantee_requests")
      .select("id, status, refund_cents, requested_at")
      .eq("subscription_id", sub.id)
      .order("requested_at", { ascending: false })
      .limit(1),
  ]);

  const primer = (cobros ?? []).find((c) => c.period_start)?.period_start;
  const ingreso = diaEnMexico(new Date(primer ?? sub.created_at));
  const venceEl = dias > 0 ? sumarDias(ingreso, dias - 1) : null;
  const pagadoCents = (cobros ?? []).reduce((s, c) => s + (c.amount_paid_cents ?? 0), 0);
  const reintegradoCents = (reintegros ?? []).reduce(
    (s, r) => s + Math.round(Number(r.amount_approved ?? 0) * 100),
    0,
  );
  const ultima = solicitudes?.[0] ?? null;

  return {
    subscriptionId: sub.id,
    petId: sub.pet_id,
    petName: pet?.name ?? "tu peludo",
    aplica: dias > 0 && !!sub.pet_id && ESTADOS_VIVOS.includes(sub.status ?? ""),
    dentroDelPlazo: !!venceEl && hoy <= venceEl,
    venceEl,
    pagadoCents,
    reintegradoCents,
    reembolsoCents: Math.max(0, pagadoCents - reintegradoCents),
    solicitud: ultima
      ? { id: ultima.id, status: ultima.status, refundCents: ultima.refund_cents }
      : null,
  };
}

/**
 * Reembolsa en Stripe hasta `centavos`, empezando por el cobro más reciente de
 * la suscripción. Devuelve los ids de los reembolsos. Lanza si Stripe falla.
 */
export async function reembolsarEnStripe(
  stripeSubscriptionId: string,
  centavos: number,
): Promise<string[]> {
  if (centavos <= 0) return [];
  const stripe = getStripe();
  const facturas = await stripe.invoices.list({
    subscription: stripeSubscriptionId,
    status: "paid",
    limit: 100,
  });
  const ids: string[] = [];
  let falta = centavos;
  for (const factura of facturas.data) {
    if (falta <= 0 || !factura.id) break;
    const pagos = await stripe.invoicePayments.list({ invoice: factura.id, limit: 10 });
    for (const pago of pagos.data) {
      if (falta <= 0) break;
      const pi =
        pago.payment?.type === "payment_intent"
          ? typeof pago.payment.payment_intent === "string"
            ? pago.payment.payment_intent
            : pago.payment.payment_intent?.id
          : null;
      const monto = Math.min(falta, pago.amount_paid ?? 0);
      if (!pi || monto <= 0) continue;
      const reembolso = await stripe.refunds.create(
        { payment_intent: pi, amount: monto, metadata: { motivo: "garantia_90_dias" } },
        { idempotencyKey: `garantia-${factura.id}-${pi}-${monto}` },
      );
      ids.push(reembolso.id);
      falta -= monto;
    }
  }
  if (falta > 0)
    throw new Error(`Faltaron ${(falta / 100).toFixed(2)} MXN por reembolsar: no hay cobros suficientes en Stripe.`);
  return ids;
}

/**
 * El valor de «un mes» de una membresía: su precio mensual, o la doceava parte
 * del anual. Es lo que vale el mes gratis.
 */
export function valorDeUnMesCentavos(plan: string | null, montoPesos: number): number {
  const centavos = Math.round(Number(montoPesos) * 100);
  return plan === "annual" ? Math.round(centavos / 12) : centavos;
}
