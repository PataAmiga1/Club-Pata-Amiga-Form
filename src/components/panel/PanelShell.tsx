import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "@/components/app/LogoutButton";
import { ProfileMenu } from "@/components/panel/ProfileMenu";
import { PORTALS, type Portal } from "@/lib/permissions";
import type { PanelSession } from "@/lib/panel-guard";

/**
 * Cascarón compartido por el panel de administración (/admin) y el portal de
 * ventas (/ventas): barra lateral en escritorio, barra superior con chips en
 * móvil, y el menú de perfil con el conmutador de portales.
 *
 * Es la pieza que hace real el principio de "fuente única, dos superficies":
 * una sola estructura, dos menús. Lo que se arregle aquí se arregla en los dos.
 */
export function PanelShell({
  portal,
  session,
  nav,
  navMobile,
  bell,
  children,
}: {
  portal: Portal;
  session: PanelSession;
  /** Menú de escritorio (barra lateral). */
  nav: React.ReactNode;
  /** Menú móvil (chips horizontales bajo la barra superior). */
  navMobile: React.ReactNode;
  /**
   * Campanita de notificaciones, arriba a la derecha (equipo 07-ago; Pablo
   * 11-ago: vive aquí Y en la barra). Opcional — ventas no la usa todavía.
   */
  bell?: React.ReactNode;
  children: React.ReactNode;
}) {
  const meta = PORTALS[portal];

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-cream md:grid-cols-[224px_1fr]">
      {/* Barra superior móvil: logo + perfil + nav horizontal con badges */}
      <header className="sticky top-0 z-30 flex flex-col bg-teal-dark md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-3">
          <Link href={meta.href} className="flex-none">
            <Image
              src="/brand/logo-on-dark.svg"
              alt="Pata Amiga"
              width={96}
              height={34}
              className="h-8 w-auto"
              priority
            />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[10px] font-extrabold tracking-[.1em] text-white/50">
              {meta.label}
            </span>
            {bell}
            <ProfileMenu
              displayName={session.displayName}
              roleLabel={session.roleLabel}
              portals={session.portals}
              current={portal}
              compact
            />
          </div>
        </div>
        {navMobile}
      </header>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 bg-teal-dark px-4 py-[22px] md:flex">
        <Link href={meta.href} className="mb-1.5 ml-2 self-start">
          <Image
            src="/brand/logo-on-dark.svg"
            alt="Pata Amiga"
            width={113}
            height={40}
            className="h-10 w-auto"
            priority
          />
        </Link>
        <span className="mb-2.5 ml-2 text-[10.5px] font-extrabold tracking-[.1em] text-white/50">
          {meta.label}
        </span>
        {/* El menú scrollea solo (min-h-0): con ventanas bajas se encimaba con
            el pie y quedaba inusable (hallazgo del equipo, 5-ago). */}
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
        <div className="mt-2">
          <LogoutButton variant="admin" />
        </div>
        <ProfileMenu
          displayName={session.displayName}
          roleLabel={session.roleLabel}
          portals={session.portals}
          current={portal}
        />
      </aside>

      {/* min-w-0: sin esto las tablas anchas empujan la retícula y el menú
          lateral se encima con el contenido al achicar la ventana. */}
      <main className="relative min-w-0">
        {/* En escritorio (sin barra superior) la campanita flota arriba a la
            derecha del contenido — donde la pidió el equipo. */}
        {bell && (
          <div className="absolute right-5 top-4 z-40 hidden rounded-full bg-teal-dark p-1 shadow-[0_2px_10px_rgba(30,83,80,.25)] md:block">
            {bell}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
