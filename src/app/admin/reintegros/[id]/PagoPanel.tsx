"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarPagoDeReintegro } from "@/app/admin/reintegros/pagos-actions";
import { formatMxn } from "@/lib/format";

/**
 * «Registrar pago» (13-oct-2026). Visible cuando la solicitud está aprobada o
 * parcial; ya pagada, enseña cuándo y con qué referencia.
 */
export function PagoPanel({
  reimbursementId,
  status,
  monto,
  hoy,
  pagadoEl,
  referencia,
  nota,
}: {
  reimbursementId: string;
  status: string;
  monto: number;
  /** yyyy-mm-dd en México, para el valor inicial y el máximo del calendario. */
  hoy: string;
  /** Texto ya formateado («13 de octubre de 2026») si está pagada. */
  pagadoEl: string | null;
  referencia: string | null;
  nota: string | null;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [fecha, setFecha] = useState(hoy);
  const [ref, setRef] = useState("");
  const [notaNueva, setNotaNueva] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status === "paid")
    return (
      <div className="flex flex-col gap-2 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <h2 className="font-display text-lg text-ink-title">Pago</h2>
        <div className="rounded-[12px] bg-success-bg px-4 py-3 text-[13px] font-semibold text-success-text">
          ✓ Pagado el {pagadoEl ?? "—"} · {formatMxn(monto)} MXN
          {referencia ? ` · ref ${referencia}` : ""}
        </div>
        {nota && <p className="text-[12.5px] text-ink-secondary">Nota: {nota}</p>}
      </div>
    );

  if (status !== "approved" && status !== "partial") return null;

  const campo =
    "h-11 w-full rounded-[12px] border-[1.5px] border-border-input px-3.5 text-sm text-ink-title outline-none focus:border-teal";

  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
      <h2 className="font-display text-lg text-ink-title">Registrar pago</h2>
      <p className="text-[12.5px] text-ink-secondary">
        Cuando la transferencia de {formatMxn(monto)} MXN ya salió del banco. Al guardar, el
        miembro recibe el aviso y la solicitud deja de salir en el layout bancario.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-semibold text-ink-title">Fecha del depósito</span>
        <input
          type="date"
          value={fecha}
          max={hoy}
          onChange={(e) => setFecha(e.target.value)}
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-semibold text-ink-title">
          Clave de rastreo SPEI <span className="font-normal text-ink-tertiary">(opcional)</span>
        </span>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          maxLength={60}
          placeholder="Ej. MBAN01002610130000123"
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-semibold text-ink-title">
          Nota interna <span className="font-normal text-ink-tertiary">(opcional)</span>
        </span>
        <textarea
          value={notaNueva}
          onChange={(e) => setNotaNueva(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full rounded-[12px] border-[1.5px] border-border-input px-3.5 py-2.5 text-sm text-ink-title outline-none focus:border-teal"
        />
      </label>
      {error && <span className="text-[12.5px] font-bold text-error-text">{error}</span>}
      <button
        type="button"
        disabled={pendiente || !fecha}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const r = await registrarPagoDeReintegro(reimbursementId, {
                fecha,
                referencia: ref,
                nota: notaNueva,
              });
              if ("error" in r && r.error) setError(r.error);
              else router.refresh();
            } catch {
              setError("No se pudo registrar el pago. Intenta de nuevo.");
            }
          })
        }
        className="grid h-11 place-items-center rounded-full bg-teal px-6 text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
      >
        {pendiente ? "Registrando…" : "Registrar pago"}
      </button>
    </div>
  );
}
