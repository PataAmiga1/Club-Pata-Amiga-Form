"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendChannelMessage, type Channel } from "@/lib/channels/meta";
import { comprobarVentana } from "@/lib/channels/ventana";

/** Guard local (mismo criterio que requireAdmin de admin/actions.ts). */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    throw new Error("Sin permisos");
  }
  return { adminId: user.id, admin: createAdminClient() };
}

/** Pausa (o reactiva) la IA en una conversación — el equipo toma el control. */
export async function toggleTakeover(conversationId: string, takeover: boolean) {
  const { admin } = await requireAdmin();
  await admin
    .from("channel_conversations")
    .update({ human_takeover: takeover })
    .eq("id", conversationId);
  revalidatePath("/admin/conversaciones");
}

/** Marca la conversación como leída y atendida (apaga el ❗ de atención). */
export async function markConversationRead(conversationId: string) {
  const { admin } = await requireAdmin();
  await admin
    .from("channel_conversations")
    .update({ last_admin_read_at: new Date().toISOString(), needs_attention: false })
    .eq("id", conversationId);
}

/** Cambia a mano la etapa del pipeline de ventas de una conversación. */
export async function setPipelineStage(conversationId: string, stage: string) {
  const { admin } = await requireAdmin();
  if (!["nuevo", "interesado", "convertido", "descartado", "soporte"].includes(stage)) {
    throw new Error("Etapa inválida");
  }
  await admin
    .from("channel_conversations")
    .update({ pipeline_stage: stage })
    .eq("id", conversationId);
  revalidatePath("/admin/conversaciones");
}

/**
 * Envía un mensaje manual del equipo por el canal de la conversación.
 * Se guarda siempre en BD; si el conector del canal no está configurado
 * (CONECTAR: ver docs/AGENTES-IA.md), devuelve sent=false para avisar en la UI.
 */
export async function sendAdminMessage(conversationId: string, text: string) {
  const { admin } = await requireAdmin();
  const clean = text.trim();
  if (!clean || clean.length > 2000) throw new Error("Mensaje inválido");

  const { data: conv } = await admin
    .from("channel_conversations")
    .select("channel, external_user_id")
    .eq("id", conversationId)
    .single();
  if (!conv) throw new Error("Conversación no encontrada");

  // Ventana de 24 h de Meta: fuera de ella no se guarda ni se intenta enviar.
  // La misma regla que la bandeja de ventas (src/lib/channels/ventana.ts).
  const ventanaCerrada = await comprobarVentana(admin, conversationId, conv.channel);
  if (ventanaCerrada) return { sent: false, error: ventanaCerrada };

  await admin.from("channel_messages").insert({
    conversation_id: conversationId,
    direction: "out",
    sender: "admin",
    content: clean,
  });
  // Responder a mano pausa la IA automáticamente: evita el choque de que el
  // contacto reciba dos respuestas (humana + IA) en el mismo hilo
  await admin
    .from("channel_conversations")
    .update({ last_message_at: new Date().toISOString(), human_takeover: true })
    .eq("id", conversationId);

  const sent = await sendChannelMessage(
    conv.channel as Channel,
    conv.external_user_id,
    clean,
  );
  revalidatePath("/admin/conversaciones");
  return { sent, error: null as string | null };
}

// ===== Promociones y material rotativo de los agentes IA =====

/** Crea una promoción/aviso que se inyecta al prompt mientras esté vigente. */
export async function createPromo(formData: FormData) {
  const { admin } = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const audience = String(formData.get("audience") ?? "both");
  const startsOn = String(formData.get("starts_on") ?? "").trim();
  const endsOn = String(formData.get("ends_on") ?? "").trim();
  if (!title || !content) throw new Error("Título y contenido son obligatorios");
  if (!["both", "support", "sales"].includes(audience)) throw new Error("Audiencia inválida");

  await admin.from("agent_promos").insert({
    title,
    content,
    audience,
    ...(startsOn ? { starts_on: startsOn } : {}),
    ends_on: endsOn || null,
  });
  revalidatePath("/admin/conversaciones");
}

/** Activa/desactiva una promoción sin borrarla (pausar campañas). */
export async function togglePromo(id: string, active: boolean) {
  const { admin } = await requireAdmin();
  await admin.from("agent_promos").update({ active }).eq("id", id);
  revalidatePath("/admin/conversaciones");
}

/** Elimina una promoción definitivamente. */
export async function deletePromo(id: string) {
  const { admin } = await requireAdmin();
  await admin.from("agent_promos").delete().eq("id", id);
  revalidatePath("/admin/conversaciones");
}
