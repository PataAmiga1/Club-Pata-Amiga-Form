"use client";

import { useAhora } from "@/lib/hooks";
import { tiempoParaElCierre } from "@/lib/campanas/buen-fin";

/**
 * Lo que falta para que cierre la promoción, al minuto. La fecha de cierre
 * sale de `zona-horaria` (17-nov 23:59 de México); en el servidor no hay
 * reloj, así que se pinta la fecha fija y al hidratar cambia a la cuenta.
 */
export function CuentaRegresiva({ compacta = false }: { compacta?: boolean }) {
  const ahora = useAhora();
  const falta = ahora ? tiempoParaElCierre(ahora) : null;
  if (!ahora || !falta)
    return <span>Termina el martes 17 de noviembre a las 23:59 h</span>;
  const partes = [
    falta.dias ? `${falta.dias} ${falta.dias === 1 ? "día" : "días"}` : null,
    `${falta.horas} h`,
    `${falta.minutos} min`,
  ].filter(Boolean);
  return (
    <span aria-live="polite">
      {compacta ? "Termina en " : "La promoción termina en "}
      <strong className="tabular-nums">{partes.join(" ")}</strong>
    </span>
  );
}
