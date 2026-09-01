import { AdjuntosLista } from "@/components/app/AdjuntosLista";
import { ITEMS_SOLICITUD } from "@/lib/hilo-solicitud";
import type { AdjuntoFirmado } from "@/lib/documentos-conversacion";
import type { MensajeDeSolicitud } from "@/lib/hilo-solicitud";

/**
 * Los mensajes del hilo con el comité, pintados igual de los dos lados
 * (Cipatli, 1-sep).
 *
 * Vive aparte porque lo usan CUATRO pantallas —el portal del embajador, el del
 * centro, y los dos popups del panel—. Lo único que cambia entre ellas es de
 * qué lado cae cada burbuja, y eso entra por `soyElComite`: para el comité, lo
 * suyo va a la derecha; para quien solicita, al revés. Sin eso, una misma
 * conversación se leería invertida según quién la abra.
 *
 * LO SOLICITADO SE PINTA CON SU ETIQUETA, no con la clave que guarda la base:
 * el hilo del peludo enseña "foto_principal" tal cual y se lee como un error.
 */
export function HiloMensajes({
  mensajes,
  adjuntos,
  soyElComite,
  vacio,
}: {
  mensajes: MensajeDeSolicitud[];
  /** Adjuntos ya firmados por la página, por id de mensaje. */
  adjuntos: Record<string, AdjuntoFirmado[]>;
  soyElComite: boolean;
  /** Qué decir cuando todavía no hay nada. */
  vacio: string;
}) {
  if (!mensajes.length)
    return <span className="text-[12px] text-ink-tertiary">{vacio}</span>;

  return (
    <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
      {mensajes.map((m) => {
        const esDelComite = m.sender === "admin";
        const mio = esDelComite === soyElComite;
        return (
          <div
            key={m.id}
            className={`flex max-w-[85%] flex-col rounded-[12px] px-3 py-2 text-[12.5px] leading-relaxed ${
              mio
                ? "self-end bg-teal-dark text-white"
                : "self-start bg-white text-ink-body"
            }`}
          >
            <span
              className={`text-[9.5px] font-extrabold tracking-wide ${
                mio ? "text-white/60" : "text-ink-tertiary"
              }`}
            >
              {esDelComite ? "COMITÉ PATA AMIGA" : "SOLICITANTE"} ·{" "}
              {new Intl.DateTimeFormat("es-MX", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(m.created_at))}
            </span>
            {m.requested_items.length > 0 && (
              <span className="text-[10.5px] font-bold">
                Solicitado:{" "}
                {m.requested_items
                  .map((i) => ITEMS_SOLICITUD[i] ?? i)
                  .join(" · ")}
              </span>
            )}
            {m.message}
            <AdjuntosLista adjuntos={adjuntos[m.id] ?? []} />
          </div>
        );
      })}
    </div>
  );
}
