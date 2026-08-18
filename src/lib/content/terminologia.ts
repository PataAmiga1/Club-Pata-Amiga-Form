/**
 * TERMINOLOGÍA VINCULANTE — la validación que nadie puede saltar.
 *
 * Pata Amiga es una membresía de salud, NO un seguro. Las palabras del mundo
 * asegurador (póliza, cobertura, carencia, siniestro…) no son un detalle de
 * estilo: usarlas en una publicación es un problema legal, porque describen un
 * producto regulado que esto no es. Por eso la spec de la sección 4 deja esta
 * revisión fuera del alcance de cualquier "saltar validación", incluso de un
 * super admin.
 *
 * DOS SUTILEZAS que salieron al escribirlo, y que explican por qué esto no es
 * un simple `includes()`:
 *
 *  1. "No es un seguro" es copy APROBADO y aparece en la landing y en los
 *     correos. Prohibir la palabra a secas bloquearía justo el descargo que la
 *     marca sí quiere decir. Por eso hay una lista de frases permitidas que se
 *     retiran del texto ANTES de buscar.
 *
 *  2. "Seguro" también es adjetivo ("un lugar seguro", "estamos seguros").
 *     Solo se marca cuando funciona como SUSTANTIVO — con artículo delante o
 *     seguido de "de" —, que es cuando nombra el producto regulado.
 *
 * Vive en su propia librería, sin dependencias, para que mañana la puedan
 * reutilizar el boletín y los agentes IA.
 */

export type HallazgoTerminologia = {
  /** El texto tal como aparece. */
  encontrado: string;
  /** Qué decir en su lugar. */
  enLugarDe: string;
  /** Posición aproximada, para señalarla. */
  indice: number;
};

/**
 * Frases donde la palabra prohibida es legítima: el descargo de marca.
 * Se retiran del texto antes de buscar.
 */
const FRASES_PERMITIDAS = [
  "no es un seguro",
  "no somos un seguro",
  "no es una aseguradora",
  "no somos una aseguradora",
  "esto no es un seguro",
  "no se trata de un seguro",
];

/**
 * Cada regla: qué patrón delata la palabra y con qué se reemplaza.
 * Los patrones se aplican sobre el texto ya normalizado (minúsculas, sin
 * acentos), así que se escriben sin acentos a propósito.
 */
const REGLAS: { patron: RegExp; etiqueta: string; enLugarDe: string }[] = [
  {
    // Solo como sustantivo: con determinante delante o seguido de "de".
    patron:
      /\b(?:un|una|el|la|los|las|tu|su|mi|nuestro|nuestra|este|esta|ese|esa|del|al)\s+seguros?\b|\bseguros?\s+de\s+(?:gastos|salud|mascotas|vida|animales)\b/g,
    etiqueta: "seguro",
    enLugarDe: "membresía de salud",
  },
  { patron: /\bpoliza(?:s)?\b/g, etiqueta: "póliza", enLugarDe: "membresía" },
  {
    patron: /\bcobertura(?:s)?\b/g,
    etiqueta: "cobertura",
    enLugarDe: "beneficios de la membresía",
  },
  {
    patron: /\bcarencia(?:s)?\b/g,
    etiqueta: "carencia",
    enLugarDe: "tiempo de espera",
  },
  {
    patron: /\bfondo\s+solidario\b/g,
    etiqueta: "fondo solidario",
    enLugarDe: "reintegro",
  },
  {
    patron: /\b(?:apoyo|respaldo)\s+economico\b/g,
    etiqueta: "apoyo/respaldo económico",
    enLugarDe: "reintegro",
  },
  {
    patron: /\basegurad(?:o|a|os|as)\b|\baseguradora(?:s)?\b/g,
    etiqueta: "asegurado/aseguradora",
    enLugarDe: "miembro / Club Pata Amiga",
  },
  { patron: /\bsiniestro(?:s)?\b/g, etiqueta: "siniestro", enLugarDe: "solicitud de reintegro" },
  { patron: /\bdeducible(?:s)?\b/g, etiqueta: "deducible", enLugarDe: "tope de reintegro" },
  { patron: /\bprima(?:s)?\s+(?:mensual|anual|del seguro)\b/g, etiqueta: "prima", enLugarDe: "precio de la membresía" },
  {
    // El bot orienta; no consulta ni diagnostica.
    patron:
      /\b(?:consulta|diagnostico|diagnostica|diagnosticar)\s+(?:veterinari[ao]\s+)?(?:por|via|en el)\s+chat\b/g,
    etiqueta: "consulta/diagnóstico por chat",
    enLugarDe: "orientación veterinaria 24/7",
  },
  {
    // "Cobertura" ya la atrapa su propia regla; aquí van solo los verbos.
    patron: /\bcubrimos\b|\bte\s+cubre\b|\blo\s+cubre\b/g,
    etiqueta: "cubrir",
    enLugarDe: "reintegramos",
  },
];

/**
 * Minúsculas y sin acentos, CARÁCTER POR CARÁCTER.
 *
 * Se normaliza uno a uno a propósito: `normalize("NFD")` sobre el texto entero
 * separa los acentos y al quitarlos ACORTA la cadena, con lo que los índices
 * dejarían de coincidir con el original y se señalaría la palabra equivocada.
 * Con emojis (que abundan en redes) el desfase sería aún peor.
 *
 * Si un carácter no sobrevive la conversión con la misma longitud, se deja
 * como estaba: preferimos no encontrar una palabra a señalar mal otra.
 */
function normalizar(texto: string) {
  let salida = "";
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    const sinAcento = ch.normalize("NFD").replace(/\p{M}/gu, "");
    const bajo = (sinAcento.length === 1 ? sinAcento : ch).toLowerCase();
    salida += bajo.length === 1 ? bajo : ch;
  }
  return salida;
}

/**
 * Revisa un copy contra la terminología vinculante.
 *
 * Devuelve la lista vacía si está limpio. Nunca lanza: un error aquí no debe
 * dejar pasar un texto, así que ante cualquier problema se comporta como si
 * hubiera encontrado algo (lo maneja quien llama).
 */
export function revisarTerminologia(texto: string): HallazgoTerminologia[] {
  if (!texto) return [];

  let base = normalizar(texto);

  // Se retiran los descargos aprobados para que no se marquen a sí mismos.
  // Se sustituyen por espacios (no se borran) para no mover los índices.
  for (const frase of FRASES_PERMITIDAS) {
    const permitida = normalizar(frase);
    let desde = base.indexOf(permitida);
    while (desde !== -1) {
      base =
        base.slice(0, desde) + " ".repeat(permitida.length) + base.slice(desde + permitida.length);
      desde = base.indexOf(permitida, desde + permitida.length);
    }
  }

  const hallazgos: HallazgoTerminologia[] = [];
  for (const regla of REGLAS) {
    const patron = new RegExp(regla.patron.source, regla.patron.flags);
    let m: RegExpExecArray | null;
    while ((m = patron.exec(base)) !== null) {
      hallazgos.push({
        // Se devuelve el texto ORIGINAL del tramo, con sus acentos y mayúsculas,
        // para que la persona lo reconozca en su copy.
        encontrado: texto.slice(m.index, m.index + m[0].length).trim(),
        enLugarDe: regla.enLugarDe,
        indice: m.index,
      });
      if (m[0].length === 0) patron.lastIndex++; // seguro contra patrones vacíos
    }
  }

  return hallazgos.sort((a, b) => a.indice - b.indice);
}

/**
 * Reclamos de salud: promesas clínicas o consejo veterinario.
 *
 * A diferencia de la terminología, esto SÍ lo puede saltar un super admin
 * dejando constancia: hay frases legítimas que caen aquí ("pregúntale a tu
 * veterinario") y quien redacta necesita poder argumentarlo.
 */
export function revisarReclamosDeSalud(texto: string): string[] {
  const base = normalizar(texto);
  const avisos: string[] = [];

  const patrones: { patron: RegExp; aviso: string }[] = [
    {
      patron: /\b(?:cura|curamos|curar|sana|sanamos|garantiza(?:mos)?|100%\s+efectiv)/,
      aviso: "Promete un resultado clínico. La membresía no cura ni garantiza nada.",
    },
    {
      patron: /\b(?:receta|recetamos|dosis|medicament\w*\s+(?:recomendad|indicad))/,
      aviso: "Parece indicación de tratamiento. Quien receta es el veterinario, no la marca.",
    },
    {
      patron: /\b(?:diagnostic\w+)\b/,
      aviso: "Habla de diagnóstico. El bot orienta; no diagnostica.",
    },
    {
      patron: /\b(?:previene|prevenimos|evita)\s+(?:enfermedad|cancer|parasit)/,
      aviso: "Promete prevención de una enfermedad concreta.",
    },
  ];

  for (const p of patrones) if (p.patron.test(base)) avisos.push(p.aviso);
  return avisos;
}
