"use client";

import { useState } from "react";
import { PhoneField } from "@/components/ui/PhoneField";
import { registerLead } from "./actions";

/** Formulario de registro de la landing: nombre, apellidos, correo, teléfono. */
export function LeadForm({
  campaign,
  utm,
}: {
  campaign: string;
  utm: { source?: string; medium?: string; campaign?: string };
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const inputCls =
    "h-12 w-full rounded-[12px] border-[1.5px] border-border-input bg-white px-4 text-[15px] text-ink-title outline-none placeholder:text-ink-placeholder focus:border-teal";

  if (done) {
    return (
      <div className="flex w-full flex-col items-center gap-3 rounded-[20px] bg-white p-7 shadow-[0_16px_44px_rgba(30,83,80,.25)]">
        <span className="text-[46px]" aria-hidden>
          📬
        </span>
        <h2 className="font-display text-[24px] leading-tight text-ink-title">
          ¡Listo, {firstName.trim().split(" ")[0]}!
        </h2>
        <p className="text-sm leading-relaxed text-ink-secondary">
          Tu regalo va en camino a <strong>{email.trim()}</strong>. Si no lo
          ves en unos minutos, revisa la carpeta de spam o promociones.
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[0_16px_44px_rgba(30,83,80,.25)] sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          const result = await registerLead({
            campaign,
            firstName,
            lastName,
            email,
            phone,
            consent,
            utm,
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
      <span className="text-left font-display text-[19px] text-ink-title">
        Regístrate y recibe tu regalo
      </span>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Nombre"
          autoComplete="given-name"
          required
          className={inputCls}
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Apellidos"
          autoComplete="family-name"
          required
          className={inputCls}
        />
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Correo electrónico"
        autoComplete="email"
        required
        className={inputCls}
      />
      {/* Lada seleccionable como en el resto del sitio (equipo, 13-ago) */}
      <PhoneField value={phone} onChange={setPhone} required />
      <label className="flex items-start gap-2.5 text-left text-[12px] leading-snug text-ink-secondary">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          className="mt-0.5 size-4 flex-none accent-[#1CBCAD]"
        />
        <span>
          Acepto recibir mi regalo y comunicaciones de Club Pata Amiga conforme
          al{" "}
          <a
            href="/legales/aviso-de-privacidad"
            target="_blank"
            className="underline"
          >
            Aviso de privacidad
          </a>
          .
        </span>
      </label>
      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-left text-[13px] font-semibold text-error-text">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="grid h-[52px] place-items-center rounded-full bg-orange text-[16px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Enviando…" : "🎁 Quiero mi regalo"}
      </button>
    </form>
  );
}
