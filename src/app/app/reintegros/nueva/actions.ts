"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyTeam } from "@/lib/alerts";

/** Aviso al equipo cuando entra una solicitud (compromiso de 72 hrs). */
export async function notifyReimbursementSubmitted() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: latest } = await supabase
    .from("reimbursements")
    .select("folio, amount_requested, category, pets(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return;

  const pet = Array.isArray(latest.pets) ? latest.pets[0] : latest.pets;
  await notifyTeam(
    "notify_reimbursements",
    `Nuevo reintegro ${latest.folio} — corre el compromiso de 72 hrs ⏱️`,
    `<h2 style="color:#1E5350">Nueva solicitud de reintegro</h2>
     <p><strong>${latest.folio}</strong> · ${(pet as { name?: string } | null)?.name ?? "peludo"} · $${Number(latest.amount_requested).toLocaleString("es-MX")} MXN</p>
     <p>Revísala en el panel → Reintegros. El compromiso de respuesta es de 72 horas.</p>`,
  );
}
