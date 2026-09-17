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
 * La membresía nueva (sección 1, 17-sep-2026). Su producto vive en la base:
 * `membership_plans` + sus versiones con los montos, y el catálogo de
 * cuidados. La especificación es juntas/64 §4d.
 */
export const PLAN_599 = "membresia-599";

/**
 * El plan que contrata quien se registra hoy.
 *
 * Sale de la variable de entorno `PLAN_DE_ALTAS` (sección 2, 17-sep-2026) y
 * por omisión es el $159. El día del lanzamiento se pone `membresia-599` en
 * Vercel — y para entonces tiene que haber versión publicada con sus DOS
 * precios en Stripe, porque el respaldo de las variables de entorno de precios
 * es SOLO del $159. Ir por variable y no por código permite probar el $599 en
 * local contra la base de pruebas sin tocar lo que corre en producción.
 *
 * Solo se lee en el servidor.
 */
export const PLAN_DE_ALTAS: string = process.env.PLAN_DE_ALTAS?.trim() || PLAN_159;

/** ¿Las altas de hoy son de la membresía $599? */
export const ALTAS_SON_599 = PLAN_DE_ALTAS === PLAN_599;

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

  // Llaves que nacieron con la membresía $599 (17-sep-2026). En el $159 NO
  // aplican: por eso valen 0 / false aquí, y como el catálogo las toma de
  // este objeto, ningún miembro de $159 recibe algo nuevo por tenerlas.
  montos_crecientes: false,
  cuidados_apertura_dias: 0,
  cuidados_monto_inicial_mxn: 0,
  cuidados_tope_anual_mxn: 0,
  cuidados_meses_al_tope: 0,
  emergencia_apertura_mes: 0,
  emergencia_monto_inicial_mxn: 0,
  emergencia_tope_anual_mxn: 0,
  emergencia_meses_al_tope: 0,
  despedida_monto_anual_mxn: 0,
  despedida_apertura_dias: 0,
  dias_habiles_reintegro: 0,
  garantia_dias: 0,
  certificado_senior_al_inscribir: false,
  aviso_reintegro_mayor_a_mxn: 0,
  comision_embajador_porcentaje: 0,
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
