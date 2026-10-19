"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/lib/panel-guard";
import { sincronizarPlantillasFlowly } from "@/lib/channels/flowly/plantillas";

/**
 * Alta y edición de las plantillas de respuesta uno a uno.
 *
 * Las administra el gerente: una plantilla mal redactada la manda todo el equipo
 * muchas veces. Usarlas sí puede cualquiera del portal.
 */

const CANALES = ["email", "whatsapp", "instagram", "facebook"] as const;

function revalidar() {
  revalidatePath("/ventas/plantillas");
  revalidatePath("/ventas/conversaciones");
}

export async function guardarPlantilla(input: {
  id?: string;
  name: string;
  category: string;
  channels: string[];
  subject: string;
  body: string;
}) {
  const { userId } = await requireCapability("contactos.fusionar"); // gerente y arriba
  const nombre = input.name.trim();
  const cuerpo = input.body.trim();
  if (!nombre) return { error: "Ponle nombre a la plantilla." };
  if (!cuerpo) return { error: "Escribe el cuerpo." };

  const canales = input.channels.filter((c) =>
    CANALES.includes(c as (typeof CANALES)[number]),
  );

  const admin = createAdminClient();
  const fila = {
    name: nombre,
    category: input.category.trim() || null,
    channels: canales,
    subject: input.subject.trim() || null,
    body: cuerpo,
    updated_at: new Date().toISOString(),
  };

  const { error } = input.id
    ? await admin.from("message_templates").update(fila).eq("id", input.id)
    : await admin
        .from("message_templates")
        .insert({ ...fila, created_by: userId });
  if (error) return { error: "No se pudo guardar la plantilla." };

  revalidar();
  return { ok: true as const };
}

/** Archivar en lugar de borrar: los hilos donde se usó siguen teniendo sentido. */
export async function archivarPlantilla(id: string, archivar: boolean) {
  await requireCapability("contactos.fusionar");
  const admin = createAdminClient();
  await admin
    .from("message_templates")
    .update({ archived_at: archivar ? new Date().toISOString() : null })
    .eq("id", id);
  revalidar();
  return { ok: true as const };
}

/**
 * Trae de Flowly las plantillas de WhatsApp (las crea su operador y las aprueba
 * Meta). Su estado no llega por webhook: se sincroniza a mano o con la tarea
 * de conciliación.
 */
export async function sincronizarPlantillasDeFlowly() {
  await requireCapability("canales.administrar");
  const admin = createAdminClient();
  const res = await sincronizarPlantillasFlowly(admin);
  revalidar();
  if (!res.ok) return { error: res.error };
  return {
    ok: true as const,
    aviso: `Listo: ${res.total} plantilla(s) de Flowly, ${res.aprobadas} aprobada(s) y enviables.`,
  };
}
