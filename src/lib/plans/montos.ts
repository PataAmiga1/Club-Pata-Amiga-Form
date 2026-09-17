import type { Beneficios } from "@/lib/plans/benefits";

/**
 * LOS MONTOS DE LA MEMBRESÍA $599 — sección 1 (17-sep-2026).
 *
 * Especificación: juntas/64 §4d. Funciones puras, sin base ni reloj: todo lo
 * que depende del tiempo entra como parámetro, para poder probarlas solas.
 *
 * Hay DOS relojes, y no se mezclan:
 *
 *   1. La APERTURA cuenta desde que el comité aprueba al peludo (igual que la
 *      espera de hoy): cuidados y despedida el día 31, emergencia en el mes 7.
 *   2. El MONTO crece por mes PAGADO. `mesesPagados` = cuántos meses de ese
 *      peludo ha cobrado Stripe (1 con el primer pago). Si un cobro falla, ese
 *      mes no suma.
 *
 * Índice de la tabla del equipo: «Día 1-31» = 1 mes pagado · «Mes k» = k + 1
 * meses pagados. Cuidados: $500 + $125 por mes pagado después del primero,
 * tope $2,000. Emergencia: $30,000 en el mes 7 y $833.33… por mes pagado a
 * partir de ahí, tope $60,000 (mes 43).
 *
 * Todo se calcula en CENTAVOS enteros y el incremento se deriva de
 * (tope − inicial) / meses: así el último escalón llega exacto al tope en vez
 * de quedarse 12 centavos abajo por sumar 833.33 treinta y seis veces.
 */

export type Rubro599 = "cuidados" | "emergencia" | "despedida";

export const RUBROS_599: { rubro: Rubro599; label: string }[] = [
  { rubro: "cuidados", label: "Cuidados cotidianos" },
  { rubro: "emergencia", label: "Emergencia veterinaria" },
  { rubro: "despedida", label: "Despedida" },
];

/** ¿Este paquete de beneficios es del modelo de montos crecientes ($599)? */
export function esModelo599(b: Beneficios): boolean {
  return b.montos_crecientes === true;
}

/**
 * Monto de un escalón que crece linealmente de `inicialMxn` a `topeMxn` en
 * `mesesAlTope` meses. `mesesDeCrecimiento` se recorta a [0, mesesAlTope].
 */
export function montoCrecienteCentavos(
  regla: { inicialMxn: number; topeMxn: number; mesesAlTope: number },
  mesesDeCrecimiento: number,
): number {
  const inicial = Math.round(regla.inicialMxn * 100);
  const tope = Math.round(regla.topeMxn * 100);
  if (regla.mesesAlTope <= 0 || tope <= inicial) return Math.max(inicial, tope);
  const n = Math.min(Math.max(0, Math.floor(mesesDeCrecimiento)), regla.mesesAlTope);
  return inicial + Math.round(((tope - inicial) * n) / regla.mesesAlTope);
}

/**
 * Monto anual vigente de un rubro según los meses pagados de ese peludo, en
 * centavos. `null` = el plan no tiene ese rubro (p. ej. un miembro de $159).
 *
 * Ojo: esto es el MONTO, no si ya está abierto. La apertura se consulta con
 * `fechaDeApertura`.
 */
export function montoDelRubroCentavos(
  b: Beneficios,
  rubro: Rubro599,
  mesesPagados: number,
): number | null {
  if (!esModelo599(b)) return null;
  // Meses pagados después del primero: el índice «Mes k» de la tabla.
  const k = Math.max(0, Math.floor(mesesPagados) - 1);

  if (rubro === "cuidados")
    return montoCrecienteCentavos(
      {
        inicialMxn: Number(b.cuidados_monto_inicial_mxn),
        topeMxn: Number(b.cuidados_tope_anual_mxn),
        mesesAlTope: Number(b.cuidados_meses_al_tope),
      },
      k,
    );

  if (rubro === "emergencia")
    return montoCrecienteCentavos(
      {
        inicialMxn: Number(b.emergencia_monto_inicial_mxn),
        topeMxn: Number(b.emergencia_tope_anual_mxn),
        mesesAlTope: Number(b.emergencia_meses_al_tope),
      },
      // Empieza a crecer en su mes de apertura: en el mes 7 vale el inicial.
      k - Number(b.emergencia_apertura_mes),
    );

  return Math.round(Number(b.despedida_monto_anual_mxn) * 100);
}

// ---------------------------------------------------------------------------
// Fechas: días de calendario como "yyyy-mm-dd", sin zona horaria. Quien llama
// pasa el día mexicano (src/lib/zona-horaria.ts); aquí solo hay aritmética de
// calendario, que no depende de dónde corra el proceso.
// ---------------------------------------------------------------------------

function aFecha(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

function aTexto(f: Date): string {
  return f.toISOString().slice(0, 10);
}

export function sumarDias(dia: string, dias: number): string {
  const f = aFecha(dia);
  f.setUTCDate(f.getUTCDate() + dias);
  return aTexto(f);
}

/**
 * Suma meses de calendario. Si el día no existe en el mes destino (31 de
 * enero + 1 mes), se queda en el último día de ese mes (28/29 de febrero).
 */
export function sumarMeses(dia: string, meses: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const destino = new Date(Date.UTC(a, m - 1 + meses, 1, 12));
  const ultimo = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimo));
  return aTexto(destino);
}

/**
 * Primer día en que el rubro se puede usar, contando el día de la aprobación
 * como el día 1. Cuidados «día 31» → aprobación + 30 días. Emergencia «mes 7»
 * → aprobación + 6 meses de calendario. `null` si el plan no tiene el rubro.
 */
export function fechaDeApertura(
  b: Beneficios,
  rubro: Rubro599,
  diaDeAprobacion: string,
): string | null {
  if (!esModelo599(b)) return null;
  if (rubro === "emergencia")
    return sumarMeses(diaDeAprobacion, Math.max(1, Number(b.emergencia_apertura_mes)) - 1);
  const dias =
    rubro === "cuidados"
      ? Number(b.cuidados_apertura_dias)
      : Number(b.despedida_apertura_dias);
  return sumarDias(diaDeAprobacion, Math.max(1, dias) - 1);
}

/**
 * Primer día del año en curso de un peludo: el aniversario más reciente del
 * día en que entró. Quien entró un 29 de febrero cumple el 28 en años no
 * bisiestos.
 */
export function inicioDeSuAnio(diaDeIngreso: string, hoy: string): string {
  const anios = Number(hoy.slice(0, 4)) - Number(diaDeIngreso.slice(0, 4));
  let inicio = sumarMeses(diaDeIngreso, 12 * anios);
  if (inicio > hoy) inicio = sumarMeses(diaDeIngreso, 12 * (anios - 1));
  return inicio < diaDeIngreso ? diaDeIngreso : inicio;
}

/** Lo que le queda en su año: monto vigente − lo ya reintegrado, nunca negativo. */
export function disponibleCentavos(montoCentavos: number, gastadoEnSuAnioCentavos: number): number {
  return Math.max(0, montoCentavos - gastadoEnSuAnioCentavos);
}
