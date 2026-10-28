/**
 * Atribución de pauta: de qué anuncio o campaña llegó cada miembro.
 *
 * La agencia (Retorno, desde el 2-nov-2026) configura el píxel y sus eventos
 * por su lado; aquí solo RECIBIMOS el dato: los parámetros `utm_*`, `fbclid` y
 * `gclid` con los que la persona aterrizó, guardados como primer toque (lo que
 * la trajo la primera vez) y último toque (lo que la trajo la vez que se
 * registró), para que ventas vea en el perfil «Anuncio de Meta · campaña X».
 *
 * CONSENTIMIENTO. La política de cookies (sección 3.C) dice que las cookies de
 * marketing «permiten medir campañas, atribución y conversiones» y que «se
 * activan solo si aceptas». Esta cookie es exactamente eso, así que vive bajo
 * el mismo candado que el píxel: mientras no haya un «sí», los parámetros solo
 * se recuerdan en memoria de la pestaña y no se escribe nada; si la persona
 * acepta, se guardan; si rechaza, se tiran (y se borra la cookie si existía).
 * Ver `CapturaOrigen.tsx`.
 *
 * Este archivo es PURO —sin Next, sin Supabase, sin `window`— para poder
 * probarlo suelto con `node --test` (tests/atribucion.test.mjs).
 */

/** Cookie propia (primera parte) donde vive la atribución hasta el registro. */
export const COOKIE_ATRIBUCION = "pa_origen";

/** 90 días: la ventana habitual de atribución de una campaña. */
export const DIAS_COOKIE_ATRIBUCION = 90;

/** Parámetros que se leen de la URL, en el orden en que se guardan. */
export const PARAMETROS_DE_CAMPANIA = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
] as const;

type Parametro = (typeof PARAMETROS_DE_CAMPANIA)[number];

/** Un aterrizaje con parámetros de campaña. */
export type Toque = Partial<Record<Parametro, string>> & {
  /** Instante del aterrizaje (ISO, UTC). */
  ts: string;
  /** Ruta donde aterrizó, sin query (p. ej. «/landings/regalo»). */
  pagina?: string;
  /** Dominio de donde venía (p. ej. «l.instagram.com»), si el navegador lo dice. */
  referente?: string;
};

export type Atribucion = {
  primero: Toque;
  ultimo: Toque;
};

/** Lo que se guarda en `profiles.attribution`. */
export type AtribucionGuardada = Atribucion & {
  /** Cuándo se guardó en el perfil (ISO). */
  guardada: string;
};

/**
 * Tope por valor. `fbclid` ronda los 60-200 caracteres; nada legítimo pasa de
 * 200, y la cookie entera tiene que caber holgada en 4 KB.
 */
const MAX_VALOR = 200;

function limpiar(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  // Sin caracteres de control: el valor acaba pintado en el panel de ventas.
  const v = valor.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return v ? v.slice(0, MAX_VALOR) : undefined;
}

/**
 * Lee los parámetros de campaña de una URL. Devuelve `null` si no trae
 * ninguno: una visita sin parámetros NO es un toque (no pisa al anterior).
 */
export function toqueDesdeUrl(
  busqueda: URLSearchParams | string,
  contexto: { ahora: Date; pagina?: string; referente?: string },
): Toque | null {
  const params =
    typeof busqueda === "string" ? new URLSearchParams(busqueda) : busqueda;
  const toque: Toque = { ts: contexto.ahora.toISOString() };
  let alguno = false;
  for (const p of PARAMETROS_DE_CAMPANIA) {
    const v = limpiar(params.get(p));
    if (v) {
      toque[p] = v;
      alguno = true;
    }
  }
  if (!alguno) return null;
  const pagina = limpiar(contexto.pagina);
  if (pagina) toque.pagina = pagina;
  const referente = dominioDe(contexto.referente);
  if (referente) toque.referente = referente;
  return toque;
}

/** Solo el dominio del referente: la ruta completa puede traer datos de otros. */
function dominioDe(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return limpiar(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

/** El primer toque nunca se reemplaza; el último, siempre. */
export function combinarToques(previa: Atribucion | null, nuevo: Toque): Atribucion {
  return { primero: previa?.primero ?? nuevo, ultimo: nuevo };
}

function toqueValido(crudo: unknown): Toque | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  const ts = limpiar(o.ts);
  if (!ts || Number.isNaN(Date.parse(ts))) return null;
  const toque: Toque = { ts: new Date(ts).toISOString() };
  let alguno = false;
  for (const p of PARAMETROS_DE_CAMPANIA) {
    const v = limpiar(o[p]);
    if (v) {
      toque[p] = v;
      alguno = true;
    }
  }
  if (!alguno) return null;
  const pagina = limpiar(o.pagina);
  if (pagina) toque.pagina = pagina;
  const referente = limpiar(o.referente);
  if (referente) toque.referente = referente;
  return toque;
}

/**
 * Lee la cookie. La cookie la escribe el navegador y la puede editar
 * cualquiera, así que se valida campo por campo: solo pasan las llaves
 * conocidas, con su tope de largo. Cualquier cosa rara = `null`.
 */
export function leerAtribucion(valor: string | null | undefined): Atribucion | null {
  if (!valor) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(decodeURIComponent(valor));
  } catch {
    return null;
  }
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  const ultimo = toqueValido(o.ultimo);
  const primero = toqueValido(o.primero) ?? ultimo;
  if (!primero || !ultimo) return null;
  return { primero, ultimo };
}

export function serializarAtribucion(a: Atribucion): string {
  return encodeURIComponent(JSON.stringify(a));
}

/** Lo guardado en el perfil (jsonb), validado igual que la cookie. */
export function leerAtribucionGuardada(valor: unknown): AtribucionGuardada | null {
  if (!valor || typeof valor !== "object") return null;
  const o = valor as Record<string, unknown>;
  const ultimo = toqueValido(o.ultimo);
  const primero = toqueValido(o.primero) ?? ultimo;
  if (!primero || !ultimo) return null;
  const guardada = typeof o.guardada === "string" ? o.guardada : ultimo.ts;
  return { primero, ultimo, guardada };
}

const FUENTES_META = new Set([
  "facebook",
  "fb",
  "instagram",
  "ig",
  "meta",
  "facebook_ads",
  "fb_ads",
  "ig_ads",
  "messenger",
  "an", // Audience Network
]);
const FUENTES_GOOGLE = new Set(["google", "google_ads", "adwords", "youtube"]);
const MEDIOS_PAGADOS = /^(cpc|ppc|cpm|paid|paid_?social|paidsocial|ads?|display|social_?paid|pauta)$/i;

/**
 * Una línea legible para el panel: «Anuncio de Meta · campaña Regalo ·
 * anuncio gata-video». La fecha la agrega la pantalla con `formatDateEs`
 * (zona horaria de México), no este archivo.
 */
export function describirToque(t: Toque): string {
  const fuente = (t.utm_source ?? "").toLowerCase();
  const pagado = MEDIOS_PAGADOS.test(t.utm_medium ?? "");
  let origen: string;
  if (t.fbclid || FUENTES_META.has(fuente)) {
    origen = t.fbclid || pagado || !t.utm_source ? "Anuncio de Meta" : "Meta (Facebook/Instagram)";
  } else if (t.gclid || FUENTES_GOOGLE.has(fuente)) {
    origen = t.gclid || pagado ? "Anuncio de Google" : "Google";
  } else if (t.utm_source) {
    origen = t.utm_medium ? `${t.utm_source} (${t.utm_medium})` : t.utm_source;
  } else {
    origen = "Campaña sin fuente";
  }
  const partes = [origen];
  if (t.utm_campaign) partes.push(`campaña ${t.utm_campaign}`);
  if (t.utm_content) partes.push(`anuncio ${t.utm_content}`);
  if (t.utm_term) partes.push(`término ${t.utm_term}`);
  return partes.join(" · ");
}

/**
 * La cookie `_fbc` en el formato que pide Meta (`fb.1.<ms>.<fbclid>`), para
 * cuando el píxel todavía no la creó (cargó después del aterrizaje, o la
 * persona aceptó cookies ya navegando sin el `fbclid` en la URL).
 */
export function fbcDesdeFbclid(fbclid: string, instanteMs: number): string {
  return `fb.1.${Math.floor(instanteMs)}.${fbclid}`;
}

/** ¿El primer y el último toque son la misma visita? */
export function mismoToque(a: Toque, b: Toque): boolean {
  return a.ts === b.ts && describirToque(a) === describirToque(b);
}
