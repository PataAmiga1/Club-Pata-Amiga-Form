"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMxn } from "@/lib/format";
import {
  sanearAdjuntos,
  type AdjuntoConversacion,
} from "@/lib/documentos-conversacion";
import {
  SUJETO,
  itemsValidos,
  listaDeItemsHtml,
  type SujetoSolicitud,
} from "@/lib/hilo-solicitud";
import {
  hoyEnMexico,
  ZONA_MX,
  inicioDelMes,
  diaEnMexico,
} from "@/lib/zona-horaria";
import {
  MATERIAL_SLOTS,
  ASSISTANT_PROMPT_KEY,
  NOTIFY_EVENTS,
  SALES_PROMPT_KEY,
  SITE_ASSET_SLOTS,
  SITE_SETTINGS,
} from "@/lib/site";
import { CAMPAIGN_COUPON_KEYS, CAMPAIGN_PDF_SLOTS } from "@/lib/landings";
import {
  CODIGO_MAX,
  normalizarCodigo,
  revisarCodigo,
} from "@/lib/codigo-embajador";
import { getResend, EMAIL_FROM, destinatarioPermitido } from "@/lib/resend";
import { perfilCompleto } from "@/lib/perfil-faltantes";
import { notifyTeam, reportError } from "@/lib/alerts";
import { sendTemplatedEmail } from "@/lib/email/send";
import { getStripe } from "@/lib/stripe";
import { getTemplateDef } from "@/lib/email/templates";
import { crmEventoDeUsuario, marcarComoMiembro } from "@/lib/crm/sync";
import { iniciarEsperaDeMascota } from "@/lib/pets/iniciar-espera";

async function requireAdmin(superOnly = false) {
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
  const role = profile?.role;
  if (role !== "admin" && role !== "super_admin") throw new Error("Sin permisos");
  if (superOnly && role !== "super_admin") throw new Error("Solo super admin");
  return { adminId: user.id, admin: createAdminClient() };
}

async function notifyMember(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  notification: { type: string; title: string; message: string },
  email?: { template: string; vars: Record<string, string> },
) {
  await admin.from("notifications").insert({ user_id: userId, ...notification });
  if (!email) return;
  const { data: profile } = await admin
    .from("profiles")
    .select("email, first_name")
    .eq("id", userId)
    .single();
  if (profile?.email) {
    await sendTemplatedEmail(email.template, profile.email, {
      firstName: profile.first_name ?? "",
      ...email.vars,
    });
  }
}

export async function resolveReimbursement(
  id: string,
  resolution:
    | { action: "approve" }
    | { action: "partial"; amount: number }
    | { action: "reject"; reason: string },
) {
  const { adminId, admin } = await requireAdmin();

  const { data: req } = await admin
    .from("reimbursements")
    .select("id, folio, user_id, amount_requested, pets(name)")
    .eq("id", id)
    .single();
  if (!req) throw new Error("Solicitud no encontrada");
  const pet = Array.isArray(req.pets)
    ? (req.pets[0] as { name: string } | undefined)
    : (req.pets as { name: string } | null);
  const petName = pet?.name ?? "tu peludo";

  const base = {
    resolved_by: adminId,
    resolved_at: new Date().toISOString(),
  };

  if (resolution.action === "reject") {
    await admin
      .from("reimbursements")
      .update({ ...base, status: "rejected", rejection_reason: resolution.reason })
      .eq("id", id);
    await notifyMember(
      admin,
      req.user_id,
      {
        type: "reimbursement_rejected",
        title: `Resolución de tu reintegro ${req.folio}`,
        message: `Tu solicitud para ${petName} no pudo aprobarse. Motivo: ${resolution.reason}. Puedes apelar la decisión.`,
      },
      {
        template: "reimbursement_rejected",
        vars: {
          folio: req.folio,
          petName,
          reason: resolution.reason,
          reintegroUrl: `${SITE_URL}/app/reintegros/${id}`,
        },
      },
    );
  } else {
    const amount =
      resolution.action === "partial"
        ? resolution.amount
        : Number(req.amount_requested);
    await admin
      .from("reimbursements")
      .update({ ...base, status: resolution.action === "partial" ? "partial" : "approved", amount_approved: amount })
      .eq("id", id);
    await notifyMember(
      admin,
      req.user_id,
      {
        type: "reimbursement_approved",
        title: `¡Tu reintegro ${req.folio} fue aprobado! 🎉`,
        message: `Aprobamos ${formatMxn(amount)} MXN para ${petName}. Recibirás tu transferencia en máximo 72 horas.`,
      },
      {
        template: "reimbursement_approved",
        vars: {
          folio: req.folio,
          petName,
          amount: formatMxn(amount),
          reintegroUrl: `${SITE_URL}/app/reintegros/${id}`,
        },
      },
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/reintegros");
}

export async function resolvePet(
  petId: string,
  decision: { approve: true } | { approve: false; notes: string },
) {
  const { adminId, admin } = await requireAdmin();
  const { data: pet } = await admin
    .from("pets")
    .select("id, name, user_id")
    .eq("id", petId)
    .single();
  if (!pet) throw new Error("Peludo no encontrado");

  await admin
    .from("pets")
    .update(
      decision.approve
        ? {
            approval_status: "approved",
            approved_at: new Date().toISOString(),
            approved_by: adminId,
            approval_notes: null,
          }
        : { approval_status: "rejected", approval_notes: decision.notes },
    )
    .eq("id", petId);

  // El reloj de la espera arranca AQUÍ, con la aprobación del comité (regla
  // de la PM, 11-ago) — no al registrar ni al pagar. Guarda inicio y fin
  // reales; la pantalla ya no adivina el inicio con created_at.
  if (decision.approve) await iniciarEsperaDeMascota(admin, petId);

  // CRM: con la mascota aprobada y la suscripción activa, la tarjeta llega a
  // "Miembro activo" — la etapa que en LynSales está en cero. Va sin actorId
  // (es la plataforma), así que respeta cualquier tarjeta que ventas haya
  // fijado a mano.
  if (decision.approve) {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, plan")
      .eq("user_id", pet.user_id)
      .eq("status", "active")
      .maybeSingle();
    if (sub) {
      await crmEventoDeUsuario(admin, {
        userId: pet.user_id,
        kind: "membresia_activa",
        summary: `${pet.name} aprobado por el comité — membresía completa`,
        stageKey: "miembro_activo",
        interval: sub.plan === "annual" ? "year" : "month",
        payload: { petId: pet.id },
      });
      await marcarComoMiembro(admin, pet.user_id);
    } else {
      await crmEventoDeUsuario(admin, {
        userId: pet.user_id,
        kind: "mascota_aprobada",
        summary: `${pet.name} aprobado por el comité`,
        payload: { petId: pet.id },
      });
    }
  }

  const notes = decision.approve ? "" : decision.notes;
  await notifyMember(
    admin,
    pet.user_id,
    decision.approve
      ? {
          type: "pet_approved",
          title: `¡${pet.name} fue aprobado por el comité! 🐾`,
          message: `El perfil de ${pet.name} quedó aprobado. Su tiempo de espera sigue corriendo con normalidad.`,
        }
      : {
          type: "pet_rejected",
          title: `El perfil de ${pet.name} necesita atención`,
          message: `Observaciones del comité: ${notes}`,
        },
    decision.approve
      ? { template: "pet_approved", vars: { petName: pet.name } }
      : {
          template: "pet_rejected",
          vars: {
            petName: pet.name,
            notes,
            perfilUrl: `${SITE_URL}/app/peludos/${petId}`,
          },
        },
  );

  revalidatePath("/admin");
  revalidatePath("/admin/mascotas");
}

/** Base pública para links en correos (embajadores/centros). */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/* `slugCode` se retiró el 16-ago: la normalización del código de embajador
   vive ahora en `@/lib/codigo-embajador`, junto con sus reglas. */

export async function resolveAmbassador(
  id: string,
  decision: { approve: true } | { approve: false; reason: string },
) {
  const { admin } = await requireAdmin();
  const { data: amb } = await admin
    .from("ambassadors")
    .select("id, first_name, email, referral_code, user_id")
    .eq("id", id)
    .single();
  if (!amb) throw new Error("Solicitud no encontrada");

  if (decision.approve) {
    // Código inicial único, que el embajador puede cambiar desde su portal.
    // SIN el prefijo `PATAMIGA-` y con las reglas del 16-ago (de CODIGO_MIN a
    // CODIGO_MAX, A-Z y 0-9, sin palabras bloqueadas).
    //
    // El mínimo de 6 dejó cortos a los nombres de pila (ANA, LOLA): antes de
    // rendirse se prueba el nombre + AMIGO —"ANAAMIGO" se sigue leyendo como
    // suyo— y solo si eso tampoco pasa se cae a un código genérico.
    let code = amb.referral_code;
    if (!code) {
      const delNombre = normalizarCodigo(amb.first_name ?? "");
      const conAmigo = normalizarCodigo(`${delNombre}AMIGO`);
      const base = revisarCodigo(delNombre).ok
        ? delNombre
        : revisarCodigo(conAmigo).ok
          ? conAmigo
          : "AMIGOMX";
      code = base;
      for (let n = 2; ; n++) {
        const { data: taken } = await admin
          .from("ambassadors")
          .select("id")
          .eq("referral_code", code)
          .maybeSingle();
        if (!taken) break;
        // El sufijo no puede empujar el código más allá del tope.
        code = `${base.slice(0, CODIGO_MAX - String(n).length)}${n}`;
      }
    }
    await admin
      .from("ambassadors")
      // `info_requested` se apaga al resolver: si el comite le pidio algo y
      // termino resolviendo sin esperar, la bandera se quedaria encendida para
      // siempre porque solo la apaga una respuesta suya.
      .update({
        status: "approved",
        referral_code: code,
        rejection_reason: null,
        info_requested: false,
      })
      .eq("id", id);
    await sendTemplatedEmail("ambassador_approved", amb.email, {
      firstName: amb.first_name,
      code: code ?? "",
      accessLine: amb.user_id
        ? `Entra a tu dashboard en <a href="${SITE_URL}/embajador" style="color:#0E8377">${SITE_URL}/embajador</a> para copiar tu link, ver tus referidos y descargar materiales.`
        : `Crea tu cuenta con este mismo correo en <a href="${SITE_URL}/registro" style="color:#0E8377">${SITE_URL}/registro</a> y podrás ver tu dashboard de embajador en ${SITE_URL}/embajador.`,
    });
  } else {
    await admin
      .from("ambassadors")
      .update({
        status: "rejected",
        rejection_reason: decision.reason,
        info_requested: false,
      })
      .eq("id", id);
    await sendTemplatedEmail("ambassador_rejected", amb.email, {
      firstName: amb.first_name,
      reason: decision.reason,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/embajadores");
}

/** Audiencias de los envíos dirigidos (equipo, 5-ago). */
export type EmailAudience =
  | "miembros_activos"
  | "miembros_inactivos"
  | "perfil_incompleto"
  | "con_factura"
  | "embajadores"
  | "centros"
  | "lista";

async function resolveAudience(
  admin: ReturnType<typeof createAdminClient>,
  audience: EmailAudience,
  lista?: string,
): Promise<string[]> {
  if (audience === "lista") {
    return [
      ...new Set(
        (lista ?? "")
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
      ),
    ];
  }
  if (audience === "embajadores") {
    const { data } = await admin
      .from("ambassadors")
      .select("email")
      .eq("status", "approved");
    return [...new Set((data ?? []).map((a) => a.email).filter(Boolean))];
  }
  if (audience === "centros") {
    const { data } = await admin
      .from("wellness_centers")
      .select("email")
      .eq("status", "approved");
    return [
      ...new Set(
        (data ?? []).map((c) => c.email).filter((e): e is string => Boolean(e)),
      ),
    ];
  }
  let q = admin.from("profiles").select("email").eq("role", "member");
  if (audience === "miembros_activos") q = q.eq("membership_status", "active");
  if (audience === "miembros_inactivos")
    q = q.neq("membership_status", "active");
  if (audience === "perfil_incompleto")
    q = q.eq("membership_status", "active").eq("profile_completed", false);
  if (audience === "con_factura")
    q = q.eq("membership_status", "active").eq("cfdi_requested", true);
  const { data } = await q.limit(2000);
  return [
    ...new Set(
      (data ?? []).map((p) => p.email).filter((e): e is string => Boolean(e)),
    ),
  ];
}

/**
 * Envío extraordinario con HTML libre a una audiencia elegida (equipo,
 * 5-ago). SOLO el super admin puede disparar el envío (decisión de Pablo).
 * La reja CORREOS_PERMITIDOS aplica sola en ambientes de prueba.
 */
export async function sendExtraordinaryEmail(input: {
  subject: string;
  html: string;
  audience: EmailAudience;
  lista?: string;
}) {
  const { admin } = await requireAdmin(true);
  const subject = input.subject?.trim();
  const html = input.html?.trim();
  if (!subject || subject.length < 3) return { error: "Escribe el asunto." };
  if (!html || html.length < 20)
    return { error: "Pega el HTML del correo (mínimo unas líneas)." };

  const recipients = await resolveAudience(admin, input.audience, input.lista);
  if (recipients.length === 0)
    return { error: "La audiencia elegida no tiene destinatarios." };

  const resend = getResend();
  let enviados = 0;
  // La reja de pruebas responde sin error, así que un bloqueado se contaba
  // como enviado ("2 de 2" cuando solo salió 1). Se descuenta aquí.
  let bloqueados = 0;
  for (const to of recipients) {
    if (!destinatarioPermitido(to)) {
      bloqueados++;
      continue;
    }
    try {
      const { error } = await resend.emails.send({
        from: EMAIL_FROM,
        to,
        subject,
        html,
      });
      if (!error) enviados++;
    } catch {
      // seguir con el resto
    }
  }

  await notifyTeam(
    "notify_comunicados",
    "Envío extraordinario realizado ✉️",
    `<h2 style="color:#1E5350">Envío extraordinario</h2>
     <p><strong>Asunto:</strong> ${subject}</p>
     <p><strong>Audiencia:</strong> ${input.audience} · <strong>Enviados:</strong> ${enviados} de ${recipients.length}${bloqueados > 0 ? ` · <strong>Bloqueados por la reja de pruebas:</strong> ${bloqueados}` : ""}</p>`,
  );

  return {
    ok: true as const,
    enviados,
    total: recipients.length,
    bloqueados,
  };
}

/**
 * Recordatorios de datos faltantes — botón "enviar ahora" (equipo, 5-ago).
 * SOLO super admin; el cron /api/cron/documentos hará el envío periódico.
 */
export async function sendMissingDocsReminders() {
  const { admin } = await requireAdmin(true);
  const { enviarRecordatoriosDatosFaltantes } = await import(
    "@/lib/email/recordatorios"
  );
  const result = await enviarRecordatoriosDatosFaltantes(admin);
  return { ok: true as const, ...result };
}

/**
 * Registrar un pago directo a un centro de bienestar (equipo, 5-ago).
 * Etapa manual: el SPEI se hace fuera; aquí queda el registro y el centro
 * lo ve en su portal.
 */
export async function registerCenterPayment(input: {
  centerId: string;
  concept: string;
  amount: string;
  paidAt?: string;
  notes?: string;
}) {
  const { admin, adminId } = await requireAdmin();
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "Revisa el monto." };
  const CONCEPTS = ["vacunas", "emergencia_medica", "fallecimiento", "otro"];
  if (!CONCEPTS.includes(input.concept))
    return { error: "Elige el concepto del pago." };
  const paidAt = input.paidAt?.trim();
  if (paidAt && !/^\d{4}-\d{2}-\d{2}$/.test(paidAt))
    return { error: "Revisa la fecha del pago." };

  const { error } = await admin.from("center_payments").insert({
    center_id: input.centerId,
    concept: input.concept,
    amount,
    notes: input.notes?.trim() || null,
    ...(paidAt ? { paid_at: paidAt } : {}),
    created_by: adminId,
  });
  if (error) return { error: "No pudimos registrar el pago." };

  revalidatePath("/admin/centros/pagos");
  revalidatePath("/centro", "layout");
  return { ok: true as const };
}

/**
 * Edición de datos del miembro por el SUPER ADMIN (equipo, 5-ago): el caso
 * son personas mayores que llaman por teléfono y no pueden hacerlo solas.
 */
export async function updateMemberByAdmin(
  userId: string,
  fields: {
    first_name?: string;
    last_name?: string;
    mother_last_name?: string;
    phone?: string;
    birth_date?: string;
    nationality?: string;
    curp?: string;
    street?: string;
    number_ext?: string;
    number_int?: string;
    colony?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  },
) {
  const { admin } = await requireAdmin(true);

  const t = (v?: string) => (v?.trim() ? v.trim() : null);
  const street = t(fields.street);
  const numExt = t(fields.number_ext);
  const numInt = t(fields.number_int);
  const birth = t(fields.birth_date);
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth))
    return { error: "Revisa la fecha de nacimiento." };

  const { error } = await admin
    .from("profiles")
    .update({
      first_name: t(fields.first_name),
      last_name: t(fields.last_name),
      mother_last_name: t(fields.mother_last_name),
      phone: t(fields.phone),
      birth_date: birth,
      nationality: t(fields.nationality),
      curp: t(fields.curp)?.toUpperCase() ?? null,
      street,
      number_ext: numExt,
      number_int: numInt,
      colony: t(fields.colony),
      city: t(fields.city),
      state: t(fields.state),
      postal_code: t(fields.postal_code),
      street_address:
        [street, numExt && `#${numExt}`, numInt && `Int. ${numInt}`]
          .filter(Boolean)
          .join(" ") || null,
    })
    .eq("id", userId);
  if (error) return { error: "No pudimos guardar los cambios." };

  // Recalcular la bandera con la MISMA regla del 100% del miembro: sin esto,
  // un perfil completado por teléfono seguía marcado INCOMPLETO hasta que la
  // persona volviera a guardar (la bandera solo se recalculaba en su guardado
  // — el caso Lucero del 10-ago).
  const [{ data: fresh }, { data: pasaporte }] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "first_name, last_name, curp, birth_date, nationality, postal_code, colony, street",
      )
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("documents")
      .select("id")
      .eq("user_id", userId)
      .eq("document_type", "passport")
      .limit(1),
  ]);
  if (fresh) {
    await admin
      .from("profiles")
      .update({
        profile_completed: perfilCompleto(fresh, {
          tienePasaporte: (pasaporte ?? []).length > 0,
        }),
      })
      .eq("id", userId);
  }

  revalidatePath(`/admin/miembros/${userId}`);
  revalidatePath("/admin/miembros");
  return { ok: true as const };
}

/** Edición de una mascota por el SUPER ADMIN (equipo, 5-ago). */
export async function updatePetByAdmin(
  petId: string,
  fields: {
    name?: string;
    breed?: string;
    sex?: string;
    age_years?: string;
    age_months?: string;
    coat_color?: string;
    eye_color?: string;
    nose_color?: string;
  },
) {
  const { admin } = await requireAdmin(true);
  const t = (v?: string) => (v?.trim() ? v.trim() : null);
  const num = (v?: string) => {
    const n = Number(v);
    return v?.trim() && Number.isFinite(n) && n >= 0 ? n : null;
  };

  const name = t(fields.name);
  if (!name) return { error: "El peludo necesita nombre." };

  const { data: pet, error } = await admin
    .from("pets")
    .update({
      name,
      breed: t(fields.breed),
      sex: fields.sex === "male" || fields.sex === "female" ? fields.sex : null,
      age_years: num(fields.age_years),
      age_months: num(fields.age_months),
      coat_color: t(fields.coat_color),
      eye_color: t(fields.eye_color),
      nose_color: t(fields.nose_color),
    })
    .eq("id", petId)
    .select("user_id")
    .single();
  if (error || !pet) return { error: "No pudimos guardar los cambios." };

  revalidatePath(`/admin/miembros/${pet.user_id}`);
  revalidatePath("/admin/mascotas");
  return { ok: true as const };
}

/**
 * Dar de baja a un embajador aprobado — SOLO super admin (equipo, 5-ago).
 * El enum ya tenía 'canceled'; se usa para la baja y se guarda el rastro.
 * Las comisiones ya generadas se quedan; el código deja de aparecer activo.
 */
export async function deactivateAmbassador(id: string, reason: string) {
  const { admin } = await requireAdmin(true);
  const motivo = reason?.trim();
  if (!motivo) return { error: "Escribe el motivo de la baja." };

  const { data: amb } = await admin
    .from("ambassadors")
    .select("id, first_name, email, status")
    .eq("id", id)
    .single();
  if (!amb) return { error: "Embajador no encontrado." };

  await admin
    .from("ambassadors")
    .update({
      status: "canceled",
      deactivated_at: new Date().toISOString(),
      deactivation_reason: motivo,
    })
    .eq("id", id);

  await sendTemplatedEmail("ambassador_deactivated", amb.email, {
    firstName: amb.first_name,
    reason: motivo,
  });

  revalidatePath("/admin/embajadores");
  return { ok: true as const };
}

export async function resolveCenter(
  id: string,
  decision: { approve: true } | { approve: false; reason: string },
) {
  const { admin } = await requireAdmin();
  const { data: center } = await admin
    .from("wellness_centers")
    .select("id, name, contact_name, email")
    .eq("id", id)
    .single();
  if (!center) throw new Error("Centro no encontrado");

  await admin
    .from("wellness_centers")
    .update(
      // `info_requested` se apaga al resolver, por lo mismo que en el
      // embajador: solo la apaga una respuesta del centro.
      decision.approve
        ? { status: "approved", rejection_reason: null, info_requested: false }
        : {
            status: "rejected",
            rejection_reason: decision.reason,
            info_requested: false,
          },
    )
    .eq("id", id);

  if (center.email) {
    const contactName = center.contact_name ?? center.name;
    if (decision.approve) {
      await sendTemplatedEmail("center_approved", center.email, {
        contactName,
        centerName: center.name,
        directoryUrl: `${SITE_URL}/centros`,
      });
    } else {
      await sendTemplatedEmail("center_rejected", center.email, {
        contactName,
        centerName: center.name,
        reason: decision.reason,
      });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/centros");
  revalidatePath("/centros");
  revalidatePath("/app/centros");
}

/**
 * EL COMITÉ LE PIDE ALGO A UN EMBAJADOR O A UN CENTRO (Cipatli, 1-sep).
 *
 * Es el equivalente de `requestPetInfo`, pero para los dos trámites que no
 * tenían conversación. Antes, con una INE borrosa, solo quedaba aprobar a
 * ciegas o denegar sin explicar.
 *
 * UNA SOLA ACCIÓN PARA LOS DOS. Lo único que cambia entre un embajador y un
 * centro es de qué tabla sale el nombre y qué plantilla se manda; todo lo
 * demás —el hilo, los adjuntos, la bandera— es idéntico, y partirlo en dos
 * garantizaría que un arreglo se le haga a uno y al otro no.
 *
 * EL CORREO ES EL AVISO QUE CUENTA, y aquí está la diferencia real con el hilo
 * de un peludo: un miembro siempre tiene cuenta, pero un embajador o un centro
 * puede no tenerla todavía —mandó su solicitud sin sesión y se liga por correo
 * al entrar (arreglo del 11-ago)—. La campana dentro de la plataforma solo se
 * agrega si ya hay a quién notificar; el correo va siempre, y va al correo de
 * LA SOLICITUD, no al del perfil, que puede ser otro.
 */
export async function requestSolicitudInfo(
  sujeto: SujetoSolicitud,
  id: string,
  items: string[],
  message: string,
  documents?: AdjuntoConversacion[],
) {
  const { admin, adminId } = await requireAdmin();
  const text = message?.trim() ?? "";
  const adjuntos = sanearAdjuntos(documents);
  const validItems = itemsValidos(items);
  if (!text && !validItems.length && !adjuntos.length)
    return { error: "Elige qué solicitar, escribe un mensaje o adjunta algo." };

  const cfg = SUJETO[sujeto];
  const { data: fila } = await admin
    .from(cfg.tabla)
    .select(
      sujeto === "embajador"
        ? "id, first_name, email, user_id"
        : "id, name, contact_name, email, user_id",
    )
    .eq("id", id)
    .single();
  if (!fila) return { error: `No encontramos a este ${cfg.queEs}.` };

  const destinatario = (fila as { email?: string | null }).email;
  if (!destinatario)
    return { error: `Este ${cfg.queEs} no tiene un correo al cual escribirle.` };

  const texto = text || "Por favor mándanos lo que te pedimos. ¡Gracias!";

  await admin.from("solicitud_messages").insert({
    [cfg.columna]: id,
    sender: "admin",
    author_id: adminId,
    message: texto,
    requested_items: validItems,
    documents: adjuntos,
  });
  await admin.from(cfg.tabla).update({ info_requested: true }).eq("id", id);

  if (sujeto === "embajador") {
    const amb = fila as { first_name?: string | null };
    await sendTemplatedEmail("ambassador_info_request", destinatario, {
      firstName: amb.first_name ?? "",
      itemsList: listaDeItemsHtml(validItems),
      message: texto,
      portalUrl: `${SITE_URL}${cfg.portal}`,
    });
  } else {
    const c = fila as { name?: string | null; contact_name?: string | null };
    await sendTemplatedEmail("center_info_request", destinatario, {
      contactName: c.contact_name ?? c.name ?? "",
      centerName: c.name ?? "",
      itemsList: listaDeItemsHtml(validItems),
      message: texto,
      portalUrl: `${SITE_URL}${cfg.portal}`,
    });
  }

  const userId = (fila as { user_id?: string | null }).user_id;
  if (userId) {
    await admin.from("notifications").insert({
      user_id: userId,
      type: "solicitud_info_request",
      title: "El comité necesita información",
      message: texto,
    });
  }

  revalidatePath("/admin");
  revalidatePath(sujeto === "embajador" ? "/admin/embajadores" : "/admin/centros");
  revalidatePath(cfg.portal);
  return { ok: true as const };
}

/**
 * Corte mensual de comisiones: agrupa los referidos pendientes generados antes
 * del mes en curso en un payout y los marca como pagados (pago el día 5).
 *
 * El mes sale de `inicioDelMes()`, no de `new Date()` (14-ago). El layout que
 * se sube al banco ya usaba la hora de México y esto no: en Vercel el proceso
 * corre en UTC, así que del último día del mes a partir de las 18:00 hora de
 * México el servidor ya cree que es el mes siguiente. Los dos lados decidían
 * distinto qué referidos entraban al corte, y el archivo del banco podía no
 * cuadrar con lo que el panel marcaba como pagado.
 *
 * A quien se dio de baja se le paga HASTA SU FECHA DE BAJA (Pablo, 16-ago),
 * con el mismo criterio que el layout del banco: cuenta la membresía que entró
 * por la pasarela antes de la baja, no la que se cobró después. Los dos lados
 * tienen que filtrar igual o el archivo y el panel vuelven a discrepar.
 */
export async function payAmbassadorCut(ambassadorId: string) {
  const { admin } = await requireAdmin();

  const monthStart = inicioDelMes();
  const { data: amb } = await admin
    .from("ambassadors")
    .select("deactivated_at")
    .eq("id", ambassadorId)
    .maybeSingle();
  // Un día antes del arranque del mes cae siempre en el mes anterior, y
  // `inicioDelMes` lo lleva a su día 1. El corte se etiqueta con ESE mes,
  // que es el que se está liquidando.
  const periodMonth = diaEnMexico(
    inicioDelMes(new Date(monthStart.getTime() - 24 * 60 * 60 * 1000)),
  );

  let consulta = admin
    .from("referrals")
    .select("id, commission_amount")
    .eq("ambassador_id", ambassadorId)
    .eq("status", "pending")
    .lt("created_at", monthStart.toISOString());
  if (amb?.deactivated_at)
    consulta = consulta.lte("created_at", amb.deactivated_at);
  const { data: pending } = await consulta;
  if (!pending?.length) throw new Error("Sin comisiones por pagar");

  const total = pending.reduce(
    (sum, r) => sum + Number(r.commission_amount ?? 0),
    0,
  );

  const { data: payout, error } = await admin
    .from("ambassador_payouts")
    .insert({
      ambassador_id: ambassadorId,
      period_month: periodMonth,
      total_amount: total,
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !payout) throw new Error("No se pudo registrar el pago");

  await admin
    .from("referrals")
    .update({ status: "paid", payout_id: payout.id })
    .in(
      "id",
      pending.map((r) => r.id),
    );

  revalidatePath("/admin/embajadores");
}

/**
 * Sube o reemplaza una imagen del sitio (slots de la landing) para que el
 * equipo cambie fotos sin deploy. Guarda en el bucket público site-assets.
 */
export async function updateSiteAsset(formData: FormData) {
  const { admin } = await requireAdmin();

  const slot = String(formData.get("slot") ?? "");
  const file = formData.get("file");
  const isPhotoSlot = SITE_ASSET_SLOTS.some((s) => s.slot === slot);
  const isMaterialSlot =
    MATERIAL_SLOTS.some((s) => s.slot === slot) ||
    CAMPAIGN_PDF_SLOTS.includes(slot);
  if (!isPhotoSlot && !isMaterialSlot) throw new Error("Slot desconocido");
  if (!(file instanceof File) || file.size === 0)
    throw new Error("Selecciona un archivo");
  // Fotos del sitio: solo imágenes. Materiales de embajador: cualquier archivo.
  if (isPhotoSlot && !file.type.startsWith("image/"))
    throw new Error("Solo imágenes");
  const maxMb = isPhotoSlot ? 8 : 50;
  if (file.size > maxMb * 1024 * 1024) throw new Error(`Máximo ${maxMb} MB`);

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${slot}-${Date.now()}.${ext}`;
  const { error: upError } = await admin.storage
    .from("site-assets")
    .upload(path, file, { contentType: file.type });
  if (upError) throw new Error("No se pudo subir la imagen");

  const {
    data: { publicUrl },
  } = admin.storage.from("site-assets").getPublicUrl(path);

  await admin
    .from("site_assets")
    .upsert({ slot, url: publicUrl, updated_at: new Date().toISOString() });

  revalidatePath("/");
  revalidatePath("/admin/sitio");
  revalidatePath("/embajador");
  revalidatePath("/admin/landings");
}

/**
 * Resuelve una apelación (segunda revisión del comité).
 * Aceptar: el reintegro vuelve a la cola (in_review) o la mascota queda
 * aprobada. Rechazar: la decisión original se mantiene (con explicación).
 */
export async function resolveAppeal(
  id: string,
  decision:
    | { accept: true }
    | { accept: false; notes: string }
    | { close: true; notes?: string },
) {
  // Las apelaciones las maneja EXCLUSIVAMENTE el super admin (regla del
  // sistema anterior, confirmada por el cliente 16-jul)
  const { admin, adminId } = await requireAdmin(true);
  const { data: appeal } = await admin
    .from("appeals")
    .select(
      "id, folio, status, user_id, reimbursement_id, pet_id, center_id, reimbursements(folio), pets(name), wellness_centers(name, email, contact_name)",
    )
    .eq("id", id)
    .single();
  if (!appeal || appeal.status !== "pending")
    throw new Error("Apelación no encontrada o ya resuelta");

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;
  const reimbursement = one(appeal.reimbursements) as { folio: string } | null;
  const pet = one(appeal.pets) as { name: string } | null;
  const center = one(appeal.wellness_centers) as {
    name: string;
    email: string | null;
    contact_name: string | null;
  } | null;

  const closing = "close" in decision;
  const accepting = "accept" in decision && decision.accept;

  await admin
    .from("appeals")
    .update({
      status: closing ? "closed" : accepting ? "approved" : "rejected",
      resolution_notes: accepting
        ? null
        : ("notes" in decision ? decision.notes : null) || null,
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);

  let outcome = "";
  if (accepting) {
    if (appeal.reimbursement_id) {
      await admin
        .from("reimbursements")
        .update({ status: "in_review", rejection_reason: null, resolved_at: null })
        .eq("id", appeal.reimbursement_id);
      outcome = `tu solicitud ${reimbursement?.folio ?? ""} volvió a revisión del comité`;
    } else if (appeal.pet_id) {
      await admin
        .from("pets")
        .update({ approval_status: "approved", approval_notes: null })
        .eq("id", appeal.pet_id);
      // Aprobada por apelación = aprobada: su espera arranca hoy, igual que
      // en resolvePet (los dos caminos comparten la misma regla).
      await iniciarEsperaDeMascota(admin, appeal.pet_id);
      outcome = `el perfil de ${pet?.name ?? "tu peludo"} quedó aprobado`;
    } else if (appeal.center_id) {
      await admin
        .from("wellness_centers")
        .update({ status: "approved", rejection_reason: null })
        .eq("id", appeal.center_id);
      outcome = `el centro ${center?.name ?? ""} quedó aprobado y ya aparece en el directorio`;
      if (center?.email) {
        await sendTemplatedEmail("center_approved", center.email, {
          contactName: center.contact_name ?? "",
          centerName: center.name,
        });
      }
    }
  }

  // A dónde manda el botón del correo: al detalle de lo apelado, porque
  // /app/apelaciones no existe — la apelación se ve dentro de su sujeto.
  const asuntoUrl = appeal.reimbursement_id
    ? `${SITE_URL}/app/reintegros/${appeal.reimbursement_id}`
    : appeal.pet_id
      ? `${SITE_URL}/app/peludos/${appeal.pet_id}`
      : `${SITE_URL}/centro`;

  const subjectLabel = appeal.reimbursement_id
    ? `tu reintegro ${reimbursement?.folio ?? ""}`
    : appeal.pet_id
      ? `el perfil de ${pet?.name ?? "tu peludo"}`
      : `la solicitud del centro ${center?.name ?? ""}`;

  if (closing) {
    await notifyMember(admin, appeal.user_id, {
      type: "appeal_closed",
      title: `Tu apelación ${appeal.folio} quedó cerrada`,
      message: `El comité cerró el caso sobre ${subjectLabel}.${"notes" in decision && decision.notes ? ` Nota: ${decision.notes}` : ""}`,
    });
    revalidatePath("/admin/apelaciones");
    return { ok: true as const };
  }

  await notifyMember(
    admin,
    appeal.user_id,
    accepting
      ? {
          type: "appeal_accepted",
          title: `¡Tu apelación ${appeal.folio} fue aceptada! 🎉`,
          message: `Tras la segunda revisión, ${outcome}.`,
        }
      : {
          type: "appeal_rejected",
          title: `Resolución de tu apelación ${appeal.folio}`,
          message: `La decisión sobre ${subjectLabel} se mantiene. ${decision.accept === false ? decision.notes : ""}`,
        },
    decision.accept
      ? {
          template: "appeal_accepted",
          vars: { folio: appeal.folio, outcome, asuntoUrl },
        }
      : {
          template: "appeal_rejected",
          vars: { folio: appeal.folio, notes: decision.notes, asuntoUrl },
        },
  );

  revalidatePath("/admin");
  revalidatePath("/admin/apelaciones");
  revalidatePath("/admin/reintegros");
  revalidatePath("/admin/mascotas");
}

/**
 * "Solicitar información" del expediente (sistema anterior): el comité pide
 * fotos/documentos o escribe al miembro sobre una mascota. Queda en el hilo
 * (pet_messages), enciende la bandera en el perfil y avisa por campana+correo.
 */
export async function requestPetInfo(
  petId: string,
  items: string[],
  message: string,
  documents?: AdjuntoConversacion[],
) {
  const { admin, adminId } = await requireAdmin();
  const { data: pet } = await admin
    .from("pets")
    .select("id, name, user_id")
    .eq("id", petId)
    .single();
  if (!pet) throw new Error("Peludo no encontrado");
  const text = message?.trim();
  const adjuntos = sanearAdjuntos(documents);
  if (!text && items.length === 0 && !adjuntos.length)
    return { error: "Elige qué solicitar, escribe un mensaje o adjunta algo." };

  const ITEM_LABELS: Record<string, string> = {
    foto_principal: "📸 Foto principal",
    certificado: "🏥 Certificado veterinario",
    documento: "📄 Documento adicional",
  };
  const validItems = items.filter((i) => ITEM_LABELS[i]);

  await admin.from("pet_messages").insert({
    pet_id: petId,
    sender: "admin",
    author_id: adminId,
    message: text || "Por favor envíanos lo solicitado. ¡Gracias!",
    requested_items: validItems,
    documents: adjuntos,
  });
  await admin.from("pets").update({ info_requested: true }).eq("id", petId);

  await notifyMember(
    admin,
    pet.user_id,
    {
      type: "pet_info_request",
      title: `El comité necesita información sobre ${pet.name}`,
      message: text || "Revisa el perfil para ver lo solicitado.",
    },
    {
      template: "pet_info_request",
      vars: {
        petName: pet.name,
        itemsList: validItems.map((i) => `<li>${ITEM_LABELS[i]}</li>`).join(""),
        message: text || "Por favor envíanos lo solicitado. ¡Gracias!",
        perfilUrl: `${SITE_URL}/app/peludos/${petId}`,
      },
    },
  );

  revalidatePath(`/admin/miembros/${pet.user_id}`);
  return { ok: true as const };
}

/** Mensaje directo del comité en el hilo de una mascota (sin correo). */
export async function sendPetMessage(
  petId: string,
  message: string,
  documents?: AdjuntoConversacion[],
) {
  const { admin, adminId } = await requireAdmin();
  const { data: pet } = await admin
    .from("pets")
    .select("id, name, user_id")
    .eq("id", petId)
    .single();
  if (!pet) throw new Error("Peludo no encontrado");
  const text = message?.trim() ?? "";
  const adjuntos = sanearAdjuntos(documents);
  if (!text && !adjuntos.length)
    return { error: "Escribe el mensaje o adjunta un archivo." };

  await admin.from("pet_messages").insert({
    pet_id: petId,
    sender: "admin",
    author_id: adminId,
    message: text || "(el comité envió archivos)",
    documents: adjuntos,
  });
  await notifyMember(admin, pet.user_id, {
    type: "pet_message",
    title: `Mensaje del comité sobre ${pet.name}`,
    message: text || "El comité te envió archivos.",
  });

  revalidatePath(`/admin/miembros/${pet.user_id}`);
  return { ok: true as const };
}

/**
 * Mensaje del comité en el hilo de un reintegro — cada área tiene su propia
 * conversación con el miembro (patrón del hilo por mascota).
 */
export async function sendReimbursementMessage(
  reimbursementId: string,
  message: string,
  documents?: AdjuntoConversacion[],
) {
  const { admin, adminId } = await requireAdmin();
  const { data: req } = await admin
    .from("reimbursements")
    .select("id, folio, user_id")
    .eq("id", reimbursementId)
    .single();
  if (!req) throw new Error("Reintegro no encontrado");
  const text = message?.trim() ?? "";
  const adjuntos = sanearAdjuntos(documents);
  if (!text && !adjuntos.length)
    return { error: "Escribe el mensaje o adjunta un archivo." };

  await admin.from("reimbursement_messages").insert({
    reimbursement_id: reimbursementId,
    sender: "admin",
    author_id: adminId,
    message: text || "(el comité envió archivos)",
    documents: adjuntos,
  });
  await notifyMember(admin, req.user_id, {
    type: "reimbursement_message",
    title: `Mensaje del comité sobre tu reintegro ${req.folio}`,
    message: text || "El comité te envió archivos.",
  });

  revalidatePath(`/admin/reintegros/${reimbursementId}`);
  return { ok: true as const };
}

/**
 * Resolver UN documento del expediente de una solicitud (equipo, 19-ago —
 * decisión 1.5).
 *
 * Antes aprobar era UNA decisión sobre toda la solicitud. Con persona moral
 * eso ya no alcanza: el comité tiene que poder dar por bueno el RFC y dejar
 * pendiente la INE del representante, o al revés, sin resolver la solicitud
 * entera. Esto NO cambia el estado de la solicitud: aprobar sus documentos y
 * aprobar al embajador o al centro siguen siendo dos decisiones distintas.
 */
export async function reviewDocument(
  documentId: string,
  status: "pendiente" | "aprobado" | "denegado",
  notes?: string,
) {
  const { admin, adminId } = await requireAdmin();
  if (!["pendiente", "aprobado", "denegado"].includes(status))
    return { error: "Estado inválido." };
  const nota = notes?.trim() || null;
  if (status === "denegado" && !nota)
    return { error: "Escribe por qué se deniega — la persona tiene que saber qué corregir." };

  const { error } = await admin
    .from("documents")
    .update({
      status,
      review_notes: nota,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) return { error: "No pudimos guardar la revisión." };

  revalidatePath("/admin/embajadores");
  revalidatePath("/admin/centros");
  revalidatePath("/admin/miembros");
  return { ok: true as const };
}

/**
 * Da de baja la cuenta de un miembro — EXCLUSIVO del super admin (regla del
 * sitio vivo, confirmada 16-jul). Cancela la suscripción en Stripe de
 * inmediato, desactiva la membresía y avisa al miembro por correo
 * (plantilla editable account_deactivated) y notificación.
 */
export async function deactivateMemberAccount(userId: string, reason: string) {
  const { admin } = await requireAdmin(true);
  const motivo = reason?.trim();
  if (!motivo) return { error: "Escribe el motivo de la baja." };

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, first_name, membership_status")
    .eq("id", userId)
    .single();
  if (!profile) return { error: "Miembro no encontrado." };

  // Cancela la suscripción activa en Stripe (inmediato, no al corte)
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, stripe_subscription_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (sub?.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      // La baja local continúa (p. ej. sub de prueba borrada), pero SIN
      // avisar el cobro seguiría corriendo en Stripe mientras la plataforma
      // cree que la persona ya no es miembro — el equipo debe cancelarlo a
      // mano en el panel de Stripe.
      await reportError("baja de cuenta: cancelar en Stripe", err, {
        userId,
        stripe_subscription_id: sub.stripe_subscription_id,
        pendiente: "cancelar la suscripción a mano en el panel de Stripe",
      });
    }
    await admin
      .from("subscriptions")
      .update({ status: "canceled", cancel_at_period_end: false })
      .eq("id", sub.id);
  }

  await admin
    .from("profiles")
    .update({ membership_status: "canceled" })
    .eq("id", userId);
  await admin.from("cancellations").insert({
    user_id: userId,
    reason: "baja_por_comite",
    survey: { motivo },
  });

  await notifyMember(
    admin,
    userId,
    {
      type: "account_deactivated",
      title: "Tu membresía fue dada de baja",
      message: `El comité dio de baja tu membresía. Motivo: ${motivo}`,
    },
    { template: "account_deactivated", vars: { reason: motivo } },
  );

  revalidatePath(`/admin/miembros/${userId}`);
  revalidatePath("/admin/miembros");
  return { ok: true as const };
}

/** Reenvía el correo "obtén tu regalo" a un lead de campaña (CRM). */
export async function resendGiftEmail(leadId: string) {
  const { admin } = await requireAdmin();
  const { data: lead } = await admin
    .from("campaign_leads")
    .select("id, campaign, email, first_name")
    .eq("id", leadId)
    .single();
  if (!lead) throw new Error("Lead no encontrado");

  const { sendGiftEmail } = await import("@/app/landings/[campaign]/actions");
  const sent = await sendGiftEmail(
    lead.id,
    lead.campaign,
    lead.email,
    lead.first_name,
  );
  revalidatePath("/admin/landings");
  return { ok: sent };
}

/** Guarda los ajustes editables del sitio (redes, contacto, alertas). */
export async function updateSiteSettings(formData: FormData) {
  const { admin } = await requireAdmin();
  const keys = [
    ...SITE_SETTINGS.map((s) => s.key),
    ...NOTIFY_EVENTS.map((n) => n.key),
    ...CAMPAIGN_COUPON_KEYS,
    ASSISTANT_PROMPT_KEY,
    SALES_PROMPT_KEY,
  ];
  const rows = keys
    .filter((key) => formData.has(key))
    .map((key) => ({
      key,
      value: String(formData.get(key) ?? "").trim(),
      updated_at: new Date().toISOString(),
    }));
  await admin.from("site_settings").upsert(rows);
  revalidatePath("/");
  revalidatePath("/admin/sitio");
  revalidatePath("/admin/landings");
  revalidatePath("/admin/conversaciones");
}

/** Envía el reporte de métricas por correo a los destinatarios configurados
 *  (Notificaciones → «Reporte de métricas»); si no hay, al admin actual. */
export async function sendReport(report: string) {
  const { admin, adminId } = await requireAdmin();
  const { data: setting } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", "notify_reports")
    .maybeSingle();
  let to = (setting?.value ?? "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (to.length === 0) {
    const { data: me } = await admin
      .from("profiles")
      .select("email")
      .eq("id", adminId)
      .single();
    if (!me?.email) return { error: "Configura destinatarios en Sitio web → Notificaciones." };
    to = [me.email];
  }
  try {
    await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Reporte Club Pata Amiga · ${new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA_MX }).format(new Date())}`,
      html: `<div style="font-family:sans-serif;color:#3D524F;line-height:1.7;white-space:pre-line">${report
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")}</div>`,
    });
  } catch {
    return { error: "No se pudo enviar el reporte. Intenta de nuevo." };
  }
  return { ok: true as const, to: to.length };
}

/** Personaliza una plantilla de correo (asunto + cuerpo HTML). */
export async function saveEmailTemplate(
  key: string,
  subject: string,
  html: string,
) {
  const { admin } = await requireAdmin();
  if (!getTemplateDef(key)) throw new Error("Plantilla desconocida");
  if (!subject.trim() || !html.trim())
    return { error: "El asunto y el cuerpo no pueden quedar vacíos." };
  await admin.from("email_templates").upsert({
    key,
    subject: subject.trim(),
    html,
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/admin/comunicados");
  return { ok: true as const };
}

/** Vuelve a la versión por defecto de una plantilla (borra el override). */
export async function resetEmailTemplate(key: string) {
  const { admin } = await requireAdmin();
  await admin.from("email_templates").delete().eq("key", key);
  revalidatePath("/admin/comunicados");
  return { ok: true as const };
}

/** Super admin only: "Forzar fin de tiempo de espera". */
export async function bypassWaitingPeriod(petId: string) {
  const { admin } = await requireAdmin(true);
  await admin
    .from("pets")
    .update({
      waiting_period_bypassed: true,
      // Hoy en México: forzar el fin de la espera no puede dejar una fecha de
      // mañana solo porque se hizo después de las 6 de la tarde.
      waiting_period_end_date: hoyEnMexico(),
      // Consistencia con la regla nueva: si nunca corrió espera, inicio = fin.
      waiting_period_start_date: hoyEnMexico(),
    })
    .eq("id", petId);
  revalidatePath("/admin");
}
