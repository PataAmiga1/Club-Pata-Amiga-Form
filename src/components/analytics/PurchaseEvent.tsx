"use client";

import { useEffect } from "react";
import { registrarCompra } from "@/lib/analytics";

/**
 * Dispara la compra en GA4 y Meta con el monto REAL del cobro.
 *
 * Dos cuidados que importan para que los reportes sirvan:
 *  · El valor viene de Stripe (`amount_total`), no de una constante: con un
 *    monto fijo, cualquier cambio de precio o cupón hace mentir al reporte.
 *  · Se manda UNA vez por cobro. Recargar la pantalla de bienvenida (o
 *    volver a ella) no puede inflar las conversiones, así que se marca el id
 *    de la transacción en sessionStorage.
 */
export function PurchaseEvent({
  montoCentavos,
  moneda,
  transaccion,
  plan,
}: {
  montoCentavos: number;
  moneda: string;
  transaccion: string;
  plan?: string;
}) {
  useEffect(() => {
    if (!transaccion || montoCentavos <= 0) return;
    const llave = `compra-medida:${transaccion}`;
    try {
      if (sessionStorage.getItem(llave)) return;
      sessionStorage.setItem(llave, "1");
    } catch {
      // Navegador sin sessionStorage: se mide igual, sin la protección
    }
    registrarCompra({ montoCentavos, moneda, transaccion, plan });
  }, [montoCentavos, moneda, transaccion, plan]);

  return null;
}
