import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentTool } from "./types";
import { REIMBURSEMENT_CATEGORY_LABELS } from "@/lib/constants";

/**
 * Herramientas del asistente de soporte: lecturas de la cuenta del miembro.
 * Se ejecutan con el cliente Supabase DEL USUARIO (cookies de su sesión), así
 * que RLS garantiza que solo puede ver sus propios datos — la IA no recibe
 * ningún acceso extra al que ya tiene el miembro.
 */

export const SUPPORT_TOOLS: AgentTool[] = [
  {
    name: "mis_mascotas",
    description:
      "Lista los peludos registrados del miembro con su tiempo de espera: fecha en que termina, días restantes y si ya está activa para reintegros.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "mi_membresia",
    description:
      "Devuelve el estado de la membresía del miembro: plan (mensual/anual), estatus, fecha de renovación y tiempo de espera del contratante.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "mis_reintegros",
    description:
      "Devuelve los reintegros recientes del miembro: folio, categoría, monto solicitado/aprobado, estatus y motivo de la denegación si aplica.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** Días de hoy a una fecha yyyy-mm-dd (negativo si ya pasó). */
function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const diff = new Date(date + "T00:00:00").getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

/**
 * Ejecuta una herramienta de soporte. Devuelve JSON legible para el modelo.
 * `supabase` debe ser el cliente con la sesión del usuario (RLS activo).
 */
export async function executeSupportTool(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<string> {
  if (name === "mis_mascotas") {
    const { data: pets } = await supabase
      .from("pets")
      .select("name, species, breed, is_active, waiting_period_end_date, waiting_period_bypassed")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    const rows = (pets ?? []).map((p) => {
      const remaining = p.waiting_period_bypassed ? 0 : (daysUntil(p.waiting_period_end_date) ?? null);
      return {
        nombre: p.name,
        especie: p.species === "dog" ? "lomito" : "michi",
        raza: p.breed,
        activa: p.is_active,
        periodo_de_espera_termina: p.waiting_period_end_date,
        dias_restantes_de_espera: remaining !== null && remaining > 0 ? remaining : 0,
        ya_puede_solicitar_reintegros:
          p.is_active && (remaining === null || remaining <= 0),
      };
    });
    return JSON.stringify({ mascotas: rows }, null, 2);
  }

  if (name === "mi_membresia") {
    const [{ data: profile }, { data: sub }] = await Promise.all([
      supabase
        .from("profiles")
        .select("membership_status, member_since")
        .eq("id", userId)
        .single(),
      supabase
        .from("subscriptions")
        .select("plan, plan_name, amount, status, current_period_end, cancel_at_period_end")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    // El contratante NO tiene tiempo de espera (PM, 11-ago): el bot no debe
    // reportar una espera que ya no existe. La espera es por peludo.
    return JSON.stringify(
      {
        estatus_membresia: profile?.membership_status ?? "sin membresía",
        miembro_desde: profile?.member_since ?? null,
        plan: sub?.plan === "annual" ? "anual" : sub?.plan === "monthly" ? "mensual" : null,
        monto_mxn: sub?.amount ?? null,
        proxima_renovacion: sub?.current_period_end ?? null,
        se_cancela_al_final_del_periodo: sub?.cancel_at_period_end ?? false,
        periodo_de_espera_contratante: "no aplica — la espera es por peludo",
      },
      null,
      2,
    );
  }

  if (name === "mis_reintegros") {
    const { data: rows } = await supabase
      .from("reimbursements")
      .select("folio, category, amount_requested, amount_approved, status, rejection_reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    const list = (rows ?? []).map((r) => ({
      folio: r.folio,
      categoria:
        REIMBURSEMENT_CATEGORY_LABELS[r.category as keyof typeof REIMBURSEMENT_CATEGORY_LABELS] ??
        r.category,
      monto_solicitado_mxn: r.amount_requested,
      monto_aprobado_mxn: r.amount_approved,
      estatus: r.status,
      motivo_rechazo: r.rejection_reason,
      fecha: r.created_at,
    }));
    return JSON.stringify({ reintegros_recientes: list }, null, 2);
  }

  throw new Error(`Herramienta desconocida: ${name}`);
}
