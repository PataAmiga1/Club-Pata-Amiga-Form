import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeam } from "@/lib/alerts";
import { hoyEnMexico } from "@/lib/zona-horaria";
import { formatDateEs } from "@/lib/dates";
import { RUBRO_LABEL, esRubro599 } from "@/lib/reintegros-599";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * «TE DEPOSITAMOS EN 5 DÍAS HÁBILES; SI NOS TARDAMOS MÁS, TU MES ES GRATIS».
 * Sección 3 del $599 (17-sep-2026).
 *
 * Decisión del equipo: el sistema DETECTA y AVISA; el mes gratis lo aplica el
 * equipo con un botón (sección 6). Aquí solo se marca `sla_breached_at` y se
 * avisa una vez por solicitud.
 *
 * Vencida = pasó su último día hábil (`due_business_date`) y no está pagada.
 * Una denegada no genera mes gratis: no había depósito que hacer.
 */
export async function revisarPlazosDeReintegro(
  admin: Admin,
  hoy: string = hoyEnMexico(),
): Promise<{ vencidas: number }> {
  const { data } = await admin
    .from("reimbursements")
    .select("id, folio, category, amount_requested, due_business_date, status, pets(name)")
    .not("due_business_date", "is", null)
    .lt("due_business_date", hoy)
    .is("sla_breached_at", null)
    .not("status", "in", "(paid,rejected)");

  const vencidas = data ?? [];
  if (vencidas.length === 0) return { vencidas: 0 };

  await admin
    .from("reimbursements")
    .update({ sla_breached_at: new Date().toISOString() })
    .in(
      "id",
      vencidas.map((v) => v.id),
    );

  const filas = vencidas
    .map((v) => {
      const pet = (Array.isArray(v.pets) ? v.pets[0] : v.pets) as { name?: string } | null;
      return `<li><strong>${v.folio}</strong> · ${pet?.name ?? "peludo"} · ${esRubro599(v.category) ? RUBRO_LABEL[v.category] : v.category} · $${Number(v.amount_requested).toLocaleString("es-MX")} · venció el ${formatDateEs(v.due_business_date!)}</li>`;
    })
    .join("");

  await notifyTeam(
    "notify_reimbursements",
    `⏰ ${vencidas.length} reintegro(s) pasaron de 5 días hábiles — corresponde mes gratis`,
    `<h2 style="color:#C22A56">Se venció el plazo de depósito</h2>
     <ul>${filas}</ul>
     <p>La promesa es: si nos tardamos más de 5 días hábiles, el mes de ese peludo es gratis. Aplícalo desde el panel → Reintegros → la solicitud.</p>`,
  );

  return { vencidas: vencidas.length };
}
