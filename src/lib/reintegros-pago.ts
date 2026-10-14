import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email/send";
import { formatMxn } from "@/lib/format";
import { formatDateEs } from "@/lib/dates";
import { hoyEnMexico, inicioDelMes, instanteEnMexico } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pataamiga.mx";

/** Estados desde los que se puede registrar un depósito. */
export const ESTADOS_POR_PAGAR = ["approved", "partial"] as const;

/**
 * LO QUE VA EN EL LAYOUT DEL BANCO. Una sola consulta para dos lugares: el CSV
 * (`/api/admin/layouts/reintegros`) y el panel «Marcar lote como pagado» de
 * /admin/reintegros. Si cada uno armara la suya, el lote podría marcar como
 * pagado algo que no venía en el archivo que se subió al banco (o al revés).
 *
 * Aprobados/parciales SIN pagar, resueltos en el mes mexicano en curso. El
 * corte por mes se conserva a propósito: hasta el 13-oct-2026 nada se marcaba
 * como pagado, así que quitarlo metería al layout TODO lo aprobado de meses
 * anteriores — ya depositado por fuera — y eso sí sería pagar dos veces.
 */
export async function reintegrosPorDispersar(admin: Admin) {
  const { data } = await admin
    .from("reimbursements")
    .select(
      "id, folio, amount_approved, clabe, resolved_at, profiles!user_id(first_name, last_name, email)",
    )
    .in("status", [...ESTADOS_POR_PAGAR])
    .gte("resolved_at", inicioDelMes().toISOString())
    .order("resolved_at", { ascending: true });
  return data ?? [];
}

export type DatosDePago = {
  /** yyyy-mm-dd, día mexicano del depósito. Por omisión, hoy en México. */
  fecha?: string;
  /** Clave de rastreo SPEI o referencia del banco. */
  referencia?: string;
  nota?: string;
};

/** Valida la fecha del depósito. Devuelve el texto del error o null. */
export function validarFechaDePago(fecha: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(new Date(`${fecha}T12:00:00Z`).getTime()))
    return "La fecha del depósito no es válida.";
  if (fecha > hoyEnMexico()) return "La fecha del depósito no puede ser futura.";
  return null;
}

export type ResultadoDePago =
  | { estado: "pagado"; id: string; folio: string }
  | { estado: "ya_pagado"; id: string; folio: string }
  | { estado: "no_aplica"; id: string; folio: string; motivo: string };

/**
 * Registra el depósito de UN reintegro. Idempotente y seguro ante dos clics o
 * dos admins a la vez: el UPDATE lleva la condición `status in (approved,
 * partial)`, así que solo el primero cambia el renglón y solo ese avisa al
 * miembro. El segundo ve «ya pagado» y no manda nada.
 *
 * `paid_at` es el MEDIODÍA mexicano del día del depósito: así `diaEnMexico`
 * (lo que compara el cron del plazo de 5 días hábiles contra
 * `due_business_date`) siempre da ese mismo día, sin importar la zona del
 * servidor.
 */
export async function registrarPago(
  admin: Admin,
  id: string,
  datos: DatosDePago,
  adminId: string,
): Promise<ResultadoDePago> {
  const fecha = datos.fecha?.trim() || hoyEnMexico();

  const { data: req } = await admin
    .from("reimbursements")
    .select("id, folio, user_id, status, amount_approved, pets(name)")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { estado: "no_aplica", id, folio: "—", motivo: "No encontramos la solicitud." };
  if (req.status === "paid") return { estado: "ya_pagado", id, folio: req.folio };
  if (!(ESTADOS_POR_PAGAR as readonly string[]).includes(req.status))
    return {
      estado: "no_aplica",
      id,
      folio: req.folio,
      motivo: "Solo se puede registrar el pago de un reintegro aprobado o parcial.",
    };

  // Lo depositado es lo APROBADO. `total_paid_amount` NO se toca: es lo que el
  // miembro le pagó al veterinario (su factura), y su pantalla lo enseña como
  // «Total que pagaste». Escribir ahí el depósito le cambiaría ese dato.
  const monto = Number(req.amount_approved ?? 0);
  const { data: cambiado } = await admin
    .from("reimbursements")
    .update({
      status: "paid",
      paid_at: instanteEnMexico(`${fecha}T12:00:00.000`).toISOString(),
      payment_reference: datos.referencia?.trim() || null,
      payment_note: datos.nota?.trim() || null,
      paid_by: adminId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", [...ESTADOS_POR_PAGAR])
    .select("id")
    .maybeSingle();
  // Otro proceso lo marcó entre la lectura y el UPDATE: ya está pagado.
  if (!cambiado) return { estado: "ya_pagado", id, folio: req.folio };

  const pet = (Array.isArray(req.pets) ? req.pets[0] : req.pets) as { name?: string } | null;
  const petName = pet?.name ?? "tu mascota";
  const fechaTexto = formatDateEs(fecha);

  await admin.from("notifications").insert({
    user_id: req.user_id,
    type: "reimbursement_paid",
    title: `Ya depositamos tu reintegro ${req.folio} 💚`,
    message: `El ${fechaTexto} te transferimos ${formatMxn(monto)} MXN del reintegro de ${petName}.`,
    data: { reimbursementId: id },
  });

  const { data: perfil } = await admin
    .from("profiles")
    .select("email, first_name")
    .eq("id", req.user_id)
    .maybeSingle();
  if (perfil?.email) {
    const ref = datos.referencia?.trim();
    await sendTemplatedEmail("reimbursement_paid", perfil.email, {
      firstName: perfil.first_name ?? "",
      folio: req.folio,
      amount: formatMxn(monto),
      petName,
      fecha: fechaTexto,
      referenciaLine: ref
        ? `<p>Clave de rastreo SPEI: <strong>${ref.replace(/[<>&"]/g, "")}</strong></p>`
        : "",
      reintegroUrl: `${SITIO}/app/reintegros/${id}`,
    });
  }

  return { estado: "pagado", id, folio: req.folio };
}
