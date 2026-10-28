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

/**
 * Copia de la decisión en una cookie, para que el SERVIDOR también la conozca.
 *
 * localStorage no viaja en las peticiones, y la API de Conversiones de Meta se
 * manda desde el servidor (registro del peludo, webhook de Stripe): sin esta
 * cookie el servidor no tendría cómo saber si la persona aceptó y mandaría (o
 * dejaría de mandar) a ciegas. Solo existe con un «sí»; con un «no» o al
 * reabrir el banner, se borra. Ver `src/lib/medicion/consentimiento-servidor.ts`.
 */
export const COOKIE_MEDICION = "pa_medicion";

/** Pone (o quita) la cookie espejo según la decisión guardada. */
export function sincronizarCookieMedicion(valor: Consentimiento | null) {
  if (typeof document === "undefined") return;
  try {
    const seguro = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      valor === "aceptado"
        ? `${COOKIE_MEDICION}=1; Max-Age=${395 * 86_400}; Path=/; SameSite=Lax${seguro}`
        : `${COOKIE_MEDICION}=; Max-Age=0; Path=/; SameSite=Lax${seguro}`;
  } catch {
    // Cookies bloqueadas: el servidor no mide, que es lo seguro.
  }
}

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
  sincronizarCookieMedicion(valor);
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
  sincronizarCookieMedicion(null);
  window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMIENTO, { detail: null }));
}
