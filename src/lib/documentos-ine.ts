import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Guardado de las fotos de INE que llegan desde un formulario.
 *
 * El bucket `ine-documents` es PRIVADO y sus políticas exigen sesión con la
 * primera carpeta igual al id del usuario. En el registro de embajador no hay
 * sesión todavía —la cuenta se crea en el mismo paso—, así que la subida la
 * hace el servidor con el cliente admin, que se salta RLS, ya sabiendo a qué
 * carpeta va.
 *
 * SE GUARDA LA RUTA, NO UNA URL. El bucket es privado: una liga
 * `/object/public/...` da 400 al abrirla. Quien las muestre (el panel de
 * admin) firma la ruta en el momento. Las 18 filas heredadas de la plataforma
 * anterior sí traen URL completa, y por eso `rutaDeIne` sabe leer las dos
 * formas.
 */

const BUCKET = "ine-documents";
const PESO_MAX = 8 * 1024 * 1024;

export type LadoIne = "ine_front" | "ine_back";

/** ¿Es un data URL de imagen utilizable? */
export function esFotoValida(dataUrl: string | null | undefined): boolean {
  return Boolean(dataUrl && /^data:image\/(jpeg|jpg|png|webp);base64,/.test(dataUrl));
}

/**
 * Sube una foto y devuelve su ruta dentro del bucket.
 * Devuelve null si la foto no sirve o si Storage la rechaza — nunca lanza:
 * un fallo aquí no debe tumbar el alta de un embajador.
 */
export async function guardarFotoIne(
  userId: string,
  lado: LadoIne,
  dataUrl: string,
): Promise<string | null> {
  if (!esFotoValida(dataUrl)) return null;
  const [cabecera, base64] = dataUrl.split(",", 2);
  if (!base64) return null;
  const mime = cabecera.slice(5, cabecera.indexOf(";"));
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > PESO_MAX) return null;

  const extension = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const ruta = `${userId}/${lado}-${Date.now()}.${extension}`;
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(ruta, bytes, { contentType: mime, upsert: false });
  if (error) {
    console.error(`INE ${lado} no se pudo guardar`, error);
    return null;
  }
  return ruta;
}

/**
 * Ruta dentro del bucket a partir de lo que haya en la columna: puede ser ya
 * una ruta (lo que guardamos desde el 13-ago) o una URL completa de la
 * plataforma anterior.
 */
export function rutaDeIne(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.trim();
  if (!limpio) return null;
  const marca = `/${BUCKET}/`;
  const corte = limpio.indexOf(marca);
  return corte === -1 ? limpio : limpio.slice(corte + marca.length);
}

/** Liga temporal para que el comité abra el documento (1 hora). */
export async function ligaFirmadaDeIne(
  valor: string | null | undefined,
): Promise<string | null> {
  const ruta = rutaDeIne(valor);
  if (!ruta) return null;
  const { data } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(ruta, 3600);
  return data?.signedUrl ?? null;
}
