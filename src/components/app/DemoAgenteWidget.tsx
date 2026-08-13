"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const BIENVENIDA =
  "¡Hola! 🐾 Soy el asistente de Club Pata Amiga, en versión de demostración.\n\n" +
  "Pregúntame lo que quieras de la membresía: qué incluye, cuánto cuesta, cómo " +
  "funcionan los reintegros o los tiempos de espera. Cuando te hagas miembro " +
  "respondo con la información de tus peludos.";

/**
 * Widget del AGENTE DEMO — sección 6.
 *
 * Misma cara y mismo tono que el asistente de miembros, con un sello visible
 * de "Versión de demostración". Que se parezca es el punto: así se entiende
 * qué se desbloquea al hacerse miembro. Que el sello esté siempre a la vista
 * también: nadie debe confundirlo con el servicio real.
 *
 * Quién lo ve NO se decide aquí. El servidor monta este componente solo para
 * cuentas sin suscripción activa, y además la ruta vuelve a comprobarlo en
 * cada mensaje.
 */
export function DemoAgenteWidget() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Msg[]>([
    { role: "assistant", content: BIENVENIDA },
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [agotado, setAgotado] = useState(false);
  const [ofreceHumano, setOfreceHumano] = useState(false);
  const [pidioHumano, setPidioHumano] = useState(false);
  const [apagado, setApagado] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensajes, enviando]);

  async function llamar(cuerpo: Record<string, unknown>) {
    const res = await fetch("/api/asistente/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, ...cuerpo }),
    });
    return { estado: res.status, datos: await res.json() };
  }

  async function enviar() {
    const pregunta = texto.trim();
    if (!pregunta || enviando) return;
    setTexto("");
    setMensajes((m) => [...m, { role: "user", content: pregunta }]);
    setEnviando(true);
    try {
      const { datos } = await llamar({ message: pregunta });
      if (datos.conversationId) setConversationId(datos.conversationId);
      if (datos.apagado) setApagado(true);
      if (datos.agotado) setAgotado(true);
      if (typeof datos.ofreceHumano === "boolean") setOfreceHumano(datos.ofreceHumano);
      setMensajes((m) => [
        ...m,
        {
          role: "assistant",
          content:
            datos.reply ??
            datos.error ??
            "No pude responder ahora mismo. Intenta de nuevo en un momento.",
        },
      ]);
    } catch {
      setMensajes((m) => [
        ...m,
        { role: "assistant", content: "Se me fue la señal 🐾 ¿Lo intentas otra vez?" },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  async function pedirPersona() {
    if (pidioHumano || enviando) return;
    setEnviando(true);
    try {
      const { datos } = await llamar({ pedirHumano: true });
      if (datos.conversationId) setConversationId(datos.conversationId);
      setPidioHumano(true);
      setMensajes((m) => [
        ...m,
        { role: "assistant", content: datos.reply ?? "Le avisé al equipo 🐾" },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir el asistente de demostración"
          className="fixed bottom-[152px] right-4 z-30 flex items-center gap-2 rounded-full bg-teal px-4 py-3 text-[13px] font-extrabold text-white shadow-[0_6px_20px_rgba(30,83,80,.35)] transition-transform hover:scale-105 md:bottom-[84px] md:right-6"
        >
          <span aria-hidden>💬</span>
          Asistente
          <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide">
            demo
          </span>
        </button>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white md:inset-auto md:bottom-6 md:right-6 md:h-[560px] md:w-[380px] md:overflow-hidden md:rounded-[18px] md:shadow-[0_12px_40px_rgba(30,83,80,.25)]">
          <div className="flex items-center justify-between bg-teal px-4 py-3.5">
            <div className="flex flex-col">
              <span className="flex items-center gap-2 text-[15px] font-extrabold text-white">
                Asistente Pata Amiga
                {/* El sello va en el encabezado, siempre visible: nadie debe
                    confundir la demostración con el servicio real. */}
                <span className="rounded-full bg-white/25 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide">
                  demostración
                </span>
              </span>
              <span className="text-[11.5px] text-white/80">
                Resuelve tus dudas antes de unirte
              </span>
            </div>
            <button
              onClick={() => setAbierto(false)}
              aria-label="Cerrar asistente"
              className="grid size-8 place-items-center rounded-full text-lg text-white/90 transition-colors hover:bg-white/15"
            >
              ✕
            </button>
          </div>

          <div ref={listaRef} className="flex-1 space-y-2.5 overflow-y-auto bg-cream px-3.5 py-4">
            {mensajes.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-snug ${
                  m.role === "user"
                    ? "ml-auto rounded-br-[4px] bg-teal text-white"
                    : "mr-auto rounded-bl-[4px] bg-white text-ink-title shadow-[0_1px_4px_rgba(30,83,80,.08)]"
                }`}
              >
                {m.content}
              </div>
            ))}
            {enviando && (
              <div className="mr-auto rounded-[14px] rounded-bl-[4px] bg-white px-3.5 py-2.5 text-[13.5px] text-ink-tertiary shadow-[0_1px_4px_rgba(30,83,80,.08)]">
                Escribiendo…
              </div>
            )}
          </div>

          {/* Cierre: la demostración se acabó o el agente está apagado */}
          {(agotado || apagado) && (
            <div className="flex flex-col gap-2 border-t border-border-divider bg-white p-3">
              <a
                href="/registro/plan"
                className="rounded-full bg-teal px-5 py-3 text-center text-[13.5px] font-extrabold text-white hover:bg-teal-deep"
              >
                Completar mi registro
              </a>
              {agotado && ofreceHumano && !pidioHumano && (
                <button
                  type="button"
                  onClick={pedirPersona}
                  disabled={enviando}
                  className="rounded-full bg-white px-5 py-2.5 text-[12.5px] font-bold text-ink-secondary shadow-[0_1px_4px_rgba(30,83,80,.12)] disabled:opacity-50"
                >
                  Prefiero hablar con una persona
                </button>
              )}
              {pidioHumano && (
                <span className="text-center text-[12px] text-ink-secondary">
                  Le avisamos al equipo: alguien te va a escribir 🐾
                </span>
              )}
            </div>
          )}

          {!agotado && !apagado && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enviar();
              }}
              className="flex items-center gap-2 border-t border-border-divider bg-white p-3"
            >
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escribe tu pregunta…"
                maxLength={2000}
                className="h-11 flex-1 rounded-full border-[1.5px] border-border-input px-4 text-sm text-ink-title outline-none focus:border-teal"
              />
              <button
                type="submit"
                disabled={enviando || !texto.trim()}
                aria-label="Enviar"
                className="grid size-11 flex-none place-items-center rounded-full bg-teal text-white transition-colors hover:bg-teal-deep disabled:opacity-40"
              >
                ➤
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
