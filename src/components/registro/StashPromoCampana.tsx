"use client";

import { useEffect } from "react";
import { LLAVE_PROMO_GUARDADA, promoDeLaUrl } from "@/lib/campanas/buen-fin";

/**
 * Las landings de campaña (El Buen Fin) llegan a /registro?modalidad=…&promo=…
 * pero el pago está dos pasos después: se guarda para que el plan preseleccione
 * la modalidad y aplique la promoción. Mismo patrón que `StashAmbassadorCode`,
 * con OTRO parámetro a propósito: `codigo` es el del embajador.
 */
export function StashPromoCampana() {
  useEffect(() => {
    const guardada = promoDeLaUrl(window.location.search);
    if (!guardada) return;
    try {
      window.localStorage.setItem(LLAVE_PROMO_GUARDADA, JSON.stringify(guardada));
    } catch {
      // Sin localStorage: la persona escribe el código en el plan o en Stripe.
    }
  }, []);
  return null;
}
