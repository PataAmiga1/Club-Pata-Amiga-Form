import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicHeader } from "@/components/public/PublicHeader";
import { ProfileMenu } from "@/components/app/ProfileMenu";
import { ChangePasswordCard } from "@/components/app/ChangePasswordCard";
import { AppealButton } from "@/components/app/AppealButton";
import { CENTER_APPEAL_MAX } from "@/lib/constants";
import { CenterInfoCard } from "./CenterInfoCard";
import { ServiciosCard, type LocationRow } from "./ServiciosCard";
import { RedesCard } from "./RedesCard";
import { CenterNav } from "./CenterNav";
import { getCenterContext, getCenterLocations } from "./shared";

export const metadata = { title: "Dashboard de centro aliado · Club Pata Amiga" };

function StatusScreen({
  name,
  status,
  reason,
}: {
  name: string;
  status: "pending" | "rejected" | "deactivated";
  reason: string | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-4 rounded-[20px] bg-white p-8 text-center shadow-[0_2px_12px_rgba(30,83,80,.06)]">
      <span className="text-[42px]" aria-hidden>
        {status === "pending" ? "⏳" : status === "deactivated" ? "🕊️" : "💌"}
      </span>
      <h1 className="font-display text-[24px] text-ink-title">
        {status === "pending"
          ? `La solicitud de ${name} está en revisión`
          : status === "deactivated"
            ? `${name} está dado de baja`
            : "Tu solicitud no fue aprobada"}
      </h1>
      <p className="text-sm leading-relaxed text-ink-secondary">
        {status === "pending"
          ? "El comité está revisando tu solicitud de centro aliado. Te avisaremos por correo en cuanto haya resolución."
          : status === "deactivated"
            ? "Tu centro ya no aparece en el directorio de centros aliados. Si quieres volver a la red, escríbenos o envía una nueva solicitud — con gusto te recibimos de vuelta. 💚"
            : (reason ??
              "El comité no pudo aprobar tu solicitud en esta ocasión. Puedes escribirnos si crees que hay un error.")}
      </p>
      <Link href="/" className="font-semibold text-teal-deep hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}

/** Shell del portal del centro: encabezado + menú (tabs / barra móvil). */
export default async function CentroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { center, isMember, wasMember, menuEntries } = await getCenterContext();

  const header = (
    <PublicHeader
      badge="CENTRO ALIADO"
      rightSlot={
        <div className="flex items-center gap-3">
          <span className="hidden text-[13.5px] font-bold text-ink-title sm:inline">
            {center.name}
          </span>
          <ProfileMenu
            initial={center.name.charAt(0).toUpperCase()}
            entries={menuEntries}
            settingsHref="/centro/cuenta"
          />
        </div>
      }
    />
  );

  if (center.status !== "approved") {
    const admin = createAdminClient();
    // Centros denegados pueden apelar (máx. 2, como miembros) — 16-jul
    const { data: centerAppeals } = await admin
      .from("appeals")
      .select("id, folio, status")
      .eq("center_id", center.id);
    const pendingAppeal = (centerAppeals ?? []).find(
      (a) => a.status === "pending",
    );
    // En revisión: el centro ya puede completar su perfil (logo, beneficio,
    // servicios, sucursales, redes, contraseña). Solo no aparece en el
    // directorio. Antes esta pantalla era un callejón sin salida (equipo, 11-ago).
    const enRevision = center.status === "pending";
    const pendingLocations = enRevision
      ? await getCenterLocations(center.id)
      : [];

    return (
      <div className="min-h-dvh bg-cream pb-12">
        {header}
        <div className="mx-auto flex w-full max-w-[980px] flex-col items-center gap-5 px-5 py-8 sm:px-8">
          <StatusScreen
            name={center.name}
            status={center.status as "pending" | "rejected" | "deactivated"}
            reason={center.rejection_reason}
          />
          {enRevision && (
            <>
              <p className="text-center text-[13.5px] text-ink-secondary">
                Mientras tanto puedes dejar listo el perfil de tu centro — así,
                en cuanto te aprobemos, apareces completo en el directorio.
              </p>
              <div className="grid w-full items-start gap-4 lg:grid-cols-2">
                <CenterInfoCard
                  initialLogoUrl={center.logo_url}
                  initialBenefit={center.member_benefit}
                  initialPhone={center.phone}
                  initialWebsite={center.website}
                />
                <ServiciosCard
                  initialServices={center.services ?? []}
                  locations={pendingLocations as LocationRow[]}
                />
                <RedesCard initial={center.social_links} />
                <ChangePasswordCard />
              </div>
              <div className="w-full rounded-[18px] border-[1.5px] border-dashed border-border-input bg-white/60 p-5">
                <span className="text-[13px] font-semibold text-ink-title">
                  Se activa cuando el comité apruebe tu centro
                </span>
                <ul className="mt-3 flex flex-col gap-2">
                  {[
                    { icon: "📍", label: "Aparecer en el directorio de centros" },
                    { icon: "🎁", label: "Publicar promociones para miembros" },
                    { icon: "💳", label: "Pagos de Pata Amiga por servicios" },
                  ].map((l) => (
                    <li
                      key={l.label}
                      className="flex items-center gap-2.5 text-[14px] text-ink-placeholder"
                    >
                      <span className="opacity-40" aria-hidden>
                        {l.icon}
                      </span>
                      {l.label}
                      <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-ink-placeholder">
                        Bloqueado
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          {center.status === "rejected" &&
            (pendingAppeal ? (
              <span className="rounded-full bg-info-bg px-3 py-1 text-[11px] font-extrabold tracking-[.04em] text-info-text">
                APELACIÓN {pendingAppeal.folio} EN REVISIÓN
              </span>
            ) : (centerAppeals ?? []).length < CENTER_APPEAL_MAX ? (
              <div className="w-full max-w-[520px]">
                <AppealButton
                  centerId={center.id}
                  subjectLabel={`la solicitud de ${center.name}`}
                />
              </div>
            ) : null)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream pb-24 sm:pb-0">
      {header}
      <CenterNav />
      {/* Dueño sin plan activo: invitación a unirse (o reactivar) como miembro */}
      {!isMember && (
        <div className="mx-auto w-full max-w-[980px] px-5 pt-5 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-teal-deep px-5 py-4 text-white shadow-[0_2px_10px_rgba(30,83,80,.12)]">
            <div className="flex min-w-0 flex-col">
              <span className="font-display text-[17px]">
                Tú también puedes cuidar a tu manada 🐾
              </span>
              <span className="text-[12.5px] opacity-90">
                {wasMember
                  ? "Tu membresía no está activa. Reactívala para volver a cuidar a tus peludos."
                  : "Tu cuenta de centro aliado aún no tiene membresía. Únete y registra hasta 3 peludos."}
              </span>
            </div>
            <Link
              href={wasMember ? "/app/cuenta" : "/registro/peludo"}
              className="flex-none rounded-full bg-white px-4 py-2 text-[12.5px] font-bold text-teal-deep transition-opacity hover:opacity-90"
            >
              {wasMember ? "Reactivar mi membresía" : "Quiero mi membresía"}
            </Link>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
