import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type EventoAdmin = {
  id: string;
  icon: string;
  text: string;
  href: string;
  created_at: string;
};

/**
 * Actividad reciente del panel — la MISMA fuente para la campanita del
 * encabezado y para la página /admin/notificaciones (decisión de Pablo,
 * 11-ago: las notificaciones viven en las dos). Un solo lugar arma los
 * eventos para que los enlaces "al detalle" no se desalineen entre ambas
 * superficies (observación repetida del equipo: la notificación debe llevar
 * al expediente particular, no a la lista general).
 */
export async function fetchEventosAdmin(
  admin: Admin,
  porFuente: number,
): Promise<EventoAdmin[]> {
  const [evReimb, evAppeals, evAmb, evCenters, evLeads, evErrors] =
    await Promise.all([
      admin
        .from("reimbursements")
        .select("id, folio, created_at")
        .order("created_at", { ascending: false })
        .limit(porFuente),
      admin
        .from("appeals")
        .select("id, folio, created_at")
        .order("created_at", { ascending: false })
        .limit(porFuente),
      admin
        .from("ambassadors")
        .select("id, first_name, created_at")
        .order("created_at", { ascending: false })
        .limit(porFuente),
      admin
        .from("wellness_centers")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(porFuente),
      admin
        .from("campaign_leads")
        .select("id, first_name, campaign, created_at")
        .order("created_at", { ascending: false })
        .limit(porFuente),
      admin
        .from("error_logs")
        .select("id, context, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(porFuente, 10)),
    ]);

  return [
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
      // Al expediente particular, no a la lista (equipo, 11-ago)
      href: `/admin/embajadores/${a.id}`,
      created_at: a.created_at,
    })),
    ...(evCenters.data ?? []).map((c) => ({
      id: `c-${c.id}`,
      icon: "📍",
      text: `${c.name} solicitó ser centro aliado`,
      // Los centros no tienen página de detalle todavía (Fase 4)
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
}
