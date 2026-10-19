/**
 * Etiquetas legibles para lo que llega por un canal y no es texto: una foto, una
 * nota de voz, un documento… Van entre corchetes en channel_messages.content
 * («[Nota de voz]», «[Documento: receta.pdf] aquí está») para que la bandeja y el
 * agente sepan qué llegó. El prompt de ventas las enumera (regla 4), así que el
 * texto de cada una importa: es el MISMO para el webhook directo de Meta y
 * para Flowly, y vive solo aquí.
 *
 * Sin emojis a propósito (no se recolorean y el agente los repetiría).
 * Sin dependencias: lo importan meta.ts y flowly/mapeo.ts, y las pruebas con
 * node --test.
 */

export const ETIQUETA = {
  imagen: "[Imagen]",
  sticker: "[Sticker]",
  notaDeVoz: "[Nota de voz]",
  audio: "[Audio]",
  video: "[Video]",
  documento: "[Documento]",
  ubicacion: "[Ubicación]",
  contacto: "[Contacto compartido]",
  boton: "[Botón]",
  reel: "[Reel compartido]",
  mencionHistoria: "[Te mencionó en su historia]",
  publicacion: "[Publicación compartida]",
  adjunto: "[Adjunto]",
  noSePuedeMostrar: "[Mensaje que no se puede mostrar]",
} as const;

/** Quita lo vacío y une con espacio: «[Imagen] mira esto». */
export function unir(...partes: (string | null | undefined)[]): string {
  return partes
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
}

/** «[Documento: receta.pdf]» o «[Documento]». */
export function etiquetaDocumento(nombre?: string | null): string {
  const n = typeof nombre === "string" ? nombre.trim() : "";
  return n ? `[Documento: ${n}]` : ETIQUETA.documento;
}

/** «[Ubicación: Veterinaria Sur, Av. X 12]» o «[Ubicación]». */
export function etiquetaUbicacion(nombre?: string, direccion?: string): string {
  const detalle = unir(nombre, direccion && direccion !== nombre ? direccion : undefined);
  return detalle ? `[Ubicación: ${detalle}]` : ETIQUETA.ubicacion;
}

/** «[Contacto compartido: Ana, Luis]» o «[Contacto compartido]». */
export function etiquetaContactos(nombres: string[]): string {
  return nombres.length ? `[Contacto compartido: ${nombres.join(", ")}]` : ETIQUETA.contacto;
}

/**
 * Etiqueta por tipo de archivo genérico (image, audio, video, document,
 * sticker, file) —los tipos que normaliza Flowly—. `voz: false` distingue un
 * archivo de audio de una nota de voz cuando el canal lo dice.
 */
export function etiquetaPorTipo(
  tipo: string,
  extra: { nombre?: string | null; voz?: boolean } = {},
): string {
  switch (tipo) {
    case "image":
      return ETIQUETA.imagen;
    case "sticker":
      return ETIQUETA.sticker;
    case "audio":
      return extra.voz === false ? ETIQUETA.audio : ETIQUETA.notaDeVoz;
    case "video":
      return ETIQUETA.video;
    case "document":
    case "file":
      return etiquetaDocumento(extra.nombre);
    case "location":
      return ETIQUETA.ubicacion;
    default:
      return ETIQUETA.noSePuedeMostrar;
  }
}
