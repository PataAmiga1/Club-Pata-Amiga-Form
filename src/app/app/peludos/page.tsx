import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PetCard, type PetRow } from "@/components/app/PetCard";
import { AppealButton } from "@/components/app/AppealButton";
import { APPEAL_MAX_PER_SUBJECT, MAX_ACTIVE_PETS } from "@/lib/constants";

export default async function PeludosPage({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string }>;
}) {
  const { registrado } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/peludos");

  const [{ data: pets }, { data: appeals }] = await Promise.all([
    supabase
      .from("pets")
      .select(
        "id, name, species, breed, age_years, age_months, photo_url, approval_status, waiting_period_end_date, waiting_period_start_date, waiting_period_bypassed, created_at, is_active, deactivation_reason, deactivated_at, is_senior, vet_certificate_url, info_requested",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("appeals")
      .select("id, folio, status, pet_id")
      .eq("user_id", user.id)
      .not("pet_id", "is", null),
  ]);

  const petList = (pets ?? []) as PetRow[];
  // Las dadas de baja quedan al final, como recuerdo — no cuentan en el límite
  const active = petList.filter((p) => p.is_active !== false);
  const inactive = petList.filter((p) => p.is_active === false);
  const appealsFor = (petId: string) =>
    (appeals ?? []).filter((a) => a.pet_id === petId);

  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:gap-[22px] md:px-[34px] md:py-[30px]">
      {registrado && (
        <div className="rounded-[14px] bg-success-bg px-4 py-3 text-sm font-semibold text-success-text">
          🐾 ¡Listo! Tu peludo quedó registrado. El comité revisará su ficha y
          su período de espera ya corre.
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[26px] text-ink-title md:text-[32px]">
            Mis peludos
          </h1>
          <p className="text-[12.5px] text-ink-secondary md:text-sm">
            {active.length} de {MAX_ACTIVE_PETS} peludos activos. Toca «Ver
            ficha» para fotos, datos completos y mensajes del comité.
          </p>
        </div>
        {active.length < MAX_ACTIVE_PETS && (
          <Link
            href="/app/peludos/nueva"
            className="grid h-11 flex-none place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep"
          >
            + Agregar
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-4">
        {active.map((pet) => {
          const mine = appealsFor(pet.id);
          const pending = mine.find((a) => a.status === "pending");
          return (
            <div key={pet.id} className="flex flex-col gap-2">
              <PetCard pet={pet} />
              <Link
                href={`/app/peludos/${pet.id}`}
                className="self-start text-[13px] font-bold text-teal-deep hover:underline"
              >
                Ver ficha completa →
              </Link>
              {pet.approval_status === "rejected" &&
                (pending ? (
                  <span className="self-start rounded-full bg-info-bg px-3 py-1 text-[11px] font-extrabold tracking-[.04em] text-info-text">
                    APELACIÓN {pending.folio} EN REVISIÓN
                  </span>
                ) : mine.length < APPEAL_MAX_PER_SUBJECT ? (
                  <AppealButton
                    petId={pet.id}
                    subjectLabel={`la ficha de ${pet.name}`}
                  />
                ) : null)}
            </div>
          );
        })}
        {inactive.map((pet) => (
          <div key={pet.id} className="flex flex-col gap-2">
            <PetCard pet={pet} />
          </div>
        ))}
      </div>
    </div>
  );
}
