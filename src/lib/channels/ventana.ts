import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ventana de atención de 24 h de Meta (WhatsApp, Messenger e Instagram DM).
 *
 * Meta solo deja mandar TEXTO LIBRE durante las 24 h que siguen al último
 * mensaje de la persona. Pasado eso, en WhatsApp la única salida es una
 * plantilla aprobada; en Messenger/Instagram, esperar a que vuelva a escribir.
 *
 * Esta es la ÚNICA definición de la regla: la usa la bandeja para bloquear el
 * compositor y la usan las acciones del servidor y el despachador de
 * programados para negarse a enviar. Antes solo la revisaba la interfaz, así
 * que cualquier llamada directa a la acción la brincaba.
 *
 * Sin dependencias de servidor: el componente del cliente la importa tal cual.
 */

export const CANALES_CON_VENTANA = ["whatsapp", "instagram", "facebook"] as const;

export const VENTANA_MS = 24 * 60 * 60 * 1000;

/** Texto que ve el equipo cuando intenta escribir con la ventana cerrada. */
export function errorVentanaCerrada(canal: string): string {
  return canal === "whatsapp"
    ? "Pasaron más de 24 horas desde el último mensaje de esta persona: WhatsApp ya no permite texto libre. Reabre la conversación con una plantilla aprobada."
    : `Pasaron más de 24 horas desde el último mensaje de esta persona: ${canal === "facebook" ? "Messenger" : "Instagram"} ya no permite texto libre hasta que vuelva a escribir.`;
}

/** ¿Este canal está sujeto a la ventana de 24 h? */
export function canalConVentana(canal: string): boolean {
  return (CANALES_CON_VENTANA as readonly string[]).includes(canal);
}

/**
 * ¿Se puede escribir texto libre? Canales sin ventana (correo, portal) siempre
 * pueden. Sin mensaje entrante conocido, la ventana se considera cerrada.
 */
export function ventanaAbierta(
  canal: string,
  ultimoEntrante: string | Date | null | undefined,
  ahora: number = Date.now(),
): boolean {
  if (!canalConVentana(canal)) return true;
  if (!ultimoEntrante) return false;
  const t = new Date(ultimoEntrante).getTime();
  if (Number.isNaN(t)) return false;
  return ahora - t < VENTANA_MS;
}

/** Fecha del último mensaje que mandó la persona en este hilo (o null). */
export async function ultimoEntranteDe(
  admin: SupabaseClient,
  conversationId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("channel_messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.created_at as string | undefined) ?? null;
}

/**
 * Comprobación del servidor antes de mandar texto libre por un canal de Meta.
 * Devuelve el error listo para mostrarse, o null si se puede enviar.
 */
export async function comprobarVentana(
  admin: SupabaseClient,
  conversationId: string,
  canal: string,
  ahora: number = Date.now(),
): Promise<string | null> {
  if (!canalConVentana(canal)) return null;
  const ultimo = await ultimoEntranteDe(admin, conversationId);
  return ventanaAbierta(canal, ultimo, ahora) ? null : errorVentanaCerrada(canal);
}
