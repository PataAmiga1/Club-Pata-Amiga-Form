"use client";

import { medicionActiva } from "@/lib/analytics";
import { reabrirConsentimiento } from "@/lib/consentimiento";

/**
 * «Configurar cookies» del pie de página.
 *
 * La política de cookies promete que la elección se puede cambiar «en cualquier
 * momento». Sin este enlace, la única salida sería borrar los datos del sitio
 * desde el navegador — que es pedirle a la gente que sepa hacer algo que casi
 * nadie sabe hacer.
 *
 * Borra la decisión guardada y el banner vuelve a aparecer solo, porque los dos
 * leen la misma fuente.
 *
 * Si el equipo no ha configurado ninguna llave de medición, no hay nada que
 * configurar y el enlace no se pinta: prometer un ajuste que no existe es peor
 * que no ofrecerlo.
 */
export function ConfigurarCookies({ className }: { className?: string }) {
  if (!medicionActiva()) return null;

  return (
    <button type="button" onClick={reabrirConsentimiento} className={className}>
      Configurar cookies
    </button>
  );
}
