import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateEs } from "@/lib/dates";
import { formatMxn } from "@/lib/format";
import { inicioDelMes, ZONA_MX } from "@/lib/zona-horaria";
import { MiniBarChart } from "@/components/panel/MiniBarChart";

/**
 * Tablero de referidos por embajador (petición del equipo, 5-ago):
 * referidos, ganancias totales, lo por cobrar del corte y el historial
 * de pagos, con la gráfica de referidos por mes.
 */
export default async function AdminEmbajadorTableroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: amb }, { data: referrals }, { data: payouts }] =
    await Promise.all([
      admin
        .from("ambassadors")
        .select("id, first_name, last_name, email, referral_code, status, created_at")
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("referrals")
        .select("id, commission_amount, status, created_at")
        .eq("ambassador_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("ambassador_payouts")
        .select("id, period_month, total_amount, status, paid_at")
        .eq("ambassador_id", id)
        .order("period_month", { ascending: false }),
    ]);

  if (!amb) notFound();

  const monthStart = inicioDelMes();
  const refs = referrals ?? [];
  const historic = refs.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);
  const porCobrar = refs
    .filter((r) => r.status === "pending" && new Date(r.created_at) < monthStart)
    .reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);
  const pagado = (payouts ?? [])
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + Number(p.total_amount ?? 0), 0);

  // Serie de referidos por mes (últimos 6)
  const now = new Date();
  const monthKeys: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("es-MX", {
        month: "short",
        timeZone: ZONA_MX,
      }).format(new Date(d.getFullYear(), d.getMonth(), 15)),
    });
  }
  const series = monthKeys.map((m) => ({
    label: m.label,
    value: refs.filter((r) => r.created_at.slice(0, 7) === m.key).length,
  }));

  const fullName = `${amb.first_name}${amb.last_name ? ` ${amb.last_name}` : ""}`;

  const kpis = [
    { label: "REFERIDOS", value: String(refs.length) },
    { label: "GANANCIAS TOTALES", value: `${formatMxn(historic)} MXN` },
    { label: "POR COBRAR (CORTE)", value: `${formatMxn(porCobrar)} MXN` },
    { label: "PAGADO", value: `${formatMxn(pagado)} MXN` },
  ];

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/embajadores"
          className="text-sm font-semibold text-teal-deep"
        >
          ← Embajadores
        </Link>
        <h1 className="font-display text-[26px] text-ink-title">{fullName}</h1>
        <span className="rounded-full bg-info-bg px-3 py-1 text-[11px] font-extrabold text-info-text">
          {amb.referral_code}
        </span>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="flex flex-col gap-1 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]"
          >
            <span className="text-[10.5px] font-extrabold tracking-[.06em] text-ink-tertiary">
              {k.label}
            </span>
            <span className="font-display text-[24px] text-ink-title">
              {k.value}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MiniBarChart
          title="Referidos por mes"
          data={series}
          color="#1CBCAD"
        />

        {/* Historial de pagos */}
        <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
            HISTORIAL DE PAGOS
          </span>
          {(payouts ?? []).length > 0 ? (
            (payouts ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-[#F2EEE4] py-2 text-[13px] text-ink-body last:border-0"
              >
                <span className="flex-1 capitalize">
                  {new Intl.DateTimeFormat("es-MX", {
                    month: "long",
                    year: "numeric",
                    timeZone: ZONA_MX,
                  }).format(new Date(`${p.period_month}T12:00:00`))}
                </span>
                <span className="font-bold text-ink-title">
                  {formatMxn(Number(p.total_amount ?? 0))} MXN
                </span>
                <span
                  className={`rounded-full px-2.5 py-[3px] text-[10.5px] font-extrabold ${
                    p.status === "paid"
                      ? "bg-success-bg text-success-text"
                      : "bg-warning-bg text-warning-text"
                  }`}
                >
                  {p.status === "paid"
                    ? `PAGADO${p.paid_at ? ` · ${formatDateEs(new Date(p.paid_at))}` : ""}`
                    : "PENDIENTE"}
                </span>
              </div>
            ))
          ) : (
            <span className="text-sm text-ink-secondary">
              Aún sin pagos registrados.
            </span>
          )}
        </div>
      </div>

      {/* Referidos recientes (anónimos: solo fecha, estado y comisión) */}
      <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
          REFERIDOS ({refs.length})
        </span>
        {refs.slice(0, 30).map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 border-b border-[#F2EEE4] py-2 text-[13px] text-ink-body last:border-0"
          >
            <span className="flex-1">
              Alta el {formatDateEs(new Date(r.created_at))}
            </span>
            <span className="font-bold text-ink-title">
              {formatMxn(Number(r.commission_amount ?? 0))} MXN
            </span>
            <span
              className={`rounded-full px-2.5 py-[3px] text-[10.5px] font-extrabold ${
                r.status === "paid"
                  ? "bg-success-bg text-success-text"
                  : "bg-warning-bg text-warning-text"
              }`}
            >
              {r.status === "paid" ? "PAGADA" : "POR PAGAR"}
            </span>
          </div>
        ))}
        {refs.length === 0 && (
          <span className="text-sm text-ink-secondary">
            Aún sin referidos.
          </span>
        )}
      </div>
    </div>
  );
}
