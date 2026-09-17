import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentTool } from "./types";
import { REIMBURSEMENT_CATEGORY_LABELS } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { estadoDePeludo599 } from "@/lib/reintegros-599";

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

/**
 * Solo para miembros del $599 (sección 7): los montos disponibles de cada
 * peludo salen del mismo motor que la pantalla de reintegros y el panel del
 * comité, para que el asistente nunca diga una cifra distinta.
 */
const MONTOS_DISPONIBLES: AgentTool = {
  name: "montos_disponibles",
  description:
    "Membresía por peludo: para cada peludo, sus montos de cuidados cotidianos, emergencia veterinaria y despedida — si ya están abiertos, desde qué fecha, cuánto vale cada uno este año, cuánto usó y cuánto le queda, y cuándo se renuevan.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
};

/** Las herramientas que recibe el asistente según la membresía del miembro. */
export function herramientasDeSoporte(es599: boolean): AgentTool[] {
  return es599 ? [...SUPPORT_TOOLS, MONTOS_DISPONIBLES] : SUPPORT_TOOLS;
}

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
  es599 = false,
): Promise<string> {
  if (name === "montos_disponibles" && es599) {
    // Los peludos se leen con la sesión del miembro (RLS: solo los suyos); el
    // motor necesita el libro de cobros, así que corre con el cliente admin
    // pero SOLO sobre esos ids.
    const { data: pets } = await supabase
      .from("pets")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    const admin = createAdminClient();
    const estados = await Promise.all((pets ?? []).map((p) => estadoDePeludo599(admin, p.id)));
    const pesos = (c: number) => Math.round(c) / 100;
    const peludos = estados
      .filter((e) => e !== null)
      .map((e) => ({
        nombre: e.nombre,
        aprobado_por_el_comite: e.aprobado,
        membresia: e.estadoSuscripcion,
        meses_pagados: e.mesesPagados,
        su_anio_va_del: e.anioDesde,
        se_renuevan_los_montos_el: e.anioHasta,
        montos: Object.values(e.rubros).map((r) => ({
          rubro: r.label,
          abierto: r.abierto,
          se_abre_el: r.fechaApertura,
          monto_de_este_anio_mxn: pesos(r.montoCentavos),
          usado_mxn: pesos(r.gastadoCentavos),
          disponible_mxn: pesos(r.disponibleCentavos),
        })),
      }));
    return JSON.stringify(
      peludos.length ? { peludos } : { peludos: [], nota: "Ningún peludo tiene membresía activa todavía." },
      null,
      2,
    );
  }

  if (name === "mis_mascotas" && es599) {
    const { data: pets } = await supabase
      .from("pets")
      .select("name, species, breed, is_active, approval_status")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    return JSON.stringify(
      {
        mascotas: (pets ?? []).map((p) => ({
          nombre: p.name,
          especie: p.species === "dog" ? "lomito" : "michi",
          raza: p.breed,
          activa: p.is_active,
          revision_del_comite: p.approval_status,
        })),
        nota: "Sus montos y fechas de apertura están en la herramienta montos_disponibles.",
      },
      null,
      2,
    );
  }

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
        .select("plan, plan_name, amount, status, current_period_end, cancel_at_period_end, price_tier, pets(name)")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
    ]);
    if (es599) {
      return JSON.stringify(
        {
          estatus_membresia: profile?.membership_status ?? "sin membresía",
          miembro_desde: profile?.member_since ?? null,
          membresias_por_peludo: (sub ?? []).map((s) => {
            const pet = (Array.isArray(s.pets) ? s.pets[0] : s.pets) as { name?: string } | null;
            return {
              peludo: pet?.name ?? null,
              plan: s.plan === "annual" ? "anual" : "mensual",
              precio: s.price_tier === "adicional" ? "con 15% de descuento" : "precio completo",
              monto_mxn: s.amount,
              proxima_renovacion: s.current_period_end,
              se_cancela_al_final_del_periodo: s.cancel_at_period_end ?? false,
            };
          }),
        },
        null,
        2,
      );
    }
    const unica = (sub ?? [])[0];
    // El contratante NO tiene tiempo de espera (PM, 11-ago): el bot no debe
    // reportar una espera que ya no existe. La espera es por peludo.
    return JSON.stringify(
      {
        estatus_membresia: profile?.membership_status ?? "sin membresía",
        miembro_desde: profile?.member_since ?? null,
        plan: unica?.plan === "annual" ? "anual" : unica?.plan === "monthly" ? "mensual" : null,
        monto_mxn: unica?.amount ?? null,
        proxima_renovacion: unica?.current_period_end ?? null,
        se_cancela_al_final_del_periodo: unica?.cancel_at_period_end ?? false,
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
