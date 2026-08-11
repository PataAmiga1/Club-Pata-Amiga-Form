"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SelectField, TextField, ToggleGroup } from "@/components/ui/Field";
import { AutocompleteField } from "@/components/ui/AutocompleteField";
import { Button } from "@/components/ui/Button";
import { SENIOR_PET_AGE_YEARS, MAX_ACTIVE_PETS } from "@/lib/constants";
import {
  DOG_BREED_NAMES,
  CAT_BREED_NAMES,
  PET_COLORS,
  BREED_CONDITIONS,
} from "@/data/pet-catalogs";

type Species = "dog" | "cat";

/**
 * Edad por rangos — regla del sitio vivo: edad mínima 4 meses y opciones
 * fijas hasta "15+ años". `years`/`months` es lo que se guarda en BD.
 */
const AGE_OPTIONS: {
  value: string;
  label: string;
  years: number;
  months: number | null;
}[] = [
  { value: "4-6m", label: "4 – 6 meses", years: 0, months: 4 },
  { value: "6-12m", label: "6 – 12 meses", years: 0, months: 6 },
  ...Array.from({ length: 14 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} ${i === 0 ? "año" : "años"}`,
    years: i + 1,
    months: null,
  })),
  { value: "15+", label: "15+ años", years: 15, months: null },
];

/**
 * Formulario de alta de mascota, compartido entre:
 * - mode="registro": paso 2 del registro (pre-pago) → sigue a elegir plan.
 * - mode="member":   miembro activo agrega otro peludo → vuelve a Mis peludos
 *   (sin stepper ni plan; su período de espera corre desde hoy).
 *
 * Reglas del sitio vivo: raza y colores con autocompletado (se puede escribir
 * un valor libre si no aparece), edad por rangos, aviso senior a los
 * SENIOR_PET_AGE_YEARS o más (8 desde el 11-ago-2026).
 */
export function PetForm({ mode }: { mode: "registro" | "member" }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("dog");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState("");
  const [ageKey, setAgeKey] = useState("");
  const [coat, setCoat] = useState("");
  const [eye, setEye] = useState("");
  const [nose, setNose] = useState("");
  const [adopted, setAdopted] = useState(false);
  const [story, setStory] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // Certificado veterinario para seniors, subible desde el alta (equipo, 5-ago)
  const [cert, setCert] = useState<File | null>(null);
  const certRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace(mode === "registro" ? "/registro" : "/iniciar-sesion");
      } else {
        setUserId(user.id);
      }
    });
  }, [router, mode]);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }

  const ageOption = AGE_OPTIONS.find((o) => o.value === ageKey) ?? null;
  // Aviso transparente por raza (copy aprobado por el cliente, 16-jul-2026)
  const breedConditions = BREED_CONDITIONS[breed.trim()] ?? null;
  // El aviso de senior aparece en cuanto se elige SENIOR_PET_AGE_YEARS o más
  const showsSeniorNote =
    !!ageOption && ageOption.years >= SENIOR_PET_AGE_YEARS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    if (!ageOption) {
      setError("Cuéntanos la edad de tu peludo.");
      return;
    }
    if (!breed.trim()) {
      setError(
        species === "dog"
          ? "Cuéntanos su raza (o elige Mestizo)."
          : "Cuéntanos su raza (o elige Doméstico).",
      );
      return;
    }
    setLoading(true);
    const supabase = createClient();

    let photoUrl: string | null = null;
    if (photo) {
      const path = `${userId}/${Date.now()}-${photo.name}`;
      const { error: uploadError } = await supabase.storage
        .from("pet-photos")
        .upload(path, photo);
      if (!uploadError) {
        photoUrl = supabase.storage.from("pet-photos").getPublicUrl(path)
          .data.publicUrl;
      }
    }

    // Certificado del senior (mismo bucket que usa la ficha)
    let certUrl: string | null = null;
    if (cert && showsSeniorNote) {
      const path = `${userId}/cert-${Date.now()}-${cert.name}`;
      const { error: certError } = await supabase.storage
        .from("pet-photos")
        .upload(path, cert);
      if (!certError) {
        certUrl = supabase.storage.from("pet-photos").getPublicUrl(path)
          .data.publicUrl;
      }
    }

    const isSenior = ageOption.years >= SENIOR_PET_AGE_YEARS;
    const petData = {
      user_id: userId,
      name: name.trim(),
      species,
      breed: breed.trim() || null,
      sex: sex || null,
      age_years: ageOption.years,
      age_months: ageOption.months,
      is_senior: isSenior,
      coat_color: coat.trim() || null,
      eye_color: eye.trim() || null,
      nose_color: nose.trim() || null,
      is_adopted: adopted,
      adoption_story: adopted ? story.trim() || null : null,
      ...(photoUrl ? { photo_url: photoUrl } : {}),
      ...(certUrl ? { vet_certificate_url: certUrl } : {}),
    };

    if (mode === "member") {
      // Miembro activo: nueva mascota, período de espera variable desde hoy.
      // Si antes dio de baja una, la nueva cuenta como reemplazo (180 días).
      const [{ count: activeCount }, { count: inactiveCount }] =
        await Promise.all([
          supabase
            .from("pets")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("is_active", true),
          supabase
            .from("pets")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("is_active", false),
        ]);
      if ((activeCount ?? 0) >= MAX_ACTIVE_PETS) {
        setError(`Ya tienes ${MAX_ACTIVE_PETS} peludos activos en tu membresía.`);
        setLoading(false);
        return;
      }
      // La espera arranca cuando el COMITÉ APRUEBA la ficha (PM, 11-ago), no
      // al registrar: la fecha la fija resolvePet vía iniciarEsperaDeMascota.
      // Mientras la ficha está en revisión no corre ningún conteo.
      const { error: saveError } = await supabase.from("pets").insert(petData);
      if (saveError) {
        setError("No pudimos guardar a tu peludo. Intenta de nuevo.");
        setLoading(false);
        return;
      }
      window.location.assign("/app/peludos?registrado=1");
      return;
    }

    // Registro pre-pago: volver a este paso actualiza la mascota capturada.
    // Su período de espera se fija al pagar (webhook), donde ya se conoce
    // si hubo código de embajador (90 días).
    const { data: existing } = await supabase
      .from("pets")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);

    const query = existing?.length
      ? supabase.from("pets").update(petData).eq("id", existing[0].id)
      : supabase.from("pets").insert(petData);

    const { error: saveError } = await query;
    if (saveError) {
      setError("No pudimos guardar a tu peludo. Intenta de nuevo.");
      setLoading(false);
      return;
    }
    router.push("/registro/plan");
  }

  const breedOptions =
    species === "dog"
      ? ["Mestizo", ...DOG_BREED_NAMES]
      : ["Doméstico", ...CAT_BREED_NAMES];

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-[18px] rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7"
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="grid size-[84px] flex-none place-items-center overflow-hidden rounded-full border-2 border-dashed border-[#C9E9E4] bg-[#F2FAF9] text-[26px] text-teal"
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt="Foto de tu peludo"
              className="size-full object-cover"
            />
          ) : (
            "+"
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhoto}
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-ink-title">
            Foto de tu peludo
          </span>
          <span className="text-[12.5px] text-ink-tertiary">
            {mode === "member"
              ? "Podrás agregar más fotos en su ficha"
              : "Opcional ahora, la pedimos al completar el perfil"}
          </span>
        </div>
      </div>
      <TextField
        label="¿Cómo se llama?"
        required
        placeholder="Max"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <ToggleGroup
        label="Especie"
        value={species}
        onChange={(v) => {
          setSpecies(v);
          setBreed("");
          setCoat("");
          setEye("");
          setNose("");
        }}
        options={[
          { value: "dog", label: "Perro" },
          { value: "cat", label: "Gato" },
        ]}
      />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <AutocompleteField
          label="Raza"
          options={breedOptions}
          value={breed}
          onChange={setBreed}
          placeholder={species === "dog" ? "Mestizo, Labrador…" : "Doméstico, Siamés…"}
          hint="Escribe y elige una sugerencia. Si no aparece, escríbela tal cual."
          required
        />
        <SelectField
          label="Sexo"
          value={sex}
          onChange={(e) => setSex(e.target.value)}
        >
          <option value="">Elige</option>
          <option value="male">Macho</option>
          <option value="female">Hembra</option>
        </SelectField>
      </div>
      {breedConditions && (
        <div className="rounded-[12px] bg-info-bg px-4 py-3 text-[13px] leading-relaxed text-info-text">
          💙 Sabemos que, como muchas otras razas, los {breed.trim()} pueden
          tener mayor predisposición a desarrollar algunas condiciones de
          salud, como {breedConditions}. En Pata Amiga creemos que la
          confianza comienza con la transparencia. Por eso, es importante que
          sepas que nuestra membresía está diseñada para acompañarte ante
          imprevistos y accidentes. Actualmente, no contempla reintegros
          relacionados con enfermedades genéticas o hereditarias. Nuestro
          compromiso es brindarte claridad desde el primer día para que
          siempre sepas cómo funciona tu membresía y puedas aprovecharla al
          máximo.
        </div>
      )}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <SelectField
          label="¿Qué edad tiene?"
          required
          value={ageKey}
          onChange={(e) => setAgeKey(e.target.value)}
        >
          <option value="">Elige su edad</option>
          {AGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
        <AutocompleteField
          label="Color de pelaje"
          options={PET_COLORS.coat[species]}
          value={coat}
          onChange={setCoat}
          placeholder="Ej. Café con blanco"
        />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <AutocompleteField
          label="Color de ojos"
          options={PET_COLORS.eye[species]}
          value={eye}
          onChange={setEye}
          placeholder="Ej. Miel"
        />
        <AutocompleteField
          label="Color de nariz/trufa"
          options={PET_COLORS.nose[species]}
          value={nose}
          onChange={setNose}
          placeholder="Ej. Negra"
        />
      </div>
      <label className="flex items-center gap-2.5 text-[13.5px] font-semibold text-ink-title">
        <input
          type="checkbox"
          checked={adopted}
          onChange={(e) => setAdopted(e.target.checked)}
          className="size-4 accent-[#1CBCAD]"
        />
        Fue adoptado o rescatado 💚
      </label>
      {adopted && (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            rows={2}
            placeholder="Cuéntanos su historia de adopción (opcional)…"
            className="rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-body outline-none focus:border-teal"
          />
          <span className="text-xs text-ink-tertiary">
            Al compartir su historia nos autorizas a incluirla en la página y
            redes de Pata Amiga. 💚 Los adoptados tienen un período de espera
            más corto.
          </span>
        </div>
      )}
      {showsSeniorNote && (
        <div className="flex flex-col gap-2.5 rounded-[12px] bg-warning-bg px-4 py-3 text-[13px] leading-normal text-[#8A5A12]">
          <span>
            Como tu peludo tiene {SENIOR_PET_AGE_YEARS} años o más, te pedimos
            un certificado veterinario para conocer su estado de salud. Puedes
            subirlo aquí mismo o después desde su ficha. 🐾
          </span>
          <input
            ref={certRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => setCert(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => certRef.current?.click()}
              className="rounded-full border-[1.5px] border-[#8A5A12] px-4 py-1.5 text-[12.5px] font-bold text-[#8A5A12] transition-colors hover:bg-white/50"
            >
              {cert ? "Cambiar certificado" : "📄 Subir certificado ahora"}
            </button>
            {cert && (
              <span className="text-[12px] font-semibold">
                {cert.name} ✓
              </span>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() =>
            router.push(mode === "member" ? "/app/peludos" : "/registro")
          }
        >
          Atrás
        </Button>
        <Button type="submit" className="flex-[2]" disabled={loading}>
          {loading
            ? "Guardando…"
            : mode === "member"
              ? "Guardar peludo"
              : "Elegir mi plan"}
        </Button>
      </div>
    </form>
  );
}
