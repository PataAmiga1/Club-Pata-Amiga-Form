"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateMemberAccount } from "@/app/admin/actions";

/** Motivos frecuentes de baja — clicables, con nota libre opcional (equipo, 5-ago). */
const MOTIVOS_BAJA = [
  "Ya no puede pagar la membresía",
  "Su peludo falleció",
  "No usa los beneficios",
  "Inconformidad con un reintegro",
  "Se muda / cambio de circunstancias",
  "Incumplimiento del reglamento",
];

/**
 * Dar de baja la cuenta de un miembro — visible SOLO para el super admin
 * (regla del sitio vivo). Cancela la membresía de inmediato y avisa al
 * miembro por correo y notificación.
 */
export function DeactivateAccountPanel({
  userId,
  memberName,
}: {
  userId: string;
  memberName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El aviso lleva el motivo elegido y, si hay, la nota libre.
  const motivoCompleto = [motivo, reason.trim()].filter(Boolean).join(" — ");

  return (
    <div className="flex flex-col gap-2.5 rounded-[18px] border-[1.5px] border-[#F2C7D4] bg-white p-5">
      <span className="text-[11px] font-extrabold tracking-[.06em] text-error-text">
        ZONA DE BAJA (SOLO SUPER ADMIN)
      </span>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start rounded-full border-[1.5px] border-[#F2C7D4] px-4 py-2 text-[12.5px] font-bold text-error-text transition-colors hover:bg-error-bg"
        >
          Dar de baja la cuenta…
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            La membresía de <strong>{memberName}</strong> se cancela de
            inmediato (también en Stripe) y recibirá el aviso por correo
            (plantilla editable en Comunicados).
          </p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_BAJA.map((mtv) => (
              <button
                key={mtv}
                type="button"
                onClick={() => setMotivo(motivo === mtv ? null : mtv)}
                className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                  motivo === mtv
                    ? "bg-error-text text-white"
                    : "border-[1.5px] border-border-input text-ink-secondary hover:border-error-text"
                }`}
              >
                {mtv}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Notas (opcional si eliges un motivo; se incluye en el aviso al miembro)…"
            className="rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-body outline-none focus:border-teal"
          />
          {error && (
            <span className="text-xs font-semibold text-error-text">
              {error}
            </span>
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
              disabled={busy || motivoCompleto.length < 5}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await deactivateMemberAccount(
                  userId,
                  motivoCompleto,
                );
                setBusy(false);
                if (result.error) setError(result.error);
                else router.refresh();
              }}
              className="rounded-full bg-error-text px-4 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Procesando…" : "Confirmar baja"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
