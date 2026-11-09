"use client";

import { useEffect, useRef } from "react";
import { registrarVistaDeContenido } from "@/lib/analytics";
import { useConsentimiento } from "@/components/analytics/useConsentimiento";

/**
 * ViewContent de la landing de El Buen Fin. Una vez por visita, y solo con un
 * «sí» a las cookies: si la persona acepta ya estando en la página, se manda en
 * ese momento. El PageView lo pone el píxel solo; los eventos de después (Lead,
 * CompleteRegistration, InitiateCheckout, Purchase) siguen saliendo de donde
 * siempre, así que aquí no se repite ninguno.
 */
export function VistaBuenFin({ estado }: { estado: string }) {
  const consentimiento = useConsentimiento();
  const medido = useRef(false);
  useEffect(() => {
    if (consentimiento !== "aceptado" || medido.current) return;
    medido.current = true;
    registrarVistaDeContenido({ nombre: "El Buen Fin 2026", categoria: estado });
  }, [consentimiento, estado]);
  return null;
}
