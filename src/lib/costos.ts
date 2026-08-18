/**
 * Costos de la plataforma — TODA la aritmética del tablero de costos.
 *
 * Sin dependencias a propósito (como zona-horaria.ts y newsletter/costos.ts):
 * así se puede compilar y probar suelto. Los meses se manejan como cadenas
 * "YYYY-MM" y nunca como Date, para que el corte del mes no dependa de la
 * zona horaria del proceso — quien llama obtiene el mes con `inicioDelMes()`
 * de zona-horaria.ts, que ya cuenta en hora de México.
 *
 * Decisiones del negocio que viven aquí (junta 3-ago):
 *  · La PAUTA va en un total aparte: mezclar ~$17,000 de anuncios con unos
 *    cientos de infraestructura hace inútil la gráfica de costos.
 *  · Los pagos ANUALES se prorratean entre sus meses.
 *  · Las comisiones de Stripe cuentan como costo (renglón propio).
 *  · Nunca se estima: un mes sin capturar se reporta como incompleto, no
 *    como $0 (un total que parece real y no lo es es peor que no tenerlo).
 */

export type Categoria =
  | "infraestructura"
  | "ia"
  | "mensajeria"
  | "comisiones"
  | "marketing";

export type Grupo = "operar" | "adquisicion";

export const CATEGORIAS: Record<
  Categoria,
  { label: string; grupo: Grupo; naturaleza: "fijo" | "variable" }
> = {
  infraestructura: {
    label: "Infraestructura",
    grupo: "operar",
    naturaleza: "fijo",
  },
  ia: { label: "Inteligencia artificial", grupo: "operar", naturaleza: "variable" },
  mensajeria: { label: "Mensajería", grupo: "operar", naturaleza: "variable" },
  comisiones: {
    label: "Comisiones de cobro",
    grupo: "operar",
    naturaleza: "variable",
  },
  marketing: { label: "Pauta y adquisición", grupo: "adquisicion", naturaleza: "variable" },
};

/** Proveedores conocidos. `otro` deja capturar cualquiera sin tocar código. */
export const PROVEEDORES: {
  key: string;
  label: string;
  categoria: Categoria;
  automatico?: boolean;
}[] = [
  { key: "vercel", label: "Vercel", categoria: "infraestructura" },
  { key: "supabase", label: "Supabase", categoria: "infraestructura" },
  { key: "resend", label: "Resend (correos)", categoria: "infraestructura" },
  { key: "dominio", label: "Dominio", categoria: "infraestructura" },
  { key: "google_maps", label: "Google Maps", categoria: "infraestructura" },
  { key: "anthropic", label: "Anthropic (agentes IA)", categoria: "ia", automatico: true },
  { key: "meta", label: "WhatsApp / Meta", categoria: "mensajeria" },
  { key: "stripe", label: "Stripe (comisiones)", categoria: "comisiones", automatico: true },
  { key: "meta_ads", label: "Pauta en Meta", categoria: "marketing" },
  { key: "otro", label: "Otro", categoria: "infraestructura" },
];

export function etiquetaProveedor(key: string): string {
  return PROVEEDORES.find((p) => p.key === key)?.label ?? key;
}

export type Costo = {
  id: string;
  proveedor: string;
  concepto: string;
  categoria: Categoria;
  /** "YYYY-MM-DD" (día 1 del mes) */
  periodo: string;
  monto_mxn_centavos: number;
  moneda: string;
  monto_centavos: number;
  origen: "manual" | "automatico";
  recurrente: boolean;
  prorratear_meses: number | null;
  nota: string | null;
};

/* ---------- Aritmética de meses, en cadenas ---------- */

/** "2026-08-01" | "2026-08" → "2026-08" */
export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

/** Suma (o resta) meses a "YYYY-MM". */
export function mesMas(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Los últimos `n` meses terminando en `mes` (incluido), del más viejo al más nuevo. */
export function ultimosMeses(mes: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => mesMas(mes, i - (n - 1)));
}

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-08" → "agosto 2026" · corto: "ago" */
export function etiquetaMes(mes: string, corto = false): string {
  const [y, m] = mes.split("-").map(Number);
  const nombre = MESES_ES[m - 1] ?? "";
  return corto ? nombre.slice(0, 3) : `${nombre} ${y}`;
}

/* ---------- Aporte de un costo a un mes ---------- */

/**
 * Cuánto aporta un costo al mes pedido, en centavos MXN.
 *
 * Un pago anual capturado en enero con `prorratear_meses: 12` aporta un
 * doceavo a cada mes de enero a diciembre — así el mes en que se pagó el
 * dominio no aparece como un pico que no refleja la operación.
 */
export function aporteEnMes(costo: Costo, mes: string): number {
  const inicio = mesDe(costo.periodo);
  const meses = costo.prorratear_meses ?? 1;
  if (meses <= 1) return inicio === mes ? costo.monto_mxn_centavos : 0;
  const distancia = distanciaEnMeses(inicio, mes);
  if (distancia < 0 || distancia >= meses) return 0;
  // El último mes absorbe el redondeo para que la suma cuadre al centavo.
  const porMes = Math.floor(costo.monto_mxn_centavos / meses);
  return distancia === meses - 1
    ? costo.monto_mxn_centavos - porMes * (meses - 1)
    : porMes;
}

export function distanciaEnMeses(desde: string, hasta: string): number {
  const [y1, m1] = desde.split("-").map(Number);
  const [y2, m2] = hasta.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/* ---------- Totales ---------- */

export type ResumenMes = {
  mes: string;
  operar: { fijo: number; variable: number; total: number };
  adquisicion: number;
  porProveedor: { proveedor: string; centavos: number; categoria: Categoria }[];
  /** Renglones que aportan a este mes (incluye prorrateos de otros meses). */
  renglones: number;
};

export function resumenDelMes(costos: Costo[], mes: string): ResumenMes {
  const res: ResumenMes = {
    mes,
    operar: { fijo: 0, variable: 0, total: 0 },
    adquisicion: 0,
    porProveedor: [],
    renglones: 0,
  };
  const porProveedor = new Map<string, { centavos: number; categoria: Categoria }>();

  for (const c of costos) {
    const aporte = aporteEnMes(c, mes);
    if (aporte === 0) continue;
    res.renglones++;
    const meta = CATEGORIAS[c.categoria];
    if (!meta) continue;
    if (meta.grupo === "adquisicion") {
      res.adquisicion += aporte;
    } else {
      res.operar[meta.naturaleza] += aporte;
      res.operar.total += aporte;
    }
    const previo = porProveedor.get(c.proveedor);
    porProveedor.set(c.proveedor, {
      centavos: (previo?.centavos ?? 0) + aporte,
      categoria: c.categoria,
    });
  }

  res.porProveedor = [...porProveedor.entries()]
    .map(([proveedor, v]) => ({ proveedor, ...v }))
    .sort((a, b) => b.centavos - a.centavos);
  return res;
}

/** Costo de operar por miembro activo. `null` si no hay miembros (no se divide entre cero). */
export function costoPorMiembro(
  operarCentavos: number,
  miembrosActivos: number,
): number | null {
  if (miembrosActivos <= 0) return null;
  return Math.round(operarCentavos / miembrosActivos);
}

/** Margen del mes: ingresos − costo de operar. Negativo = se está perdiendo. */
export function margenDelMes(
  ingresosCentavos: number,
  operarCentavos: number,
): number {
  return ingresosCentavos - operarCentavos;
}

/* ---------- Honestidad: qué falta por capturar ---------- */

/**
 * Proveedores que se esperaban en un mes y no están.
 *
 * "Se esperaba" = ese proveedor se capturó como RECURRENTE en algún mes
 * anterior. Es la única forma de saber que falta Vercel sin inventar un
 * catálogo fijo: lo aprende de lo que el equipo ya viene capturando.
 */
export function proveedoresFaltantes(costos: Costo[], mes: string): string[] {
  const recurrentesPrevios = new Set<string>();
  for (const c of costos) {
    if (!c.recurrente) continue;
    if (distanciaEnMeses(mesDe(c.periodo), mes) > 0) recurrentesPrevios.add(c.proveedor);
  }
  const presentes = new Set(
    costos.filter((c) => aporteEnMes(c, mes) > 0).map((c) => c.proveedor),
  );
  return [...recurrentesPrevios].filter((p) => !presentes.has(p)).sort();
}

/** Un mes está incompleto si nadie capturó nada a mano o si falta un recurrente. */
export function mesIncompleto(costos: Costo[], mes: string): boolean {
  const manuales = costos.filter(
    (c) => c.origen === "manual" && aporteEnMes(c, mes) > 0,
  ).length;
  return manuales === 0 || proveedoresFaltantes(costos, mes).length > 0;
}
