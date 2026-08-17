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
];

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
