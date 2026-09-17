/**
 * INGRESO RECURRENTE Y ETIQUETAS DE PLAN — sección 8 de la membresía $599
 * (17-sep-2026).
 *
 * Con el $599 conviven dos formas de cobrar: el $159 es UNA suscripción por
 * persona, y el $599 es una por peludo. Cada renglón de `subscriptions` sigue
 * siendo un cobro, así que el MRR se suma igual (lo mensual tal cual, lo anual
 * entre 12); lo que cambia es que ya no se pueden contar personas contando
 * suscripciones, ni leer «el plan» de alguien en una sola fila.
 *
 * Es la única fuente de esas cuentas: Finanzas, el inicio del panel, el
 * tablero de ventas, la lista de miembros y la exportación leen de aquí, para
 * que digan lo mismo.
 *
 * Sin dependencias de servidor: lo pueden importar páginas y componentes.
 */

export type CobroRecurrente = {
  user_id?: string | null;
  plan: string | null;
  amount: number | string | null;
  /** Con peludo = membresía $599 (sección 2). Sin peludo = $159. */
  pet_id?: string | null;
  price_tier?: string | null;
};

/** ¿Este cobro es de la membresía $599? */
export function esCobroDe599(s: Pick<CobroRecurrente, "pet_id">): boolean {
  return Boolean(s.pet_id);
}

/** Lo que aporta un cobro al mes: el anual se reparte entre 12. */
export function aporteMensual(s: Pick<CobroRecurrente, "plan" | "amount">): number {
  const monto = Number(s.amount ?? 0);
  return s.plan === "annual" ? monto / 12 : monto;
}

type Bolsa = { n: number; mrr: number };
const bolsa = (): Bolsa => ({ n: 0, mrr: 0 });
const suma = (b: Bolsa, s: CobroRecurrente) => {
  b.n++;
  b.mrr += aporteMensual(s);
};

export type ResumenDeIngresos = {
  mrr: number;
  /** Personas distintas con al menos un cobro en la plataforma. */
  miembrosConCobro: number;
  mensual: Bolsa;
  anual: Bolsa;
  plan159: Bolsa;
  plan599: Bolsa & {
    miembros: number;
    principal: Bolsa;
    adicional: Bolsa;
  };
};

/** Suma las suscripciones que se le pasen (quien llama decide cuáles cuentan). */
export function resumenDeIngresos(subs: CobroRecurrente[]): ResumenDeIngresos {
  const r: ResumenDeIngresos = {
    mrr: 0,
    miembrosConCobro: 0,
    mensual: bolsa(),
    anual: bolsa(),
    plan159: bolsa(),
    plan599: { ...bolsa(), miembros: 0, principal: bolsa(), adicional: bolsa() },
  };
  const personas = new Set<string>();
  const personas599 = new Set<string>();
  for (const s of subs) {
    r.mrr += aporteMensual(s);
    if (s.user_id) personas.add(s.user_id);
    suma(s.plan === "annual" ? r.anual : r.mensual, s);
    if (esCobroDe599(s)) {
      suma(r.plan599, s);
      suma(s.price_tier === "adicional" ? r.plan599.adicional : r.plan599.principal, s);
      if (s.user_id) personas599.add(s.user_id);
    } else {
      suma(r.plan159, s);
    }
  }
  r.miembrosConCobro = personas.size;
  r.plan599.miembros = personas599.size;
  return r;
}

const intervalo = (plan: string | null | undefined) =>
  plan === "annual" ? "Anual" : plan === "monthly" ? "Mensual" : null;

/**
 * La etiqueta del plan de UNA persona, a partir de sus suscripciones vivas:
 *   $159 → «Mensual» / «Anual» (como siempre)
 *   $599 → «$599 · Mensual» con un peludo, «$599 · 2 peludos» con varios
 */
export function etiquetaDePlanDelMiembro(
  vivas: Pick<CobroRecurrente, "plan" | "pet_id">[],
): string | null {
  if (vivas.length === 0) return null;
  const de599 = vivas.filter(esCobroDe599);
  if (de599.length === 0) return intervalo(vivas[0].plan);
  if (de599.length === 1) return `$599 · ${intervalo(de599[0].plan) ?? "—"}`;
  return `$599 · ${de599.length} peludos`;
}
