/**
 * Cuánto pesan los documentos que viajan DENTRO de una Server Action
 * (1-sep-2026).
 *
 * POR QUÉ EXISTE. El alta de embajador y la de centro mandan la INE —y la
 * constancia de RFC— como data URL en el cuerpo de la acción, porque el bucket
 * es privado y la cuenta no existe todavía. Ese cuerpo tiene DOS topes, y el
 * que manda no es el nuestro:
 *
 *   · Next.js  → `experimental.serverActions.bodySizeLimit`, hoy en 6 MB.
 *   · Vercel   → **4.5 MB por petición**, y ese corta ANTES. No se configura.
 *
 * Cuando se pasa, la petición muere con un 413 que el navegador no puede leer:
 * el formulario solo ve que algo falló y enseña «Algo salió mal». Eso fue lo
 * que tuvo semanas atorado al equipo sin poder decir qué pasaba.
 *
 * Así que el peso se revisa ANTES de enviar y se dice con nombre y apellido.
 *
 * SE MIDE LA CADENA, no los bytes del archivo: lo que viaja es el data URL en
 * base64, que abulta ~33% más que el archivo original. Medir el archivo daría
 * un número optimista y volveríamos a tronar.
 */

/**
 * Tope del envío completo. Se deja margen contra los 4.5 MB de Vercel para el
 * resto del formulario —nombre, redes, domicilio, sucursales— que también viaja
 * en la misma petición.
 */
export const PESO_TOTAL_MAX = 3.6 * 1024 * 1024;

/** Lo que ocupa un data URL al viajar. */
export function pesoDeDataUrl(dataUrl: string | null | undefined): number {
  return dataUrl ? dataUrl.length : 0;
}

export function pesoTotal(documentos: (string | null | undefined)[]): number {
  return documentos.reduce<number>((s, d) => s + pesoDeDataUrl(d), 0);
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/**
 * ¿Caben los documentos? Si no, devuelve un mensaje que dice cuánto pesan,
 * cuánto cabe y QUÉ HACER — que es lo que faltaba.
 */
export function revisarPeso(documentos: (string | null | undefined)[]): {
  ok: boolean;
  mensaje: string | null;
} {
  const total = pesoTotal(documentos);
  if (total <= PESO_TOTAL_MAX) return { ok: true, mensaje: null };
  return {
    ok: false,
    mensaje:
      `Tus documentos pesan ${mb(total)} MB juntos y el máximo son ${mb(PESO_TOTAL_MAX)} MB. ` +
      `Si subiste un PDF, prueba con una FOTO de tu identificación: pesa mucho menos y se ve igual de bien.`,
  };
}
