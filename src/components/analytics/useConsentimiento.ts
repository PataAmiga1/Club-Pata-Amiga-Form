"use client";

import { useSyncExternalStore } from "react";
import {
  EVENTO_CONSENTIMIENTO,
  leerConsentimiento,
  type Consentimiento,
} from "@/lib/consentimiento";

/**
 * La decisión de cookies leída como lo que es: un estado que vive FUERA de
 * React (en localStorage) y que puede cambiar desde otra pestaña.
 *
 * Por eso `useSyncExternalStore` y no un `useState` + `useEffect`: React lee la
 * fuente cuando la necesita en vez de copiarla a un estado que puede quedar
 * desfasado, y en el servidor devuelve `null` — es decir, no medir — que es el
 * valor correcto por omisión.
 */
export function useConsentimiento(): Consentimiento | null {
  return useSyncExternalStore(suscribir, leerConsentimiento, () => null);
}

function suscribir(alCambiar: () => void) {
  window.addEventListener(EVENTO_CONSENTIMIENTO, alCambiar);
  // Si la persona decide en otra pestaña, esta se entera.
  window.addEventListener("storage", alCambiar);
  return () => {
    window.removeEventListener(EVENTO_CONSENTIMIENTO, alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}
