"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string };

const WELCOME =
  "¡Hola! 🐾 Soy el asistente de Club Pata Amiga. Puedo ayudarte con dudas de tu membresía, tus reintegros y los períodos de espera de tus peludos.\n\nSi lo tuyo es la salud de tu peludo (síntomas, qué hacer, si es urgente), eso lo ve la Orientación veterinaria 24/7, que es otro asistente:";

/**
 * Widget flotante del asistente IA en el portal de miembros. Botón burbuja
 * (arriba del botón de emergencia) que abre un panel de chat: pantalla
 * completa en móvil, tarjeta en escritorio. Habla con /api/asistente/chat.
 */
export function AsistenteWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: WELCOME }]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await fetch("/api/asistente/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setConversationId(data.conversationId);
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            e instanceof Error && e.message !== "Error"
              ? e.message
              : "No pude responder en este momento. Intenta de nuevo en un momento. 🐾",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Botón burbuja — arriba del botón de emergencia */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir asistente"
          title="Asistente"
          className="fixed bottom-[152px] right-4 z-30 grid size-14 place-items-center rounded-full bg-teal text-[22px] text-white shadow-[0_6px_20px_rgba(30,83,80,.35)] transition-transform hover:scale-105 md:bottom-[84px] md:right-6"
        >
          <span aria-hidden>💬</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white md:inset-auto md:bottom-6 md:right-6 md:h-[560px] md:w-[380px] md:overflow-hidden md:rounded-[18px] md:shadow-[0_12px_40px_rgba(30,83,80,.25)]">
          {/* Encabezado */}
          <div className="flex items-center justify-between bg-teal px-4 py-3.5">
            <div className="flex flex-col">
              <span className="text-[15px] font-extrabold text-white">Asistente Pata Amiga</span>
              <span className="text-[11.5px] text-white/80">
                Dudas de tu membresía y reintegros
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar asistente"
              className="grid size-8 place-items-center rounded-full text-lg text-white/90 transition-colors hover:bg-white/15"
            >
              ✕
            </button>
          </div>

          {/* Mensajes */}
          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-cream px-3.5 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-snug ${
                  m.role === "user"
                    ? "ml-auto rounded-br-[4px] bg-teal text-white"
                    : "mr-auto rounded-bl-[4px] bg-white text-ink-title shadow-[0_1px_4px_rgba(30,83,80,.08)]"
                }`}
              >
                {m.content}
                {/* El primer mensaje lleva el enlace de verdad a la
                    orientación veterinaria: decirle a la gente "ve al otro
                    asistente" sin darle cómo llegar la deja igual de perdida.
                    Va aparte porque las burbujas se pintan como texto plano. */}
                {i === 0 && m.role === "assistant" && (
                  <Link
                    href="/app/vet"
                    onClick={() => setOpen(false)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-info-bg px-3 py-1.5 text-[12.5px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
                  >
                    🩺 Ir a Orientación veterinaria 24/7 →
                  </Link>
                )}
              </div>
            ))}
            {sending && (
              <div className="mr-auto rounded-[14px] rounded-bl-[4px] bg-white px-3.5 py-2.5 text-[13.5px] text-ink-tertiary shadow-[0_1px_4px_rgba(30,83,80,.08)]">
                Escribiendo…
              </div>
            )}
          </div>

          {/* Entrada */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-border-divider bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta…"
              maxLength={2000}
              className="h-11 flex-1 rounded-full border-[1.5px] border-border-input px-4 text-sm text-ink-title outline-none focus:border-teal"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Enviar"
              className="grid size-11 flex-none place-items-center rounded-full bg-teal text-white transition-colors hover:bg-teal-deep disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
