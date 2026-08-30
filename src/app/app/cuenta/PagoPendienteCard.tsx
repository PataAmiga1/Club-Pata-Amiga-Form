"use client";

import { useState } from "react";

/**
 * Aviso de pago pendiente, con la salida (29-ago).
 *
 * POR QUÉ EXISTE. Cuando a alguien le fallaba la renovación, la plataforma
 * marcaba la membresía en mora, le avisaba a ventas y a la persona NO le decía
 * nada — y de pilón su pantalla de Mi cuenta consultaba solo suscripciones
 * activas, así que veía su cuenta como si no tuviera membresía. Sin aviso, sin
 * forma de cambiar la tarjeta y con la cuenta en blanco, el único camino que
 * quedaba era volver a contratar: eso produjo un cobro duplicado real.
 *
 * Esta tarjeta cierra el hueco por el lado del miembro: le dice qué pasó, que
 * NO tiene que contratar de nuevo, y lo lleva al portal de Stripe a actualizar
 * su tarjeta. El cobro se reintenta solo.
 */
export function PagoPendienteCard() {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrirPortal = async () => {
    setError(null);
    setAbriendo(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "No pudimos abrir el portal de pagos.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("No pudimos abrir el portal de pagos. Intenta de nuevo.");
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] border-[1.5px] border-warning-text/30 bg-warning-bg p-5">
      <span className="text-[13px] font-extrabold tracking-[.06em] text-warning-text">
        TU ÚLTIMO PAGO NO SE PUDO COBRAR
      </span>
      <p className="text-[13.5px] leading-relaxed text-ink-body">
        Tu membresía sigue siendo tuya y tus peludos siguen registrados.{" "}
        <strong>No hace falta que contrates de nuevo</strong> — solo actualiza
        tu método de pago y el cobro se reintenta solo.
      </p>
      <button
        type="button"
        onClick={abrirPortal}
        disabled={abriendo}
        className="mt-1 grid h-11 place-items-center self-start rounded-full bg-teal px-5 text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
      >
        {abriendo ? "Abriendo…" : "Actualizar mi método de pago"}
      </button>
      {error && (
        <span className="text-[12.5px] font-semibold text-error-text">
          {error}
        </span>
      )}
    </div>
  );
}
