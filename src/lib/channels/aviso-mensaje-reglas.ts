/**
 * Reglas puras del aviso por correo «alguien escribió por WhatsApp, Messenger
 * o Instagram» (clave notify_channel_new_message). Sin dependencias para poder
 * probarlas sueltas (tests/canales/aviso-mensaje.test.mjs).
 */

/** Horas sin que la persona escriba para que un mensaje nuevo vuelva a avisar. */
export const HORAS_PARA_VOLVER_A_AVISAR = 6;

/** Canales que avisan, con su nombre para el correo. */
export const NOMBRE_DE_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  facebook: "Messenger",
  instagram: "Instagram",
};

/** `nueva`: primer mensaje de la persona. `regreso`: volvió a escribir tras 6+ horas. */
export type MotivoDeAviso = "nueva" | "regreso";

/**
 * ¿Este mensaje merece correo? Solo los que escribe el cliente (entrantes) en
 * un canal de Meta, y solo si es el primero de la conversación o si el
 * anterior del cliente fue hace más de 6 horas. Un chat activo no avisa en
 * cada mensaje.
 */
export function motivoDeAviso(m: {
  direction: string;
  channel: string;
  /** Cuándo llegó este mensaje. */
  createdAt: string | Date;
  /** El mensaje entrante anterior de la misma conversación (null = no hay). */
  entranteAnteriorAt: string | Date | null;
}): MotivoDeAviso | null {
  if (m.direction !== "in") return null;
  if (!NOMBRE_DE_CANAL[m.channel]) return null;
  if (!m.entranteAnteriorAt) return "nueva";
  const ahora = new Date(m.createdAt).getTime();
  const antes = new Date(m.entranteAnteriorAt).getTime();
  if (Number.isNaN(ahora) || Number.isNaN(antes)) return null;
  return ahora - antes > HORAS_PARA_VOLVER_A_AVISAR * 3600_000 ? "regreso" : null;
}

/** El texto del cliente va escapado: nunca se pinta HTML que no escribimos. */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Recorta a `max` caracteres (sin partir emojis ni acentos compuestos a la mitad). */
function recortar(s: string, max: number): string {
  const chars = Array.from(s.trim());
  return chars.length > max ? `${chars.slice(0, max).join("").trimEnd()}…` : chars.join("");
}

/** Asunto y cuerpo del correo. */
export function correoDeAviso(d: {
  motivo: MotivoDeAviso;
  channel: string;
  displayName: string | null;
  /** Teléfono (WhatsApp) o usuario, si se tiene. */
  contacto: string | null;
  texto: string;
  /** «Llegó por anuncio · titular», si la conversación trae atribución. */
  anuncio: string | null;
  url: string;
}): { asunto: string; html: string } {
  const canal = NOMBRE_DE_CANAL[d.channel] ?? d.channel;
  const quien = d.displayName?.trim() || d.contacto?.trim() || "Alguien";
  const asunto =
    d.motivo === "nueva"
      ? `Nuevo mensaje por ${canal}: ${recortar(quien, 60)}`
      : `${recortar(quien, 60)} volvió a escribir por ${canal}`;

  const renglones = [
    `<p><b>${d.motivo === "nueva" ? "Mensaje nuevo" : "Volvió a escribir"}</b> por ${escaparHtml(canal)}.</p>`,
    `<p><b>De:</b> ${escaparHtml(quien)}${
      d.contacto && d.contacto !== quien ? ` (${escaparHtml(d.contacto)})` : ""
    }</p>`,
    d.anuncio ? `<p><b>Origen:</b> ${escaparHtml(d.anuncio)}</p>` : "",
    `<p><b>Mensaje:</b> «${escaparHtml(recortar(d.texto, 200))}»</p>`,
    `<p><a href="${escaparHtml(d.url)}" style="color:#0E8377">Abrir la conversación en el portal de ventas</a></p>`,
  ];
  return { asunto, html: renglones.filter(Boolean).join("\n") };
}
