import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRole } from "@/lib/admin-guard";
import { formatDateEs } from "@/lib/dates";
import { WELLNESS_SERVICES, type WellnessService } from "@/lib/constants";
import { DetailModal, DetailItem } from "@/components/panel/DetailModal";
import { FilterChips } from "@/components/panel/FilterChips";
import { SocialLinks } from "@/components/panel/SocialLinks";
import { CenterReviewRow } from "./CenterReviewRow";
import { CenterResolveButtons } from "./CenterResolveButtons";

type Row = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  services: string[];
  member_benefit: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  social_links: Record<string, string> | null;
  wellness_center_locations: {
    address: string | null;
    colony: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  }[];
  center_promotions: {
    title: string;
    discount_label: string | null;
    is_active: boolean;
    valid_until: string | null;
  }[];
};

const serviceLabels = (services: string[]) =>
  services
    .map((s) => WELLNESS_SERVICES[s as WellnessService]?.label ?? s)
    .join(" · ")
    .toUpperCase();

const locationLabel = (l: Row["wellness_center_locations"][number]) =>
  [l.address, l.colony, l.city, l.state, l.postal_code ? `CP ${l.postal_code}` : null]
    .filter(Boolean)
    .join(", ");

// Qué le falta al perfil del centro (Fase 4: en todos los popups). Nada de
// esto bloquea la aprobación; es para que el comité lo pida de un vistazo.
const faltantesCentro = (c: Row) =>
  [
    !c.logo_url && "logo",
    !c.member_benefit && "beneficio para miembros",
    !c.phone && "teléfono",
    !c.website && "sitio web",
    !Object.values(c.social_links ?? {}).some(Boolean) && "redes sociales",
    (c.wellness_center_locations ?? []).length === 0 && "ubicación",
  ].filter(Boolean) as string[];

export default async function AdminCentrosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; orden?: string }>;
}) {
  const { estado, orden } = await searchParams;
  const admin = createAdminClient();
  const isSuper = (await getAdminRole()) === "super_admin";
  // Por omisión los más recientes arriba, con filtro para invertir (Fase 4)
  const masAntiguos = orden === "antiguos";
  const [{ data }, { data: centerAppeals }] = await Promise.all([
    admin
      .from("wellness_centers")
      .select(
        "id, name, contact_name, email, phone, website, logo_url, services, member_benefit, status, rejection_reason, created_at, social_links, wellness_center_locations(address, colony, city, state, postal_code), center_promotions(title, discount_label, is_active, valid_until)",
      )
      .order("created_at", { ascending: masAntiguos }),
    admin
      .from("appeals")
      .select("id, folio, status, center_id")
      .not("center_id", "is", null),
  ]);

  // Tabs extra del super admin: apelaciones y bajas (equipo, 5-ago)
  const apeladosPorCentro = new Map<string, { folio: string; status: string }>();
  for (const a of centerAppeals ?? [])
    if (a.center_id && !apeladosPorCentro.has(a.center_id))
      apeladosPorCentro.set(a.center_id, { folio: a.folio, status: a.status });

  const verApelaciones = estado === "apelacion";
  const verBajas = estado === "bajas";
  const rows = ((data ?? []) as Row[]).filter((c) =>
    verApelaciones
      ? apeladosPorCentro.has(c.id)
      : verBajas
        ? c.status === "deactivated"
        : !estado || c.status === estado,
  );
  const pending = rows.filter(
    (c) => c.status === "pending" && !verApelaciones && !verBajas,
  );
  const resolved = rows.filter((c) => !pending.includes(c));

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] text-ink-title">
          Centros de bienestar
        </h1>
        <a
          href="/admin/centros/pagos"
          className="grid h-9 place-items-center rounded-full border-[1.5px] border-teal px-4 text-xs font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
        >
          💸 Pagos a centros →
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          basePath="/admin/centros"
          current={estado}
          keep={{ orden }}
          allLabel="Todos"
          options={[
            { value: "pending", label: "Pendientes" },
            { value: "approved", label: "Aprobados" },
            { value: "rejected", label: "Rechazados" },
            ...(isSuper
              ? [
                  { value: "apelacion", label: "⚖️ Apelaciones" },
                  { value: "bajas", label: "🕊️ Bajas" },
                ]
              : []),
          ]}
        />
        <FilterChips
          basePath="/admin/centros"
          current={orden}
          param="orden"
          keep={{ estado }}
          allLabel="Más recientes"
          options={[{ value: "antiguos", label: "Más antiguos" }]}
        />
      </div>

      {!verApelaciones && !verBajas && (
        <h2 className="font-display text-lg text-ink-title">
          Solicitudes por revisar
        </h2>
      )}
      <div className="flex flex-col gap-2.5">
        {pending.map((c) => (
          <CenterReviewRow
            key={c.id}
            center={{
              id: c.id,
              name: c.name,
              services: serviceLabels(c.services ?? []),
              benefit: c.member_benefit,
              contact: [c.contact_name, c.email, c.phone]
                .filter(Boolean)
                .join(" · "),
              locations: (c.wellness_center_locations ?? []).map(locationLabel),
              applied: formatDateEs(new Date(c.created_at)),
            }}
            detailSlot={
              <DetailModal title={`Solicitud de ${c.name}`}>
                <div className="flex flex-col gap-3">
                  {faltantesCentro(c).length > 0 && (
                    <span className="self-start rounded-full bg-warning-bg px-3 py-1.5 text-[11.5px] font-bold text-warning-text">
                      ⚠ Falta: {faltantesCentro(c).join(" · ")}
                    </span>
                  )}
                  {c.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.logo_url}
                      alt={c.name}
                      className="h-[140px] w-full rounded-[14px] bg-cream object-contain"
                    />
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <DetailItem label="CENTRO" value={c.name} />
                    <DetailItem label="CONTACTO" value={c.contact_name} />
                    <DetailItem label="CORREO" value={c.email} />
                    <DetailItem label="TELÉFONO" value={c.phone} />
                    <DetailItem
                      label="SITIO WEB"
                      value={
                        c.website ? (
                          <a
                            href={c.website}
                            target="_blank"
                            className="font-bold text-teal-deep hover:underline"
                          >
                            {c.website} ↗
                          </a>
                        ) : null
                      }
                    />
                    <DetailItem
                      label="SERVICIOS"
                      value={serviceLabels(c.services ?? [])}
                    />
                    <DetailItem
                      label="BENEFICIO PARA MIEMBROS"
                      value={c.member_benefit}
                    />
                    <DetailItem
                      label="SOLICITÓ"
                      value={formatDateEs(new Date(c.created_at))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                      UBICACIONES
                    </span>
                    {(c.wellness_center_locations ?? []).map((l, i) => (
                      <span key={i} className="text-[13px] text-ink-body">
                        📍 {locationLabel(l)}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                      REDES SOCIALES
                    </span>
                    <SocialLinks links={c.social_links} />
                  </div>
                  {/* Resolver sin salir del popup (equipo, 5-ago) */}
                  <div className="border-t border-border-divider pt-3">
                    <CenterResolveButtons centerId={c.id} />
                  </div>
                </div>
              </DetailModal>
            }
          />
        ))}
        {pending.length === 0 && !verApelaciones && !verBajas && (
          <div className="rounded-[18px] bg-white p-6 text-sm text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            Sin solicitudes pendientes. 🎉
          </div>
        )}
        {(verApelaciones || verBajas) && resolved.length === 0 && (
          <div className="rounded-[18px] bg-white p-6 text-sm text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            {verBajas
              ? "Sin centros dados de baja."
              : "Sin centros con apelación."}
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <>
          <h2 className="font-display text-lg text-ink-title">
            {verBajas
              ? "Dados de baja"
              : verApelaciones
                ? "Con apelación"
                : "Resueltos"}
          </h2>
          <div className="flex flex-col rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            {resolved.map((c) => (
              <DetailModal
                key={c.id}
                title={c.name}
                trigger={
                  <div className="flex items-center gap-3 border-b border-[#F2EEE4] px-1 py-2.5 text-[13px] text-ink-body">
                    <span className="flex-1">
                      <strong className="text-ink-title">{c.name}</strong>
                      {c.wellness_center_locations?.[0]?.city
                        ? ` · ${c.wellness_center_locations[0].city}`
                        : ""}
                      {c.member_benefit ? (
                        <span className="text-ink-tertiary">
                          {" "}
                          · 🎁 {c.member_benefit}
                        </span>
                      ) : null}
                    </span>
                    {apeladosPorCentro.has(c.id) && (
                      <span className="rounded-full bg-info-bg px-2.5 py-1 text-[10.5px] font-extrabold text-info-text">
                        ⚖️ {apeladosPorCentro.get(c.id)!.folio}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold ${
                        c.status === "approved"
                          ? "bg-success-bg text-success-text"
                          : c.status === "deactivated"
                            ? "bg-cream text-ink-tertiary"
                            : c.status === "pending"
                              ? "bg-warning-bg text-warning-text"
                              : "bg-error-bg text-error-text"
                      }`}
                    >
                      {c.status === "approved"
                        ? "APROBADO"
                        : c.status === "deactivated"
                          ? "🕊️ BAJA"
                          : c.status === "pending"
                            ? "PENDIENTE"
                            : "RECHAZADO"}
                    </span>
                  </div>
                }
              >
                <div className="flex flex-col gap-4">
                  {faltantesCentro(c).length > 0 && (
                    <span className="self-start rounded-full bg-warning-bg px-3 py-1.5 text-[11.5px] font-bold text-warning-text">
                      ⚠ Falta: {faltantesCentro(c).join(" · ")}
                    </span>
                  )}
                  {c.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.logo_url}
                      alt={c.name}
                      className="h-[140px] w-full rounded-[14px] bg-cream object-contain"
                    />
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <DetailItem label="CONTACTO" value={c.contact_name} />
                    <DetailItem label="CORREO" value={c.email} />
                    <DetailItem label="TELÉFONO" value={c.phone} />
                    <DetailItem
                      label="SITIO WEB"
                      value={
                        c.website ? (
                          <a
                            href={c.website}
                            target="_blank"
                            className="font-bold text-teal-deep hover:underline"
                          >
                            {c.website} ↗
                          </a>
                        ) : null
                      }
                    />
                    <DetailItem
                      label="SERVICIOS"
                      value={serviceLabels(c.services ?? [])}
                    />
                    <DetailItem
                      label="BENEFICIO PARA MIEMBROS"
                      value={c.member_benefit}
                    />
                    <DetailItem
                      label="ESTATUS"
                      value={c.status === "approved" ? "Aprobado" : "Rechazado"}
                    />
                    <DetailItem label="MOTIVO DE RECHAZO" value={c.rejection_reason} />
                    <DetailItem
                      label="SOLICITÓ"
                      value={formatDateEs(new Date(c.created_at))}
                    />
                  </div>
                  {(c.wellness_center_locations ?? []).length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                        SUCURSALES
                      </span>
                      {(c.wellness_center_locations ?? []).map((l, i) => (
                        <span key={i} className="text-[13px] text-ink-body">
                          📍 {locationLabel(l)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                      REDES SOCIALES
                    </span>
                    <SocialLinks links={c.social_links} />
                  </div>
                  {(c.center_promotions ?? []).length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                        PROMOCIONES
                      </span>
                      {(c.center_promotions ?? []).map((p, i) => (
                        <span key={i} className="text-[13px] text-ink-body">
                          🎁 {p.title}
                          {p.discount_label ? ` — ${p.discount_label}` : ""}
                          {!p.is_active ? " (inactiva)" : ""}
                          {p.valid_until
                            ? ` · vence ${formatDateEs(new Date(p.valid_until + "T00:00:00"))}`
                            : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </DetailModal>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
