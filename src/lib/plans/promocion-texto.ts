/**
 * CÓMO SE DESCRIBE UN CÓDIGO DE PROMOCIÓN (19-sep-2026, cupón EXPOCAN).
 *
 * Sin dependencias de servidor a propósito: lo usan la página del plan (en el
 * navegador, según el plan que la persona tenga elegido) y el correo de la
 * guía. Así una promoción nunca se describe de dos maneras distintas.
 *
 * EXPOCAN es «$599 de descuento, una vez»: sobre el mensual de $599 es el
 * primer mes gratis; sobre el anual son $599 menos. Por eso la descripción
 * depende del precio al que se aplica.
 */

export type Promocion = {
  codigo: string;
  /** 1–100, o null si el descuento es un monto fijo. */
  porcentaje: number | null;
  /** Descuento fijo en centavos, o null si es porcentaje. */
  montoCentavos: number | null;
  duracion: "once" | "repeating" | "forever";
  /** Solo con `repeating`. */
  meses: number | null;
};

const pesos = (centavos: number) =>
  `$${(centavos / 100).toLocaleString("es-MX", {
    minimumFractionDigits: centavos % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * La frase de la promoción. `precio` es el cobro al que se aplica; sin él (el
 * correo, que no sabe qué plan va a elegir la persona) se describe sola.
 */
export function describirPromocion(
  p: Promocion,
  precio?: { centavos: number; intervalo: "month" | "year" },
): string {
  const cubreTodo =
    p.porcentaje === 100 ||
    (p.montoCentavos !== null && !!precio && p.montoCentavos >= precio.centavos);

  if (p.duracion === "once" && cubreTodo)
    return precio?.intervalo === "year" ? "primer año gratis" : "primer mes gratis";

  const descuento =
    p.porcentaje !== null
      ? `${p.porcentaje}% de descuento`
      : p.montoCentavos !== null
        ? `${pesos(p.montoCentavos)} de descuento`
        : null;
  if (!descuento) return "descuento aplicado";

  if (p.duracion === "once") return `${descuento} en tu primer pago`;
  if (p.duracion === "repeating" && p.meses)
    return `${descuento} por ${p.meses} ${p.meses === 1 ? "mes" : "meses"}`;
  if (p.duracion === "forever") return `${descuento} en cada pago`;
  return "descuento aplicado";
}
