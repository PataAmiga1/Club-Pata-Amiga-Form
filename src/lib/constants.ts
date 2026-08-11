/**
 * Business constants — Club Pata Amiga.
 * Terminology is BINDING (see CLAUDE.md): "reintegro", "período de espera",
 * "orientación veterinaria 24/7". Never: seguro, póliza, cobertura, carencia.
 */

export const PLANS = {
  monthly: { name: "Mensual", amountMxn: 159, interval: "month" as const },
  annual: { name: "Anual", amountMxn: 1699, interval: "year" as const, badge: "AHORRA 10%" },
};

/**
 * Período de espera del contratante, desde el pago. El de cada mascota es
 * variable (adopción, raza, código de embajador, reemplazo) — ver
 * src/lib/waiting-period.ts (reglas del sitio vivo, confirmadas 15-jul-2026).
 */
export const WAITING_PERIOD_DAYS = {
  member: 90,
} as const;

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
  "Fuera de período de espera",
  "Servicio no incluido",
  "Tope excedido",
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
export const SENIOR_PET_AGE_YEARS = 10; // requiere certificado veterinario
export const REIMBURSEMENT_SLA_HOURS = 72; // compromiso de transferencia

/** Las 5 características de la membresía — SIEMPRE en este orden. */
export const MEMBERSHIP_FEATURES = [
  "Disponible en todo México",
  "Mantienes a tu veterinario",
  "Incluye hasta 3 mascotas",
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

/** Servicios de centros de bienestar (valores = columna services[] en BD). */
export const WELLNESS_SERVICES = {
  clinic: { label: "Clínica", plural: "Clínicas", emoji: "🏥" },
  store: { label: "Tienda", plural: "Tiendas", emoji: "🛒" },
  hotel: { label: "Hotel", plural: "Hoteles", emoji: "🏨" },
  grooming: { label: "Estética", plural: "Estética", emoji: "✂️" },
  funeral: { label: "Funeraria", plural: "Funerarias", emoji: "🕊️" },
  walker: { label: "Paseador", plural: "Paseadores", emoji: "🐕‍🦺" },
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
