/**
 * Presentación de los textos legales.
 *
 * Los documentos se guardan VERBATIM como los entregó el despacho (ver
 * `src/data/legal-texts.ts`) y no se tocan sin su visto bueno. Pero vienen
 * convertidos de PDF y arrastran "##" al inicio de algunas líneas: unas veces
 * es un título de capítulo, otras es la continuación de la línea anterior
 * ("Lic. Rodrigo / ## González Quiroz.", "C.P. / ## 54900."). En pantalla se
 * leían tal cual, con los gatos incluidos (captura del equipo, 13-ago).
 *
 * Por eso la limpieza vive AQUÍ, al pintar: el archivo legal queda intacto y
 * el día que llegue una versión corregida del despacho esto deja de hacer
 * nada solo.
 */
export function limpiarMarcasLegales(texto: string): string {
  return texto.replace(/^#{1,6}\s+/gm, "");
}
