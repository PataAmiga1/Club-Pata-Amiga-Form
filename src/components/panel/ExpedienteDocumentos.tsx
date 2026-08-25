"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewDocument } from "@/app/admin/actions";
import {
  ETIQUETA_ESTADO,
  type DocumentoFirmado,
  type EstadoDocumento,
} from "@/lib/documentos-solicitud";

/**
 * El expediente de una solicitud, con la revisión DOCUMENTO POR DOCUMENTO
 * (equipo, 19-ago — decisión 1.5).
 *
 * Antes aprobar era una sola decisión sobre toda la solicitud. Con persona
 * moral eso ya no alcanza: hay que poder dar por bueno el RFC y dejar
 * pendiente la INE del representante. Resolver un documento NO resuelve la
 * solicitud — el botón de aprobar al embajador o al centro sigue siendo el de
 * siempre, y sigue siendo otra decisión.
 *
 * Denegar EXIGE una nota: quien la recibe tiene que saber qué corregir, y sin
 * eso la persona vuelve a subir exactamente lo mismo.
 */

const CHIP: Record<EstadoDocumento, string> = {
  pendiente: "bg-warning-bg text-warning-text",
  aprobado: "bg-success-bg text-success-text",
  denegado: "bg-error-bg text-error-text",
};

function Documento({ doc }: { doc: DocumentoFirmado }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [denegando, setDenegando] = useState(false);
  const [nota, setNota] = useState(doc.review_notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const resolver = (estado: EstadoDocumento) =>
    startTransition(async () => {
      setError(null);
      const r = await reviewDocument(doc.id, estado, nota);
      if (r?.error) setError(r.error);
      else {
        setDenegando(false);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-2 border-b border-[#F2EEE4] py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-ink-title">
          {doc.etiqueta}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${CHIP[doc.status]}`}
        >
          {ETIQUETA_ESTADO[doc.status]}
        </span>
        {doc.url ? (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-bold text-teal-deep hover:underline"
          >
            Abrir →
          </a>
        ) : (
          <span className="text-[11.5px] text-ink-tertiary">
            No pudimos abrir el archivo
          </span>
        )}
      </div>

      {doc.status === "denegado" && doc.review_notes && (
        <span className="text-[11.5px] leading-snug text-error-text">
          Motivo: {doc.review_notes}
        </span>
      )}

      {denegando ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder="¿Qué tiene que corregir? (obligatorio)"
            className="rounded-[10px] border-[1.5px] border-border-input bg-white p-2.5 text-[12.5px] outline-none focus:border-teal"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pendiente || !nota.trim()}
              onClick={() => resolver("denegado")}
              className="grid h-8 place-items-center rounded-full bg-error-text px-3.5 text-[11.5px] font-bold text-white disabled:opacity-50"
            >
              {pendiente ? "Guardando…" : "Confirmar denegación"}
            </button>
            <button
              type="button"
              onClick={() => setDenegando(false)}
              className="text-[11.5px] font-semibold text-ink-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {doc.status !== "aprobado" && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => resolver("aprobado")}
              className="grid h-8 place-items-center rounded-full bg-teal px-3.5 text-[11.5px] font-bold text-white disabled:opacity-50"
            >
              ✓ Aprobar
            </button>
          )}
          {doc.status !== "denegado" && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => setDenegando(true)}
              className="grid h-8 place-items-center rounded-full border-[1.5px] border-[#F2C7D4] px-3.5 text-[11.5px] font-bold text-error-text disabled:opacity-50"
            >
              Denegar…
            </button>
          )}
          {doc.status !== "pendiente" && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => resolver("pendiente")}
              className="text-[11.5px] font-semibold text-ink-secondary hover:text-ink-title"
            >
              Volver a pendiente
            </button>
          )}
        </div>
      )}

      {error && (
        <span className="text-[11.5px] font-semibold text-error-text">
          {error}
        </span>
      )}
    </div>
  );
}

export function ExpedienteDocumentos({
  documentos,
  faltantes,
}: {
  documentos: DocumentoFirmado[];
  /** Lo que esta solicitud debería traer y no trae. */
  faltantes?: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] bg-cream/60 p-4">
      <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
        EXPEDIENTE ({documentos.length})
      </span>
      <span className="text-[11.5px] leading-snug text-ink-tertiary">
        Cada documento se resuelve por su cuenta. Aprobarlos todos NO aprueba la
        solicitud — eso sigue siendo el botón de arriba.
      </span>
      {documentos.length > 0 ? (
        documentos.map((d) => <Documento key={d.id} doc={d} />)
      ) : (
        <span className="py-1.5 text-[12.5px] text-ink-secondary">
          Sin documentos. Las solicitudes anteriores al 25-ago pueden no traer
          expediente.
        </span>
      )}
      {faltantes && faltantes.length > 0 && (
        <span className="mt-1 rounded-[10px] bg-warning-bg px-3 py-2 text-[11.5px] font-semibold text-warning-text">
          Falta: {faltantes.join(" · ")}
        </span>
      )}
    </div>
  );
}
