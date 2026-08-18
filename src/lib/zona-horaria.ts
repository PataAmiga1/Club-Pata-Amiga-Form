/**
 * HORA DE MÉXICO — la única aritmética de zona horaria del repo.
 *
 * Sin dependencias a propósito, para poder compilarlo y probarlo suelto (los
 * módulos que importan por alias `@/` no se pueden correr aparte). Aquí vive lo
 * delicado, así que aquí es donde conviene poder probarlo.
 *
 * POR QUÉ EXISTE. `new Date().toISOString().slice(0, 10)` y
 * `fecha.setHours(0, 0, 0, 0)` dan el día del **proceso**, no el del negocio.
 * En esta máquina (UTC−6) y en Vercel (UTC) el mismo código daba dos verdades:
 * el "26 de julio" agarraba 17 contactos que en UTC son del 27. Salió al cuadrar
 * el tablero contra SQL (F7a) y estaba repetido en otros ocho lugares, tres de
 * ellos con consecuencias que alguien iba a reclamar:
 *
 *  - el tope diario de gasto de IA se reiniciaba a las 6 de la tarde;
 *  - la fecha fin del tiempo de espera de una mascota salía con un día extra
 *    para quien se registrara después de las 6 de la tarde;
 *  - una promoción que vencía hoy dejaba de mostrarse 6 horas antes.
 *
 * Se ancla a America/Mexico_City porque es la zona del negocio: si algo pasó a
 * las 9 de la noche en México, es de ese día y no del siguiente.
 */

export const ZONA_MX = "America/Mexico_City";

/** Minutos de diferencia entre la zona de México y UTC en ese instante. */
function offsetMx(instante: Date): number {
  const enMexico = new Date(instante.toLocaleString("en-US", { timeZone: ZONA_MX }));
  const enUtc = new Date(instante.toLocaleString("en-US", { timeZone: "UTC" }));
  return (enMexico.getTime() - enUtc.getTime()) / 60000;
}

/** El día calendario mexicano de un instante, como yyyy-mm-dd. */
export function diaEnMexico(instante: Date): string {
  // "en-CA" formatea como yyyy-mm-dd, que es justo lo que guarda la base.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_MX,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * Una hora de reloj mexicana ("2026-05-14T09:30:00", sin zona) como instante.
 *
 * Es la conversión "hora de pared → instante": la usan los rangos del tablero y
 * la importación del histórico, que lee fechas de un CRM que las escribe en
 * hora de México.
 */
export function instanteEnMexico(horaDePared: string): Date {
  const comoSiFueraUtc = new Date(`${horaDePared}Z`);
  if (Number.isNaN(comoSiFueraUtc.getTime())) return comoSiFueraUtc;
  return new Date(comoSiFueraUtc.getTime() - offsetMx(comoSiFueraUtc) * 60000);
}

/** El instante en que empieza ese día mexicano. */
export function inicioDelDia(dia: Date | string): Date {
  const texto = typeof dia === "string" ? dia : diaEnMexico(dia);
  return instanteEnMexico(`${texto}T00:00:00.000`);
}

/** El último instante de ese día mexicano. */
export function finDelDia(dia: Date | string): Date {
  const texto = typeof dia === "string" ? dia : diaEnMexico(dia);
  return instanteEnMexico(`${texto}T23:59:59.999`);
}

/** Hoy en México, como yyyy-mm-dd. Para comparar contra columnas `date`. */
export function hoyEnMexico(): string {
  return diaEnMexico(new Date());
}

/**
 * El día mexicano dentro de `dias` días, como yyyy-mm-dd.
 *
 * Se avanza sobre el mediodía y no sobre la medianoche: si algún día México
 * vuelve al horario de verano, sumar 24 h a las 00:00 puede caer en el mismo
 * día o saltarse uno. Al mediodía nunca pasa.
 */
export function diaEnMexicoMasDias(dias: number, desde: Date = new Date()): string {
  const mediodia = instanteEnMexico(`${diaEnMexico(desde)}T12:00:00.000`);
  return diaEnMexico(new Date(mediodia.getTime() + dias * 86_400_000));
}

/** El instante en que empezó el mes mexicano en curso. */
export function inicioDelMes(ahora: Date = new Date()): Date {
  const [anio, mes] = diaEnMexico(ahora).split("-");
  return inicioDelDia(`${anio}-${mes}-01`);
}
