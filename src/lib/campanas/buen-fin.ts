/**
 * EL BUEN FIN 2026 — «La cuenta de Pata Amiga» (13 al 17 de noviembre).
 *
 * TODA la configuración de la campaña vive aquí: fechas, código, cifras que
 * promete la pauta y cómo se arma el enlace al registro. La página /buenfin,
 * el selector del plan y el checkout leen de este archivo; nadie más escribe
 * una fecha ni un código de la campaña.
 *
 * Sin dependencias de servidor ni alias `@/` a propósito: se prueba suelto con
 * `node --test tests/campanas/` (la zona horaria se importa con su extensión,
 * igual que `channels/meta.ts`).
 *
 * LO QUE COBRA EL CHECKOUT NO SALE DE AQUÍ. Los precios se leen de la versión
 * publicada del plan (`ofertaPublica599`) y el descuento es el cupón BUENFIN
 * que la PM crea en Ventas → Membresías ($599, una sola vez). `CIFRAS_DE_PAUTA`
 * son los números que ya se imprimieron en los anuncios: la página los compara
 * contra los reales y avisa si no cuadran, pero nunca los enseña en lugar de
 * los reales.
 */
import { diaEnMexico, finDelDia } from "../zona-horaria.ts";

export const BUEN_FIN = {
  /** La palabra que se teclea. Una sola, para las dos modalidades. */
  codigo: "BUENFIN",
  /** Primer y último día de la promoción, en días de México (inclusive). */
  inicio: "2026-11-13",
  fin: "2026-11-17",
  /** Descuento del cupón en pesos, una sola vez. Debe coincidir con Stripe. */
  descuentoPesos: 599,
  ruta: "/buenfin",
  nombre: "El Buen Fin 2026: La cuenta de Pata Amiga",
  mensaje: "Un código. Tú eliges cómo pagar.",
  fechasEnTexto: "Del 13 al 17 de noviembre",
} as const;

/**
 * Lo que deben decir los anuncios. El documento maestro decía anual regular
 * $7,188 → $6,589, pero el anual publicado es $6,612: se le pidió al cliente
 * corregir la pauta a $6,612 → $6,013 (9-nov-2026). Estas son las cifras
 * CORREGIDAS; si la versión publicada cambia, la página avisa fuera de
 * producción.
 */
export const CIFRAS_DE_PAUTA = {
  mensualPesos: 599,
  anualRegularPesos: 6612,
  anualBuenFinPesos: 6013,
  primerMesPesos: 0,
} as const;

export type EstadoCampana = "antes" | "activa" | "terminada";

/** En qué momento de la campaña estamos, según el día de México. */
export function estadoDeLaCampana(ahora: Date = new Date()): EstadoCampana {
  const hoy = diaEnMexico(ahora);
  if (hoy < BUEN_FIN.inicio) return "antes";
  if (hoy > BUEN_FIN.fin) return "terminada";
  return "activa";
}

/** Lo que falta para que cierre la promoción (17-nov 23:59:59 de México). `null` si ya cerró. */
export function tiempoParaElCierre(
  ahoraMs: number,
): { dias: number; horas: number; minutos: number } | null {
  const faltanMs = finDelDia(BUEN_FIN.fin).getTime() - ahoraMs;
  if (faltanMs <= 0) return null;
  const minutosTotales = Math.ceil(faltanMs / 60_000);
  return {
    dias: Math.floor(minutosTotales / 1440),
    horas: Math.floor((minutosTotales % 1440) / 60),
    minutos: minutosTotales % 60,
  };
}

/** `?vista=` para revisar los tres estados antes de tiempo (solo QA). */
export function vistaForzada(valor: string | string[] | undefined): EstadoCampana | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v === "antes" || v === "activa" || v === "terminada" ? v : null;
}

// ---------------------------------------------------------------------------
// Las cuentas de la campaña. Todo en pesos, a partir de los precios REALES.
// ---------------------------------------------------------------------------

export type CuentasBuenFin = {
  mensual: number;
  /** Lo que se paga hoy en mes a mes (el primer mes). */
  primerMes: number;
  anualRegular: number;
  anualBuenFin: number;
  ahorroAnual: number;
  /** Primer año mes a mes: primer mes + 11 mensualidades. */
  primerAnioMensual: number;
};

export function cuentasBuenFin(
  precios: { mensualPesos: number; anualPesos: number },
  descuentoPesos: number = BUEN_FIN.descuentoPesos,
): CuentasBuenFin {
  const r = (n: number) => Math.round(n * 100) / 100;
  const primerMes = r(Math.max(0, precios.mensualPesos - descuentoPesos));
  const anualBuenFin = r(Math.max(0, precios.anualPesos - descuentoPesos));
  return {
    mensual: precios.mensualPesos,
    primerMes,
    anualRegular: precios.anualPesos,
    anualBuenFin,
    ahorroAnual: r(precios.anualPesos - anualBuenFin),
    primerAnioMensual: r(primerMes + 11 * precios.mensualPesos),
  };
}

/** ¿Los precios reales dan exactamente lo que prometen los anuncios? */
export function cuadraConLaPauta(c: CuentasBuenFin): boolean {
  return (
    c.mensual === CIFRAS_DE_PAUTA.mensualPesos &&
    c.primerMes === CIFRAS_DE_PAUTA.primerMesPesos &&
    c.anualRegular === CIFRAS_DE_PAUTA.anualRegularPesos &&
    c.anualBuenFin === CIFRAS_DE_PAUTA.anualBuenFinPesos
  );
}

// ---------------------------------------------------------------------------
// Del enlace de la campaña al registro, y del registro al pago.
//
// OJO: el parámetro NO es `codigo`. `?codigo=` es el código de EMBAJADOR, que
// además cambia el tiempo de espera (StashAmbassadorCode, plan/page.tsx). La
// promoción viaja en `promo` y la modalidad en `modalidad`.
// ---------------------------------------------------------------------------

export type Modalidad = "mensual" | "anual";

/** Lo que se lleva de la URL de la landing al registro: campaña y nada más. */
const PARAMETROS_DE_CAMPANA = /^(utm_[a-z_]+|fbclid|gclid|ttclid)$/;

/** El enlace del botón de cada tarjeta, con la pauta (utm/fbclid/ttclid) intacta. */
export function enlaceDeRegistro(
  modalidad: Modalidad,
  busquedaDeLaLanding: Record<string, string | string[] | undefined> = {},
): string {
  const q = new URLSearchParams({ modalidad, promo: BUEN_FIN.codigo });
  for (const [llave, valor] of Object.entries(busquedaDeLaLanding)) {
    const v = Array.isArray(valor) ? valor[0] : valor;
    if (v && PARAMETROS_DE_CAMPANA.test(llave)) q.set(llave, v.slice(0, 200));
  }
  return `/registro?${q.toString()}`;
}

/** Llave de localStorage: la promoción y la modalidad que traía el enlace. */
export const LLAVE_PROMO_GUARDADA = "pa_promo_campana";

/** Una elección guardada caduca: quien vuelve en un mes ya no viene del anuncio. */
const VIGENCIA_GUARDADO_MS = 30 * 24 * 60 * 60 * 1000;

export type PromoGuardada = { promo: string | null; modalidad: Modalidad | null; ts: number };

function limpiarPromo(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9-]{3,30}$/.test(t) ? t : null;
}

function limpiarModalidad(texto: string | null | undefined): Modalidad | null {
  const t = (texto ?? "").trim().toLowerCase();
  return t === "mensual" || t === "anual" ? t : null;
}

/** Lo que trae la URL del registro. `null` si no trae ni promoción ni modalidad. */
export function promoDeLaUrl(busqueda: string, ahora: number = Date.now()): PromoGuardada | null {
  const q = new URLSearchParams(busqueda);
  const promo = limpiarPromo(q.get("promo"));
  const modalidad = limpiarModalidad(q.get("modalidad"));
  if (!promo && !modalidad) return null;
  return { promo, modalidad, ts: ahora };
}

/** Lee lo guardado; basura, vacío o caducado = null. */
export function leerPromoGuardada(
  crudo: string | null | undefined,
  ahora: number = Date.now(),
): PromoGuardada | null {
  if (!crudo) return null;
  try {
    const o = JSON.parse(crudo) as Partial<PromoGuardada>;
    const ts = typeof o.ts === "number" ? o.ts : NaN;
    if (!Number.isFinite(ts) || ahora - ts > VIGENCIA_GUARDADO_MS || ts > ahora + 60_000)
      return null;
    const promo = limpiarPromo(o.promo ?? null);
    const modalidad = limpiarModalidad(o.modalidad ?? null);
    if (!promo && !modalidad) return null;
    return { promo, modalidad, ts };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// El recordatorio «Registro sin pagar» durante la campaña (12-nov-2026).
// ---------------------------------------------------------------------------

const pesos = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

/** El renglón del código de siempre: fuera de la campaña no cambia nada. */
export const AVISO_DE_CODIGO_GENERICO =
  "¿Tienes un código de promoción o de una persona embajadora? Escríbelo en <strong>«¿Tienes un código?»</strong> al elegir tu plan.";

/**
 * Lo que el recordatorio de pago dice del código y cómo arma su botón.
 * Mientras la campaña está activa, el renglón anuncia BUENFIN con las cifras
 * de la pauta (las mismas que /buenfin compara contra los precios reales) y el
 * botón lleva `?promo=BUENFIN`, que el plan aplica solo. Si la PM aún no crea
 * el cupón, el plan avisa que no está activo y se paga el precio regular.
 */
export function avisoDeCodigoParaCorreo(ahora: Date = new Date()): {
  avisoCodigo: string;
  sufijoUrl: string;
} {
  if (estadoDeLaCampana(ahora) !== "activa")
    return { avisoCodigo: AVISO_DE_CODIGO_GENERICO, sufijoUrl: "" };
  const c = CIFRAS_DE_PAUTA;
  return {
    avisoCodigo:
      `<strong>El Buen Fin, ${BUEN_FIN.fechasEnTexto.toLowerCase()}:</strong> con el código <strong>${BUEN_FIN.codigo}</strong> tienes ${pesos(BUEN_FIN.descuentoPesos)} de descuento en tu primer pago. ` +
      `En mes a mes, tu primer mes queda en ${pesos(c.primerMesPesos)}; en el plan anual pagas ${pesos(c.anualBuenFinPesos)} en lugar de ${pesos(c.anualRegularPesos)}. ` +
      `Con el botón de abajo el código ya va puesto.`,
    sufijoUrl: `?promo=${BUEN_FIN.codigo}`,
  };
}

/**
 * Las promociones que valen SOLO para el primer peludo de la cuenta. Quien ya
 * es miembro y agrega otro peludo tiene su 15%: el checkout no le aplica estas.
 */
export const PROMOS_SOLO_PRIMER_PELUDO: readonly string[] = [BUEN_FIN.codigo];
