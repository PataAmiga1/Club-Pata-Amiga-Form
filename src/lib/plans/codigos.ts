import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import type { Promocion } from "@/lib/plans/promocion-texto";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * EL CAMPO «¿TIENES UN CÓDIGO?» (19-sep-2026).
 *
 * En la página del plan había UNA casilla que decía «código» y solo aceptaba
 * códigos de embajador. Los códigos de promoción (EXPOCAN, creado a mano en
 * Stripe) vivían en otra casilla, la de la página de pago de Stripe, y la
 * gente los escribía en la nuestra: se rechazaban. Ahora la casilla reconoce
 * los dos.
 *
 * Orden: primero embajador, después Stripe. El código de un embajador es
 * personal y lo eligió él; si coincide con una palabra de promoción, gana el
 * embajador.
 *
 * El navegador solo manda la PALABRA; el servidor la vuelve a reconocer aquí
 * al abrir el pago, así que un id de Stripe nunca viene de fuera.
 */

export type CodigoReconocido =
  | { tipo: "embajador"; codigo: string }
  | { tipo: "promocion"; codigo: string; promotionCodeId: string; promocion: Promocion }
  | { tipo: "invalido"; codigo: string };

/** Como lo teclea la persona: sin espacios y en mayúsculas. Los guiones se quedan (PATAMIGA-…). */
export function limpiarCodigo(texto: string | null | undefined): string {
  return (texto ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export async function esCodigoDeEmbajador(admin: Admin, codigo: string): Promise<boolean> {
  if (!codigo) return false;
  const { data } = await admin
    .from("ambassadors")
    .select("id")
    .eq("referral_code", codigo)
    .eq("status", "approved")
    .limit(1);
  return (data ?? []).length > 0;
}

/** El código de promoción ACTIVO con esa palabra en Stripe, o null. */
export async function buscarPromocion(
  codigo: string,
): Promise<{ promotionCodeId: string; promocion: Promocion; vence: number | null } | null> {
  if (!codigo) return null;
  const { data } = await getStripe().promotionCodes.list({
    code: codigo,
    active: true,
    limit: 1,
    expand: ["data.promotion.coupon"],
  });
  const pc = data[0];
  const cupon = pc?.promotion?.coupon;
  if (!pc || !cupon || typeof cupon === "string" || !cupon.valid) return null;
  return {
    promotionCodeId: pc.id,
    promocion: promocionDeCupon(pc.code, cupon),
    // Segundos de Stripe; el correo dice hasta cuándo vale.
    vence: pc.expires_at ?? cupon.redeem_by ?? null,
  };
}

export function promocionDeCupon(codigo: string, cupon: Stripe.Coupon): Promocion {
  return {
    codigo,
    porcentaje: cupon.percent_off ?? null,
    montoCentavos: cupon.amount_off ?? null,
    duracion: cupon.duration,
    meses: cupon.duration_in_months ?? null,
  };
}

export async function reconocerCodigo(admin: Admin, texto: string): Promise<CodigoReconocido> {
  const codigo = limpiarCodigo(texto);
  if (!codigo) return { tipo: "invalido", codigo };
  if (await esCodigoDeEmbajador(admin, codigo)) return { tipo: "embajador", codigo };
  try {
    const promo = await buscarPromocion(codigo);
    if (promo)
      return {
        tipo: "promocion",
        codigo: promo.promocion.codigo,
        promotionCodeId: promo.promotionCodeId,
        promocion: promo.promocion,
      };
  } catch (e) {
    // Stripe caído no debe tumbar la página del plan: el código se da por no
    // encontrado y la casilla de Stripe en la página de pago sigue ahí.
    console.error("[codigos] no se pudo consultar Stripe", e);
  }
  return { tipo: "invalido", codigo };
}
