import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicHeader } from "@/components/public/PublicHeader";
import { WelcomeOnce } from "@/components/app/WelcomeOnce";
import { CenterInfoCard } from "./CenterInfoCard";
import { PromotionsCard, type PromotionRow } from "./PromotionsCard";
import { ChangePasswordCard } from "@/components/app/ChangePasswordCard";
import { ServiciosCard, type LocationRow } from "./ServiciosCard";
import { RedesCard } from "./RedesCard";
import { BajaVoluntariaCard } from "./BajaVoluntariaCard";
import { ProfileMenu, type DashboardEntry } from "@/components/app/ProfileMenu";
import { AppealButton } from "@/components/app/AppealButton";
import { CENTER_APPEAL_MAX } from "@/lib/constants";

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

export default async function CentroDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/centro");

  const admin = createAdminClient();
  const CENTER_COLS =
    "id, name, contact_name, email, phone, website, logo_url, services, member_benefit, status, rejection_reason, social_links";
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

  // ¿El dueño del centro también es miembro? Decide el link al panel de
  // miembro o la invitación a unirse con un plan.
  const [{ data: memberProfile }, { data: activeSub }] = await Promise.all([
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
  ]);
  const isMember = Boolean(activeSub);
  const wasMember = Boolean(memberProfile?.member_since);

  // Otros paneles de esta cuenta (cambio estilo Instagram desde el avatar)
  const { data: ambassadorRows } = await admin
    .from("ambassadors")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .limit(1);
  const menuEntries: DashboardEntry[] = [
    ...(isMember
      ? [{ href: "/app", icon: "🐾", label: "Panel de miembro" }]
      : []),
    ...(ambassadorRows?.length
      ? [{ href: "/embajador", icon: "🤝", label: "Panel de embajador" }]
      : []),
  ];

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
          />
        </div>
      }
    />
  );

  if (center.status !== "approved") {
    // Centros rechazados pueden apelar (máx. 2, como miembros) — 16-jul
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
    const { data: pendingLocations } = enRevision
      ? await admin
          .from("wellness_center_locations")
          .select("id, address, colony, city, state, postal_code, phone")
          .eq("center_id", center.id)
          .order("created_at", { ascending: true })
      : { data: null };

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
                  locations={(pendingLocations ?? []) as LocationRow[]}
                />
                <RedesCard
                  initial={
                    (center.social_links ?? null) as Record<
                      string,
                      string
                    > | null
                  }
                />
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

  const [{ data: promotions }, { data: locations }, { data: pagos }] =
    await Promise.all([
      admin
        .from("center_promotions")
        .select("id, title, description, discount_label, valid_until, is_active")
        .eq("center_id", center.id)
        .order("created_at", { ascending: false }),
      admin
        .from("wellness_center_locations")
        .select("id, address, colony, city, state, postal_code, phone")
        .eq("center_id", center.id)
        .order("created_at", { ascending: true }),
      // Pagos directos de Pata Amiga a este centro (equipo, 5-ago)
      admin
        .from("center_payments")
        .select("id, concept, amount, notes, paid_at")
        .eq("center_id", center.id)
        .order("paid_at", { ascending: false })
        .limit(50),
    ]);

  const CONCEPTO: Record<string, string> = {
    vacunas: "Vacunas",
    emergencia_medica: "Emergencia médica",
    fallecimiento: "Fallecimiento",
    otro: "Otro",
  };
  const totalPagos = (pagos ?? []).reduce(
    (s, p) => s + Number(p.amount ?? 0),
    0,
  );

  return (
    <div className="min-h-dvh bg-cream">
      {header}
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-5 py-7 sm:px-8">
        {/* Dueño sin plan activo: invitación a unirse (o reactivar) como miembro */}
        {!isMember && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-teal-deep px-5 py-4 text-white shadow-[0_2px_10px_rgba(30,83,80,.12)]">
            <div className="flex min-w-0 flex-col">
              <span className="font-display text-[17px]">
                Tú también puedes cuidar a tu manada 🐾
              </span>
              <span className="text-[12.5px] opacity-90">
                {wasMember
                  ? "Tu membresía no está activa. Reactívala para volver a cuidar a tus peludos."
                  : "Tu cuenta de centro aliado aún no tiene membresía. Únete y registra hasta 3 mascotas."}
              </span>
            </div>
            <Link
              href={wasMember ? "/app/cuenta" : "/registro/peludo"}
              className="flex-none rounded-full bg-white px-4 py-2 text-[12.5px] font-bold text-teal-deep transition-opacity hover:opacity-90"
            >
              {wasMember ? "Reactivar mi membresía" : "Quiero mi membresía"}
            </Link>
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-4">
            <CenterInfoCard
              initialLogoUrl={center.logo_url}
              initialBenefit={center.member_benefit}
              initialPhone={center.phone}
              initialWebsite={center.website}
            />
            <PromotionsCard promotions={(promotions ?? []) as PromotionRow[]} />
          </div>

          <div className="flex flex-col gap-4">
            {/* Servicios y ubicaciones editables por el centro (equipo, 5-ago) */}
            <ServiciosCard
              initialServices={center.services ?? []}
              locations={(locations ?? []) as LocationRow[]}
            />
            <RedesCard
              initial={
                (center.social_links ?? null) as Record<string, string> | null
              }
            />

            {/* Pagos recibidos de Pata Amiga (equipo, 5-ago) */}
            <div className="flex flex-col gap-2.5 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
              <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
                PAGOS DE PATA AMIGA
              </span>
              <span className="text-[12px] text-ink-tertiary">
                Pagos directos por servicios a miembros (vacunas, emergencias,
                fallecimiento). Total recibido:{" "}
                <strong className="text-ink-title">
                  ${totalPagos.toLocaleString("es-MX")} MXN
                </strong>
              </span>
              {(pagos ?? []).length > 0 ? (
                (pagos ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 border-b border-[#F2EEE4] py-2 text-[12.5px] text-ink-body last:border-0"
                  >
                    <span className="flex-1">
                      {CONCEPTO[p.concept] ?? p.concept}
                      {p.notes ? (
                        <span className="block text-[11px] text-ink-tertiary">
                          {p.notes}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-bold text-ink-title">
                      ${Number(p.amount).toLocaleString("es-MX")} MXN
                    </span>
                    <span className="text-[11px] text-ink-tertiary">
                      {p.paid_at}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-[12.5px] text-ink-secondary">
                  Aún sin pagos registrados.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Ajustes de la cuenta del centro. El "Cerrar sesión" vive solo en el
            menú del encabezado — aquí estaba duplicado (hallazgo del equipo). */}
        <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
          <ChangePasswordCard />
          <BajaVoluntariaCard centerName={center.name} />
        </div>
      </div>

      {/* Bienvenida (una sola vez tras la aprobación) */}
      <WelcomeOnce
        storageKey={`pa_welcome_centro_${center.id}`}
        emoji="🎉"
        title={`¡${center.name} ya es parte de la red!`}
        message="Tu centro ya aparece en el directorio de centros aliados. Completa tu ficha, publica promociones y los miembros las verán al instante."
        cta="Completar mi ficha"
      />
    </div>
  );
}
