"use client";

import { useState, useTransition } from "react";
import { sincronizarPlantillasDeFlowly } from "@/app/ventas/plantillas/actions";

/** Botón para traer de Flowly las plantillas de WhatsApp y su estado actual. */
export function SincronizarFlowly() {
  const [pendiente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          startTransition(async () => {
            const res = await sincronizarPlantillasDeFlowly();
            setAviso(res.ok ? res.aviso : (res.error ?? "No se pudo sincronizar."));
          })
        }
        className="rounded-full border-[1.5px] border-border-input px-3 py-1.5 text-[11.5px] font-bold text-teal-deep hover:border-teal disabled:opacity-60"
      >
        {pendiente ? "Sincronizando…" : "Sincronizar con Flowly"}
      </button>
      {aviso && <span className="text-[11.5px] text-ink-secondary">{aviso}</span>}
    </div>
  );
}
