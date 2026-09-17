import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { tomarSnapshot } from "@/lib/plans/resolve";
import {
  ESTADOS_VIVOS,
  nombreDelIntervalo,
  recalcularEstadoDelMiembro,
  type NivelDePrecio,
} from "@/lib/plans/suscripciones";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * PELUDOS DE LA MEMBRESÍA $599 — sección 4 (17-sep-2026).
 *
 * Cada peludo tiene su suscripción. Aquí vive lo que la mueve fuera del
 * checkout: activar un peludo con la tarjeta guardada, cancelar la de uno,
 * y la regla de precio «siempre paga $599 el más antiguo que siga activo; si
 * se da de baja, el siguiente sube a $599».
 */

/** Asienta una factura pagada en el libro de cobros. Idempotente por factura. */
export async function registrarCobro(admin: Admin, invoice: Stripe.Invoice) {
  const subId =
    typeof invoice.parent?.subscription_details?.subscription === "string"
      ? invoice.parent.subscription_details.subscription
      : null;
  if (!subId || !invoice.id || invoice.status !== "paid") return;

  const linea =
    invoice.lines?.data?.find((l) => l.period?.start && l.period?.end) ?? null;
  await admin.from("subscription_payments").upsert(
    {
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: subId,
      amount_paid_cents: invoice.amount_paid ?? 0,
      currency: (invoice.currency ?? "mxn").toUpperCase(),
      period_start: linea?.period?.start
        ? new Date(linea.period.start * 1000).toISOString()
        : null,
      period_end: linea?.period?.end
        ? new Date(linea.period.end * 1000).toISOString()
        : null,
      billing_reason: invoice.billing_reason ?? null,
      paid_at: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : new Date().toISOString(),
    },
    { onConflict: "stripe_invoice_id", ignoreDuplicates: true },
  );
}

/**
 * La fila local de la suscripción de un peludo, con su foto de beneficios.
 * La usa la activación con tarjeta guardada; el checkout la escribe el webhook.
 */
export async function registrarSuscripcionDePeludo(
  admin: Admin,
  input: {
    userId: string;
    petId: string;
    nivel: NivelDePrecio;
    plan: "monthly" | "annual";
    planVersionId: string;
    suscripcion: Stripe.Subscription;
  },
): Promise<string | null> {
  const item = input.suscripcion.items.data[0];
  const { data: fila } = await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: input.userId,
        pet_id: input.petId,
        price_tier: input.nivel,
        stripe_customer_id:
          typeof input.suscripcion.customer === "string"
            ? input.suscripcion.customer
            : input.suscripcion.customer.id,
        stripe_subscription_id: input.suscripcion.id,
        plan: input.plan,
        plan_name: nombreDelIntervalo(input.plan),
        amount:
          item?.price.unit_amount != null
            ? (item.price.unit_amount * (item.quantity ?? 1)) / 100
            : null,
        currency: "MXN",
        status: input.suscripcion.status,
        cancel_at_period_end: input.suscripcion.cancel_at_period_end,
        current_period_start: item?.current_period_start
          ? new Date(item.current_period_start * 1000).toISOString()
          : null,
        current_period_end: item?.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString()
          : null,
      },
      { onConflict: "stripe_subscription_id" },
    )
    .select("id")
    .single();
  if (!fila) return null;
  await tomarSnapshot(admin, { subscriptionId: fila.id, planVersionId: input.planVersionId });
  await recalcularEstadoDelMiembro(admin, input.userId);
  return fila.id;
}

/**
 * La tarjeta con la que ya paga esta persona: la de su suscripción viva más
 * reciente o la predeterminada de su cliente en Stripe. null si no hay.
 */
export async function metodoDePagoGuardado(
  admin: Admin,
  userId: string,
): Promise<{ customerId: string; paymentMethodId: string; etiqueta: string } | null> {
  const { data: subs } = await admin
    .from("subscriptions")
    .select("status, stripe_subscription_id, stripe_customer_id, created_at")
    .eq("user_id", userId)
    .not("pet_id", "is", null)
    .order("created_at", { ascending: false });
  const viva = (subs ?? []).find(
    (s) => ESTADOS_VIVOS.includes(s.status ?? "") && s.stripe_subscription_id,
  );
  const customerId =
    viva?.stripe_customer_id ?? (subs ?? []).find((s) => s.stripe_customer_id)?.stripe_customer_id;
  if (!customerId) return null;

  const stripe = getStripe();
  let pm: string | Stripe.PaymentMethod | null = null;
  try {
    if (viva?.stripe_subscription_id) {
      const s = await stripe.subscriptions.retrieve(viva.stripe_subscription_id, {
        expand: ["default_payment_method"],
      });
      pm = s.default_payment_method;
    }
    if (!pm) {
      const c = await stripe.customers.retrieve(customerId, {
        expand: ["invoice_settings.default_payment_method"],
      });
      if (!("deleted" in c && c.deleted))
        pm = (c as Stripe.Customer).invoice_settings?.default_payment_method ?? null;
    }
  } catch {
    return null;
  }
  if (!pm) return null;
  const metodo =
    typeof pm === "string" ? await stripe.paymentMethods.retrieve(pm) : pm;
  const tarjeta = metodo.card;
  return {
    customerId,
    paymentMethodId: metodo.id,
    etiqueta: tarjeta
      ? `${tarjeta.brand.charAt(0).toUpperCase()}${tarjeta.brand.slice(1)} ···· ${tarjeta.last4}`
      : "tu método de pago guardado",
  };
}

/**
 * «Siempre paga $599 el más antiguo que siga activo» (equipo, 17-sep).
 *
 * Si entre las suscripciones vivas de una persona ya no hay principal (porque
 * la del principal terminó), la del peludo más antiguo pasa a precio principal
 * DESDE SU PRÓXIMO COBRO: no se prorratea ni se cobra nada hoy. Una principal
 * programada para cancelarse sigue siendo principal hasta que de verdad termine.
 *
 * Devuelve el id de la fila promovida, o null si no hizo falta.
 */
export async function reacomodarPrecioPrincipal(
  admin: Admin,
  userId: string,
): Promise<string | null> {
  const { data: subs } = await admin
    .from("subscriptions")
    .select("id, status, price_tier, stripe_subscription_id, plan_version_id, pet_id, created_at, pets(name)")
    .eq("user_id", userId)
    .not("pet_id", "is", null)
    .order("created_at", { ascending: true });
  const vivas = (subs ?? []).filter((s) => ESTADOS_VIVOS.includes(s.status ?? ""));
  if (vivas.length === 0 || vivas.some((s) => s.price_tier === "principal")) return null;

  const siguiente = vivas[0];
  if (!siguiente.stripe_subscription_id || !siguiente.plan_version_id) return null;
  const { data: version } = await admin
    .from("plan_versions")
    .select("stripe_price_id, price_cents")
    .eq("id", siguiente.plan_version_id)
    .maybeSingle();
  if (!version?.stripe_price_id) return null;

  const stripe = getStripe();
  const actual = await stripe.subscriptions.retrieve(siguiente.stripe_subscription_id);
  await stripe.subscriptions.update(siguiente.stripe_subscription_id, {
    items: [{ id: actual.items.data[0].id, price: version.stripe_price_id }],
    proration_behavior: "none",
    metadata: { ...actual.metadata, price_tier: "principal" },
  });
  await admin
    .from("subscriptions")
    .update({ price_tier: "principal", amount: version.price_cents / 100 })
    .eq("id", siguiente.id);

  const pet = (Array.isArray(siguiente.pets) ? siguiente.pets[0] : siguiente.pets) as
    | { name?: string }
    | null;
  await admin.from("notifications").insert({
    user_id: userId,
    type: "plan_changed",
    title: `${pet?.name ?? "Tu peludo"} ahora paga el precio del primer peludo`,
    message: `Como terminó la membresía de tu primer peludo, desde su próximo cobro ${pet?.name ?? "tu peludo"} paga $${(version.price_cents / 100).toLocaleString("es-MX")} MXN. Hoy no se te cobra nada.`,
  });
  return siguiente.id;
}

/** Cancela al final de su período la membresía de UN peludo. */
export async function cancelarAlCorte(
  admin: Admin,
  subscriptionRowId: string,
): Promise<{ hasta: string | null } | null> {
  const { data: fila } = await admin
    .from("subscriptions")
    .select("id, stripe_subscription_id")
    .eq("id", subscriptionRowId)
    .maybeSingle();
  if (!fila?.stripe_subscription_id) return null;
  const actualizada = await getStripe().subscriptions.update(fila.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  const fin = actualizada.items.data[0]?.current_period_end;
  const hasta = fin ? new Date(fin * 1000).toISOString() : null;
  await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true, ...(hasta ? { current_period_end: hasta } : {}) })
    .eq("id", fila.id);
  return { hasta };
}
