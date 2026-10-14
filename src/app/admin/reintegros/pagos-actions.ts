"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  registrarPago,
  reintegrosPorDispersar,
  validarFechaDePago,
  type DatosDePago,
} from "@/lib/reintegros-pago";
import { esDespedida, pedirTestimonio, TESTIMONIO_DESPEDIDA } from "@/lib/testimonios";

/** Solo admin / super_admin. Igual que `requireAdmin` de `@/app/admin/actions`. */
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
  if (profile?.role !== "admin" && profile?.role !== "super_admin")
    throw new Error("Sin permisos");
  return { adminId: user.id, admin: createAdminClient() };
}

function revalidar(id?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/reintegros");
  if (id) revalidatePath(`/admin/reintegros/${id}`);
  revalidatePath("/app/reintegros", "layout");
}

/**
 * «Registrar pago» de una solicitud aprobada o parcial. Idempotente: si ya
 * estaba pagada responde ok sin volver a avisar al miembro.
 */
export async function registrarPagoDeReintegro(id: string, datos: DatosDePago = {}) {
  const { adminId, admin } = await requireAdmin();
  if (datos.fecha) {
    const error = validarFechaDePago(datos.fecha);
    if (error) return { error };
  }
  const r = await registrarPago(admin, id, datos, adminId);
  if (r.estado === "no_aplica") return { error: r.motivo };
  revalidar(id);
  return { ok: true as const, yaEstabaPagado: r.estado === "ya_pagado" };
}

/**
 * «Marcar lote como pagado» de /admin/reintegros. Solo acepta ids que HOY
 * vienen en el layout del banco (`reintegrosPorDispersar`): un id de fuera —
 * otro mes, ya pagado, rechazado— se ignora y se reporta, nunca se marca.
 */
export async function marcarLoteComoPagado(ids: string[], datos: DatosDePago = {}) {
  const { adminId, admin } = await requireAdmin();
  if (!Array.isArray(ids) || ids.length === 0)
    return { error: "Selecciona al menos un reintegro." };
  if (datos.fecha) {
    const error = validarFechaDePago(datos.fecha);
    if (error) return { error };
  }
  const enLayout = new Set((await reintegrosPorDispersar(admin)).map((r) => r.id));
  const validos = [...new Set(ids)].filter((id) => enLayout.has(id));
  let pagados = 0;
  const folios: string[] = [];
  for (const id of validos) {
    const r = await registrarPago(admin, id, datos, adminId);
    if (r.estado === "pagado") {
      pagados++;
      folios.push(r.folio);
    }
  }
  revalidar();
  return { ok: true as const, pagados, folios, ignorados: ids.length - validos.length };
}

/**
 * «Pedir testimonio» manual — solo para despedida/fallecimiento, que nunca
 * sale en automático. Una vez por miembro (lo garantiza la base).
 */
export async function pedirTestimonioDeDespedida(reimbursementId: string) {
  const { adminId, admin } = await requireAdmin();
  const { data: req } = await admin
    .from("reimbursements")
    .select("id, user_id, category, status")
    .eq("id", reimbursementId)
    .maybeSingle();
  if (!req) return { error: "No encontramos la solicitud." };
  if (req.status !== "paid") return { error: "Primero registra el pago del reintegro." };
  if (!esDespedida(req.category))
    return { error: "Este reintegro no es de despedida: su testimonio se pide solo." };

  const r = await pedirTestimonio(admin, {
    userId: req.user_id,
    reimbursementId: req.id,
    templateKey: TESTIMONIO_DESPEDIDA,
    sentBy: adminId,
    auto: false,
  });
  revalidar(req.id);
  switch (r.estado) {
    case "enviado":
      return r.emailOk
        ? { ok: true as const }
        : { error: "Quedó registrado, pero el correo no salió. Revisa los registros de correo." };
    case "ya_pedido":
      return { error: "A este miembro ya se le pidió testimonio." };
    case "dnd":
      return { error: "Este contacto pidió no recibir correos (CRM)." };
    case "sin_correo":
      return { error: "El miembro no tiene correo registrado." };
    default:
      return { error: `No se pudo registrar: ${r.motivo}` };
  }
}
