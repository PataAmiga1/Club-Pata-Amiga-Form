"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveReimbursement, bypassWaitingPeriod } from "@/app/admin/actions";
import { REJECTION_REASONS } from "@/lib/constants";
import { formatMxn } from "@/lib/format";

export function ResolutionPanel({
  reimbursementId,
  petId,
  status,
  amountRequested,
  amountApproved,
  rejectionReason,
  clabeLast4,
  isSuperAdmin,
  waitingDone,
}: {
  reimbursementId: string;
  petId: string;
  status: string;
  amountRequested: number;
  amountApproved: number | null;
  rejectionReason: string | null;
  clabeLast4: string;
  isSuperAdmin: boolean;
  waitingDone: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "partial" | "reject">("none");
  const [partialAmount, setPartialAmount] = useState("");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const open = status === "pending" || status === "in_review";

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch {
        setError("No se pudo guardar la resolución. Intenta de nuevo.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <h2 className="font-display text-lg text-ink-title">Resolución</h2>

        {!open ? (
          <div
            className={`rounded-[12px] px-4 py-3 text-sm font-semibold ${
              status === "rejected"
                ? "bg-error-bg text-error-text"
                : "bg-success-bg text-success-text"
            }`}
          >
            {status === "rejected"
              ? `Denegado · ${rejectionReason ?? ""}`
              : `Aprobado ${formatMxn(amountApproved ?? amountRequested)} MXN`}
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => resolveReimbursement(reimbursementId, { action: "approve" }))
              }
              className="grid h-12 place-items-center rounded-full bg-teal text-sm font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-60"
            >
              ✓ Aprobar {formatMxn(amountRequested)} MXN
            </button>

            {mode !== "partial" ? (
              <button
                type="button"
                onClick={() => setMode("partial")}
                className="grid h-11 place-items-center rounded-full border-[1.5px] border-border-input text-[13px] font-semibold text-ink-secondary transition-colors hover:border-teal"
              >
                Aprobar monto parcial…
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  inputMode="decimal"
                  placeholder={`Hasta ${formatMxn(amountRequested)}`}
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-full border-[1.5px] border-border-input px-4 text-sm text-ink-title outline-none focus:border-teal"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const amount = parseFloat(partialAmount.replace(/[^0-9.]/g, ""));
                    if (Number.isNaN(amount) || amount <= 0 || amount >= amountRequested) {
                      setError("Indica un monto menor al solicitado.");
                      return;
                    }
                    run(() =>
                      resolveReimbursement(reimbursementId, { action: "partial", amount }),
                    );
                  }}
                  className="grid h-11 flex-none place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white disabled:opacity-60"
                >
                  Aprobar
                </button>
              </div>
            )}

            {mode !== "reject" ? (
              <button
                type="button"
                onClick={() => setMode("reject")}
                className="grid h-11 place-items-center rounded-full border-[1.5px] border-[#F2C7D4] text-[13px] font-semibold text-error-text transition-colors hover:bg-error-bg"
              >
                Denegar…
              </button>
            ) : (
              <button
                type="button"
                disabled={pending || !reason}
                onClick={() =>
                  run(() =>
                    resolveReimbursement(reimbursementId, { action: "reject", reason }),
                  )
                }
                className="grid h-11 place-items-center rounded-full bg-error-text text-[13px] font-bold text-white disabled:opacity-50"
              >
                Confirmar denegación{reason ? `: ${reason}` : " (elige un motivo)"}
              </button>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-ink-tertiary">
                MOTIVOS PREDETERMINADOS (si deniegas)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {REJECTION_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setReason(r);
                      setMode("reject");
                    }}
                    className={`rounded-full border px-2.5 py-[5px] text-[11px] font-semibold transition-colors ${
                      reason === r
                        ? "border-error-text bg-error-bg text-error-text"
                        : "border-border-input text-ink-secondary hover:border-error-text"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-[11.5px] leading-normal text-ink-tertiary">
              Al aprobar se notifica al miembro y se programa la transferencia a
              CLABE ····{clabeLast4}.
            </span>
          </>
        )}
        {error && (
          <div className="rounded-[12px] bg-error-bg px-4 py-2.5 text-sm text-error-text">
            {error}
          </div>
        )}
      </div>

      {isSuperAdmin && !waitingDone && (
        <div className="flex flex-col gap-2 rounded-[18px] bg-teal-dark p-[18px]">
          <span className="text-[11px] font-extrabold tracking-[.06em] text-lime">
            SUPER ADMIN
          </span>
          <span className="text-[13px] leading-normal text-white/85">
            Bypass de tiempo de espera disponible para este peludo.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => bypassWaitingPeriod(petId))}
            className="grid h-10 place-items-center rounded-full border-[1.5px] border-white/35 text-[12.5px] font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
          >
            Forzar fin de tiempo de espera
          </button>
        </div>
      )}
    </div>
  );
}
