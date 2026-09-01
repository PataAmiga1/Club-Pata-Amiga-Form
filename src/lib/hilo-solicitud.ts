import type { SupabaseClient } from "@supabase/supabase-js";
import {
  firmarAdjuntosDeHilo,
  type AdjuntoFirmado,
} from "@/lib/documentos-conversacion";

/**
 * EL HILO DEL COMITÉ CON UN EMBAJADOR O CON UN CENTRO ALIADO (Cipatli, 1-sep).
 *
 * Hasta hoy el comité solo podía conversar con un MIEMBRO —por el hilo de su
 * peludo o el de su reintegro—. Con un embajador o un centro no tenía por
 * dónde: si la INE llegaba borrosa, la salida era aprobar a ciegas, denegar
 * sin explicar, o irse a un correo suelto que después nadie podía consultar
 * junto a la solicitud.
 *
 * TODO VIVE AQUÍ, PARA LOS DOS. Una sola tabla (`solicitud_messages`), un solo
 * catálogo y un solo lector. Los dos son el mismo trámite visto por dos
 * puertas y Cipatli los pidió juntos; con dos copias, cada arreglo que se le
 * hiciera a una y no a la otra las iría separando.
 *
 * LA DIFERENCIA REAL CON EL HILO DEL PELUDO no es la forma, es el destinatario:
 * un miembro SIEMPRE tiene cuenta, y un embajador o un centro puede no tenerla
 * —mandó su solicitud sin sesión y se liga por correo cuando entra (arreglo del
 * 11-ago)—. Por eso el aviso que cuenta es el CORREO, y la notificación dentro
 * de la plataforma solo se agrega si ya hay cuenta a la cual mandarla.
 */

export type SujetoSolicitud = "embajador" | "centro";

/** Cómo se llama cada cosa según de quién sea el hilo. */
export const SUJETO = {
  embajador: {
    tabla: "ambassadors",
    columna: "ambassador_id",
    /** A dónde lo manda el botón del correo. */
    portal: "/embajador",
    /** Para los textos: "tu solicitud de embajador". */
    queEs: "embajador",
  },
  centro: {
    tabla: "wellness_centers",
    columna: "center_id",
    portal: "/centro",
    queEs: "centro aliado",
  },
} as const satisfies Record<
  SujetoSolicitud,
  { tabla: string; columna: string; portal: string; queEs: string }
>;

/**
 * Lo que el comité puede pedir. Sale del catálogo de documentos que ya usan
 * las dos altas (fase 5, 25-ago), más "otro documento" para lo que no cabe.
 *
 * La INE va partida en frente y reverso a propósito: es el caso que originó
 * todo —una INE borrosa— y casi siempre viene mal UNA de las dos caras. Pedir
 * "tu identificación" haría que la persona vuelva a mandar las dos.
 */
export const ITEMS_SOLICITUD: Record<string, string> = {
  ine_frente: "🪪 INE por el frente",
  ine_reverso: "🪪 INE por el reverso",
  curp: "📄 CURP",
  rfc_constancia: "🧾 Constancia de situación fiscal",
  comprobante_domicilio: "🏠 Comprobante de domicilio",
  documento: "📎 Otro documento",
};

export function itemsValidos(items: string[] | undefined): string[] {
  return (items ?? []).filter((i) => ITEMS_SOLICITUD[i]);
}

export function listaDeItemsHtml(items: string[]): string {
  return items.map((i) => `<li>${ITEMS_SOLICITUD[i]}</li>`).join("");
}

export type MensajeDeSolicitud = {
  id: string;
  sender: "admin" | "solicitante";
  message: string;
  requested_items: string[];
  created_at: string;
};

export type HiloDeSolicitud = {
  mensajes: MensajeDeSolicitud[];
  /** Adjuntos ya firmados, por id de mensaje. */
  adjuntos: Record<string, AdjuntoFirmado[]>;
};

/**
 * Trae el hilo con sus adjuntos ya firmados.
 *
 * Se firma AQUÍ y no en el navegador por lo mismo que en el hilo del miembro:
 * cada quien sube a la carpeta de su propio id, así que si el solicitante
 * intentara abrir directo lo que subió el comité, Storage se lo negaría y el
 * adjunto se vería roto. Recibe el cliente con service role de quien ya
 * verificó que el hilo es suyo.
 */
export async function leerHiloDeSolicitud(
  admin: SupabaseClient,
  sujeto: SujetoSolicitud,
  id: string,
): Promise<HiloDeSolicitud> {
  const { data } = await admin
    .from("solicitud_messages")
    .select("id, sender, message, requested_items, documents, created_at")
    .eq(SUJETO[sujeto].columna, id)
    .order("created_at", { ascending: true });

  const mensajes = (data ?? []) as (MensajeDeSolicitud & {
    documents: unknown;
  })[];
  const firmados = await firmarAdjuntosDeHilo(mensajes);

  return {
    mensajes: mensajes.map(({ documents: _documents, ...m }) => m),
    adjuntos: Object.fromEntries(firmados),
  };
}

/**
 * Los hilos de VARIAS solicitudes de una vez, para el panel.
 *
 * El panel lista decenas de embajadores o de centros, y cada uno con su hilo
 * abierto en el popup. Pedirlos de uno en uno serían decenas de viajes a la
 * base en cada carga de la pantalla, así que se traen todos en UNA consulta y
 * se agrupan aquí. Las rutas de los adjuntos también se firman en una sola
 * pasada.
 *
 * Devuelve un mapa `id → hilo`; una solicitud sin mensajes simplemente no
 * aparece, y quien lo consulta usa el hilo vacío.
 */
export async function leerHilosDeSolicitud(
  admin: SupabaseClient,
  sujeto: SujetoSolicitud,
  ids: string[],
): Promise<Map<string, HiloDeSolicitud>> {
  const mapa = new Map<string, HiloDeSolicitud>();
  if (!ids.length) return mapa;

  const columna = SUJETO[sujeto].columna;
  const { data } = await admin
    .from("solicitud_messages")
    .select(`id, ${columna}, sender, message, requested_items, documents, created_at`)
    .in(columna, ids)
    .order("created_at", { ascending: true });

  const filas = (data ?? []) as unknown as (MensajeDeSolicitud & {
    documents: unknown;
    [k: string]: unknown;
  })[];
  if (!filas.length) return mapa;

  const firmados = await firmarAdjuntosDeHilo(filas);

  for (const fila of filas) {
    const dueno = fila[columna];
    if (typeof dueno !== "string") continue;
    const hilo = mapa.get(dueno) ?? { mensajes: [], adjuntos: {} };
    const { documents: _documents, ...mensaje } = fila;
    hilo.mensajes.push(mensaje as MensajeDeSolicitud);
    const adjuntos = firmados.get(fila.id);
    if (adjuntos?.length) hilo.adjuntos[fila.id] = adjuntos;
    mapa.set(dueno, hilo);
  }
  return mapa;
}

/** El hilo vacío, para no repetir el `?? { … }` en cada pantalla. */
export const HILO_VACIO: HiloDeSolicitud = { mensajes: [], adjuntos: {} };
