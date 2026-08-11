"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { WELLNESS_SERVICES, type WellnessService } from "@/lib/constants";

export type CenterCardData = {
  id: string;
  name: string;
  services: string[];
  memberBenefit: string | null;
  logoUrl: string | null;
  phone: string | null;
  website?: string | null;
  locations: {
    address: string | null;
    city: string | null;
    state: string | null;
    colony: string | null;
    postalCode: string | null;
    phone: string | null;
  }[];
  promotions: {
    title: string;
    discountLabel: string | null;
    validUntil: string | null;
  }[];
};

/** Pastel placeholder palettes cycled over cards without photo (design 6b). */
const PHOTO_PALETTES = [
  "bg-info-bg border-[#C9E9E4] text-teal",
  "bg-warning-bg border-[#F2D9AC] text-warning-text",
  "bg-error-bg border-[#F2C7D4] text-error-text",
];

const CHIP_PALETTES: Record<WellnessService, string> = {
  clinic: "bg-info-bg text-info-text",
  store: "bg-success-bg text-success-text",
  hotel: "bg-warning-bg text-warning-text",
  grooming: "bg-error-bg text-error-text",
  funeral: "bg-cream text-ink-secondary",
  walker: "bg-success-bg text-success-text",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function matchesQuery(center: CenterCardData, q: string) {
  if (!q) return true;
  const needle = norm(q);
  const haystack = [
    center.name,
    ...center.locations.flatMap((l) => [l.city, l.state, l.colony, l.postalCode]),
  ]
    .filter(Boolean)
    .map((s) => norm(s as string));
  return haystack.some((h) => h.includes(needle));
}

/**
 * Directorio de centros de bienestar (screen 6b). `hero` renders the dark-teal
 * search hero for the public page; the member app embeds it without hero.
 */
export function CentersExplorer({
  centers,
  hero = false,
}: {
  centers: CenterCardData[];
  hero?: boolean;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [service, setService] = useState<WellnessService | "all">("all");
  // Popup de detalle del centro (petición del equipo, 5-ago)
  const [selected, setSelected] = useState<CenterCardData | null>(null);

  const filtered = useMemo(
    () =>
      centers.filter(
        (c) =>
          (service === "all" || c.services.includes(service)) &&
          matchesQuery(c, query),
      ),
    [centers, query, service],
  );

  const searchBar = (
    <form
      className="flex items-center gap-2 rounded-full bg-white p-1.5 shadow-[0_2px_12px_rgba(30,83,80,.08)]"
      onSubmit={(e) => {
        e.preventDefault();
        setQuery(input);
      }}
    >
      <span className="pl-3 text-[15px]" aria-hidden>
        🔍
      </span>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ciudad o código postal…"
        className="h-10 min-w-0 flex-1 bg-transparent text-[13.5px] text-ink-title outline-none placeholder:text-ink-placeholder"
      />
      <button
        type="submit"
        className="h-10 rounded-full bg-teal px-5 text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep"
      >
        Buscar
      </button>
    </form>
  );

  return (
    <div className="flex flex-col">
      {hero && (
        <div className="relative overflow-hidden bg-teal-dark px-5 py-9 sm:px-10">
          <div className="blob absolute -right-[70px] -top-[80px] size-[260px] bg-white/[.08]" />
          <div className="relative flex max-w-[560px] flex-col gap-3.5">
            <h1 className="font-display text-[30px] leading-tight text-white sm:text-[38px]">
              Centros de bienestar aliados
            </h1>
            <p className="text-[14.5px] leading-[1.55] text-white/85">
              Veterinarias, tiendas, hoteles y más con beneficios para miembros
              — en todo México. Y recuerda: siempre puedes seguir con tu
              veterinario de confianza.
            </p>
            {searchBar}
          </div>
        </div>
      )}

      <div className={`flex flex-col gap-4 ${hero ? "px-5 py-6 sm:px-10" : ""}`}>
        {!hero && searchBar}

        {/* Service filter chips */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setService("all")}
            className={
              service === "all"
                ? "rounded-full bg-teal px-4 py-[7px] text-xs font-bold text-white"
                : "rounded-full border-[1.5px] border-border-input bg-white px-4 py-[7px] text-xs font-semibold text-ink-secondary transition-colors hover:border-teal"
            }
          >
            Todos
          </button>
          {(
            Object.entries(WELLNESS_SERVICES) as [
              WellnessService,
              (typeof WELLNESS_SERVICES)[WellnessService],
            ][]
          ).map(([key, svc]) => (
            <button
              key={key}
              type="button"
              onClick={() => setService(service === key ? "all" : key)}
              className={
                service === key
                  ? "rounded-full bg-teal px-4 py-[7px] text-xs font-bold text-white"
                  : "rounded-full border-[1.5px] border-border-input bg-white px-4 py-[7px] text-xs font-semibold text-ink-secondary transition-colors hover:border-teal"
              }
            >
              {svc.emoji} {svc.plural}
            </button>
          ))}
        </div>

        {/* Cards */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((center, i) => {
              const mainService = (center.services[0] ?? "clinic") as WellnessService;
              const svc = WELLNESS_SERVICES[mainService] ?? WELLNESS_SERVICES.clinic;
              const loc = center.locations[0];
              return (
                <article
                  key={center.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(center)}
                  onKeyDown={(e) => e.key === "Enter" && setSelected(center)}
                  className="flex cursor-pointer flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_2px_10px_rgba(30,83,80,.05)] transition-shadow hover:shadow-[0_4px_18px_rgba(30,83,80,.12)]"
                >
                  {center.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={center.logoUrl}
                      alt={center.name}
                      className="h-[110px] w-full object-cover"
                    />
                  ) : (
                    <div
                      className={`grid h-[110px] place-items-center border-b-2 border-dashed text-[11px] font-bold ${PHOTO_PALETTES[i % PHOTO_PALETTES.length]}`}
                    >
                      FOTO DEL CENTRO
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-bold text-ink-title">
                        {center.name}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-[3px] text-[10px] font-extrabold uppercase ${CHIP_PALETTES[mainService] ?? CHIP_PALETTES.clinic}`}
                      >
                        {svc.label}
                      </span>
                    </div>
                    <span className="text-xs text-ink-tertiary">
                      {loc
                        ? [loc.address, loc.colony, loc.city, loc.state, loc.postalCode]
                            .filter(Boolean)
                            .join(", ")
                        : "En todo México"}
                      {center.locations.length > 1 &&
                        ` · ${center.locations.length} ubicaciones`}
                    </span>
                    {(loc?.phone || center.phone) && (
                      <a
                        href={`tel:${(loc?.phone || center.phone || "").replace(/\D/g, "")}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-semibold text-teal-deep hover:underline"
                      >
                        📞 {loc?.phone || center.phone}
                      </a>
                    )}
                    {center.memberBenefit && (
                      <span className="text-xs font-semibold text-warning-text">
                        🎁 {center.memberBenefit}
                      </span>
                    )}
                    {center.promotions.map((p) => (
                      <span
                        key={p.title}
                        className="text-xs font-semibold text-teal-deep"
                      >
                        🏷️ {p.title}
                        {p.discountLabel ? ` — ${p.discountLabel}` : ""}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[18px] bg-white p-6 text-sm text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            No encontramos centros con esa búsqueda. Prueba con otra ciudad o
            quita los filtros — estamos sumando aliados en todo México. 🐾
          </div>
        )}

        {/* CTA: quiero ser centro aliado */}
        <div className="flex flex-col items-start gap-3 rounded-[16px] bg-white px-5 py-4 shadow-[0_2px_10px_rgba(30,83,80,.05)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-ink-title">
              ¿Tienes un negocio pet-friendly?
            </span>
            <span className="text-[12.5px] text-ink-tertiary">
              Únete a la red de centros aliados de Pata Amiga.
            </span>
          </div>
          <Link
            href="/centros/registro"
            className="grid h-11 place-items-center rounded-full border-2 border-teal px-6 text-[13px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            Quiero ser centro aliado
          </Link>
        </div>
      </div>

      {/* Popup de detalle del centro: toda la info, ruta en Google Maps,
          beneficios y promociones (petición del equipo, 5-ago). */}
      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-title/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-label={selected.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[86dvh] w-full max-w-[520px] overflow-y-auto rounded-[20px] bg-white p-5 shadow-[0_12px_40px_rgba(30,83,80,.25)]"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="font-display text-[20px] text-ink-title">
                {selected.name}
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Cerrar"
                className="grid size-8 flex-none place-items-center rounded-full bg-cream text-ink-secondary transition-colors hover:bg-border-input"
              >
                ✕
              </button>
            </div>

            {selected.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.logoUrl}
                alt={selected.name}
                className="mb-3 h-[180px] w-full rounded-[14px] bg-cream object-contain"
              />
            )}

            <div className="mb-3 flex flex-wrap gap-1.5">
              {selected.services.map((s) => {
                const svc = WELLNESS_SERVICES[s as WellnessService];
                return (
                  <span
                    key={s}
                    className={`rounded-full px-2.5 py-[3px] text-[10px] font-extrabold uppercase ${CHIP_PALETTES[s as WellnessService] ?? CHIP_PALETTES.clinic}`}
                  >
                    {svc ? `${svc.emoji} ${svc.label}` : s}
                  </span>
                );
              })}
            </div>

            {(selected.memberBenefit || selected.promotions.length > 0) && (
              <div className="mb-3 flex flex-col gap-1.5 rounded-[12px] bg-cream p-3.5">
                <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                  BENEFICIOS PARA MIEMBROS
                </span>
                {selected.memberBenefit && (
                  <span className="text-[13px] font-semibold text-warning-text">
                    🎁 {selected.memberBenefit}
                  </span>
                )}
                {selected.promotions.map((p) => (
                  <span
                    key={p.title}
                    className="text-[13px] font-semibold text-teal-deep"
                  >
                    🏷️ {p.title}
                    {p.discountLabel ? ` — ${p.discountLabel}` : ""}
                  </span>
                ))}
              </div>
            )}

            <div className="mb-3 flex flex-col gap-2.5">
              <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                UBICACIONES
              </span>
              {selected.locations.length > 0 ? (
                selected.locations.map((l, i) => {
                  const dir = [l.address, l.colony, l.city, l.state, l.postalCode]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <div key={i} className="flex flex-col gap-1 text-[13px] text-ink-body">
                      <span>📍 {dir || "Dirección por confirmar"}</span>
                      <span className="flex flex-wrap gap-3">
                        {dir && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${selected.name}, ${dir}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12.5px] font-bold text-teal-deep hover:underline"
                          >
                            🧭 Iniciar ruta en Google Maps
                          </a>
                        )}
                        {(l.phone || selected.phone) && (
                          <a
                            href={`tel:${(l.phone || selected.phone || "").replace(/\D/g, "")}`}
                            className="text-[12.5px] font-bold text-teal-deep hover:underline"
                          >
                            📞 {l.phone || selected.phone}
                          </a>
                        )}
                      </span>
                    </div>
                  );
                })
              ) : (
                <span className="text-[13px] text-ink-secondary">
                  En todo México.
                </span>
              )}
            </div>

            {selected.website && (
              <a
                href={selected.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-bold text-teal-deep hover:underline"
              >
                🌐 {selected.website.replace(/^https?:\/\/(www\.)?/, "")} ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
