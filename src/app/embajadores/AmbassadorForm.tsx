"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TextField, SelectField } from "@/components/ui/Field";
import { PhoneField } from "@/components/ui/PhoneField";
import { createClient } from "@/lib/supabase/client";
import { registerAmbassador } from "./actions";

export function AmbassadorForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [curp, setCurp] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  // Fecha de nacimiento y motivación (equipo, 5-ago)
  const [birthDate, setBirthDate] = useState("");
  const [motivation, setMotivation] = useState("");
  // Contraseña: la cuenta se crea al aplicar (equipo, 11-ago)
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Apellido materno, CP y redes sociales (equipo, 11-ago)
  const [secondLastName, setSecondLastName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [colony, setColony] = useState("");
  const [colonies, setColonies] = useState<string[]>([]);
  const [social, setSocial] = useState<Record<string, string>>({
    facebook: "",
    instagram: "",
    tiktok: "",
    youtube: "",
  });

  /** CP → colonia y alcaldía/municipio. Editable: el catálogo puede fallar. */
  const onCpChange = (cp: string) => {
    const clean = cp.replace(/\D/g, "").slice(0, 5);
    setPostalCode(clean);
    if (clean.length !== 5) return;
    fetch(`/api/sepomex?cp=${clean}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.found) return;
        setState(data.state ?? "");
        setCity(data.city ?? "");
        setColonies(data.colonies ?? []);
        setColony((data.colonies ?? [])[0] ?? "");
      })
      .catch(() => {});
  };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await registerAmbassador({
        firstName,
        lastName,
        email,
        phone,
        curp,
        state,
        city,
        isAdult,
        birthDate,
        motivation,
        password,
        secondLastName,
        postalCode,
        colony,
        socialLinks: social,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      // La cuenta ya quedó creada del lado del servidor: iniciamos sesión y lo
      // dejamos en su portal, que muestra el estado "en revisión" y le permite
      // completar su perfil mientras el comité resuelve (equipo, 11-ago).
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        // No lo dejamos colgado: la solicitud sí se guardó.
        setDone(true);
        return;
      }
      // Navegación completa (no router.push): la cookie de sesión tiene que
      // llegar al servidor antes de pintar el portal.
      window.location.assign("/embajador");
      return;
    } catch {
      setError("Algo salió mal. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[20px] bg-white p-8 text-center shadow-[0_2px_12px_rgba(30,83,80,.06)]">
        <span className="text-[42px]" aria-hidden>
          🎉
        </span>
        <h2 className="font-display text-[24px] text-ink-title">
          ¡Solicitud recibida!
        </h2>
        <p className="text-sm leading-relaxed text-ink-secondary">
          Tu cuenta ya quedó creada. Inicia sesión con tu correo y contraseña
          para entrar a tu portal y completar tu perfil mientras el comité
          revisa tu solicitud. Al ser aprobada, recibirás tu código único de
          embajador para empezar a compartir.
        </p>
        <Link
          href="/iniciar-sesion?next=/embajador"
          className="font-semibold text-teal-deep hover:underline"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-[20px] bg-white p-6 shadow-[0_2px_12px_rgba(30,83,80,.06)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Nombre(s)"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <TextField
          label="Apellido paterno"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
        <TextField
          label="Apellido materno"
          value={secondLastName}
          onChange={(e) => setSecondLastName(e.target.value)}
        />
      </div>
      {/* `min-w-0` en los hijos: PhoneField trae el prefijo +52 en una caja que
          no encoge, y como ítem de grid (min-width:auto) empujaba el ancho de
          toda la página 6px fuera del viewport en 375px. */}
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <TextField
          label="Correo electrónico"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <PhoneField
          label="Teléfono"
          required
          value={phone}
          onChange={setPhone}
          hint="10 dígitos, sin lada internacional."
        />
      </div>
      <TextField
        label="Contraseña"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        placeholder="Mínimo 8 caracteres"
        hint="Con ella entras a tu portal de embajador, aunque tu solicitud siga en revisión."
        required
        rightSlot={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-[13px] font-semibold text-teal-deep"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        }
      />
      <TextField
        label="CURP"
        value={curp}
        onChange={(e) => setCurp(e.target.value.toUpperCase())}
        maxLength={18}
        placeholder="18 caracteres"
        hint="La usamos para validar que eres mayor de edad."
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Código postal"
          value={postalCode}
          onChange={(e) => onCpChange(e.target.value)}
          inputMode="numeric"
          placeholder="5 dígitos"
          hint="Completa tu colonia y alcaldía o municipio."
        />
        {colonies.length > 0 ? (
          <SelectField
            label="Colonia"
            value={colony}
            onChange={(e) => setColony(e.target.value)}
          >
            {colonies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField
            label="Colonia"
            value={colony}
            onChange={(e) => setColony(e.target.value)}
          />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Ciudad, alcaldía o municipio"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <TextField
          label="Estado"
          value={state}
          onChange={(e) => setState(e.target.value)}
        />
      </div>
      <TextField
        label="Fecha de nacimiento"
        type="date"
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
      />
      <TextField
        label="¿Por qué quieres ser embajador?"
        value={motivation}
        onChange={(e) => setMotivation(e.target.value)}
        placeholder="Cuéntanos tu motivación en una o dos líneas"
      />
      {/* Al menos una red es obligatoria: es como el comité valora el alcance
          real de quien solicita (equipo, 11-ago). */}
      <div className="flex flex-col gap-3 rounded-[14px] bg-cream/60 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-ink-title">
            Tus redes sociales
          </span>
          <span className="text-xs text-ink-tertiary">
            Llena al menos una. Es lo que revisa el comité para conocer tu
            alcance.
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["facebook", "Facebook"],
              ["instagram", "Instagram"],
              ["tiktok", "TikTok"],
              ["youtube", "YouTube"],
            ] as const
          ).map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              value={social[key] ?? ""}
              onChange={(e) =>
                setSocial((prev) => ({ ...prev, [key]: e.target.value }))
              }
              placeholder="usuario o liga"
            />
          ))}
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-secondary">
        <input
          type="checkbox"
          checked={isAdult}
          onChange={(e) => setIsAdult(e.target.checked)}
          className="mt-0.5 size-4 accent-[#1CBCAD]"
        />
        Confirmo que soy mayor de edad y acepto que el comité revise mi
        solicitud.
      </label>

      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm font-semibold text-error-text">
          {error}
        </div>
      )}

      <Button type="submit" disabled={busy}>
        {busy ? "Enviando…" : "Quiero ser embajador"}
      </Button>
    </form>
  );
}
