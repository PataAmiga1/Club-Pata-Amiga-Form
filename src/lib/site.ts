import { createClient } from "@/lib/supabase/server";

/**
 * Ajustes editables desde /admin/sitio (tabla site_settings). Los valores
 * por defecto vienen del sitio actual pataamiga.mx.
 */
export const SITE_SETTINGS = [
  {
    key: "contact_email",
    label: "Correo de contacto",
    default: "contacto@pataamiga.mx",
  },
  {
    key: "emergency_phone",
    label: "Teléfono de emergencia (miembros)",
    default: "",
  },
  {
    key: "social_instagram",
    label: "Instagram (URL)",
    default: "https://www.instagram.com/pataamigamx",
  },
  {
    key: "social_facebook",
    label: "Facebook (URL)",
    default: "https://www.facebook.com/share/14YQRpe9WzS/",
  },
  {
    key: "social_tiktok",
    label: "TikTok (URL)",
    default: "https://www.tiktok.com/@pataamigamx",
  },
] as const;

/**
 * Conocimiento adicional del asistente IA (se anexa a su system prompt).
 * Editable desde /admin/sitio como textarea — el equipo actualiza promos,
 * avisos o respuestas frecuentes sin deploy.
 */
export const ASSISTANT_PROMPT_KEY = "assistant_extra_prompt";

/** Igual que el anterior, pero para el agente de ventas en redes sociales. */
export const SALES_PROMPT_KEY = "sales_extra_prompt";

/** Valores efectivos: overrides de BD sobre los defaults. */
export async function fetchSiteSettings(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("key, value");
  const overrides = Object.fromEntries(
    (data ?? []).filter((s) => s.value).map((s) => [s.key, s.value]),
  );
  return Object.fromEntries(
    SITE_SETTINGS.map((s) => [s.key, overrides[s.key] ?? s.default]),
  );
}

export const COMPANY_LINE =
  "GIRBAZ, S.A. de C.V. y PATA AMIGA, A.C. Todos los derechos reservados. Hecho con ♡ en México.";

/**
 * Documentos legales del footer. "Reglamento del fondo solidario" del sitio
 * anterior se renombra a reintegros (terminología vinculante 2026).
 */
export const LEGAL_DOCS = [
  { slug: "terminos-y-condiciones", title: "Términos y Condiciones" },
  { slug: "reglamento-de-integridad", title: "Reglamento de Integridad" },
  { slug: "convenio-asociado", title: "Convenio asociado" },
  { slug: "aviso-de-privacidad", title: "Aviso de privacidad Integral" },
  { slug: "politica-de-cookies", title: "Política de Cookies" },
  { slug: "reglamento-de-reintegros", title: "Reglamento de reintegros" },
] as const;

/** Slots de imagen del sitio editables desde el panel (tabla site_assets). */
export const SITE_ASSET_SLOTS = [
  {
    slot: "landing-hero",
    label: "Hero de la landing",
    hint: "Lomito y michi mirando arriba (recorte sobre teal). Ideal ~900×760.",
  },
  {
    slot: "landing-planes",
    label: "Tarjeta de planes",
    hint: "Tutora abrazando a su lomito (estilo brandbook). Ideal ~800×560.",
  },
  {
    slot: "landing-como-funciona",
    label: "¿Cómo funciona?",
    hint: "Opcional: si está vacío se muestra el mockup del teléfono. Ideal ~600×700.",
  },
  {
    slot: "landing-red",
    label: "Red veterinaria y de cuidado",
    hint: "Collage con fondo transparente (PNG/WebP) — flota sobre blanco. Ideal ~1400px.",
  },
] as const;

export type SiteAssetSlot = (typeof SITE_ASSET_SLOTS)[number]["slot"];

/**
 * Materiales descargables del portal de embajadores — se suben desde
 * /admin/sitio (cualquier tipo de archivo) y se pueden rotar como las fotos.
 */
export const MATERIAL_SLOTS = [
  {
    // La LLAVE `material-pack-historias` no cambia: es la que apunta al
    // archivo ya subido en site_assets. Solo cambian etiqueta y descripción.
    slot: "material-pack-historias",
    label: "Kit historias IG",
    emoji: "🖼️",
    hint: "Recursos para historias de IG.",
  },
  {
    slot: "material-video-reintegro",
    label: "Video «Cómo funciona el reintegro»",
    emoji: "🎬",
    hint: "MP4 corto para redes.",
  },
  {
    slot: "material-guia-marca",
    label: "Guía de tono de marca",
    emoji: "📋",
    hint: "PDF con lineamientos de comunicación.",
  },
  {
    slot: "material-campana",
    label: "Campaña temporal",
    emoji: "⭐",
    hint: "Material de la campaña vigente — rota según la temporada.",
  },
] as const;

/**
 * Eventos con alerta por correo al equipo. Los destinatarios se editan en
 * /admin/sitio (site_settings, clave notify_<evento>, correos separados
 * por coma). Vacío = nadie recibe ese aviso.
 */
export const NOTIFY_EVENTS = [
  {
    key: "notify_reimbursements",
    label: "Nuevo reintegro solicitado",
    hint: "Aviso cuando un miembro envía una solicitud (compromiso 72 hrs).",
  },
  {
    key: "notify_channel_attention",
    label: "Conversación de redes necesita atención",
    hint: "Aviso cuando alguien en Messenger/Instagram/WhatsApp pide un humano, está molesto o menciona temas legales.",
  },
  {
    key: "notify_ambassadors",
    label: "Nueva solicitud de embajador",
    hint: "Aviso al llegar una solicitud del programa de embajadores.",
  },
  {
    key: "notify_centers",
    label: "Nueva solicitud de centro aliado",
    hint: "Aviso al llegar un registro de centro aliado.",
  },
  {
    key: "notify_memberships",
    label: "Baja de miembro con cobro heredado",
    hint: "Aviso cuando cancela alguien migrado de la plataforma anterior: su cobro NO vive aquí y hay que detenerlo por fuera y fijar la fecha de corte. Configúralo o esas bajas pasan sin que nadie se entere.",
  },
  {
    key: "notify_pets",
    label: "Respuestas sobre peludos",
    hint: "Aviso cuando un miembro responde una solicitud de información del comité.",
  },
  {
    key: "notify_appeals",
    label: "Nueva apelación",
    hint: "Aviso cuando un miembro apela un reintegro o un perfil de peludo.",
  },
  {
    key: "notify_emergencies",
    label: "Botón de emergencia",
    hint: "Aviso inmediato cuando un miembro presiona el botón de emergencia.",
  },
  {
    key: "notify_errors",
    label: "Errores del sistema",
    hint: "Fallas en pagos, webhooks u orientación veterinaria.",
  },
  {
    key: "notify_reports",
    label: "Reporte de métricas",
    hint: "Destinatarios del botón «Enviar reporte», tanto del panel como del tablero de ventas.",
  },
  {
    key: "reporte_ventas_recurrente",
    label: "Reporte de ventas automático",
    hint: "Escribe «semanal» (llega los lunes con los últimos 30 días), «mensual» (el día 1, con el mes pasado) o «no». Va a los mismos destinatarios de arriba.",
  },
] as const;

/** URLs actuales por slot; los slots sin imagen muestran bloque punteado. */
export async function fetchSiteAssets(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_assets").select("slot, url");
  // Si esta lectura falla, TODAS las imágenes de la landing se caen a la vez
  // (bloque punteado). Antes fallaba en silencio; ahora deja rastro en los
  // logs de Vercel para poder diagnosticarlo.
  if (error) {
    console.error("[site] fetchSiteAssets falló — la landing mostrará placeholders:", error.message);
  }
  return Object.fromEntries((data ?? []).map((a) => [a.slot, a.url]));
}
