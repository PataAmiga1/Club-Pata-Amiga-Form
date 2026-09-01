import type { NextConfig } from "next";

/**
 * ⚠️ ESTE ES EL ÚNICO ARCHIVO DE CONFIGURACIÓN. No crear `next.config.js`.
 *
 * Hasta el 1-sep hubo DOS: este y un `next.config.js` del 2-ago. Next resuelve
 * `.js` ANTES que `.ts`, así que todo lo de aquí llevaba ignorado desde el
 * 13-ago sin que nada lo avisara — el build no se queja de un archivo de más,
 * simplemente usa el primero que encuentra.
 *
 * Lo que costó: el `bodySizeLimit` de abajo nunca se aplicó, y el alta de
 * embajador y de centro llevaba semanas tronando con «Body exceeded 1 MB
 * limit» cada vez que alguien subía su INE en PDF. En pantalla solo decía
 * «Algo salió mal», así que nadie podía saber qué pasaba.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  turbopack: {
    // Se fija la raíz del proyecto: un lockfile suelto en la carpeta del
    // usuario hace que Next infiera la raíz equivocada.
    root: __dirname,
  },

  experimental: {
    // Las fotos de INE del alta de embajador y de centro —y desde la fase 5
    // también la constancia de RFC— viajan DENTRO de la Server Action: el
    // bucket es privado y la cuenta todavía no existe cuando se piden, así que
    // no hay a qué carpeta subirlas desde el navegador.
    //
    // OJO: subir este número NO alcanza por sí solo. Vercel corta la petición
    // en 4.5 MB antes de que Next opine, así que el formulario también valida
    // el peso TOTAL en el navegador (`PESO_TOTAL_MAX` en FotoDocumento) y avisa
    // con claridad, en vez de dejar que truene con un 413 mudo.
    serverActions: { bodySizeLimit: "6mb" },
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "hjvhntxjkuuobgfslzlf.supabase.co" },
      // El storage de PRUEBAS: sin esto, en staging las imágenes servidas desde
      // su propio proyecto no pasan por next/image.
      { protocol: "https", hostname: "dpsdopbwnxgwowzehotj.supabase.co" },
      { protocol: "https", hostname: "cdn.prod.website-files.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        source: "/widgets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },

  // Embed en Webflow
  async rewrites() {
    return [{ source: "/embed", destination: "/usuarios/registro" }];
  },
};

export default nextConfig;
