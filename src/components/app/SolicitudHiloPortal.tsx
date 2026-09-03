"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdjuntosPicker } from "@/components/app/AdjuntosPicker";
import { HiloMensajes } from "@/components/solicitudes/HiloMensajes";
import type {
  AdjuntoConversacion,
  AdjuntoFirmado,
} from "@/lib/documentos-conversacion";
import type { MensajeDeSolicitud } from "@/lib/hilo-solicitud";

/**
 * EL HILO CON EL COMITÉ VISTO POR QUIEN SOLICITA (Cipatli, 1-sep).
 *
 * El mismo componente para el embajador y para el centro. Lo único que cambia
 * es a qué Server Action le habla, y por eso entra COMO PROPIEDAD en vez de
 * importarse aquí: cada portal resuelve de quién es la solicitud a su manera
 * —el embajador puede tener varias, el centro una— y meter esa lógica en un
 * componente de cliente sería moverla al navegador.
 *
 * SOLO SE PINTA SI HAY CONVERSACIÓN. Un hilo vacío en el portal de alguien a
 * quien nadie le ha escrito es ruido: sugiere que le falta hacer algo cuando
 * no le falta nada. El padre decide.
 */
export function SolicitudHiloPortal({
  mensajes,
  adjuntos,
  infoRequested,
  onResponder,
  ayuda,
}: {
  mensajes: MensajeDeSolicitud[];
  /** Adjuntos ya firmados por la página, por id de mensaje. */
  adjuntos: Record<string, AdjuntoFirmado[]>;
  /** El comité pidió algo y todavía no se le contesta. */
  infoRequested: boolean;
  onResponder: (
    message: string,
    documents?: AdjuntoConversacion[],
  ) => Promise<{ error?: string; ok?: true }>;
  /** Una línea de contexto para el selector de archivos. */
  ayuda: string;
}) {
  const router = useRouter();
  const [respuesta, setRespuesta] = useState("");
  const [porEnviar, setPorEnviar] = useState<AdjuntoConversacion[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          MENSAJES CON EL COMITÉ
        </span>
        {infoRequested && (
          <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-[10px] font-extrabold text-warning-text">
            TE PIDIERON ALGO
          </span>
        )}
      </div>

      <div className="rounded-[14px] bg-cream p-3">
        <HiloMensajes
          mensajes={mensajes}
          adjuntos={adjuntos}
          soyElComite={false}
          vacio="Aún no hay mensajes."
        />
      </div>

      {error && (
        <span className="text-sm font-semibold text-error-text">{error}</span>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!respuesta.trim() && !porEnviar.length) return;
          setEnviando(true);
          setError(null);
          const r = await onResponder(respuesta, porEnviar);
          setEnviando(false);
          if (r?.error) setError(r.error);
          else {
            setRespuesta("");
            setPorEnviar([]);
            router.refresh();
          }
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={2}
            placeholder="Escribe tu respuesta al comité…"
            className="min-w-0 flex-1 rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-body outline-none focus:border-teal"
          />
          <button
            type="submit"
            disabled={
              enviando || subiendo || (!respuesta.trim() && !porEnviar.length)
            }
            className="grid h-11 flex-none place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
        <AdjuntosPicker
          adjuntos={porEnviar}
          onChange={setPorEnviar}
          onError={setError}
          disabled={enviando}
          subiendo={subiendo}
          onSubiendo={setSubiendo}
          ayuda={ayuda}
        />
      </form>
    </section>
  );
}
