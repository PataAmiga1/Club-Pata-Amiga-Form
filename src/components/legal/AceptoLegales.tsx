"use client";

import { useState } from "react";
import { LegalPopup } from "./LegalPopup";

/**
 * Casilla de aceptación de los legales, antes de pagar (8-oct-2026).
 *
 * Va en las tres pantallas que abren un cobro (alta del $599, alta del $159 y
 * activar la membresía de otro peludo). Sin marcarla el botón de pagar no se
 * habilita y la ruta de pago tampoco abre el cobro; al marcarla y pagar queda
 * el registro en `legal_acceptances` (src/lib/legal/aceptacion.ts).
 *
 * Las ligas abren el mismo popup del registro: se leen aquí, sin salir del pago.
 * Un botón dentro del <label> no marca la casilla al tocarlo — así está hecho
 * en HTML —, así que leer un documento no cuenta como aceptarlo.
 */
export function AceptoLegales({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const liga = (s: string, texto: string) => (
    <button type="button" onClick={() => setSlug(s)} className="font-semibold text-teal-deep underline">
      {texto}
    </button>
  );

  return (
    <>
      <label
        htmlFor={id}
        className="flex items-start gap-2.5 text-left text-[13px] leading-snug text-ink-body"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-[18px] flex-none accent-teal"
        />
        <span>
          He leído y acepto los {liga("terminos-y-condiciones", "Términos y condiciones")}, el{" "}
          {liga("reglamento-de-reintegros", "Reglamento de reintegros")} y el{" "}
          {liga("aviso-de-privacidad", "Aviso de privacidad")}.
        </span>
      </label>
      {slug && <LegalPopup initialSlug={slug} onClose={() => setSlug(null)} />}
    </>
  );
}
