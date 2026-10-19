"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/lib/panel-guard";
import { emitEvent } from "@/lib/crm/events";
import { sendChannelMessage, sendWhatsAppTemplate } from "@/lib/channels/meta";
import { enviarCorreo } from "@/lib/channels/email";
import { comprobarVentana } from "@/lib/channels/ventana";
import {
  renderizar,
  valoresDelContacto,
  variablesVacias,
} from "@/lib/crm/plantillas";

/** Canales de Meta por los que la plataforma sabe responder. */
const ENVIABLES = ["facebook", "instagram", "whatsapp"] as const;

/**
 * Acciones de la bandeja unificada.
 *
 * Regla de la sección 2: tomar una conversación apaga la IA en ese hilo, y
 * devolverla la vuelve a encender — con rastro de quién y cuándo. Antes solo
 * existía la ida; sin la vuelta, un hilo tocado una vez quedaba manual para
 * siempre.
 */

function revalidar() {
  revalidatePath("/ventas/conversaciones");
  revalidatePath("/admin/conversaciones");
  revalidatePath("/ventas");
}

/** Nombre legible del hilo, para los textos de la bitácora. */
async function datosHilo(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
) {
  const { data } = await admin
    .from("channel_conversations")
    .select("id, channel, display_name, contact_id, human_takeover, external_user_id")
    .eq("id", conversationId)
    .maybeSingle();
  return data;
}

// ------------------------------------------------------------- leído -------

/** Marca el hilo como leído PARA MÍ (no para los demás). */
export async function marcarLeido(conversationId: string) {
  const { userId } = await requireCapability("contactos.ver");
  const admin = createAdminClient();
  await admin.from("conversation_reads").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
  revalidar();
  return { ok: true as const };
}

/** Vuelve a marcarlo como no leído para mí (la acción del encabezado). */
export async function marcarNoLeido(conversationId: string) {
  const { userId } = await requireCapability("contactos.ver");
  const admin = createAdminClient();
  await admin
    .from("conversation_reads")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  revalidar();
  return { ok: true as const };
}

// ------------------------------------------------------------ triaje ------

/** Tomar el hilo: se asigna a quien lo toma y apaga la IA. */
export async function tomarConversacion(conversationId: string) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();
  const hilo = await datosHilo(admin, conversationId);

  await admin
    .from("channel_conversations")
    .update({
      assigned_to: userId,
      human_takeover: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (hilo?.contact_id)
    await emitEvent(admin, {
      contactId: hilo.contact_id,
      kind: "nota",
      summary: "Tomó la conversación (la IA deja de responder en este hilo)",
      payload: { conversationId },
      actorId: userId,
    });

  revalidar();
  return { ok: true as const };
}

/** Devolver el hilo a la IA. Es la salida que antes no existía. */
export async function devolverAlAgente(conversationId: string) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();
  const hilo = await datosHilo(admin, conversationId);

  await admin
    .from("channel_conversations")
    .update({
      human_takeover: false,
      needs_attention: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (hilo?.contact_id)
    await emitEvent(admin, {
      contactId: hilo.contact_id,
      kind: "nota",
      summary: "Devolvió la conversación al asistente (la IA vuelve a responder)",
      payload: { conversationId },
      actorId: userId,
    });

  revalidar();
  return { ok: true as const };
}

export async function asignarConversacion(
  conversationId: string,
  ownerId: string | null,
) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();
  const hilo = await datosHilo(admin, conversationId);

  await admin
    .from("channel_conversations")
    .update({ assigned_to: ownerId, updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (hilo?.contact_id) {
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
      contactId: hilo.contact_id,
      kind: "nota",
      summary: ownerId
        ? `Conversación asignada a ${nombre}`
        : "Conversación sin asignar",
      payload: { conversationId },
      actorId: userId,
    });
  }

  revalidar();
  return { ok: true as const };
}

/** Posponer: sale de la lista y regresa sola en la fecha elegida. */
export async function posponer(conversationId: string, hasta: string | null) {
  await requireCapability("contactos.editar");
  const admin = createAdminClient();
  await admin
    .from("channel_conversations")
    .update({ snoozed_until: hasta, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  revalidar();
  return { ok: true as const };
}

/** Destacar es por persona: la estrella de cada quien. */
export async function alternarDestacado(conversationId: string) {
  const { userId } = await requireCapability("contactos.ver");
  const admin = createAdminClient();

  const { data } = await admin
    .from("channel_conversations")
    .select("starred_by")
    .eq("id", conversationId)
    .maybeSingle();

  const actual = (data?.starred_by ?? []) as string[];
  const nuevo = actual.includes(userId)
    ? actual.filter((id) => id !== userId)
    : [...actual, userId];

  await admin
    .from("channel_conversations")
    .update({ starred_by: nuevo })
    .eq("id", conversationId);
  revalidar();
  return { ok: true as const, destacado: nuevo.includes(userId) };
}

export async function archivar(conversationId: string, cerrar: boolean) {
  await requireCapability("contactos.editar");
  const admin = createAdminClient();
  await admin
    .from("channel_conversations")
    .update({
      status: cerrar ? "closed" : "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
  revalidar();
  return { ok: true as const };
}

// --------------------------------------------------------- mensajes -------

/**
 * Envía un mensaje por el canal del hilo.
 *
 * Si el conector no está configurado (desarrollo), el mensaje queda guardado con
 * su error de envío en lugar de perderse: el equipo ve qué se intentó decir.
 */
export async function enviarMensaje(
  conversationId: string,
  texto: string,
  opciones?: {
    interna?: boolean;
    programarPara?: string | null;
    /** Rutas en el bucket channel-attachments. */
    adjuntos?: { ruta: string; nombre: string }[];
  },
) {
  const { userId } = await requireCapability("contactos.editar");
  const contenido = texto.trim();
  if (!contenido) return { error: "Escribe el mensaje." };

  const admin = createAdminClient();
  const hilo = await datosHilo(admin, conversationId);
  if (!hilo) return { error: "La conversación no existe." };

  const esInterna = opciones?.interna === true;
  const programado = opciones?.programarPara ?? null;

  // Nota interna: vive en el hilo pero NUNCA sale al cliente.
  if (esInterna) {
    await admin.from("channel_messages").insert({
      conversation_id: conversationId,
      direction: "out",
      sender: "admin",
      author_id: userId,
      content: contenido,
      internal: true,
      sent_at: new Date().toISOString(),
    });
    if (hilo.contact_id)
      await emitEvent(admin, {
        contactId: hilo.contact_id,
        kind: "nota",
        summary: contenido,
        payload: { conversationId, interna: true },
        actorId: userId,
      });
    revalidar();
    return { ok: true as const };
  }

  // No contactar: se respeta antes de intentar el envío.
  if (hilo.contact_id) {
    const { data: contacto } = await admin
      .from("contacts")
      .select("dnd")
      .eq("id", hilo.contact_id)
      .maybeSingle();
    const dnd = (contacto?.dnd as Record<string, boolean>) ?? {};
    const canalDnd = hilo.channel === "email" ? "email" : hilo.channel;
    if (dnd.todos || dnd[canalDnd])
      return {
        error: `Este contacto pidió no ser contactado por ${dnd.todos ? "ningún canal" : canalDnd}.`,
      };
  }

  // Ventana de 24 h de Meta: fuera de ella no hay texto libre (sí plantillas,
  // que van por enviarPlantillaWhatsApp). Antes solo lo bloqueaba la interfaz.
  // También aplica a los programados: el despachador lo vuelve a revisar al
  // enviarlo, por si la persona escribió de nuevo entretanto.
  const ventanaCerrada = await comprobarVentana(admin, conversationId, hilo.channel);
  if (ventanaCerrada) return { error: ventanaCerrada };

  const { data: guardado, error: errorGuardar } = await admin
    .from("channel_messages")
    .insert({
      conversation_id: conversationId,
      direction: "out",
      sender: "admin",
      author_id: userId,
      content: contenido,
      attachments: opciones?.adjuntos ?? [],
      scheduled_for: programado,
      ...(programado ? {} : { sent_at: new Date().toISOString() }),
    })
    .select("id")
    .single();
  if (errorGuardar || !guardado)
    return { error: "No se pudo guardar el mensaje." };

  // Programado: lo manda la tarea; aquí solo queda encolado.
  if (programado) {
    revalidar();
    return { ok: true as const, programado: true };
  }

  // El envío real solo existe para los canales de Meta. El correo llega en la
  // fase 2b y las superficies del portal son de supervisión (solo lectura), así
  // que ahí el mensaje queda guardado con su motivo a la vista en lugar de
  // aparentar que salió.
  let errorEnvio: string | null = null;
  if (hilo.channel === "email") {
    // El correo lleva sus propios encabezados para que la respuesta del cliente
    // vuelva a caer en este hilo (fase 2b).
    const res = await enviarCorreo(admin, {
      conversationId,
      texto: contenido,
    });
    if (res.ok) {
      await admin
        .from("channel_messages")
        .update({ message_id: res.messageId })
        .eq("id", guardado.id);
    } else {
      errorEnvio = res.error;
    }
  } else if (ENVIABLES.includes(hilo.channel as (typeof ENVIABLES)[number])) {
    try {
      const salio = await sendChannelMessage(
        hilo.channel as (typeof ENVIABLES)[number],
        hilo.external_user_id,
        contenido,
      );
      // sendChannelMessage devuelve false (no lanza) cuando el conector no está
      // configurado, como en desarrollo.
      if (!salio) errorEnvio = "El conector del canal no está configurado";
    } catch (err) {
      errorEnvio = err instanceof Error ? err.message : "Falló el envío";
    }
  } else {
    errorEnvio = `El canal ${hilo.channel} es de supervisión: no se responde desde aquí`;
  }

  if (errorEnvio)
    await admin
      .from("channel_messages")
      .update({ send_error: errorEnvio, sent_at: null })
      .eq("id", guardado.id);

  await admin
    .from("channel_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (hilo.contact_id)
    await emitEvent(admin, {
      contactId: hilo.contact_id,
      kind: "mensaje_enviado",
      summary: `Respuesta por ${hilo.channel}: "${contenido.slice(0, 120)}"`,
      payload: { conversationId, error: errorEnvio },
      actorId: userId,
    });

  revalidar();
  return errorEnvio
    ? { ok: true as const, aviso: `Quedó guardado, pero no salió: ${errorEnvio}` }
    : { ok: true as const };
}

// ------------------------------------------------------------ plantillas --

/**
 * Prepara una plantilla para este hilo: resuelve las {{variables}} con los datos
 * reales del contacto y avisa cuáles quedaron vacías, para que nadie mande un
 * "Hola {{nombre}}".
 */
export async function previsualizarPlantilla(
  conversationId: string,
  templateId: string,
) {
  const { userId } = await requireCapability("contactos.ver");
  const admin = createAdminClient();

  const [{ data: plantilla }, { data: hilo }, { data: yo }] = await Promise.all([
    admin
      .from("message_templates")
      .select("id, name, body, subject, assets")
      .eq("id", templateId)
      .maybeSingle(),
    admin
      .from("channel_conversations")
      .select("contact_id")
      .eq("id", conversationId)
      .maybeSingle(),
    admin.from("profiles").select("first_name, email").eq("id", userId).single(),
  ]);
  if (!plantilla) return { error: "La plantilla ya no existe." };

  const asesor = yo?.first_name || yo?.email?.split("@")[0] || "el equipo";
  const valores = await valoresDelContacto(admin, hilo?.contact_id ?? null, asesor);

  return {
    ok: true as const,
    nombre: plantilla.name,
    texto: renderizar(plantilla.body, valores),
    asunto: plantilla.subject ? renderizar(plantilla.subject, valores) : null,
    adjuntos: (plantilla.assets as string[]) ?? [],
    faltantes: variablesVacias(plantilla.body, valores),
  };
}

/** Sube un adjunto al bucket privado y devuelve su ruta. */
export async function subirAdjunto(formData: FormData) {
  await requireCapability("contactos.editar");
  const archivo = formData.get("file");
  if (!(archivo instanceof File) || archivo.size === 0)
    return { error: "Elige un archivo." };
  if (archivo.size > 15 * 1024 * 1024)
    return { error: "El archivo pasa de 15 MB." };

  const admin = createAdminClient();
  const ext = (archivo.name.split(".").pop() || "bin").toLowerCase();
  const ruta = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const { error } = await admin.storage
    .from("channel-attachments")
    .upload(ruta, archivo, { contentType: archivo.type });
  if (error) return { error: "No se pudo subir el archivo." };

  return { ok: true as const, ruta, nombre: archivo.name };
}

/**
 * Manda una plantilla aprobada de WhatsApp. Es la salida del callejón de las
 * 24 h: fuera de la ventana no se puede escribir texto libre, pero sí esto.
 */
export async function enviarPlantillaWhatsApp(
  conversationId: string,
  templateId: string,
) {
  const { userId } = await requireCapability("contactos.editar");
  const admin = createAdminClient();

  const [{ data: hilo }, { data: plantilla }] = await Promise.all([
    admin
      .from("channel_conversations")
      .select("id, channel, external_user_id, contact_id")
      .eq("id", conversationId)
      .maybeSingle(),
    admin
      .from("whatsapp_templates")
      .select("meta_name, language, body_preview, status, variables")
      .eq("id", templateId)
      .maybeSingle(),
  ]);
  if (!hilo || hilo.channel !== "whatsapp")
    return { error: "Este hilo no es de WhatsApp." };
  if (!plantilla) return { error: "La plantilla ya no existe." };
  if (plantilla.status !== "aprobada")
    return {
      error: `Meta todavía no aprueba "${plantilla.meta_name}" (está ${plantilla.status}).`,
    };

  // El primer parámetro de las plantillas del catálogo es el nombre.
  const valores = await valoresDelContacto(admin, hilo.contact_id, "");
  const parametros =
    plantilla.variables > 0 ? [valores.nombre || "hola"] : [];

  const res = await sendWhatsAppTemplate(
    hilo.external_user_id,
    plantilla.meta_name,
    plantilla.language,
    parametros,
  );

  const texto = renderizar(
    plantilla.body_preview.replace(/\{\{1\}\}/g, "{{nombre}}"),
    valores,
  );

  await admin.from("channel_messages").insert({
    conversation_id: conversationId,
    direction: "out",
    sender: "admin",
    author_id: userId,
    content: `[plantilla ${plantilla.meta_name}] ${texto}`,
    ...(res.ok
      ? { sent_at: new Date().toISOString() }
      : { send_error: res.error }),
  });

  if (hilo.contact_id)
    await emitEvent(admin, {
      contactId: hilo.contact_id,
      kind: "mensaje_enviado",
      summary: `Plantilla de WhatsApp "${plantilla.meta_name}"${res.ok ? "" : " (no salió)"}`,
      payload: { conversationId, error: res.ok ? null : res.error },
      actorId: userId,
    });

  revalidar();
  return res.ok
    ? { ok: true as const }
    : { ok: true as const, aviso: `Quedó guardada, pero no salió: ${res.error}` };
}

/** Pulgar arriba/abajo sobre una respuesta de la IA. */
export async function votarMensaje(
  messageId: string,
  valor: 1 | -1,
  nota?: string,
) {
  const { userId } = await requireCapability("contactos.ver");
  const admin = createAdminClient();
  await admin.from("message_feedback").upsert(
    {
      message_id: messageId,
      user_id: userId,
      value: valor,
      note: nota?.trim() || null,
    },
    { onConflict: "message_id,user_id" },
  );
  revalidar();
  return { ok: true as const };
}

// ------------------------------------------------------ acciones en lote --

export async function loteBandeja(
  ids: string[],
  accion: { leer?: boolean; asignar?: string | null; cerrar?: boolean },
) {
  const { userId } = await requireCapability("contactos.editar");
  if (ids.length === 0) return { error: "Selecciona al menos una conversación." };

  const admin = createAdminClient();

  if (accion.leer) {
    await admin.from("conversation_reads").upsert(
      ids.map((id) => ({
        conversation_id: id,
        user_id: userId,
        last_read_at: new Date().toISOString(),
      })),
      { onConflict: "conversation_id,user_id" },
    );
  }
  if (accion.asignar !== undefined) {
    await admin
      .from("channel_conversations")
      .update({ assigned_to: accion.asignar, updated_at: new Date().toISOString() })
      .in("id", ids);
  }
  if (accion.cerrar !== undefined) {
    await admin
      .from("channel_conversations")
      .update({ status: accion.cerrar ? "closed" : "open" })
      .in("id", ids);
  }

  revalidar();
  return { ok: true as const, aplicados: ids.length };
}
