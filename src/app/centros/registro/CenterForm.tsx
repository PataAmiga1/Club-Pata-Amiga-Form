"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { AutocompleteField } from "@/components/ui/AutocompleteField";
import { PhoneField } from "@/components/ui/PhoneField";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { FotoDocumento } from "@/components/ui/FotoDocumento";
import { TipoPersonaFields } from "@/components/ui/TipoPersonaFields";
import { WELLNESS_SERVICES, type WellnessService } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { DatosConocidos } from "@/lib/datos-conocidos";
import type { TipoPersona } from "@/lib/documentos-solicitud";
import { esRfcDeMoral } from "@/lib/rfc";
import { revisarPeso } from "@/lib/peso-adjuntos";
import { EDAD_MINIMA, esMayorDeEdad, fechaDeNacimientoDeCurp } from "@/lib/edad";
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

/**
 * `conocidos` llega del servidor cuando hay sesión: lo que la persona ya
 * capturó como miembro o embajadora (equipo, 15-ago). El nombre del CENTRO no
 * se prellena —eso sí es nuevo—, solo los datos de quien lo registra.
 */
export function CenterForm({
  conocidos,
}: {
  conocidos: DatosConocidos | null;
}) {
  const nombreDeContacto = conocidos
    ? [conocidos.firstName, conocidos.lastName, conocidos.secondLastName]
        .filter(Boolean)
        .join(" ")
    : "";
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState(nombreDeContacto);
  const [email, setEmail] = useState(conocidos?.email ?? "");
  const [phone, setPhone] = useState(conocidos?.phone ?? "");
  const [website, setWebsite] = useState("");
  const [social, setSocial] = useState<Record<string, string>>({
    facebook: "",
    instagram: "",
    tiktok: "",
  });
  const [services, setServices] = useState<WellnessService[]>([]);
  const [memberBenefit, setMemberBenefit] = useState("");
  const [locations, setLocations] = useState<LocationDraft[]>([emptyLocation()]);
  // Contraseña: la cuenta se crea al aplicar (equipo, 11-ago)
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Persona física o moral (equipo, 19-ago). Para los centros esto no es
  // "agregar una rama": es ESTRENAR la captura de documentos. Hasta hoy no se
  // les pedía ni CURP ni INE ni RFC — se validaba a quien comparte un código y
  // no al negocio al que se manda a los miembros.
  const [tipoPersona, setTipoPersona] = useState<TipoPersona>("fisica");
  const [razonSocial, setRazonSocial] = useState("");
  const [rfc, setRfc] = useState("");
  const [rfcConstancia, setRfcConstancia] = useState("");
  const [curp, setCurp] = useState(conocidos?.curp ?? "");
  const [ineFront, setIneFront] = useState("");
  const [ineBack, setIneBack] = useState("");
  const esMoral = tipoPersona === "moral";
  // La edad sale de la CURP; solo avisa cuando ya está completa y bien formada.
  const fechaDeCurp = fechaDeNacimientoDeCurp(curp);
  const menorDeEdad = Boolean(fechaDeCurp) && !esMayorDeEdad(fechaDeCurp!);
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
    if (menorDeEdad) {
      setError(
        esMoral
          ? `El representante legal tiene que ser mayor de ${EDAD_MINIMA} años.`
          : `Quien registra el centro tiene que ser mayor de ${EDAD_MINIMA} años.`,
      );
      return;
    }
    if (!ineFront || !ineBack) {
      setError(
        esMoral
          ? "Falta la INE del representante legal. Necesitamos los dos lados —frente y reverso— en foto o PDF."
          : "Falta tu INE. Necesitamos los dos lados —frente y reverso— en foto o PDF.",
      );
      return;
    }
    if (esMoral) {
      if (!razonSocial.trim()) {
        setError("Escribe la razón social de la empresa.");
        return;
      }
      if (!esRfcDeMoral(rfc)) {
        setError(
          "Revisa el RFC de la empresa: son 12 caracteres. Uno de 13 es el de una persona física.",
        );
        return;
      }
      if (!rfcConstancia) {
        setError("Falta la constancia de situación fiscal de la empresa.");
        return;
      }
    }
    // Igual que en el alta de embajador: el 413 de Vercel es mudo, así que el
    // peso se revisa aquí y se dice qué hacer (1-sep).
    const peso = revisarPeso([ineFront, ineBack, rfcConstancia]);
    if (!peso.ok) {
      setError(peso.mensaje);
      return;
    }
    setBusy(true);
    try {
      const result = await registerCenter({
        name,
        contactName,
        email,
        phone,
        website,
        socialLinks: social,
        services,
        memberBenefit,
        locations: locations.map(({ colonies: _c, ...loc }) => loc),
        password,
        tipoPersona,
        razonSocial,
        rfc,
        rfcConstancia,
        curp,
        ineFront,
        ineBack,
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
      // Si truena con documentos adjuntos, lo más probable sigue siendo el
      // peso: la petición muere en el borde y aquí no llega ni el código.
      setError(
        ineFront || ineBack || rfcConstancia
          ? "No pudimos enviar tu solicitud. Si subiste documentos pesados, prueba con una foto en vez de un PDF."
          : "Algo salió mal. Intenta de nuevo.",
      );
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
          ¡Gracias por querer unirte a la manada!
        </h2>
        <p className="text-sm leading-relaxed text-ink-secondary">
          Tu cuenta está lista. Inicia sesión con tu correo y contraseña para
          avanzar en el perfil de <strong>{name}</strong> mientras validamos la
          información. En cuanto quede listo, tu centro formará parte de nuestra
          red de centros aliados y estará visible para toda la manada.
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
        <TipoPersonaFields
          tipo={tipoPersona}
          onTipo={setTipoPersona}
          razonSocial={razonSocial}
          onRazonSocial={setRazonSocial}
          rfc={rfc}
          onRfc={setRfc}
          constancia={rfcConstancia}
          onConstancia={setRfcConstancia}
          quien="centro"
        />
      </section>

      <section className="flex flex-col gap-4 rounded-[20px] bg-white p-6 shadow-[0_2px_12px_rgba(30,83,80,.06)]">
        <h2 className="font-display text-lg text-ink-title">
          Cuéntanos de tu centro
        </h2>
        <TextField
          label="Nombre del centro"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Vet San Ángel"
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={
              esMoral
                ? "Nombre completo del representante legal"
                : "Nombre completo de contacto"
            }
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
            label="Sitio web (opcional)"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
          />
        </div>
        {/* IDENTIDAD DE QUIEN REGISTRA (equipo, 19-ago). Es lo que estrena el
            alta de centro: hasta hoy no se pedía ni un documento, así que se
            validaba al embajador que comparte un código y no al negocio al que
            se manda a los miembros. En persona moral son los datos del
            REPRESENTANTE LEGAL (decisión 1.2). */}
        <div className="flex flex-col gap-3 rounded-[14px] bg-cream/60 p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-ink-title">
              {esMoral
                ? "Identificación del representante legal"
                : "Tu identificación"}
            </span>
            <span className="text-xs text-ink-tertiary">
              Solo la ve el comité, para saber quién responde por el centro que
              vamos a publicar.
            </span>
          </div>
          <TextField
            label={esMoral ? "CURP del representante legal" : "CURP"}
            value={curp}
            onChange={(e) => setCurp(e.target.value.toUpperCase())}
            maxLength={18}
            placeholder="18 caracteres"
            hint={
              esMoral
                ? "La usamos para validar que el representante es mayor de edad."
                : "La usamos para validar que eres mayor de edad."
            }
            required
          />
          {menorDeEdad && (
            <div className="rounded-[12px] bg-error-bg px-4 py-3 text-[12.5px] leading-normal text-error-text">
              Esa CURP indica que aún no se cumplen {EDAD_MINIMA} años.{" "}
              {esMoral
                ? "El representante legal tiene que ser mayor de edad."
                : "Quien registra el centro tiene que ser mayor de edad."}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <FotoDocumento
              label="INE — frente"
              hint="El lado de la foto."
              value={ineFront}
              onChange={setIneFront}
            />
            <FotoDocumento
              label="INE — reverso"
              hint="El lado del código de barras."
              value={ineBack}
              onChange={setIneBack}
            />
          </div>
        </div>
        {/* Redes propias, cada una en su campo (equipo, 15-ago). Antes había
            un solo "sitio web o redes" donde cabía una sola cosa, así que un
            centro con Instagram y Facebook tenía que elegir cuál perder. */}
        <div className="flex flex-col gap-3 rounded-[14px] bg-cream/60 p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-ink-title">
              Tus redes sociales (opcional)
            </span>
            <span className="text-xs text-ink-tertiary">
              Aparecen en tu tarjeta del directorio para que los miembros te
              encuentren.
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["facebook", "Facebook"],
                ["instagram", "Instagram"],
                ["tiktok", "TikTok"],
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
        {/* Sin contraseña cuando ya hay sesión: la cuenta existe (15-ago). */}
        {!conocidos && (
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
        )}
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
          hint="Este beneficio aparecerá destacado en el directorio para la manada."
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
          {/* El CP se queda angosto y la colonia se lleva el resto: nombres
              como "Nueva Industrial Vallejo" salían cortados en la lista
              cerrada (equipo, 15-ago). De paso pasa a autocompletado, igual
              que en el perfil del miembro: el catálogo se equivoca o le falta
              la colonia de alguien, y así siempre se puede escribir otra. */}
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
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
            <AutocompleteField
              label="Colonia"
              options={loc.colonies}
              value={loc.colony}
              onChange={(colony) => patchLocation(i, { colony })}
              placeholder="Escribe o elige tu colonia"
              hint={
                loc.colonies.length > 0
                  ? "La sugerimos según tu código postal; si no es correcta, puedes cambiarla."
                  : undefined
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* "Alcaldía o municipio", no "Ciudad" (equipo, 15-ago): en la
                CDMX son alcaldías y en el resto del país municipios, y el
                catálogo de Sepomex devuelve justo eso. */}
            <TextField
              label="Alcaldía o municipio"
              value={loc.city}
              onChange={(e) => patchLocation(i, { city: e.target.value })}
            />
            <TextField
              label="Estado"
              value={loc.state}
              onChange={(e) => patchLocation(i, { state: e.target.value })}
            />
          </div>
          <PhoneField
            label="Teléfono de esta sucursal (opcional)"
            value={loc.phone ?? ""}
            onChange={(t) => patchLocation(i, { phone: t })}
          />
        </section>
      ))}

      <button
        type="button"
        onClick={() => setLocations((prev) => [...prev, emptyLocation()])}
        className="self-start text-sm font-semibold text-teal-deep hover:underline"
      >
        + Agregar otra sucursal
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
        Revisamos cada solicitud con detalle. Te contactaremos por correo
        electrónico para confirmar la integración de tu centro a la manada.
      </p>
    </form>
  );
}
