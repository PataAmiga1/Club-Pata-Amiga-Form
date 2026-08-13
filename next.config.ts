import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root — a stray lockfile in the user home dir
    // otherwise makes Next infer the wrong root.
    root: __dirname,
  },
  experimental: {
    // Las fotos de INE del registro de embajador viajan DENTRO de la Server
    // Action: el bucket es privado y la cuenta todavía no existe cuando se
    // piden, así que no hay a qué carpeta subirlas desde el navegador. Ya van
    // comprimidas a ~200-350 KB, pero el tope por omisión es 1 MB y dos fotos
    // en base64 se le acercan demasiado.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
