"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/lib/panel-guard";
import { emitEvent } from "@/lib/crm/events";
import { attachIdentity, type IdentityKind } from "@/lib/crm/contacts";

/**
 * Acciones del CRM. TODAS validan la capacidad del lado del servidor: ocultar
 * un botón no protege nada (docs/portal-ventas/00, principio 3).
 *
 * Cada cambio relevante emite su evento con emitEvent, para que la línea de
 * tiempo del perfil cuente la historia completa sin que nadie tenga que
 * acordarse de escribirla.
 */

function revalidar(contactId?: string) {
  revalidatePath("/ventas/contactos");
  if (contactId) revalidatePath(`/ventas/contactos/${contactId}`);
  revalidatePath("/ventas");
}

// ------------------------------------------------------------- propietario --

export async function asignarPropietario(
  contactId: string,
  ownerId: string | null,
) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();

  await admin
    .from("contacts")
    .update({ owner_id: ownerId, updated_at: new Date().toISOString() })
    .eq("id", contactId);

  let nombre = "nadie";
  if (ownerId) {
    const { data } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", ownerId)
      .single();
    nombre = data?.first_name || data?.email || "alguien del equipo";
  }

  await emitEvent(admin, {
    contactId,
    kind: "propietario_asignado",
    summary: ownerId ? `Asignado a ${nombre}` : "Se quitó el propietario",
    actorId: userId,
  });
  revalidar(contactId);
  return { ok: true as const };
}

// --------------------------------------------------------------- etiquetas --

export async function alternarEtiqueta(
  contactId: string,
  tagId: string,
  agregar: boolean,
) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();

  const { data: tag } = await admin
    .from("tags")
    .select("name")
    .eq("id", tagId)
    .single();

  if (agregar) {
    await admin
      .from("contact_tags")
      .upsert(
        { contact_id: contactId, tag_id: tagId, added_by: userId },
        { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
      );
  } else {
    await admin
      .from("contact_tags")
      .delete()
      .eq("contact_id", contactId)
      .eq("tag_id", tagId);
  }

  await emitEvent(admin, {
    contactId,
    kind: agregar ? "etiqueta_agregada" : "etiqueta_quitada",
    summary: `${agregar ? "Etiqueta" : "Se quitó la etiqueta"} "${tag?.name ?? ""}"`,
    actorId: userId,
  });
  revalidar(contactId);
  return { ok: true as const };
}

export async function crearEtiqueta(nombre: string, color = "teal") {
  await requireCapability("contactos.editar");
  const limpio = nombre.trim().toLowerCase();
  if (!limpio) return { error: "Escribe el nombre de la etiqueta." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tags")
    .upsert({ name: limpio, color }, { onConflict: "name" })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear la etiqueta." };

  revalidar();
  return { ok: true as const, tagId: data.id };
}

// --------------------------------------------------------------------- DND --

const CANALES_DND = ["email", "whatsapp", "sms", "llamada", "todos"] as const;

export async function fijarDND(
  contactId: string,
  canal: (typeof CANALES_DND)[number],
  valor: boolean,
) {
  const { userId } = await requireCapability("contactos.editar");
  if (!CANALES_DND.includes(canal)) return { error: "Canal desconocido." };

  const admin = createAdminClient();
  const { data: actual } = await admin
    .from("contacts")
    .select("dnd")
    .eq("id", contactId)
    .single();

  const dnd = { ...((actual?.dnd as Record<string, boolean>) ?? {}) };
  if (valor) dnd[canal] = true;
  else delete dnd[canal];

  await admin
    .from("contacts")
    .update({ dnd, updated_at: new Date().toISOString() })
    .eq("id", contactId);

  await emitEvent(admin, {
    contactId,
    kind: "nota",
    summary: valor
      ? `No contactar por ${canal}`
      : `Se reactivó el contacto por ${canal}`,
    payload: { dnd },
    actorId: userId,
  });
  revalidar(contactId);
  return { ok: true as const };
}

// ------------------------------------------------------------ datos y notas --

export async function actualizarContacto(
  contactId: string,
  patch: {
    first_name?: string | null;
    last_name?: string | null;
    city?: string | null;
    state?: string | null;
    source?: string | null;
    contact_type?: string | null;
    birth_date?: string | null;
  },
) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();

  const limpio: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    limpio[key] = typeof value === "string" && value.trim() === "" ? null : value;
  }
  if (Object.keys(limpio).length === 0) return { ok: true as const };
  limpio.updated_at = new Date().toISOString();

  const { error } = await admin
    .from("contacts")
    .update(limpio)
    .eq("id", contactId);
  if (error) return { error: "No se pudieron guardar los cambios." };

  await emitEvent(admin, {
    contactId,
    kind: "nota",
    summary: "Datos del contacto actualizados",
    payload: { campos: Object.keys(limpio).filter((k) => k !== "updated_at") },
    actorId: userId,
  });
  revalidar(contactId);
  return { ok: true as const };
}

/** Agrega un correo o teléfono al contacto (el ⊕ del perfil). */
export async function agregarIdentidad(
  contactId: string,
  kind: IdentityKind,
  valor: string,
) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();

  const ok = await attachIdentity(admin, contactId, kind, valor);
  if (!ok)
    return {
      error:
        "No se pudo agregar: revisa el formato, o ya pertenece a otro contacto.",
    };

  await emitEvent(admin, {
    contactId,
    kind: "nota",
    summary: `Se agregó ${kind === "email" ? "un correo" : "un teléfono"}`,
    actorId: userId,
  });
  revalidar(contactId);
  return { ok: true as const };
}

export async function agregarNota(contactId: string, texto: string) {
  const { userId } = await requireCapability("contactos.editar");
  const nota = texto.trim();
  if (!nota) return { error: "Escribe la nota." };

  const admin = createAdminClient();
  await emitEvent(admin, {
    contactId,
    kind: "nota",
    summary: nota,
    actorId: userId,
  });
  // El contador de notas de la tarjeta se recalcula, no se incrementa: así no
  // se desincroniza si una nota se borra o si dos personas escriben a la vez.
  const { count } = await admin
    .from("contact_activities")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("kind", "nota");
  await admin
    .from("contacts")
    .update({ notes_count: count ?? 0 })
    .eq("id", contactId);

  revalidar(contactId);
  return { ok: true as const };
}

// ------------------------------------------------------------------ tareas --

export async function crearTarea(
  contactId: string,
  titulo: string,
  dueAt: string | null,
  assignedTo: string | null,
) {
  const { userId } = await requireCapability("contactos.editar");
  const nombre = titulo.trim();
  if (!nombre) return { error: "Escribe qué hay que hacer." };

  const admin = createAdminClient();
  await admin.from("tasks").insert({
    contact_id: contactId,
    title: nombre,
    due_at: dueAt || null,
    assigned_to: assignedTo || userId,
    created_by: userId,
  });
  await emitEvent(admin, {
    contactId,
    kind: "tarea_creada",
    summary: `Tarea: ${nombre}`,
    actorId: userId,
  });
  await recontarTareas(admin, contactId);
  revalidar(contactId);
  return { ok: true as const };
}

export async function completarTarea(taskId: string) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();

  const { data: tarea } = await admin
    .from("tasks")
    .select("contact_id, title")
    .eq("id", taskId)
    .single();

  await admin
    .from("tasks")
    .update({ completed_at: new Date().toISOString(), completed_by: userId })
    .eq("id", taskId);

  if (tarea?.contact_id) {
    await emitEvent(admin, {
      contactId: tarea.contact_id,
      kind: "tarea_completada",
      summary: `Tarea completada: ${tarea.title}`,
      actorId: userId,
    });
    await recontarTareas(admin, tarea.contact_id);
    revalidar(tarea.contact_id);
  }
  return { ok: true as const };
}

async function recontarTareas(
  admin: ReturnType<typeof createAdminClient>,
  contactId: string,
) {
  const { count } = await admin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .is("completed_at", null);
  await admin
    .from("contacts")
    .update({ tasks_open_count: count ?? 0 })
    .eq("id", contactId);
}

// -------------------------------------------------------------- seguidores --

export async function seguirContacto(contactId: string, seguir: boolean) {
  const { userId } = await requireCapability("contactos.ver");
  const admin = createAdminClient();

  if (seguir) {
    await admin
      .from("contact_followers")
      .upsert(
        { contact_id: contactId, user_id: userId },
        { onConflict: "contact_id,user_id", ignoreDuplicates: true },
      );
  } else {
    await admin
      .from("contact_followers")
      .delete()
      .eq("contact_id", contactId)
      .eq("user_id", userId);
  }
  revalidar(contactId);
  return { ok: true as const };
}

// ---------------------------------------------------------- campos propios --

export async function crearDefinicionCampo(input: {
  label: string;
  type: "texto" | "numero" | "fecha" | "seleccion" | "booleano";
  group?: string;
  options?: string[];
}) {
  await requireCapability("campos.administrar");
  const label = input.label.trim();
  if (!label) return { error: "Escribe el nombre del campo." };

  const key = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!key) return { error: "El nombre no genera una llave válida." };

  const admin = createAdminClient();
  const { error } = await admin.from("custom_field_defs").insert({
    key,
    label,
    field_group: input.group?.trim() || null,
    type: input.type,
    options: input.options ?? [],
    // Un campo NO puede cambiar de contacto a oportunidad después de creado.
    applies_to: "contact",
  });
  if (error)
    return { error: "No se pudo crear el campo (¿ya existe uno con ese nombre?)." };

  revalidar();
  return { ok: true as const };
}

export async function guardarCampoPersonalizado(
  contactId: string,
  key: string,
  valor: string | number | boolean | null,
) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();

  const { data: actual } = await admin
    .from("contacts")
    .select("custom_fields")
    .eq("id", contactId)
    .single();

  const campos = { ...((actual?.custom_fields as Record<string, unknown>) ?? {}) };
  if (valor === null || valor === "") delete campos[key];
  else campos[key] = valor;

  await admin
    .from("contacts")
    .update({ custom_fields: campos, updated_at: new Date().toISOString() })
    .eq("id", contactId);

  await emitEvent(admin, {
    contactId,
    kind: "nota",
    summary: `Campo "${key}" actualizado`,
    actorId: userId,
  });
  revalidar(contactId);
  return { ok: true as const };
}

// ------------------------------------------------------- acciones en lote --

export async function accionesEnLote(
  ids: string[],
  accion: { tagId?: string; ownerId?: string | null },
) {
  const { userId } = await requireCapability("contactos.editar");
  if (ids.length === 0) return { error: "Selecciona al menos un contacto." };

  const admin = createAdminClient();
  let aplicados = 0;

  if (accion.tagId) {
    await admin.from("contact_tags").upsert(
      ids.map((id) => ({
        contact_id: id,
        tag_id: accion.tagId!,
        added_by: userId,
      })),
      { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
    );
    const { data: tag } = await admin
      .from("tags")
      .select("name")
      .eq("id", accion.tagId)
      .single();
    for (const id of ids)
      await emitEvent(admin, {
        contactId: id,
        kind: "etiqueta_agregada",
        summary: `Etiqueta "${tag?.name ?? ""}" (en lote)`,
        actorId: userId,
      });
    aplicados = ids.length;
  }

  if (accion.ownerId !== undefined) {
    await admin
      .from("contacts")
      .update({ owner_id: accion.ownerId, updated_at: new Date().toISOString() })
      .in("id", ids);
    for (const id of ids)
      await emitEvent(admin, {
        contactId: id,
        kind: "propietario_asignado",
        summary: accion.ownerId
          ? "Propietario asignado (en lote)"
          : "Propietario quitado (en lote)",
        actorId: userId,
      });
    aplicados = ids.length;
  }

  revalidar();
  return { ok: true as const, aplicados };
}

// ------------------------------------------------------- vistas guardadas --

export async function guardarVista(
  kind: "contactos" | "oportunidades",
  nombre: string,
  filters: Record<string, string>,
  compartida: boolean,
) {
  const { userId } = await requireCapability("contactos.ver");
  const name = nombre.trim();
  if (!name) return { error: "Ponle nombre a la vista." };

  const admin = createAdminClient();
  const { error } = await admin.from("saved_views").insert({
    kind,
    name,
    filters,
    owner_id: compartida ? null : userId,
  });
  if (error) return { error: "No se pudo guardar la vista." };

  revalidar();
  return { ok: true as const };
}

export async function borrarVista(id: string) {
  const { userId } = await requireCapability("contactos.ver");
  const admin = createAdminClient();
  // Las del equipo (owner_id null) solo las quita quien puede aprobar; la RLS
  // ya lo exige, aquí se evita el intento silencioso.
  const { data: vista } = await admin
    .from("saved_views")
    .select("owner_id")
    .eq("id", id)
    .single();
  if (vista && vista.owner_id !== null && vista.owner_id !== userId)
    return { error: "Esa vista es de otra persona." };
  if (vista && vista.owner_id === null)
    await requireCapability("contactos.fusionar"); // gerente y arriba

  await admin.from("saved_views").delete().eq("id", id);
  revalidar();
  return { ok: true as const };
}
