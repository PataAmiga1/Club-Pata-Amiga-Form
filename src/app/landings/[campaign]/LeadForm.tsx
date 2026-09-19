"use client";

import { useEffect, useState } from "react";
import { PhoneField } from "@/components/ui/PhoneField";
import { registerLead } from "./actions";

/** Segundos que se queda la pantalla de «listo» en modo kiosco antes de limpiarse. */
const SEGUNDOS_KIOSCO = 15;

/**
 * Formulario de registro de la landing: nombre, apellidos, correo, teléfono.
 * Las landings de guía (ExpoCan) cambian apellidos por edad y dejan bajar el
 * PDF al terminar. Con `?kiosco=1` (la tablet del stand) el formulario se
 * limpia solo para la siguiente persona.
 */
export function LeadForm({
  campaign,
  tipo,
  campos,
  pdfUrl,
  pdfLabel,
  kiosco = false,
  utm,
}: {
  campaign: string;
  tipo: "regalo" | "lista_espera" | "guia";
  campos?: { apellidos?: boolean; edad?: boolean };
  pdfUrl?: string | null;
  pdfLabel?: string;
  kiosco?: boolean;
  utm: { source?: string; medium?: string; campaign?: string };
}) {
  const lista = tipo === "lista_espera";
  const guia = tipo === "guia";
  const pideApellidos = campos?.apellidos !== false;
  const pideEdad = campos?.edad === true;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [repetido, setRepetido] = useState(false);

  function otraPersona() {
    setFirstName("");
    setLastName("");
    setAge("");
    setEmail("");
    setPhone("");
    setConsent(false);
    setError(null);
    setRepetido(false);
    setDone(false);
  }

  // En el stand, la pantalla de «listo» se limpia sola para quien sigue.
  useEffect(() => {
    if (!kiosco || !done) return;
    const t = window.setTimeout(otraPersona, SEGUNDOS_KIOSCO * 1000);
    return () => window.clearTimeout(t);
  }, [kiosco, done]);

  const inputCls =
    "h-12 w-full rounded-[12px] border-[1.5px] border-border-input bg-white px-4 text-[15px] text-ink-title outline-none placeholder:text-ink-placeholder focus:border-teal";

  if (done) {
    return (
      <div className="flex w-full flex-col items-center gap-3 rounded-[20px] bg-white p-7 shadow-[0_16px_44px_rgba(30,83,80,.25)]">
        <span className="text-[46px]" aria-hidden>
          {lista ? "🐾" : guia ? "📘" : "📬"}
        </span>
        <h2 className="font-display text-[24px] leading-tight text-ink-title">
          ¡Listo, {firstName.trim().split(" ")[0]}!
        </h2>
        <p className="text-sm leading-relaxed text-ink-secondary">
          {lista ? (
            <>
              Ya estás en la lista. Te avisaremos a{" "}
              <strong>{email.trim()}</strong> en cuanto abra el registro.
            </>
          ) : guia ? (
            repetido ? (
              <>
                Ya te habías registrado con <strong>{email.trim()}</strong>: la
                guía está en ese correo (revisa también spam o promociones).
              </>
            ) : (
              <>
                Te enviamos la guía a <strong>{email.trim()}</strong>. Si no la
                ves en unos minutos, revisa la carpeta de spam o promociones.
              </>
            )
          ) : (
            <>
              Tu regalo va en camino a <strong>{email.trim()}</strong>. Si no
              lo ves en unos minutos, revisa la carpeta de spam o promociones.
            </>
          )}
        </p>
        {/* En la tablet del stand no se descarga: la guía va al correo. */}
        {guia && pdfUrl && !kiosco && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="mt-1 grid h-[52px] w-full place-items-center rounded-full bg-orange px-5 text-[16px] font-bold text-white transition-opacity hover:opacity-90"
          >
            {pdfLabel ?? "📘 Descargar la guía"}
          </a>
        )}
        {(guia || kiosco) && (
          <button
            type="button"
            onClick={otraPersona}
            className="text-[13px] font-bold text-teal-deep underline underline-offset-2"
          >
            {kiosco
              ? `Registrar a otra persona (se limpia en ${SEGUNDOS_KIOSCO} s)`
              : "Registrar a otra persona"}
          </button>
        )}
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
            age,
            email,
            phone,
            consent,
            utm,
            // El código se guardó al llegar por un link de embajador
            // (StashAmbassadorCode); el URL manda si trae uno.
            ambassadorCode:
              new URLSearchParams(window.location.search).get("codigo") ??
              window.localStorage.getItem("pa_ambassador_code") ??
              undefined,
          });
          if (result.error) setError(result.error);
          else {
            setRepetido(Boolean(result.repetido));
            setDone(true);
          }
        } catch {
          setError("Algo salió mal. Intenta de nuevo.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="text-left font-display text-[19px] text-ink-title">
        {lista
          ? "Déjanos tus datos"
          : guia
            ? "Regístrate y recibe tu guía"
            : "Regístrate y recibe tu regalo"}
      </span>
      <div
        className={
          pideEdad ? "grid grid-cols-[1fr_96px] gap-3" : "grid gap-3 sm:grid-cols-2"
        }
      >
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Nombre"
          autoComplete={kiosco ? "off" : pideApellidos ? "given-name" : "name"}
          required
          className={inputCls}
        />
        {pideApellidos && (
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Apellidos"
            autoComplete={kiosco ? "off" : "family-name"}
            required
            className={inputCls}
          />
        )}
        {pideEdad && (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            placeholder="Edad"
            aria-label="Edad (años)"
            required
            className={inputCls}
          />
        )}
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Correo electrónico"
        autoComplete={kiosco ? "off" : "email"}
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
          {lista
            ? "Acepto que Club Pata Amiga me avise sobre la nueva membresía y me envíe comunicaciones conforme al"
            : guia
              ? "Acepto recibir la guía y comunicaciones de Club Pata Amiga conforme al"
              : "Acepto recibir mi regalo y comunicaciones de Club Pata Amiga conforme al"}{" "}
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
        {busy
          ? "Enviando…"
          : lista
            ? "🔔 Avísenme cuando abra"
            : guia
              ? "📘 Quiero mi guía"
              : "🎁 Quiero mi regalo"}
      </button>
    </form>
  );
}
