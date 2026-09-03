"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestPetInfo, sendPetMessage } from "@/app/admin/actions";
import { PET_REQUEST_MESSAGES } from "@/lib/constants";
import { AdjuntosPicker } from "@/components/app/AdjuntosPicker";
import { AdjuntosLista } from "@/components/app/AdjuntosLista";
import type {
  AdjuntoConversacion,
  AdjuntoFirmado,
} from "@/lib/documentos-conversacion";

type Msg = {
  id: string;
  sender: "admin" | "member";
  message: string;
  requested_items: string[];
  created_at: string;
};

const REQUEST_OPTIONS = [
  { value: "foto_principal", label: "📸 Foto principal" },
  { value: "certificado", label: "🏥 Certificado veterinario" },
  { value: "documento", label: "📄 Documento adicional" },
];

/**
 * Comunicación comité↔miembro por mascota dentro del expediente
 * ("Solicitar información" + chat directo del sistema anterior).
 */
export function PetThreadPanel({
  petId,
  petName,
  infoRequested,
  thread,
  adjuntos,
}: {
  petId: string;
  petName: string;
  infoRequested: boolean;
  thread: Msg[];
  /** Adjuntos ya firmados por la página, por id de mensaje. */
  adjuntos: Record<string, AdjuntoFirmado[]>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(infoRequested || thread.length > 0);
  const [requesting, setRequesting] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState("");
  // Dos juegos de adjuntos a propósito: "solicitar" y "mensaje directo" son
  // formularios distintos, y compartir el estado haría que un archivo elegido
  // para uno se fuera con el otro.
  const [adjuntosSolicitud, setAdjuntosSolicitud] = useState<
    AdjuntoConversacion[]
  >([]);
  const [adjuntosChat, setAdjuntosChat] = useState<AdjuntoConversacion[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleItem = (v: string) =>
    setItems((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );

  return (
    <div className="ml-9 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[12px] font-bold text-teal-deep hover:underline"
        >
          💬 {open ? "Ocultar conversación" : `Conversación (${thread.length})`}
        </button>
        {infoRequested && (
          <span className="rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-extrabold text-info-text">
            ESPERANDO RESPUESTA DEL MIEMBRO
          </span>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-cream p-3.5">
          {/* Hilo */}
          <div className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto">
            {thread.map((m) => (
              <div
                key={m.id}
                className={`flex max-w-[85%] flex-col rounded-[12px] px-3 py-2 text-[12.5px] leading-relaxed ${
                  m.sender === "admin"
                    ? "self-end bg-teal-dark text-white"
                    : "self-start bg-white text-ink-body"
                }`}
              >
                <span className={`text-[9.5px] font-extrabold ${m.sender === "admin" ? "text-white/60" : "text-ink-tertiary"}`}>
                  {m.sender === "admin" ? "COMITÉ" : "MIEMBRO"} ·{" "}
                  {new Intl.DateTimeFormat("es-MX", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(m.created_at))}
                </span>
                {m.requested_items.length > 0 && (
                  <span className="text-[10.5px] font-bold">
                    Solicitado: {m.requested_items.join(", ")}
                  </span>
                )}
                {m.message}
                <AdjuntosLista adjuntos={adjuntos[m.id] ?? []} />
              </div>
            ))}
            {thread.length === 0 && (
              <span className="text-[12px] text-ink-tertiary">
                Sin mensajes aún.
              </span>
            )}
          </div>

          {/* Solicitar información */}
          {requesting ? (
            <div className="flex flex-col gap-2 rounded-[12px] border-[1.5px] border-warning-text/30 bg-warning-bg p-3">
              <span className="text-[11px] font-extrabold tracking-wide text-warning-text">
                ¿QUÉ NECESITAS DE {petName.toUpperCase()}?
              </span>
              <div className="flex flex-wrap gap-1.5">
                {REQUEST_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleItem(opt.value)}
                    className={`rounded-full px-3 py-1 text-[11.5px] font-bold ${
                      items.includes(opt.value)
                        ? "bg-warning-text text-white"
                        : "border-[1.5px] border-warning-text/40 bg-white text-warning-text"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder="Mensaje para el miembro (opcional)…"
                className="rounded-[10px] border-[1.5px] border-border-input bg-white p-2.5 text-[12.5px] outline-none focus:border-teal"
              />
              {/* Los mensajes de siempre, a un clic (equipo, 2-sep). Vivían
                  colgando de "Denegar" y ahí no servían: no son razones para
                  rechazar un peludo, son razones para PEDIR algo. PRELLENAN el
                  texto y se escribe encima — el miembro recibe esto tal cual,
                  así que tiene que poder decir cuál foto o cuál dato. */}
              <div className="flex flex-wrap gap-1.5">
                {PET_REQUEST_MESSAGES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMessage(m)}
                    className={`rounded-full border px-2.5 py-[5px] text-left text-[11px] font-semibold transition-colors ${
                      message === m
                        ? "border-warning-text bg-white text-warning-text"
                        : "border-warning-text/40 bg-white/70 text-ink-secondary hover:border-warning-text"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <AdjuntosPicker
                adjuntos={adjuntosSolicitud}
                onChange={setAdjuntosSolicitud}
                onError={setError}
                disabled={pending}
                subiendo={subiendo}
                onSubiendo={setSubiendo}
                ayuda="Puedes adjuntar un formato o un ejemplo de lo que pides."
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending || subiendo}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      const r = await requestPetInfo(
                        petId,
                        items,
                        message,
                        adjuntosSolicitud,
                      );
                      if (r?.error) setError(r.error);
                      else {
                        setRequesting(false);
                        setItems([]);
                        setMessage("");
                        setAdjuntosSolicitud([]);
                        router.refresh();
                      }
                    })
                  }
                  className="grid h-9 place-items-center rounded-full bg-warning-text px-4 text-[12px] font-bold text-white disabled:opacity-60"
                >
                  {pending ? "Enviando…" : "📩 Enviar solicitud + correo"}
                </button>
                <button
                  type="button"
                  onClick={() => setRequesting(false)}
                  className="text-[12px] font-semibold text-ink-secondary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRequesting(true)}
              className="self-start rounded-full border-[1.5px] border-warning-text px-4 py-1.5 text-[12px] font-bold text-warning-text transition-colors hover:bg-warning-bg"
            >
              📋 Solicitar información
            </button>
          )}

          {/* Mensaje directo */}
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!chat.trim() && !adjuntosChat.length) return;
              startTransition(async () => {
                setError(null);
                const r = await sendPetMessage(petId, chat, adjuntosChat);
                if (r?.error) setError(r.error);
                else {
                  setChat("");
                  setAdjuntosChat([]);
                  router.refresh();
                }
              });
            }}
          >
            <div className="flex items-end gap-2">
            <textarea
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              rows={1}
              placeholder="Mensaje directo al miembro…"
              className="min-w-0 flex-1 rounded-[10px] border-[1.5px] border-border-input bg-white p-2.5 text-[12.5px] outline-none focus:border-teal"
            />
            <button
              type="submit"
              disabled={pending || subiendo || (!chat.trim() && !adjuntosChat.length)}
              className="grid h-9 flex-none place-items-center rounded-full bg-teal px-4 text-[12px] font-bold text-white disabled:opacity-50"
            >
              Enviar
            </button>
            </div>
            {/* El comité también adjunta (decisión 4.2) */}
            <AdjuntosPicker
              adjuntos={adjuntosChat}
              onChange={setAdjuntosChat}
              onError={setError}
              disabled={pending}
              subiendo={subiendo}
              onSubiendo={setSubiendo}
              ayuda="Puedes mandarle un archivo al miembro."
            />
          </form>
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
