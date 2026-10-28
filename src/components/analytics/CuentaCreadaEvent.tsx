"use client";

import { useEffect } from "react";
import { registrarCuentaCreada } from "@/lib/analytics";
import { idCuentaCreada } from "@/lib/medicion/eventos";
import { leerConsentimiento } from "@/lib/consentimiento";

/**
 * Lead: la cuenta recién creada. Se pinta en el paso del peludo, que es la
 * primera pantalla que ve TODA cuenta nueva (correo, correo confirmado en otro
 * dispositivo, Google), y el servidor solo lo monta si la cuenta tiene menos de
 * un día. Una vez por persona y navegador (localStorage), para que volver al
 * paso no infle los leads.
 */
export function CuentaCreadaEvent({ userId, metodo }: { userId: string; metodo: string }) {
  useEffect(() => {
    // Sin «sí» no se mide ni se marca: si acepta después, aún cuenta.
    if (leerConsentimiento() !== "aceptado") return;
    const llave = `lead-medido:${userId}`;
    try {
      if (localStorage.getItem(llave)) return;
      localStorage.setItem(llave, "1");
    } catch {
      // Sin localStorage: se mide igual, sin la protección
    }
    registrarCuentaCreada({ eventoId: idCuentaCreada(userId), metodo });
  }, [userId, metodo]);
  return null;
}
