/**
 * Reglas de tiempo de espera por mascota — confirmadas por la PM el
 * 11-ago-2026 (audio + respuestas escritas). Aplican igual a perros y gatos:
 *
 * 1. Código de embajador en la MEMBRESÍA → 90 días. Es un beneficio por
 *    membresía, no por mascota: la tercera mascota registrada meses después
 *    lo conserva. Lo ÚNICO que lo pierde es una mascota de reemplazo.
 * 2. Adoptado/rescatado mestizo o doméstico → 120 días
 * 3. Adoptado/rescatado de raza             → 150 días
 * 4. Caso estándar                          → 180 días
 *
 * REEMPLAZO (registrada tras dar de baja otra): ya NO son 180 fijos — se
 * evalúa con las condiciones normales (120/150/180 según adopción y raza),
 * solo que SIN el beneficio del embajador. Regla anterior (15-jul, sitio
 * vivo): 180 fijos; la PM la corrigió el 11-ago.
 *
 * El CONTRATANTE no tiene tiempo de espera: al pagar es miembro, sin
 * aprobación ni espera (PM, 11-ago).
 */
import { diaEnMexicoMasDias } from "@/lib/zona-horaria";

export const MIXED_BREED_NAMES = ["Mestizo", "Doméstico", "Mestizo (doméstico)"];

export function isMixedBreedName(breed: string | null | undefined): boolean {
  if (!breed) return false;
  const b = breed.trim().toLowerCase();
  return MIXED_BREED_NAMES.some((m) => m.toLowerCase() === b);
}

/**
 * Días de espera de una mascota.
 *
 * `benefits` es OPCIONAL: sin él aplica exactamente los días de siempre. Quien
 * tiene el snapshot del miembro (motor de beneficios, sección 3) pasa los suyos
 * y esa persona se rige por lo que contrató, aunque el plan haya cambiado
 * después.
 */
export type WaitingPeriodBenefits = {
  espera_mascota_estandar_dias?: number;
  espera_mascota_adoptada_raza_dias?: number;
  espera_mascota_adoptada_mestizo_dias?: number;
  espera_mascota_con_embajador_dias?: number;
};

export function petWaitingPeriodDays(
  opts: {
    isAdopted: boolean;
    breed: string | null | undefined;
    hasReferralCode?: boolean;
    isReplacement?: boolean;
  },
  benefits: WaitingPeriodBenefits = {},
): number {
  const estandar = benefits.espera_mascota_estandar_dias ?? 180;
  // El reemplazo NO tiene días propios: solo pierde el beneficio del
  // embajador y se evalúa con las condiciones normales (PM, 11-ago).
  if (opts.hasReferralCode && !opts.isReplacement)
    return benefits.espera_mascota_con_embajador_dias ?? 90;
  if (opts.isAdopted)
    return isMixedBreedName(opts.breed)
      ? (benefits.espera_mascota_adoptada_mestizo_dias ?? 120)
      : (benefits.espera_mascota_adoptada_raza_dias ?? 150);
  return estandar;
}

/**
 * Fecha fin (yyyy-mm-dd) contando desde hoy **en hora de México**.
 *
 * Antes salía del reloj del proceso: en Vercel (UTC) quien se registraba
 * después de las 6 de la tarde recibía un día extra de espera, porque para el
 * servidor ya era mañana. Es la fecha que decide desde cuándo procede un
 * reintegro, así que un día importa.
 */
export function waitingPeriodEndDate(days: number): string {
  return diaEnMexicoMasDias(days);
}
