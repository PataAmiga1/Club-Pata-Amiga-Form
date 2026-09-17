import type { createAdminClient } from "@/lib/supabase/admin";
import { beneficiosDe } from "@/lib/plans/resolve";
import { versionVigente, type VersionVigente } from "@/lib/plans/versiones";
import { PLAN_599 } from "@/lib/plans/planes";
import { ESTADOS_VIVOS, type NivelDePrecio } from "@/lib/plans/suscripciones";

type Admin = ReturnType<typeof createAdminClient>;

export type Oferta599 = {
  nivel: "principal" | "adicional";
  mensualPesos: number;
  anualPesos: number;
  /** Lo que costaría el año pagando mes a mes, para el «te ahorras». */
  ahorroAnualPesos: number;
  cuidados: { aperturaDia: number; inicial: number; incremento: number; tope: number };
  emergencia: { aperturaMes: number; inicial: number; incremento: number; tope: number };
  despedida: { aperturaDia: number; monto: number };
  diasHabiles: number;
  garantiaDias: number;
  /** Comisión mensual del embajador sobre el primer peludo (3 = 3%). */
  comisionPct: number;
};

/** Las dos versiones publicadas del $599, solo si las dos ya tienen sus DOS precios en Stripe. */
async function versionesALaVenta(admin: Admin) {
  const [mensual, anual] = await Promise.all([
    versionVigente(admin, "month", PLAN_599),
    versionVigente(admin, "year", PLAN_599),
  ]);
  if (
    !mensual?.stripe_price_id ||
    !anual?.stripe_price_id ||
    !mensual.stripe_additional_price_id ||
    !anual.stripe_additional_price_id
  )
    return null;
  return { mensual, anual };
}

function armarOferta(mensual: VersionVigente, anual: VersionVigente, nivel: NivelDePrecio): Oferta599 {
  const centavos = (v: VersionVigente) =>
    nivel === "principal" ? v.price_cents : (v.additional_price_cents ?? v.price_cents);
  const mensualPesos = centavos(mensual) / 100;
  const anualPesos = centavos(anual) / 100;

  // Los montos se describen con la versión anual; son los mismos en las dos.
  const b = beneficiosDe(anual.benefits);
  const incremento = (inicial: number, tope: number, meses: number) =>
    meses > 0 ? Math.round(((tope - inicial) / meses) * 100) / 100 : 0;

  return {
    nivel,
    mensualPesos,
    anualPesos,
    ahorroAnualPesos: Math.round((mensualPesos * 12 - anualPesos) * 100) / 100,
    cuidados: {
      aperturaDia: Number(b.cuidados_apertura_dias),
      inicial: Number(b.cuidados_monto_inicial_mxn),
      tope: Number(b.cuidados_tope_anual_mxn),
      incremento: incremento(
        Number(b.cuidados_monto_inicial_mxn),
        Number(b.cuidados_tope_anual_mxn),
        Number(b.cuidados_meses_al_tope),
      ),
    },
    emergencia: {
      aperturaMes: Number(b.emergencia_apertura_mes),
      inicial: Number(b.emergencia_monto_inicial_mxn),
      tope: Number(b.emergencia_tope_anual_mxn),
      incremento: incremento(
        Number(b.emergencia_monto_inicial_mxn),
        Number(b.emergencia_tope_anual_mxn),
        Number(b.emergencia_meses_al_tope),
      ),
    },
    despedida: {
      aperturaDia: Number(b.despedida_apertura_dias),
      monto: Number(b.despedida_monto_anual_mxn),
    },
    diasHabiles: Number(b.dias_habiles_reintegro),
    garantiaDias: Number(b.garantia_dias),
    comisionPct: Number(b.comision_embajador_porcentaje),
  };
}

/**
 * Lo que se le ofrece a una persona en el selector del $599: precios de SU
 * nivel (principal o adicional) y los montos, todo leído de las versiones
 * publicadas. `null` si el plan todavía no tiene sus dos versiones publicadas
 * con precio en Stripe — entonces no se vende.
 */
export async function ofertaDe599(
  admin: Admin,
  userId: string,
): Promise<Oferta599 | null> {
  const [versiones, { data: suyas }] = await Promise.all([
    versionesALaVenta(admin),
    admin.from("subscriptions").select("status, pet_id").eq("user_id", userId),
  ]);
  if (!versiones) return null;

  // Mismo criterio que el checkout: si ya paga por un peludo, este es adicional.
  const nivel: NivelDePrecio = (suyas ?? []).some(
    (s) => s.pet_id && ESTADOS_VIVOS.includes(s.status ?? ""),
  )
    ? "adicional"
    : "principal";
  return armarOferta(versiones.mensual, versiones.anual, nivel);
}

export type OfertaPublica599 = { principal: Oferta599; adicional: Oferta599 };

/**
 * La oferta para quien todavía no tiene cuenta (sección 7, 17-sep-2026):
 * portada, preguntas frecuentes, agentes de IA. Trae los dos niveles porque el
 * copy dice los dos precios. Mismo `null` que `ofertaDe599`: sin versiones
 * publicadas con precio en Stripe no se anuncia ningún número.
 */
export async function ofertaPublica599(admin: Admin): Promise<OfertaPublica599 | null> {
  const versiones = await versionesALaVenta(admin);
  if (!versiones) return null;
  return {
    principal: armarOferta(versiones.mensual, versiones.anual, "principal"),
    adicional: armarOferta(versiones.mensual, versiones.anual, "adicional"),
  };
}
