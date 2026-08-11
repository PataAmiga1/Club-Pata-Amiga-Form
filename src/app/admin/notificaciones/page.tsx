import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ZONA_MX } from "@/lib/zona-horaria";

/**
 * Notificaciones: la misma actividad que alimenta la campana del resumen,
 * pero como página completa del menú (petición del equipo, 5-ago) — más
 * historial por fuente y con hora exacta.
 */
export default async function AdminNotificacionesPage() {
  const admin = createAdminClient();

  const [evReimb, evAppeals, evAmb, evCenters, evLeads, evErrors] =
    await Promise.all([
      admin
        .from("reimbursements")
        .select("id, folio, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      admin
        .from("appeals")
        .select("id, folio, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      admin
        .from("ambassadors")
        .select("id, first_name, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      admin
        .from("wellness_centers")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      admin
        .from("campaign_leads")
        .select("id, first_name, campaign, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      admin
        .from("error_logs")
        .select("id, context, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const events = [
    ...(evReimb.data ?? []).map((r) => ({
      id: `r-${r.id}`,
      icon: "💚",
      text: `Nueva solicitud de reintegro ${r.folio}`,
      href: `/admin/reintegros/${r.id}`,
      created_at: r.created_at,
    })),
    ...(evAppeals.data ?? []).map((a) => ({
      id: `a-${a.id}`,
      icon: "⚖️",
      text: `Apelación ${a.folio} presentada`,
      href: "/admin/apelaciones",
      created_at: a.created_at,
    })),
    ...(evAmb.data ?? []).map((a) => ({
      id: `e-${a.id}`,
      icon: "🤝",
      text: `${a.first_name} solicitó ser embajador`,
      // Al detalle del embajador, no a la lista general (equipo, 11-ago:
      // "tiene que mandar a lo particular y no a lo general")
      href: `/admin/embajadores/${a.id}`,
      created_at: a.created_at,
    })),
    ...(evCenters.data ?? []).map((c) => ({
      id: `c-${c.id}`,
      icon: "📍",
      text: `${c.name} solicitó ser centro aliado`,
      href: "/admin/centros",
      created_at: c.created_at,
    })),
    ...(evLeads.data ?? []).map((l) => ({
      id: `l-${l.id}`,
      icon: "🎯",
      text: `${l.first_name} se registró en la landing «${l.campaign}»`,
      href: "/admin/landings",
      created_at: l.created_at,
    })),
    ...(evErrors.data ?? []).map((e) => ({
      id: `x-${e.id}`,
      icon: "⚠️",
      text: `Error en ${e.context}`,
      href: "/admin",
      created_at: e.created_at,
    })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const cuando = (iso: string) =>
    new Intl.DateTimeFormat("es-MX", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: ZONA_MX,
    }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] text-ink-title">
          Notificaciones
        </h1>
        <p className="text-sm text-ink-secondary">
          Toda la actividad reciente: reintegros, apelaciones, solicitudes,
          landings y errores del sistema.
        </p>
      </div>
      <div className="flex flex-col rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        {events.map((e) => (
          <Link
            key={e.id}
            href={e.href}
            className="flex items-center gap-3 border-b border-[#F2EEE4] px-1 py-3 text-[13px] text-ink-body transition-colors last:border-0 hover:bg-cream"
          >
            <span aria-hidden className="text-[16px]">
              {e.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{e.text}</span>
            <span className="flex-none text-[11.5px] text-ink-tertiary">
              {cuando(e.created_at)}
            </span>
          </Link>
        ))}
        {events.length === 0 && (
          <span className="py-3 text-sm text-ink-secondary">
            Sin actividad todavía.
          </span>
        )}
      </div>
    </div>
  );
}
