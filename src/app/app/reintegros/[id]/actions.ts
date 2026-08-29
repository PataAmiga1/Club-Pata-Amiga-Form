"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeam } from "@/lib/alerts";
import {
  sanearAdjuntos,
  type AdjuntoConversacion,
} from "@/lib/documentos-conversacion";

/**
 * Respuesta del miembro en el hilo de su reintegro — mismo patrón que el
 * hilo por mascota: cada área tiene su propia conversación con el comité.
 */
export async function replyReimbursementThread(
  reimbursementId: string,
  message: string,
  documents?: AdjuntoConversacion[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const text = message?.trim() ?? "";
  const adjuntos = sanearAdjuntos(documents);
  if (text.length < 2 && !adjuntos.length)
    return { error: "Escribe tu mensaje o adjunta un archivo." };

  const admin = createAdminClient();
  const { data: req } = await admin
    .from("reimbursements")
    .select("id, folio, user_id")
    .eq("id", reimbursementId)
    .single();
  if (!req || req.user_id !== user.id)
    return { error: "No encontramos tu solicitud." };

  await admin.from("reimbursement_messages").insert({
    reimbursement_id: reimbursementId,
    sender: "member",
    author_id: user.id,
    message: text || "(envió archivos)",
    documents: adjuntos,
  });

  await notifyTeam(
    "notify_reimbursements",
    `Respuesta en el reintegro ${req.folio} 💬`,
    `<h2 style="color:#1E5350">El miembro respondió sobre ${req.folio}</h2>
     <p>${text || "(sin texto)"}</p>
     ${adjuntos.length ? `<p>Adjuntó ${adjuntos.length} archivo(s).</p>` : ""}
     <p>Revisa el hilo en el panel → Reintegros.</p>`,
  );

  revalidatePath(`/app/reintegros/${reimbursementId}`);
  return { ok: true as const };
}
