import {
  APPEAL_MAX_PER_SUBJECT,
  MAX_ACTIVE_PETS,
  REIMBURSEMENT_CAPS_MXN,
  REIMBURSEMENT_SLA_HOURS,
  WAITING_PERIOD_DAYS,
  AMBASSADOR_COMMISSION_MXN,
} from "@/lib/constants";

/**
 * CATÁLOGO DE BENEFICIOS — la pieza central de la sección 3.
 *
 * Un beneficio no es un dato suelto: es un dato QUE ALGÚN CÓDIGO TIENE QUE
 * OBEDECER. Por eso el catálogo vive aquí, en código, y solo los VALORES viven
 * en la base por versión de plan. Si ventas pudiera inventar beneficios
 * arbitrarios, nacería un campo que nadie lee y la promesa se rompería en
 * silencio — el peor resultado posible en un producto de salud.
 *
 * Los valores por omisión se IMPORTAN de constants.ts; no se copian. Una sola
 * fuente de verdad, y el día del despliegue nada cambia.
 *
 * Para agregar un beneficio: una entrada aquí + el código que lo obedece.
 */

export type TipoBeneficio = "entero" | "dinero" | "booleano";

export type DefinicionBeneficio = {
  label: string;
  tipo: TipoBeneficio;
  unidad?: string;
  /** Qué parte del producto lo obedece. Si nadie, no debería existir. */
  consumidoPor: string[];
  /** Quién puede cambiarlo. Los vinculantes están en el reglamento. */
  editablePor: "gerente_ventas" | "super_admin";
  /** Está escrito en el reglamento que el miembro aceptó. */
  vinculante: boolean;
  /**
   * Para el MIEMBRO, ¿qué lado es mejor? Sin esto no se puede responder la
   * pregunta que exige la migración de cohortes: "¿cuánta gente queda peor?".
   * Y sin esa respuesta la compuerta legal no tendría de qué agarrarse.
   *
   * Ojo con los que se leen al revés: en los períodos de espera y en las horas
   * de compromiso, MENOS es mejor.
   */
  mejorSi: "mayor" | "menor" | "verdadero";
  porOmision: number | boolean;
};

export const CATALOGO_BENEFICIOS = {
  // --- Períodos de espera ---------------------------------------------------
  espera_contratante_dias: {
    label: "Período de espera del contratante",
    tipo: "entero",
    unidad: "días desde el pago",
    consumidoPor: ["reintegros"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "menor",
    porOmision: WAITING_PERIOD_DAYS.member,
  },
  espera_mascota_estandar_dias: {
    label: "Período de espera por mascota — estándar",
    tipo: "entero",
    unidad: "días",
    consumidoPor: ["alta de mascota", "reintegros"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "menor",
    porOmision: 180,
  },
  espera_mascota_adoptada_raza_dias: {
    label: "Período de espera — adoptado de raza",
    tipo: "entero",
    unidad: "días",
    consumidoPor: ["alta de mascota"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "menor",
    porOmision: 150,
  },
  espera_mascota_adoptada_mestizo_dias: {
    label: "Período de espera — adoptado mestizo",
    tipo: "entero",
    unidad: "días",
    consumidoPor: ["alta de mascota"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "menor",
    porOmision: 120,
  },
  espera_mascota_con_embajador_dias: {
    label: "Período de espera — con código de embajador",
    tipo: "entero",
    unidad: "días",
    consumidoPor: ["alta de mascota"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "menor",
    porOmision: 90,
  },
  espera_mascota_reemplazo_dias: {
    label: "Período de espera — mascota de reemplazo",
    tipo: "entero",
    unidad: "días",
    consumidoPor: ["alta de mascota"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "menor",
    porOmision: 180,
  },

  // --- Topes de reintegro ---------------------------------------------------
  tope_gastos_veterinarios_mxn: {
    label: "Tope anual — gastos veterinarios",
    tipo: "dinero",
    unidad: "MXN por año",
    consumidoPor: ["saldos de reintegro"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "mayor",
    porOmision: REIMBURSEMENT_CAPS_MXN.vet_expenses,
  },
  tope_fallecimiento_mxn: {
    label: "Tope anual — fallecimiento",
    tipo: "dinero",
    unidad: "MXN por año",
    consumidoPor: ["saldos de reintegro"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "mayor",
    porOmision: REIMBURSEMENT_CAPS_MXN.death,
  },
  tope_vacunas_mxn: {
    label: "Tope anual — vacunas",
    tipo: "dinero",
    unidad: "MXN por año",
    consumidoPor: ["saldos de reintegro"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "mayor",
    porOmision: REIMBURSEMENT_CAPS_MXN.vaccines,
  },
  horas_compromiso_reintegro: {
    label: "Compromiso de transferencia",
    tipo: "entero",
    unidad: "horas",
    consumidoPor: ["reintegros"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "menor",
    porOmision: REIMBURSEMENT_SLA_HOURS,
  },
  apelaciones_max: {
    label: "Apelaciones por caso",
    tipo: "entero",
    consumidoPor: ["apelaciones"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "mayor",
    porOmision: APPEAL_MAX_PER_SUBJECT,
  },

  // --- Mascotas -------------------------------------------------------------
  mascotas_activas_max: {
    label: "Mascotas activas incluidas",
    tipo: "entero",
    consumidoPor: ["alta de mascota"],
    editablePor: "super_admin",
    vinculante: true,
    mejorSi: "mayor",
    porOmision: MAX_ACTIVE_PETS,
  },
  // `edad_senior_anios` se QUITÓ del catálogo el 11-ago-2026: la edad senior
  // es una regla GLOBAL (SENIOR_PET_AGE_YEARS, hoy 8), no un beneficio
  // versionado — aplica a toda mascota nueva sin importar cuándo contrató el
  // miembro (Regla X, decisión de Pablo). Tenerla aquí permitía que cada plan
  // guardara su propia edad y el sistema se contradijera. Los snapshots viejos
  // que aún traen la llave simplemente la ignoran (migración 20260811000004).

  // --- Servicios ------------------------------------------------------------
  orientacion_vet_24_7: {
    label: "Orientación veterinaria 24/7",
    tipo: "booleano",
    consumidoPor: ["bot vet"],
    editablePor: "gerente_ventas",
    vinculante: false,
    mejorSi: "verdadero",
    porOmision: true,
  },

  // --- Embajadores ----------------------------------------------------------
  comision_embajador_mensual_mxn: {
    label: "Comisión de embajador — plan mensual",
    tipo: "dinero",
    unidad: "MXN",
    consumidoPor: ["embajadores"],
    editablePor: "gerente_ventas",
    vinculante: false,
    mejorSi: "mayor",
    porOmision: AMBASSADOR_COMMISSION_MXN.monthly,
  },
  comision_embajador_anual_mxn: {
    label: "Comisión de embajador — plan anual",
    tipo: "dinero",
    unidad: "MXN",
    consumidoPor: ["embajadores"],
    editablePor: "gerente_ventas",
    vinculante: false,
    mejorSi: "mayor",
    porOmision: AMBASSADOR_COMMISSION_MXN.annual,
  },
} as const satisfies Record<string, DefinicionBeneficio>;

export type LlaveBeneficio = keyof typeof CATALOGO_BENEFICIOS;
export type Beneficios = Record<LlaveBeneficio, number | boolean>;

/** Los valores por omisión: exactamente las reglas de hoy. */
export function beneficiosPorOmision(): Beneficios {
  const salida = {} as Beneficios;
  for (const [llave, def] of Object.entries(CATALOGO_BENEFICIOS))
    salida[llave as LlaveBeneficio] = def.porOmision;
  return salida;
}

/**
 * ¿Este cambio deja al miembro mejor, igual o peor?
 *
 *   1 = mejora · 0 = igual · -1 = empeora
 *
 * Es la pregunta que decide si una migración de cohorte necesita papel.
 */
export function comparaParaElMiembro(
  llave: string,
  antes: number | boolean,
  despues: number | boolean,
): 1 | 0 | -1 {
  const def = CATALOGO_BENEFICIOS[llave as LlaveBeneficio];
  if (!def || antes === despues) return 0;

  if (def.mejorSi === "verdadero") return despues ? 1 : -1;

  const a = Number(antes);
  const d = Number(despues);
  if (!Number.isFinite(a) || !Number.isFinite(d)) return 0;

  const sube = d > a;
  return (def.mejorSi === "mayor" ? sube : !sube) ? 1 : -1;
}

/** Beneficios vinculantes: cambiarlos exige la compuerta legal. */
export function esVinculante(llave: string): boolean {
  return (
    CATALOGO_BENEFICIOS[llave as LlaveBeneficio]?.vinculante === true
  );
}

/** Diferencias legibles entre dos juegos de beneficios (para el comparador). */
export function diferencias(
  antes: Partial<Beneficios>,
  despues: Partial<Beneficios>,
): { llave: LlaveBeneficio; label: string; antes: unknown; despues: unknown; vinculante: boolean }[] {
  const base = beneficiosPorOmision();
  const salida = [];
  for (const llave of Object.keys(CATALOGO_BENEFICIOS) as LlaveBeneficio[]) {
    const a = antes[llave] ?? base[llave];
    const d = despues[llave] ?? base[llave];
    if (a !== d)
      salida.push({
        llave,
        label: CATALOGO_BENEFICIOS[llave].label,
        antes: a,
        despues: d,
        vinculante: CATALOGO_BENEFICIOS[llave].vinculante,
      });
  }
  return salida;
}
