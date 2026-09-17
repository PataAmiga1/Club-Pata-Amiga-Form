import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { esVinculante, type Beneficios } from "@/lib/plans/benefits";
import { beneficiosDe } from "@/lib/plans/resolve";

type Admin = ReturnType<typeof createAdminClient>;

export type VersionVigente = {
  id: string;
  version: number;
  interval: "month" | "year";
  price_cents: number;
  stripe_price_id: string | null;
  benefits: Record<string, unknown>;
};

/**
 * La versión publicada más reciente de un intervalo DENTRO DE UN PLAN.
 *
 * El plan es obligatorio (sección 0 del $599, 16-sep-2026). Antes la consulta
 * traía «la última versión publicada» de CUALQUIER plan: en cuanto existiera
 * el $599, un miembro de $159 que cambiara de mensual a anual habría quedado
 * cobrado a $599 con las reglas nuevas, y el checkout habría vendido el plan
 * equivocado según cuál se publicó al último.
 *
 * Nunca lanza: si algo falla devuelve null y quien llama decide el respaldo
 * (las variables de entorno, que son SOLO del plan de $159).
 */
export async function versionVigente(
  admin: Admin,
  interval: "month" | "year",
  planSlug: string,
): Promise<VersionVigente | null> {
  try {
    const { data } = await admin
      .from("plan_versions")
      .select(
        "id, version, interval, price_cents, stripe_price_id, benefits, membership_plans!inner(slug, is_public, archived_at)",
      )
      .eq("membership_plans.slug", planSlug)
      .is("membership_plans.archived_at", null)
      .eq("interval", interval)
      .eq("status", "publicada")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      version: data.version,
      interval: data.interval as "month" | "year",
      price_cents: data.price_cents,
      stripe_price_id: data.stripe_price_id,
      benefits: (data.benefits as Record<string, unknown>) ?? {},
    };
  } catch (err) {
    console.error("[planes] no se pudo leer la versión vigente", err);
    return null;
  }
}

/** Beneficios efectivos de una versión (catálogo + sus diferencias). */
export function beneficiosDeLaVersion(v: {
  benefits: Record<string, unknown>;
}): Beneficios {
  return beneficiosDe(v.benefits);
}

export type ResultadoPublicacion =
  | { ok: true; stripePriceId: string; creadoEnStripe: boolean }
  | { ok: false; error: string };

/**
 * Publica una versión: crea su producto y su precio en Stripe y la marca como
 * publicada.
 *
 * Los precios de Stripe son INMUTABLES: no se editan, se crean nuevos. Por eso
 * cada versión tiene el suyo y las suscripciones existentes siguen apuntando al
 * precio viejo — la base y Stripe cuentan la misma historia sin sincronizar nada.
 *
 * Si Stripe falla, la versión se queda en borrador con el error a la vista. No
 * hay estados a medias publicados.
 */
export async function publicarVersion(
  admin: Admin,
  input: { versionId: string; publishedBy: string },
): Promise<ResultadoPublicacion> {
  const { data: version } = await admin
    .from("plan_versions")
    .select(
      "id, version, interval, price_cents, additional_price_cents, currency, benefits, status, stripe_product_id, stripe_price_id, legal_confirmed_at, membership_plans(id, name, slug)",
    )
    .eq("id", input.versionId)
    .maybeSingle();
  if (!version) return { ok: false, error: "La versión no existe" };
  if (version.status === "publicada")
    return { ok: false, error: "Esa versión ya está publicada" };

  const plan = Array.isArray(version.membership_plans)
    ? version.membership_plans[0]
    : version.membership_plans;
  if (!plan) return { ok: false, error: "La versión no tiene plan" };

  // Candado de la sección 1 del $599 (17-sep-2026): publicar hoy crearía en
  // Stripe solo el precio del primer peludo, sin el del adicional ($509), y la
  // versión quedaría «publicada» a medias. Se quita en la sección 2, cuando
  // publicar cree los dos precios.
  if (version.additional_price_cents != null)
    return {
      ok: false,
      error:
        "Esta versión cobra por peludo y el cobro por peludo todavía no está construido (sección 2). No se puede publicar aún.",
    };

  // --- Compuerta legal ---------------------------------------------------
  // Cambiar un beneficio VINCULANTE exige el reglamento que ya lo refleje y la
  // confirmación de un super admin. Están escritos en el documento que el
  // miembro aceptó.
  const diferencias = Object.keys(
    (version.benefits as Record<string, unknown>) ?? {},
  );
  const vinculantesTocados = diferencias.filter(esVinculante);
  if (vinculantesTocados.length > 0 && !version.legal_confirmed_at)
    return {
      ok: false,
      error: `Esta versión cambia beneficios del reglamento (${vinculantesTocados.join(", ")}). Necesita el documento legal y la confirmación de un super admin.`,
    };

  // --- Stripe -------------------------------------------------------------
  let productId = version.stripe_product_id;
  let priceId = version.stripe_price_id;
  let creadoEnStripe = false;

  try {
    const stripe = getStripe();

    if (!productId) {
      // Un producto por plan, reutilizado entre versiones.
      const { data: hermanas } = await admin
        .from("plan_versions")
        .select("stripe_product_id")
        .eq("plan_id", plan.id)
        .not("stripe_product_id", "is", null)
        .limit(1)
        .maybeSingle();
      productId = hermanas?.stripe_product_id ?? null;
    }
    if (!productId) {
      const producto = await stripe.products.create({
        name: plan.name,
        metadata: { plan_slug: plan.slug },
      });
      productId = producto.id;
      creadoEnStripe = true;
    }

    if (!priceId) {
      const precio = await stripe.prices.create({
        product: productId,
        currency: (version.currency ?? "MXN").toLowerCase(),
        unit_amount: version.price_cents,
        recurring: { interval: version.interval as "month" | "year" },
        // La metadata deja el rastro de qué versión es este precio.
        metadata: {
          plan_version_id: version.id,
          version: String(version.version),
        },
      });
      priceId = precio.id;
      creadoEnStripe = true;
    }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Stripe rechazó la publicación";
    await admin
      .from("plan_versions")
      .update({ notes: `No se pudo publicar: ${mensaje}` })
      .eq("id", version.id);
    return { ok: false, error: mensaje };
  }

  const { error } = await admin
    .from("plan_versions")
    .update({
      status: "publicada",
      stripe_product_id: productId,
      stripe_price_id: priceId,
      published_by: input.publishedBy,
      published_at: new Date().toISOString(),
    })
    .eq("id", version.id);
  if (error) return { ok: false, error: "No se pudo marcar como publicada" };

  return { ok: true, stripePriceId: priceId!, creadoEnStripe };
}
