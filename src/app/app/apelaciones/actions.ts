"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email/send";
import { notifyTeam } from "@/lib/alerts";
import { APPEAL_MAX_PER_SUBJECT, CENTER_APPEAL_MAX } from "@/lib/constants";
import { beneficiosDeUsuario } from "@/lib/plans/resolve";

export type AppealInput = {
  reimbursementId?: string;
  petId?: string;
  centerId?: string;
  message: string;
};

/**
 * Presenta una apelación sobre un reintegro rechazado, una mascota denegada
 * o un centro aliado rechazado (nota del cliente 16-jul). Reglas (heredadas
 * del sistema anterior): máximo 2 apelaciones por sujeto y solo una
 * pendiente a la vez. Las resuelve exclusivamente el super admin.
 */
export async function submitAppeal(input: AppealInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const message = input.message?.trim();
  if (!message || message.length < 10)
    return { error: "Cuéntanos tu caso con al menos 10 caracteres." };
  if (!input.reimbursementId && !input.petId && !input.centerId)
    return { error: "Falta el sujeto de la apelación." };

  const admin = createAdminClient();
  let subjectLabel = "";

  if (input.reimbursementId) {
    const { data: r } = await admin
      .from("reimbursements")
      .select("id, folio, status, user_id")
      .eq("id", input.reimbursementId)
      .single();
    if (!r || r.user_id !== user.id)
      return { error: "No encontramos esa solicitud." };
    if (r.status !== "rejected")
      return { error: "Solo se apelan solicitudes rechazadas." };
    subjectLabel = `el reintegro ${r.folio}`;
  } else if (input.petId) {
    const { data: p } = await admin
      .from("pets")
      .select("id, name, approval_status, user_id")
      .eq("id", input.petId)
      .single();
    if (!p || p.user_id !== user.id)
      return { error: "No encontramos esa mascota." };
    if (p.approval_status !== "rejected")
      return { error: "Solo se apelan fichas denegadas." };
    subjectLabel = `la ficha de ${p.name}`;
  } else if (input.centerId) {
    const { data: c } = await admin
      .from("wellness_centers")
      .select("id, name, status, user_id")
      .eq("id", input.centerId)
      .single();
    if (!c || c.user_id !== user.id)
      return { error: "No encontramos ese centro." };
    if (c.status !== "rejected")
      return { error: "Solo se apelan solicitudes rechazadas." };
    subjectLabel = `la solicitud del centro ${c.name}`;
  }

  const subjectFilter = input.reimbursementId
    ? { column: "reimbursement_id", value: input.reimbursementId }
    : input.petId
      ? { column: "pet_id", value: input.petId }
      : { column: "center_id", value: input.centerId! };

  const { data: previous } = await admin
    .from("appeals")
    .select("id, status")
    .eq(subjectFilter.column, subjectFilter.value);
  if ((previous ?? []).some((a) => a.status === "pending"))
    return { error: "Ya hay una apelación en revisión para este caso." };

  // Los centros de bienestar apelan UNA sola vez y no dependen de un plan
  // contratado (junta 10-ago). Para miembros y mascotas el máximo sale del plan
  // que contrató esa persona, no de una constante global: quien contrató 2
  // apelaciones conserva 2 aunque el plan cambie.
  let maxApelaciones: number;
  if (input.centerId) {
    maxApelaciones = CENTER_APPEAL_MAX;
  } else {
    const beneficios = await beneficiosDeUsuario(admin, user.id);
    maxApelaciones =
      Number(beneficios.apelaciones_max) || APPEAL_MAX_PER_SUBJECT;
  }
  if ((previous ?? []).length >= maxApelaciones)
    return {
      error: `Este caso ya agotó sus ${maxApelaciones} apelaciones. Escríbenos a soporte si tienes información nueva.`,
    };

  const { data: appeal, error } = await admin
    .from("appeals")
    .insert({
      user_id: user.id,
      reimbursement_id: input.reimbursementId ?? null,
      pet_id: input.petId ?? null,
      center_id: input.centerId ?? null,
      reason: message,
    })
    .select("folio")
    .single();
  if (error || !appeal)
    return { error: "No pudimos registrar tu apelación. Intenta de nuevo." };

  const { data: profile } = await admin
    .from("profiles")
    .select("email, first_name")
    .eq("id", user.id)
    .single();
  if (profile?.email) {
    await sendTemplatedEmail("appeal_received", profile.email, {
      firstName: profile.first_name ?? "",
      folio: appeal.folio,
      subject: subjectLabel,
    });
  }
  await notifyTeam(
    "notify_appeals",
    `Nueva apelación ${appeal.folio} ⚖️`,
    `<h2 style="color:#1E5350">Nueva apelación ${appeal.folio}</h2>
     <p>${profile?.first_name ?? "Un miembro"} apeló ${subjectLabel}.</p>
     <p><strong>Mensaje:</strong> ${message}</p>
     <p>Revisa la cola en el panel → Apelaciones.</p>`,
  );

  revalidatePath("/app/reintegros");
  revalidatePath("/app/peludos");
  revalidatePath("/centro");
  return { ok: true as const, folio: appeal.folio };
}
