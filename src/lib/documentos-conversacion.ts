import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Adjuntos de los hilos con el comité (peludo y reintegro), 19-ago.
 *
 * El bucket `conversacion-documentos` es PRIVADO: una liga
 * `/object/public/...` da 400 al abrirla. Se guarda la RUTA y quien pinta el
 * hilo firma en el momento, igual que con la INE del embajador.
 *
 * POR QUÉ SE FIRMA CON EL SERVICE ROLE Y NO DESDE EL NAVEGADOR. Adjuntan las
 * dos partes, y cada quien sube a la carpeta con su propio id. Si el miembro
 * intentara leer directo lo que subió el comité, la política de Storage se lo
 * negaría —no es su carpeta ni es admin— y el adjunto del comité se vería roto.
 * Firmando del lado del servidor, cada página entrega ligas de lo que ya
 * consultó: el hilo de SU peludo o de SU reintegro.
 */

export const BUCKET_CONVERSACION = "conversacion-documentos";

/** Lo que se guarda en la columna `documents` de los dos hilos. */
export type AdjuntoConversacion = {
  path: string;
  name: string;
  type: string;
};

/** Un adjunto ya listo para pintar, con su liga temporal. */
export type AdjuntoFirmado = AdjuntoConversacion & { url: string | null };

/** Descarta lo que no tenga forma de adjunto (la columna es jsonb libre). */
export function leerAdjuntos(valor: unknown): AdjuntoConversacion[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((d) => {
    if (!d || typeof d !== "object") return [];
    const { path, name, type } = d as Record<string, unknown>;
    if (typeof path !== "string" || !path) return [];
    return [
      {
        path,
        name: typeof name === "string" && name ? name : "documento",
        type: typeof type === "string" ? type : "",
      },
    ];
  });
}

/**
 * Firma los adjuntos de varios mensajes de una vez y devuelve un mapa
 * `id del mensaje → adjuntos con liga`.
 *
 * De una sola pasada porque un hilo con seis mensajes haría seis viajes a
 * Storage si cada tarjeta firmara lo suyo. Una liga que no se pueda firmar
 * viaja con `url: null` y se pinta sin liga — nunca tumba el hilo.
 */
export async function firmarAdjuntosDeHilo<
  T extends { id: string; documents?: unknown },
>(mensajes: T[]): Promise<Map<string, AdjuntoFirmado[]>> {
  const mapa = new Map<string, AdjuntoFirmado[]>();
  const conAdjuntos = mensajes
    .map((m) => ({ id: m.id, docs: leerAdjuntos(m.documents) }))
    .filter((m) => m.docs.length > 0);
  if (!conAdjuntos.length) return mapa;

  const storage = createAdminClient().storage.from(BUCKET_CONVERSACION);
  for (const { id, docs } of conAdjuntos) {
    const firmados = await Promise.all(
      docs.map(async (d) => {
        const { data } = await storage.createSignedUrl(d.path, 3600);
        return { ...d, url: data?.signedUrl ?? null };
      }),
    );
    mapa.set(id, firmados);
  }
  return mapa;
}

/**
 * Deja pasar solo lo que se puede guardar: hasta 5 adjuntos, con ruta dentro
 * del bucket. Se usa en las cuatro acciones que escriben en un hilo, para que
 * nadie meta una ruta arbitraria por la Server Action.
 */
export const ADJUNTOS_MAX = 5;

export function sanearAdjuntos(entrada: unknown): AdjuntoConversacion[] {
  return leerAdjuntos(entrada)
    .filter((d) => !d.path.includes("..") && !d.path.startsWith("/"))
    .slice(0, ADJUNTOS_MAX);
}
