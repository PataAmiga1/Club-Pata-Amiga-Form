"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitAppeal } from "@/app/app/apelaciones/actions";

/**
 * Botón "Apelar decisión" con formulario inline para reintegros rechazados
 * y perfiles de mascota denegados. Una segunda revisión del comité.
 */
export function AppealButton({
  reimbursementId,
  petId,
  centerId,
  subjectLabel,
}: {
  reimbursementId?: string;
  petId?: string;
  centerId?: string;
  subjectLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [folio, setFolio] = useState<string | null>(null);

  if (folio) {
    return (
      <span className="rounded-full bg-info-bg px-3 py-1 text-[11px] font-extrabold tracking-[.04em] text-info-text">
        APELACIÓN {folio} EN REVISIÓN
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-full border-[1.5px] border-teal px-4 py-1.5 text-[12px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
      >
        ⚖️ Apelar decisión
      </button>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-2 rounded-[14px] bg-cream p-3.5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          const result = await submitAppeal({
            reimbursementId,
            petId,
            centerId,
            message,
          });
          if (result.error) setError(result.error);
          else {
            setFolio(result.folio ?? "");
            router.refresh();
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="text-[12.5px] font-semibold text-ink-title">
        Apelar {subjectLabel} — el comité hará una segunda revisión
      </span>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder="Cuéntanos tu caso: qué información adicional debería considerar el comité (mínimo 10 caracteres)…"
        className="rounded-[10px] border-[1.5px] border-border-input bg-white p-3 text-[13px] text-ink-body outline-none focus:border-teal"
      />
      {error && (
        <span className="text-xs font-semibold text-error-text">{error}</span>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || message.trim().length < 10}
          className="grid h-9 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
        >
          {busy ? "Enviando…" : "Enviar apelación"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-ink-secondary hover:text-ink-title"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
