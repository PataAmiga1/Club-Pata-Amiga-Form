"use client";

import { useEffect } from "react";
import { LLAVE_PROMO_GUARDADA } from "@/lib/campanas/buen-fin";

/**
 * Se monta en la bienvenida SOLO con el pago confirmado por Stripe: ahí ya no
 * hacen falta la promoción, la modalidad ni el código de embajador que el
 * plan guardó. Antes se borraban al abrir el pago y quien se regresaba desde
 * Stripe los perdía (9-nov-2026).
 */
export function LimpiarCodigosGuardados() {
  useEffect(() => {
    try {
      window.localStorage.removeItem(LLAVE_PROMO_GUARDADA);
      window.localStorage.removeItem("pa_ambassador_code");
    } catch {
      // Sin localStorage no hay nada que limpiar.
    }
  }, []);
  return null;
}
