import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** PostgREST devuelve el embebido como objeto o como arreglo de uno. */
const uno = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export type EventoAdmin = {
  id: string;
  icon: string;
  text: string;
  href: string;
  created_at: string;
  /** Fuente del evento — alimenta el filtro de /admin/notificaciones. */
  fuente: FuenteEvento;
};

export const FUENTES_EVENTO = [
  { value: "reintegros", label: "💚 Reintegros" },
  { value: "apelaciones", label: "⚖️ Apelaciones" },
  { value: "embajadores", label: "🤝 Embajadores" },
  { value: "centros", label: "📍 Centros" },
  { value: "landings", label: "🎯 Landings" },
  { value: "errores", label: "⚠️ Errores" },
] as const;

export type FuenteEvento = (typeof FUENTES_EVENTO)[number]["value"];

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
  const [evReimb, evAppeals, evAmb, evCenters, evLeads, evErrors, evRespuestas] =
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
      // RESPUESTAS EN EL HILO (equipo, 2-sep). Faltaba: cuando el comité pide
      // algo, al solicitante le llega correo y aviso; cuando el solicitante
      // CONTESTA, solo salía un correo al buzón del equipo y aquí no aparecía
      // nada. Con volumen, una respuesta se perdía y la solicitud se quedaba
      // esperando a nadie.
      admin
        .from("solicitud_messages")
        .select(
          "id, ambassador_id, center_id, created_at, ambassadors(first_name), wellness_centers(name)",
        )
        .eq("sender", "solicitante")
        .order("created_at", { ascending: false })
        .limit(porFuente),
    ]);

  return [
    ...(evReimb.data ?? []).map((r) => ({
      id: `r-${r.id}`,
      icon: "💚",
      text: `Nueva solicitud de reintegro ${r.folio}`,
      href: `/admin/reintegros/${r.id}`,
      created_at: r.created_at,
      fuente: "reintegros" as const,
    })),
    ...(evAppeals.data ?? []).map((a) => ({
      id: `a-${a.id}`,
      icon: "⚖️",
      text: `Apelación ${a.folio} presentada`,
      href: "/admin/apelaciones",
      created_at: a.created_at,
      fuente: "apelaciones" as const,
    })),
    ...(evAmb.data ?? []).map((a) => ({
      id: `e-${a.id}`,
      icon: "🤝",
      text: `${a.first_name} solicitó ser embajador`,
      // Al expediente particular, no a la lista (equipo, 11-ago)
      href: `/admin/embajadores/${a.id}`,
      created_at: a.created_at,
      fuente: "embajadores" as const,
    })),
    ...(evCenters.data ?? []).map((c) => ({
      id: `c-${c.id}`,
      icon: "📍",
      text: `${c.name} solicitó ser centro aliado`,
      // Los centros no tienen página de detalle todavía (Fase 4)
      href: "/admin/centros",
      created_at: c.created_at,
      fuente: "centros" as const,
    })),
    ...(evLeads.data ?? []).map((l) => ({
      id: `l-${l.id}`,
      icon: "🎯",
      text: `${l.first_name} se registró en la landing «${l.campaign}»`,
      href: "/admin/landings",
      created_at: l.created_at,
      fuente: "landings" as const,
    })),
    ...(evErrors.data ?? []).map((e) => ({
      id: `x-${e.id}`,
      icon: "⚠️",
      text: `Error en ${e.context}`,
      href: "/admin",
      created_at: e.created_at,
      fuente: "errores" as const,
    })),
    // La respuesta cae en la MISMA fuente que su solicitud —embajadores o
    // centros— para que los filtros de arriba sigan sirviendo: quien filtra
    // por "Embajadores" quiere ver todo lo de esa cola, la solicitud y la
    // respuesta.
    ...(evRespuestas.data ?? []).map((m) => {
      const esEmbajador = Boolean(m.ambassador_id);
      const quien = esEmbajador
        ? (uno(m.ambassadors)?.first_name ?? "Un embajador")
        : (uno(m.wellness_centers)?.name ?? "Un centro aliado");
      return {
        id: `s-${m.id}`,
        icon: "💬",
        text: `${quien} respondió a la solicitud de información`,
        href: esEmbajador
          ? `/admin/embajadores/${m.ambassador_id}`
          : "/admin/centros",
        created_at: m.created_at,
        fuente: (esEmbajador ? "embajadores" : "centros") as FuenteEvento,
      };
    }),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
