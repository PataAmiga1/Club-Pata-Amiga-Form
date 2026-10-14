"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/lib/panel-guard";
import { CAMPAIGNS } from "@/lib/landings";
import { darDeBajaCorreo, revertirBajaCorreo } from "@/lib/correo/bajas";

/**
 * Audiencia del boletín y bajas de correo.
 *
 * La lógica pesada vive en la base (`audiencia_boletin`,
 * `correo_fuera_del_boletin`) para que la carga de audiencia y el alta
 * automática de miembros usen exactamente la misma regla de exclusión.
 */

export type ResumenAudiencia = {
  aplicado: boolean;
  agregados: number;
  por_origen: Record<string, number>;
  correos_unicos: number;
  ya_en_la_lista: number;
  excluidos: Record<string, number>;
  por_agregar: Record<string, number>;
  total_por_agregar: number;
};

/**
 * Landings cuya casilla dice «… y comunicaciones de Club Pata Amiga». La
 * encuesta queda fuera: su casilla solo autoriza escribir «al respecto» de las
 * respuestas, no mandar boletín.
 */
function campanasConConsentimiento() {
  return CAMPAIGNS.filter((c) => c.tipo !== "encuesta").map((c) => c.slug);
}

function revalidar() {
  revalidatePath("/ventas/newsletter/audiencia");
  revalidatePath("/ventas/newsletter");
}

async function correrAudiencia(aplicar: boolean) {
  await requireCapability("boletin.audiencia");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("audiencia_boletin", {
    p_campanas: campanasConConsentimiento(),
    p_aplicar: aplicar,
  });
  if (error) return { error: `No se pudo calcular la audiencia: ${error.message}` };
  if (aplicar) revalidar();
  return { ok: true as const, resumen: data as ResumenAudiencia };
}

/** Solo cuenta: no escribe nada. */
export async function previsualizarAudiencia() {
  return correrAudiencia(false);
}

/** Mete a la lista a los que faltan. Se puede correr las veces que sea. */
export async function cargarAudiencia() {
  return correrAudiencia(true);
}

/** Dar de baja a mano: la persona lo pidió por WhatsApp, teléfono o correo. */
export async function agregarBajaManual(email: string) {
  const { userId } = await requireCapability("bajas.administrar");
  const r = await darDeBajaCorreo(createAdminClient(), email, "equipo", userId);
  if (!r.ok) return { error: r.error };
  revalidar();
  return { ok: true as const, yaEstaba: r.yaEstaba };
}

/** Deshacer una baja, solo si la persona lo pidió. */
export async function deshacerBaja(email: string) {
  const { userId } = await requireCapability("bajas.administrar");
  const r = await revertirBajaCorreo(createAdminClient(), email, userId);
  if (!r.ok) return { error: r.error };
  revalidar();
  return { ok: true as const };
}
