"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestCenterDeactivation } from "./actions";

/** Baja voluntaria del centro aliado (equipo, 5-ago). */
export function BajaVoluntariaCard({ centerName }: { centerName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] border-[1.5px] border-[#F2C7D4] bg-white p-5">
      <span className="text-[11px] font-extrabold tracking-[.06em] text-error-text">
        DARME DE BAJA COMO CENTRO ALIADO
      </span>
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] leading-normal text-ink-secondary">
            {centerName} saldría del directorio de centros aliados de
            inmediato. Puedes volver a solicitar tu ingreso cuando quieras.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-none rounded-full border-[1.5px] border-[#F2C7D4] px-4 py-2 text-[12.5px] font-bold text-error-text transition-colors hover:bg-error-bg"
          >
            Darme de baja…
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Cuéntanos el motivo (nos ayuda a mejorar la red)…"
            className="rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-body outline-none focus:border-teal"
          />
          {error && (
            <span className="text-xs font-semibold text-error-text">{error}</span>
          )}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-bold text-ink-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending || reason.trim().length < 5}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await requestCenterDeactivation(reason.trim());
                  if ("error" in res && res.error) setError(res.error);
                  else router.refresh();
                })
              }
              className="rounded-full bg-error-text px-4 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Procesando…" : "Confirmar baja"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
