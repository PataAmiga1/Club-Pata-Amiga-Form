"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { estadoDeGarantia, reembolsarEnStripe } from "@/lib/garantia";
import {
  reacomodarPrecioPrincipal,
} from "@/lib/plans/peludos-599";
import { recalcularEstadoDelMiembro } from "@/lib/plans/suscripciones";

/** Mover dinero es de super admin. */
async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (perfil?.role !== "super_admin") return null;
  return { adminId: user.id, admin: createAdminClient() };
}

const pesos = (c: number) => `$${(c / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

/**
 * Confirma la garantía de 90 días (sección 6): reembolsa en Stripe lo pagado
 * menos lo reintegrado (recalculado AHORA, por si se aprobó un reintegro desde
 * que se pidió), cancela esa membresía de inmediato y anula las comisiones del
 * embajador que esa membresía todavía no había pagado.
 */
export async function confirmarGarantia(requestId: string) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return { error: "Solo un super admin puede confirmar reembolsos." };
  const { admin, adminId } = ctx;

  const { data: solicitud } = await admin
    .from("guarantee_requests")
    .select("id, status, user_id, subscription_id, pet_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!solicitud) return { error: "No encontramos la solicitud." };
  if (solicitud.status !== "pendiente") return { error: "Esa solicitud ya se resolvió." };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, pet_id, status, stripe_subscription_id")
    .eq("id", solicitud.subscription_id)
    .maybeSingle();
  if (!sub?.stripe_subscription_id) return { error: "La membresía no tiene suscripción en Stripe." };
  const estado = await estadoDeGarantia(admin, sub.id);
  if (!estado) return { error: "No pudimos calcular el reembolso." };

  let refundIds: string[] = [];
  try {
    refundIds = await reembolsarEnStripe(sub.stripe_subscription_id, estado.reembolsoCents);
  } catch (e) {
    return { error: `Stripe no aceptó el reembolso: ${e instanceof Error ? e.message : "error"}` };
  }

  // La membresía termina hoy: el dinero ya se devolvió.
  try {
    await getStripe().subscriptions.cancel(sub.stripe_subscription_id);
  } catch {
    // Si ya estaba cancelada en Stripe, seguimos: el reembolso sí se hizo.
  }
  await admin.from("subscriptions").update({ status: "canceled" }).eq("id", sub.id);
  await admin
    .from("referral_commissions")
    .update({ status: "void" })
    .eq("subscription_id", sub.id)
    .eq("status", "pending");
  await admin
    .from("guarantee_requests")
    .update({
      status: "reembolsada",
      paid_cents: estado.pagadoCents,
      reimbursed_cents: estado.reintegradoCents,
      refund_cents: estado.reembolsoCents,
      stripe_refund_ids: refundIds,
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", solicitud.id);

  // El webhook también lo hace al recibir la cancelación; aquí se adelanta
  // para que la pantalla quede bien aunque el evento tarde.
  await reacomodarPrecioPrincipal(admin, sub.user_id).catch(() => null);
  await recalcularEstadoDelMiembro(admin, sub.user_id);

  await admin.from("notifications").insert({
    user_id: sub.user_id,
    type: "plan_changed",
    title: `Hicimos el reembolso de tu garantía de ${estado.petName}`,
    message: `Te devolvimos ${pesos(estado.reembolsoCents)} MXN a tu tarjeta. Puede tardar unos días en reflejarse. La membresía de ${estado.petName} quedó cancelada.`,
  });
  revalidatePath("/admin/garantias");
  return { ok: true as const, reembolsoCents: estado.reembolsoCents };
}

export async function rechazarGarantia(requestId: string, notas: string) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return { error: "Solo un super admin puede resolver garantías." };
  if (!notas.trim()) return { error: "Escribe el motivo." };
  const { data, error } = await ctx.admin
    .from("guarantee_requests")
    .update({
      status: "rechazada",
      team_notes: notas.trim(),
      resolved_by: ctx.adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pendiente")
    .select("user_id")
    .maybeSingle();
  if (error || !data) return { error: "No se pudo guardar." };
  await ctx.admin.from("notifications").insert({
    user_id: data.user_id,
    type: "plan_changed",
    title: "Sobre tu solicitud de garantía",
    message: notas.trim(),
  });
  revalidatePath("/admin/garantias");
  return { ok: true as const };
}
