import type { createAdminClient } from "@/lib/supabase/admin";
import { beneficiosDe } from "@/lib/plans/resolve";
import { versionVigente } from "@/lib/plans/versiones";
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
};

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
  const [mensual, anual, { data: suyas }] = await Promise.all([
    versionVigente(admin, "month", PLAN_599),
    versionVigente(admin, "year", PLAN_599),
    admin.from("subscriptions").select("status, pet_id").eq("user_id", userId),
  ]);
  if (
    !mensual?.stripe_price_id ||
    !anual?.stripe_price_id ||
    !mensual.stripe_additional_price_id ||
    !anual.stripe_additional_price_id
  )
    return null;

  // Mismo criterio que el checkout: si ya paga por un peludo, este es adicional.
  const nivel: NivelDePrecio = (suyas ?? []).some(
    (s) => s.pet_id && ESTADOS_VIVOS.includes(s.status ?? ""),
  )
    ? "adicional"
    : "principal";

  const centavos = (v: typeof mensual) =>
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
  };
}
