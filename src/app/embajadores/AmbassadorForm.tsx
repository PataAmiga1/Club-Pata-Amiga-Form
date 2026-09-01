"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { PhoneField, telefonoCompleto } from "@/components/ui/PhoneField";
import { FotoDocumento } from "@/components/ui/FotoDocumento";
import { TipoPersonaFields } from "@/components/ui/TipoPersonaFields";
import { createClient } from "@/lib/supabase/client";
import {
  EDAD_MINIMA,
  esMayorDeEdad,
  fechaDeNacimientoDeCurp,
} from "@/lib/edad";
import type { DatosConocidos } from "@/lib/datos-conocidos";
import type { TipoPersona } from "@/lib/documentos-solicitud";
import { esRfcDeMoral } from "@/lib/rfc";
import { revisarPeso } from "@/lib/peso-adjuntos";
import { registerAmbassador } from "./actions";

// Los textos legales pesan miles de líneas: el popup se carga SOLO cuando
// alguien lo abre, no viaja con la página del formulario.
const LegalPopup = dynamic(
  () => import("@/components/legal/LegalPopup").then((m) => m.LegalPopup),
  { ssr: false },
);

/**
 * `conocidos` llega del servidor cuando hay sesión: lo que la persona ya
 * capturó como miembro o en un registro anterior (equipo, 15-ago). Antes cada
 * rol volvía a preguntar lo mismo desde cero.
 */
export function AmbassadorForm({
  conocidos,
}: {
  conocidos: DatosConocidos | null;
}) {
  const [firstName, setFirstName] = useState(conocidos?.firstName ?? "");
  const [lastName, setLastName] = useState(conocidos?.lastName ?? "");
  const [email, setEmail] = useState(conocidos?.email ?? "");
  const [phone, setPhone] = useState(conocidos?.phone ?? "");
  const [curp, setCurp] = useState(conocidos?.curp ?? "");
  const [state, setState] = useState(conocidos?.state ?? "");
  const [city, setCity] = useState(conocidos?.city ?? "");
  const [isAdult, setIsAdult] = useState(false);
  const [motivation, setMotivation] = useState("");
  // Contraseña: la cuenta se crea al aplicar (equipo, 11-ago)
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Apellido materno, CP y redes sociales (equipo, 11-ago)
  const [secondLastName, setSecondLastName] = useState(
    conocidos?.secondLastName ?? "",
  );
  const [postalCode, setPostalCode] = useState(conocidos?.postalCode ?? "");
  const [social, setSocial] = useState<Record<string, string>>({
    facebook: "",
    instagram: "",
    tiktok: "",
    youtube: "",
  });
  // INE por los DOS LADOS (confirmado 13-ago). El comité la necesita para
  // aprobar y para pagar comisiones a nombre de alguien; el registro nunca la
  // había pedido, así que los embajadores dados de alta con el sitio nuevo
  // salían en el panel marcados como "falta INE" para siempre.
  const [ineFront, setIneFront] = useState("");
  const [ineBack, setIneBack] = useState("");
  // Persona física o moral (equipo, 19-ago). Por omisión física: es el caso
  // de la enorme mayoría y así el formulario se ve igual que siempre para
  // quien no necesita nada de esto.
  const [tipoPersona, setTipoPersona] = useState<TipoPersona>("fisica");
  const [razonSocial, setRazonSocial] = useState("");
  const [rfc, setRfc] = useState("");
  const [rfcConstancia, setRfcConstancia] = useState("");
  const esMoral = tipoPersona === "moral";
  // Popup de legales (equipo, 16-ago): null = cerrado
  const [legalSlug, setLegalSlug] = useState<string | null>(null);

  /**
   * El CP resuelve ciudad y estado SIN preguntarlos: la persona escribe cinco
   * dígitos y nosotros guardamos la ubicación derivada. Si el catálogo falla,
   * el alta sigue: queda el CP, que es el dato que se pidió conservar.
   */
  const onCpChange = (cp: string) => {
    const clean = cp.replace(/\D/g, "").slice(0, 5);
    setPostalCode(clean);
    if (clean.length !== 5) {
      setState("");
      setCity("");
      return;
    }
    fetch(`/api/sepomex?cp=${clean}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.found) return;
        setState(data.state ?? "");
        setCity(data.city ?? "");
      })
      .catch(() => {});
  };
  /** Lo que se le confirma en pantalla, para que sepa que el CP se entendió. */
  const ubicacion = [city, state].filter(Boolean).join(", ");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // La edad sale de la CURP. Solo avisa cuando la CURP ya está completa y bien
  // formada; mientras se escribe no tiene sentido gritarle a nadie.
  const fechaDeCurp = fechaDeNacimientoDeCurp(curp);
  const menorDeEdad = Boolean(fechaDeCurp) && !esMayorDeEdad(fechaDeCurp!);

  const submit = async () => {
    setError(null);
    if (!telefonoCompleto(phone)) {
      setError(
        "Revisa tu teléfono — con lada de México son 10 dígitos, sin el código de país.",
      );
      return;
    }
    if (menorDeEdad) {
      setError(
        `El programa de embajadores es para mayores de ${EDAD_MINIMA} años.`,
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
    // El peso se revisa ANTES de enviar: si se pasa, Vercel corta la petición
    // con un 413 que el navegador no puede leer y el formulario solo alcanzaría
    // a decir "algo salió mal" (1-sep).
    const peso = revisarPeso([ineFront, ineBack, rfcConstancia]);
    if (!peso.ok) {
      setError(peso.mensaje);
      return;
    }
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
        motivation,
        password,
        secondLastName,
        postalCode,
        socialLinks: social,
        ineFront,
        ineBack,
        tipoPersona,
        razonSocial,
        rfc,
        rfcConstancia,
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
      {conocidos && (
        <div className="rounded-[12px] bg-info-bg px-4 py-3 text-[12.5px] leading-relaxed text-info-text">
          Llenamos lo que ya sabemos de ti con los datos de tu cuenta. Revísalos
          y corrige lo que haya cambiado.
        </div>
      )}
      <TipoPersonaFields
        tipo={tipoPersona}
        onTipo={setTipoPersona}
        razonSocial={razonSocial}
        onRazonSocial={setRazonSocial}
        rfc={rfc}
        onRfc={setRfc}
        constancia={rfcConstancia}
        onConstancia={setRfcConstancia}
        quien="embajador"
      />
      {esMoral && (
        <div className="rounded-[12px] bg-info-bg px-4 py-3 text-[12.5px] leading-relaxed text-info-text">
          Lo que sigue son los datos del <strong>representante legal</strong> —
          quien responde por la empresa. La CURP y la identificación son suyas.
        </div>
      )}
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
          hint="Elige tu país si no es México."
        />
      </div>
      {/* Sin contraseña cuando YA hay sesión: la cuenta existe y pedirla otra
          vez solo confunde. La acción del servidor ya la trata como opcional
          en ese caso (equipo, 15-ago). */}
      {!conocidos && (
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
      )}
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
      {/* INE por los dos lados: el comité valida identidad con ella y las
          comisiones se pagan a nombre de esa persona (equipo, 13-ago). */}
      <div className="flex flex-col gap-3 rounded-[14px] bg-cream/60 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-ink-title">
            {esMoral
              ? "Identificación oficial del representante legal (INE)"
              : "Tu identificación oficial (INE)"}
          </span>
          <span className="text-xs text-ink-tertiary">
            {esMoral
              ? "Los dos lados, en foto o PDF. Solo la ve el comité, para saber quién responde por la empresa."
              : "Los dos lados, en foto o PDF. Solo la ve el comité, para validar tu identidad y pagarte tus comisiones a tu nombre."}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FotoDocumento
            label="INE — frente"
            hint="El lado de tu foto."
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
      {/* Del domicilio solo queda el CP (Pablo, 19-ago). Colonia, ciudad y
          estado se pedían y NO se usaban para nada: ni para pagar comisiones
          —el archivo del banco lleva CLABE, nombre y monto— ni para lo fiscal,
          que opera con RFC. Se mostraban y ya. Con el CP basta para la
          estadística, y ciudad y estado se derivan solos del catálogo. */}
      <TextField
        label="Código postal"
        value={postalCode}
        onChange={(e) => onCpChange(e.target.value)}
        inputMode="numeric"
        placeholder="5 dígitos"
        hint={
          ubicacion
            ? `Te ubicamos en ${ubicacion}.`
            : "Lo usamos para saber en qué zonas está la manada."
        }
      />
      {/* La fecha de nacimiento YA NO se teclea (Pablo, 19-ago): sale de la
          CURP, que aquí es obligatoria y con formato validado. Antes se pedían
          las dos y la que de verdad protegía era la CURP —quien escribía una
          fecha falsa de adulto quedaba fuera igual—, así que el campo solo
          agregaba un paso. Mismo criterio que el alta de miembro del 16-ago. */}
      {menorDeEdad && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-[12.5px] leading-normal text-error-text">
          Tu CURP indica que aún no cumples {EDAD_MINIMA} años, así que todavía
          no puedes ser embajador. ¡Te esperamos cuando los cumplas! 🐾
        </div>
      )}
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

      {/* Legales antes del botón (equipo, 16-ago). Se leen en el mismo popup
          que en el registro de miembro: no navegan fuera, así que nadie pierde
          lo que ya llenó del formulario. */}
      <p className="text-[12.5px] leading-normal text-ink-tertiary">
        Al enviar tu solicitud aceptas los{" "}
        <button
          type="button"
          onClick={() => setLegalSlug("terminos-y-condiciones")}
          className="font-semibold text-teal-deep underline"
        >
          Términos y condiciones
        </button>{" "}
        y el{" "}
        <button
          type="button"
          onClick={() => setLegalSlug("aviso-de-privacidad")}
          className="font-semibold text-teal-deep underline"
        >
          Aviso de privacidad
        </button>
        .
      </p>
      {legalSlug && (
        <LegalPopup
          initialSlug={legalSlug}
          onClose={() => setLegalSlug(null)}
        />
      )}

      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm font-semibold text-error-text">
          {error}
        </div>
      )}

      <Button type="submit" disabled={busy || menorDeEdad}>
        {busy ? "Enviando…" : "Quiero ser embajador"}
      </Button>
    </form>
  );
}
