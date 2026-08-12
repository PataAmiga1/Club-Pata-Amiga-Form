"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TextField, SelectField } from "@/components/ui/Field";
import { PhoneField } from "@/components/ui/PhoneField";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { WELLNESS_SERVICES, type WellnessService } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { registerCenter, type CenterLocationInput } from "./actions";

type LocationDraft = CenterLocationInput & { colonies: string[] };

const emptyLocation = (): LocationDraft => ({
  address: "",
  postalCode: "",
  colony: "",
  city: "",
  state: "",
  phone: "",
  colonies: [],
});

export function CenterForm() {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [services, setServices] = useState<WellnessService[]>([]);
  const [memberBenefit, setMemberBenefit] = useState("");
  const [locations, setLocations] = useState<LocationDraft[]>([emptyLocation()]);
  // Contraseña: la cuenta se crea al aplicar (equipo, 11-ago)
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const toggleService = (s: WellnessService) =>
    setServices((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const patchLocation = (i: number, patch: Partial<LocationDraft>) =>
    setLocations((prev) =>
      prev.map((loc, idx) => (idx === i ? { ...loc, ...patch } : loc)),
    );

  const onCpChange = (i: number, cp: string) => {
    patchLocation(i, { postalCode: cp });
    if (cp.length !== 5) return;
    fetch(`/api/sepomex?cp=${cp}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.found) return;
        patchLocation(i, {
          state: data.state ?? "",
          city: data.city ?? "",
          colonies: data.colonies ?? [],
          colony: (data.colonies ?? [])[0] ?? "",
        });
      })
      .catch(() => {});
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await registerCenter({
        name,
        contactName,
        email,
        phone,
        website,
        services,
        memberBenefit,
        locations: locations.map(({ colonies: _c, ...loc }) => loc),
        password,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      // La cuenta ya quedó creada del lado del servidor: iniciamos sesión y lo
      // dejamos en su panel, donde puede completar su perfil mientras el comité
      // resuelve (equipo, 11-ago).
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
      // llegar al servidor antes de pintar el panel.
      window.location.assign("/centro");
      return;
    } catch {
      setError("Algo salió mal. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-4 rounded-[20px] bg-white p-8 text-center shadow-[0_2px_12px_rgba(30,83,80,.06)]">
        <span className="text-[42px]" aria-hidden>
          🎉
        </span>
        <h2 className="font-display text-[24px] text-ink-title">
          ¡Solicitud recibida!
        </h2>
        <p className="text-sm leading-relaxed text-ink-secondary">
          Tu cuenta ya quedó creada. Inicia sesión con tu correo y contraseña
          para entrar a tu panel y completar el perfil de{" "}
          <strong>{name}</strong> mientras el comité revisa la solicitud. Al ser
          aprobado, tu centro aparecerá en el directorio para toda la manada.
        </p>
        <Link
          href="/iniciar-sesion?next=/centro"
          className="font-semibold text-teal-deep hover:underline"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex w-full max-w-[640px] flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <section className="flex flex-col gap-4 rounded-[20px] bg-white p-6 shadow-[0_2px_12px_rgba(30,83,80,.06)]">
        <h2 className="font-display text-lg text-ink-title">Tu centro</h2>
        <TextField
          label="Nombre del centro"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Vet San Ángel"
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nombre completo de contacto"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="Sitio web o redes (opcional)"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
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
          hint="Con ella entras a tu panel para completar tu perfil, aunque tu solicitud siga en revisión."
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
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-title">
            Servicios que ofreces
          </span>
          <div className="flex flex-wrap gap-2">
            {(
              Object.entries(WELLNESS_SERVICES) as [
                WellnessService,
                (typeof WELLNESS_SERVICES)[WellnessService],
              ][]
            ).map(([key, svc]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleService(key)}
                className={
                  services.includes(key)
                    ? "rounded-full bg-teal px-4 py-2 text-[13px] font-bold text-white"
                    : "rounded-full border-[1.5px] border-border-input bg-white px-4 py-2 text-[13px] font-semibold text-ink-secondary transition-colors hover:border-teal"
                }
              >
                {svc.emoji} {svc.label}
              </button>
            ))}
          </div>
        </div>
        <TextField
          label="Beneficio para miembros"
          value={memberBenefit}
          onChange={(e) => setMemberBenefit(e.target.value)}
          placeholder='Ej. "10% en consultas"'
          hint="Es el gancho que verán los miembros en el directorio."
          required
        />
      </section>

      {locations.map((loc, i) => (
        <section
          key={i}
          className="flex flex-col gap-4 rounded-[20px] bg-white p-6 shadow-[0_2px_12px_rgba(30,83,80,.06)]"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink-title">
              {locations.length > 1 ? `Ubicación ${i + 1}` : "Ubicación"}
            </h2>
            {locations.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLocations((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="text-[13px] font-semibold text-error-text hover:underline"
              >
                Quitar
              </button>
            )}
          </div>
          <AddressAutocomplete
            label="Dirección (calle y número)"
            value={loc.address}
            onChange={(address) => patchLocation(i, { address })}
            onPlaceSelect={(place) => {
              // Google llenó la dirección: completa CP/colonia/ciudad/estado.
              // Si trae CP, dispara también la búsqueda Sepomex (colonias).
              patchLocation(i, {
                address: place.address || loc.address,
                colony: place.colony || loc.colony,
                city: place.city || loc.city,
                state: place.state || loc.state,
              });
              if (place.postalCode) onCpChange(i, place.postalCode);
            }}
            required
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Código postal"
              inputMode="numeric"
              maxLength={5}
              value={loc.postalCode}
              onChange={(e) =>
                onCpChange(i, e.target.value.replace(/\D/g, ""))
              }
              required
            />
            {loc.colonies.length > 0 ? (
              <SelectField
                label="Colonia"
                value={loc.colony}
                onChange={(e) => patchLocation(i, { colony: e.target.value })}
              >
                {loc.colonies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
            ) : (
              <TextField
                label="Colonia"
                value={loc.colony}
                onChange={(e) => patchLocation(i, { colony: e.target.value })}
              />
            )}
            <TextField
              label="Ciudad"
              value={loc.city}
              onChange={(e) => patchLocation(i, { city: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Estado"
              value={loc.state}
              onChange={(e) => patchLocation(i, { state: e.target.value })}
            />
            <TextField
              label="Teléfono de esta sucursal (opcional)"
              type="tel"
              value={loc.phone ?? ""}
              onChange={(e) => patchLocation(i, { phone: e.target.value })}
            />
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={() => setLocations((prev) => [...prev, emptyLocation()])}
        className="self-start text-sm font-semibold text-teal-deep hover:underline"
      >
        + Agregar otra ubicación
      </button>

      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm font-semibold text-error-text">
          {error}
        </div>
      )}

      <Button type="submit" disabled={busy}>
        {busy ? "Enviando…" : "Enviar solicitud"}
      </Button>
      <p className="pb-8 text-center text-xs leading-relaxed text-ink-tertiary">
        El comité revisa cada solicitud. Te contactaremos por correo con la
        resolución.
      </p>
    </form>
  );
}
