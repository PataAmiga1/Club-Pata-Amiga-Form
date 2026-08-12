import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { formatMxn } from "@/lib/format";
import { inicioDelMes, ZONA_MX } from "@/lib/zona-horaria";
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
    admin
      .from("referrals")
      .select("commission_amount")
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
  const commissionsOut = (payableReferrals.data ?? []).reduce(
    (acc, r) => acc + Number(r.commission_amount ?? 0),
    0,
  );

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
