import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortal } from "@/lib/panel-guard";
import { PanelShell } from "@/components/panel/PanelShell";
import { AdminNav, AdminNavMobile } from "@/components/admin/AdminNav";
import { AdminBell } from "@/components/admin/AdminBell";
import { fetchEventosAdmin } from "@/lib/admin/eventos";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Valida rol y devuelve capacidades y portales disponibles (para el
  // conmutador del menú de perfil).
  const session = await requirePortal("admin");

  // Contadores de las colas para los badges de la barra lateral
  // (service role: los conteos abarcan a todos los miembros)
  const admin = createAdminClient();
  const [petsQ, reimbQ, ambQ, centersQ, appealsQ, eventos] = await Promise.all([
    admin
      .from("pets")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending")
      .eq("is_active", true),
    admin
      .from("reimbursements")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "in_review"]),
    admin
      .from("ambassadors")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("wellness_centers")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("appeals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    // Actividad para la campanita (misma fuente que /admin/notificaciones)
    fetchEventosAdmin(admin, 4),
  ]);

  const navProps = {
    petsPending: petsQ.count ?? 0,
    reimbursementsPending: reimbQ.count ?? 0,
    ambassadorsPending: ambQ.count ?? 0,
    centersPending: centersQ.count ?? 0,
    appealsPending: appealsQ.count ?? 0,
    isSuper: session.role === "super_admin",
  };
  const pendingTotal =
    navProps.petsPending +
    navProps.reimbursementsPending +
    navProps.ambassadorsPending +
    navProps.centersPending +
    navProps.appealsPending;

  return (
    <PanelShell
      portal="admin"
      session={session}
      nav={<AdminNav {...navProps} />}
      navMobile={<AdminNavMobile {...navProps} />}
      bell={<AdminBell events={eventos.slice(0, 10)} pending={pendingTotal} />}
    >
      {children}
    </PanelShell>
  );
}
