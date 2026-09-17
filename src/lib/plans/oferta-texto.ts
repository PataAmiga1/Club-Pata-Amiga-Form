import type { GrupoCatalogo } from "@/lib/catalogo-cuidados";
import type { OfertaPublica599 } from "@/lib/plans/oferta";

/**
 * La oferta del $599 escrita en palabras (sección 7, 17-sep-2026). Módulo sin
 * dependencias de servidor: lo importan componentes de cliente (preguntas
 * frecuentes) y los prompts de los agentes. Los números vienen de
 * `ofertaPublica599`, que lee la versión publicada.
 */

/** $599 · $6,612 · $833.33 — pesos con centavos solo cuando los hay. */
export function pesosDeOferta(n: number): string {
  return `$${n.toLocaleString("es-MX", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * La oferta en renglones de texto, para los prompts de los agentes y las
 * herramientas del demo. Una sola redacción para que el agente de ventas, el
 * asistente de miembros y el demo digan exactamente lo mismo.
 */
export function renglonesDeLaOferta599(
  o: OfertaPublica599,
  catalogo: GrupoCatalogo[] = [],
): string[] {
  const p = o.principal;
  const a = o.adicional;
  const $ = pesosDeOferta;
  const conceptos = catalogo
    .filter((g) => g.conceptos.length > 0)
    .map((g) => `    ${g.titulo}: ${g.conceptos.map((c) => c.nombre).join(", ")}.`);
  return [
    `- Precio POR PELUDO, cada uno con su propia membresía: ${$(p.mensualPesos)} MXN/mes o ${$(p.anualPesos)} MXN/año (ahorra ${$(p.ahorroAnualPesos)}).`,
    `- Segundo peludo en adelante, sin límite: 15% de descuento → ${$(a.mensualPesos)} MXN/mes o ${$(a.anualPesos)} MXN/año. Siempre paga el precio completo el peludo más antiguo que siga activo.`,
    `- Montos disponibles POR PELUDO, anuales (se renuevan cada año desde el día que entró; lo que no se usa NO se acumula):`,
    `  · Cuidados cotidianos (solo lo que está en el catálogo cerrado${conceptos.length ? ", abajo" : ""}): desde el día ${p.cuidados.aperturaDia} con ${$(p.cuidados.inicial)}; sube ${$(p.cuidados.incremento)} por cada mes pagado hasta ${$(p.cuidados.tope)}.`,
    ...(conceptos.length
      ? ["    Catálogo de cuidados cotidianos (si algo no está aquí, no se reintegra con este monto):", ...conceptos]
      : []),
    `  · Emergencia veterinaria: desde el mes ${p.emergencia.aperturaMes} con ${$(p.emergencia.inicial)}; sube ${$(p.emergencia.incremento)} por cada mes pagado hasta ${$(p.emergencia.tope)}.`,
    `  · Despedida: ${$(p.despedida.monto)} desde el día ${p.despedida.aperturaDia}.`,
    `- El anual se puede pagar a 3 o 6 MESES SIN INTERESES con tarjetas de crédito participantes; la opción aparece en la pantalla de pago de Stripe, después de escribir la tarjeta. El mensual no.`,
    `- Los días y meses se cuentan desde que el comité aprueba al peludo. Solo suman los meses pagados.`,
    `- Sin límite de edad. Peludos senior (8 años o más): certificado médico veterinario al registrarlos.`,
    `- Reintegro en máximo ${p.diasHabiles} días hábiles; si nos tardamos más, ese mes de ese peludo es gratis.`,
    `- Garantía de satisfacción: en los primeros ${p.garantiaDias} días devolvemos lo pagado por ese peludo menos lo que ya se le reintegró.`,
    `- Sin plazo forzoso: se cancela cuando quiera.`,
  ];
}
