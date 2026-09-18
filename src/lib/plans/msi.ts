import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { versionVigente } from "@/lib/plans/versiones";
import { PLAN_599 } from "@/lib/plans/planes";
import type { NivelDePrecio } from "@/lib/plans/suscripciones";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * ANUAL A MESES SIN INTERESES — 17-sep-2026 (Pablo).
 *
 * Stripe solo admite meses sin intereses (MSI) en un PAGO ÚNICO, nunca dentro
 * de una suscripción. Por eso el anual con MSI funciona así:
 *
 *   1. Se cobra el año completo en una sola operación, en modo `payment`, con
 *      `installments` prendido. El banco de la persona lo parte en 3 o 6
 *      mensualidades; Pata Amiga recibe todo de una vez (menos la comisión
 *      extra de Stripe, que absorbe Pata Amiga).
 *   2. Con esa misma tarjeta se crea la suscripción anual **con el primer
 *      cobro programado a 12 meses** (`trial_end`). Así la renovación existe y
 *      nadie pierde su membresía por olvido, pero no se cobra dos veces.
 *   3. Antes del aniversario se le recuerda y puede volver a pagar a MSI: si lo
 *      hace, se recorre la fecha de cobro otros 12 meses. Si no hace nada, en
 *      el aniversario Stripe cobra el anual de corrido.
 *
 * Lo que NO se puede desde la API (comprobado el 17-sep): limitar los planes a
 * 3 y 6 meses. Stripe ofrece los que dé el banco emisor; el recorte se hace en
 * Configuración → Métodos de pago del panel de Stripe.
 */

/** Los planes que el equipo quiere ofrecer. Informativo: Stripe los ofrece según la tarjeta. */
export const MESES_MSI = [3, 6] as const;

export type PagoAnualEnUnaExhibicion = {
  /** Precio de lista del año para ese nivel, en centavos. */
  centavos: number;
  nivel: NivelDePrecio;
  productoStripe: string;
  /** El precio recurrente que usará la suscripción cuando toque renovar. */
  precioRecurrente: string;
  planVersionId: string;
};

/** Los datos del anual de un nivel (principal o con 15%), listos para cobrar de una vez. */
export async function anualParaMSI(
  admin: Admin,
  nivel: NivelDePrecio,
): Promise<PagoAnualEnUnaExhibicion | null> {
  const version = await versionVigente(admin, "year", PLAN_599);
  const precioRecurrente =
    nivel === "principal" ? version?.stripe_price_id : version?.stripe_additional_price_id;
  const centavos =
    nivel === "principal" ? version?.price_cents : (version?.additional_price_cents ?? null);
  if (!version?.stripe_product_id || !precioRecurrente || !centavos) return null;
  // Producto propio del anual a meses sin intereses (equipo, 17-sep-2026): así
  // esas ventas se ven aparte en Stripe. Sin él, se cobra sobre el producto de
  // la membresía, como antes.
  const { data: ajuste } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", "stripe_producto_msi")
    .maybeSingle();
  return {
    centavos,
    nivel,
    productoStripe: ajuste?.value?.trim() || version.stripe_product_id,
    precioRecurrente,
    planVersionId: version.id,
  };
}

/**
 * La sesión de pago del año, con meses sin intereses prendidos. Sirve para el
 * alta y para la renovación: cambia la metadata y a dónde vuelve la persona.
 */
export async function sesionDePagoAnual(input: {
  anual: PagoAnualEnUnaExhibicion;
  clienteStripe: string | null;
  correo: string | null;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  descripcion: string;
}): Promise<string | null> {
  const stripe = getStripe();
  const precio = await precioDeUnaExhibicion(input.anual);
  const sesion = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price: precio }],
    ...(input.clienteStripe
      ? { customer: input.clienteStripe }
      : { customer_email: input.correo ?? undefined, customer_creation: "always" as const }),
    // Sin esto no aparece la opción de meses: es lo único que la prende.
    payment_method_options: { card: { installments: { enabled: true } } },
    // La tarjeta se guarda para poder renovar dentro de un año.
    payment_intent_data: {
      setup_future_usage: "off_session",
      description: input.descripcion,
      metadata: input.metadata,
    },
    invoice_creation: { enabled: true },
    allow_promotion_codes: true,
    metadata: input.metadata,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  return sesion.url;
}

/**
 * El precio de una sola exhibición del año para ese nivel, sobre el producto
 * del anual a meses sin intereses. Se busca por `lookup_key` (lleva el monto,
 * así que si cambia el precio de la versión nace uno nuevo) y se crea la
 * primera vez: no hay que darlo de alta a mano en Stripe.
 */
async function precioDeUnaExhibicion(anual: PagoAnualEnUnaExhibicion): Promise<string> {
  const stripe = getStripe();
  const clave = `pa_anual_msi_${anual.nivel}_${anual.centavos}_${anual.productoStripe}`;
  const { data } = await stripe.prices.list({ lookup_keys: [clave], active: true, limit: 1 });
  if (data[0]) return data[0].id;
  const nuevo = await stripe.prices.create({
    product: anual.productoStripe,
    currency: "mxn",
    unit_amount: anual.centavos,
    lookup_key: clave,
    nickname:
      anual.nivel === "principal"
        ? "Anual en una exhibición · primer peludo"
        : "Anual en una exhibición · peludo adicional (15% menos)",
    metadata: { uso: "anual_msi", nivel: anual.nivel },
  });
  return nuevo.id;
}

/** En cuántos meses quedó el pago (3, 6…). `null` si se pagó de corrido. */
export async function mesesDelPago(pagoId: string | null): Promise<number | null> {
  if (!pagoId) return null;
  try {
    const pi = await getStripe().paymentIntents.retrieve(pagoId, { expand: ["latest_charge"] });
    const cargo = pi.latest_charge as Stripe.Charge | null;
    const plan = cargo?.payment_method_details?.card?.installments?.plan;
    return plan?.count ?? null;
  } catch {
    return null;
  }
}

/**
 * Días que faltan para que termine el año pagado. Se adelanta la renovación en
 * los últimos 60: Stripe no admite programar un cobro a más de 2 años.
 */
export const DIAS_PARA_ADELANTAR = 60;

export function puedeAdelantarRenovacion(corte: string | null | undefined): boolean {
  if (!corte) return false;
  const faltan = (new Date(corte).getTime() - Date.now()) / 86_400_000;
  return faltan > 0 && faltan <= DIAS_PARA_ADELANTAR;
}

/** Un año más, contado desde donde termina el año ya pagado (no desde hoy). */
export function siguienteAniversario(desde: Date): number {
  const fin = new Date(desde);
  fin.setFullYear(fin.getFullYear() + 1);
  return Math.floor(fin.getTime() / 1000);
}
