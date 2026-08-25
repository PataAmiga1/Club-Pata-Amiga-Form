"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { replyReimbursementThread } from "./actions";
import { AdjuntosPicker } from "@/components/app/AdjuntosPicker";
import { AdjuntosLista } from "@/components/app/AdjuntosLista";
import type {
  AdjuntoConversacion,
  AdjuntoFirmado,
} from "@/lib/documentos-conversacion";

export type ReimbursementMessage = {
  id: string;
  sender: "admin" | "member";
  message: string;
  created_at: string;
};

/**
 * Hilo con el comité de ESTA solicitud de reintegro — conversación separada
 * por área, como el hilo por mascota. El padre decide si renderizarlo
 * (solo cuando el comité ya escribió).
 */
export function ReimbursementThread({
  reimbursementId,
  thread,
  adjuntos,
}: {
  reimbursementId: string;
  thread: ReimbursementMessage[];
  /** Adjuntos ya firmados por la página, por id de mensaje. */
  adjuntos: Record<string, AdjuntoFirmado[]>;
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [porEnviar, setPorEnviar] = useState<AdjuntoConversacion[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
      <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
        MENSAJES CON EL COMITÉ
      </span>
      <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
        {thread.map((m) => (
          <div
            key={m.id}
            className={`flex max-w-[85%] flex-col gap-1 rounded-[14px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
              m.sender === "admin"
                ? "self-start bg-cream text-ink-body"
                : "self-end bg-info-bg text-ink-body"
            }`}
          >
            <span className="text-[10px] font-extrabold tracking-wide text-ink-tertiary">
              {m.sender === "admin" ? "COMITÉ PATA AMIGA" : "TÚ"} ·{" "}
              {new Intl.DateTimeFormat("es-MX", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(m.created_at))}
            </span>
            {m.message}
            <AdjuntosLista adjuntos={adjuntos[m.id] ?? []} />
          </div>
        ))}
      </div>
      {error && (
        <span className="text-sm font-semibold text-error-text">{error}</span>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reply.trim() && !porEnviar.length) return;
          setBusy(true);
          setError(null);
          const result = await replyReimbursementThread(
            reimbursementId,
            reply,
            porEnviar,
          );
          setBusy(false);
          if (!result.error) {
            setReply("");
            setPorEnviar([]);
            router.refresh();
          } else setError(result.error);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder="Escribe tu respuesta al comité…"
            className="min-w-0 flex-1 rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-body outline-none focus:border-teal"
          />
          <button
            type="submit"
            disabled={busy || subiendo || (!reply.trim() && !porEnviar.length)}
            className="grid h-11 flex-none place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
          >
            {busy ? "Enviando…" : "Enviar"}
          </button>
        </div>
        <AdjuntosPicker
          adjuntos={porEnviar}
          onChange={setPorEnviar}
          onError={setError}
          disabled={busy}
          subiendo={subiendo}
          onSubiendo={setSubiendo}
          ayuda="Si el comité te pidió una factura o un comprobante, mándalo aquí."
        />
      </form>
    </section>
  );
}
