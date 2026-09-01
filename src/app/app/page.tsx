import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PetCard, type PetRow } from "@/components/app/PetCard";
import { WelcomeOnce } from "@/components/app/WelcomeOnce";
import { CompleteProfileNudge } from "@/components/app/CompleteProfileNudge";
import { datosFaltantesDelPerfil } from "@/lib/perfil-faltantes";
import { markWelcomeShown } from "./actions";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { MAX_ACTIVE_PETS } from "@/lib/constants";
import { formatDateEs, renewalDate, waitingProgress } from "@/lib/dates";
import { situacionDeCobro, etiquetaDeCobro } from "@/lib/membresia";

export default async function AppHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion");

  const [
    { data: profile },
    { data: sub },
    { data: pets },
    { data: notifications },
    { data: docs },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "first_name, last_name, email, membership_status, member_since, profile_completed, welcome_shown, curp, birth_date, nationality, postal_code, phone",
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("subscriptions")
      .select("plan, amount, current_period_end, created_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("pets")
      .select(
        "id, name, species, breed, sex, age_years, age_months, photo_url, approval_status, waiting_period_end_date, waiting_period_start_date, waiting_period_bypassed, created_at, is_senior, vet_certificate_url, info_requested",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("notifications")
      .select("id, title, message, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    // El pasaporte: para un extranjero SUSTITUYE a la CURP, asi que sin esto
    // el aviso le pediria una CURP que no puede tener.
    supabase.from("documents").select("document_type").eq("user_id", user.id),
  ]);

  const active = profile?.membership_status === "active";
  // NO se cae al correo. Desde que el registro se acorto (16-ago) el nombre se
  // captura al completar el perfil, ya pagado, asi que entre el pago y ese
  // momento `first_name` viene vacio: el saludo decia "!Hola, cipatli.martinez!"
  // —el correo de la persona— y asi lo reporto el equipo. Sin nombre se saluda
  // sin nombre, que es lo que hace el JSX de abajo.
  const name = profile?.first_name || "";
  const petList = (pets ?? []) as (PetRow & {
    created_at: string;
    sex: string | null;
  })[];

  // Peludos a los que les falta algo (equipo, 13-ago): el alta pide solo tipo,
  // nombre y edad, así que raza, sexo y foto se capturan después — y era fácil
  // dejarlo a medias, sobre todo desde que subir la foto ya no encadena al
  // siguiente peludo. Sin este aviso nadie se enteraba de lo que faltaba.
  const faltantesPorPeludo = petList
    .map((pet) => ({
      pet,
      falta: [
        !pet.photo_url && "su foto",
        !pet.breed && "su raza",
        !pet.sex && "su sexo",
      ].filter((x): x is string => Boolean(x)),
    }))
    .filter((p) => p.falta.length > 0);
  // Un miembro heredado de Memberstack no tiene plan ni período registrados:
  // antes se le mostraba "Plan mensual" inventado y una fecha de renovación ya
  // pasada (auditoría 11-ago). Ahora sale "Membresía activa" y sin fecha.
  const situacion = situacionDeCobro(profile?.membership_status, sub);
  const renews =
    situacion.tipo === "stripe"
      ? renewalDate(
          sub?.current_period_end ?? null,
          profile?.member_since ?? null,
          sub?.plan ?? null,
        )
      : null;
  const planLabel = etiquetaDeCobro(situacion);

  const availablePet = petList.find(
    (p) =>
      p.approval_status === "approved" &&
      waitingProgress(
        p.created_at,
        p.waiting_period_end_date,
        p.waiting_period_bypassed,
        p.waiting_period_start_date,
      ).done,
  );

  // Activity feed derived from real records — cronológico, de lo más
  // reciente a lo más antiguo (nota del cliente 16-jul)
  const activityRaw: {
    icon: string;
    tone: string;
    text: string;
    at: Date;
  }[] = [];
  for (const pet of petList) {
    activityRaw.push({
      icon: "🐾",
      tone: "bg-info-bg",
      // La espera ya NO comienza al registrar: arranca cuando el comité
      // aprueba el perfil (PM, 11-ago).
      text: `Registraste a ${pet.name} — estamos confirmando sus datos`,
      at: new Date(pet.created_at),
    });
  }
  if (profile?.member_since && sub) {
    activityRaw.push({
      icon: "💳",
      tone: "bg-error-bg",
      text: `Pago ${sub.plan === "annual" ? "anual" : "mensual"} confirmado — $${Number(sub.amount).toLocaleString("es-MX")} MXN`,
      at: new Date(profile.member_since),
    });
  }
  const activity = activityRaw
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map(({ at, ...item }) => ({ ...item, when: formatDateEs(at) }));

  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:gap-[22px] md:px-[34px] md:py-[30px]">
      {/* Bienvenida (una sola vez tras activar la membresía — bandera en BD) */}
      {profile?.membership_status === "active" && !profile.welcome_shown && (
        <WelcomeOnce
          onDismissAction={markWelcomeShown}
          storageKey={`pa_welcome_member_${user.id}`}
          emoji="🐾"
          title="¡Bienvenido a la manada!"
          message={
            profile.profile_completed
              ? "Tu membresía está activa: orientación veterinaria 24/7, reintegros y centros aliados te esperan."
              : "Tu membresía está activa y la orientación veterinaria 24/7 ya está disponible. Completa tu perfil para habilitar los reintegros."
          }
          cta={profile.profile_completed ? "Explorar mi cuenta" : "¡Entendido!"}
        />
      )}
      {/* Perfil incompleto (migrados incluidos): guía al primer login
          (Pablo, 5-ago). No se encima con la bienvenida de membresía nueva. */}
      {profile &&
        !profile.profile_completed &&
        !(profile.membership_status === "active" && !profile.welcome_shown) && (
          <CompleteProfileNudge
            userId={user.id}
            /* La lista sale de `datosFaltantesDelPerfil`, la MISMA que usan el
               panel y el correo recordatorio. Antes se armaba aqui a mano y ya
               no coincidia: omitia el nombre, exigia la calle —que desde el
               1-sep ya ni se pregunta, asi que el aviso habria pedido para
               siempre un domicilio imposible de completar— y contaba el
               telefono, que no bloquea el 100%. Por eso el telefono se
               menciona aparte, como en el panel. */
            missing={[
              ...datosFaltantesDelPerfil(profile, {
                tienePasaporte: (docs ?? []).some(
                  (d) => d.document_type === "passport",
                ),
              }),
              !profile.phone && "teléfono (no bloquea el 100%)",
            ].filter((x): x is string => Boolean(x))}
          />
        )}
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[26px] text-ink-title md:text-[32px]">
            ¡Hola{name ? `, ${name}` : ""}!
          </h1>
          <p className="text-[12.5px] text-ink-secondary md:text-sm">
            {active
              ? `Tu manada ya es parte del club.${renews ? ` Membresía activa hasta el ${formatDateEs(renews)}.` : ""}`
              : "Tu membresía aún no está activa."}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* En móvil la campana vive en el top bar del layout */}
          <div className="hidden md:block">
            <NotificationsBell initial={notifications ?? []} />
          </div>
          <Link
            href="/app/vet"
            className="hidden h-[46px] items-center gap-2 rounded-full bg-teal px-5 text-sm font-bold text-white transition-colors hover:bg-teal-deep md:flex"
          >
            💬 Orientación veterinaria 24/7
          </Link>
        </div>
      </div>

      {!active && (
        <div className="flex items-center justify-between rounded-[16px] bg-warning-bg px-5 py-4">
          <span className="text-sm font-semibold text-warning-text">
            Completa tu pago para activar la protección de tu manada.
          </span>
          <Link
            href="/registro/plan"
            className="grid h-10 flex-none place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white"
          >
            Elegir plan
          </Link>
        </div>
      )}

      {/* Datos pendientes de algún peludo — el comité no puede aprobar su
          perfil sin ellos, y sin aprobación no arranca su tiempo de espera. */}
      {faltantesPorPeludo.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-[16px] bg-warning-bg px-5 py-4">
          <span className="text-sm font-bold text-warning-text">
            🐾 Nos faltan datos de{" "}
            {faltantesPorPeludo.length === 1
              ? faltantesPorPeludo[0].pet.name
              : `${faltantesPorPeludo.length} de tus peludos`}
          </span>
          <span className="text-[12.5px] leading-relaxed text-warning-text/90">
            El comité necesita el perfil completo para aprobarlo, y su tiempo de
            espera empieza cuando lo aprueban.
          </span>
          <div className="flex flex-wrap gap-2">
            {faltantesPorPeludo.map(({ pet, falta }) => (
              <Link
                key={pet.id}
                href={`/app/peludos/${pet.id}`}
                className="rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-warning-text transition-colors hover:bg-white/70"
              >
                {pet.name}: falta {falta.join(", ").replace(/, ([^,]*)$/, " y $1")} →
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Membership card (mobile, 3b) */}
      <div className="relative flex items-center justify-between overflow-hidden rounded-[18px] bg-teal px-[18px] py-4 md:hidden">
        <div className="blob absolute -bottom-[60px] -right-10 size-[150px] bg-white/[.14]" />
        <div className="relative flex flex-col gap-0.5">
          <span className="text-[11px] font-bold tracking-[.06em] text-white/85">
            MEMBRESÍA {active ? "ACTIVA" : "PENDIENTE"}
          </span>
          <span className="font-display text-xl text-white">{planLabel}</span>
          {renews && (
            <span className="text-[11.5px] text-white/85">
              Renueva el {formatDateEs(renews)}
            </span>
          )}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-color.svg"
          alt=""
          className="relative w-[74px]"
        />
      </div>
      <Link
        href="/app/vet"
        className="flex h-[52px] items-center justify-center gap-2 rounded-full bg-teal-dark text-[14.5px] font-bold text-white md:hidden"
      >
        💬 Orientación veterinaria 24/7
      </Link>

      {/* KPI cards (desktop, 3a) */}
      <div className="hidden grid-cols-3 gap-4 md:grid">
        <div className="relative flex flex-col gap-1.5 overflow-hidden rounded-[18px] bg-teal p-5">
          <div className="blob absolute -bottom-[50px] -right-10 size-[150px] bg-white/[.14]" />
          <span className="text-xs font-bold tracking-[.06em] text-white/85">
            MEMBRESÍA
          </span>
          <span className="font-display text-[26px] text-white">
            {active ? "Activa" : "Pendiente"}
          </span>
          {renews && (
            <span className="text-[12.5px] text-white/85">
              {planLabel} · renueva {formatDateEs(renews)}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 rounded-[18px] bg-white p-5 shadow-[var(--shadow-card)]">
          <span className="text-xs font-bold tracking-[.06em] text-ink-tertiary">
            MIS PELUDOS
          </span>
          <span className="font-display text-[26px] text-ink-title">
            {petList.length} de {MAX_ACTIVE_PETS}
          </span>
          {petList.length < MAX_ACTIVE_PETS && (
            <Link
              href="/app/peludos"
              className="text-[12.5px] font-semibold text-teal-deep"
            >
              + Registrar otro peludo
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-1.5 rounded-[18px] bg-white p-5 shadow-[var(--shadow-card)]">
          <span className="text-xs font-bold tracking-[.06em] text-ink-tertiary">
            REINTEGROS
          </span>
          <span className="font-display text-[26px] text-ink-title">
            {availablePet ? `Disponible para ${availablePet.name}` : "En espera"}
          </span>
          {availablePet ? (
            <Link
              href="/app/reintegros"
              className="text-[12.5px] font-semibold text-teal-deep"
            >
              Iniciar solicitud →
            </Link>
          ) : (
            <span className="text-[12.5px] text-ink-tertiary">
              Al cumplirse los tiempos de espera
            </span>
          )}
        </div>
      </div>

      {/* Pets */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[19px] text-ink-title md:text-[22px]">
            Mis peludos
          </h2>
          <Link
            href="/app/peludos"
            className="text-[12.5px] font-bold text-teal-deep md:text-[13px]"
          >
            {petList.length < MAX_ACTIVE_PETS ? "+ Agregar" : "Ver todos →"}
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-4">
          {petList.map((pet) => (
            <PetCard key={pet.id} pet={pet} />
          ))}
          {petList.length === 0 && (
            <div className="rounded-[20px] bg-white p-6 text-sm text-ink-secondary shadow-[var(--shadow-card)]">
              Aún no registras a ningún peludo.{" "}
              <Link href="/app/peludos/nueva" className="font-semibold text-teal-deep">
                Preséntanos al primero
              </Link>
              .
            </div>
          )}
        </div>
      </div>

      {/* Profile completion nudge */}
      {profile && !profile.profile_completed && (
        <Link
          href="/app/perfil"
          className="flex items-center gap-3 rounded-[16px] bg-white px-4 py-3.5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-md"
        >
          <div className="grid size-10 flex-none place-items-center rounded-[12px] bg-warning-bg text-[17px]">
            🪪
          </div>
          <div className="flex flex-1 flex-col">
            <span className="text-[13.5px] font-bold text-ink-title">
              Completa tu perfil
            </span>
            <span className="text-[11.5px] text-ink-tertiary">
              CURP y domicilio — habilita tus reintegros
            </span>
          </div>
          <span className="font-extrabold text-teal-deep">→</span>
        </Link>
      )}

      {/* Activity + centers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[22px]">
          <h2 className="font-display text-xl text-ink-title">
            Actividad reciente
          </h2>
          <div className="flex flex-col">
            {activity.length === 0 && (
              <span className="py-2 text-sm text-ink-secondary">
                Aquí verás los avances de tu manada.
              </span>
            )}
            {activity.map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 py-2.5 ${i < activity.length - 1 ? "border-b border-[#F2EEE4]" : ""}`}
              >
                <div
                  className={`grid size-[34px] flex-none place-items-center rounded-full text-sm ${item.tone}`}
                >
                  {item.icon}
                </div>
                <span className="flex-1 text-[13.5px] text-ink-body">
                  {item.text}
                </span>
                <span className="text-xs text-ink-placeholder">{item.when}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-[20px] bg-teal-dark p-5 md:p-[22px]">
          <div
            className="absolute -right-[50px] -top-10 size-[170px] bg-white/[.08]"
            style={{ borderRadius: "58% 42% 45% 55% / 48% 57% 43% 52%" }}
          />
          {/* «PRÓXIMAMENTE» (pantalla 15 del tono 2.0): la red todavía se está
              armando, igual que en la portada. */}
          <h2 className="relative font-display text-xl text-white">
            Centros aliados cerca de ti{" "}
            <span className="align-middle text-[11px] font-extrabold tracking-[.06em] text-lime">
              PRÓXIMAMENTE
            </span>
          </h2>
          <p className="relative text-[13px] leading-relaxed text-white/80">
            Clínicas, pet shops, hospedajes y más con beneficios para la manada
            en todo México.
          </p>
          <Link
            href="/app/centros"
            className="relative mt-auto grid h-11 place-items-center rounded-full bg-white text-[13px] font-bold text-teal-dark"
          >
            Explorar el directorio
          </Link>
        </div>
      </div>
    </div>
  );
}
