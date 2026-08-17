"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/ui/Field";
import { AutocompleteField } from "@/components/ui/AutocompleteField";
import { PhoneField } from "@/components/ui/PhoneField";
import { Button } from "@/components/ui/Button";
import { nombresDePaises } from "@/data/countries";
import {
  EDAD_MINIMA,
  esMayorDeEdad,
  fechaDeNacimientoDeCurp,
  fechaMaximaParaSerMayor,
} from "@/lib/edad";
import { avisarMenorDeEdad } from "./actions";

import { validateCurp, curpCoincide } from "@/lib/curp";

type Initial = {
  first_name?: string | null;
  last_name?: string | null;
  mother_last_name?: string | null;
  phone?: string | null;
  curp?: string | null;
  birth_date?: string | null;
  nationality?: string | null;
  postal_code?: string | null;
  state?: string | null;
  city?: string | null;
  colony?: string | null;
  street?: string | null;
  number_ext?: string | null;
  number_int?: string | null;
};

function DocUpload({
  side,
  label,
  fileName,
  onUploaded,
  userId,
}: {
  side: "ine_front" | "ine_back" | "passport";
  label: string;
  fileName: string | null;
  onUploaded: (name: string) => void;
  userId: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const uploaded = Boolean(fileName);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(false);
    const supabase = createClient();
    const path = `${userId}/${side}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("ine-documents")
      .upload(path, file);
    if (upErr) {
      setError(true);
      setBusy(false);
      return;
    }
    await supabase.from("documents").insert({
      user_id: userId,
      document_type: side,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
    });
    onUploaded(file.name);
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className={
        uploaded
          ? "flex flex-col items-center gap-1 rounded-[14px] border-[1.5px] border-[#D4EDD4] bg-[#F4FAF4] p-[18px]"
          : "flex flex-col items-center gap-1 rounded-[14px] border-2 border-dashed border-[#C9E9E4] bg-[#F2FAF9] p-[18px] transition-colors hover:border-teal"
      }
    >
      {/* `application/pdf` explícito además de la extensión: en algunos
          Android el filtro por ".pdf" a secas deja los PDF en gris y no se
          pueden elegir (equipo, 15-ago). */}
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf,.pdf"
        className="hidden"
        onChange={handleFile}
      />
      <span className="text-xl" aria-hidden>
        {uploaded ? "✅" : "🪪"}
      </span>
      <span
        className={`text-[13px] font-semibold ${uploaded ? "text-success-text" : "text-teal-deep"}`}
      >
        {label}
      </span>
      <span className="max-w-full truncate text-[11px] text-ink-tertiary">
        {busy
          ? "Subiendo…"
          : error
            ? "Error, intenta de nuevo"
            : (fileName ?? "Subir archivo")}
      </span>
      {!uploaded && (
        <span className="text-[11px] text-ink-tertiary">JPG, PNG o PDF</span>
      )}
    </button>
  );
}

export function ProfileForm({
  userId,
  initial,
  passport,
  avatarUrl,
}: {
  userId: string;
  initial: Initial;
  /** Nombre de archivo del pasaporte ya subido (solo extranjeros). */
  passport: string | null;
  /** Foto de perfil ya guardada (equipo, 11-ago). */
  avatarUrl: string | null;
}) {
  const router = useRouter();
  // Nombre desglosado (equipo, 5-ago): nombres, apellido paterno y materno
  // en campos propios — antes era un solo "Nombre completo".
  const [firstName, setFirstName] = useState(initial.first_name ?? "");
  const [lastName, setLastName] = useState(initial.last_name ?? "");
  const [motherLastName, setMotherLastName] = useState(
    initial.mother_last_name ?? "",
  );
  const [birthDate, setBirthDate] = useState(initial.birth_date ?? "");
  const [nationality, setNationality] = useState(initial.nationality ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [curp, setCurp] = useState(initial.curp ?? "");
  const [cp, setCp] = useState(initial.postal_code ?? "");
  const [stateMx, setStateMx] = useState(initial.state ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [colony, setColony] = useState(initial.colony ?? "");
  const [colonies, setColonies] = useState<string[]>(
    initial.colony ? [initial.colony] : [],
  );
  const [street, setStreet] = useState(initial.street ?? "");
  const [numExt, setNumExt] = useState(initial.number_ext ?? "");
  const [numInt, setNumInt] = useState(initial.number_int ?? "");
  const [passportFile, setPassportFile] = useState(passport);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Foto de perfil (equipo, 11-ago): el círculo que el equipo marcó en rojo.
  // OPCIONAL y no cuenta para el 100% (mismo criterio que el INE del 10-ago).
  // Se guarda al momento de subirla — no espera al botón de guardar.
  const [avatar, setAvatar] = useState(avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Un solo aviso al equipo por menor de edad, aunque insista en guardar.
  const avisoMenorEnviado = useRef(false);

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    const supabase = createClient();
    const path = `${userId}/avatar-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file);
    if (upErr) {
      setAvatarBusy(false);
      setMessage("No pudimos subir tu foto. Intenta de nuevo.");
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: saveErr } = await supabase
      .from("profiles")
      .update({ avatar_url: pub.publicUrl })
      .eq("id", userId);
    setAvatarBusy(false);
    if (saveErr) {
      setMessage("No pudimos guardar tu foto. Intenta de nuevo.");
      return;
    }
    setAvatar(pub.publicUrl);
  }

  // Extranjeros: suben PASAPORTE en lugar de CURP — no pueden tener CURP
  // (equipo, 11-ago). Nacionalidad vacía se trata como mexicana.
  const esExtranjero = (() => {
    const n = nationality
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return (
      n.length > 0 && !["mexicana", "mexicano", "mexico", "mx"].includes(n)
    );
  })();

  // Nacionalidad con sugerencias, no texto libre a secas (equipo, 13 y 15-ago):
  // llegaban valores a medio escribir ("Chil") y con eso no hay forma de saber
  // si la persona es extranjera y le toca pasaporte. Lo que ya estaba guardado
  // se respeta aunque no coincida con el catálogo — el campo acepta texto
  // libre, así que a nadie se le borra lo suyo por no estar en la lista.
  const listaPaises = nombresDePaises();

  const curpValid = validateCurp(curp).isValid;

  // Mayoría de edad (equipo, 13-ago). Desde el 16-ago el alta ya NO pregunta la
  // fecha —se acortó el registro—, así que ESTE es el punto donde se comprueba
  // que el titular tenga 18, ya con la membresía pagada.
  //
  // Para mexicanos la fecha no se teclea: la trae la CURP, que es un dato
  // oficial y no se puede maquillar para pasar el filtro. Solo los extranjeros
  // (pasaporte, sin CURP) la capturan a mano.
  const fechaDeCurp = !esExtranjero && curpValid
    ? fechaDeNacimientoDeCurp(curp)
    : null;
  useEffect(() => {
    if (fechaDeCurp && fechaDeCurp !== birthDate) setBirthDate(fechaDeCurp);
  }, [fechaDeCurp, birthDate]);

  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(birthDate);
  const menorDeEdad = fechaValida && !esMayorDeEdad(birthDate);
  // Cruce CURP ↔ datos: SOLO MARCA, no bloquea (decisión de Pablo, 5-ago)
  const cruceCurp = curpValid
    ? curpCoincide(curp, {
        nombres: firstName,
        apellidoPaterno: lastName,
        apellidoMaterno: motherLastName,
        birthDate: birthDate || null,
      })
    : null;

  // Sepomex lookup when a full CP is typed
  useEffect(() => {
    if (!/^\d{5}$/.test(cp)) return;
    let cancelled = false;
    fetch(`/api/sepomex?cp=${cp}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.found) return;
        setStateMx(data.state);
        setCity(data.city);
        setColonies(data.colonies);
        if (!data.colonies.includes(colony)) setColony(data.colonies[0] ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp]);

  // Nacionalidad y fecha de nacimiento son obligatorias para el 100%
  // (decisión de Pablo, 5-ago). El INE se dejó de pedir a miembros por
  // completo (equipo, 11-ago). La identificación vale 25%: CURP válida para
  // mexicanos, pasaporte subido para extranjeros.
  // OJO con los Boolean(): sin ellos, un string en el && produce
  // Number("Av...") = NaN (hallazgo del equipo).
  const identidadOk = esExtranjero ? Boolean(passportFile) : curpValid;
  const completion =
    25 * Number(firstName.trim().length > 0 && lastName.trim().length > 0) +
    25 * Number(identidadOk) +
    // Una fecha que deja a la persona por debajo de los 18 no cuenta: el
    // titular de la membresía tiene que ser mayor de edad.
    15 * Number(fechaValida && !menorDeEdad) +
    10 * Number(nationality.trim().length > 0) +
    25 * Number(Boolean(cp.length === 5 && colony && street));

  async function save(finalize: boolean) {
    if (menorDeEdad) {
      setMessage(
        `El titular de la membresía debe tener ${EDAD_MINIMA} años o más. Revisa tu fecha de nacimiento.`,
      );
      // La membresía ya está pagada a estas alturas: el equipo tiene que
      // enterarse para reembolsar y cancelar. Se avisa una sola vez por sesión
      // —no en cada intento de guardar— y nunca frena la pantalla.
      if (!avisoMenorEnviado.current) {
        avisoMenorEnviado.current = true;
        avisarMenorDeEdad(birthDate).catch(() => {
          avisoMenorEnviado.current = false;
        });
      }
      return;
    }
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        mother_last_name: motherLastName.trim() || null,
        birth_date: fechaValida ? birthDate : null,
        nationality: nationality.trim() || null,
        phone: phone || null,
        // Extranjeros no tienen CURP: si cambió su nacionalidad después de
        // haber tecleado una, no se guarda basura.
        curp: esExtranjero ? null : curp ? curp.toUpperCase() : null,
        postal_code: cp || null,
        state: stateMx || null,
        city: city || null,
        colony: colony || null,
        street: street || null,
        number_ext: numExt || null,
        number_int: numInt || null,
        street_address:
          [street, numExt && `#${numExt}`, numInt && `Int. ${numInt}`]
            .filter(Boolean)
            .join(" ") || null,
        profile_completed: completion === 100,
      })
      .eq("id", userId);

    setSaving(false);
    if (error) {
      setMessage("No pudimos guardar. Intenta de nuevo.");
      return;
    }
    if (finalize && completion === 100) {
      // El registro dejó a los peludos con lo mínimo (tipo, nombre y edad),
      // así que en cuanto el contratante queda completo se sigue con ELLOS,
      // uno por uno, en vez de devolver a la persona al inicio a que adivine
      // qué falta (PM, 12-ago).
      const { data: pendientes } = await supabase
        .from("pets")
        .select("id, breed, sex, photo_url")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      const siguiente = (pendientes ?? []).find(
        (p) => !p.breed || !p.sex || !p.photo_url,
      );
      router.push(siguiente ? `/app/peludos/${siguiente.id}?completar=1` : "/app");
    } else if (finalize) {
      setMessage(
        "Guardado. Aún faltan datos o documentos para completar el perfil.",
      );
    } else {
      router.push("/app");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          {/* El círculo que el equipo marcó en rojo: ahora ES la foto de
              perfil, opcional y subible aquí mismo (equipo, 11-ago) */}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarBusy}
            title="Foto de perfil (opcional) — toca para cambiarla"
            className="relative grid size-16 flex-none place-items-center overflow-hidden rounded-full border-2 border-dashed border-[#C9E9E4] bg-[#F2FAF9] text-[22px] transition-colors hover:border-teal"
          >
            {avatarBusy ? (
              "…"
            ) : avatar ? (
              // Absoluta: height 100% en fila auto de grid se resuelve como
              // auto y el círculo muestra la franja superior, no el centro
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="Tu foto de perfil" className="absolute inset-0 size-full object-cover" />
            ) : (
              "📷"
            )}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFile}
          />
          <div className="min-w-0">
            <h1 className="font-display text-[28px] text-ink-title md:text-[34px]">
              Completa tu perfil
            </h1>
            <p className="mt-1.5 text-[14.5px] text-ink-secondary">
              Necesitamos estos datos para confirmar tu información y habilitar
              tus reintegros. La foto es opcional.
            </p>
          </div>
        </div>
        <div className="grid size-16 flex-none place-items-center rounded-full bg-white shadow-[0_2px_10px_rgba(30,83,80,.08)]">
          <span className="font-display text-base text-teal-deep">
            {completion}%
          </span>
        </div>
      </div>

      {/* Form envolvente: Enter en cualquier campo = "Finalizar perfil" (paso siguiente) */}
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          save(true);
        }}
      >
      <section className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          TUS DATOS
        </span>
        <TextField
          label="Nombre(s)"
          placeholder="Como aparece en tu identificación"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
        />
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <TextField
            label="Apellido paterno"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
          <TextField
            label="Apellido materno"
            value={motherLastName}
            onChange={(e) => setMotherLastName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {/* La fecha la dicta la CURP cuando hay una válida (Pablo, 16-ago):
              se muestra solo lectura para que la persona vea de dónde sale y no
              pueda escribir otra distinta a la de su documento oficial. Si aún
              no hay CURP —o es extranjera— se captura a mano como siempre. */}
          <TextField
            label="Fecha de nacimiento"
            type="date"
            value={birthDate}
            max={fechaMaximaParaSerMayor()}
            onChange={(e) => setBirthDate(e.target.value)}
            readOnly={Boolean(fechaDeCurp)}
            autoComplete="bday"
            hint={
              fechaDeCurp
                ? "La tomamos de tu CURP."
                : menorDeEdad
                  ? undefined
                  : `El titular de la membresía debe tener ${EDAD_MINIMA} años o más.`
            }
          />
          {/* Autocompletado, no lista cerrada (equipo, 15-ago): con 216 países
              bajar a "Chile" era un scroll larguísimo. Se escribe y la lista
              se angosta sola; el orden pone México y Latinoamérica arriba. */}
          <AutocompleteField
            label="Nacionalidad"
            options={listaPaises}
            value={nationality}
            onChange={setNationality}
            placeholder="Escribe tu país"
            hint="Empieza a escribir y elige de la lista."
          />
        </div>
        {menorDeEdad && (
          <div className="rounded-[12px] bg-error-bg px-4 py-3 text-[12.5px] leading-normal text-error-text">
            {fechaDeCurp ? (
              <>
                Tu CURP dice que aún no cumples {EDAD_MINIMA} años, y el titular
                de la membresía tiene que ser mayor de edad. Si la CURP está mal
                escrita, corrígela arriba. Si es correcta, al guardar avisamos al
                equipo para devolverte el pago y cancelar la membresía — y un
                adulto de tu casa sí puede quedar como titular con sus datos.
              </>
            ) : (
              <>
                Con esa fecha de nacimiento aún no cumples {EDAD_MINIMA} años. El
                titular de la membresía debe ser mayor de edad — si hay una fecha
                equivocada, corrígela; si no, un adulto de tu casa puede quedar
                como titular.
              </>
            )}
          </div>
        )}
        {/* Pasaporte JUNTO a la nacionalidad (equipo, 13-ago): antes vivía en
            una tarjeta al final de la página y quien elegía otro país no veía
            que le tocaba subirlo. Los extranjeros no pueden tener CURP. */}
        {esExtranjero && (
          <div className="flex flex-col gap-3 rounded-[14px] bg-[#F2FAF9] p-4">
            <p className="text-[12.5px] leading-relaxed text-ink-secondary">
              Como tu nacionalidad no es mexicana, tu identificación es el{" "}
              <strong className="text-ink-title">pasaporte</strong> (en lugar de
              la CURP). Lo usamos para validar tu identidad al habilitar tus
              reintegros.
            </p>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <DocUpload
                side="passport"
                label="Pasaporte — página de datos"
                fileName={passportFile}
                onUploaded={setPassportFile}
                userId={userId}
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {/* Lada seleccionable desde el 13-ago: antes era +52 fijo y un
              miembro extranjero no tenía dónde capturar su número. Se guarda
              en E.164 ("+52…") para que siempre signifique lo mismo. */}
          <PhoneField
            label="Teléfono"
            value={phone}
            onChange={setPhone}
            hint="Elige tu país si no es México."
          />
          {/* Extranjeros no tienen CURP: en su lugar suben pasaporte (abajo) */}
          {!esExtranjero && (
            <TextField
              label="CURP"
              placeholder="18 caracteres"
              value={curp}
              maxLength={18}
              onChange={(e) => setCurp(e.target.value.toUpperCase())}
              style={{ letterSpacing: ".06em" }}
              rightSlot={
                curp.length > 0 ? (
                  curpValid ? (
                    <span className="text-sm text-success-text">✓</span>
                  ) : (
                    <span className="text-xs text-error-text">
                      {curp.length}/18
                    </span>
                  )
                ) : undefined
              }
              hint={
                curp.length > 0 && !curpValid
                  ? "Revisa el formato de tu CURP."
                  : undefined
              }
            />
          )}
        </div>
        {/* El cruce CURP ↔ datos solo avisa, nunca bloquea (Pablo, 5-ago) */}
        {!esExtranjero && cruceCurp && !cruceCurp.coincide && (
          <div className="rounded-[12px] bg-warning-bg px-4 py-3 text-[12.5px] leading-normal text-warning-text">
            ⚠ Tu CURP no parece coincidir con{" "}
            {cruceCurp.discrepancias.join(" ni con ")}. Revísalos por favor —
            si están bien así, puedes continuar sin problema.
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          TU DOMICILIO
        </span>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[180px_1fr]">
          <TextField
            label="Código postal"
            inputMode="numeric"
            maxLength={5}
            placeholder="76230"
            value={cp}
            onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))}
            autoComplete="postal-code"
          />
          {/* El código postal propone la colonia, pero SIEMPRE se puede
              escribir otra: el catálogo se equivoca o le falta la de alguien
              (PM, 12-ago). Antes era una lista cerrada. */}
          <AutocompleteField
            label="Colonia"
            options={colonies}
            value={colony}
            onChange={setColony}
            placeholder="Escribe o elige tu colonia"
            hint={
              colonies.length > 0
                ? "La sugerimos según tu código postal; si no es correcta, puedes cambiarla."
                : undefined
            }
          />
        </div>
        {/* Alcaldía y estado: se llenan solos con el CP y ahora SE PUEDEN
            CORREGIR. Antes eran texto fijo, así que un dato equivocado del
            catálogo no había forma de arreglarlo (PM, 12-ago). */}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <TextField
            label="Alcaldía o municipio"
            placeholder="Gustavo A. Madero"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <TextField
            label="Estado"
            placeholder="Ciudad de México"
            value={stateMx}
            onChange={(e) => setStateMx(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1fr_120px_120px]">
          <TextField
            label="Calle"
            placeholder="Av. de la Luz"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
          />
          <TextField
            label="No. ext."
            placeholder="128"
            value={numExt}
            onChange={(e) => setNumExt(e.target.value)}
          />
          <TextField
            label="No. int."
            placeholder="—"
            value={numInt}
            onChange={(e) => setNumInt(e.target.value)}
          />
        </div>
      </section>

      {/* El INE se dejó de pedir a los miembros (equipo, 11-ago). Los
          embajadores lo conservan — su formulario es aparte. El pasaporte de
          los extranjeros se pide arriba, junto a la nacionalidad que lo
          dispara (equipo, 13-ago). */}

      {message && (
        <div className="rounded-[12px] bg-info-bg px-4 py-3 text-sm text-info-text">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row">
        <Button
          variant="outline"
          className="md:flex-1"
          disabled={saving}
          onClick={() => save(false)}
        >
          Guardar y continuar después
        </Button>
        <Button
          type="submit"
          className="md:flex-1"
          disabled={saving}
        >
          {saving ? "Guardando…" : "Finalizar perfil"}
        </Button>
      </div>
      </form>
    </>
  );
}
