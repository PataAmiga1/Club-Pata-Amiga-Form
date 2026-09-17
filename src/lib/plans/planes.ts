import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * QUÉ PLAN TIENE CADA QUIEN — sección 0 de la membresía $599 (16-sep-2026).
 *
 * Desde el lanzamiento conviven dos productos: los miembros de antes se quedan
 * en $159 con sus reglas, y quien entra contrata el nuevo. Cada búsqueda de
 * precio o de versión tiene que saber DE QUÉ PLAN habla; si no, «la última
 * versión publicada» de un plan le cae encima al otro.
 */

/** El plan de $159: todos los miembros anteriores al lanzamiento del $599. */
export const PLAN_159 = "membresia";

/**
 * El plan que contrata quien se registra hoy. El día del lanzamiento cambia al
 * slug del $599 — y en ese mismo despliegue tiene que haber versión publicada
 * con precio en Stripe, porque el respaldo de las variables de entorno es
 * SOLO del plan de $159.
 *
 * Tipado como `string` a propósito: al cambiar el valor, las comparaciones
 * contra PLAN_159 siguen compilando.
 */
export const PLAN_DE_ALTAS: string = PLAN_159;

/**
 * Las reglas del plan de $159 tal como estaban el 16-sep-2026, CONGELADAS.
 *
 * Son los valores por omisión del catálogo: los recibe todo miembro sin foto
 * de beneficios (los que vienen de Memberstack sin fila de suscripción, y
 * cualquier dato viejo). Antes salían de las constantes de `constants.ts`, y
 * eso era un riesgo: cambiar una constante para el producto nuevo les cambiaba
 * las reglas a los miembros de $159 sin que nadie se enterara.
 *
 * NO SE EDITAN. Cambiarle algo a un miembro de $159 se hace con una versión
 * nueva de su plan y una migración de cohorte, con su papel legal.
 */
export const BENEFICIOS_PLAN_159 = Object.freeze({
  espera_mascota_estandar_dias: 180,
  espera_mascota_adoptada_raza_dias: 150,
  espera_mascota_adoptada_mestizo_dias: 120,
  espera_mascota_con_embajador_dias: 90,
  tope_gastos_veterinarios_mxn: 3000,
  tope_fallecimiento_mxn: 2000,
  tope_vacunas_mxn: 300,
  horas_compromiso_reintegro: 72,
  apelaciones_max: 2,
  mascotas_activas_max: 3,
  orientacion_vet_24_7: true,
  comision_embajador_mensual_mxn: 16,
  comision_embajador_anual_mxn: 170,
} as const);

/**
 * El plan de una versión. Sin versión = plan de $159: toda suscripción sin
 * versión es anterior al versionado de planes, y por lo tanto de $159.
 *
 * Ante un error de lectura también responde $159, que es lo que protege: el
 * peor caso es no ofrecerle a alguien un precio del plan nuevo, nunca moverlo
 * a él por accidente.
 */
export async function planDeLaVersion(
  admin: Admin,
  planVersionId: string | null | undefined,
): Promise<string> {
  if (!planVersionId) return PLAN_159;
  try {
    const { data } = await admin
      .from("plan_versions")
      .select("membership_plans!inner(slug)")
      .eq("id", planVersionId)
      .maybeSingle();
    const plan = Array.isArray(data?.membership_plans)
      ? data?.membership_plans[0]
      : data?.membership_plans;
    return (plan as { slug?: string } | undefined)?.slug ?? PLAN_159;
  } catch {
    return PLAN_159;
  }
}
