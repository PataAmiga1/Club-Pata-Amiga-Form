import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRole } from "@/lib/admin-guard";
import { formatDateEs } from "@/lib/dates";
import { SENIOR_PET_AGE_YEARS } from "@/lib/constants";
import {
  DetailModal,
  DetailItem,
  SensitiveBlock,
} from "@/components/panel/DetailModal";
import { FilterChips } from "@/components/panel/FilterChips";
import { PetReviewRow } from "./PetReviewRow";
import { PetResolveButtons } from "./PetResolveButtons";

export default async function AdminMascotasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; orden?: string }>;
}) {
  const { estado, orden } = await searchParams;
  const admin = createAdminClient();
  const isSuper = (await getAdminRole()) === "super_admin";
  // Por omisión las más recientes arriba (petición del equipo, 5-ago).
  const masAntiguas = orden === "antiguas";
  // Tabs extra del super admin: "bajas" (mascotas dadas de baja) y
  // "apelacion" (mascotas con apelación presentada) — equipo, 5-ago.
  const verBajas = estado === "bajas";
  const verApelaciones = estado === "apelacion";
  const [{ data: pets }, { data: petAppeals }] = await Promise.all([
    admin
      .from("pets")
      .select(
        "id, name, species, breed, sex, coat_color, eye_color, nose_color, is_adopted, adoption_story, age_years, age_months, birth_date, is_senior, vet_certificate_url, photo_url, gallery_photos, approval_status, approval_notes, waiting_period_end_date, waiting_period_bypassed, created_at, user_id, deactivation_reason, profiles!user_id(first_name, last_name, email, phone, member_since, membership_status, curp, birth_date, street, number_ext, number_int, colony, postal_code, city, state, bank_name, clabe, rfc)",
      )
      .eq("is_active", !verBajas)
      .order("created_at", { ascending: masAntiguas }),
    admin
      .from("appeals")
      .select("id, folio, status, pet_id")
      .not("pet_id", "is", null),
  ]);

  const apeladasPorMascota = new Map<string, { folio: string; status: string }>();
  for (const a of petAppeals ?? [])
    if (a.pet_id && !apeladasPorMascota.has(a.pet_id))
      apeladasPorMascota.set(a.pet_id, { folio: a.folio, status: a.status });

  const all = (pets ?? []).filter((p) =>
    verBajas
      ? true
      : verApelaciones
        ? apeladasPorMascota.has(p.id)
        : !estado || p.approval_status === estado,
  );
  const pending = all.filter(
    (p) => p.approval_status === "pending" && !verBajas && !verApelaciones,
  );
  const resolved = all.filter((p) => !pending.includes(p));

  type OwnerProfile = {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    member_since?: string | null;
    membership_status?: string | null;
    curp?: string | null;
    birth_date?: string | null;
    street?: string | null;
    number_ext?: string | null;
    number_int?: string | null;
    colony?: string | null;
    postal_code?: string | null;
    city?: string | null;
    state?: string | null;
    bank_name?: string | null;
    clabe?: string | null;
    rfc?: string | null;
  };
  const profOf = (p: unknown): OwnerProfile | null =>
    (Array.isArray(p) ? p[0] : p) as OwnerProfile | null;

  const memberName = (p: unknown) => {
    const prof = profOf(p);
    return prof?.first_name
      ? `${prof.first_name} ${prof.last_name ?? ""}`.trim()
      : (prof?.email ?? "Miembro");
  };

  const ageLabel = (p: { age_years: number | null; age_months: number | null }) =>
    p.age_months
      ? `${p.age_months} meses`
      : `${p.age_years ?? "?"} ${p.age_years === 1 ? "año" : "años"}`;

  const addressOf = (prof: OwnerProfile | null) =>
    prof
      ? [
          [prof.street, prof.number_ext, prof.number_int && `int. ${prof.number_int}`]
            .filter(Boolean)
            .join(" "),
          prof.colony,
          prof.city,
          prof.state,
          prof.postal_code && `CP ${prof.postal_code}`,
        ]
          .filter(Boolean)
          .join(", ")
      : "";

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <h1 className="font-display text-[26px] text-ink-title">
        Mascotas por aprobar
      </h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          basePath="/admin/mascotas"
          current={estado}
          keep={{ orden }}
          options={[
            { value: "pending", label: "En revisión" },
            { value: "approved", label: "Aprobadas" },
            { value: "rejected", label: "Rechazadas" },
            ...(isSuper
              ? [
                  { value: "apelacion", label: "⚖️ Apelaciones" },
                  { value: "bajas", label: "🕊️ Bajas" },
                ]
              : []),
          ]}
        />
        <FilterChips
          basePath="/admin/mascotas"
          current={orden}
          param="orden"
          keep={{ estado }}
          allLabel="Más recientes"
          options={[{ value: "antiguas", label: "Más antiguas" }]}
        />
      </div>
      <div className="flex flex-col gap-2.5">
        {pending.map((p) => (
          <PetReviewRow
            key={p.id}
            pet={{
              id: p.id,
              name: p.name,
              species: p.species as "dog" | "cat",
              breed: p.breed,
              ageLabel: p.age_months
                ? `${p.age_months} meses`
                : `${p.age_years ?? "?"} años`,
              isSenior: p.is_senior,
              hasCertificate: Boolean(p.vet_certificate_url),
              photoUrl: p.photo_url,
              owner: memberName(p.profiles),
              registered: formatDateEs(new Date(p.created_at)),
            }}
            detailSlot={
              <DetailModal title={`Ficha de ${p.name}`}>
                {/* Toda la información de la mascota y su dueño (patrón del sitio vivo) */}
                <div className="flex flex-col gap-4">
                  {/* Faltantes visibles de un vistazo (petición del equipo, 5-ago) */}
                  {(!p.photo_url || (p.is_senior && !p.vet_certificate_url)) && (
                    <div className="flex flex-wrap gap-2">
                      {p.is_senior && !p.vet_certificate_url && (
                        <span className="rounded-full bg-warning-bg px-3 py-1.5 text-[11.5px] font-bold text-warning-text">
                          ⚠ Falta certificado veterinario (senior {SENIOR_PET_AGE_YEARS}+)
                        </span>
                      )}
                      {!p.photo_url && (
                        <span className="rounded-full bg-warning-bg px-3 py-1.5 text-[11.5px] font-bold text-warning-text">
                          ⚠ Falta foto
                        </span>
                      )}
                    </div>
                  )}
                  {p.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photo_url}
                      alt={p.name}
                      className="h-[180px] w-full rounded-[14px] object-cover"
                    />
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <DetailItem label="NOMBRE" value={p.name} />
                    <DetailItem label="TIPO" value={p.species === "dog" ? "Perro" : "Gato"} />
                    <DetailItem label="RAZA" value={p.breed} />
                    <DetailItem
                      label="EDAD"
                      value={p.age_months ? `${p.age_months} meses` : `${p.age_years ?? "?"} años`}
                    />
                    <DetailItem
                      label="SEXO"
                      value={p.sex === "male" ? "Macho" : p.sex === "female" ? "Hembra" : null}
                    />
                    <DetailItem label="COLOR DE PELAJE" value={p.coat_color} />
                    <DetailItem label="COLOR DE OJOS" value={p.eye_color} />
                    <DetailItem label="COLOR DE NARIZ" value={p.nose_color} />
                    <DetailItem label="ADOPTADO" value={p.is_adopted ? "Sí 🏠" : "No"} />
                    <DetailItem
                      label={`SENIOR (${SENIOR_PET_AGE_YEARS}+)`}
                      value={
                        p.is_senior
                          ? "Sí 👴"
                          : // Vinculación edad ↔ clasificación (equipo, 11-ago): si la
                            // edad guardada indica senior pero la ficha dice que no, el
                            // comité lo ve — la ficha NO se recalcula sola (Regla X).
                            (p.age_years ?? 0) >= SENIOR_PET_AGE_YEARS && !p.age_months
                            ? "No ⚠ (la edad indica senior)"
                            : "No"
                      }
                    />
                    <DetailItem
                      label="PERÍODO DE ESPERA"
                      value={
                        p.waiting_period_end_date
                          ? `termina el ${formatDateEs(p.waiting_period_end_date)}`
                          : "empieza al aprobarse"
                      }
                    />
                    <DetailItem label="REGISTRADA" value={formatDateEs(new Date(p.created_at))} />
                  </div>
                  {p.adoption_story && (
                    <p className="rounded-[10px] bg-cream px-3 py-2 text-[12.5px] italic text-ink-secondary">
                      «{p.adoption_story}»
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {p.vet_certificate_url && (
                      <a
                        href={p.vet_certificate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] font-bold text-teal-deep hover:underline"
                      >
                        🏥 Certificado veterinario
                      </a>
                    )}
                    {(p.gallery_photos ?? []).map((g: string, gi: number) => (
                      <a
                        key={g}
                        href={g}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] font-bold text-teal-deep hover:underline"
                      >
                        📸 Foto {gi + 1}
                      </a>
                    ))}
                  </div>
                  <div className="border-t border-border-divider pt-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      <DetailItem label="DUEÑO" value={memberName(p.profiles)} />
                      <DetailItem
                        label="CONTACTO"
                        value={(() => {
                          const prof = (Array.isArray(p.profiles) ? p.profiles[0] : p.profiles) as {
                            email?: string;
                            phone?: string;
                          } | null;
                          return [prof?.email, prof?.phone].filter(Boolean).join(" · ") || null;
                        })()}
                      />
                    </div>
                    <Link
                      href={`/admin/miembros/${p.user_id}`}
                      className="mt-2 inline-block text-[12.5px] font-bold text-teal-deep hover:underline"
                    >
                      Ver expediente completo del miembro →
                    </Link>
                  </div>
                  {/* Resolver sin salir del popup (petición del equipo, 5-ago) */}
                  <div className="border-t border-border-divider pt-3">
                    <PetResolveButtons petId={p.id} />
                  </div>
                </div>
              </DetailModal>
            }
          />
        ))}
        {pending.length === 0 && !verBajas && !verApelaciones && (
          <div className="rounded-[18px] bg-white p-6 text-sm text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            Sin mascotas pendientes de revisión. 🎉
          </div>
        )}
        {(verBajas || verApelaciones) && resolved.length === 0 && (
          <div className="rounded-[18px] bg-white p-6 text-sm text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            {verBajas
              ? "Sin mascotas dadas de baja."
              : "Sin mascotas con apelación."}
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <>
          <h2 className="font-display text-lg text-ink-title">
            {verBajas
              ? "Dadas de baja"
              : verApelaciones
                ? "Con apelación"
                : "Resueltas"}
          </h2>
          <div className="flex flex-col rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            {resolved.map((p) => {
              const prof = profOf(p.profiles);
              const otherPets = (pets ?? []).filter(
                (o) => o.user_id === p.user_id && o.id !== p.id,
              );
              return (
                <DetailModal
                  key={p.id}
                  title={`Ficha de ${p.name}`}
                  trigger={
                    <div className="flex items-center gap-3 border-b border-[#F2EEE4] px-1 py-2.5 text-[13px] text-ink-body">
                      <span aria-hidden>{p.species === "dog" ? "🐕" : "🐈"}</span>
                      <span className="flex-1">
                        <strong className="text-ink-title">{p.name}</strong>
                        {p.breed ? ` · ${p.breed}` : ""} · {memberName(p.profiles)}
                      </span>
                      {apeladasPorMascota.has(p.id) && (
                        <span className="rounded-full bg-info-bg px-2.5 py-1 text-[10.5px] font-extrabold text-info-text">
                          ⚖️ {apeladasPorMascota.get(p.id)!.folio}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold ${
                          verBajas
                            ? "bg-cream text-ink-tertiary"
                            : p.approval_status === "approved"
                              ? "bg-success-bg text-success-text"
                              : "bg-error-bg text-error-text"
                        }`}
                      >
                        {verBajas
                          ? `🕊️ BAJA${p.deactivation_reason ? ` · ${p.deactivation_reason}` : ""}`
                          : p.approval_status === "approved"
                            ? "APROBADA"
                            : "RECHAZADA"}
                      </span>
                    </div>
                  }
                >
                  <div className="flex flex-col gap-4">
                    {p.photo_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.photo_url}
                        alt={p.name}
                        className="h-40 w-full rounded-[14px] object-cover"
                      />
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      <DetailItem label="ESPECIE" value={p.species === "dog" ? "Perro" : "Gato"} />
                      <DetailItem label="RAZA" value={p.breed} />
                      <DetailItem label="SEXO" value={p.sex} />
                      <DetailItem label="EDAD" value={ageLabel(p)} />
                      <DetailItem label="COLOR DE PELAJE" value={p.coat_color} />
                      <DetailItem label="COLOR DE OJOS" value={p.eye_color} />
                      <DetailItem
                        label="ADOPTADO"
                        value={p.is_adopted ? "Sí" : null}
                      />
                      <DetailItem
                        label={`SENIOR (${SENIOR_PET_AGE_YEARS}+)`}
                        value={p.is_senior ? "Sí" : null}
                      />
                      <DetailItem
                        label="ESTATUS"
                        value={p.approval_status === "approved" ? "Aprobada" : "Rechazada"}
                      />
                      <DetailItem label="NOTAS DEL COMITÉ" value={p.approval_notes} />
                      <DetailItem
                        label="PERÍODO DE ESPERA"
                        value={
                          p.waiting_period_bypassed
                            ? "Sin período de espera"
                            : p.waiting_period_end_date
                              ? `Termina el ${formatDateEs(new Date(p.waiting_period_end_date + "T00:00:00"))}`
                              : null
                        }
                      />
                      <DetailItem
                        label="REGISTRADA"
                        value={formatDateEs(new Date(p.created_at))}
                      />
                    </div>

                    <div className="flex flex-col gap-2.5 rounded-[12px] bg-cream p-3.5">
                      <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                        TUTOR
                      </span>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                        <DetailItem label="NOMBRE" value={memberName(p.profiles)} />
                        <DetailItem label="CORREO" value={prof?.email} />
                        <DetailItem label="TELÉFONO" value={prof?.phone} />
                        <DetailItem
                          label="MEMBRESÍA"
                          value={prof?.membership_status === "active" ? "Activa" : prof?.membership_status}
                        />
                        <DetailItem
                          label="MIEMBRO DESDE"
                          value={prof?.member_since ? formatDateEs(new Date(prof.member_since)) : null}
                        />
                        <DetailItem
                          label="OTRAS MASCOTAS"
                          value={
                            otherPets.length
                              ? otherPets.map((o) => o.name).join(", ")
                              : null
                          }
                        />
                      </div>
                    </div>

                    <SensitiveBlock isSuper={isSuper}>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                        <DetailItem label="CURP" value={prof?.curp} />
                        <DetailItem
                          label="FECHA DE NACIMIENTO"
                          value={
                            prof?.birth_date
                              ? formatDateEs(new Date(prof.birth_date + "T00:00:00"))
                              : null
                          }
                        />
                        <DetailItem label="DIRECCIÓN" value={addressOf(prof)} />
                        <DetailItem label="BANCO" value={prof?.bank_name} />
                        <DetailItem label="CLABE" value={prof?.clabe} />
                        <DetailItem label="RFC" value={prof?.rfc} />
                      </div>
                    </SensitiveBlock>

                    <Link
                      href={`/admin/miembros/${p.user_id}`}
                      className="self-start text-[13px] font-bold text-teal-deep hover:underline"
                    >
                      Ver expediente completo del miembro →
                    </Link>
                  </div>
                </DetailModal>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
