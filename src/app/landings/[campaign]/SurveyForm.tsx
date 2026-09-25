"use client";

import { useState } from "react";
import { PhoneField } from "@/components/ui/PhoneField";
import type { Pregunta } from "@/lib/landings";
import { registerLead } from "./actions";

/**
 * Formulario de una landing de encuesta (24-sep-2026): las mismas preguntas
 * que irían en un formulario ajeno, pero en una página de la marca y con las
 * respuestas guardadas junto al registro de la persona.
 *
 * La liga que se manda por DM puede traer `?nombre=` y `?correo=` para que
 * llegue prellenada; el código de embajador viaja en `?codigo=` como en el
 * resto de las landings.
 */
export function SurveyForm({
  campaign,
  preguntas,
  botonLabel,
  gracias,
  prellenado,
  pideTelefono = false,
  utm,
}: {
  campaign: string;
  preguntas: Pregunta[];
  botonLabel?: string;
  gracias?: { titulo: string; texto: string };
  prellenado?: { nombre?: string; correo?: string };
  /** La consulta a embajadores no pide teléfono: ya lo tenemos. */
  pideTelefono?: boolean;
  utm: { source?: string; medium?: string; campaign?: string };
}) {
  const [firstName, setFirstName] = useState(prellenado?.nombre ?? "");
  const [email, setEmail] = useState(prellenado?.correo ?? "");
  const [phone, setPhone] = useState("");
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [otros, setOtros] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const inputCls =
    "h-12 w-full rounded-[12px] border-[1.5px] border-border-input bg-white px-4 text-[15px] text-ink-title outline-none placeholder:text-ink-placeholder focus:border-teal";

  function responder(id: string, valor: string) {
    setRespuestas((r) => ({ ...r, [id]: valor }));
    setError(null);
  }

  if (done) {
    return (
      <div className="flex w-full flex-col items-center gap-3 rounded-[20px] bg-white p-7 text-center shadow-[0_16px_44px_rgba(30,83,80,.25)]">
        <span className="text-[46px]" aria-hidden>
          🐾
        </span>
        <h2 className="font-display text-[24px] leading-tight text-ink-title">
          {gracias?.titulo ?? `¡Gracias, ${firstName.trim().split(" ")[0]}!`}
        </h2>
        <p className="text-sm leading-relaxed text-ink-secondary">
          {gracias?.texto ?? "Tus respuestas llegaron. Gracias por tomarte el tiempo."}
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-5 rounded-[20px] bg-white p-5 text-left shadow-[0_16px_44px_rgba(30,83,80,.25)] sm:p-7"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        // La respuesta «Otro» se guarda como texto, no como la palabra «Otro».
        const finales: Record<string, string> = { ...respuestas };
        for (const [id, texto] of Object.entries(otros))
          if (respuestas[id] === "Otro" && texto.trim()) finales[id] = texto.trim();
        const faltante = preguntas.find((p) => p.requerida && !finales[p.id]?.trim());
        if (faltante) {
          setError(`Nos falta tu respuesta a: «${faltante.texto}»`);
          return;
        }
        setBusy(true);
        try {
          const result = await registerLead({
            campaign,
            firstName,
            lastName: "",
            email,
            phone,
            consent,
            respuestas: finales,
            utm,
            ambassadorCode:
              new URLSearchParams(window.location.search).get("codigo") ??
              window.localStorage.getItem("pa_ambassador_code") ??
              undefined,
          });
          if (result.error) setError(result.error);
          else setDone(true);
        } catch {
          setError("Algo salió mal. Intenta de nuevo.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-col gap-3">
        <span className="font-display text-[19px] text-ink-title">Tus datos</span>
        {/* Nombre o arroba: a muchos embajadores se les conoce por su cuenta,
            no por su nombre, y es como quieren que les hablemos (24-sep). */}
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Tu nombre o tu @usuario"
          aria-label="Tu nombre o tu @usuario"
          autoComplete="name"
          required
          className={inputCls}
        />
        <span className="-mt-1 text-[12px] leading-snug text-ink-tertiary">
          Como prefieras que te digamos: tu nombre, tu @ o los dos.
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Tu correo"
          autoComplete="email"
          required
          className={inputCls}
        />
        {pideTelefono && <PhoneField value={phone} onChange={setPhone} required />}
      </div>

      {preguntas.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-2.5 border-t border-border-divider pt-4">
          <span className="text-[15px] font-bold leading-snug text-ink-title">
            {i + 1}. {p.texto}
            {!p.requerida && (
              <span className="ml-1.5 text-[12px] font-normal text-ink-tertiary">(opcional)</span>
            )}
          </span>
          {p.nota && (
            <span className="-mt-1 text-[12.5px] leading-snug text-ink-tertiary">{p.nota}</span>
          )}
          {p.tipo === "abierta" ? (
            <textarea
              value={respuestas[p.id] ?? ""}
              onChange={(e) => responder(p.id, e.target.value)}
              rows={3}
              placeholder="Escribe aquí…"
              className="w-full rounded-[12px] border-[1.5px] border-border-input bg-white px-4 py-3 text-[15px] leading-relaxed text-ink-title outline-none placeholder:text-ink-placeholder focus:border-teal"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {[...(p.opciones ?? []), ...(p.permiteOtro ? ["Otro"] : [])].map((op) => {
                const elegida = respuestas[p.id] === op;
                return (
                  <label
                    key={op}
                    className={`flex cursor-pointer items-center gap-3 rounded-[12px] border-[1.5px] px-4 py-3 text-[14.5px] leading-snug transition-colors ${
                      elegida
                        ? "border-teal bg-info-bg font-semibold text-teal-deep"
                        : "border-border-input text-ink-body hover:border-teal/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={p.id}
                      checked={elegida}
                      onChange={() => responder(p.id, op)}
                      className="size-4 flex-none accent-[#1CBCAD]"
                    />
                    {op}
                  </label>
                );
              })}
              {p.permiteOtro && respuestas[p.id] === "Otro" && (
                <input
                  value={otros[p.id] ?? ""}
                  onChange={(e) => setOtros((o) => ({ ...o, [p.id]: e.target.value }))}
                  placeholder="¿Cuál?"
                  className={inputCls}
                />
              )}
            </div>
          )}
        </div>
      ))}

      <label className="flex items-start gap-2.5 text-[12px] leading-snug text-ink-secondary">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          className="mt-0.5 size-4 flex-none accent-[#1CBCAD]"
        />
        <span>
          Acepto que Club Pata Amiga use mis respuestas para mejorar el programa y me escriba al
          respecto, conforme al{" "}
          <a href="/legales/aviso-de-privacidad" target="_blank" className="underline">
            Aviso de privacidad
          </a>
          .
        </span>
      </label>

      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-[13px] font-semibold text-error-text">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="grid h-[52px] place-items-center rounded-full bg-orange text-[16px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Enviando…" : (botonLabel ?? "Enviar mis respuestas")}
      </button>
    </form>
  );
}
