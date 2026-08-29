/**
 * Sexo de un miembro, para el padrón y las exportaciones (equipo, 26-ago).
 *
 * POR QUÉ NO BASTA CON LEER LA COLUMNA. `profiles.gender` existe desde el
 * inicio, pero está llena en 11 de 510 perfiles: nunca se pidió en el registro.
 * Una columna «sexo» que sale vacía en el 98% de los renglones no le sirve a
 * nadie para lo que la pidieron, que es cortar el padrón por sexo.
 *
 * DE DÓNDE SALE ENTONCES. La CURP lo trae en su carácter 11 —H o M, por
 * mandato del RENAPO— y 156 perfiles tienen CURP. Derivarlo de ahí sube la
 * cobertura de 11 a unos 160 sin pedirle nada a nadie ni inventar el dato:
 * la CURP es un documento oficial, no una suposición.
 *
 * EL ORDEN IMPORTA y es a propósito: gana lo que la persona capturó de su puño
 * sobre lo que dice su CURP. Quien eligió «prefiero no decir» tiene que seguir
 * saliendo así aunque su CURP diga otra cosa; lo contrario sería usar un
 * trámite para contradecir a alguien sobre sí mismo.
 */

export type Sexo = "Hombre" | "Mujer" | "Prefiere no decir" | "Sin dato";

/** De dónde salió el dato — el padrón lo muestra para que se pueda auditar. */
export type OrigenDelSexo = "capturado" | "curp" | "sin dato";

const CAPTURADO: Record<string, Sexo> = {
  hombre: "Hombre",
  mujer: "Mujer",
  "no-especificar": "Prefiere no decir",
};

/**
 * El carácter 11 de la CURP (índice 10) es H o M. Se comprueba la forma
 * completa antes de leerlo: una CURP a medio escribir puede tener una H o una
 * M en esa posición por casualidad.
 */
const CURP_CON_SEXO = /^[A-Z]{4}\d{6}([HM])[A-Z]{5}[A-Z0-9]\d$/;

export function sexoDeCurp(curp: string | null | undefined): Sexo | null {
  const m = CURP_CON_SEXO.exec((curp ?? "").trim().toUpperCase());
  if (!m) return null;
  return m[1] === "H" ? "Hombre" : "Mujer";
}

/** El sexo de un miembro y de dónde salió. */
export function sexoDeMiembro(
  gender: string | null | undefined,
  curp: string | null | undefined,
): { sexo: Sexo; origen: OrigenDelSexo } {
  const capturado = CAPTURADO[(gender ?? "").trim().toLowerCase()];
  if (capturado) return { sexo: capturado, origen: "capturado" };

  const deCurp = sexoDeCurp(curp);
  if (deCurp) return { sexo: deCurp, origen: "curp" };

  return { sexo: "Sin dato", origen: "sin dato" };
}
