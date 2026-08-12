"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { tiempoRelativo } from "@/lib/dates";
import { useAhora } from "@/lib/hooks";
import type { EventoAdmin } from "@/lib/admin/eventos";

/**
 * Campanita del panel de administración — arriba a la derecha, como la
 * prefería Lucero; Pablo decidió que las notificaciones viven AQUÍ y en la
 * barra lateral a la vez (11-ago). El globo lleva el total de pendientes
 * accionables (el mismo número que el contador de la barra), y el panel
 * lista la actividad reciente con enlaces al detalle.
 */
export function AdminBell({
  events,
  pending,
}: {
  events: EventoAdmin[];
  pending: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ahora = useAhora();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notificaciones${pending > 0 ? ` (${pending} pendientes)` : ""}`}
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-full bg-white/10 text-[16px] transition-colors hover:bg-white/20"
      >
        🔔
        {pending > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-orange px-1 text-[10px] font-extrabold text-white">
            {pending > 99 ? "99+" : pending}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[46px] z-50 flex w-[330px] flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_12px_40px_rgba(30,83,80,.22)] max-sm:fixed max-sm:inset-x-3 max-sm:top-[58px] max-sm:w-auto">
          <span className="border-b border-border-divider px-4 py-2.5 text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
            ACTIVIDAD RECIENTE
          </span>
          <div className="max-h-[380px] overflow-y-auto">
            {events.length === 0 && (
              <span className="block px-4 py-6 text-center text-[12.5px] text-ink-tertiary">
                Sin actividad reciente.
              </span>
            )}
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={ev.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 border-b border-[#F2EEE4] px-4 py-2.5 text-[12.5px] leading-snug text-ink-body last:border-0 hover:bg-cream-light"
              >
                <span aria-hidden className="mt-px flex-none">
                  {ev.icon}
                </span>
                <span className="min-w-0 flex-1">{ev.text}</span>
                <span className="flex-none text-[10.5px] text-ink-tertiary">
                  {tiempoRelativo(ev.created_at, ahora)}
                </span>
              </Link>
            ))}
          </div>
          <Link
            href="/admin/notificaciones"
            onClick={() => setOpen(false)}
            className="border-t border-border-divider px-4 py-2.5 text-center text-[12.5px] font-bold text-teal-deep hover:bg-cream-light"
          >
            Ver todas →
          </Link>
        </div>
      )}
    </div>
  );
}
