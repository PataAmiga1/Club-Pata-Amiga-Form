"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmarGarantia, rechazarGarantia } from "./actions";

export function GarantiaAcciones({ id, monto }: { id: string; monto: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [modo, setModo] = useState<"nada" | "confirmar" | "rechazar">("nada");
  const [notas, setNotas] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const correr = (accion: () => Promise<{ ok?: true; error?: string }>) =>
    startTransition(async () => {
      setAviso(null);
      const r = await accion();
      if (r.error) setAviso(r.error);
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-2">
      {aviso && (
        <span className="rounded-[10px] bg-error-bg px-3 py-2 text-[12.5px] font-semibold text-error-text">
          {aviso}
        </span>
      )}
      {modo === "nada" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModo("confirmar")}
            className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep"
          >
            Confirmar y reembolsar…
          </button>
          <button
            type="button"
            onClick={() => setModo("rechazar")}
            className="rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-bold text-ink-secondary"
          >
            Rechazar…
          </button>
        </div>
      )}
      {modo === "confirmar" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-ink-body">
            Se reembolsan <strong>{monto}</strong> (recalculado al confirmar) y se cancela esta membresía hoy.
          </span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => confirmarGarantia(id))}
            className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
          >
            {pendiente ? "Reembolsando…" : "Sí, reembolsar"}
          </button>
          <button type="button" onClick={() => setModo("nada")} className="text-[12.5px] font-bold text-ink-secondary">
            Cancelar
          </button>
        </div>
      )}
      {modo === "rechazar" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Motivo (se le enseña a la persona)"
            className="h-9 min-w-0 flex-1 rounded-full border-[1.5px] border-border-input px-3 text-[12.5px] outline-none focus:border-teal"
          />
          <button
            type="button"
            disabled={pendiente || !notas.trim()}
            onClick={() => correr(() => rechazarGarantia(id, notas))}
            className="rounded-full bg-error-bg px-4 py-2 text-[12.5px] font-bold text-error-text disabled:opacity-50"
          >
            Rechazar
          </button>
          <button type="button" onClick={() => setModo("nada")} className="text-[12.5px] font-bold text-ink-secondary">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
