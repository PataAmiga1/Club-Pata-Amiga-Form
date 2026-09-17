import type { createAdminClient } from "@/lib/supabase/admin";
import { beneficiosDe } from "@/lib/plans/resolve";
import type { Beneficios } from "@/lib/plans/benefits";
import {
  RUBROS_599,
  type Rubro599,
  disponibleCentavos,
  esModelo599,
  fechaDeApertura,
  inicioDeSuAnio,
  montoDelRubroCentavos,
  sumarMeses,
} from "@/lib/plans/montos";
import { ESTADOS_VIVOS } from "@/lib/plans/suscripciones";
import { diaEnMexico, hoyEnMexico } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * EL MOTOR DE REINTEGROS DE LA MEMBRESÍA $599 — sección 3 (17-sep-2026).
 *
 * Responde, para UN peludo y UN día: ¿qué rubros tiene abiertos, cuánto vale
 * cada uno este año, cuánto ya usó y cuánto le queda? Es la única fuente de
 * esas cifras: la pantalla del miembro, la acción que guarda la solicitud y el
 * panel del comité leen de aquí, para que las tres digan lo mismo (antes el
 * panel calculaba el tope por peludo con una constante global y el miembro por
 * cuenta con su foto: no coincidían).
 *
 * Reglas (juntas/64 §4d):
 *   · todo es por peludo, anual y no acumulable;
 *   · el año del peludo empieza el día que entró (su primer cobro);
 *   · la apertura cuenta desde que el comité lo aprobó;
 *   · el monto crece por mes PAGADO (libro de cobros);
 *   · lo usado = aprobado, o lo solicitado mientras se resuelve; lo rechazado
 *     no cuenta (mismo criterio que el $159).
 */

export const RUBRO_LABEL: Record<Rubro599, string> = Object.fromEntries(
  RUBROS_599.map((r) => [r.rubro, r.label]),
) as Record<Rubro599, string>;

export function esRubro599(categoria: string): categoria is Rubro599 {
  return categoria === "cuidados" || categoria === "emergencia" || categoria === "despedida";
}

export type EstadoRubro = {
  rubro: Rubro599;
  label: string;
  abierto: boolean;
  /** Primer día en que se puede usar. null si el peludo no está aprobado. */
  fechaApertura: string | null;
  montoCentavos: number;
  gastadoCentavos: number;
  disponibleCentavos: number;
};

export type EstadoPeludo599 = {
  petId: string;
  nombre: string;
  especie: "dog" | "cat";
  aprobado: boolean;
  suscripcionId: string;
  estadoSuscripcion: string;
  /** Solo se pide con la suscripción al corriente. */
  puedePedir: boolean;
  beneficios: Beneficios;
  mesesPagados: number;
  /** Día en que entró (primer período cobrado). */
  ingreso: string;
  /** Primer día de su año en curso; lo usado se cuenta desde aquí. */
  anioDesde: string;
  /** Primer día del año siguiente, cuando se renuevan los montos. */
  anioHasta: string;
  rubros: Record<Rubro599, EstadoRubro>;
};

/**
 * Meses pagados al día `hoy`: por cada cobro, los meses de su período que ya
 * empezaron. Un mensual cuenta 1 en cuanto empieza; un anual va sumando uno
 * por mes transcurrido, hasta 12. Un cobro fallido no está en el libro, así
 * que ese mes no suma.
 */
export function mesesPagadosAl(
  cobros: { period_start: string | null; period_end: string | null }[],
  hoy: string,
): number {
  // Sección 9: al cambiar de mensual a anual (o al revés) los períodos se
  // enciman — el mes en curso ya pagado y el año nuevo que empieza hoy. Un mes
  // que arranca dentro de un período ya contado no vuelve a sumar.
  const periodos = cobros
    .filter((c) => c.period_start)
    .map((c) => {
      const inicio = diaEnMexico(new Date(c.period_start!));
      const fin = c.period_end ? diaEnMexico(new Date(c.period_end)) : sumarMeses(inicio, 1);
      return { inicio, fin };
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  let total = 0;
  let cubiertoHasta = "";
  for (const { inicio, fin } of periodos) {
    for (let m = 0; m < 1200; m++) {
      const arranque = sumarMeses(inicio, m);
      if (arranque >= fin || arranque > hoy) break;
      if (arranque >= cubiertoHasta) total++;
    }
    if (fin > cubiertoHasta) cubiertoHasta = fin;
  }
  return total;
}

/**
 * El estado de un peludo del $599. `null` si el peludo no tiene una
 * suscripción viva del modelo $599 (p. ej. es del $159).
 *
 * `excluirReintegroId`: para el panel del comité, que necesita el disponible
 * SIN contar la propia solicitud que está resolviendo.
 */
export async function estadoDePeludo599(
  admin: Admin,
  petId: string,
  opciones: { hoy?: string; excluirReintegroId?: string } = {},
): Promise<EstadoPeludo599 | null> {
  const hoy = opciones.hoy ?? hoyEnMexico();

  const [{ data: pet }, { data: subs }] = await Promise.all([
    admin
      .from("pets")
      .select("id, name, species, approval_status, waiting_period_start_date, waiting_period_bypassed")
      .eq("id", petId)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select("id, status, stripe_subscription_id, benefits_snapshot, created_at")
      .eq("pet_id", petId)
      .order("created_at", { ascending: false }),
  ]);
  if (!pet) return null;
  const sub = (subs ?? []).find((s) => ESTADOS_VIVOS.includes(s.status ?? ""));
  if (!sub) return null;
  const b = beneficiosDe(sub.benefits_snapshot as Record<string, unknown> | null);
  if (!esModelo599(b)) return null;

  const [{ data: cobros }, { data: reintegros }] = await Promise.all([
    sub.stripe_subscription_id
      ? admin
          .from("subscription_payments")
          .select("period_start, period_end")
          .eq("stripe_subscription_id", sub.stripe_subscription_id)
          .order("period_start", { ascending: true })
      : Promise.resolve({ data: [] as { period_start: string | null; period_end: string | null }[] }),
    admin
      .from("reimbursements")
      .select("id, category, amount_requested, amount_approved, status, created_at")
      .eq("pet_id", petId),
  ]);

  const primerCobro = (cobros ?? []).find((c) => c.period_start)?.period_start;
  const ingreso = diaEnMexico(new Date(primerCobro ?? sub.created_at));
  const anioDesde = inicioDeSuAnio(ingreso, hoy);
  const anioHasta = sumarMeses(anioDesde, 12);
  const mesesPagados = mesesPagadosAl(cobros ?? [], hoy);
  const aprobado = pet.approval_status === "approved";

  const usadoEnSuAnio = (rubro: Rubro599) =>
    (reintegros ?? [])
      .filter(
        (r) =>
          r.category === rubro &&
          r.status !== "rejected" &&
          r.id !== opciones.excluirReintegroId &&
          diaEnMexico(new Date(r.created_at)) >= anioDesde,
      )
      .reduce((suma, r) => {
        const monto = Number(r.amount_approved ?? r.amount_requested ?? 0);
        return suma + (Number.isFinite(monto) && monto > 0 ? Math.round(monto * 100) : 0);
      }, 0);

  const rubros = {} as Record<Rubro599, EstadoRubro>;
  for (const { rubro, label } of RUBROS_599) {
    const fechaApertura =
      aprobado && pet.waiting_period_start_date
        ? fechaDeApertura(b, rubro, pet.waiting_period_start_date)
        : null;
    const abierto =
      aprobado && (pet.waiting_period_bypassed || (!!fechaApertura && fechaApertura <= hoy));
    const monto = montoDelRubroCentavos(b, rubro, mesesPagados) ?? 0;
    const gastado = usadoEnSuAnio(rubro);
    rubros[rubro] = {
      rubro,
      label,
      abierto,
      fechaApertura,
      montoCentavos: monto,
      gastadoCentavos: gastado,
      disponibleCentavos: abierto ? disponibleCentavos(monto, gastado) : 0,
    };
  }

  return {
    petId,
    nombre: pet.name,
    especie: pet.species as "dog" | "cat",
    aprobado,
    suscripcionId: sub.id,
    estadoSuscripcion: sub.status ?? "",
    puedePedir: sub.status === "active",
    beneficios: b,
    mesesPagados,
    ingreso,
    anioDesde,
    anioHasta,
    rubros,
  };
}

/** ¿Esta persona es miembro del $599 (tiene al menos un peludo con suscripción viva)? */
export async function esMiembro599(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("subscriptions")
    .select("status, pet_id")
    .eq("user_id", userId)
    .not("pet_id", "is", null);
  return (data ?? []).some((s) => ESTADOS_VIVOS.includes(s.status ?? ""));
}

/**
 * Para las tarjetas de peludo (sección 7): por cada peludo con membresía $599,
 * sus tres montos con la fecha en que se abren. Los peludos sin membresía $599
 * no aparecen en el mapa y su tarjeta sigue como siempre.
 */
export async function aperturasDePeludos(
  admin: Admin,
  petIds: string[],
): Promise<Map<string, { label: string; abierto: boolean; fechaApertura: string | null }[]>> {
  const estados = await Promise.all(petIds.map((id) => estadoDePeludo599(admin, id)));
  const mapa = new Map<string, { label: string; abierto: boolean; fechaApertura: string | null }[]>();
  for (const e of estados) {
    if (!e) continue;
    mapa.set(
      e.petId,
      RUBROS_599.map(({ rubro }) => ({
        label: e.rubros[rubro].label,
        abierto: e.rubros[rubro].abierto,
        fechaApertura: e.rubros[rubro].fechaApertura,
      })),
    );
  }
  return mapa;
}
