"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export type DashboardEntry = {
  href: string;
  icon: string;
  label: string;
};

/**
 * Avatar con menú (estilo Instagram): un toque en la inicial y puedes
 * cambiar de panel (miembro / embajador / centro), ir a tus ajustes o
 * cerrar sesión. Se usa en el top bar móvil del área de miembros y en los
 * headers de los dashboards de embajador y centro.
 */
export function ProfileMenu({
  initial,
  avatarUrl = null,
  color = "bg-teal",
  entries,
  settingsHref,
}: {
  initial: string;
  /** Foto de perfil (equipo, 11-ago) — si no hay, se muestra la inicial. */
  avatarUrl?: string | null;
  color?: string;
  /** Otros paneles disponibles para esta cuenta */
  entries: DashboardEntry[];
  settingsHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/");
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tu cuenta"
        aria-expanded={open}
        className={`grid size-[38px] place-items-center overflow-hidden rounded-full text-sm font-bold text-white ${color}`}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 flex w-[230px] flex-col overflow-hidden rounded-[16px] border-[1.5px] border-border-input bg-white py-1.5 shadow-[0_12px_32px_rgba(30,83,80,.18)]">
          {entries.length > 0 && (
            <>
              <span className="px-4 pb-1 pt-1.5 text-[10.5px] font-extrabold tracking-[.06em] text-ink-placeholder">
                CAMBIAR DE PANEL
              </span>
              {entries.map((e) => (
                <Link
                  key={e.href}
                  href={e.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] font-semibold text-ink-body hover:bg-cream"
                >
                  <span aria-hidden>{e.icon}</span>
                  {e.label}
                </Link>
              ))}
              <div className="mx-4 my-1 h-px bg-border-divider" />
            </>
          )}
          {settingsHref && (
            <Link
              href={settingsHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] font-semibold text-ink-body hover:bg-cream"
            >
              <span aria-hidden>⚙️</span>
              Mi cuenta
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] font-semibold text-error-text hover:bg-error-bg"
          >
            <span aria-hidden>👋</span>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
