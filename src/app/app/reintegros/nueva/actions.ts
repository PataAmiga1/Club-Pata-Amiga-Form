"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeam } from "@/lib/alerts";
import { estadoDePeludo599, esRubro599, RUBRO_LABEL } from "@/lib/reintegros-599";
import { sumarDiasHabiles } from "@/lib/dias-habiles";
import { hoyEnMexico } from "@/lib/zona-horaria";
import { formatMxn } from "@/lib/format";
import { formatDateEs } from "@/lib/dates";
import type { ReimbursementDocType } from "@/lib/reimbursement-docs";

export type SolicitudReintegro599 = {
  petId: string;
  rubro: string;
  monto: number;
  totalPagado?: number | null;
  fechaServicio: string;
  clinica: string;
  veterinario: string;
  cedula: string;
  conceptoIds: string[];
  documentos: { type: ReimbursementDocType; path: string; name: string }[];
  clabe: string;
  titular: string;
};

/**
 * Solicitud de reintegro de la membresía $599 (sección 3, 17-sep-2026).
 *
 * A diferencia del $159 (que inserta desde el navegador), esta pasa SIEMPRE
 * por el servidor: aquí se vuelve a calcular el disponible del rubro con el
 * motor y se rechaza lo que lo exceda. La base además impide insertar estas
 * categorías sin la llave de servicio (trigger `reintegros_regla_del_plan`).
 *
 * Lo que se congela en la fila: los conceptos del catálogo como se llamaban,
 * el saldo del rubro, y el último día hábil para depositar.
 */
export async function solicitarReintegro599(
  input: SolicitudReintegro599,
): Promise<{ ok: true; id: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from("profiles")
    .select("membership_status, profile_completed")
    .eq("id", user.id)
    .single();
  if (perfil?.membership_status !== "active")
    return { error: "Tu membresía no está activa." };
  if (!perfil.profile_completed)
    return { error: "Completa tu perfil antes de pedir un reintegro." };

  const { data: pet } = await admin
    .from("pets")
    .select("id, user_id, is_active, deactivation_reason")
    .eq("id", input.petId)
    .maybeSingle();
  if (!esRubro599(input.rubro)) return { error: "Elige el tipo de reintegro." };
  const rubro = input.rubro;
  // Un peludo que falleció y ya se dio de baja todavía puede pedir su
  // despedida mientras su membresía siga vigente (sección 4).
  const fallecido =
    !!pet && !pet.is_active && (pet.deactivation_reason ?? "").startsWith("Falleció");
  if (!pet || pet.user_id !== user.id || (!pet.is_active && !(fallecido && rubro === "despedida")))
    return { error: "Elige a tu peludo." };

  const estado = await estadoDePeludo599(admin, pet.id);
  if (!estado) return { error: "Ese peludo no tiene la membresía nueva." };
  if (!estado.puedePedir)
    return {
      error:
        "La membresía de este peludo tiene un pago pendiente. Actualiza tu método de pago desde Mi cuenta.",
    };
  const r = estado.rubros[rubro];
  if (!r.abierto)
    return {
      error: r.fechaApertura
        ? `${r.label} se abre el ${formatDateEs(r.fechaApertura)}.`
        : `${r.label} se abre cuando el comité apruebe el perfil de tu peludo.`,
    };

  const montoCentavos = Math.round(Number(input.monto) * 100);
  if (!Number.isFinite(montoCentavos) || montoCentavos <= 0)
    return { error: "Indica el monto que solicitas." };
  if (montoCentavos > r.disponibleCentavos)
    return {
      error: `El monto (${formatMxn(montoCentavos / 100)}) excede lo disponible en ${r.label.toLowerCase()} este año (${formatMxn(r.disponibleCentavos / 100)} MXN).`,
    };

  const hoy = hoyEnMexico();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaServicio) || input.fechaServicio > hoy)
    return { error: "Indica la fecha." };
  if (!input.clinica.trim())
    return { error: "Indica en qué veterinaria o clínica lo atendieron." };
  if (!input.veterinario.trim())
    return { error: "Escribe el nombre del médico veterinario que lo atendió." };
  if (!input.cedula.trim())
    return { error: "Escribe la cédula profesional del veterinario." };

  // Cuidados cotidianos: el catálogo es cerrado. Se exige al menos un concepto
  // ACTIVO y se guarda su nombre tal cual está hoy.
  let conceptos: { id: string; name: string }[] = [];
  if (rubro === "cuidados") {
    const ids = [...new Set(input.conceptoIds ?? [])];
    if (ids.length === 0)
      return { error: "Elige qué cuidado fue (del catálogo de cuidados cotidianos)." };
    const { data } = await admin
      .from("care_catalog_items")
      .select("id, name, active")
      .in("id", ids);
    conceptos = (data ?? []).filter((c) => c.active);
    if (conceptos.length !== ids.length)
      return {
        error:
          "Uno de los cuidados que elegiste ya no está en el catálogo. Revisa la lista.",
      };
  }

  // Los archivos los sube el navegador a SU carpeta; aquí solo se aceptan
  // rutas de esa carpeta.
  const documentos = (input.documentos ?? []).filter((d) =>
    d.path.startsWith(`${user.id}/`),
  );
  if (!documentos.some((d) => d.type === "evidence_photo"))
    return { error: "Sube la foto de tu peludo." };
  if (!documentos.some((d) => d.type === "receipt"))
    return { error: "Sube la factura o comprobante." };

  const clabe = input.clabe.replace(/\s/g, "");
  if (!/^\d{18}$/.test(clabe)) return { error: "La CLABE debe tener 18 dígitos." };
  if (!input.titular.trim())
    return { error: "Escribe el nombre del titular de la cuenta." };

  const diasHabiles = Number(estado.beneficios.dias_habiles_reintegro) || 5;
  const vence = sumarDiasHabiles(hoy, diasHabiles);

  const { data: fila, error } = await admin
    .from("reimbursements")
    .insert({
      user_id: user.id,
      pet_id: pet.id,
      category: rubro,
      amount_requested: montoCentavos / 100,
      total_paid_amount:
        input.totalPagado != null && Number.isFinite(Number(input.totalPagado))
          ? Number(input.totalPagado)
          : null,
      service_date: input.fechaServicio,
      documents: documentos,
      invoice_urls: documentos.map((d) => d.path),
      clabe,
      bank_holder: input.titular.trim(),
      clinic_name: input.clinica.trim(),
      vet_name: input.veterinario.trim(),
      vet_license: input.cedula.trim(),
      care_concept_ids: conceptos.length ? conceptos.map((c) => c.id) : null,
      care_concepts: conceptos.length ? conceptos.map((c) => c.name) : null,
      due_business_date: vence,
      plan_balance: {
        rubro,
        monto_anual_mxn: r.montoCentavos / 100,
        gastado_mxn: r.gastadoCentavos / 100,
        disponible_mxn: r.disponibleCentavos / 100,
        anio_desde: estado.anioDesde,
        anio_hasta: estado.anioHasta,
        meses_pagados: estado.mesesPagados,
      },
    })
    .select("id, folio")
    .single();
  if (error || !fila)
    return { error: "No pudimos enviar tu solicitud. Intenta de nuevo." };

  const aviso = Number(estado.beneficios.aviso_reintegro_mayor_a_mxn) || 0;
  const montoPesos = montoCentavos / 100;
  const detalle = `<p><strong>${fila.folio}</strong> · ${estado.nombre} · ${RUBRO_LABEL[rubro]} · $${montoPesos.toLocaleString("es-MX")} MXN</p>
     ${conceptos.length ? `<p>Conceptos: ${conceptos.map((c) => c.name).join(", ")}</p>` : ""}
     <p>Plazo para depositar: <strong>${vence}</strong> (${diasHabiles} días hábiles). Si se pasa, el mes de este peludo es gratis.</p>`;

  await notifyTeam(
    "notify_reimbursements",
    `Nuevo reintegro ${fila.folio} — depositar a más tardar el ${vence} ⏱️`,
    `<h2 style="color:#1E5350">Nueva solicitud de reintegro</h2>${detalle}<p>Revísala en el panel → Reintegros.</p>`,
  );

  // Arriba del umbral: aviso aparte (solo aviso, sin preautorización — equipo, 17-sep).
  if (aviso > 0 && montoPesos > aviso) {
    await notifyTeam(
      "notify_reimbursements",
      `⚠ Reintegro mayor a $${aviso.toLocaleString("es-MX")}: ${fila.folio}`,
      `<h2 style="color:#C22A56">Reintegro arriba de $${aviso.toLocaleString("es-MX")} MXN</h2>${detalle}<p>Es solo un aviso: la solicitud sigue su revisión normal.</p>`,
    );
    await admin
      .from("reimbursements")
      .update({ high_amount_alert_at: new Date().toISOString() })
      .eq("id", fila.id);
  }

  return { ok: true, id: fila.id };
}

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
