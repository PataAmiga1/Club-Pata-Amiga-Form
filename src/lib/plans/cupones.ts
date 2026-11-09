import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { finDelDia } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * CUPONES — spec sección 3, punto 6.4.
 *
 * En Stripe un descuento son dos objetos y conviene no confundirlos:
 *
 *   coupon          → CUÁNTO descuenta y por cuántos cobros (once/repeating/forever)
 *   promotion_code  → la PALABRA que la persona teclea, con su vigencia y su
 *                     tope de usos
 *
 * El checkout ya manda `allow_promotion_codes: true`, así que basta con crear
 * la pareja para que la palabra funcione. Nada más hay que tocar.
 *
 * Orden de creación (importa): primero se aparta la palabra en nuestra base,
 * después se crea en Stripe. Así la restricción `unique` del código impide dos
 * cupones con la misma palabra ANTES de que exista nada en Stripe. Si Stripe
 * falla, se borra la fila apartada y no queda basura en ningún lado.
 */

export type EntradaCupon = {
  code: string;
  nombre: string;
  tipo: "porcentaje" | "monto";
  /** 1–100 si tipo = 'porcentaje' */
  porcentaje?: number;
  /** en pesos si tipo = 'monto' */
  montoPesos?: number;
  duracion: "once" | "repeating" | "forever";
  duracionMeses?: number;
  /** Día (yyyy-mm-dd) o vacío para sin vencimiento. Vale hasta las 23:59:59 de ese día EN MÉXICO. */
  venceEl?: string;
  usosMax?: number;
  /** Restringir a un plan. Vacío = cualquier plan. */
  planId?: string;
  notas?: string;
  createdBy: string;
};

export type ResultadoCupon =
  | { ok: true; id: string; code: string }
  | { ok: false; error: string };

/** La palabra se normaliza: mayúsculas y sin espacios ni acentos. */
export function normalizarCodigo(code: string) {
  return code
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // marcas de acento que separo el NFD
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export async function crearCupon(
  admin: Admin,
  input: EntradaCupon,
): Promise<ResultadoCupon> {
  const code = normalizarCodigo(input.code);
  if (code.length < 3)
    return { ok: false, error: "La palabra del cupón necesita al menos 3 letras o números." };

  if (input.tipo === "porcentaje") {
    const p = Number(input.porcentaje);
    if (!Number.isFinite(p) || p <= 0 || p > 100)
      return { ok: false, error: "El porcentaje debe estar entre 1 y 100." };
  } else {
    const m = Number(input.montoPesos);
    if (!Number.isFinite(m) || m <= 0)
      return { ok: false, error: "El monto de descuento debe ser mayor a cero." };
  }
  if (input.duracion === "repeating") {
    const meses = Number(input.duracionMeses);
    if (!Number.isFinite(meses) || meses < 1)
      return { ok: false, error: "Di por cuántos meses se repite el descuento." };
  }
  if (input.usosMax !== undefined && input.usosMax !== null && input.usosMax < 1)
    return { ok: false, error: "El tope de usos debe ser al menos 1." };

  // El último instante de ese día en hora de México. Antes era
  // `new Date("…T23:59:59")`, que toma la zona del PROCESO: en Vercel (UTC) un
  // cupón «hasta el 17» vencía el 17 a las 17:59 de México, seis horas antes de
  // lo anunciado (se vio al preparar El Buen Fin, 9-nov-2026).
  const venceEl = input.venceEl
    ? /^\d{4}-\d{2}-\d{2}$/.test(input.venceEl)
      ? finDelDia(input.venceEl)
      : new Date(NaN)
    : null;
  if (venceEl && (Number.isNaN(venceEl.getTime()) || venceEl.getTime() < Date.now()))
    return { ok: false, error: "La fecha de vigencia ya pasó." };

  // --- Restricción por plan ------------------------------------------------
  // En Stripe la restricción se expresa sobre el PRODUCTO, no sobre el plan.
  //
  // OJO — esto se descubrió probándolo: no basta con que el plan tenga algún
  // producto en Stripe. Mientras el checkout siga cayendo al precio de las
  // variables de entorno (porque la versión vigente nunca se publicó), ese
  // precio pertenece a OTRO producto y el cupón restringido no aplicaría
  // nunca. El equipo vería "solo Membresía X" en la pantalla y en la caja no
  // pasaría nada — justo la promesa falsa que esta sección busca evitar.
  //
  // Por eso solo se acepta la restricción si el plan tiene una versión
  // PUBLICADA CON PRECIO en Stripe: la que de verdad se está vendiendo.
  const productos: string[] = [];
  if (input.planId) {
    const { data: vendibles } = await admin
      .from("plan_versions")
      .select("stripe_product_id")
      .eq("plan_id", input.planId)
      .eq("status", "publicada")
      .not("stripe_price_id", "is", null)
      .not("stripe_product_id", "is", null);

    for (const v of vendibles ?? [])
      if (v.stripe_product_id && !productos.includes(v.stripe_product_id))
        productos.push(v.stripe_product_id);

    if (productos.length === 0)
      return {
        ok: false,
        error:
          "Ese plan todavía se vende con el precio de respaldo del entorno, que en Stripe es otro producto: un cupón restringido a él nunca aplicaría. Publica sus versiones en Stripe, o crea el cupón sin restricción de plan.",
      };
  }

  // --- 1. Apartar la palabra en nuestra base -------------------------------
  const { data: fila, error: errorInsert } = await admin
    .from("promo_coupons")
    .insert({
      code,
      nombre: input.nombre.trim() || code,
      tipo: input.tipo,
      porcentaje: input.tipo === "porcentaje" ? Number(input.porcentaje) : null,
      monto_cents:
        input.tipo === "monto" ? Math.round(Number(input.montoPesos) * 100) : null,
      duracion: input.duracion,
      duracion_meses:
        input.duracion === "repeating" ? Number(input.duracionMeses) : null,
      vence_el: venceEl?.toISOString() ?? null,
      usos_max: input.usosMax ?? null,
      plan_id: input.planId || null,
      notas: input.notas?.trim() || null,
      created_by: input.createdBy,
      activo: false, // se enciende cuando Stripe confirma
    })
    .select("id")
    .single();

  if (errorInsert || !fila)
    return {
      ok: false,
      error:
        errorInsert?.code === "23505"
          ? `Ya existe un cupón con la palabra ${code}.`
          : "No se pudo apartar el cupón.",
    };

  // --- 2. Crearlo en Stripe ------------------------------------------------
  try {
    const stripe = getStripe();

    const coupon = await stripe.coupons.create({
      name: input.nombre.trim() || code,
      duration: input.duracion,
      ...(input.duracion === "repeating"
        ? { duration_in_months: Number(input.duracionMeses) }
        : {}),
      ...(input.tipo === "porcentaje"
        ? { percent_off: Number(input.porcentaje) }
        : {
            amount_off: Math.round(Number(input.montoPesos) * 100),
            currency: "mxn",
          }),
      // `applies_to` no vuelve en la respuesta salvo que se pida con expand;
      // que no aparezca NO significa que no se haya guardado.
      ...(productos.length > 0 ? { applies_to: { products: productos } } : {}),
      metadata: { promo_coupon_id: fila.id },
    });

    const promo = await stripe.promotionCodes.create({
      // El SDK 22 pide el descuento envuelto en `promotion` (antes era
      // `coupon: <id>` a secas). Hoy el único tipo posible es 'coupon'.
      promotion: { type: "coupon", coupon: coupon.id },
      code,
      ...(venceEl ? { expires_at: Math.floor(venceEl.getTime() / 1000) } : {}),
      ...(input.usosMax ? { max_redemptions: input.usosMax } : {}),
      metadata: { promo_coupon_id: fila.id },
    });

    await admin
      .from("promo_coupons")
      .update({
        stripe_coupon_id: coupon.id,
        stripe_promotion_code_id: promo.id,
        activo: true,
      })
      .eq("id", fila.id);

    return { ok: true, id: fila.id, code };
  } catch (err) {
    // Stripe rechazó: se retira la palabra apartada para que se pueda volver a
    // intentar con la misma. No hay cupones a medias.
    await admin.from("promo_coupons").delete().eq("id", fila.id);
    const mensaje =
      err instanceof Error ? err.message : "Stripe rechazó el cupón";
    return { ok: false, error: mensaje };
  }
}

/**
 * Cuántas veces se usó cada cupón, leído de Stripe.
 *
 * Se lee en vivo a propósito: un contador copiado en nuestra base se
 * desincroniza con el primer canje hecho fuera del portal, y un número de usos
 * equivocado es peor que no mostrarlo. Una sola llamada trae hasta 100.
 *
 * Nunca lanza: si Stripe no responde, la lista se muestra sin los usos.
 */
export async function usosDeCupones(): Promise<Map<string, number>> {
  const usos = new Map<string, number>();
  try {
    const stripe = getStripe();
    const lista = await stripe.promotionCodes.list({ limit: 100 });
    for (const p of lista.data) usos.set(p.id, p.times_redeemed);
  } catch (err) {
    console.error("[cupones] no se pudieron leer los usos desde Stripe", err);
  }
  return usos;
}

/**
 * Desactiva la palabra en Stripe y en la base.
 *
 * No se borra: un cupón borrado se lleva consigo el rastro de a quién se le
 * descontó. Desactivar deja de aceptar canjes nuevos y conserva el histórico —
 * los descuentos ya aplicados a una suscripción siguen su curso, que es lo que
 * la persona contrató.
 */
export async function desactivarCupon(
  admin: Admin,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: fila } = await admin
    .from("promo_coupons")
    .select("stripe_promotion_code_id")
    .eq("id", id)
    .maybeSingle();
  if (!fila) return { ok: false, error: "Ese cupón no existe." };

  try {
    if (fila.stripe_promotion_code_id) {
      const stripe = getStripe();
      await stripe.promotionCodes.update(fila.stripe_promotion_code_id, {
        active: false,
      });
    }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Stripe rechazó la baja";
    return { ok: false, error: mensaje };
  }

  await admin.from("promo_coupons").update({ activo: false }).eq("id", id);
  return { ok: true };
}
