/**
 * Business constants — Club Pata Amiga.
 * Terminology is BINDING (see CLAUDE.md): "reintegro", "tiempo de espera",
 * "orientación veterinaria 24/7". Never: seguro, póliza, cobertura, carencia.
 */

export const PLANS = {
  monthly: { name: "Mensual", amountMxn: 159, interval: "month" as const },
  annual: { name: "Anual", amountMxn: 1699, interval: "year" as const, badge: "AHORRA 10%" },
};

/**
 * Tiempo de espera del contratante, desde el pago. El de cada mascota es
 * variable (adopción, raza, código de embajador, reemplazo) — ver
 * src/lib/waiting-period.ts (reglas del sitio vivo, confirmadas 15-jul-2026).
 */
/**
 * ELIMINADO el 11-ago-2026 (PM): el contratante NO tiene tiempo de espera —
 * al pagar es miembro, sin aprobación ni espera. La espera es POR MASCOTA
 * (src/lib/waiting-period.ts) y arranca cuando el comité aprueba el perfil.
 * `profiles.waiting_period_end_date` quedó como columna huérfana con fechas
 * viejas; ya nadie la escribe ni la lee.
 */

/** Topes de reintegro en MXN por categoría. */
export const REIMBURSEMENT_CAPS_MXN = {
  vet_expenses: 3000, // urgencias, análisis/estudios, cirugía y hospitalización
  death: 2000, // gastos funerarios
  vaccines: 300,
} as const;

export const REIMBURSEMENT_CATEGORY_LABELS: Record<
  keyof typeof REIMBURSEMENT_CAPS_MXN,
  string
> = {
  vet_expenses: "Gastos veterinarios",
  death: "Fallecimiento",
  vaccines: "Vacunas",
};

/** Motivos predeterminados de rechazo de reintegros. */
export const REJECTION_REASONS = [
  "Factura ilegible",
  "Fuera de tiempo de espera",
  "Servicio no incluido",
  "Tope excedido",
] as const;

/**
 * Motivos predeterminados al devolver el perfil de un peludo (equipo, 1-sep).
 *
 * SE USAN DISTINTO que los del reintegro. Allá el motivo ES la resolución y se
 * elige uno de la lista, cerrada. Aquí el motivo solo PRELLENA el texto, que
 * sigue siendo libre: la observación de un peludo tiene que decir cuál foto o
 * cuál dato hay que corregir, y una lista cerrada mandaría al miembro un aviso
 * que no le dice qué arreglar. Con esto lo común es un clic y lo específico se
 * escribe encima.
 *
 * Están redactados como lo que hay que HACER, no como un veredicto: el perfil
 * no se rechaza, se devuelve para corregirse (y por eso el aviso al miembro se
 * titula "necesita atención").
 */
export const PET_REJECTION_REASONS = [
  "La foto no deja ver bien al peludo. ¿Nos mandas otra?",
  "Los datos no coinciden con la foto. ¿Los revisas?",
  "Falta el certificado veterinario.",
  "La raza o la especie no coinciden con la foto.",
  "La edad registrada no coincide con la foto.",
] as const;

export const MAX_ACTIVE_PETS = 3;
/** Fotos adicionales por mascota (además de la foto principal). */
export const PET_GALLERY_MAX = 5;
/** Apelaciones máximas por sujeto (regla del sistema anterior). */
export const APPEAL_MAX_PER_SUBJECT = 2;
/**
 * Centros de bienestar: UNA sola apelación (junta 10-ago 01:37:40, confirmado
 * por Pablo el 11-ago). Distinto de miembros y mascotas, que conservan 2.
 * Los embajadores NO pueden apelar — por eso no aparecen aquí.
 */
export const CENTER_APPEAL_MAX = 1;
/**
 * Edad senior (pide certificado veterinario). 10 → 8 el 11-ago-2026 (equipo).
 * Es una regla GLOBAL, no un beneficio versionado: aplica a cualquier mascota
 * registrada desde el cambio, incluidas las de miembros que ya existían
 * (Regla X, decisión de Pablo). Las mascotas ya registradas conservan su
 * `is_senior` guardado — no se recalculan.
 */
export const SENIOR_PET_AGE_YEARS = 8;
export const REIMBURSEMENT_SLA_HOURS = 72; // compromiso de transferencia

/** Las 5 características de la membresía — SIEMPRE en este orden. */
export const MEMBERSHIP_FEATURES = [
  "Disponible en todo México",
  "Mantienes a tu veterinario",
  // "peludos" en vez de "mascotas" en la banda (equipo, 11-ago) — mismo
  // orden vinculante de las 5 características.
  "Incluye hasta 3 peludos",
  "Orientación veterinaria 24/7",
  "100% digital",
] as const;

/** Disclaimer permanente del bot de orientación veterinaria. */
export const VET_BOT_DISCLAIMER =
  "Acompañamiento y guía — no sustituye una consulta ni un diagnóstico veterinario";

export const DOG_BREEDS = [
  "Mestizo",
  "Chihuahua",
  "Schnauzer",
  "Labrador Retriever",
  "Golden Retriever",
  "Pastor Alemán",
  "Bulldog Francés",
  "Bulldog Inglés",
  "Poodle",
  "Pug",
  "Beagle",
  "Dachshund (Salchicha)",
  "Husky Siberiano",
  "Border Collie",
  "Boxer",
  "Cocker Spaniel",
  "Shih Tzu",
  "Maltés",
  "Pomerania",
  "Yorkshire Terrier",
  "Pitbull",
  "Rottweiler",
  "Doberman",
  "Gran Danés",
  "San Bernardo",
  "Xoloitzcuintle",
] as const;

/**
 * Comisión por suscripción referida (código de embajador), en MXN.
 * ~10% del plan según los diseños 6a ($16 mensual / $170 anual).
 * Corte mensual: se paga el día 5 del mes siguiente.
 */
export const AMBASSADOR_COMMISSION_MXN = {
  monthly: 16,
  annual: 170,
} as const;

export const AMBASSADOR_CODE_PREFIX = "PATAMIGA-";
export const AMBASSADOR_PAYOUT_DAY = 5;

/**
 * Servicios de centros de bienestar (valores = columna services[] en BD).
 *
 * NOMBRES NUEVOS Y TRES CATEGORÍAS MÁS (equipo, 15-ago). Las seis originales
 * CONSERVAN SU LLAVE y solo cambian de etiqueta: `store` sigue siendo `store`
 * aunque ahora se lea "Petshop". Eso es lo que hace que ningún centro pierda
 * la categoría que ya tenía elegida —en la base se guarda la llave, no el
 * texto— y por lo mismo este cambio no necesita migración ni toca una fila.
 *
 * Equivalencias acordadas: Clínica→Clínica/Hospital · Tienda→Petshop ·
 * Hotel→Hospedaje · Estética→Estética y grooming · Funeraria→Despedida y
 * memorial · Paseador→Paseadores.
 */
export const WELLNESS_SERVICES = {
  clinic: { label: "Clínica/Hospital", plural: "Clínicas y hospitales", emoji: "🏥" },
  store: { label: "Petshop", plural: "Petshops", emoji: "🛒" },
  hotel: { label: "Hospedaje", plural: "Hospedaje", emoji: "🏨" },
  grooming: { label: "Estética y grooming", plural: "Estética y grooming", emoji: "✂️" },
  funeral: { label: "Despedida y memorial", plural: "Despedida y memorial", emoji: "🕊️" },
  walker: { label: "Paseadores", plural: "Paseadores", emoji: "🐕‍🦺" },
  training: {
    label: "Entrenamiento y comportamiento",
    plural: "Entrenamiento y comportamiento",
    emoji: "🎓",
  },
  transport: { label: "Transporte", plural: "Transporte", emoji: "🚐" },
  photography: {
    label: "Fotografía y experiencias",
    plural: "Fotografía y experiencias",
    emoji: "📸",
  },
} as const;

export type WellnessService = keyof typeof WELLNESS_SERVICES;

export const CAT_BREEDS = [
  "Mestizo (doméstico)",
  "Siamés",
  "Persa",
  "Maine Coon",
  "Bengalí",
  "Ragdoll",
  "Esfinge (Sphynx)",
  "Azul Ruso",
  "Británico de pelo corto",
  "Angora",
  "Bombay",
  "Siberiano",
] as const;
