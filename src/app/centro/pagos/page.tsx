import { createAdminClient } from "@/lib/supabase/admin";
import { MiniBarChart } from "@/components/panel/MiniBarChart";
import { formatMxn } from "@/lib/format";
import { hoyEnMexico } from "@/lib/zona-horaria";
import { mesDe, ultimosMeses, etiquetaMes } from "@/lib/costos";
import { getCenterContext } from "../shared";

export const metadata = { title: "Pagos · Centro aliado · Club Pata Amiga" };

const CONCEPTO: Record<string, string> = {
  vacunas: "Vacunas",
  emergencia_medica: "Emergencia médica",
  fallecimiento: "Fallecimiento",
  otro: "Otro",
};

/** "2026-08-25" → "25 ago 2026". `paid_at` es un `date`, no un instante. */
function fechaCorta(dia: string): string {
  const [anio, mes, d] = dia.split("-");
  return `${Number(d)} ${etiquetaMes(`${anio}-${mes}`, true)} ${anio}`;
}

/**
 * Pagos que Pata Amiga le ha hecho al centro por servicios a miembros, con la
 * gráfica mensual que pidió el equipo el 19-ago (decisión 2.3).
 *
 * Los meses se cuentan desde `hoyEnMexico()` y las filas se agrupan por
 * `paid_at`, que es un `date` (día de calendario). Si se anclara la ventana con
 * `new Date()`, en Vercel —que corre en UTC— el mes en curso cambiaría seis
 * horas antes de tiempo y el último mes de la gráfica saldría vacío.
 */
export default async function CentroPagosPage() {
  const { center } = await getCenterContext();

  const admin = createAdminClient();
  // Sin `limit`: el total tiene que ser el total. Antes se sumaban solo los 50
  // más recientes y la tarjeta prometía un "Total recibido" que no lo era.
  const { data: pagos } = await admin
    .from("center_payments")
    .select("id, concept, amount, notes, paid_at")
    .eq("center_id", center.id)
    .order("paid_at", { ascending: false });

  const filas = pagos ?? [];
  const total = filas.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  const meses = ultimosMeses(mesDe(hoyEnMexico()), 12);
  const porMes = new Map(meses.map((m) => [m, 0]));
  for (const p of filas) {
    const m = mesDe(p.paid_at);
    if (porMes.has(m)) porMes.set(m, porMes.get(m)! + Number(p.amount ?? 0));
  }
  const serie = meses.map((m) => ({
    label: etiquetaMes(m, true),
    value: porMes.get(m) ?? 0,
  }));
  const totalDelPeriodo = serie.reduce((s, d) => s + d.value, 0);

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-5 py-7 sm:px-8">
      <div className="flex flex-col gap-1.5 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          PAGOS DE PATA AMIGA
        </span>
        <span className="text-[12.5px] leading-relaxed text-ink-tertiary">
          Pagos directos por servicios a miembros (vacunas, emergencias,
          fallecimiento). Total recibido:{" "}
          <strong className="text-ink-title">{formatMxn(total)} MXN</strong>
        </span>
      </div>

      {totalDelPeriodo > 0 ? (
        <MiniBarChart
          title="Pagos por mes (últimos 12)"
          data={serie}
          format={(v) => `${formatMxn(v)} MXN`}
        />
      ) : (
        <div className="rounded-[18px] bg-white p-5 text-[12.5px] text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          Cuando recibas tu primer pago verás aquí la gráfica de los últimos 12
          meses.
        </div>
      )}

      <div className="flex flex-col gap-2.5 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          HISTORIAL
        </span>
        {filas.length > 0 ? (
          filas.map((p) => (
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
                {formatMxn(Number(p.amount))} MXN
              </span>
              <span className="flex-none text-[11px] text-ink-tertiary">
                {fechaCorta(p.paid_at)}
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
  );
}
