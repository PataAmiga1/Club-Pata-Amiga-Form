/**
 * Documentos legales del footer. "Reglamento del fondo solidario" del sitio
 * anterior se renombra a reintegros (terminología vinculante 2026).
 *
 * Vive aparte de `@/lib/site` (8-oct-2026): `site.ts` importa el cliente de
 * Supabase del servidor (`next/headers`), y `LegalPopup` —que es de cliente—
 * solo necesita esta lista. Al usar el popup en la pantalla de pago, el
 * servidor de desarrollo tronaba con «You're importing a module that depends
 * on "next/headers"». `site.ts` la reexporta, así que nada más cambia.
 */
export const LEGAL_DOCS = [
  { slug: "terminos-y-condiciones", title: "Términos y Condiciones" },
  { slug: "reglamento-de-integridad", title: "Reglamento de Integridad" },
  { slug: "convenio-asociado", title: "Convenio asociado" },
  { slug: "aviso-de-privacidad", title: "Aviso de privacidad Integral" },
  { slug: "politica-de-cookies", title: "Política de Cookies" },
  { slug: "reglamento-de-reintegros", title: "Reglamento de reintegros" },
] as const;
