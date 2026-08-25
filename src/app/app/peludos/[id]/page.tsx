import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { waitingProgress } from "@/lib/dates";
import { isMixedBreedName } from "@/lib/waiting-period";
import { AppealButton } from "@/components/app/AppealButton";
import { PetFichaEditor, type ThreadMessage } from "./PetFichaEditor";

const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  approved: { text: "✓ APROBADO", cls: "bg-success-bg text-success-text" },
  pending: { text: "EN REVISIÓN", cls: "bg-warning-bg text-warning-text" },
  rejected: { text: "DENEGADO", cls: "bg-error-bg text-error-text" },
};

/** Perfil completo de la mascota: fotos, datos e hilo con el comité. */
export default async function PetFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/peludos");

  const [{ data: pet }, { data: messages }] = await Promise.all([
    supabase
      .from("pets")
      .select(
        "id, user_id, name, species, breed, sex, age_years, age_months, coat_color, nose_color, eye_color, is_adopted, adoption_story, photo_url, gallery_photos, is_senior, vet_certificate_url, approval_status, approval_notes, info_requested, waiting_period_end_date, waiting_period_start_date, waiting_period_bypassed, created_at, is_active, deactivation_reason, deactivated_at",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("pet_messages")
      .select("id, sender, message, requested_items, created_at")
      .eq("pet_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (!pet) notFound();

  const wait = waitingProgress(
    pet.created_at,
    pet.waiting_period_end_date,
    pet.waiting_period_bypassed,
    pet.waiting_period_start_date,
  );
  const chip = STATUS_CHIP[pet.approval_status] ?? STATUS_CHIP.pending;
  const isMixed = isMixedBreedName(pet.breed);
  const ageLabel = pet.age_years
    ? `${pet.age_years} año${pet.age_years === 1 ? "" : "s"}`
    : `${pet.age_months ?? 0} meses`;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-5 py-6 md:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/app/peludos" className="text-sm font-semibold text-teal-deep">
          ← Mis peludos
        </Link>
        <h1 className="font-display text-[28px] text-ink-title">
          {pet.name} {pet.species === "dog" ? "🐕" : "🐈"}
        </h1>
        <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${chip.cls}`}>
          {pet.is_active === false ? "🕊️ DADA DE BAJA" : chip.text}
        </span>
      </div>
      {/* Etiquetas de la mascota (patrón del sitio vivo) */}
      <div className="-mt-1 flex flex-wrap gap-2">
        {pet.is_adopted && (
          <span className="rounded-full bg-success-bg px-3 py-1 text-[11px] font-extrabold text-success-text">
            🏠 ADOPTADO
          </span>
        )}
        {pet.breed &&
          (isMixed ? (
            <span className="rounded-full bg-info-bg px-3 py-1 text-[11px] font-extrabold text-info-text">
              🔀 {pet.species === "cat" ? "DOMÉSTICO" : "MESTIZO"}
            </span>
          ) : (
            <span className="rounded-full bg-info-bg px-3 py-1 text-[11px] font-extrabold text-info-text">
              🐾 RAZA PURA
            </span>
          ))}
        {pet.is_senior && (
          <span className="rounded-full bg-warning-bg px-3 py-1 text-[11px] font-extrabold text-warning-text">
            👴 SENIOR
          </span>
        )}
      </div>
      <p className="-mt-2 text-[13px] text-ink-secondary">
        {pet.breed ?? "Sin raza registrada"} · {ageLabel} ·{" "}
        {wait.done
          ? "tiempo de espera completado ✓"
          : `tiempo de espera: ${wait.elapsed}/${wait.total} días`}
      </p>

      {/* RECHAZO, CON SU MOTIVO Y CÓMO SEGUIR (equipo, 15-ago).
          Antes el motivo iba pegado a la línea gris de arriba, entre la edad y
          el tiempo de espera: se leía como un dato más y nadie entendía qué
          hacer con él. Ahora es su propia tarjeta, dice qué observó el comité
          y trae la apelación aquí mismo, que es donde la persona está mirando
          la foto y los datos que tiene que corregir. */}
      {pet.approval_status === "rejected" && (
        <section className="flex flex-col gap-2.5 rounded-[16px] border-[1.5px] border-[#F2C7D4] bg-error-bg px-5 py-4">
          <span className="text-[13px] font-extrabold tracking-[.04em] text-error-text">
            EL COMITÉ NO APROBÓ EL PERFIL DE {pet.name.toUpperCase()}
          </span>
          {pet.approval_notes ? (
            <p className="text-[13.5px] leading-relaxed text-ink-body">
              <strong className="text-ink-title">Lo que observaron:</strong>{" "}
              «{pet.approval_notes}»
            </p>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-ink-body">
              El comité no dejó una observación. Cuéntanos tu caso al apelar y
              lo revisan de nuevo.
            </p>
          )}
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            Corrige aquí abajo lo que haga falta —la foto, la raza, los datos—
            y pide una segunda revisión. Puedes adjuntar fotos o documentos que
            respalden tu caso.
          </p>
          <AppealButton petId={pet.id} subjectLabel={`el perfil de ${pet.name}`} />
        </section>
      )}

      {/* Tiempo de espera cumplido: acceso directo a los beneficios */}
      {wait.done &&
        pet.approval_status === "approved" &&
        pet.is_active !== false && (
          <Link
            href="/app/reintegros/nueva"
            className="grid h-[52px] place-items-center rounded-full bg-teal text-base font-bold text-white transition-colors hover:bg-teal-deep"
          >
            🎉 Utilizar mis beneficios
          </Link>
        )}

      <PetFichaEditor
        pet={{
          id: pet.id,
          userId: pet.user_id,
          name: pet.name,
          species: pet.species as "dog" | "cat",
          breed: pet.breed,
          isSenior: pet.is_senior,
          infoRequested: pet.info_requested,
          sex: pet.sex,
          coatColor: pet.coat_color,
          noseColor: pet.nose_color,
          eyeColor: pet.eye_color,
          isAdopted: pet.is_adopted,
          adoptionStory: pet.adoption_story,
          photoUrl: pet.photo_url,
          galleryPhotos: pet.gallery_photos ?? [],
          vetCertificateUrl: pet.vet_certificate_url,
          active: pet.is_active !== false,
        }}
        thread={(messages ?? []) as ThreadMessage[]}
      />
    </div>
  );
}
