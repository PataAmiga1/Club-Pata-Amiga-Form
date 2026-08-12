"use client";

import { useEffect, useRef, useState } from "react";
import { LEGAL_DOCS } from "@/lib/site";
import { LEGAL_TEXTS } from "@/data/legal-texts";

/**
 * Popup de documentos legales (equipo, 10-ago): en el flujo de registro los
 * términos y el aviso NO navegan a otra página ni se descargan — se leen en
 * un popup que trae TODOS los documentos legales.
 *
 * - Solo lista documentos que ya tienen texto (mismo criterio que el pie del
 *   landing: los pendientes de legal no aparecen).
 * - Se carga con `next/dynamic` desde quien lo abre: los textos pesan mucho
 *   (~miles de líneas) y no deben viajar con la página de registro.
 * - "No se pueden descargar": no hay botón de descarga ni liga externa; el
 *   texto se lee aquí mismo.
 */
export function LegalPopup({
  initialSlug,
  onClose,
}: {
  initialSlug: string;
  onClose: () => void;
}) {
  const docs = LEGAL_DOCS.filter((d) => LEGAL_TEXTS[d.slug]);
  const [slug, setSlug] = useState(initialSlug);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // El fondo no debe scrollear mientras el popup está abierto
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Al cambiar de documento, la lectura empieza desde arriba
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [slug]);

  const active = docs.find((d) => d.slug === slug) ?? docs[0];
  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={active.title}
        className="flex h-[88dvh] w-full max-w-[860px] flex-col overflow-hidden rounded-[20px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-divider px-5 py-3.5">
          <span className="font-display text-[17px] text-ink-title">
            Documentos legales
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-9 flex-none place-items-center rounded-full bg-cream text-[15px] font-bold text-ink-secondary transition-colors hover:bg-border-divider"
          >
            ✕
          </button>
        </div>

        {/* Todos los documentos, cambiables sin salir del popup */}
        <div className="flex gap-2 overflow-x-auto border-b border-border-divider px-5 py-3">
          {docs.map((d) => (
            <button
              key={d.slug}
              type="button"
              onClick={() => setSlug(d.slug)}
              className={`flex-none rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
                d.slug === active.slug
                  ? "bg-teal text-white"
                  : "bg-cream text-ink-secondary hover:bg-border-divider"
              }`}
            >
              {d.title}
            </button>
          ))}
        </div>

        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6"
        >
          <h2 className="mb-3 font-display text-[22px] text-ink-title">
            {active.title}
          </h2>
          <div className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-body">
            {LEGAL_TEXTS[active.slug]}
          </div>
        </div>
      </div>
    </div>
  );
}
