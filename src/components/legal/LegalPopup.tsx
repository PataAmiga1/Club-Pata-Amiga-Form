"use client";

import { useEffect, useRef } from "react";
import { LEGAL_DOCS } from "@/lib/site";
import { LEGAL_TEXTS } from "@/data/legal-texts";
import { limpiarMarcasLegales } from "@/lib/legal-format";

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
 * - TODO EN UN SOLO SCROLL (equipo, 13-ago): antes cada documento vivía en su
 *   pestaña y había que descubrirlas. Ahora van uno tras otro en la misma
 *   lectura; el índice de arriba solo salta, no cambia de contenido, y quien
 *   abre desde "Términos y condiciones" aterriza en ese documento.
 */

export function LegalPopup({
  initialSlug,
  onClose,
}: {
  initialSlug: string;
  onClose: () => void;
}) {
  const docs = LEGAL_DOCS.filter((d) => LEGAL_TEXTS[d.slug]);
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

  /**
   * Lleva el scroll al inicio de un documento.
   *
   * Se mide con `getBoundingClientRect`, no con `offsetTop`: el contenedor que
   * scrollea es `position: static`, así que `offsetTop` se cuenta desde otro
   * ancestro y el salto caía en el lugar equivocado. Y sin `behavior:"smooth"`
   * a propósito — con 100 000 px de texto la animación no arrancaba y el
   * índice simplemente no hacía nada (probado en el navegador, 13-ago).
   */
  const irA = (slug: string) => {
    const caja = contentRef.current;
    const destino = caja?.querySelector(`[data-doc="${CSS.escape(slug)}"]`);
    if (!caja || !(destino instanceof HTMLElement)) return;
    caja.scrollTop +=
      destino.getBoundingClientRect().top - caja.getBoundingClientRect().top;
  };

  // La lectura empieza en el documento con el que se abrió (Términos, Aviso…),
  // no siempre arriba del todo.
  useEffect(() => {
    irA(initialSlug);
  }, [initialSlug]);

  if (docs.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Documentos legales"
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

        {/* Índice: salta dentro de la MISMA lectura, no cambia el contenido */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-border-divider px-5 py-3">
          <span className="text-[11.5px] font-bold uppercase tracking-[.06em] text-ink-tertiary">
            Ir a
          </span>
          {docs.map((d) => (
            <button
              key={d.slug}
              type="button"
              onClick={() => irA(d.slug)}
              className="text-[12.5px] font-semibold text-teal-deep underline decoration-teal/40 underline-offset-2 transition-colors hover:text-teal"
            >
              {d.title}
            </button>
          ))}
        </div>

        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6"
        >
          {docs.map((d, i) => (
            <section key={d.slug} data-doc={d.slug} className={i > 0 ? "mt-10" : ""}>
              {i > 0 && <hr className="mb-8 border-border-divider" />}
              <h2 className="mb-3 font-display text-[22px] text-ink-title">
                {d.title}
              </h2>
              <div className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-body">
                {limpiarMarcasLegales(LEGAL_TEXTS[d.slug])}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
