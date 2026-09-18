"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VET_BOT_DISCLAIMER, REIMBURSEMENT_CAPS_MXN } from "@/lib/constants";
import { formatMxn } from "@/lib/format";
import { PhoneField, telefonoCompleto } from "@/components/ui/PhoneField";
import { guardarTelefonoParaChat } from "./actions";

type Bubble =
  | { kind: "assistant" | "user"; text: string }
  | { kind: "nudge" };

export function VetChat({
  greeting,
  es599 = false,
  esMiembro,
  restantes: restantesIniciales,
  necesitaTelefono: pideTelefono,
  volverA = "/app",
}: {
  greeting: string;
  /** Membresía por peludo: el recordatorio no cita el tope de $3,000 del $159. */
  es599?: boolean;
  /**
   * Abierto a toda cuenta (equipo, 17-sep-2026). Sin membresía: mensajes
   * contados por día y sin recordatorios de reintegro.
   */
  esMiembro: boolean;
  /** Mensajes que le quedan hoy; `null` = sin límite. */
  restantes: number | null;
  /** Cuenta sin teléfono (p. ej. alta con Google): se le pide antes de chatear. */
  necesitaTelefono: boolean;
  /** A dónde vuelve la flecha en móvil (embajadores y centros no viven en /app). */
  volverA?: string;
}) {
  const router = useRouter();
  const [restantes, setRestantes] = useState<number | null>(restantesIniciales);
  const [necesitaTelefono, setNecesitaTelefono] = useState(pideTelefono);
  const [telefono, setTelefono] = useState("");
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const sinMensajes = restantes === 0;
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { kind: "assistant", text: greeting },
  ]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, sending]);

  async function send() {
    const message = input.trim();
    if (!message || sending || sinMensajes) return;
    setInput("");
    setBubbles((b) => [...b, { kind: "user", text: message }]);
    setSending(true);

    try {
      const res = await fetch("/api/vet/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message }),
      });
      if (!res.ok) {
        const { error, motivo } = await res.json().catch(() => ({ error: null, motivo: null }));
        if (motivo === "limite") setRestantes(0);
        if (motivo === "sin_telefono") setNecesitaTelefono(true);
        setBubbles((b) => [
          ...b,
          {
            kind: "assistant",
            text: error ?? "Tuve un problema para responder. Intenta de nuevo. 🐾",
          },
        ]);
        return;
      }
      const data = await res.json();
      setConversationId(data.conversationId);
      if (typeof data.restantes === "number") setRestantes(data.restantes);
      setBubbles((b) => [
        ...b,
        { kind: "assistant", text: data.reply },
        // El recordatorio de reintegro es de miembros: a quien no ha pagado no
        // se le promete nada (equipo, 17-sep-2026).
        ...(data.urgent && esMiembro ? [{ kind: "nudge" } as Bubble] : []),
      ]);
    } catch {
      setBubbles((b) => [
        ...b,
        { kind: "assistant", text: "Sin conexión. Intenta de nuevo en un momento." },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function guardarTelefono() {
    setErrorTelefono(null);
    if (!telefonoCompleto(telefono)) {
      setErrorTelefono("Revisa tu teléfono: con lada de México son 10 dígitos.");
      return;
    }
    setGuardando(true);
    const r = await guardarTelefonoParaChat(telefono);
    setGuardando(false);
    if ("error" in r && r.error) setErrorTelefono(r.error);
    else setNecesitaTelefono(false);
  }

  if (necesitaTelefono) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
        <h1 className="font-display text-3xl text-ink-title">Orientación veterinaria 24/7</h1>
        <p className="text-sm leading-relaxed text-ink-secondary">
          Para chatear con nuestra orientación veterinaria solo necesitamos tu
          teléfono. Así, si hace falta, el equipo te puede contactar.
        </p>
        <PhoneField value={telefono} onChange={setTelefono} label="Tu teléfono" />
        {errorTelefono && (
          <span className="text-[13px] font-semibold text-error-text">{errorTelefono}</span>
        )}
        <button
          type="button"
          disabled={guardando}
          onClick={guardarTelefono}
          className="grid h-11 place-items-center rounded-full bg-teal px-6 text-[13.5px] font-bold text-white disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Empezar a chatear"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-96px)] flex-col md:h-dvh">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border-divider bg-white px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={() => router.push(volverA)}
          className="text-lg font-bold text-teal-deep md:hidden"
          aria-label="Volver"
        >
          ←
        </button>
        <div className="grid size-[42px] place-items-center rounded-full bg-teal text-[19px]">
          🐾
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold text-ink-title">
            Orientación veterinaria
          </span>
          <span className="text-[11.5px] font-semibold text-teal-deep">
            ● Disponible 24/7
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 md:px-6">
        <div className="max-w-[290px] self-center rounded-full bg-[#EFEAE0] px-3.5 py-1.5 text-center text-[10.5px] font-semibold leading-snug text-ink-tertiary">
          {VET_BOT_DISCLAIMER}
        </div>
        {!esMiembro && restantes !== null && restantes > 0 && (
          <div className="self-center text-center text-[11.5px] font-semibold text-ink-tertiary">
            Te quedan {restantes} {restantes === 1 ? "mensaje" : "mensajes"} hoy ·{" "}
            <Link href="/registro/peludo" className="text-teal-deep underline">
              sin límite con tu membresía
            </Link>
          </div>
        )}
        {bubbles.map((bubble, i) => {
          if (bubble.kind === "nudge") {
            return (
              <div
                key={i}
                className="max-w-[300px] self-start rounded-[14px] bg-warning-bg px-3.5 py-3 text-[12.5px] leading-normal text-[#8A5A12]"
              >
                💡 Recuerda: si tu peludo necesita atención,{" "}
                {es599
                  ? "tu membresía tiene un monto disponible para emergencia veterinaria."
                  : `tu membresía reintegra hasta ${formatMxn(REIMBURSEMENT_CAPS_MXN.vet_expenses)} MXN en gastos veterinarios.`}
                <br />
                <Link
                  href="/app/reintegros/nueva"
                  className="font-bold text-warning-text"
                >
                  Iniciar solicitud de reintegro →
                </Link>
              </div>
            );
          }
          return (
            <div
              key={i}
              className={
                bubble.kind === "user"
                  ? "max-w-[280px] self-end whitespace-pre-line rounded-[16px_16px_4px_16px] bg-teal px-3.5 py-3 text-[13.5px] leading-normal text-white"
                  : "max-w-[300px] self-start whitespace-pre-line rounded-[16px_16px_16px_4px] bg-white px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-body shadow-[0_2px_8px_rgba(30,83,80,.06)]"
              }
            >
              {bubble.text}
            </div>
          );
        })}
        {sending && (
          <div className="self-start rounded-[16px_16px_16px_4px] bg-white px-3.5 py-3 text-[13.5px] text-ink-tertiary shadow-[0_2px_8px_rgba(30,83,80,.06)]">
            Escribiendo…
          </div>
        )}
        {sinMensajes && (
          <div className="flex max-w-[320px] flex-col gap-2 self-center rounded-[16px] bg-info-bg px-4 py-3.5 text-center text-[13px] leading-relaxed text-info-text">
            <span>
              Usaste tus mensajes de hoy. Mañana se renuevan, o sigue ahora con
              la membresía de Pata Amiga: orientación veterinaria sin límite,
              reintegros y el enlace con nuestro veterinario.
            </span>
            <Link
              href="/registro/peludo"
              className="grid h-10 place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white"
            >
              Unirme a la manada
            </Link>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2.5 border-t border-border-divider bg-white px-4 py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={sinMensajes ? "Vuelve mañana o únete para seguir" : "Escribe tu pregunta…"}
          disabled={sinMensajes}
          maxLength={2000}
          className="h-[46px] min-w-0 flex-1 rounded-full border-[1.5px] border-border-input px-4 text-[13.5px] text-ink-title placeholder:text-ink-placeholder outline-none focus:border-teal"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Enviar"
          className="grid size-[46px] flex-none place-items-center rounded-full bg-teal text-base text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
        >
          ↑
        </button>
      </form>
    </div>
  );
}
