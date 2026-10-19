import type {
  ConversacionFlowly,
  HiloFlowly,
  MensajeFlowly,
  PlantillaFlowly,
} from "./tipos";

/**
 * Cliente de la API de Flowly (/api/v1) para el portal de ventas.
 *
 *   FLOWLY_API_BASE   — https://app.flowlysync.com/api/v1 si no se define
 *   FLOWLY_API_KEY    — flw_live_… (una por cliente; solo en el servidor)
 *
 * Reglas del contrato que se respetan aquí:
 * - Todo envío lleva `sent_by`, `actor` e `Idempotency-Key`. La llave se
 *   reutiliza EXACTA al reintentar el mismo mensaje (§6.1).
 * - Solo se reintenta lo que el contrato dice que es seguro con la misma llave:
 *   503, 500, 409 idempotency_in_progress, 429 y fallas de red (§13).
 * - Flowly decide la ventana de 24 h y el interruptor del agente; aquí solo se
 *   traducen sus negativas a frases claras para el equipo.
 *
 * Sin dependencias de la app: se prueba con un `fetch` falso.
 */

export const BASE_POR_OMISION = "https://app.flowlysync.com/api/v1";

export type ConfigFlowly = { base: string; key: string };

export function configFlowlyDesdeEntorno(
  env: Record<string, string | undefined> = process.env,
): ConfigFlowly | null {
  const key = env.FLOWLY_API_KEY?.trim();
  if (!key) return null;
  const base = (env.FLOWLY_API_BASE?.trim() || BASE_POR_OMISION).replace(/\/+$/, "");
  return { base, key };
}

export type ErrorFlowly = {
  ok: false;
  status: number;
  codigo: string;
  /** La frase de Flowly (español, segura para mostrar). */
  mensaje: string;
  /** Frase para el equipo, más explícita sobre qué hacer. */
  paraEquipo: string;
  /** ¿Se puede reintentar con la MISMA llave? */
  reintentable: boolean;
  reusedKey: boolean;
  /** En send_failed: el mensaje fallido que Flowly guardó. */
  messageId: string | null;
  /** En send_failed: ¿podría salir más tarde como envío NUEVO? */
  metaReintentable: boolean | null;
};

export type ResultadoFlowly<T> =
  | { ok: true; status: number; data: T; replay: boolean }
  | ErrorFlowly;

/**
 * Frases para el equipo de ventas por cada código del contrato (§13). La de
 * Flowly ya es española y segura; esta dice además qué hacer.
 */
const PARA_EQUIPO: Record<string, string> = {
  window_closed:
    "Pasaron más de 24 horas desde el último mensaje de esta persona: WhatsApp solo deja escribirle con una plantilla aprobada.",
  human_agent_unavailable:
    "Pasaron más de 24 horas desde el último mensaje de esta persona y Meta todavía no permite responder después de ese plazo en este canal. Hay que esperar a que vuelva a escribir.",
  no_inbound: "Esta persona todavía no ha escrito, así que todavía no se le puede mandar nada por este canal.",
  human_agent_only: "Pasadas 24 horas solo una persona del equipo puede responder aquí, no la IA.",
  agent_disabled: "La IA está apagada en esta conversación: una persona la tomó.",
  connection_unavailable:
    "La cuenta conectada en Flowly no está disponible (se desconectó). Hay que volver a conectarla antes de poder enviar.",
  template_not_found: "Esa plantilla no existe en la cuenta de WhatsApp. Sincroniza las plantillas y vuelve a intentar.",
  template_not_approved: "Meta todavía no aprueba esa plantilla (o la pausó), así que no se puede enviar.",
  unauthorized: "La llave de Flowly no es válida o fue revocada. Avisa a quien administra la plataforma.",
  not_found: "Flowly ya no tiene esta conversación (pudo haberse borrado).",
  idempotency_in_progress: "Ese envío todavía se está procesando. Espera unos segundos.",
  unavailable: "Flowly no está disponible en este momento; no se envió nada. Intenta de nuevo en un momento.",
  internal: "Flowly tuvo un error de su lado; no se envió nada dos veces. Intenta de nuevo en un momento.",
  rate_limited: "Se mandaron demasiadas peticiones seguidas a Flowly. Intenta de nuevo en un minuto.",
  network: "No se pudo contactar a Flowly. Revisa la conexión e intenta de nuevo.",
  not_configured: "El conector de Flowly no está configurado (falta FLOWLY_API_KEY).",
};

const REINTENTABLES = new Set(["unavailable", "internal", "idempotency_in_progress", "rate_limited", "network"]);

/** Convierte una respuesta de error de Flowly en ErrorFlowly. */
export function errorDeRespuesta(status: number, cuerpo: unknown): ErrorFlowly {
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
  let codigo = typeof c.code === "string" ? c.code : "";
  if (!codigo) codigo = status === 429 ? "rate_limited" : status >= 500 ? "internal" : `http_${status}`;
  const mensaje =
    typeof c.message === "string" && c.message
      ? c.message
      : PARA_EQUIPO[codigo] ?? `Flowly respondió ${status}.`;
  const reusedKey = c.reused_key === true;
  let paraEquipo = PARA_EQUIPO[codigo] ?? mensaje;
  // En send_failed, invalid_request y similares la frase de Flowly es la buena
  // (dice qué rechazó Meta o qué está mal en la petición).
  if (codigo === "send_failed" || codigo === "invalid_request" || codigo.startsWith("file_") || codigo.startsWith("upload_"))
    paraEquipo = mensaje;
  if (codigo === "template_not_approved" && mensaje) paraEquipo = mensaje;
  return {
    ok: false,
    status,
    codigo,
    mensaje,
    paraEquipo,
    reintentable: REINTENTABLES.has(codigo),
    reusedKey,
    messageId: typeof c.message_id === "string" ? c.message_id : null,
    metaReintentable: typeof c.retryable === "boolean" ? c.retryable : null,
  };
}

export type OpcionesCliente = {
  config: ConfigFlowly;
  fetch?: typeof fetch;
  /** Espera entre reintentos (inyectable para pruebas). */
  esperar?: (ms: number) => Promise<void>;
  /** Pausas antes de cada reintento. Por omisión 1 s y 3 s. */
  pausas?: number[];
};

export type EnvioTexto = {
  conversationId: string;
  body: string;
  sentBy: "agent" | "human";
  actor: string;
  idempotencyKey: string;
};

export type EnvioPlantilla = {
  template: string;
  language: string;
  variables: string[];
  sentBy: "system" | "human" | "agent";
  actor: string;
  idempotencyKey: string;
} & ({ conversationId: string; to?: never } | { to: string; conversationId?: never });

export function crearClienteFlowly(op: OpcionesCliente) {
  const f = op.fetch ?? fetch;
  const esperar = op.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pausas = op.pausas ?? [1000, 3000];

  async function pedir<T>(
    metodo: "GET" | "POST" | "PATCH",
    ruta: string,
    cuerpo?: unknown,
    extra?: { idempotencyKey?: string; reintentar?: boolean },
  ): Promise<ResultadoFlowly<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${op.config.key}`,
      Accept: "application/json",
    };
    if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
    if (extra?.idempotencyKey) headers["Idempotency-Key"] = extra.idempotencyKey;

    const intentos = extra?.reintentar === false ? 1 : pausas.length + 1;
    let ultimo: ErrorFlowly | null = null;
    for (let i = 0; i < intentos; i++) {
      if (i > 0) await esperar(pausas[i - 1] ?? 1000);
      let res: Response;
      try {
        res = await f(`${op.config.base}${ruta}`, {
          method: metodo,
          headers,
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
          // Los redireccionamientos nunca son respuesta válida de la API.
          redirect: "manual",
          cache: "no-store",
        });
      } catch {
        ultimo = errorDeRespuesta(0, { code: "network" });
        continue;
      }
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (res.status >= 200 && res.status < 300)
        return {
          ok: true,
          status: res.status,
          data: json as T,
          replay: res.headers.get("Idempotent-Replayed") === "true",
        };
      ultimo = errorDeRespuesta(res.status, json);
      if (!ultimo.reintentable) return ultimo;
    }
    return ultimo ?? errorDeRespuesta(0, { code: "network" });
  }

  return {
    /** Conversación + últimos 25 mensajes + elegibilidad, fresca (§4.2). */
    obtenerConversacion(id: string) {
      return pedir<HiloFlowly>("GET", `/conversations/${encodeURIComponent(id)}`);
    },

    /** Texto libre dentro de la ventana (§6). */
    enviarTexto(e: EnvioTexto) {
      return pedir<MensajeFlowly>(
        "POST",
        `/conversations/${encodeURIComponent(e.conversationId)}/messages`,
        { body: e.body, sent_by: e.sentBy, actor: e.actor },
        { idempotencyKey: e.idempotencyKey },
      );
    },

    /** Plantilla aprobada de WhatsApp (§6.4.2). */
    enviarPlantilla(e: EnvioPlantilla) {
      return pedir<{ message: MensajeFlowly; conversation_id: string; contact_created: boolean }>(
        "POST",
        "/messages/template",
        {
          template: e.template,
          language: e.language,
          variables: e.variables,
          ...(e.conversationId ? { conversation_id: e.conversationId } : { to: e.to }),
          sent_by: e.sentBy,
          actor: e.actor,
        },
        { idempotencyKey: e.idempotencyKey },
      );
    },

    /** Interruptor del agente en el hilo (§8.1). Idempotente por naturaleza. */
    cambiarAgente(conversationId: string, encendido: boolean, actor: string) {
      return pedir<ConversacionFlowly>(
        "PATCH",
        `/conversations/${encodeURIComponent(conversationId)}`,
        { agent_enabled: encendido, actor },
      );
    },

    /** Todas las plantillas (paginadas por cursor, §5). */
    async listarPlantillas(): Promise<ResultadoFlowly<PlantillaFlowly[]>> {
      const todas: PlantillaFlowly[] = [];
      let cursor: string | null = null;
      for (let pagina = 0; pagina < 20; pagina++) {
        const qs: string = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const r: ResultadoFlowly<{ data: PlantillaFlowly[]; next_cursor: string | null }> =
          await pedir("GET", `/templates${qs}`);
        if (!r.ok) return r;
        todas.push(...(r.data?.data ?? []));
        cursor = r.data?.next_cursor ?? null;
        if (!cursor) break;
      }
      return { ok: true, status: 200, data: todas, replay: false };
    },

    /** Marca leído para la plataforma (§9). */
    marcarLeido(conversationId: string) {
      return pedir<ConversacionFlowly>(
        "POST",
        `/conversations/${encodeURIComponent(conversationId)}/read`,
        undefined,
        { reintentar: false },
      );
    },
  };
}

export type ClienteFlowly = ReturnType<typeof crearClienteFlowly>;

/** Cliente con la configuración del entorno, o null si falta la llave. */
export function clienteFlowly(): ClienteFlowly | null {
  const config = configFlowlyDesdeEntorno();
  return config ? crearClienteFlowly({ config }) : null;
}

/** Error uniforme para cuando no hay llave (desarrollo). */
export function sinConfigurar(): ErrorFlowly {
  return errorDeRespuesta(0, { code: "not_configured" });
}

/**
 * Qué hacer con la respuesta a un envío del AGENTE (contrato §8.2).
 *  - "hecho": salió (o ya había salido: replay o llave ya usada por otra corrida).
 *  - "descartar": la negativa es normal (alguien tomó el hilo, ventana cerrada);
 *    se descarta en silencio.
 *  - "reintentar": nada salió; reintentar después con la MISMA llave y el MISMO texto.
 *  - "fallo": Meta lo rechazó o la petición está mal; se registra y no se repite.
 */
export function decisionEnvioAgente(
  r: ResultadoFlowly<unknown>,
): "hecho" | "descartar" | "reintentar" | "fallo" {
  if (r.ok) return "hecho";
  if (r.codigo === "invalid_request" && r.reusedKey) return "hecho";
  if (
    ["agent_disabled", "window_closed", "human_agent_unavailable", "no_inbound", "human_agent_only"].includes(
      r.codigo,
    )
  )
    return "descartar";
  if (r.reintentable) return "reintentar";
  return "fallo";
}
