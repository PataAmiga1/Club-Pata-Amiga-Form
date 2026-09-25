/**
 * Registro de landings de campaña (ads / patrocinadores).
 *
 * Cada landing vive en /landings/<slug> — para crear una nueva basta con
 * agregar una entrada aquí: la página, el CRM (/admin/landings), el correo
 * de regalo, el cupón y el PDF quedan conectados automáticamente.
 *
 * Por campaña, el equipo gestiona desde Admin → Landings (sin código):
 *  - La palabra cupón      → site_settings, clave campaignCouponKey(slug)
 *  - El PDF del regalo     → site_assets,   slot  campaignPdfSlot(slug)
 */

export type Campaign = {
  slug: string;
  /** Nombre interno para el CRM. */
  name: string;
  /** Si está inactiva, la landing responde 404 y deja de captar leads. */
  active: boolean;
  /**
   * `regalo`: manda el correo con cupón y PDF (lo de siempre).
   * `lista_espera`: solo apunta a la persona y le confirma por correo; sin
   * cupón ni PDF. Nació el 17-sep-2026 para el registro cerrado.
   * `guia`: manda solo el PDF (sin cupón) y deja descargarlo en la misma
   * pantalla al terminar. Nació el 19-sep-2026 para el stand de ExpoCan.
   * `encuesta`: hace preguntas y guarda las respuestas junto al registro. Nació
   * el 24-sep-2026 para consultar a los embajadores antes de publicar la
   * escalera de niveles, en una página de la marca y no en un formulario ajeno.
   */
  tipo: "regalo" | "lista_espera" | "guia" | "encuesta";
  /**
   * Qué se pregunta además de nombre, correo y teléfono. Sin nada: nombre y
   * apellidos, como siempre. ExpoCan pidió nombre, edad, correo y teléfono.
   */
  campos?: {
    apellidos?: boolean;
    edad?: boolean;
    /** El @ de redes. En la encuesta de embajadores es la identidad principal. */
    handle?: boolean;
    /** El correo se puede volver opcional (encuesta por DM de Instagram). */
    correo?: boolean;
  };
  /** Texto del botón para descargar el PDF (en la página y en el correo). */
  pdfLabel?: string;
  /** Preguntas, solo en las landings de encuesta. */
  preguntas?: Pregunta[];
  /**
   * Lo que se explica ANTES de preguntar. En la consulta de la escalera es
   * imprescindible: para la mayoría de los embajadores es la primera vez que
   * ven el programa, y nadie opina bien de algo que no entiende.
   */
  explicacion?: Explicacion;
  /** Texto del botón de enviar, si el de siempre no encaja. */
  botonLabel?: string;
  /** Lo que se lee en la pantalla de «gracias». */
  gracias?: { titulo: string; texto: string };
  /** Copy de la página. */
  headline: string;
  subheadline: string;
  /** Lo que se promete al registrarse (bullets del regalo). */
  perks: { emoji: string; text: string }[];
  /** Asunto del correo de regalo. */
  emailSubject: string;
};

/**
 * Una pregunta de una landing de encuesta. `id` es la llave con la que se
 * guarda la respuesta y con la que sale en el CSV: no se cambia una vez que
 * alguien contestó, o las respuestas viejas dejan de cuadrar.
 */
export type Pregunta = {
  id: string;
  texto: string;
  /** Ayuda opcional debajo de la pregunta. */
  nota?: string;
  tipo: "opcion" | "abierta";
  /** Solo en `opcion`. */
  opciones?: string[];
  /** Solo en `opcion`: además de las opciones, deja escribir. */
  permiteOtro?: boolean;
  requerida?: boolean;
};

/** Cómo se explica un programa antes de preguntar por él. */
export type Explicacion = {
  titulo: string;
  intro: string;
  /** Los escalones, del más cercano al más lejano. */
  escalones: { meta: string; nivel: string; premio: string; extra?: string }[];
  /** Las reglas en corto, para que nadie suponga de más. */
  reglas: string[];
  /** Aviso final: esto todavía se puede cambiar, por eso preguntamos. */
  cierre?: string;
};

export const CAMPAIGNS: Campaign[] = [
  {
    slug: "regalo",
    name: "Regalo de bienvenida (patrocinador)",
    active: true,
    tipo: "regalo",
    headline: "Tu regalo para consentir a tu peludo 🎁",
    subheadline:
      "Regístrate gratis y recibe en tu correo un descuento para la membresía Club Pata Amiga y una guía de cuidado para tu peludo.",
    perks: [
      { emoji: "🏷️", text: "Cupón de descuento para tu membresía" },
      { emoji: "📘", text: "Guía de cuidado para tu peludo (PDF)" },
      { emoji: "💬", text: "Orientación veterinaria 24/7 al unirte a la manada" },
    ],
    emailSubject: "🎁 Obtén tu regalo — Club Pata Amiga",
  },
  {
    // A donde manda /registro mientras el registro está cerrado
    // (src/lib/registro.ts). Sin precios ni montos: la membresía nueva todavía
    // no tiene sus textos legales.
    slug: "nueva-membresia",
    name: "Lista de espera — nueva membresía",
    active: true,
    tipo: "lista_espera",
    headline: "La nueva membresía Pata Amiga llega muy pronto 🐾",
    subheadline:
      "Estamos preparando la nueva membresía para cuidar a tu peludo. Déjanos tus datos y te avisamos primero en cuanto abra el registro.",
    perks: [
      { emoji: "🔔", text: "Te avisamos antes que a nadie cuando abra" },
      { emoji: "🩺", text: "Mantienes a tu veterinario de confianza" },
      { emoji: "💬", text: "Orientación veterinaria 24/7 para la manada" },
    ],
    emailSubject: "🐾 Ya estás en la lista — Club Pata Amiga",
  },
  {
    // Stand de ExpoCan (19 al 21-sep-2026). Se llega por el QR del stand
    // (utm_source=expocan). Sin cupón, a petición del equipo.
    slug: "expocan",
    name: "ExpoCan 2026 — Mini Guía Interactiva",
    active: true,
    tipo: "guia",
    campos: { apellidos: false, edad: true },
    pdfLabel: "📘 Descargar la Mini Guía Interactiva",
    headline: "Tu Mini Guía Interactiva para cuidar a tu peludo 📘",
    subheadline:
      "Gracias por visitarnos en ExpoCan. Déjanos tus datos: te mandamos la guía a tu correo y también la puedes descargar al momento.",
    perks: [
      { emoji: "📘", text: "Mini Guía Interactiva de Pata Amiga (PDF)" },
      { emoji: "🩺", text: "Mantienes a tu veterinario de confianza" },
      { emoji: "💬", text: "Orientación veterinaria 24/7 para la manada" },
    ],
    emailSubject: "📘 Tu Mini Guía Interactiva — Club Pata Amiga",
  },
  {
    // Consulta a los embajadores antes de publicar la escalera de niveles
    // (equipo, 24-sep-2026). Se manda por DM con la liga personalizada
    // (?codigo=SUCODIGO&nombre=...) y las respuestas se exportan desde
    // Admin → Landings.
    slug: "embajadores-escalera",
    name: "Embajadores — consulta de la escalera de niveles",
    active: true,
    tipo: "encuesta",
    // Se manda por DM de Instagram: ahí la identidad es el @, no el correo
    // (equipo, 25-sep). El correo queda opcional para no perder respuestas.
    campos: { apellidos: false, handle: true, correo: false },
    botonLabel: "Enviar mis respuestas",
    headline: "Tu opinión, antes de publicarlo 🐾",
    subheadline:
      "En el desayuno nos dieron su opinión y la usamos: lo que más nos pidieron fue un beneficio para sus propias mascotas, no más comisión. Así quedó el programa. Antes de publicarlo, queremos que tú lo revises.",
    perks: [
      { emoji: "🎁", text: "Tu propia membresía entra como beneficio, no solo la comisión" },
      { emoji: "💰", text: "La comisión del 3% se mantiene sobre todo lo que paguen tus socios" },
      { emoji: "🎯", text: "Las metas se acercaron, para que el primer beneficio no quede lejos" },
    ],
    explicacion: {
      titulo: "Así quedaría el programa",
      intro:
        "Hoy ganas 3% de comisión cada mes sobre todo lo que paguen los socios que traigas. A eso le sumamos un beneficio para tu propia manada: entre más socios sostienes, menos pagas por tu membresía.",
      escalones: [
        {
          meta: "1 socio",
          nivel: "Aliado",
          premio: "Tu membresía a mitad de precio",
          extra: "Pagas $299 en lugar de $599",
        },
        {
          meta: "5 socios",
          nivel: "Embajador",
          premio: "Tu membresía gratis",
          extra: "Dejas de pagar · y tu nombre y tu historia en nuestras redes",
        },
        {
          meta: "12 socios",
          nivel: "Embajador Oro",
          premio: "Dos membresías gratis",
          extra: "Para dos de tus peludos",
        },
        {
          meta: "25 socios",
          nivel: "Círculo Fundador",
          premio: "Tres membresías gratis",
          extra: "Y voz en el catálogo de cuidados cada trimestre",
        },
      ],
      reglas: [
        "Un socio cuenta desde su primer pago con tu código — no desde que se registra.",
        "Si ese socio cancela, deja de contar.",
        "La comisión del 3% sigue igual, además del beneficio: son dos cosas distintas.",
        "Con 5 socios dejas de pagar tus $599 y además recibes alrededor de $90 al mes de comisión.",
      ],
      cierre:
        "Nada de esto está publicado todavía: por eso te preguntamos antes. Lo que nos digas puede cambiarlo.",
    },
    gracias: {
      titulo: "¡Gracias!",
      texto:
        "Tus respuestas llegaron. Las leemos el domingo y lo que nos digan se aplica el lunes — te avisamos en cuanto esté publicado.",
    },
    preguntas: [
      {
        id: "beneficio_preferido",
        texto: "¿Qué beneficio te movería más?",
        tipo: "opcion",
        opciones: [
          "Tu membresía gratis",
          "Una comisión más alta",
          "Producto y materiales de la marca",
          "Exposición en nuestras redes",
          "Participar en decisiones del producto",
        ],
        permiteOtro: true,
        requerida: true,
      },
      {
        id: "dinero_o_membresia",
        texto: "Entre dinero y membresía, ¿qué prefieres?",
        tipo: "opcion",
        opciones: ["Comisión en dinero", "Mi membresía gratis", "Las dos por igual"],
        requerida: true,
      },
      {
        id: "socios_primer_mes",
        texto: "¿Cuántos socios crees que podrías traer en tu primer mes?",
        nota: "Con esto sabemos si las metas están cerca o lejos de la realidad.",
        tipo: "opcion",
        opciones: ["0", "1 a 2", "3 a 5", "6 o más"],
        requerida: true,
      },
      {
        id: "metas_alcanzables",
        texto: "¿Las metas de 5, 12 y 25 socios se te hacen alcanzables?",
        tipo: "opcion",
        opciones: ["Sí, se ven alcanzables", "Son altas", "Son muy altas"],
        requerida: true,
      },
      {
        id: "primer_paso_justo",
        texto: "Si las ves altas, ¿cuál sería un primer paso justo?",
        tipo: "abierta",
      },
      {
        id: "membresia_activa",
        texto: "¿Ya tienes tu membresía activa en la plataforma?",
        tipo: "opcion",
        opciones: ["Sí", "No, pero me interesa", "No tengo mascota"],
        requerida: true,
      },
      {
        id: "falta_para_explicarlo",
        texto: "¿Qué le falta al programa para que puedas explicarlo en un minuto?",
        nota: "Es la prueba más importante: si no se explica rápido, no se recomienda.",
        tipo: "abierta",
      },
      {
        id: "que_te_frena",
        texto: "¿Qué te frena hoy para recomendarlo?",
        tipo: "abierta",
      },
    ],
    emailSubject: "🐾 Gracias por tu opinión — Club Pata Amiga",
  },
];

/** Edad mínima para dejar datos en una landing que pregunta la edad. */
export const EDAD_MINIMA_LANDING = 18;

export function getCampaign(slug: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.slug === slug);
}

/** Clave en site_settings donde vive la palabra cupón de la campaña. */
export function campaignCouponKey(slug: string) {
  return `campaign_${slug}_coupon`;
}

/** Slot en site_assets donde vive el PDF del regalo de la campaña. */
export function campaignPdfSlot(slug: string) {
  return `campaign-${slug}-pdf`;
}

export const CAMPAIGN_PDF_SLOTS = CAMPAIGNS.map((c) => campaignPdfSlot(c.slug));
export const CAMPAIGN_COUPON_KEYS = CAMPAIGNS.map((c) =>
  campaignCouponKey(c.slug),
);
