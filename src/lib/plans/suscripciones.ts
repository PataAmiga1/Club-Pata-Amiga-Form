import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * SUSCRIPCIONES POR PELUDO — membresía $599, sección 2 (17-sep-2026).
 *
 * En el $159 una persona tiene UNA suscripción que cubre hasta 3 peludos. En
 * el $599 tiene una por peludo. Todo lo que antes daba por hecho «una
 * suscripción = un miembro» pasa por aquí.
 */

export type NivelDePrecio = "principal" | "adicional";

/** Estados de Stripe en los que la suscripción todavía existe y puede cobrar. */
export const ESTADOS_VIVOS = [
  "active",
  "past_due",
  "unpaid",
  "trialing",
  "incomplete",
  "paused",
];

/**
 * El estado de la MEMBRESÍA de una persona, a partir de TODAS sus
 * suscripciones. Antes cada evento de Stripe escribía su estado directo en el
 * perfil; con una suscripción por peludo, dar de baja a un peludo marcaba como
 * cancelado a un miembro que seguía pagando por los demás.
 *
 *   alguna activa (o en prueba)  → active
 *   si no, alguna en mora        → past_due
 *   si no                        → canceled
 *
 * Para quien tiene una sola suscripción (todo el $159) da exactamente lo mismo
 * que antes. Devuelve el estado escrito, o null si la persona no tiene filas.
 */
export async function recalcularEstadoDelMiembro(
  admin: Admin,
  userId: string,
): Promise<"active" | "past_due" | "canceled" | null> {
  const { data: subs } = await admin
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return null;

  const estados = subs.map((s) => s.status);
  const estado = estados.some((e) => e === "active" || e === "trialing")
    ? "active"
    : estados.some((e) => e === "past_due" || e === "unpaid")
      ? "past_due"
      : "canceled";

  await admin
    .from("profiles")
    .update({ membership_status: estado })
    .eq("id", userId);
  return estado;
}

/**
 * De qué plan, intervalo y nivel es un precio de Stripe. Busca primero en las
 * versiones publicadas (principal y adicional); si no está ahí, cae a las
 * variables de entorno, que son los precios del $159.
 *
 * Antes solo se comparaba contra las variables de entorno, así que un precio
 * publicado desde el panel dejaba `plan` en null.
 */
export async function queEsEstePrecio(
  admin: Admin,
  priceId: string | null | undefined,
): Promise<{
  plan: "monthly" | "annual";
  nivel: NivelDePrecio | null;
  planVersionId: string | null;
  planSlug: string | null;
} | null> {
  if (!priceId) return null;

  const { data } = await admin
    .from("plan_versions")
    .select(
      "id, interval, stripe_price_id, stripe_additional_price_id, membership_plans!inner(slug)",
    )
    .or(`stripe_price_id.eq.${priceId},stripe_additional_price_id.eq.${priceId}`)
    .limit(1)
    .maybeSingle();

  if (data) {
    const plan = Array.isArray(data.membership_plans)
      ? data.membership_plans[0]
      : data.membership_plans;
    const tieneAdicional = data.stripe_additional_price_id != null;
    return {
      plan: data.interval === "year" ? "annual" : "monthly",
      nivel:
        data.stripe_additional_price_id === priceId
          ? "adicional"
          : tieneAdicional
            ? "principal"
            : null,
      planVersionId: data.id,
      planSlug: (plan as { slug?: string } | undefined)?.slug ?? null,
    };
  }

  if (priceId === process.env.STRIPE_PRICE_ANNUAL)
    return { plan: "annual", nivel: null, planVersionId: null, planSlug: null };
  if (priceId === process.env.STRIPE_PRICE_MONTHLY)
    return { plan: "monthly", nivel: null, planVersionId: null, planSlug: null };
  return null;
}

/** Nombre visible del intervalo, como lo guarda `subscriptions.plan_name`. */
export function nombreDelIntervalo(plan: "monthly" | "annual" | null | undefined) {
  return plan === "annual" ? "Anual" : "Mensual";
}
