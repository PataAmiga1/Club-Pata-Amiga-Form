import { Suspense } from "react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortal } from "@/lib/panel-guard";
import {
  embudo,
  motivosDePerdida,
  porPersona,
  tarjetas,
  tendencia,
} from "@/lib/tableros/metricas";
import {
  periodoAnterior,
  rangoDe,
  rangoPersonalizado,
  type Preset,
} from "@/lib/tableros/rango";
import {
  Tablero,
  type EtapaVista,
  type GraficaVista,
  type PersonaVista,
  type TarjetaVista,
} from "@/components/panel/tablero/Tablero";

export const metadata = { title: "Resumen · Portal de ventas" };

const PRESETS_VALIDOS: Preset[] = [
  "mes_actual",
  "mes_pasado",
  "ultimos_30",
  "ultimos_90",
  "anio",
  "personalizado",
];

/** Cómo se ve cada tipo de número. */
function comoTexto(valor: number, formato: string): string {
  if (formato === "dinero") return `$${Math.round(valor).toLocaleString("es-MX")}`;
  if (formato === "porcentaje") return `${valor.toFixed(1)}%`;
  return Math.round(valor).toLocaleString("es-MX");
}

export default async function VentasResumenPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}) {
  const session = await requirePortal("ventas");
  const admin = createAdminClient();
  const params = await searchParams;

  const preset: Preset = PRESETS_VALIDOS.includes(params.periodo as Preset)
    ? (params.periodo as Preset)
    : "mes_actual";

  const rango =
    (preset === "personalizado" && params.desde && params.hasta
      ? rangoPersonalizado(params.desde, params.hasta)
      : null) ?? rangoDe(preset === "personalizado" ? "mes_actual" : preset);
  const anterior = periodoAnterior(rango, preset);

  // LOS PERMISOS VAN EN LA CONSULTA: un `ventas` solo recibe su renglón. No es
  // que la tabla se pinte incompleta — es que los datos de los demás no vienen.
  const soloMisNumeros = session.role === "ventas";

  const [filasTarjetas, filasEmbudo, filasPersonas, motivos, tProspectos, tMiembros] =
    await Promise.all([
      tarjetas(admin, rango, anterior),
      embudo(admin, rango),
      porPersona(admin, rango, soloMisNumeros ? session.userId : null),
      motivosDePerdida(admin, rango),
      tendencia(admin, "prospectos", rango),
      tendencia(admin, "miembros_nuevos", rango),
    ]);

  const vistaTarjetas: TarjetaVista[] = filasTarjetas.map((t) => ({
    clave: t.clave,
    etiqueta: t.etiqueta,
    texto: t.texto ?? comoTexto(t.valor, t.formato),
    anteriorTexto: t.anterior === null ? null : comoTexto(t.anterior, t.formato),
    variacion: t.variacion,
    detalle: t.detalle,
  }));

  const mayor = Math.max(...filasEmbudo.map((e) => e.cuantas), 1);
  const vistaEmbudo: EtapaVista[] = filasEmbudo.map((e) => ({
    clave: e.clave,
    nombre: e.nombre,
    cuantas: e.cuantas,
    pesosTexto: `$${Math.round(e.pesos).toLocaleString("es-MX")}`,
    pasoTexto:
      e.porcentajeDelTotal === null ? null : `${e.porcentajeDelTotal.toFixed(0)}%`,
    proporcion: (e.cuantas / mayor) * 100,
  }));

  const vistaPersonas: PersonaVista[] = filasPersonas.map((p) => ({
    userId: p.userId,
    nombre: p.nombre,
    conversaciones: p.conversaciones,
    ganadas: p.ganadas,
    perdidas: p.perdidas,
    pesosTexto: `$${Math.round(p.pesosGanados).toLocaleString("es-MX")}`,
    tareasVencidas: p.tareasVencidas,
  }));

  const graficas: GraficaVista[] = [
    {
      titulo: "Prospectos por día",
      datos: tProspectos.puntos,
      diasFaltantes: tProspectos.diasFaltantes.length,
    },
    {
      titulo: "Miembros nuevos por día",
      datos: tMiembros.puntos,
      diasFaltantes: tMiembros.diasFaltantes.length,
    },
  ];

  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:px-[30px] md:py-[26px]">
      {/* Regreso al panel del comité (Pablo, 19-ago). Se llega aquí desde «Ver
          el tablero completo» del bloque de ventas de /admin, y hasta hoy la
          única salida era el conmutador de portales escondido en el avatar.
          Solo se pinta para quien de verdad puede entrar a /admin. */}
      {session.portals.includes("admin") && (
        <Link
          href="/admin"
          className="self-start text-[12.5px] font-semibold text-teal-deep hover:underline"
        >
          ← Volver al panel del comité
        </Link>
      )}
      <h1 className="font-display text-[24px] text-ink-title">Resumen</h1>

      {/* useSearchParams pide un límite de Suspense cuando el padre es servidor. */}
      <Suspense fallback={<p className="text-[12.5px] text-ink-secondary">Cargando…</p>}>
        <Tablero
          etiquetaPeriodo={rango.etiqueta}
          etiquetaAnterior={anterior.etiqueta}
          preset={preset}
          tarjetas={vistaTarjetas}
          embudo={vistaEmbudo}
          graficas={graficas}
          personas={vistaPersonas}
          motivos={motivos}
          soloMisNumeros={soloMisNumeros}
          puedeReportar={session.can["tablero.equipo"]}
        />
      </Suspense>
    </div>
  );
}
