import { createAdminClient } from "@/lib/supabase/admin";
import { comisionesDeEmbajadores } from "@/lib/comisiones";
import { formatMxn } from "@/lib/format";
import { getAmbassadorContext } from "../shared";

export const metadata = { title: "Métricas de embajador · Club Pata Amiga" };

type Row = {
  created_at: string;
  commission_amount: number | null;
  subscriptions: {
    plan: string | null;
    status: string | null;
    updated_at: string | null;
  } | null;
};

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

/** Últimos 12 meses como claves yyyy-mm, del más antiguo al actual. */
function monthKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

const monthLabel = (key: string) =>
  new Intl.DateTimeFormat("es-MX", { month: "short" })
    .format(new Date(`${key}-15T12:00:00`))
    .replace(".", "");

function BarChart({
  title,
  data,
  color,
  format,
}: {
  title: string;
  data: { key: string; value: number }[];
  color: string;
  format: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
      <span className="font-display text-lg text-ink-title">{title}</span>
      <div className="flex h-[150px] items-end gap-1.5">
        {data.map((d) => (
          <div
            key={d.key}
            className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-[9.5px] font-bold text-ink-tertiary opacity-0 transition-opacity group-hover:opacity-100">
              {format(d.value)}
            </span>
            <div
              className={`w-full rounded-t-[6px] ${d.value > 0 ? color : "bg-[#EFEAE0]"}`}
              style={{
                height: `${Math.max(d.value > 0 ? (d.value / max) * 100 : 3, 3)}%`,
              }}
              title={`${monthLabel(d.key)}: ${format(d.value)}`}
            />
            <span className="text-[9.5px] font-semibold capitalize text-ink-placeholder">
              {monthLabel(d.key)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Métricas detalladas del embajador: altas, bajas y comisiones por mes en el
 * último año. Sin datos personales de los referidos — solo fechas y montos.
 */
export default async function EmbajadorMetricasPage() {
  const { ambassador } = await getAmbassadorContext();
  const admin = createAdminClient();

  const { data: referralsRaw } = await admin
    .from("referrals")
    .select(
      "created_at, commission_amount, subscriptions(plan, status, updated_at)",
    )
    .eq("ambassador_id", ambassador.id);

  const referrals: Row[] = (referralsRaw ?? []).map((r) => ({
    created_at: r.created_at,
    commission_amount: r.commission_amount,
    subscriptions: one(r.subscriptions),
  }));

  const keys = monthKeys();
  const keyOf = (iso: string) => iso.slice(0, 7);

  const altas = keys.map((key) => ({
    key,
    value: referrals.filter((r) => keyOf(r.created_at) === key).length,
  }));
  const bajas = keys.map((key) => ({
    key,
    value: referrals.filter(
      (r) =>
        r.subscriptions?.status &&
        r.subscriptions.status !== "active" &&
        r.subscriptions.updated_at &&
        keyOf(r.subscriptions.updated_at) === key,
    ).length,
  }));
  // Por mes en que se GANÓ: la única del $159 en su alta, la del $599 en cada
  // mes pagado (src/lib/comisiones).
  const items = await comisionesDeEmbajadores(admin, [ambassador.id]);
  const comisiones = keys.map((key) => ({
    key,
    value: items
      .filter((c) => keyOf(c.fecha) === key)
      .reduce((sum, c) => sum + c.monto, 0),
  }));

  const activos = referrals.filter(
    (r) => !r.subscriptions?.status || r.subscriptions.status === "active",
  ).length;
  const totalBajas = referrals.length - activos;
  const totalComisiones = items.reduce((sum, c) => sum + c.monto, 0);

  const kpis = [
    { label: "REFERIDOS TOTALES", value: String(referrals.length) },
    { label: "ACTIVOS HOY", value: String(activos) },
    { label: "BAJAS", value: String(totalBajas) },
    { label: "COMISIONES HISTÓRICAS", value: `${formatMxn(totalComisiones)} MXN` },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-5 py-5 sm:px-8">
      <div>
        <h1 className="font-display text-[24px] text-ink-title">
          Tus métricas del último año
        </h1>
        <p className="text-[12.5px] text-ink-secondary">
          Altas, bajas y comisiones mes a mes. Por privacidad, no mostramos
          los datos personales de quienes usan tu código.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="flex flex-col gap-0.5 rounded-[16px] bg-white px-4 py-3.5 shadow-[0_2px_10px_rgba(30,83,80,.05)]"
          >
            <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
              {k.label}
            </span>
            <span className="font-display text-[22px] text-ink-title">
              {k.value}
            </span>
          </div>
        ))}
      </div>

      <BarChart
        title="Altas por mes (nuevos referidos)"
        data={altas}
        color="bg-teal"
        format={(v) => String(v)}
      />
      <BarChart
        title="Bajas por mes"
        data={bajas}
        color="bg-orange"
        format={(v) => String(v)}
      />
      <BarChart
        title="Comisiones por mes"
        data={comisiones}
        color="bg-teal-deep"
        format={(v) => `${formatMxn(v)}`}
      />
    </div>
  );
}
