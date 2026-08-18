/**
 * BLOQUES TIPADOS — sección 5, punto 3.2.
 *
 * El agente de marca NO escribe HTML. Llena bloques con campos conocidos y la
 * plataforma los renderiza con el layout de la plantilla. Dos razones:
 *
 *  - Un correo armado con HTML libre se rompe en cuanto lo abre Outlook. Con
 *    bloques, el HTML lo genera siempre el mismo código probado.
 *  - Se puede editar un bloque a mano sin pelearse con etiquetas, y cambiar de
 *    plantilla sin perder el contenido.
 *
 * Agregar un tipo de bloque es una entrada aquí y su render. El agente recibe
 * este catálogo como esquema, así que no puede inventarse uno.
 */

export type Bloque =
  | { tipo: "encabezado"; texto: string }
  | { tipo: "texto"; texto: string }
  | { tipo: "imagen"; url: string; alt: string; pie?: string }
  | { tipo: "consejo"; titulo: string; texto: string }
  | { tipo: "promocion"; titulo: string; texto: string; codigo?: string }
  | { tipo: "cta"; texto: string; etiquetaBoton: string; url: string }
  | { tipo: "cierre"; texto: string };

export const TIPOS_DE_BLOQUE = [
  "encabezado",
  "texto",
  "imagen",
  "consejo",
  "promocion",
  "cta",
  "cierre",
] as const;

/** Etiquetas legibles para la pantalla. */
export const ETIQUETA_BLOQUE: Record<string, string> = {
  encabezado: "Encabezado",
  texto: "Párrafo",
  imagen: "Imagen",
  consejo: "Tarjeta de consejo",
  promocion: "Promoción",
  cta: "Llamada a la acción",
  cierre: "Cierre",
};

/**
 * Esquema JSON de un bloque, para pasárselo al agente. Se arma aquí y no a
 * mano en el prompt para que catálogo y esquema no se separen nunca.
 */
export const ESQUEMA_BLOQUES = {
  type: "object",
  properties: {
    asunto: { type: "string", description: "Asunto del correo, máximo 60 caracteres." },
    preencabezado: {
      type: "string",
      description: "Texto de vista previa que se ve junto al asunto, máximo 100 caracteres.",
    },
    bloques: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: [...TIPOS_DE_BLOQUE] },
          texto: { type: "string" },
          titulo: { type: "string" },
          url: { type: "string" },
          alt: { type: "string" },
          pie: { type: "string" },
          codigo: { type: "string" },
          etiquetaBoton: { type: "string" },
        },
        required: ["tipo"],
      },
    },
  },
  required: ["asunto", "preencabezado", "bloques"],
} as const;

/** Escapa lo que va a salir dentro del HTML del correo. */
function esc(s: string | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Quita lo que no reconocemos y normaliza lo que sí.
 *
 * Un bloque de un tipo desconocido, o al que le falta su campo obligatorio, se
 * descarta en lugar de renderizarse a medias: un correo con un hueco raro es
 * peor que uno más corto.
 */
export function normalizarBloques(crudos: unknown): Bloque[] {
  if (!Array.isArray(crudos)) return [];
  const salida: Bloque[] = [];

  for (const b of crudos) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const tipo = String(o.tipo ?? "");
    const txt = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");

    switch (tipo) {
      case "encabezado":
      case "texto":
      case "cierre":
        if (txt("texto")) salida.push({ tipo, texto: txt("texto") } as Bloque);
        break;
      case "imagen":
        // Sin URL no hay imagen; sin alt, el correo es inaccesible.
        if (txt("url"))
          salida.push({
            tipo: "imagen",
            url: txt("url"),
            alt: txt("alt") || "Imagen del boletín",
            pie: txt("pie") || undefined,
          });
        break;
      case "consejo":
        if (txt("texto"))
          salida.push({ tipo: "consejo", titulo: txt("titulo") || "Consejo", texto: txt("texto") });
        break;
      case "promocion":
        if (txt("texto"))
          salida.push({
            tipo: "promocion",
            titulo: txt("titulo") || "Promoción",
            texto: txt("texto"),
            codigo: txt("codigo") || undefined,
          });
        break;
      case "cta":
        if (txt("url") && txt("etiquetaBoton"))
          salida.push({
            tipo: "cta",
            texto: txt("texto"),
            etiquetaBoton: txt("etiquetaBoton"),
            url: txt("url"),
          });
        break;
      default:
        // Tipo que no existe: se ignora en silencio a propósito. El agente
        // recibe el catálogo como esquema, así que llegar aquí es raro.
        break;
    }
  }
  return salida;
}

/** El HTML de un bloque. Tablas y estilos en línea: es lo que sobrevive en Outlook. */
function renderBloque(b: Bloque): string {
  switch (b.tipo) {
    case "encabezado":
      return `<tr><td style="padding:22px 32px 6px;"><h2 style="margin:0;font-size:21px;line-height:1.3;color:#1E5350;">${esc(b.texto)}</h2></td></tr>`;
    case "texto":
      return `<tr><td style="padding:8px 32px;"><p style="margin:0;font-size:15px;line-height:1.65;color:#3D524F;">${esc(b.texto).replace(/\n/g, "<br>")}</p></td></tr>`;
    case "imagen":
      return `<tr><td style="padding:14px 32px;">
        <img src="${esc(b.url)}" alt="${esc(b.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border-radius:14px;">
        ${b.pie ? `<p style="margin:6px 0 0;font-size:12px;color:#8A9490;">${esc(b.pie)}</p>` : ""}
      </td></tr>`;
    case "consejo":
      return `<tr><td style="padding:12px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F1;border-radius:16px;">
          <tr><td style="padding:18px 22px;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#1E5350;">🐾 ${esc(b.titulo)}</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#3D524F;">${esc(b.texto)}</p>
          </td></tr>
        </table></td></tr>`;
    case "promocion":
      return `<tr><td style="padding:12px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#E8F7F5;border-radius:16px;">
          <tr><td style="padding:18px 22px;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#1E5350;">${esc(b.titulo)}</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#3D524F;">${esc(b.texto)}</p>
            ${b.codigo ? `<p style="margin:10px 0 0;font-size:16px;font-weight:bold;letter-spacing:1px;color:#1E5350;">${esc(b.codigo)}</p>` : ""}
          </td></tr>
        </table></td></tr>`;
    case "cta":
      return `<tr><td style="padding:22px 32px;text-align:center;">
        ${b.texto ? `<p style="margin:0 0 12px;font-size:15px;color:#3D524F;">${esc(b.texto)}</p>` : ""}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr><td style="background-color:#1E5350;border-radius:999px;">
            <a href="${esc(b.url)}" style="display:inline-block;padding:14px 34px;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${esc(b.etiquetaBoton)}</a>
          </td></tr>
        </table></td></tr>`;
    case "cierre":
      return `<tr><td style="padding:10px 32px 26px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#6B7C79;">${esc(b.texto)}</p></td></tr>`;
  }
}

/**
 * Arma el correo: los bloques dentro del layout de la plantilla.
 *
 * El layout es un HTML con `{{bloques}}` y, opcionalmente, `{{asunto}}`,
 * `{{preencabezado}}` y `{{baja}}`. Si la plantilla no trae el enlace de baja,
 * se agrega igual al final: un boletín sin forma de darse de baja no se manda.
 */
export function renderCorreo(input: {
  layout: string;
  asunto: string;
  preencabezado: string;
  bloques: Bloque[];
  /** Marcador que el envío sustituye por el enlace real de cada persona. */
  enlaceBaja: string;
}): string {
  const cuerpo = input.bloques.map(renderBloque).join("\n");
  const pieBaja = `<tr><td style="padding:18px 32px;text-align:center;">
    <p style="margin:0;font-size:11.5px;line-height:1.6;color:#8A9490;">
      Recibes este correo porque te suscribiste al boletín de Club Pata Amiga.<br>
      <a href="${input.enlaceBaja}" style="color:#8A9490;text-decoration:underline;">Darme de baja</a>
    </p></td></tr>`;

  let html = input.layout
    .replace(/\{\{\s*bloques\s*\}\}/g, cuerpo)
    .replace(/\{\{\s*asunto\s*\}\}/g, esc(input.asunto))
    .replace(/\{\{\s*preencabezado\s*\}\}/g, esc(input.preencabezado));

  // `{{baja}}` marca DÓNDE va el pie con el enlace de baja, no el enlace suelto.
  if (/\{\{\s*baja\s*\}\}/.test(html)) {
    html = html.replace(/\{\{\s*baja\s*\}\}/g, pieBaja);
  } else {
    // La plantilla no previó la baja: se añade igual. Un boletín sin forma de
    // darse de baja no se manda.
    html += pieBaja;
  }
  return html;
}

/** Layout de arranque, para que exista una plantilla desde el primer día. */
export const LAYOUT_POR_OMISION = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F1;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:20px;">
      <tr><td style="background-color:#1CBCAD;border-radius:20px 20px 0 0;padding:22px 32px;text-align:center;">
        <p style="margin:0;font-size:18px;font-weight:bold;color:#FFFFFF;">Club Pata Amiga</p>
        <p style="margin:4px 0 0;font-size:12.5px;color:#E8F7F5;">{{preencabezado}}</p>
      </td></tr>
      {{bloques}}
      <tr><td style="background-color:#1E5350;border-radius:0 0 20px 20px;padding:20px 32px;text-align:center;">
        <p style="margin:0;font-size:12.5px;color:#BFD9D6;">El mejor cuidado para tu manada · Hecho con ♡ en México</p>
      </td></tr>
      {{baja}}
    </table>
  </td></tr>
</table>`;
