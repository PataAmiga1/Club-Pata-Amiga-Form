import { createHash } from "node:crypto";

/**
 * API de Conversiones de Meta (CAPI): la parte PURA.
 *
 * El píxel del navegador pierde conversiones (bloqueadores, iOS, la persona
 * cierra la pestaña antes de que cargue). La CAPI manda el mismo evento desde
 * nuestro servidor, con el MISMO `event_id` que el navegador, y Meta se queda
 * con uno solo (deduplicación por `event_name` + `event_id`).
 *
 * Aquí solo se normaliza, se cifra (SHA-256) y se arma el cuerpo. El envío —y
 * el candado de consentimiento y de llave— vive en `capi-servidor.ts`. Este
 * archivo no importa nada de Next ni de `@/` para poder probarlo con
 * `node --test` (tests/medicion-capi.test.mjs).
 */

/** Versión de la Graph API. Sobrescribible con META_CAPI_API_VERSION. */
export const VERSION_GRAPH_POR_OMISION = "v24.0";

export type NombreEventoMeta = "Purchase" | "CompleteRegistration" | "InitiateCheckout" | "Lead";

export function sha256(valor: string): string {
  return createHash("sha256").update(valor, "utf8").digest("hex");
}

/** Correo como lo pide Meta: sin espacios, en minúsculas. */
export function normalizarCorreo(correo: string | null | undefined): string | null {
  const c = (correo ?? "").trim().toLowerCase();
  return c.includes("@") ? c : null;
}

/**
 * Teléfono como lo pide Meta: solo dígitos, CON lada de país. `PhoneField`
 * guarda E.164 (`+52…`); los registros viejos traen 10 dígitos sin lada, que
 * son de México.
 */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  const t = (telefono ?? "").trim();
  if (!t) return null;
  const digitos = t.replace(/\D/g, "");
  if (!digitos) return null;
  if (t.startsWith("+")) return digitos.length >= 8 ? digitos : null;
  if (digitos.length === 10) return `52${digitos}`;
  return digitos.length >= 11 ? digitos : null;
}

export type DatosDePersona = {
  correo?: string | null;
  telefono?: string | null;
  /** Nuestro id de usuario; se manda cifrado como `external_id`. */
  idExterno?: string | null;
  ip?: string | null;
  agente?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

export type EventoMeta = {
  nombre: NombreEventoMeta;
  /** El mismo que mandó el navegador (ver `src/lib/medicion/eventos.ts`). */
  eventoId: string;
  /** Segundos Unix. */
  instante: number;
  url: string;
  persona: DatosDePersona;
  datos?: {
    valor?: number;
    moneda?: string;
    contenidoIds?: string[];
    tipoContenido?: string;
    nombreContenido?: string;
  };
};

/** `user_data` con lo que Meta pide cifrado, cifrado; y lo demás, tal cual. */
export function datosDeUsuario(p: DatosDePersona): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  const correo = normalizarCorreo(p.correo);
  if (correo) salida.em = [sha256(correo)];
  const telefono = normalizarTelefono(p.telefono);
  if (telefono) salida.ph = [sha256(telefono)];
  const externo = (p.idExterno ?? "").trim();
  if (externo) salida.external_id = [sha256(externo)];
  if (p.ip) salida.client_ip_address = p.ip;
  if (p.agente) salida.client_user_agent = p.agente;
  if (p.fbp) salida.fbp = p.fbp;
  if (p.fbc) salida.fbc = p.fbc;
  return salida;
}

/** El cuerpo completo del POST a `/{pixel}/events`. */
export function cuerpoCapi(evento: EventoMeta, codigoDePrueba?: string | null) {
  const custom: Record<string, unknown> = {};
  const d = evento.datos ?? {};
  if (typeof d.valor === "number" && Number.isFinite(d.valor)) {
    custom.value = Math.round(d.valor * 100) / 100;
    custom.currency = (d.moneda || "MXN").toUpperCase();
  }
  if (d.contenidoIds?.length) custom.content_ids = d.contenidoIds;
  if (d.tipoContenido) custom.content_type = d.tipoContenido;
  if (d.nombreContenido) custom.content_name = d.nombreContenido;
  return {
    data: [
      {
        event_name: evento.nombre,
        event_time: Math.floor(evento.instante),
        event_id: evento.eventoId,
        action_source: "website",
        event_source_url: evento.url,
        user_data: datosDeUsuario(evento.persona),
        ...(Object.keys(custom).length ? { custom_data: custom } : {}),
      },
    ],
    ...(codigoDePrueba ? { test_event_code: codigoDePrueba } : {}),
  };
}

/** Primera IP de `x-forwarded-for` (la del cliente; las demás son proxies). */
export function ipDelCliente(reenviado: string | null | undefined, real?: string | null): string | null {
  const primera = (reenviado ?? "").split(",")[0]?.trim();
  return primera || (real ?? "").trim() || null;
}

/**
 * Las cookies `_fbp`/`_fbc` las crea el píxel; se validan por forma antes de
 * mandarlas, porque cualquiera puede escribir una cookie.
 */
export function cookieFbValida(valor: string | null | undefined): string | null {
  if (!valor) return null;
  return /^fb\.\d\.\d+\.[A-Za-z0-9_.\-]{1,500}$/.test(valor) ? valor : null;
}

/** Lo que el servidor sabe de la petición en curso, para la CAPI. */
export type ContextoDeMedicion = {
  consentido: boolean;
  fbp: string | null;
  fbc: string | null;
  ip: string | null;
  agente: string | null;
};

/**
 * La parte del contexto que viaja en la metadata de Stripe Checkout, para que
 * el webhook mande el Purchase con los datos del navegador que pagó. Sin
 * consentimiento NO viaja nada (ni IP ni navegador): la metadata queda igual
 * que antes. Stripe limita cada valor a 500 caracteres.
 */
export function metadataDeMedicion(c: ContextoDeMedicion): Record<string, string> {
  if (!c.consentido) return {};
  return {
    medicion: "1",
    ...(c.fbp ? { fbp: c.fbp.slice(0, 500) } : {}),
    ...(c.fbc ? { fbc: c.fbc.slice(0, 500) } : {}),
    ...(c.ip ? { cliente_ip: c.ip.slice(0, 100) } : {}),
    ...(c.agente ? { cliente_ua: c.agente.slice(0, 400) } : {}),
  };
}

