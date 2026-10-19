import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendChannelMessage } from "@/lib/channels/meta";
import { enviarCorreo } from "@/lib/channels/email";
import { enviarTextoPorFlowly } from "@/lib/channels/flowly/bandeja";
import { emitEvent } from "@/lib/crm/events";
import { uno } from "@/lib/crm/embed";
import { comprobarVentana } from "@/lib/channels/ventana";

/**
 * Despachador de los mensajes programados ("le escribo el lunes a las 9").
 *
 * La cola la llena el compositor de la bandeja; esto es lo que la vacía. Corre
 * cada 10 minutos: una precisión de minutos no vale la pena para un mensaje de
 * seguimiento, y menos invocaciones es menos costo.
 *
 * Si un envío falla queda el motivo en el mensaje y el equipo lo ve en el hilo:
 * un mensaje que no salió y nadie lo supo es peor que uno que no se programó.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const esVercel = request.headers.get("x-vercel-cron") !== null;
  if (!esVercel && secret && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Sin permisos" }, { status: 401 });

  const admin = createAdminClient();

  const { data: pendientes } = await admin
    .from("channel_messages")
    .select(
      "id, conversation_id, content, author_id, channel_conversations(channel, external_user_id, contact_id, provider, flowly_conversation_id)",
    )
    .not("scheduled_for", "is", null)
    .is("sent_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .limit(100);

  let enviados = 0;
  let fallidos = 0;

  for (const msg of pendientes ?? []) {
    const hilo = uno(msg.channel_conversations);
    if (!hilo) continue;

    let error: string | null = null;

    if (hilo.channel === "email") {
      const res = await enviarCorreo(admin, {
        conversationId: msg.conversation_id,
        texto: msg.content,
      });
      if (res.ok)
        await admin
          .from("channel_messages")
          .update({ message_id: res.messageId })
          .eq("id", msg.id);
      else error = res.error;
    } else if (hilo.provider === "flowly") {
      // Hilo de Flowly: sale por Flowly con la llave de la fila, así que si
      // esta tarea corre dos veces sobre el mismo mensaje no se duplica.
      const res = await enviarTextoPorFlowly(admin, {
        conversationId: msg.conversation_id,
        flowlyConversationId: hilo.flowly_conversation_id,
        filaId: msg.id,
        texto: msg.content,
        userId: msg.author_id,
      });
      if (!res.ok) error = res.error;
    } else if (["facebook", "instagram", "whatsapp"].includes(hilo.channel)) {
      // La ventana de 24 h se vuelve a revisar al SALIR (no basta con que
      // estuviera abierta al programar): si se cerró, el mensaje queda con su
      // motivo; si la persona volvió a escribir entretanto, sí sale.
      error = await comprobarVentana(admin, msg.conversation_id, hilo.channel);
      if (!error) {
        const salio = await sendChannelMessage(
          hilo.channel as "facebook" | "instagram" | "whatsapp",
          hilo.external_user_id,
          msg.content,
        );
        if (!salio) error = "El conector del canal no está configurado";
      }
    } else {
      error = `El canal ${hilo.channel} no admite envíos`;
    }

    await admin
      .from("channel_messages")
      .update(
        error
          ? { send_error: error }
          : { sent_at: new Date().toISOString(), send_error: null },
      )
      .eq("id", msg.id);

    if (!error) {
      enviados += 1;
      await admin
        .from("channel_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", msg.conversation_id);
    } else {
      fallidos += 1;
    }

    if (hilo.contact_id)
      await emitEvent(admin, {
        contactId: hilo.contact_id,
        kind: "mensaje_enviado",
        summary: error
          ? `Un mensaje programado no salió: ${error}`
          : `Salió el mensaje programado: "${msg.content.slice(0, 100)}"`,
        payload: { conversationId: msg.conversation_id, messageId: msg.id },
        actorLabel: "Envío programado",
      });
  }

  return NextResponse.json({
    ok: true,
    revisados: pendientes?.length ?? 0,
    enviados,
    fallidos,
  });
}
