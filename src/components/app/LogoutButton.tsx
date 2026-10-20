"use client";

import { useState } from "react";
import { cerrarSesion } from "@/lib/cerrar-sesion";

/**
 * Cerrar sesión (servidor + cookies locales + navegación completa al login;
 * ver src/lib/cerrar-sesion.ts).
 * variant: "sidebar" (link del menú lateral del miembro) ·
 * "admin" (menú lateral teal oscuro) · "button" (botón en Mi cuenta).
 */
export function LogoutButton({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "admin" | "button";
}) {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    await cerrarSesion("/iniciar-sesion");
  };

  const cls =
    variant === "admin"
      ? "flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] font-semibold text-white/75 transition-colors hover:bg-white/[.06] disabled:opacity-60"
      : variant === "button"
        ? "grid h-11 place-items-center rounded-full border-[1.5px] border-border-input px-6 text-[13px] font-semibold text-ink-secondary transition-colors hover:border-error-text hover:text-error-text disabled:opacity-60"
        : "flex items-center gap-3 rounded-[12px] px-3.5 py-[11px] text-sm font-semibold text-[#5B6B68] transition-colors hover:bg-cream disabled:opacity-60";

  return (
    <button type="button" onClick={logout} disabled={busy} className={cls}>
      {variant !== "button" && <span aria-hidden>👋</span>}
      {busy ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}
