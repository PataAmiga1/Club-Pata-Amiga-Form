/**
 * RFC (Registro Federal de Contribuyentes).
 *
 * Persona física: 4 letras + 6 dígitos de fecha + 3 de homoclave.
 * Persona moral: 3 letras + 6 dígitos + 3 de homoclave.
 *
 * Vive aparte desde el 13-ago: el RFC se pide en la tarjeta de datos de pago
 * del embajador y también lo valida el guardado de redes, así que el patrón
 * tenía que dejar de estar copiado en dos lugares.
 */
export const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export function esRfcValido(rfc: string | null | undefined): boolean {
  if (!rfc) return false;
  return RFC_REGEX.test(rfc.trim().toUpperCase());
}

/** RFC de PERSONA MORAL: 12 caracteres (3 letras + fecha + homoclave). */
export const RFC_MORAL_REGEX = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;

/**
 * ¿Es el RFC de una persona moral y no el de una física?
 *
 * Se comprueba aparte desde el 25-ago porque el alta de persona moral pide el
 * RFC de la ENTIDAD: si alguien escribe ahí su RFC personal —13 caracteres— la
 * constancia que suba no va a corresponder con la razón social, y el comité lo
 * descubre hasta la revisión. Vale más decirlo en el formulario.
 */
export function esRfcDeMoral(rfc: string | null | undefined): boolean {
  if (!rfc) return false;
  return RFC_MORAL_REGEX.test(rfc.trim().toUpperCase());
}
