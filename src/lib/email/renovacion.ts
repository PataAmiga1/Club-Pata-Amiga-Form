/**
 * Variables del correo «renovacion_proxima», armadas sin tocar la base ni el
 * proveedor de correo para poder probarlas sueltas.
 *
 * Nació de un correo real (18-oct-2026, peludo Kenai) que decía:
 *   «se renueva el 19 de octubre de 2026, en mañana» · «El cobro es de $0 MXN»
 *   · «Hola,» sin nombre · «…sin cobertura de reintegros».
 * El $0 salía de la primera factura (mes gratis por cupón), no de lo que se iba
 * a cobrar. Aquí el monto es el del PRÓXIMO cobro y, si no se sabe, el correo
 * no menciona cifra: anunciar $0 es peor que no decir nada.
 */
import { formatMxn } from "@/lib/format";

type VersionDePrecio = {
  price_cents?: number | null;
  additional_price_cents?: number | null;
} | null;

/**
 * Lo que se va a cobrar en la renovación, en pesos, o null si no se sabe.
 *
 * 1. `subscriptions.amount`: desde el 20-oct-2026 el webhook guarda ahí el
 *    precio recurrente (antes, en el alta, guardaba lo pagado en el checkout:
 *    $0 con cupón de mes gratis). La renovación lo vuelve a escribir.
 * 2. Si viene vacío o en 0: el precio de la versión del plan que contrató
 *    (con 15% si es peludo adicional).
 * 3. Si tampoco: null — el correo omite la cifra.
 */
export function montoDelProximoCobro(sub: {
  amount: number | string | null | undefined;
  price_tier?: string | null;
  plan_versions?: VersionDePrecio | VersionDePrecio[];
}): number | null {
  const guardado = Number(sub.amount ?? 0);
  if (Number.isFinite(guardado) && guardado > 0) return guardado;

  const version = Array.isArray(sub.plan_versions)
    ? (sub.plan_versions[0] ?? null)
    : (sub.plan_versions ?? null);
  const centavos =
    sub.price_tier === "adicional"
      ? (version?.additional_price_cents ?? version?.price_cents)
      : version?.price_cents;
  return centavos && centavos > 0 ? centavos / 100 : null;
}

/** «hoy», «mañana» o «en N días»: va justo después de «se renueva». */
export function cuandoSeRenueva(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

/** «¡Hola, Cipatli!», o «¡Hola!» sin nombre — igual que el saludo de /app. */
export function saludoDe(nombre: string | null | undefined): string {
  const limpio = (nombre ?? "").trim();
  return limpio ? `¡Hola, ${limpio}!` : "¡Hola!";
}

export function variablesDeRenovacion(input: {
  firstName: string | null | undefined;
  fecha: string;
  dias: number;
  monto: number | null;
  moneda: string | null | undefined;
  plan: string;
  cuentaUrl: string;
  msiLine: string;
}): Record<string, string> {
  const moneda = String(input.moneda ?? "MXN").toUpperCase();
  const monto = input.monto ? `${formatMxn(input.monto)} ${moneda}` : "";
  return {
    saludo: saludoDe(input.firstName),
    firstName: (input.firstName ?? "").trim(),
    fecha: input.fecha,
    cuando: cuandoSeRenueva(input.dias),
    // Compatibilidad con una plantilla personalizada en /admin/comunicados
    // anterior al 20-oct-2026 (en producción no hay ninguna).
    dias: input.dias === 0 ? "hoy" : input.dias === 1 ? "mañana" : `${input.dias} días`,
    monto,
    cobroLine: monto
      ? `<p>El cobro es de <strong>${monto}</strong> y se hace solo, con la tarjeta que tienes guardada. No tienes que hacer nada.</p>`
      : `<p>El cobro se hace solo, con la tarjeta que tienes guardada. No tienes que hacer nada.</p>`,
    plan: input.plan,
    cuentaUrl: input.cuentaUrl,
    msiLine: input.msiLine,
  };
}
