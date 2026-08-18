import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Tipos de evento de la línea de tiempo del contacto.
 *
 * Los que llevan `auto_event` en `pipeline_stages` mueven además la tarjeta del
 * pipeline (se conecta en la fase 1d). Los demás solo dejan rastro.
 */
export type EventKind =
  // Ciclo de venta (mueven etapa)
  | "primer_mensaje"
  | "pidio_llamada"
  | "cuenta_creada"
  | "checkout_abierto"
  | "checkout_abandonado"
  | "pago_confirmado"
  | "membresia_activa"
  | "membresia_inactiva"
  // Conversación
  | "mensaje_recibido"
  | "mensaje_enviado"
  | "nota"
  | "escalacion"
  // Plataforma
  | "mascota_alta"
  | "mascota_aprobada"
  | "reintegro_solicitado"
  | "reintegro_resuelto"
  /** El miembro subió o bajó de plan (sección 3, punto 6.3). */
  | "plan_cambiado"
  /** Un super admin lo movió a otra versión del plan (sección 3, punto 4.1). */
  | "beneficios_migrados"
  // CRM
  | "contacto_creado"
  | "etapa_movida"
  | "etiqueta_agregada"
  | "etiqueta_quitada"
  | "propietario_asignado"
  | "contactos_fusionados"
  | "importado"
  | "tarea_creada"
  | "tarea_completada";

export type EventInput = {
  contactId: string;
  kind: EventKind;
  summary: string;
  payload?: Record<string, unknown>;
  /** Quién lo hizo. Null = la plataforma o un agente IA. */
  actorId?: string | null;
  /** Etiqueta legible cuando no hay persona: "PATiTA (IA)", "Sistema". */
  actorLabel?: string | null;
};

/**
 * SUMIDERO ÚNICO de todo lo que le pasa a un contacto.
 *
 * Alimenta tres cosas a la vez: la línea de tiempo del perfil, los eventos
 * intercalados en el hilo de conversación, y —el día que se quiera— el motor de
 * automatizaciones, que se suscribirá aquí sin que haya que tocar una sola
 * pantalla. Por eso TODO cambio relevante pasa por esta función y no escribe
 * `contact_activities` por su cuenta.
 *
 * Nunca lanza: un evento que falla no debe tumbar la operación que lo generó
 * (un pago no se cae porque no se pudo escribir su bitácora). Devuelve si quedó.
 */
export async function emitEvent(
  admin: Admin,
  input: EventInput,
): Promise<boolean> {
  try {
    const { error } = await admin.from("contact_activities").insert({
      contact_id: input.contactId,
      kind: input.kind,
      summary: input.summary,
      payload: input.payload ?? {},
      actor_id: input.actorId ?? null,
      actor_label: input.actorLabel ?? null,
    });
    if (error) {
      console.error("[crm] no se pudo registrar el evento", input.kind, error.message);
      return false;
    }

    await admin
      .from("contacts")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", input.contactId);

    return true;
  } catch (err) {
    console.error("[crm] error inesperado al registrar evento", err);
    return false;
  }
}

/** Varios eventos del mismo lote (importaciones, relleno inicial). */
export async function emitEvents(admin: Admin, inputs: EventInput[]) {
  if (inputs.length === 0) return 0;
  const { error } = await admin.from("contact_activities").insert(
    inputs.map((i) => ({
      contact_id: i.contactId,
      kind: i.kind,
      summary: i.summary,
      payload: i.payload ?? {},
      actor_id: i.actorId ?? null,
      actor_label: i.actorLabel ?? null,
    })),
  );
  if (error) {
    console.error("[crm] lote de eventos falló", error.message);
    return 0;
  }
  return inputs.length;
}
