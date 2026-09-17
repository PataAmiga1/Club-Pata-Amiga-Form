import type Stripe from "stripe";
import { lineaDelCobro } from "@/lib/plans/factura";
import type { createAdminClient } from "@/lib/supabase/admin";
import { beneficiosDe } from "@/lib/plans/resolve";
import { sumarMeses } from "@/lib/plans/montos";
import { diaEnMexico } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * COMISIONES DEL EMBAJADOR — sección 5 del $599 (17-sep-2026).
 *
 * Dos fuentes, una sola lectura:
 *   · `referrals.commission_amount`: la comisión ÚNICA del $159 ($16/$170).
 *   · `referral_commissions`: el 3% MENSUAL del primer peludo en el $599.
 *
 * TRES lugares tienen que cuadrar siempre —el botón de corte, el archivo del
 * banco y el total de Finanzas (CLAUDE.md)—, más los paneles que los enseñan.
 * Por eso todos leen de aquí y filtran con `esPagable`: si alguien cambia una
 * regla del corte, la cambia en un solo lugar.
 */

export type ComisionItem = {
  id: string;
  fuente: "referido" | "mensual";
  ambassadorId: string;
  /** El referido que la generó (en la fuente «referido», es la misma fila). */
  referralId: string;
  monto: number;
  /** A qué mes corresponde (referido: su alta; mensual: el mes pagado). */
  fecha: string;
  /** Cuándo entró el dinero por la pasarela: decide la regla de la baja. */
  cobradoEl: string;
  status: string;
};

/** ¿Entra en el corte que se paga ahora? */
export function esPagable(
  item: ComisionItem,
  inicioDelMesEnCurso: Date,
  bajaDelEmbajador: string | null | undefined,
): boolean {
  if (item.status !== "pending") return false;
  if (new Date(item.fecha) >= inicioDelMesEnCurso) return false;
  // Hasta la fecha de la baja, ni un día más (Pablo, 16-ago).
  if (bajaDelEmbajador && new Date(item.cobradoEl) > new Date(bajaDelEmbajador)) return false;
  return true;
}

/** Todas las comisiones (de las dos fuentes) de uno o varios embajadores. */
export async function comisionesDeEmbajadores(
  admin: Admin,
  ambassadorIds?: string[],
): Promise<ComisionItem[]> {
  let qReferidos = admin
    .from("referrals")
    .select("id, ambassador_id, commission_amount, status, created_at");
  let qMensuales = admin
    .from("referral_commissions")
    .select("id, referral_id, ambassador_id, amount, status, earned_on, paid_at");
  if (ambassadorIds) {
    qReferidos = qReferidos.in("ambassador_id", ambassadorIds);
    qMensuales = qMensuales.in("ambassador_id", ambassadorIds);
  }
  const [{ data: referidos }, { data: mensuales }] = await Promise.all([qReferidos, qMensuales]);

  return [
    ...(referidos ?? [])
      .filter((r) => Number(r.commission_amount ?? 0) > 0)
      .map((r) => ({
        id: r.id,
        fuente: "referido" as const,
        ambassadorId: r.ambassador_id,
        referralId: r.id,
        monto: Number(r.commission_amount ?? 0),
        fecha: r.created_at,
        cobradoEl: r.created_at,
        status: r.status,
      })),
    ...(mensuales ?? []).map((m) => ({
      id: m.id,
      fuente: "mensual" as const,
      ambassadorId: m.ambassador_id,
      referralId: m.referral_id,
      monto: Number(m.amount ?? 0),
      // El día 1 del mes, a mediodía de México, para que ningún huso lo corra.
      fecha: `${m.earned_on}T18:00:00Z`,
      cobradoEl: m.paid_at,
      status: m.status,
    })),
  ];
}

export const sumaDe = (items: ComisionItem[]) =>
  Math.round(items.reduce((s, i) => s + i.monto, 0) * 100) / 100;

/**
 * El corte del mes: lo que se paga hoy, por embajador y en total. Es lo que
 * leen el botón de corte, el archivo del banco, Finanzas y el resumen, para
 * que den el mismo número.
 */
export async function corteDeComisiones(
  admin: Admin,
  inicioDelMesEnCurso: Date,
  ambassadorIds?: string[],
): Promise<{
  todas: ComisionItem[];
  pagables: ComisionItem[];
  total: number;
  porEmbajador: Map<string, ComisionItem[]>;
}> {
  let qEmb = admin.from("ambassadors").select("id, deactivated_at");
  if (ambassadorIds) qEmb = qEmb.in("id", ambassadorIds);
  const [todas, { data: embajadores }] = await Promise.all([
    comisionesDeEmbajadores(admin, ambassadorIds),
    qEmb,
  ]);
  const baja = new Map((embajadores ?? []).map((e) => [e.id, e.deactivated_at as string | null]));
  const pagables = todas.filter((i) => esPagable(i, inicioDelMesEnCurso, baja.get(i.ambassadorId)));
  const porEmbajador = new Map<string, ComisionItem[]>();
  for (const i of pagables) porEmbajador.set(i.ambassadorId, [...(porEmbajador.get(i.ambassadorId) ?? []), i]);
  return { todas, pagables, total: sumaDe(pagables), porEmbajador };
}

/**
 * Genera la comisión mensual de un cobro del $599. Idempotente por factura y
 * mes. No hace nada si el cobro no es del peludo principal, si el plan no
 * paga porcentaje, si el referido no vino de un embajador, o si el embajador
 * ya estaba dado de baja cuando entró el dinero.
 */
export async function acumularComisionDeCobro(admin: Admin, invoice: Stripe.Invoice) {
  const subId =
    typeof invoice.parent?.subscription_details?.subscription === "string"
      ? invoice.parent.subscription_details.subscription
      : null;
  const pagado = invoice.amount_paid ?? 0;
  if (!subId || !invoice.id || invoice.status !== "paid" || pagado <= 0) return;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, pet_id, price_tier, benefits_snapshot")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  // Sin fila todavía (el cobro llegó antes que el alta): el alta lo vuelve a
  // procesar con la factura inicial.
  if (!sub || !sub.pet_id) return;
  // «Solo sobre el primer peludo» (equipo, 17-sep).
  if (sub.price_tier !== "principal") return;
  const porcentaje = Number(
    beneficiosDe(sub.benefits_snapshot as Record<string, unknown> | null)
      .comision_embajador_porcentaje,
  );
  if (!(porcentaje > 0)) return;

  const { data: referido } = await admin
    .from("referrals")
    .select("id, ambassador_id, subscription_id, ambassadors(status, deactivated_at)")
    .eq("referred_user_id", sub.user_id)
    .maybeSingle();
  if (!referido) return;
  // «Solo para referidos del $599» (sección 9). El referido es uno por persona:
  // si vino de un embajador cuando contrató el $159 (que ya le pagó sus $16) y
  // después volvió con el $599, ese vínculo viejo no genera el 3%. Cuenta solo
  // si el alta referida fue una membresía por peludo.
  const { data: suscripcionReferida } = referido.subscription_id
    ? await admin.from("subscriptions").select("pet_id").eq("id", referido.subscription_id).maybeSingle()
    : { data: null };
  if (!suscripcionReferida?.pet_id) return;
  const emb = (Array.isArray(referido.ambassadors) ? referido.ambassadors[0] : referido.ambassadors) as
    | { status?: string; deactivated_at?: string | null }
    | null;
  const cobradoEl = invoice.status_transitions?.paid_at
    ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
    : new Date().toISOString();
  if (emb?.deactivated_at && new Date(cobradoEl) > new Date(emb.deactivated_at)) return;

  // Meses que cubre el cobro: 1 en mensual, 12 en anual.
  const linea = lineaDelCobro(invoice);
  const inicio = linea?.period?.start
    ? diaEnMexico(new Date(linea.period.start * 1000))
    : diaEnMexico(new Date(cobradoEl));
  const fin = linea?.period?.end ? diaEnMexico(new Date(linea.period.end * 1000)) : sumarMeses(inicio, 1);
  let meses = 0;
  while (meses < 24 && sumarMeses(inicio, meses) < fin) meses++;
  meses = Math.max(1, meses);

  const totalCentavos = Math.round((pagado * porcentaje) / 100);
  const porMes = Math.floor(totalCentavos / meses);
  const filas = Array.from({ length: meses }, (_, k) => {
    const mes = sumarMeses(inicio, k);
    return {
      referral_id: referido.id,
      ambassador_id: referido.ambassador_id,
      subscription_id: sub.id,
      stripe_invoice_id: invoice.id!,
      earned_on: `${mes.slice(0, 7)}-01`,
      paid_at: cobradoEl,
      base_cents: pagado,
      percentage: porcentaje,
      // El último mes se lleva los centavos que sobran del reparto.
      amount: (k === meses - 1 ? totalCentavos - porMes * (meses - 1) : porMes) / 100,
    };
  });
  await admin
    .from("referral_commissions")
    .upsert(filas, { onConflict: "stripe_invoice_id,earned_on", ignoreDuplicates: true });
}
