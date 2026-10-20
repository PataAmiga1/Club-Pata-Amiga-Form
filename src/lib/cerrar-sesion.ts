/**
 * Cerrar sesión de verdad, aunque Supabase no conteste (20-oct-2026).
 *
 * Antes se hacía `await supabase.auth.signOut()` + `router.push`. Si el token
 * ya había vencido (pestaña abierta más de una hora) y el refresco previo al
 * logout fallaba, supabase-js devolvía el error SIN borrar la cookie: el botón
 * se quedaba en «Cerrando…» o llevaba al login con la sesión todavía viva.
 *
 * Ahora:
 *  1. el servidor revoca la sesión y borra las cookies (`/auth/cerrar-sesion`),
 *  2. aquí se borran también las cookies `sb-*` del navegador —no son
 *     HttpOnly, así que esto no depende de la red—,
 *  3. navegación completa (`window.location.assign`, igual que en el login):
 *     el servidor ya recibe la petición sin cookie y no queda caché del router.
 *
 * Nunca lanza: pase lo que pase, termina navegando.
 */
export async function cerrarSesion(destino = "/iniciar-sesion"): Promise<void> {
  try {
    await fetch("/auth/cerrar-sesion", {
      method: "POST",
      credentials: "same-origin",
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // Sin red o tardó demasiado: igual se borra la sesión local abajo.
  }

  try {
    for (const par of document.cookie.split(";")) {
      const nombre = par.split("=")[0]?.trim();
      if (nombre?.startsWith("sb-")) {
        document.cookie = `${nombre}=; path=/; max-age=0; samesite=lax`;
      }
    }
  } catch {
    // document.cookie no debería fallar; si falla, el servidor ya las borró.
  }

  window.location.assign(destino);
}
