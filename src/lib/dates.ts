import { ZONA_MX } from "@/lib/zona-horaria";

const MS_PER_DAY = 86_400_000;

/** Columnas de fecha pura: 2026-07-26 */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function formatDateEs(date: Date | string): string {
  // A las fechas puras se les pone mediodía para que el cambio de zona horaria
  // no las corra un día. A los timestamptz NO: ya traen hora, y concatenarles
  // "T12:00:00" producía "Invalid time value".
  const value =
    typeof date === "string"
      ? new Date(SOLO_FECHA.test(date) ? `${date}T12:00:00` : date)
      : date;
  if (Number.isNaN(value.getTime())) return "—";
  // timeZone explícita: en Vercel el proceso corre en UTC y un alta de las
  // 9pm del día 5 (hora CDMX) se mostraba como día 6 (hallazgo del equipo;
  // misma familia que el barrido F10 de zona horaria).
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONA_MX,
  }).format(value);
}

export type WaitingProgress = {
  total: number;
  elapsed: number;
  done: boolean;
  pct: number;
};

/**
 * Progress of a pet's waiting period shown as "38 / 180 días".
 * El período es variable por mascota (ver src/lib/waiting-period.ts).
 *
 * El inicio sale de `waiting_period_start_date` — el día en que el comité
 * APROBÓ el perfil (regla de la PM, 11-ago). `createdAt` queda solo como
 * respaldo para mascotas aprobadas antes de esa regla (sin backfill).
 *
 * Por qué existe el inicio guardado: antes se adivinaba con `created_at`, y
 * si la fecha fin se fijaba días después de crear el perfil (p. ej. al pagar),
 * esa brecha aparecía como días "transcurridos" fantasma — el bug de los
 * "13 días" en una mascota recién registrada.
 */
export function waitingProgress(
  createdAt: string | null,
  endDate: string | null,
  bypassed: boolean,
  startDate?: string | null,
): WaitingProgress {
  const FALLBACK_TOTAL = 180;
  if (!endDate) {
    // Sin fecha aún (la espera arranca cuando el comité aprueba)
    return bypassed
      ? { total: FALLBACK_TOTAL, elapsed: FALLBACK_TOTAL, done: true, pct: 100 }
      : { total: FALLBACK_TOTAL, elapsed: 0, done: false, pct: 0 };
  }
  const end = new Date(`${endDate}T12:00:00`).getTime();
  const start = startDate
    ? new Date(`${startDate}T12:00:00`).getTime()
    : createdAt
      ? new Date(createdAt).getTime()
      : end - FALLBACK_TOTAL * MS_PER_DAY;
  const total = Math.max(1, Math.round((end - start) / MS_PER_DAY));
  if (bypassed) return { total, elapsed: total, done: true, pct: 100 };
  const remaining = Math.ceil((end - Date.now()) / MS_PER_DAY);
  const elapsed = Math.min(Math.max(total - remaining, 0), total);
  return { total, elapsed, done: elapsed >= total, pct: (elapsed / total) * 100 };
}

/**
 * ISO de hace `dias` días. Para filtrar "lo de la última semana" en consultas
 * a Supabase: `.gte("created_at", haceDias(7))`.
 */
export function haceDias(dias: number): string {
  return new Date(Date.now() - dias * MS_PER_DAY).toISOString();
}

/** Días completos transcurridos desde `iso`. Nunca negativo. */
export function diasDesde(iso: string, ahora: number = Date.now()): number {
  return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / MS_PER_DAY));
}

/**
 * "hace 5 min" · "hace 3 h" · "hace 2 d".
 *
 * `ahora` se recibe en vez de leerlo aquí: llamar `Date.now()` dentro del
 * render de un componente de cliente deja la hora congelada entre re-renders
 * y puede desajustar la hidratación. En cliente, `ahora` sale de `useAhora()`.
 * Esta función vivía duplicada carácter por carácter en las dos campanas.
 */
export function tiempoRelativo(iso: string, ahora: number): string {
  const mins = Math.floor((ahora - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `hace ${Math.max(mins, 1)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

/** ¿Ya se pasó la fecha? (tareas vencidas). `null` nunca está vencido. */
export function estaVencida(iso: string | null, ahora: number): boolean {
  return !!iso && new Date(iso).getTime() < ahora;
}

/** Renewal date: subscription period end, or member_since + plan interval. */
export function renewalDate(
  periodEnd: string | null,
  memberSince: string | null,
  plan: string | null,
): Date | null {
  if (periodEnd) return new Date(periodEnd);
  if (!memberSince) return null;
  const d = new Date(memberSince);
  if (plan === "annual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}
