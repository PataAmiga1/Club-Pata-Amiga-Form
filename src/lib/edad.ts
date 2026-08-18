/**
 * Edad de una persona y la regla de mayoría de edad.
 *
 * El equipo (13-ago) pidió que NO se pueda crear la cuenta —ni de miembro ni
 * de embajador— si quien la abre no tiene 18 años. Hasta hoy el registro de
 * embajador solo tenía una casilla de "confirmo que soy mayor de edad" que no
 * validaba nada, y el de miembro ni siquiera preguntaba la fecha.
 *
 * Todo el cálculo sale de `hoyEnMexico()`: con `new Date()` a secas, "hoy" en
 * Vercel es UTC y a partir de las 18:00 hora de México ya es el día siguiente,
 * así que alguien podía ser mayor de edad medio día antes de serlo.
 */

import { hoyEnMexico } from "@/lib/zona-horaria";

export const EDAD_MINIMA = 18;

/** Años cumplidos al día de hoy en México. `null` si la fecha no sirve. */
export function edadEnAnios(
  fechaNacimiento: string | null | undefined,
): number | null {
  if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento))
    return null;
  const [ay, am, ad] = fechaNacimiento.split("-").map(Number);
  const [hy, hm, hd] = hoyEnMexico().split("-").map(Number);
  // Fecha futura: no es una edad, es un dato mal capturado.
  if (ay > hy || (ay === hy && (am > hm || (am === hm && ad > hd)))) return null;
  let anios = hy - ay;
  if (hm < am || (hm === am && hd < ad)) anios--;
  return anios;
}

/** ¿Cumple los 18? `false` también cuando la fecha falta o es inválida. */
export function esMayorDeEdad(
  fechaNacimiento: string | null | undefined,
): boolean {
  const edad = edadEnAnios(fechaNacimiento);
  return edad !== null && edad >= EDAD_MINIMA;
}

/**
 * Último día de nacimiento que YA cumple 18 — para el `max` del campo de
 * fecha, que así ni siquiera deja elegir un día inválido en el calendario.
 */
export function fechaMaximaParaSerMayor(): string {
  const [y, m, d] = hoyEnMexico().split("-").map(Number);
  return `${y - EDAD_MINIMA}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Fecha de nacimiento que codifica la CURP (posiciones 5-10, AAMMDD).
 *
 * El siglo no viene en la CURP: se decide por el carácter 17, que es dígito
 * para quienes nacieron en el siglo XX y letra para el XXI (regla del RENAPO).
 * Devuelve null si no se puede leer.
 */
export function fechaDeNacimientoDeCurp(curp: string): string | null {
  const c = (curp ?? "").trim().toUpperCase();
  if (c.length < 18) return null;
  const aa = c.slice(4, 6);
  const mm = c.slice(6, 8);
  const dd = c.slice(8, 10);
  if (!/^\d{6}$/.test(`${aa}${mm}${dd}`)) return null;
  const siglo = /\d/.test(c[16]) ? "19" : "20";
  const fecha = `${siglo}${aa}-${mm}-${dd}`;
  const [y, m, d] = fecha.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Rebote de mes (31 de febrero y compañía) = CURP mal escrita
  const prueba = new Date(Date.UTC(y, m - 1, d));
  if (prueba.getUTCMonth() !== m - 1 || prueba.getUTCDate() !== d) return null;
  return fecha;
}
