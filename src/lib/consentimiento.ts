/**
 * Consentimiento de cookies.
 *
 * La política de cookies (sección 5) PROMETE un banner: «Al entrar a
 * https://www.pataamiga.mx/ se mostrará un banner/centro de preferencias». Este
 * archivo es la mitad que hacía falta para que esa promesa sea cierta.
 *
 * La regla dura: **mientras no haya un "sí" explícito, no se carga ningún
 * rastreador**. Ni GA4, ni el píxel de Meta, ni Clarity. Un banner que solo
 * avisa mientras los scripts ya cargaron no sirve de nada — es exactamente el
 * patrón que la política dice que NO usamos.
 *
 * Lo estrictamente necesario (sesión de Supabase, seguridad de Stripe, hosting)
 * no pasa por aquí: sin eso el sitio no opera y la propia política lo dice.
 */

export type Consentimiento = "aceptado" | "rechazado";

export const LLAVE_CONSENTIMIENTO = "pa-cookies-v1";

/** Se dispara al guardar, para que la medición reaccione sin recargar. */
export const EVENTO_CONSENTIMIENTO = "pa-consentimiento";

export function leerConsentimiento(): Consentimiento | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LLAVE_CONSENTIMIENTO);
    return v === "aceptado" || v === "rechazado" ? v : null;
  } catch {
    // Safari en privado y algunos bloqueadores tiran al tocar localStorage.
    // Ante la duda: no hay consentimiento, así que no se mide.
    return null;
  }
}

export function guardarConsentimiento(valor: Consentimiento) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LLAVE_CONSENTIMIENTO, valor);
  } catch {
    // Si no se puede guardar, al menos la decisión vale para esta pestaña.
  }
  window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMIENTO, { detail: valor }));
}

/**
 * Borra la decisión para que el banner vuelva a preguntar. Es lo que necesita
 * el enlace «Configurar cookies» que la política promete en el pie de página.
 */
export function reabrirConsentimiento() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LLAVE_CONSENTIMIENTO);
  } catch {
    /* nada que hacer */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMIENTO, { detail: null }));
}
