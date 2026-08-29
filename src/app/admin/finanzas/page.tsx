import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { formatMxn } from "@/lib/format";
import { inicioDelMes, ZONA_MX, hoyEnMexico, diaEnMexico } from "@/lib/zona-horaria";
import { mesDe, ultimosMeses, etiquetaMes } from "@/lib/costos";
import { MiniBarChart } from "@/components/panel/MiniBarChart";
import { sexoDeMiembro } from "@/lib/sexo";
import { DetailModal, DetailItem } from "@/components/panel/DetailModal";

type PaymentRow = {
  id: string;
  number: string | null;
  email: string | null;
  amount: number;
  status: string;
  created: Date;
  hostedUrl: string | null;
};

/**
 * Finanzas: MRR y mezcla de planes (BD), cobros recientes (Stripe) y
 * salidas del mes (reintegros + comisiones) con sus layouts bancarios.
 */
export default async function AdminFinanzasPage() {
  // El desglose de cada tarjeta es exclusivo del super admin (16-jul)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  const isSuper = myProfile?.role === "super_admin";

  const admin = createAdminClient();
  // Medianoche de México (ver lib/zona-horaria): con la del proceso, el mes
  // arrancaba a las 6 de la tarde del día anterior en Vercel.
  const monthStart = inicioDelMes();

  const [subsQ, monthReimbs, payableReferrals, activosQ, bajasQ, cfdiQ] =
    await Promise.all([
    admin.from("subscriptions").select("plan, amount").eq("status", "active"),
    admin
      .from("reimbursements")
      .select("amount_approved, status")
      .in("status", ["approved", "partial", "paid"])
      .gte("resolved_at", monthStart.toISOString()),
    // Se trae `created_at` y la fecha de baja del embajador porque el corte no
    // solo mira el mes: a quien se dio de baja se le paga hasta SU fecha de
    // baja (Pablo, 16-ago). Sin ese filtro este total no cuadraría con el
    // archivo del banco ni con el panel de embajadores.
    admin
      .from("referrals")
      .select("commission_amount, created_at, ambassadors(deactivated_at)")
      .eq("status", "pending")
      .lt("created_at", monthStart.toISOString()),
    // Miembros activos TOTALES: el MRR solo puede sumar a quienes tienen
    // suscripción registrada aquí. Sin este contraste, el tablero daría a
    // entender que el MRR es todo el negocio.
    //
    // ⚠ OJO al leer la diferencia: en el ambiente de PRUEBAS sale enorme
    // porque esa base es copia de producción pero sus suscripciones apuntan
    // al Stripe de prueba — las reales no están. Se confundió dos veces con
    // "hay miembros a los que no se les cobra" (11 y 12-ago) y NO lo es.
    // Para juzgar esta cifra: producción, nunca pruebas.
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "member")
      .eq("membership_status", "active"),
    // Cancelaciones con su motivo (Fase 4). Solo registra las hechas en esta
    // plataforma: las bajas de la era Memberstack no tienen fila aquí.
    admin
      .from("cancellations")
      .select(
        "id, reason, created_at, coverage_end_date, rejoined_at, profiles!user_id(first_name, last_name, email)",
      )
      .order("created_at", { ascending: false })
      .limit(15),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "member")
      .eq("cfdi_requested", true),
  ]);

  // Altas y bajas por mes (equipo, 26-ago). Van en consultas aparte de las de
  // arriba porque necesitan TODAS las filas, no un conteo ni las 15 últimas.
  const [{ data: altasRaw }, { data: bajasRaw }] = await Promise.all([
    admin
      .from("profiles")
      .select("member_since, gender, curp")
      .eq("role", "member")
      .not("member_since", "is", null),
    admin.from("cancellations").select("created_at, reason"),
  ]);

  // Doce meses de altas y bajas, anclados en `hoyEnMexico()`: con `new Date()`
  // el mes en curso cambiaría seis horas antes de tiempo en Vercel, que corre
  // en UTC, y el último mes de la gráfica saldría vacío.
  const meses12 = ultimosMeses(mesDe(hoyEnMexico()), 12);
  const altasPorMes = new Map(meses12.map((m) => [m, 0]));
  const bajasPorMes = new Map(meses12.map((m) => [m, 0]));
  const motivos = new Map<string, number>();
  let bajasSinMotivo = 0;
  const sexos = { Hombre: 0, Mujer: 0, otro: 0 };

  for (const a of altasRaw ?? []) {
    const m = mesDe(diaEnMexico(new Date(a.member_since as string)));
    if (altasPorMes.has(m)) altasPorMes.set(m, altasPorMes.get(m)! + 1);
    const { sexo } = sexoDeMiembro(a.gender, a.curp);
    if (sexo === "Hombre") sexos.Hombre++;
    else if (sexo === "Mujer") sexos.Mujer++;
    else sexos.otro++;
  }
  for (const b of bajasRaw ?? []) {
    const m = mesDe(diaEnMexico(new Date(b.created_at as string)));
    if (bajasPorMes.has(m)) bajasPorMes.set(m, bajasPorMes.get(m)! + 1);
    const motivo = (b.reason ?? "").trim();
    if (motivo) motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
    else bajasSinMotivo++;
  }

  const serieAltas = meses12.map((m) => ({
    label: etiquetaMes(m, true),
    value: altasPorMes.get(m) ?? 0,
  }));
  const serieBajas = meses12.map((m) => ({
    label: etiquetaMes(m, true),
    value: bajasPorMes.get(m) ?? 0,
  }));
  const motivosOrdenados = [...motivos.entries()].sort((a, b) => b[1] - a[1]);
  const totalBajas = (bajasRaw ?? []).length;

  const subs = subsQ.data ?? [];
  type Baja = {
    id: string;
    reason: string | null;
    created_at: string;
    coverage_end_date: string | null;
    rejoined_at: string | null;
    profiles: { first_name: string | null; last_name: string | null; email: string | null } | null;
  };
  const bajas = ((bajasQ.data ?? []) as unknown[]).map((b) => {
    const row = b as Omit<Baja, "profiles"> & { profiles: Baja["profiles"] | Baja["profiles"][] };
    return { ...row, profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles };
  }) as Baja[];
  const nombreBaja = (b: Baja) =>
    b.profiles?.first_name
      ? `${b.profiles.first_name} ${b.profiles.last_name ?? ""}`.trim()
      : (b.profiles?.email ?? "Miembro");
  const activosTotales = activosQ.count ?? 0;
  const sinCobroAqui = Math.max(0, activosTotales - subs.length);
  const mrr = subs.reduce(
    (acc, s) =>
      acc + (s.plan === "annual" ? Number(s.amount ?? 0) / 12 : Number(s.amount ?? 0)),
    0,
  );
  const annualCount = subs.filter((s) => s.plan === "annual").length;
  const monthlyCount = subs.filter((s) => s.plan === "monthly").length;
  const reimbOut = (monthReimbs.data ?? []).reduce(
    (acc, r) => acc + Number(r.amount_approved ?? 0),
    0,
  );
  const commissionsOut = (payableReferrals.data ?? [])
    .filter((r) => {
      // PostgREST devuelve el embebido como objeto o como arreglo según la
      // relación; se normaliza para no depender de eso.
      const emb = Array.isArray(r.ambassadors) ? r.ambassadors[0] : r.ambassadors;
      const baja = emb?.deactivated_at;
      return !baja || new Date(r.created_at) <= new Date(baja);
    })
    .reduce((acc, r) => acc + Number(r.commission_amount ?? 0), 0);

  // Cobros desde Stripe (facturas pagadas recientes + total del mes)
  let payments: PaymentRow[] = [];
  let monthCollected = 0;
  let stripeError: string | null = null;
  try {
    const stripe = getStripe();
    const [recent, monthInvoices] = await Promise.all([
      stripe.invoices.list({ limit: 10, status: "paid" }),
      stripe.invoices.list({
        limit: 100,
        status: "paid",
        created: { gte: Math.floor(monthStart.getTime() / 1000) },
      }),
    ]);
    payments = recent.data.map((inv) => ({
      id: inv.id ?? "",
      number: inv.number ?? null,
      email: inv.customer_email ?? null,
      amount: (inv.amount_paid ?? 0) / 100,
      status: inv.status ?? "paid",
      created: new Date((inv.created ?? 0) * 1000),
      hostedUrl: inv.hosted_invoice_url ?? null,
    }));
    monthCollected = monthInvoices.data.reduce(
      (acc, inv) => acc + (inv.amount_paid ?? 0) / 100,
      0,
    );
  } catch {
    stripeError =
      "No pudimos conectar con Stripe. Revisa la clave en el servidor.";
  }

  const monthLabel = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    timeZone: ZONA_MX,
  }).format(new Date());

  const monthlyMrr = subs
    .filter((s) => s.plan === "monthly")
    .reduce((acc, s) => acc + Number(s.amount ?? 0), 0);
  const annualMrr = mrr - monthlyMrr;

  const kpis = [
    {
      label: "MRR · INGRESO RECURRENTE MENSUAL",
      value: `${formatMxn(Math.round(mrr))}`,
      note:
        sinCobroAqui > 0
          ? `solo ${subs.length} de ${activosTotales} miembros activos ⚠`
          : "lo que suman las membresías activas cada mes",
      noteCls: sinCobroAqui > 0 ? "text-warning-text font-semibold" : undefined,
      detail: (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <DetailItem
            label="PLANES MENSUALES"
            value={`${monthlyCount} · ${formatMxn(Math.round(monthlyMrr))} MXN/mes`}
          />
          <DetailItem
            label="PLANES ANUALES (÷12)"
            value={`${annualCount} · ${formatMxn(Math.round(annualMrr))} MXN/mes`}
          />
          <DetailItem
            label="TOTAL MRR"
            value={`${formatMxn(Math.round(mrr))} MXN`}
          />
          <DetailItem
            label="MIEMBROS ACTIVOS"
            value={`${activosTotales} en total · ${subs.length} con cobro en la plataforma`}
          />
          {sinCobroAqui > 0 && (
            <DetailItem
              label="⚠ NO CONTADOS EN EL MRR"
              value={`${sinCobroAqui} miembros activos migrados de la plataforma anterior. Su cobro no vive aquí, así que no tienen plan ni monto registrados y NO suman al MRR. Mientras no se les cree una suscripción, esta cifra es solo la parte que cobra la plataforma nueva.`}
            />
          )}
          <DetailItem
            label="QUÉ ES"
            value="Monthly Recurring Revenue: ingreso que se repite mes a mes con las membresías activas (los planes anuales se prorratean entre 12)."
          />
        </div>
      ),
    },
    {
      label: `COBRADO EN ${monthLabel.toUpperCase()}`,
      value: stripeError ? "—" : formatMxn(monthCollected),
      note: "comprobantes de pago (Stripe)",
      detail: (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <DetailItem
            label="TOTAL DEL MES"
            value={stripeError ? "sin conexión a Stripe" : `${formatMxn(monthCollected)} MXN`}
          />
          <DetailItem
            label="FUENTE"
            value="Comprobantes de pago con estado 'pagado' en Stripe desde el día 1 del mes."
          />
        </div>
      ),
    },
    {
      label: "MEZCLA DE PLANES",
      value: `${monthlyCount} · ${annualCount}`,
      note: "mensuales · anuales activos",
      detail: (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <DetailItem label="MENSUALES ACTIVOS" value={String(monthlyCount)} />
          <DetailItem label="ANUALES ACTIVOS" value={String(annualCount)} />
          <DetailItem
            label="TOTAL"
            value={String(monthlyCount + annualCount)}
          />
        </div>
      ),
    },
    {
      label: `REINTEGROS DE ${monthLabel.toUpperCase()}`,
      value: formatMxn(reimbOut),
      note: "aprobados para transferir",
      detail: (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <DetailItem
            label="APROBADOS ESTE MES"
            value={`${(monthReimbs.data ?? []).length} solicitudes`}
          />
          <DetailItem label="MONTO" value={`${formatMxn(reimbOut)} MXN`} />
          <DetailItem
            label="SIGUIENTE PASO"
            value="Descarga el layout bancario (CSV) y dispérsalo por SPEI."
          />
        </div>
      ),
    },
    {
      label: "COMISIONES POR PAGAR",
      value: formatMxn(commissionsOut),
      note: "corte de embajadores (día 5)",
      detail: (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <DetailItem
            label="REFERIDOS POR PAGAR"
            value={`${(payableReferrals.data ?? []).length}`}
          />
          <DetailItem
            label="MONTO"
            value={`${formatMxn(commissionsOut)} MXN`}
          />
          <DetailItem
            label="SIGUIENTE PASO"
            value="Se paga el día 5 con el layout de comisiones (CSV) o el botón de corte en Embajadores."
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] text-ink-title">Finanzas</h1>
        <div className="flex flex-wrap gap-2">
          {isSuper && (
            <Link
              href="/admin/costos"
              className="grid h-9 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep"
            >
              📉 Costos de la plataforma →
            </Link>
          )}
          {/* Atajo al filtro de solicitantes de factura (Fase 4) */}
          <Link
            href="/admin/miembros?factura=si"
            className="grid h-9 place-items-center rounded-full border-[1.5px] border-teal px-4 text-xs font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            🧾 Solicitan factura ({cfdiQ.count ?? 0}) →
          </Link>
          {/* Exportación configurable (equipo, 26-ago): el admin elige qué
              baja y con qué columnas, en vez de un layout fijo. */}
          <Link
            href="/admin/finanzas/exportar"
            className="grid h-9 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep"
          >
            ⬇ Exportar datos →
          </Link>
          <a
            href="/api/admin/layouts/reintegros"
            className="grid h-9 place-items-center rounded-full border-[1.5px] border-teal px-4 text-xs font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            ⬇ Layout reintegros (CSV)
          </a>
          <a
            href="/api/admin/layouts/comisiones"
            className="grid h-9 place-items-center rounded-full border-[1.5px] border-teal px-4 text-xs font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            ⬇ Layout comisiones (CSV)
          </a>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-9 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep"
          >
            Abrir Stripe →
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="flex flex-col gap-1 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]"
          >
            <span className="text-[10.5px] font-bold tracking-[.05em] text-ink-tertiary">
              {k.label}
            </span>
            <span className="font-display text-[24px] text-ink-title">
              {k.value}
            </span>
            <span className="text-[11px] text-ink-tertiary">{k.note}</span>
            {isSuper && k.detail && (
              <div className="mt-1">
                <DetailModal title={k.label} triggerLabel="Ver detalle">
                  {k.detail}
                </DetailModal>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Altas y bajas por mes (equipo, 26-ago) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MiniBarChart
          title="Altas por mes (últimos 12)"
          data={serieAltas}
          color="#1CBCAD"
        />
        <MiniBarChart
          title="Bajas por mes (últimos 12)"
          data={serieBajas}
          color="#E4739B"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Por qué cancelaron */}
        <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <span className="font-display text-lg text-ink-title">
            Por qué cancelaron
          </span>
          {/* Se dice de dónde sale el número ANTES de la lista: quien lo lea
              tiene que saber que este corte es un piso y no el total. */}
          <span className="text-[12px] leading-relaxed text-ink-tertiary">
            Solo cuenta las bajas hechas EN LA PLATAFORMA. Quien se fue por
            Stripe, por la plataforma anterior o por un cobro fallido no dejó
            motivo, así que esta cifra es un piso, no el total.
          </span>
          {motivosOrdenados.length > 0 ? (
            <>
              {motivosOrdenados.map(([motivo, n]) => {
                const pct = Math.round((n / Math.max(totalBajas, 1)) * 100);
                return (
                  <div key={motivo} className="flex flex-col gap-1 py-1">
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="text-ink-body">{motivo}</span>
                      <span className="flex-none font-bold text-ink-title">
                        {n} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-cream">
                      <div
                        className="h-1.5 rounded-full bg-teal"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {bajasSinMotivo > 0 && (
                <span className="mt-1 rounded-[10px] bg-warning-bg px-3 py-2 text-[11.5px] font-semibold text-warning-text">
                  {bajasSinMotivo} de {totalBajas} bajas no traen motivo.
                </span>
              )}
            </>
          ) : (
            <span className="text-[12.5px] text-ink-secondary">
              Sin cancelaciones con motivo registradas todavía.
            </span>
          )}
        </div>

        {/* Padrón por sexo */}
        <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <span className="font-display text-lg text-ink-title">
            Padrón por sexo
          </span>
          <span className="text-[12px] leading-relaxed text-ink-tertiary">
            Del dato capturado en el perfil y, cuando no está, del que trae la
            CURP. Los &laquo;sin dato&raquo; son quienes no tienen ninguno de
            los dos.
          </span>
          <MiniBarChart
            title=""
            data={[
              { label: "Mujeres", value: sexos.Mujer },
              { label: "Hombres", value: sexos.Hombre },
              { label: "Sin dato", value: sexos.otro },
            ]}
            color="#F2A65A"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <h2 className="font-display text-lg text-ink-title">
          Cobros recientes
        </h2>
        {stripeError ? (
          <span className="text-sm font-semibold text-error-text">
            {stripeError}
          </span>
        ) : (
          <div className="flex flex-col overflow-x-auto">
            <div className="grid min-w-[640px] grid-cols-[130px_1fr_110px_120px_90px] gap-2 border-b-[1.5px] border-[#F2EEE4] pb-2 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder">
              <span>COMPROBANTE</span>
              <span>CLIENTE</span>
              <span>MONTO</span>
              <span>FECHA</span>
              <span>ESTADO</span>
            </div>
            {payments.map((p) => (
              <div
                key={p.id}
                className="grid min-w-[640px] grid-cols-[130px_1fr_110px_120px_90px] items-center gap-2 border-b border-[#F2EEE4] py-[10px] text-[12.5px] text-ink-body last:border-0"
              >
                {p.hostedUrl ? (
                  <a
                    href={p.hostedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-bold text-teal-deep hover:underline"
                  >
                    {p.number ?? p.id.slice(0, 12)}
                  </a>
                ) : (
                  <span className="truncate font-bold text-teal-deep">
                    {p.number ?? p.id.slice(0, 12)}
                  </span>
                )}
                <span className="truncate">{p.email ?? "—"}</span>
                <span className="font-bold">{formatMxn(p.amount)} MXN</span>
                <span>
                  {new Intl.DateTimeFormat("es-MX", {
                    day: "numeric",
                    month: "short",
                    timeZone: ZONA_MX,
                  }).format(p.created)}
                </span>
                <span className="justify-self-start rounded-full bg-success-bg px-2.5 py-[3px] text-[10.5px] font-extrabold text-success-text">
                  PAGADA
                </span>
              </div>
            ))}
            {payments.length === 0 && (
              <span className="py-3 text-sm text-ink-secondary">
                Aún no hay cobros registrados en Stripe.
              </span>
            )}
          </div>
        )}
        <p className="text-[11.5px] text-ink-tertiary">
          Los cobros vienen de Stripe en tiempo real. Para reembolsos de pagos
          o detalles de disputas, usa el dashboard de Stripe.
        </p>
      </div>

      {/* Cancelaciones con su motivo (Fase 4) */}
      <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <h2 className="font-display text-lg text-ink-title">
          Cancelaciones recientes
        </h2>
        {bajas.length > 0 ? (
          <div className="flex flex-col overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-[1fr_110px_170px_120px_110px] gap-2 border-b-[1.5px] border-[#F2EEE4] pb-2 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder">
              <span>MIEMBRO</span>
              <span>FECHA</span>
              <span>MOTIVO</span>
              <span>VIGENCIA HASTA</span>
              <span>REGRESÓ</span>
            </div>
            {bajas.map((b) => (
              <div
                key={b.id}
                className="grid min-w-[720px] grid-cols-[1fr_110px_170px_120px_110px] items-center gap-2 border-b border-[#F2EEE4] py-[10px] text-[12.5px] text-ink-body last:border-0"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-ink-title">
                    {nombreBaja(b)}
                  </span>
                  <span className="block truncate text-[11px] text-ink-tertiary">
                    {b.profiles?.email}
                  </span>
                </span>
                <span>
                  {new Intl.DateTimeFormat("es-MX", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: ZONA_MX,
                  }).format(new Date(b.created_at))}
                </span>
                <span className="min-w-0 truncate" title={b.reason ?? undefined}>
                  {b.reason || "Sin motivo registrado"}
                </span>
                <span>
                  {b.coverage_end_date
                    ? new Intl.DateTimeFormat("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: ZONA_MX,
                      }).format(new Date(`${b.coverage_end_date}T12:00:00`))
                    : "—"}
                </span>
                {b.rejoined_at ? (
                  <span className="justify-self-start rounded-full bg-success-bg px-2.5 py-[3px] text-[10.5px] font-extrabold text-success-text">
                    SÍ, VOLVIÓ
                  </span>
                ) : (
                  <span>—</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm text-ink-secondary">
            Sin cancelaciones registradas en la plataforma.
          </span>
        )}
        <p className="text-[11.5px] text-ink-tertiary">
          Solo aparecen las cancelaciones hechas en esta plataforma; las bajas
          de la era anterior (Memberstack) no dejaron registro aquí. El motivo
          es el que la persona eligió al cancelar.
        </p>
      </div>
    </div>
  );
}
