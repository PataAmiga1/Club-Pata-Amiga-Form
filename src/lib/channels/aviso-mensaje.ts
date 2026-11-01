import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeam } from "@/lib/alerts";
import { selloDeReferral } from "@/lib/channels/flowly/mapeo";
import type { ReferralFlowly } from "@/lib/channels/flowly/tipos";
import { correoDeAviso, motivoDeAviso } from "@/lib/channels/aviso-mensaje-reglas";

type Admin = ReturnType<typeof createAdminClient>;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pataamiga.mx";

/**
 * Avisa por correo (destinatarios en /admin/sitio → «Nuevo mensaje en
 * WhatsApp, Messenger o Instagram») cuando una persona escribe por primera vez
 * o vuelve a escribir tras 6+ horas, para que ningún prospecto de los anuncios
 * se quede sin respuesta.
 *
 * Se llama desde los DOS caminos de entrada (webhook directo de Meta y Flowly)
 * justo después de guardar el mensaje entrante y solo si no era un duplicado.
 * La decisión sale de la base (el mensaje entrante anterior), no de quién
 * llamó, así que vale igual para los dos.
 *
 * Nunca lanza ni tarda en fallar el flujo: un aviso perdido es mejor que una
 * respuesta perdida.
 */
export async function avisarMensajeEntrante(
  admin: Admin,
  m: { conversationId: string; messageId: string; createdAt: string; texto: string },
): Promise<void> {
  try {
    const [{ data: conv }, { data: anterior }] = await Promise.all([
      admin
        .from("channel_conversations")
        .select("channel, display_name, external_user_id, first_referral, last_referral")
        .eq("id", m.conversationId)
        .maybeSingle(),
      admin
        .from("channel_messages")
        .select("created_at")
        .eq("conversation_id", m.conversationId)
        .eq("direction", "in")
        .neq("id", m.messageId)
        .lte("created_at", m.createdAt)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!conv) return;

    const motivo = motivoDeAviso({
      direction: "in",
      channel: conv.channel,
      createdAt: m.createdAt,
      entranteAnteriorAt: anterior?.created_at ?? null,
    });
    if (!motivo) return;

    // En WhatsApp el id externo es el número; en Instagram por Flowly es
    // «ig:usuario». Los demás son ids internos de Meta/Flowly que no le sirven
    // a nadie, así que no se muestran.
    const externo = String(conv.external_user_id ?? "");
    const contacto =
      conv.channel === "whatsapp" && /^\+?\d{8,15}$/.test(externo)
        ? `+${externo.replace(/^\+/, "")}`
        : conv.channel === "instagram" && externo.startsWith("ig:")
          ? `@${externo.slice(3)}`
          : null;

    const referral = (conv.last_referral ?? conv.first_referral ?? null) as ReferralFlowly | null;

    const { asunto, html } = correoDeAviso({
      motivo,
      channel: conv.channel,
      displayName: conv.display_name ?? null,
      contacto,
      texto: m.texto,
      anuncio: selloDeReferral(referral),
      url: `${SITE_URL}/ventas/conversaciones?conv=${encodeURIComponent(m.conversationId)}`,
    });
    await notifyTeam("notify_channel_new_message", asunto, html);
  } catch (err) {
    console.error("[canales] no se pudo avisar del mensaje entrante", err);
  }
}
