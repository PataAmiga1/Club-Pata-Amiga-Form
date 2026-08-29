import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DashboardEntry } from "@/components/app/ProfileMenu";

/**
 * Contexto del portal del centro aliado, compartido por el layout y las cuatro
 * pestañas (Resumen · Promociones · Pagos · Mi cuenta).
 *
 * Vive aparte por la misma razón que `embajador/shared.ts`: cada pestaña es su
 * propia página y todas necesitan lo mismo —sesión, centro resuelto, si el
 * dueño además es miembro— sin repetir la consulta ni el enredo de ligar por
 * correo las solicitudes hechas sin sesión.
 */
export type CenterRow = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  services: string[] | null;
  member_benefit: string | null;
  status: string;
  rejection_reason: string | null;
  social_links: Record<string, string> | null;
};

export type CenterContext = {
  userId: string;
  center: CenterRow;
  isMember: boolean;
  wasMember: boolean;
  /** Otros paneles de esta cuenta (cambio estilo Instagram desde el avatar). */
  menuEntries: DashboardEntry[];
};

const CENTER_COLS =
  "id, name, contact_name, email, phone, website, logo_url, services, member_benefit, status, rejection_reason, social_links";

/**
 * Envuelto en `cache()` porque el layout y la página de la pestaña lo piden
 * los dos en el mismo render: sin esto, cada visita a una pestaña repetía las
 * cuatro consultas.
 */
export const getCenterContext = cache(async function getCenterContext(): Promise<CenterContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/centro");

  const admin = createAdminClient();
  let { data: centerRows } = await admin
    .from("wellness_centers")
    .select(CENTER_COLS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Solicitud enviada sin sesión (user_id null) con el correo de esta cuenta:
  // se liga aquí para que el centro vea su dashboard al iniciar sesión
  if (!centerRows?.length && user.email) {
    const { data: byEmail } = await admin
      .from("wellness_centers")
      .select(CENTER_COLS)
      .is("user_id", null)
      .eq("email", user.email.toLowerCase())
      .order("created_at", { ascending: false });
    if (byEmail?.length) {
      await admin
        .from("wellness_centers")
        .update({ user_id: user.id })
        .in(
          "id",
          byEmail.map((c) => c.id),
        );
      centerRows = byEmail;
    }
  }

  // Un centro aprobado siempre gana sobre solicitudes más nuevas
  const center =
    centerRows?.find((c) => c.status === "approved") ?? centerRows?.[0];
  if (!center) redirect("/centros/registro");

  const [{ data: memberProfile }, { data: activeSub }, { data: ambassadorRows }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("member_since")
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
      admin
        .from("ambassadors")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .limit(1),
    ]);

  const isMember = Boolean(activeSub);

  return {
    userId: user.id,
    center: center as CenterRow,
    isMember,
    wasMember: Boolean(memberProfile?.member_since),
    menuEntries: [
      ...(isMember
        ? [{ href: "/app", icon: "🐾", label: "Panel de miembro" }]
        : []),
      ...(ambassadorRows?.length
        ? [{ href: "/embajador", icon: "🤝", label: "Panel de embajador" }]
        : []),
    ],
  };
});

/**
 * Las cuatro pestañas necesitan las sucursales del centro (Resumen las pinta,
 * y la pantalla de "en revisión" del layout también). Se pide aparte para que
 * cada página cargue solo lo suyo.
 */
export async function getCenterLocations(centerId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("wellness_center_locations")
    .select("id, address, colony, city, state, postal_code, phone")
    .eq("center_id", centerId)
    .order("created_at", { ascending: true });
  return data ?? [];
}
