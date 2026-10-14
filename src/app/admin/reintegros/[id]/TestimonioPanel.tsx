"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pedirTestimonioDeDespedida } from "@/app/admin/reintegros/pagos-actions";

/**
 * Testimonio (casos de éxito). Lo general sale solo; aquí solo se informa.
 * Despedida nunca es automática: el comité la manda con el botón.
 * `texto` y `tono` ya vienen armados desde el servidor.
 */
export function TestimonioPanel({
  reimbursementId,
  boton,
  texto,
  tono,
}: {
  reimbursementId: string;
  boton: boolean;
  texto: string | null;
  tono: "ok" | "info" | "aviso";
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const color =
    tono === "ok"
      ? "bg-success-bg text-success-text"
      : tono === "aviso"
        ? "bg-warning-bg text-warning-text"
        : "bg-info-bg text-info-text";

  return (
    <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
      <h2 className="font-display text-lg text-ink-title">Testimonio</h2>
      {texto && (
        <div className={`rounded-[12px] px-4 py-3 text-[13px] font-semibold ${color}`}>{texto}</div>
      )}
      {boton && (
        <>
          <p className="text-[12.5px] text-ink-secondary">
            Reintegro de despedida: el testimonio nunca se pide solo. Si el momento es
            adecuado, manda el correo cuidadoso (video cortito o nota de voz, contestando a
            miembros@pataamiga.mx). Se pide una sola vez por miembro.
          </p>
          {error && <span className="text-[12.5px] font-bold text-error-text">{error}</span>}
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  const r = await pedirTestimonioDeDespedida(reimbursementId);
                  if ("error" in r && r.error) setError(r.error);
                  router.refresh();
                } catch {
                  setError("No se pudo enviar. Intenta de nuevo.");
                }
              })
            }
            className="grid h-10 place-items-center self-start rounded-full border-[1.5px] border-teal px-5 text-[13px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white disabled:opacity-50"
          >
            {pendiente ? "Enviando…" : "Pedir testimonio"}
          </button>
        </>
      )}
    </div>
  );
}
