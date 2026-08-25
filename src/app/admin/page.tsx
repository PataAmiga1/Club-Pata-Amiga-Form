import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { REIMBURSEMENT_CATEGORY_LABELS, REIMBURSEMENT_SLA_HOURS } from "@/lib/constants";
import { formatMxn, hoursSince } from "@/lib/format";
import { haceDias } from "@/lib/dates";
import { inicioDelMes, ZONA_MX } from "@/lib/zona-horaria";
import { ReportButton } from "./ReportButton";
import { Bell } from "@/components/panel/Bell";
import { MiniBarChart } from "@/components/panel/MiniBarChart";
import { BloqueVentas } from "@/components/panel/tablero/BloqueVentas";

function urgencyChip(hours: number) {
  if (hours >= 48) return "bg-error-bg text-error-text";
  if (hours >= 24) return "bg-warning-bg text-warning-text";
  return "bg-info-bg text-info-text";
}

export default async function AdminHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("first_name, email")
    .eq("id", user!.id)
    .single();
  const adminName = me?.first_name || me?.email?.split("@")[0] || "";

  const admin = createAdminClient();
  // "Este mes" arranca a la medianoche de México, no a la del proceso: en Vercel
  // (UTC) el mes empezaba a las 6 de la tarde del último día del mes anterior y
  // metía esas horas en el conteo.
  const monthStart = inicioDelMes();
  const sixMonthsStart = new Date(monthStart);
  sixMonthsStart.setMonth(sixMonthsStart.getMonth() - 5);

  const [
    activeQ,
    subs,
    monthResolved,
    resolvedTimes,
    queue,
    petsPending,
    newMembersQ,
    ambassadorsQ,
    monthReferrals,
    payableReferrals,
    centersQ,
    newsletterQ,
    monthVetQ,
    pendingAmbassadors,
    pendingCenters,
    recentErrors,
    memberDates,
    reimb6m,
    evReimb,
    evAppeals,
    evAmb,
    evCenters,
    evLeads,
    referrals6m,
  ] = await Promise.all([
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("membership_status", "active"),
      admin.from("subscriptions").select("plan, amount").eq("status", "active"),
      admin
        .from("reimbursements")
        .select("status, amount_approved")
        .gte("resolved_at", monthStart.toISOString()),
      admin
        .from("reimbursements")
        .select("created_at, resolved_at")
        .not("resolved_at", "is", null)
        .order("resolved_at", { ascending: false })
        .limit(50),
      admin
        .from("reimbursements")
        .select(
          "id, folio, category, amount_requested, created_at, pets(name, species), profiles!user_id(first_name, last_name, email)",
        )
        .in("status", ["pending", "in_review"])
        .order("created_at", { ascending: true })
        .limit(5),
      admin
        .from("pets")
        .select(
          "id, name, breed, species, is_senior, vet_certificate_url, profiles!user_id(first_name, last_name, email)",
        )
        .eq("approval_status", "pending")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(4),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("membership_status", "active")
        .gte("member_since", monthStart.toISOString()),
      admin
        .from("ambassadors")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      admin
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString()),
      admin
        .from("referrals")
        .select("commission_amount")
        .eq("status", "pending")
        .lt("created_at", monthStart.toISOString()),
      admin
        .from("wellness_centers")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      admin
        .from("newsletter_subscribers")
        .select("id", { count: "exact", head: true }),
      admin
        .from("vet_conversations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString()),
      admin
        .from("ambassadors")
        .select("id, first_name, last_name, city", { count: "exact" })
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(3),
      admin
        .from("wellness_centers")
        .select("id, name, services", { count: "exact" })
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(3),
      admin
        .from("error_logs")
        .select("id, context, message, created_at", { count: "exact" })
        .gte("created_at", haceDias(7))
        .order("created_at", { ascending: false })
        .limit(3),
      // Series de 6 meses para las gráficas
      admin
        .from("profiles")
        .select("member_since")
        .not("member_since", "is", null)
        .gte("member_since", sixMonthsStart.toISOString()),
      admin
        .from("reimbursements")
        .select("amount_approved, resolved_at")
        .in("status", ["approved", "partial", "paid"])
        .gte("resolved_at", sixMonthsStart.toISOString()),
      // Actividad reciente para la campana
      admin
        .from("reimbursements")
        .select("id, folio, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
      admin
        .from("appeals")
        .select("id, folio, created_at")
        .order("created_at", { ascending: false })
        .limit(4),
      admin
        .from("ambassadors")
        .select("id, first_name, created_at")
        .order("created_at", { ascending: false })
        .limit(4),
      admin
        .from("wellness_centers")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(4),
      admin
        .from("campaign_leads")
        .select("id, first_name, campaign, created_at")
        .order("created_at", { ascending: false })
        .limit(4),
      // Referidos de embajadores, 6 meses (gráfica pedida por el equipo, 5-ago)
      admin
        .from("referrals")
        .select("created_at")
        .gte("created_at", sixMonthsStart.toISOString()),
    ]);

  const mrr = (subs.data ?? []).reduce((acc, s) => {
    const amount = Number(s.amount ?? 0);
    return acc + (s.plan === "annual" ? amount / 12 : amount);
  }, 0);

  const monthApproved = (monthResolved.data ?? []).filter((r) =>
    ["approved", "partial", "paid"].includes(r.status),
  );
  const monthRejected = (monthResolved.data ?? []).filter(
    (r) => r.status === "rejected",
  );
  const monthTotal = monthApproved.reduce(
    (acc, r) => acc + Number(r.amount_approved ?? 0),
    0,
  );

  const avgHours = resolvedTimes.data?.length
    ? Math.round(
        resolvedTimes.data.reduce(
          (acc, r) =>
            acc +
            (new Date(r.resolved_at!).getTime() -
              new Date(r.created_at).getTime()) /
              3_600_000,
          0,
        ) / resolvedTimes.data.length,
      )
    : null;

  const memberName = (p: unknown) => {
    const prof = Array.isArray(p) ? p[0] : p;
    const { first_name, last_name, email } = (prof ?? {}) as {
      first_name?: string;
      last_name?: string;
      email?: string;
    };
    if (first_name)
      return `${first_name} ${last_name ? `${last_name.charAt(0)}.` : ""}`.trim();
    return email?.split("@")[0] ?? "Miembro";
  };
  const petOf = (p: unknown) =>
    (Array.isArray(p) ? p[0] : p) as { name: string; species: string } | null;

  const payableCommissions = (payableReferrals.data ?? []).reduce(
    (acc, r) => acc + Number(r.commission_amount ?? 0),
    0,
  );

  const monthLabel = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: ZONA_MX,
  }).format(new Date());

  /** Métricas de crecimiento y comunidad (segunda fila). */
  const growth = [
    {
      href: "/admin/miembros",
      label: "ALTAS DEL MES",
      value: (newMembersQ.count ?? 0).toLocaleString("es-MX"),
      note: "nuevos miembros activos",
    },
    {
      href: "/admin/vet",
      label: "ORIENTACIONES VET",
      value: (monthVetQ.count ?? 0).toLocaleString("es-MX"),
      note: "conversaciones este mes",
    },
    {
      href: "/admin/embajadores",
      label: "EMBAJADORES",
      value: (ambassadorsQ.count ?? 0).toLocaleString("es-MX"),
      note: `${monthReferrals.count ?? 0} referidos este mes`,
    },
    {
      href: "/admin/finanzas",
      label: "COMISIONES POR PAGAR",
      value: formatMxn(payableCommissions),
      note: "corte pendiente (día 5)",
    },
    {
      href: "/admin/centros",
      label: "CENTROS ALIADOS",
      value: (centersQ.count ?? 0).toLocaleString("es-MX"),
      note: "activos en el directorio",
    },
    {
      href: "/admin/comunicados",
      label: "NEWSLETTER",
      value: (newsletterQ.count ?? 0).toLocaleString("es-MX"),
      note: "suscriptores",
    },
  ];

  /** Reporte compartible (WhatsApp/correo) con las métricas del día. */
  const report = [
    `🐾 *Club Pata Amiga — Reporte* · ${new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA_MX }).format(new Date())}`,
    "",
    `*Miembros activos:* ${(activeQ.count ?? 0).toLocaleString("es-MX")} (${(newMembersQ.count ?? 0).toLocaleString("es-MX")} altas en ${monthLabel})`,
    `*MRR:* ${formatMxn(Math.round(mrr))} MXN`,
    `*Reintegros de ${monthLabel}:* ${formatMxn(monthTotal)} MXN (${monthApproved.length} aprobados · ${monthRejected.length} denegados)`,
    `*Tiempo de respuesta:* ${avgHours != null ? `${avgHours} hrs` : "sin datos"} (compromiso: ${REIMBURSEMENT_SLA_HOURS} hrs)`,
    `*Orientación veterinaria 24/7:* ${(monthVetQ.count ?? 0).toLocaleString("es-MX")} conversaciones este mes`,
    `*Embajadores:* ${(ambassadorsQ.count ?? 0).toLocaleString("es-MX")} activos · ${(monthReferrals.count ?? 0).toLocaleString("es-MX")} referidos este mes · ${formatMxn(payableCommissions)} MXN por pagar en el corte`,
    `*Centros aliados:* ${(centersQ.count ?? 0).toLocaleString("es-MX")} en el directorio`,
    `*Newsletter:* ${(newsletterQ.count ?? 0).toLocaleString("es-MX")} suscriptores`,
  ].join("\n");

  // ----- Series mensuales (6 meses) para las gráficas -----
  const monthKeys: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() - i);
    monthKeys.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: ZONA_MX }).format(d),
    });
  }
  const monthKeyOf = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const membersSeries = monthKeys.map((m) => ({
    label: m.label,
    value: (memberDates.data ?? []).filter(
      (r) => monthKeyOf(r.member_since as string) === m.key,
    ).length,
  }));
  const reimbSeries = monthKeys.map((m) => ({
    label: m.label,
    value: (reimb6m.data ?? [])
      .filter((r) => r.resolved_at && monthKeyOf(r.resolved_at) === m.key)
      .reduce((acc, r) => acc + Number(r.amount_approved ?? 0), 0),
  }));
  const referralsSeries = monthKeys.map((m) => ({
    label: m.label,
    value: (referrals6m.data ?? []).filter(
      (r) => monthKeyOf(r.created_at) === m.key,
    ).length,
  }));

  // ----- Actividad reciente (campana) -----
  const events = [
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
      href: "/admin/embajadores",
      created_at: a.created_at,
    })),
    ...(evCenters.data ?? []).map((c) => ({
      id: `c-${c.id}`,
      icon: "📍",
      text: `${c.name} solicitó ser centro aliado`,
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
    ...(recentErrors.data ?? []).map((e) => ({
      id: `x-${e.id}`,
      icon: "⚠️",
      text: `Error en ${e.context}`,
      href: "/admin",
      created_at: e.created_at,
    })),
  ]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 14);

  const kpis = [
    {
      href: "/admin/miembros",
      label: "MIEMBROS ACTIVOS",
      value: (activeQ.count ?? 0).toLocaleString("es-MX"),
      note: "miembros con membresía vigente",
      noteCls: "text-ink-tertiary",
    },
    {
      href: "/admin/finanzas",
      label: "MRR",
      value: `${formatMxn(Math.round(mrr))}`,
      note: "ingreso mensual recurrente",
      noteCls: "text-success-text font-semibold",
    },
    {
      href: "/admin/reintegros",
      label: "REINTEGROS DEL MES",
      value: formatMxn(monthTotal),
      note: `${monthApproved.length} aprobados · ${monthRejected.length} denegados`,
      noteCls: "text-ink-tertiary",
    },
    {
      href: "/admin/reintegros",
      label: "TIEMPO DE RESPUESTA",
      value: avgHours != null ? `${avgHours} hrs` : "—",
      note:
        avgHours != null && avgHours <= REIMBURSEMENT_SLA_HOURS
          ? `Dentro del compromiso de ${REIMBURSEMENT_SLA_HOURS}`
          : `Compromiso: ${REIMBURSEMENT_SLA_HOURS} hrs`,
      noteCls: "text-success-text font-semibold",
    },
  ];

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] text-ink-title">
          Buenos días{adminName ? `, ${adminName}` : ""}
        </h1>
        <div className="flex items-center gap-3">
          <Bell events={events} />
          <form action="/admin/miembros" className="hidden lg:block">
            <input
              name="q"
              placeholder="🔍 Buscar miembro, peludo o folio…"
              className="h-[42px] w-[260px] rounded-full bg-white px-4 text-[13px] text-ink-title shadow-[0_1px_6px_rgba(30,83,80,.06)] outline-none placeholder:text-ink-placeholder focus:ring-2 focus:ring-teal"
            />
          </form>
          <ReportButton report={report} />
        </div>
      </div>

      {/* KPIs — cada tarjeta lleva a la sección de donde salen los datos */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="flex flex-col gap-1 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)] transition-shadow hover:shadow-[0_6px_18px_rgba(30,83,80,.12)]"
          >
            <span className="text-[11px] font-bold tracking-[.06em] text-ink-tertiary">
              {k.label}
            </span>
            <span className="font-display text-[28px] text-ink-title">
              {k.value}
            </span>
            <span className={`text-[11.5px] ${k.noteCls}`}>{k.note}</span>
          </Link>
        ))}
      </div>

      {/* Gráficas: crecimiento y salidas (6 meses) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MiniBarChart
          title="Nuevos miembros por mes"
          data={membersSeries}
          color="#1CBCAD"
        />
        <MiniBarChart
          title="Reintegros aprobados (MXN)"
          data={reimbSeries}
          color="#F7941D"
          format={(v) => formatMxn(v)}
        />
        <MiniBarChart
          title="Referidos de embajadores por mes"
          data={referralsSeries}
          color="#1E5350"
        />
      </div>

      {/* Ventas: las mismas métricas del portal, con el mismo código. Si un
          número cambia allá, cambia aquí. */}
      <BloqueVentas />

      {/* Crecimiento y comunidad — cada tarjeta lleva a su sección */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        {growth.map((g) => (
          <Link
            key={g.label}
            href={g.href}
            className="flex flex-col gap-0.5 rounded-[16px] bg-white px-4 py-3.5 shadow-[0_2px_10px_rgba(30,83,80,.05)] transition-shadow hover:shadow-[0_6px_18px_rgba(30,83,80,.12)]"
          >
            <span className="text-[10px] font-bold tracking-[.06em] text-ink-tertiary">
              {g.label}
            </span>
            <span className="font-display text-[21px] text-ink-title">
              {g.value}
            </span>
            <span className="text-[11px] text-ink-tertiary">{g.note}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Reimbursement queue */}
        <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink-title">
              Cola de reintegros
            </h2>
            <Link
              href="/admin/reintegros"
              className="text-xs font-bold text-teal-deep"
            >
              Ver todos →
            </Link>
          </div>
          <div className="flex flex-col overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-[80px_1fr_110px_90px_90px] gap-2 border-b-[1.5px] border-[#F2EEE4] py-2 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder">
              <span>FOLIO</span>
              <span>MIEMBRO / MASCOTA</span>
              <span>TIPO</span>
              <span>MONTO</span>
              <span>ESPERA</span>
            </div>
            {(queue.data ?? []).map((r) => {
              const pet = petOf(r.pets);
              const hrs = hoursSince(r.created_at);
              return (
                <Link
                  key={r.id}
                  href={`/admin/reintegros/${r.id}`}
                  className="grid min-w-[560px] grid-cols-[80px_1fr_110px_90px_90px] items-center gap-2 border-b border-[#F2EEE4] py-[11px] text-[12.5px] text-ink-body transition-colors hover:bg-cream"
                >
                  <span className="font-bold text-teal-deep">{r.folio}</span>
                  <span>
                    {memberName(r.profiles)} · {pet?.name}{" "}
                    {pet?.species === "dog" ? "🐕" : "🐈"}
                  </span>
                  <span>
                    {REIMBURSEMENT_CATEGORY_LABELS[
                      r.category as keyof typeof REIMBURSEMENT_CATEGORY_LABELS
                    ] ?? r.category}
                  </span>
                  <span className="font-bold">
                    {formatMxn(Number(r.amount_requested))}
                  </span>
                  <span
                    className={`justify-self-start rounded-full px-2 py-[3px] text-[10.5px] font-extrabold ${urgencyChip(hrs)}`}
                  >
                    {hrs} hrs
                  </span>
                </Link>
              );
            })}
            {(queue.data ?? []).length === 0 && (
              <span className="py-3 text-sm text-ink-secondary">
                Sin solicitudes pendientes. 🎉
              </span>
            )}
          </div>
        </div>

        {/* Pets to approve */}
        <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <h2 className="font-display text-lg text-ink-title">
            Peludos por aprobar
          </h2>
          <div className="flex flex-col gap-2.5">
            {(petsPending.data ?? []).map((p) => (
              <Link
                key={p.id}
                href="/admin/mascotas"
                className="flex items-center gap-2.5"
              >
                <div
                  className={`grid size-[38px] flex-none place-items-center rounded-[12px] text-base ${p.is_senior && !p.vet_certificate_url ? "bg-warning-bg" : "bg-info-bg"}`}
                >
                  {p.species === "dog" ? "🐕" : "🐈"}
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="text-[13px] font-bold text-ink-title">
                    {p.name}
                    {p.breed ? ` · ${p.breed}` : ""}
                  </span>
                  <span
                    className={`text-[11px] ${p.is_senior && !p.vet_certificate_url ? "text-warning-text" : "text-ink-tertiary"}`}
                  >
                    {memberName(p.profiles)}
                    {p.is_senior && !p.vet_certificate_url
                      ? " · Falta certificado veterinario"
                      : ""}
                  </span>
                </div>
                <span className="text-[13px] font-extrabold text-teal-deep">
                  Revisar
                </span>
              </Link>
            ))}
            {(petsPending.data ?? []).length === 0 && (
              <span className="py-1 text-sm text-ink-secondary">
                Sin peludos pendientes.
              </span>
            )}
          </div>
          <Link
            href="/admin/mascotas"
            className="mt-auto grid h-11 place-items-center rounded-full border-[1.5px] border-teal text-[13px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            Ver cola completa
          </Link>
        </div>
      </div>

      {/* Colas de comunidad: embajadores y centros por aprobar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink-title">
              Embajadores por aprobar
              {(pendingAmbassadors.count ?? 0) > 0 && (
                <span className="ml-2 rounded-full bg-warning-bg px-2.5 py-0.5 align-middle text-[11px] font-extrabold text-warning-text">
                  {pendingAmbassadors.count}
                </span>
              )}
            </h2>
            <Link
              href="/admin/embajadores"
              className="text-xs font-bold text-teal-deep"
            >
              Ver todos →
            </Link>
          </div>
          {(pendingAmbassadors.data ?? []).map((a) => (
            <Link
              key={a.id}
              href="/admin/embajadores"
              className="flex items-center gap-2.5"
            >
              <div className="grid size-[34px] flex-none place-items-center rounded-full bg-warning-bg text-[13px] font-extrabold text-warning-text">
                {a.first_name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 text-[13px] text-ink-body">
                <strong className="text-ink-title">
                  {a.first_name} {a.last_name ?? ""}
                </strong>
                {a.city ? ` · ${a.city}` : ""}
              </span>
              <span className="text-[13px] font-extrabold text-teal-deep">
                Revisar
              </span>
            </Link>
          ))}
          {(pendingAmbassadors.data ?? []).length === 0 && (
            <span className="text-sm text-ink-secondary">
              Sin solicitudes pendientes. 🎉
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink-title">
              Centros por aprobar
              {(pendingCenters.count ?? 0) > 0 && (
                <span className="ml-2 rounded-full bg-warning-bg px-2.5 py-0.5 align-middle text-[11px] font-extrabold text-warning-text">
                  {pendingCenters.count}
                </span>
              )}
            </h2>
            <Link
              href="/admin/centros"
              className="text-xs font-bold text-teal-deep"
            >
              Ver todos →
            </Link>
          </div>
          {(pendingCenters.data ?? []).map((c) => (
            <Link
              key={c.id}
              href="/admin/centros"
              className="flex items-center gap-2.5"
            >
              <div className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-info-bg text-base">
                📍
              </div>
              <span className="flex-1 text-[13px] text-ink-body">
                <strong className="text-ink-title">{c.name}</strong>
              </span>
              <span className="text-[13px] font-extrabold text-teal-deep">
                Revisar
              </span>
            </Link>
          ))}
          {(pendingCenters.data ?? []).length === 0 && (
            <span className="text-sm text-ink-secondary">
              Sin solicitudes pendientes. 🎉
            </span>
          )}
        </div>
      </div>

      {/* Salud del sistema — errores de los últimos 7 días */}
      <div
        className={`flex flex-col gap-2 rounded-[18px] p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)] ${
          (recentErrors.count ?? 0) > 0 ? "bg-error-bg" : "bg-white"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-ink-title">
            Salud del sistema
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${
              (recentErrors.count ?? 0) > 0
                ? "bg-error-text text-white"
                : "bg-success-bg text-success-text"
            }`}
          >
            {(recentErrors.count ?? 0) > 0
              ? `${recentErrors.count} ERRORES (7 DÍAS)`
              : "SIN ERRORES (7 DÍAS)"}
          </span>
        </div>
        {(recentErrors.data ?? []).map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink-body"
          >
            <strong className="text-error-text">[{e.context}]</strong>
            <span className="min-w-0 flex-1 truncate">{e.message}</span>
            <span className="text-[11px] text-ink-tertiary">
              {new Intl.DateTimeFormat("es-MX", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: ZONA_MX,
              }).format(new Date(e.created_at))}
            </span>
          </div>
        ))}
        <span className="text-[11.5px] text-ink-tertiary">
          Pagos, webhooks y orientación 24/7 reportan aquí y avisan por correo
          a los destinatarios de «Errores del sistema» (Sitio web →
          Notificaciones).
        </span>
      </div>
    </div>
  );
}
