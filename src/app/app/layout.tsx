import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarLinks, TabBar } from "@/components/app/NavLinks";
import { LogoutButton } from "@/components/app/LogoutButton";
import { EmergencyButton } from "@/components/app/EmergencyButton";
import { AsistenteWidget } from "@/components/app/AsistenteWidget";
import { DemoAgenteWidget } from "@/components/app/DemoAgenteWidget";
import { mostrarAgenteDemo } from "@/lib/demo-agent";
import { ProfileMenu, type DashboardEntry } from "@/components/app/ProfileMenu";
import {
  NotificationsBell,
  type NotificationItem,
} from "@/components/app/NotificationsBell";
import { fetchSiteSettings } from "@/lib/site";
import { situacionDeCobro, etiquetaDeCobro } from "@/lib/membresia";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app");

  // ¿Le toca la versión de demostración del asistente? Se decide aquí, en el
  // servidor, no en el navegador.
  const demo = await mostrarAgenteDemo(user.id);

  const [{ data: profile }, { data: sub }, { data: ambassadorRows }, { data: centerRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, email, member_since, membership_status, avatar_url")
        .eq("id", user.id)
        .single(),
      supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("ambassadors")
        .select("id, status")
        .eq("user_id", user.id)
        .in("status", ["pending", "approved"]),
      supabase
        .from("wellness_centers")
        .select("id, status")
        .eq("user_id", user.id)
        .in("status", ["pending", "approved", "rejected"]),
    ]);

  // Embajador o centro aliado puro (nunca ha sido miembro) sin plan activo:
  // su lugar es su propio dashboard, donde además puede unirse como miembro.
  const isAmbassador = (ambassadorRows ?? []).length > 0;
  const isCenter = (centerRows ?? []).length > 0;
  if (!sub && !profile?.member_since) {
    if (isAmbassador) redirect("/embajador");
    if (isCenter) redirect("/centro");
  }

  // Miembro que además es embajador o centro aprobado → link a su panel en el menú
  const showAmbassadorLink = (ambassadorRows ?? []).some(
    (a) => a.status === "approved",
  );
  const showCenterLink = (centerRows ?? []).some(
    (c) => c.status === "approved",
  );

  const settings = await fetchSiteSettings();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, message, read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Otros paneles de esta cuenta — cambio estilo Instagram desde el avatar
  const menuEntries: DashboardEntry[] = [
    ...(showAmbassadorLink
      ? [{ href: "/embajador", icon: "🤝", label: "Panel de embajador" }]
      : []),
    ...(showCenterLink
      ? [{ href: "/centro", icon: "🏪", label: "Mi centro aliado" }]
      : []),
  ];

  const displayName =
    profile?.first_name || profile?.email?.split("@")[0] || "Miembro";
  const initial = displayName.charAt(0).toUpperCase();
  // Un heredado de Memberstack está activo aunque no tenga suscripción aquí:
  // la barra decía "Sin plan activo" a 60 miembros (auditoría 11-ago).
  const planLabel = etiquetaDeCobro(
    situacionDeCobro(profile?.membership_status, sub),
  );

  return (
    <div className="min-h-dvh bg-cream md:grid md:grid-cols-[240px_1fr]">
      {/* Top bar móvil: logo + campana + avatar con menú (ajustes, cambio de panel, logout) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border-divider bg-white px-4 py-2.5 md:hidden">
        <Link href="/app">
          <Image
            src="/brand/logo-light-bg.svg"
            alt="Pata Amiga"
            width={104}
            height={37}
            className="h-9 w-auto"
            priority
          />
        </Link>
        <div className="flex items-center gap-2.5">
          <NotificationsBell
            initial={(notifications ?? []) as NotificationItem[]}
          />
          <ProfileMenu
            initial={initial}
            avatarUrl={profile?.avatar_url ?? null}
            entries={menuEntries}
            settingsHref="/app/cuenta"
          />
        </div>
      </header>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1.5 border-r border-border-divider bg-white px-[18px] py-[22px] md:flex">
        <Link href="/app" className="mb-[18px] ml-1.5 self-start">
          <Image
            src="/brand/logo-light-bg.svg"
            alt="Pata Amiga"
            width={124}
            height={44}
            className="h-11 w-auto"
            priority
          />
        </Link>
        <SidebarLinks ambassador={showAmbassadorLink} center={showCenterLink} />
        <div className="mt-auto flex flex-col gap-1.5">
          <Link
            href="/app/cuenta"
            className="flex items-center gap-3 rounded-[12px] px-3.5 py-[11px] text-sm font-semibold text-[#5B6B68] transition-colors hover:bg-cream"
          >
            <span aria-hidden>⚙️</span>
            Mi cuenta
          </Link>
          <LogoutButton />
          <div className="flex items-center gap-2.5 rounded-[14px] bg-cream p-3.5">
            <div className="grid size-[38px] flex-none place-items-center rounded-full bg-teal text-[15px] font-bold text-white">
              {initial}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-bold text-ink-title">
                {displayName}
              </span>
              <span className="text-[11.5px] text-ink-tertiary">
                {planLabel}
              </span>
            </div>
          </div>
        </div>
      </aside>
      {/* Content (bottom padding clears the mobile tab bar) */}
      <main className="pb-24 md:pb-0">{children}</main>
      {/* Botón de emergencia — solo miembros con membresía activa */}
      {sub && <EmergencyButton phone={settings.emergency_phone ?? ""} />}
      {/* El asistente real para quien tiene plan; la versión de demostración
          para quien creó su cuenta y todavía no paga (sección 6). Nunca los
          dos: son agentes distintos, no el mismo con menos alcance. */}
      {demo ? <DemoAgenteWidget /> : <AsistenteWidget />}
      <TabBar ambassador={showAmbassadorLink} center={showCenterLink} />
    </div>
  );
}
