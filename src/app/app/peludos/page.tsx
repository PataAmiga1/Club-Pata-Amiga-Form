import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PetCard, type PetRow } from "@/components/app/PetCard";
import { AppealButton } from "@/components/app/AppealButton";
import { APPEAL_MAX_PER_SUBJECT, MAX_ACTIVE_PETS } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { ESTADOS_VIVOS } from "@/lib/plans/suscripciones";
import { formatDateEs } from "@/lib/dates";
import { aperturasDePeludos } from "@/lib/reintegros-599";

export default async function PeludosPage({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string; membresia?: string; baja?: string }>;
}) {
  const { registrado, membresia, baja } = await searchParams;
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

  // Membresía $599 (sección 4): cada peludo con su suscripción. Se lee con la
  // llave de servicio porque la política de `subscriptions` es por persona y
  // aquí solo se piden las suyas.
  const { data: subsDelMiembro } = await createAdminClient()
    .from("subscriptions")
    .select("pet_id, status, plan, amount, cancel_at_period_end, current_period_end")
    .eq("user_id", user.id);
  const vivas = (subsDelMiembro ?? []).filter((s) => ESTADOS_VIVOS.includes(s.status ?? ""));
  const modelo599 = vivas.some((s) => s.pet_id) && !vivas.some((s) => !s.pet_id);
  // Las dadas de baja quedan al final, como recuerdo — no cuentan en el límite
  const active = petList.filter((p) => p.is_active !== false);
  const membresiaDe = (petId: string) => vivas.find((s) => s.pet_id === petId) ?? null;
  // Sección 7: la tarjeta de un peludo del $599 dice cuándo se abre cada monto.
  const aperturas = modelo599
    ? await aperturasDePeludos(createAdminClient(), active.map((p) => p.id))
    : new Map();
  const inactive = petList.filter((p) => p.is_active === false);
  const appealsFor = (petId: string) =>
    (appeals ?? []).filter((a) => a.pet_id === petId);

  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:gap-[22px] md:px-[34px] md:py-[30px]">
      {baja && (
        <div className="rounded-[14px] bg-info-bg px-4 py-3 text-sm font-semibold text-info-text">
          Dimos de baja a tu peludo. Su membresía termina al final del período
          que ya pagaste y no se te vuelve a cobrar por él.
        </div>
      )}
      {membresia && (
        <div className="rounded-[14px] bg-success-bg px-4 py-3 text-sm font-semibold text-success-text">
          🐾 ¡Listo! Activamos la membresía de tu peludo. El comité revisa su perfil.
        </div>
      )}
      {registrado && (
        <div className="rounded-[14px] bg-success-bg px-4 py-3 text-sm font-semibold text-success-text">
          🐾 ¡Listo! Tu peludo ya está registrado. Validaremos sus datos para
          iniciar su tiempo de espera.
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[26px] text-ink-title md:text-[32px]">
            Mis peludos
          </h1>
          <p className="text-[12.5px] text-ink-secondary md:text-sm">
            {modelo599
              ? `${active.length} peludo(s) activo(s). Cada uno tiene su membresía.`
              : `${active.length} de ${MAX_ACTIVE_PETS} peludos activos.`}{" "}
            Toca «Ver perfil» para ver sus fotos, datos completos y avisos
            importantes.
          </p>
        </div>
        {(modelo599 || active.length < MAX_ACTIVE_PETS) && (
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
              <PetCard pet={pet} montos599={aperturas.get(pet.id)} />
              {modelo599 &&
                (() => {
                  const m = membresiaDe(pet.id);
                  if (!m)
                    return (
                      <Link
                        href={`/app/peludos/${pet.id}/membresia`}
                        className="flex items-center justify-between gap-2 rounded-[12px] bg-warning-bg px-3.5 py-2.5 text-[13px] font-bold text-warning-text"
                      >
                        <span>Sin membresía todavía</span>
                        <span>Activar →</span>
                      </Link>
                    );
                  return (
                    <span className="self-start rounded-full bg-info-bg px-3 py-1 text-[11.5px] font-bold text-info-text">
                      {m.status === "past_due" || m.status === "unpaid"
                        ? "Membresía con pago pendiente"
                        : m.cancel_at_period_end && m.current_period_end
                          ? `Membresía hasta el ${formatDateEs(m.current_period_end)}`
                          : `Membresía ${m.plan === "annual" ? "anual" : "mensual"} · $${Number(m.amount ?? 0).toLocaleString("es-MX")}`}
                    </span>
                  );
                })()}
              <Link
                href={`/app/peludos/${pet.id}`}
                className="self-start text-[13px] font-bold text-teal-deep hover:underline"
              >
                Ver perfil completo →
              </Link>
              {pet.approval_status === "rejected" &&
                (pending ? (
                  <span className="self-start rounded-full bg-info-bg px-3 py-1 text-[11px] font-extrabold tracking-[.04em] text-info-text">
                    APELACIÓN {pending.folio} EN REVISIÓN
                  </span>
                ) : mine.length < APPEAL_MAX_PER_SUBJECT ? (
                  <AppealButton
                    petId={pet.id}
                    subjectLabel={`el perfil de ${pet.name}`}
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
