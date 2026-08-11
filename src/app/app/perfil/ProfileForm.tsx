"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/ui/Field";
import { PhoneField } from "@/components/ui/PhoneField";
import { Button } from "@/components/ui/Button";

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
      <input
        ref={ref}
        type="file"
        accept="image/*,.pdf"
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
        {busy ? "Subiendo…" : error ? "Error, intenta de nuevo" : (fileName ?? "Subir foto")}
      </span>
    </button>
  );
}

export function ProfileForm({
  userId,
  initial,
  passport,
}: {
  userId: string;
  initial: Initial;
  /** Nombre de archivo del pasaporte ya subido (solo extranjeros). */
  passport: string | null;
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

  const curpValid = validateCurp(curp).isValid;
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
    15 * Number(/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) +
    10 * Number(nationality.trim().length > 0) +
    25 * Number(Boolean(cp.length === 5 && colony && street));

  async function save(finalize: boolean) {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        mother_last_name: motherLastName.trim() || null,
        birth_date: /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : null,
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
      router.push("/app");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[28px] text-ink-title md:text-[34px]">
            Completa tu perfil
          </h1>
          <p className="mt-1.5 text-[14.5px] text-ink-secondary">
            Necesitamos estos datos para validar tu identidad y habilitar tus
            reintegros.
          </p>
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
          <TextField
            label="Fecha de nacimiento"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            autoComplete="bday"
          />
          <TextField
            label="Nacionalidad"
            placeholder="Mexicana"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {/* Mismo componente que el registro: prefijo +52 fijo y solo 10
              dígitos en la BD. Antes era un campo libre, así que el mismo
              teléfono podía guardarse de cinco formas distintas. */}
          <PhoneField
            label="Teléfono"
            value={phone}
            onChange={setPhone}
            hint="10 dígitos, sin lada internacional."
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
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-ink-title">
              Colonia{" "}
              <span className="font-medium text-ink-tertiary">
                (auto-completada)
              </span>
            </label>
            {colonies.length > 0 ? (
              <select
                className="h-12 w-full appearance-none rounded-[12px] border-[1.5px] border-border-input bg-white px-4 text-[15px] text-ink-title outline-none focus:border-2 focus:border-teal"
                value={colony}
                onChange={(e) => setColony(e.target.value)}
              >
                {colonies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="h-12 w-full rounded-[12px] border-[1.5px] border-border-input bg-white px-4 text-[15px] text-ink-title placeholder:text-ink-placeholder outline-none focus:border-2 focus:border-teal"
                placeholder="Escribe tu colonia"
                value={colony}
                onChange={(e) => setColony(e.target.value)}
              />
            )}
          </div>
        </div>
        {stateMx && (
          <span className="-mt-1 text-[12.5px] text-ink-tertiary">
            {city}, {stateMx}
          </span>
        )}
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
          embajadores lo conservan — su formulario es aparte. Los extranjeros
          suben PASAPORTE: no pueden tener CURP. */}
      {esExtranjero && (
        <section className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
          <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
            TU PASAPORTE
          </span>
          <p className="-mt-1.5 text-[13px] leading-relaxed text-ink-secondary">
            Como tu nacionalidad no es mexicana, tu identificación es tu
            pasaporte (en lugar de la CURP). Lo usamos para validar tu
            identidad al habilitar tus reintegros.
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
        </section>
      )}

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
