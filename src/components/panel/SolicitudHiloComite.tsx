"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestSolicitudInfo } from "@/app/admin/actions";
import { AdjuntosPicker } from "@/components/app/AdjuntosPicker";
import { HiloMensajes } from "@/components/solicitudes/HiloMensajes";
import { ITEMS_SOLICITUD, type SujetoSolicitud } from "@/lib/hilo-solicitud";
import type {
  AdjuntoConversacion,
  AdjuntoFirmado,
} from "@/lib/documentos-conversacion";
import type { MensajeDeSolicitud } from "@/lib/hilo-solicitud";

/**
 * EL COMITÉ LE ESCRIBE A UN EMBAJADOR O A UN CENTRO (Cipatli, 1-sep).
 *
 * El caso que lo originó: la INE llegó borrosa y no había cómo pedir otra. La
 * única salida era aprobar a ciegas o denegar sin explicar.
 *
 * UN SOLO FORMULARIO, NO DOS. El hilo del peludo tiene dos —"solicitar
 * información" (con correo) y "mensaje directo" (sin correo)— y aquí eso no
 * aplica: un embajador o un centro puede no tener cuenta todavía, así que un
 * mensaje que no salga por correo se quedaría sin leer. Todo lo que el comité
 * escriba aquí va por correo, y lo que se tique arriba solo lo hace más
 * específico.
 */
export function SolicitudHiloComite({
  sujeto,
  id,
  nombre,
  infoRequested,
  mensajes,
  adjuntos,
}: {
  sujeto: SujetoSolicitud;
  id: string;
  /** Para el encabezado: a quién le estamos escribiendo. */
  nombre: string;
  infoRequested: boolean;
  mensajes: MensajeDeSolicitud[];
  /** Adjuntos ya firmados por la página, por id de mensaje. */
  adjuntos: Record<string, AdjuntoFirmado[]>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(infoRequested || mensajes.length > 0);
  const [items, setItems] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [porEnviar, setPorEnviar] = useState<AdjuntoConversacion[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (v: string) =>
    setItems((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const puedeEnviar = Boolean(mensaje.trim() || items.length || porEnviar.length);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="text-[12px] font-bold text-teal-deep hover:underline"
        >
          💬{" "}
          {abierto
            ? "Ocultar conversación"
            : `Conversación (${mensajes.length})`}
        </button>
        {infoRequested && (
          <span className="rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-extrabold text-info-text">
            ESPERANDO SU RESPUESTA
          </span>
        )}
      </div>

      {abierto && (
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-cream p-3.5">
          <HiloMensajes
            mensajes={mensajes}
            adjuntos={adjuntos}
            soyElComite
            vacio="Sin mensajes aún. Escribe abajo para pedirle lo que falte."
          />

          <div className="flex flex-col gap-2 rounded-[12px] border-[1.5px] border-warning-text/30 bg-warning-bg p-3">
            <span className="text-[11px] font-extrabold tracking-wide text-warning-text">
              ¿QUÉ NECESITAS DE {nombre.toUpperCase()}?
            </span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ITEMS_SOLICITUD).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => toggle(valor)}
                  className={`rounded-full px-3 py-1 text-[11.5px] font-bold ${
                    items.includes(valor)
                      ? "bg-warning-text text-white"
                      : "border-[1.5px] border-warning-text/40 bg-white text-warning-text"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={2}
              placeholder="Explícale qué necesitas y por qué (ej. «la foto del frente salió movida»)…"
              className="rounded-[10px] border-[1.5px] border-border-input bg-white p-2.5 text-[12.5px] outline-none focus:border-teal"
            />
            <AdjuntosPicker
              adjuntos={porEnviar}
              onChange={setPorEnviar}
              onError={setError}
              disabled={pending}
              subiendo={subiendo}
              onSubiendo={setSubiendo}
              ayuda="Puedes adjuntar un formato o un ejemplo de lo que pides."
            />
            <button
              type="button"
              disabled={pending || subiendo || !puedeEnviar}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await requestSolicitudInfo(
                    sujeto,
                    id,
                    items,
                    mensaje,
                    porEnviar,
                  );
                  if (r?.error) setError(r.error);
                  else {
                    setItems([]);
                    setMensaje("");
                    setPorEnviar([]);
                    router.refresh();
                  }
                })
              }
              className="self-start rounded-full bg-warning-text px-4 py-2 text-[12px] font-bold text-white disabled:opacity-60"
            >
              {pending ? "Enviando…" : "📩 Enviar y avisarle por correo"}
            </button>
            {/* Se dice que resolver es OTRA decisión, igual que en el
                expediente de documentos de la fase 5: escribirle no aprueba ni
                deniega nada, y confundirlas sería fácil y caro. */}
            <span className="text-[11px] leading-normal text-warning-text/80">
              Escribirle no resuelve la solicitud: aprobar o denegar sigue
              siendo el botón de arriba.
            </span>
          </div>

          {error && (
            <span className="text-[12px] font-semibold text-error-text">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
