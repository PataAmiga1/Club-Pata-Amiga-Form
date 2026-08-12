"use client";

import { useState } from "react";
import Link from "next/link";
import { reportEmergency } from "@/app/app/actions";

/**
 * Botón de emergencia para miembros con membresía activa. Al abrirlo:
 * registra el evento y avisa al equipo (correo inmediato), y muestra la
 * guía con el teléfono de emergencia (editable en Admin → Sitio web).
 */
export function EmergencyButton({ phone }: { phone: string }) {
  const [open, setOpen] = useState(false);
  const [notified, setNotified] = useState(false);

  async function handleOpen() {
    setOpen(true);
    if (!notified) {
      setNotified(true);
      // El aviso al equipo sale en cuanto se abre — sin esperar más taps
      reportEmergency().catch(() => {});
    }
  }

  const telHref = phone ? `tel:${phone.replace(/\s/g, "")}` : null;

  return (
    <>
      {/* Solo el icono (equipo, 12-ago): las pastillas flotantes con texto
          tapaban el contenido. El nombre vive en aria-label y en el tooltip,
          así que se sigue anunciando en lectores de pantalla. */}
      <button
        type="button"
        onClick={handleOpen}
        className="fixed bottom-[92px] right-4 z-30 grid size-14 place-items-center rounded-full bg-[#D93025] text-[22px] text-white shadow-[0_6px_20px_rgba(217,48,37,.4)] transition-transform hover:scale-105 md:bottom-6 md:right-6"
        aria-label="Emergencia"
        title="Emergencia"
      >
        <span aria-hidden>🚨</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-teal-dark/40 p-5 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Emergencia"
        >
          <div
            className="flex w-full max-w-[440px] flex-col gap-4 rounded-[24px] bg-white p-7 shadow-[0_24px_60px_rgba(30,83,80,.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-[36px]" aria-hidden>
                🚨
              </span>
              <h2 className="font-display text-[24px] leading-tight text-ink-title">
                Emergencia con tu peludo
              </h2>
            </div>
            <ol className="flex flex-col gap-2.5 text-[14px] leading-relaxed text-ink-body">
              <li>
                <strong>1. Mantén la calma</strong> y pon a tu peludo en un
                lugar seguro.
              </li>
              <li>
                <strong>2. Llama a tu veterinario de confianza</strong> o al
                centro aliado más cercano — en una emergencia, el tiempo es lo
                más importante.
              </li>
              <li>
                <strong>3. Guarda tus facturas:</strong> los gastos de urgencia
                aplican para reintegro si el período de espera de tu peludo ya
                se cumplió.
              </li>
            </ol>
            {telHref ? (
              <a
                href={telHref}
                className="grid h-[52px] place-items-center rounded-full bg-[#D93025] text-base font-bold text-white transition-opacity hover:opacity-90"
              >
                📞 Llamar a emergencias: {phone}
              </a>
            ) : (
              <Link
                href="/app/vet"
                className="grid h-[52px] place-items-center rounded-full bg-teal text-base font-bold text-white transition-colors hover:bg-teal-deep"
                onClick={() => setOpen(false)}
              >
                💬 Orientación veterinaria 24/7
              </Link>
            )}
            <p className="text-[12.5px] leading-normal text-ink-tertiary">
              Ya avisamos al equipo de Pata Amiga — te contactarán para
              acompañarte. También tienes la orientación veterinaria 24/7 en tu
              panel.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="self-center text-[13px] font-semibold text-ink-secondary hover:text-ink-title"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
