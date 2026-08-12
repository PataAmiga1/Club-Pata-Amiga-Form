import { createAdminClient } from "@/lib/supabase/admin";
import { ZONA_MX } from "@/lib/zona-horaria";
import {
  CAMPAIGNS,
  campaignCouponKey,
  campaignPdfSlot,
} from "@/lib/landings";
import { updateSiteAsset, updateSiteSettings } from "@/app/admin/actions";
import { ResendGiftButton } from "./ResendGiftButton";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const EMAIL_CHIP: Record<string, { text: string; cls: string }> = {
  sent: { text: "ENVIADO", cls: "bg-success-bg text-success-text" },
  pending: { text: "PENDIENTE", cls: "bg-warning-bg text-warning-text" },
  failed: { text: "FALLÓ", cls: "bg-error-bg text-error-text" },
};

/** CRM de landings de campaña: leads, cupón, PDF y reenvío del regalo. */
export default async function AdminLandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; q?: string }>;
}) {
  const { c, q } = await searchParams;
  const activeFilter = c ?? "";
  const query = q?.trim() ?? "";

  const admin = createAdminClient();

  let leadsQuery = admin
    .from("campaign_leads")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(200);
  if (activeFilter) leadsQuery = leadsQuery.eq("campaign", activeFilter);
  if (query) {
    const like = `%${query.replace(/[%_,]/g, "")}%`;
    leadsQuery = leadsQuery.or(
      `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
    );
  }

  const [{ data: leads, count }, { data: settings }, { data: assets }] =
    await Promise.all([
      leadsQuery,
      admin.from("site_settings").select("key, value"),
      admin.from("site_assets").select("slot, url"),
    ]);

  const settingOf = (key: string) =>
    (settings ?? []).find((s) => s.key === key)?.value ?? "";
  const assetOf = (slot: string) =>
    (assets ?? []).find((a) => a.slot === slot)?.url ?? null;

  // Conteo por campaña para las tarjetas
  const { data: allLeads } = await admin
    .from("campaign_leads")
    .select("campaign");
  const countOf = (slug: string) =>
    (allLeads ?? []).filter((l) => l.campaign === slug).length;

  // Conversión: leads cuyo correo ya tiene cuenta de miembro
  const leadEmails = (leads ?? []).map((l) => l.email);
  const { data: converted } = leadEmails.length
    ? await admin
        .from("profiles")
        .select("email, membership_status")
        .in("email", leadEmails)
    : { data: [] };
  const memberStatusOf = (email: string) =>
    (converted ?? []).find((p) => p.email === email)?.membership_status ?? null;

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] text-ink-title">Landings</h1>
        <p className="max-w-[620px] text-sm text-ink-secondary">
          Campañas de captación (ads / patrocinadores). Cada registro recibe
          automáticamente el correo «Obtén tu regalo» con el cupón y la guía
          PDF que cargues aquí. El texto del correo se edita en Comunicados.
        </p>
      </div>

      {/* Tarjetas de campaña: cupón + PDF + URL */}
      <div className="grid gap-4 lg:grid-cols-2">
        {CAMPAIGNS.map((camp) => {
          const pdfUrl = assetOf(campaignPdfSlot(camp.slug));
          const coupon = settingOf(campaignCouponKey(camp.slug));
          const url = `${SITE_URL}/landings/${camp.slug}`;
          return (
            <div
              key={camp.slug}
              className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink-title">
                  {camp.name}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold ${camp.active ? "bg-success-bg text-success-text" : "bg-error-bg text-error-text"}`}
                >
                  {camp.active ? "ACTIVA" : "INACTIVA"}
                </span>
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-[13px] font-semibold text-teal-deep hover:underline"
              >
                {url} ↗
              </a>
              <span className="text-[13px] text-ink-body">
                <strong className="font-display text-[20px] text-ink-title">
                  {countOf(camp.slug)}
                </strong>{" "}
                registros
              </span>

              <form
                action={updateSiteSettings}
                className="flex items-end gap-2"
              >
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[12px] font-semibold text-ink-title">
                    Palabra cupón{" "}
                    <span className="font-normal text-ink-tertiary">
                      (vacío = «por activarse» en el correo)
                    </span>
                  </span>
                  <input
                    name={campaignCouponKey(camp.slug)}
                    defaultValue={coupon}
                    placeholder="Ej. MANADA10"
                    className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-sm uppercase tracking-wide text-ink-title outline-none focus:border-teal"
                  />
                </label>
                <button
                  type="submit"
                  className="grid h-10 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep"
                >
                  Guardar
                </button>
              </form>

              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-ink-title">
                  Guía PDF del regalo
                </span>
                {pdfUrl ? (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-teal-deep hover:underline"
                  >
                    Ver PDF actual ↗
                  </a>
                ) : (
                  <span className="text-xs text-ink-placeholder">
                    Sin PDF — el correo dirá «llegará muy pronto»
                  </span>
                )}
                <form action={updateSiteAsset} className="flex items-center gap-2">
                  <input type="hidden" name="slot" value={campaignPdfSlot(camp.slug)} />
                  <input
                    type="file"
                    name="file"
                    accept="application/pdf"
                    required
                    className="min-w-0 flex-1 text-xs text-ink-secondary file:mr-2 file:rounded-full file:border-0 file:bg-info-bg file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-info-text"
                  />
                  <button
                    type="submit"
                    className="grid h-9 flex-none place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep"
                  >
                    {pdfUrl ? "Reemplazar" : "Subir"}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      {/* Leads */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink-title">
          Registros{" "}
          <span className="text-sm font-normal text-ink-tertiary">
            ({count ?? 0})
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/admin/landings" className="flex items-center gap-2">
            <select
              name="c"
              defaultValue={activeFilter}
              className="h-9 appearance-none rounded-full border-[1.5px] border-border-input bg-white px-3 text-xs font-semibold text-ink-title outline-none"
            >
              <option value="">Todas las campañas</option>
              {CAMPAIGNS.map((camp) => (
                <option key={camp.slug} value={camp.slug}>
                  {camp.name}
                </option>
              ))}
            </select>
            <input
              name="q"
              defaultValue={query}
              placeholder="Nombre, correo o teléfono…"
              className="h-9 w-[210px] rounded-full border-[1.5px] border-border-input bg-white px-3.5 text-xs text-ink-title outline-none focus:border-teal"
            />
            <button
              type="submit"
              className="grid h-9 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep"
            >
              Filtrar
            </button>
          </form>
          <a
            href={`/api/admin/landings/export${activeFilter ? `?c=${activeFilter}` : ""}`}
            className="grid h-9 place-items-center rounded-full border-[1.5px] border-teal px-4 text-xs font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            ⬇ Exportar CSV
          </a>
        </div>
      </div>

      <div className="flex flex-col overflow-x-auto rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <div className="grid min-w-[860px] grid-cols-[1fr_220px_120px_110px_110px_110px] gap-2 border-b-[1.5px] border-[#F2EEE4] pb-2 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder">
          <span>NOMBRE</span>
          <span>CORREO</span>
          <span>TELÉFONO</span>
          <span>FECHA</span>
          <span>CORREO REGALO</span>
          <span>ACCIONES</span>
        </div>
        {(leads ?? []).map((l) => {
          const chip = EMAIL_CHIP[l.gift_email_status] ?? EMAIL_CHIP.pending;
          return (
            <div
              key={l.id}
              className="grid min-w-[860px] grid-cols-[1fr_220px_120px_110px_110px_110px] items-center gap-2 border-b border-[#F2EEE4] py-[10px] text-[12.5px] text-ink-body last:border-0"
            >
              <span className="min-w-0">
                <strong className="text-ink-title">
                  {l.first_name} {l.last_name}
                </strong>
                {(() => {
                  const status = memberStatusOf(l.email);
                  if (!status) return null;
                  return (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[9.5px] font-extrabold ${
                        status === "active"
                          ? "bg-success-bg text-success-text"
                          : "bg-info-bg text-info-text"
                      }`}
                      title="Este lead ya creó cuenta en la plataforma"
                    >
                      {status === "active" ? "YA ES MIEMBRO ✓" : "CREÓ CUENTA"}
                    </span>
                  );
                })()}
                {!activeFilter && (
                  <span className="block text-[11px] text-ink-tertiary">
                    {l.campaign}
                    {l.utm_source ? ` · ${l.utm_source}` : ""}
                  </span>
                )}
              </span>
              <span className="truncate">{l.email}</span>
              <span>{l.phone}</span>
              <span>
                {new Intl.DateTimeFormat("es-MX", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: ZONA_MX,
                }).format(new Date(l.created_at))}
              </span>
              <span
                className={`justify-self-start rounded-full px-2.5 py-[3px] text-[10.5px] font-extrabold ${chip.cls}`}
              >
                {chip.text}
              </span>
              <ResendGiftButton leadId={l.id} />
            </div>
          );
        })}
        {(leads ?? []).length === 0 && (
          <span className="py-4 text-sm text-ink-secondary">
            Aún no hay registros{query ? " con esa búsqueda" : ""}.
          </span>
        )}
      </div>
    </div>
  );
}
