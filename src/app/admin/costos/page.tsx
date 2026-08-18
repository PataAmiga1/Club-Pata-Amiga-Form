import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { formatMxn } from "@/lib/format";
import { inicioDelMes, ZONA_MX } from "@/lib/zona-horaria";
import { MiniBarChart } from "@/components/panel/MiniBarChart";
import {
  resumenDelMes,
  costoPorMiembro,
  margenDelMes,
  proveedoresFaltantes,
  mesIncompleto,
  etiquetaProveedor,
  etiquetaMes,
  ultimosMeses,
  mesMas,
  CATEGORIAS,
  type Costo,
} from "@/lib/costos";
import { CostosPanel } from "./CostosPanel";

const pesos = (centavos: number) => formatMxn(Math.round(centavos) / 100);

/**
 * Costos de la plataforma (spec en docs/COSTOS-PLATAFORMA.md).
 *
 * Contesta lo que Finanzas no podía: cuánto cuesta tener la plataforma
 * prendida, cuánto de eso es fijo, cuánto cuesta sostener a cada miembro y si
 * el mes va ganando o perdiendo. La pauta se reporta APARTE para que no se
 * coma la gráfica.
 *
 * Solo super admin (decisión del 3-ago).
 */
export default async function AdminCostosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (myProfile?.role !== "super_admin") redirect("/admin/finanzas");

  const admin = createAdminClient();
  const { mes: mesParam } = await searchParams;
  // El mes se corta en hora de México: un costo del 31 a las 8 de la noche
  // pertenece a ese mes, no al siguiente (en Vercel el proceso corre en UTC).
  const mesActual = inicioDelMes().toISOString().slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? mesParam! : mesActual;

  const [costosQ, activosQ, ajustesQ] = await Promise.all([
    // Todos los costos: los prorrateos de meses anteriores aportan a este mes
    admin
      .from("platform_costs")
      .select(
        "id, proveedor, concepto, categoria, periodo, monto_centavos, moneda, monto_mxn_centavos, origen, recurrente, prorratear_meses, nota",
      )
      .order("created_at", { ascending: true }),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "member")
      .eq("membership_status", "active"),
    admin
      .from("site_settings")
      .select("key, value")
      .in("key", ["costos_responsable_email", "costos_dia_recordatorio"]),
  ]);

  // Si la migración todavía no corre en este ambiente, la pantalla lo dice en
  // lugar de tronar con un error de PostgREST.
  const faltaMigracion = Boolean(costosQ.error);
  const costos = (costosQ.data ?? []) as unknown as Costo[];
  const activos = activosQ.count ?? 0;
  const ajustes = Object.fromEntries(
    (ajustesQ.data ?? []).map((a) => [a.key, a.value]),
  );

  const resumen = resumenDelMes(costos, mes);
  const anterior = resumenDelMes(costos, mesMas(mes, -1));
  const faltantes = proveedoresFaltantes(costos, mes);
  const incompleto = mesIncompleto(costos, mes);
  const porMiembro = costoPorMiembro(resumen.operar.total, activos);

  // Ingresos del mes: mismos comprobantes pagados que muestra Finanzas
  let ingresos = 0;
  let ingresosError = false;
  try {
    const stripe = getStripe();
    const desde = new Date(`${mes}-01T00:00:00-06:00`);
    const hasta = new Date(`${mesMas(mes, 1)}-01T00:00:00-06:00`);
    const facturas = await stripe.invoices.list({
      limit: 100,
      status: "paid",
      created: {
        gte: Math.floor(desde.getTime() / 1000),
        lt: Math.floor(hasta.getTime() / 1000),
      },
    });
    ingresos = facturas.data.reduce(
      (acc, inv) => acc + (inv.amount_paid ?? 0),
      0,
    );
  } catch {
    ingresosError = true;
  }
  const margen = margenDelMes(ingresos, resumen.operar.total);

  const serie = ultimosMeses(mes, 6).map((m) => ({
    label: etiquetaMes(m, true),
    value: Math.round(resumenDelMes(costos, m).operar.total / 100),
  }));

  const variacion =
    anterior.operar.total > 0
      ? Math.round(
          ((resumen.operar.total - anterior.operar.total) /
            anterior.operar.total) *
            100,
        )
      : null;

  const mesesSelector = ultimosMeses(mesActual, 12).reverse();

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/finanzas"
            className="text-sm font-semibold text-teal-deep"
          >
            ← Finanzas
          </Link>
          <h1 className="font-display text-[26px] text-ink-title">
            Costos de la plataforma
          </h1>
        </div>
        <form action="/admin/costos" className="flex items-center gap-2">
          <select
            name="mes"
            defaultValue={mes}
            className="h-9 rounded-full border-[1.5px] border-border-input bg-white px-3 text-[12.5px] text-ink-title outline-none focus:border-teal"
          >
            {mesesSelector.map((m) => (
              <option key={m} value={m}>
                {etiquetaMes(m)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="grid h-9 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep"
          >
            Ver
          </button>
        </form>
      </div>

      {faltaMigracion && (
        <div className="rounded-[14px] bg-warning-bg px-4 py-3 text-[13px] text-warning-text">
          <strong>Falta correr la migración</strong>{" "}
          <code>20260812000001_costos_plataforma.sql</code> en este ambiente. La
          pantalla funciona en cuanto exista la tabla; mientras tanto no se
          puede capturar nada.
        </div>
      )}

      {/* Honestidad ante todo: un total incompleto no se muestra como real */}
      {!faltaMigracion && incompleto && (
        <div className="rounded-[14px] bg-warning-bg px-4 py-3 text-[13px] text-warning-text">
          <strong>Este mes está incompleto.</strong>{" "}
          {faltantes.length > 0
            ? `No se ha capturado: ${faltantes.map(etiquetaProveedor).join(" · ")}.`
            : "Nadie ha capturado costos a mano todavía."}{" "}
          Los totales de abajo son parciales — no los tomes como el costo real
          del mes.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        <Tarjeta
          label="COSTO DE OPERAR"
          value={pesos(resumen.operar.total)}
          note={
            variacion === null
              ? "sin mes anterior para comparar"
              : `${variacion >= 0 ? "+" : ""}${variacion}% vs ${etiquetaMes(mesMas(mes, -1), true)}`
          }
        />
        <Tarjeta
          label="FIJO"
          value={pesos(resumen.operar.fijo)}
          note="planes e infraestructura"
        />
        <Tarjeta
          label="VARIABLE"
          value={pesos(resumen.operar.variable)}
          note="IA, mensajería y comisiones"
        />
        <Tarjeta
          label="COSTO POR MIEMBRO ACTIVO"
          value={porMiembro === null ? "—" : pesos(porMiembro)}
          note={`${activos} miembros activos`}
        />
        <Tarjeta
          label="MARGEN DEL MES"
          value={ingresosError ? "—" : pesos(margen)}
          note={
            ingresosError
              ? "sin conexión a Stripe"
              : `ingresos ${pesos(ingresos)} − costos`
          }
          rojo={!ingresosError && margen < 0}
        />
      </div>

      {/* La pauta va aparte a propósito */}
      {resumen.adquisicion > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <div className="flex flex-col">
            <span className="text-[10.5px] font-bold tracking-[.05em] text-ink-tertiary">
              ADQUISICIÓN (PAUTA) — TOTAL APARTE
            </span>
            <span className="font-display text-[24px] text-ink-title">
              {pesos(resumen.adquisicion)}
            </span>
          </div>
          <span className="max-w-[420px] text-[12px] text-ink-secondary">
            No se suma al costo de operar: mezclarlos haría que la gráfica de
            infraestructura no sirva para decidir nada.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <MiniBarChart
          title="Costo de operar por mes"
          data={serie}
          color="#F7941D"
          format={(v) => formatMxn(v)}
        />
        <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <span className="font-display text-lg text-ink-title">
            Por proveedor · {etiquetaMes(mes)}
          </span>
          {resumen.porProveedor.map((p) => (
            <div
              key={p.proveedor}
              className="flex items-center gap-3 border-b border-[#F2EEE4] py-2 text-[13px] text-ink-body last:border-0"
            >
              <span className="flex-1">
                {etiquetaProveedor(p.proveedor)}
                <span className="block text-[11px] text-ink-tertiary">
                  {CATEGORIAS[p.categoria]?.label ?? p.categoria}
                </span>
              </span>
              <span className="font-bold text-ink-title">
                {pesos(p.centavos)}
              </span>
            </div>
          ))}
          {resumen.porProveedor.length === 0 && (
            <span className="text-sm text-ink-secondary">
              Sin costos en {etiquetaMes(mes)}.
            </span>
          )}
        </div>
      </div>

      {!faltaMigracion && (
        <CostosPanel
          mes={mes}
          costos={costos}
          responsable={ajustes.costos_responsable_email ?? ""}
          diaRecordatorio={ajustes.costos_dia_recordatorio ?? "5"}
        />
      )}

      <p className="text-[11.5px] text-ink-tertiary">
        Los meses se cortan en hora de México ({ZONA_MX}). El costo de la IA y
        las comisiones de Stripe se calculan solos; el resto se captura a mano
        porque esos proveedores no exponen el consumo — y aquí nunca se estima:
        si falta capturar algo, la pantalla lo dice.
      </p>
    </div>
  );
}

function Tarjeta({
  label,
  value,
  note,
  rojo,
}: {
  label: string;
  value: string;
  note: string;
  rojo?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
      <span className="text-[10.5px] font-bold tracking-[.05em] text-ink-tertiary">
        {label}
      </span>
      <span
        className={`font-display text-[24px] ${rojo ? "text-error-text" : "text-ink-title"}`}
      >
        {value}
      </span>
      <span className="text-[11px] text-ink-tertiary">{note}</span>
    </div>
  );
}
