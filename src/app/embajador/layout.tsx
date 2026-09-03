import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicHeader } from "@/components/public/PublicHeader";
import { ProfileMenu, type DashboardEntry } from "@/components/app/ProfileMenu";
import { ChangePasswordCard } from "@/components/app/ChangePasswordCard";
import { LogoutButton } from "@/components/app/LogoutButton";
import { AmbassadorNav } from "./AmbassadorNav";
import { PaymentDataCard } from "./PaymentDataCard";
import { ExtrasCard } from "./ExtrasCard";
import { IneCard } from "./IneCard";
import { getAmbassadorContext } from "./shared";
import { SolicitudHiloPortal } from "@/components/app/SolicitudHiloPortal";
import { leerHiloDeSolicitud } from "@/lib/hilo-solicitud";
import { replySolicitudEmbajador } from "./actions";

/** Lo que se desbloquea al ser aprobado — se muestra en gris mientras tanto. */
function LockedPreview() {
  const locked = [
    { icon: "🎟️", label: "Tu código de embajador" },
    { icon: "📊", label: "Métricas de referidos y comisiones" },
    { icon: "🎨", label: "Materiales para compartir" },
  ];
  return (
    <div className="rounded-[18px] border-[1.5px] border-dashed border-border-input bg-white/60 p-5">
      <span className="text-[13px] font-semibold text-ink-title">
        Se activa cuando el comité apruebe tu solicitud
      </span>
      <ul className="mt-3 flex flex-col gap-2">
        {locked.map((l) => (
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
  );
}

function StatusScreen({
  name,
  status,
  reason,
}: {
  name: string;
  status: string;
  reason: string | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-4 rounded-[20px] bg-white p-8 text-center shadow-[0_2px_12px_rgba(30,83,80,.06)]">
      <span className="text-[42px]" aria-hidden>
        {status === "pending" ? "⏳" : "💌"}
      </span>
      <h1 className="font-display text-[24px] text-ink-title">
        {status === "pending"
          ? `Tu solicitud está en revisión, ${name}`
          : "Tu solicitud no fue aprobada"}
      </h1>
      <p className="text-sm leading-relaxed text-ink-secondary">
        {status === "pending"
          ? "El comité está revisando tu solicitud de embajador. Te avisaremos por correo en cuanto tengamos una respuesta."
          : (reason ??
            "El comité no pudo aprobar tu solicitud en esta ocasión. Puedes escribirnos si crees que hay un error.")}
      </p>
      <Link href="/" className="font-semibold text-teal-deep hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}

/** Shell del portal del embajador: header + menú (tabs / barra móvil). */
export default async function EmbajadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, ambassador, isMember, wasMember } =
    await getAmbassadorContext();

  // Otros paneles de esta cuenta (cambio estilo Instagram desde el avatar)
  const admin = createAdminClient();
  const { data: centerRows } = await admin
    .from("wellness_centers")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .limit(1);

  // Una sola lista para el menú del avatar Y para la barra (equipo, 2-sep):
  // si cada uno armara la suya, volverían a ofrecer cosas distintas, que es
  // justo lo que pidieron arreglar.
  const entries: DashboardEntry[] = [
    ...(isMember
      ? [{ href: "/app", icon: "🐾", label: "Panel de miembro", short: "Miembro" }]
      : []),
    ...(centerRows?.length
      ? [{ href: "/centro", icon: "🏪", label: "Mi centro aliado", short: "Mi centro" }]
      : []),
  ];

  const displayName = `${ambassador.first_name}${ambassador.last_name ? ` ${ambassador.last_name.charAt(0)}.` : ""}`;
  const header = (
    <PublicHeader
      badge="EMBAJADOR"
      rightSlot={
        <div className="flex items-center gap-3">
          <span className="hidden text-[13.5px] font-bold text-ink-title sm:inline">
            {displayName}
          </span>
          <ProfileMenu
            initial={ambassador.first_name.charAt(0).toUpperCase()}
            color="bg-orange"
            entries={entries}
            settingsHref="/embajador/cuenta"
          />
        </div>
      }
    />
  );

  // Solicitud sin resolver: NO se cierra la puerta. El embajador entra a su
  // portal, ve en qué va su solicitud y puede ir completando su perfil (datos
  // de pago, RFC, redes, contraseña). Lo que depende de la aprobación —código,
  // métricas, materiales— se muestra en gris y bloqueado (equipo, 11-ago).
  // EL HILO CON EL COMITÉ (Cipatli, 1-sep). Vive en el layout y no en una
  // pantalla suelta para que no se pueda perder: sale en cualquier pestaña del
  // portal y en cualquier estado de la solicitud, que es justo cuando más
  // falta hace —en revisión—. Se pinta solo si hay algo que leer o que
  // contestar; un hilo vacío sugeriría que le falta hacer algo cuando no.
  const { mensajes, adjuntos } = await leerHiloDeSolicitud(
    createAdminClient(),
    "embajador",
    ambassador.id,
  );
  const hilo =
    mensajes.length > 0 || ambassador.info_requested ? (
      <SolicitudHiloPortal
        mensajes={mensajes}
        adjuntos={adjuntos}
        infoRequested={ambassador.info_requested}
        onResponder={replySolicitudEmbajador}
        ayuda="Si te pidieron tu INE o un documento, mándalo aquí."
      />
    ) : null;

  if (ambassador.status !== "approved") {
    const enRevision = ambassador.status === "pending";
    return (
      <div className="min-h-dvh bg-cream pb-12">
        {header}
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-5 py-8 sm:px-8">
          <StatusScreen
            name={ambassador.first_name}
            status={ambassador.status}
            reason={ambassador.rejection_reason}
          />
          {hilo}
          {enRevision && (
            <>
              <p className="text-center text-[13.5px] text-ink-secondary">
                Mientras tanto puedes dejar listo tu perfil — así, en cuanto te
                aprobemos, empiezas a compartir de inmediato.
              </p>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <PaymentDataCard
                  initialBank={ambassador.bank_name}
                  initialClabe={ambassador.clabe}
                  initialHolder={ambassador.bank_holder}
                  initialRfc={ambassador.rfc}
                />
                <IneCard
                  tieneFrente={Boolean(ambassador.ine_front_url)}
                  tieneReverso={Boolean(ambassador.ine_back_url)}
                />
                <ExtrasCard initialLinks={ambassador.social_links} />
                <ChangePasswordCard />
                <LockedPreview />
              </div>
            </>
          )}
          <div className="flex justify-center">
            <LogoutButton variant="button" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream pb-24 sm:pb-0">
      {header}
      <AmbassadorNav extra={entries} />
      {/* Embajador sin plan activo: invitación a unirse (o reactivar) como miembro */}
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
                  : "Como embajador aún no tienes membresía. Únete y registra hasta 3 peludos."}
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
      {hilo && (
        <div className="mx-auto w-full max-w-[980px] px-5 pt-5 sm:px-8">
          {hilo}
        </div>
      )}
      {children}
    </div>
  );
}
