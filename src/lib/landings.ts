/**
 * Registro de landings de campaña (ads / patrocinadores).
 *
 * Cada landing vive en /landings/<slug> — para crear una nueva basta con
 * agregar una entrada aquí: la página, el CRM (/admin/landings), el correo
 * de regalo, el cupón y el PDF quedan conectados automáticamente.
 *
 * Por campaña, el equipo gestiona desde Admin → Landings (sin código):
 *  - La palabra cupón      → site_settings, clave campaignCouponKey(slug)
 *  - El PDF del regalo     → site_assets,   slot  campaignPdfSlot(slug)
 */

export type Campaign = {
  slug: string;
  /** Nombre interno para el CRM. */
  name: string;
  /** Si está inactiva, la landing responde 404 y deja de captar leads. */
  active: boolean;
  /**
   * `regalo`: manda el correo con cupón y PDF (lo de siempre).
   * `lista_espera`: solo apunta a la persona y le confirma por correo; sin
   * cupón ni PDF. Nació el 17-sep-2026 para el registro cerrado.
   * `guia`: manda solo el PDF (sin cupón) y deja descargarlo en la misma
   * pantalla al terminar. Nació el 19-sep-2026 para el stand de ExpoCan.
   */
  tipo: "regalo" | "lista_espera" | "guia";
  /**
   * Qué se pregunta además de nombre, correo y teléfono. Sin nada: nombre y
   * apellidos, como siempre. ExpoCan pidió nombre, edad, correo y teléfono.
   */
  campos?: { apellidos?: boolean; edad?: boolean };
  /** Texto del botón para descargar el PDF (en la página y en el correo). */
  pdfLabel?: string;
  /** Copy de la página. */
  headline: string;
  subheadline: string;
  /** Lo que se promete al registrarse (bullets del regalo). */
  perks: { emoji: string; text: string }[];
  /** Asunto del correo de regalo. */
  emailSubject: string;
};

export const CAMPAIGNS: Campaign[] = [
  {
    slug: "regalo",
    name: "Regalo de bienvenida (patrocinador)",
    active: true,
    tipo: "regalo",
    headline: "Tu regalo para consentir a tu peludo 🎁",
    subheadline:
      "Regístrate gratis y recibe en tu correo un descuento para la membresía Club Pata Amiga y una guía de cuidado para tu peludo.",
    perks: [
      { emoji: "🏷️", text: "Cupón de descuento para tu membresía" },
      { emoji: "📘", text: "Guía de cuidado para tu peludo (PDF)" },
      { emoji: "💬", text: "Orientación veterinaria 24/7 al unirte a la manada" },
    ],
    emailSubject: "🎁 Obtén tu regalo — Club Pata Amiga",
  },
  {
    // A donde manda /registro mientras el registro está cerrado
    // (src/lib/registro.ts). Sin precios ni montos: la membresía nueva todavía
    // no tiene sus textos legales.
    slug: "nueva-membresia",
    name: "Lista de espera — nueva membresía",
    active: true,
    tipo: "lista_espera",
    headline: "La nueva membresía Pata Amiga llega muy pronto 🐾",
    subheadline:
      "Estamos preparando la nueva membresía para cuidar a tu peludo. Déjanos tus datos y te avisamos primero en cuanto abra el registro.",
    perks: [
      { emoji: "🔔", text: "Te avisamos antes que a nadie cuando abra" },
      { emoji: "🩺", text: "Mantienes a tu veterinario de confianza" },
      { emoji: "💬", text: "Orientación veterinaria 24/7 para la manada" },
    ],
    emailSubject: "🐾 Ya estás en la lista — Club Pata Amiga",
  },
  {
    // Stand de ExpoCan (19 al 21-sep-2026). Se llega por el QR del stand
    // (utm_source=expocan). Sin cupón, a petición del equipo.
    slug: "expocan",
    name: "ExpoCan 2026 — Mini Guía Interactiva",
    active: true,
    tipo: "guia",
    campos: { apellidos: false, edad: true },
    pdfLabel: "📘 Descargar la Mini Guía Interactiva",
    headline: "Tu Mini Guía Interactiva para cuidar a tu peludo 📘",
    subheadline:
      "Gracias por visitarnos en ExpoCan. Déjanos tus datos: te mandamos la guía a tu correo y también la puedes descargar al momento.",
    perks: [
      { emoji: "📘", text: "Mini Guía Interactiva de Pata Amiga (PDF)" },
      { emoji: "🩺", text: "Mantienes a tu veterinario de confianza" },
      { emoji: "💬", text: "Orientación veterinaria 24/7 para la manada" },
    ],
    emailSubject: "📘 Tu Mini Guía Interactiva — Club Pata Amiga",
  },
];

/** Edad mínima para dejar datos en una landing que pregunta la edad. */
export const EDAD_MINIMA_LANDING = 18;

export function getCampaign(slug: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.slug === slug);
}

/** Clave en site_settings donde vive la palabra cupón de la campaña. */
export function campaignCouponKey(slug: string) {
  return `campaign_${slug}_coupon`;
}

/** Slot en site_assets donde vive el PDF del regalo de la campaña. */
export function campaignPdfSlot(slug: string) {
  return `campaign-${slug}-pdf`;
}

export const CAMPAIGN_PDF_SLOTS = CAMPAIGNS.map((c) => campaignPdfSlot(c.slug));
export const CAMPAIGN_COUPON_KEYS = CAMPAIGNS.map((c) =>
  campaignCouponKey(c.slug),
);
