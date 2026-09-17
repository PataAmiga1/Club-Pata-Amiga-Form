"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { sendTemplatedEmail } from "@/lib/email/send";
import { notifyTeam } from "@/lib/alerts";
import { ZONA_MX } from "@/lib/zona-horaria";
import {
  CUENTAS_MAX,
  cuentasDelMiembro,
  revisarCuenta,
} from "@/lib/cuentas-bancarias";
import { versionVigente } from "@/lib/plans/versiones";
import { PLAN_159, planDeLaVersion } from "@/lib/plans/planes";
import { reemplazarSnapshot } from "@/lib/plans/resolve";

const PRICE_BY_PLAN: Record<"monthly" | "annual", string | undefined> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
};

async function getOwnSubscription() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, stripe_subscription_id, plan, plan_version_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .not("stripe_subscription_id", "is", null)
    // Solo la membresía de $159 (una por persona). Las del $599 son por
    // peludo y se cambian desde `cambiarIntervaloDePeludo`.
    .is("pet_id", null)
    .limit(1)
    .maybeSingle();
  if (!sub?.stripe_subscription_id) {
    // Miembro heredado de Memberstack: su cobro no vive aquí, así que no hay
    // suscripción que prorratear. El mensaje va dirigido a la persona, porque
    // el cliente lo ve tal cual en el portal.
    throw new Error(
      "Tu membresía viene de nuestra plataforma anterior, así que el cambio de " +
        "plan todavía se hace a mano: escríbenos a soporte@pataamiga.mx y lo " +
        "resolvemos por ti.",
    );
  }
  return { userId: user.id, sub, admin };
}

/**
 * Switch plan on the live Stripe subscription.
 * - Upgrade to annual: applies now; Stripe credits unused monthly time and
 *   invoices the difference immediately.
 * - Downgrade to monthly: applies now with no refund; the already-paid
 *   period stays covered and the next renewal bills monthly.
 *
 * Sección 3, punto 6.3: además de prorratear, el snapshot de beneficios se
 * actualiza EN ESE MOMENTO, con el antes y el después escritos en la línea de
 * tiempo del contacto. Es el único caso en que la foto de un miembro cambia
 * sin que intervenga un super admin — y se justifica porque lo pidió la propia
 * persona al cambiarse de plan.
 */
export async function switchPlan(target: "monthly" | "annual") {
  const { userId, sub, admin } = await getOwnSubscription();
  if (sub.plan === target) return { ok: true as const };

  // Se cambia de intervalo DENTRO DE SU PROPIO PLAN. Un miembro de $159 que
  // pasa a anual sigue en $159 (a $1,699), nunca en el plan que se venda hoy.
  // Sin versión = plan de $159 (ver planDeLaVersion).
  //
  // La versión publicada manda; la variable de entorno queda de respaldo
  // mientras el plan no esté publicado en Stripe — y solo para el plan de
  // $159, que es a quien pertenecen esos precios.
  const intervalo = target === "annual" ? "year" : "month";
  const planDelMiembro = await planDeLaVersion(admin, sub.plan_version_id);
  const version = await versionVigente(admin, intervalo, planDelMiembro);
  const price =
    version?.stripe_price_id ??
    (planDelMiembro === PLAN_159 ? PRICE_BY_PLAN[target] : undefined);
  if (!price) throw new Error("Plan inválido");

  const stripe = getStripe();
  const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const item = current.items.data[0];

  const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
    items: [{ id: item.id, price }],
    proration_behavior: target === "annual" ? "always_invoice" : "none",
    metadata: { ...current.metadata, plan: target },
  });

  const newItem = updated.items.data[0];
  await admin
    .from("subscriptions")
    .update({
      plan: target,
      plan_name: target === "annual" ? "Anual" : "Mensual",
      amount: newItem.price.unit_amount != null ? newItem.price.unit_amount / 100 : null,
      cancel_at_period_end: updated.cancel_at_period_end,
      current_period_start: newItem.current_period_start
        ? new Date(newItem.current_period_start * 1000).toISOString()
        : null,
      current_period_end: newItem.current_period_end
        ? new Date(newItem.current_period_end * 1000).toISOString()
        : null,
    })
    .eq("id", sub.id);

  // La foto de beneficios se mueve con el plan, no después. Si el plan nuevo
  // no tiene versión publicada, el snapshot se queda como estaba: mejor
  // conservar lo que la persona ya tenía que dejarlo indefinido.
  if (version) {
    await reemplazarSnapshot(admin, {
      subscriptionId: sub.id,
      userId,
      planVersionId: version.id,
      kind: "plan_cambiado",
      motivo: `Cambió al plan ${target === "annual" ? "Anual" : "Mensual"} (v${version.version})`,
    });
  }

  await admin.from("notifications").insert({
    user_id: userId,
    type: "plan_changed",
    title: `Tu plan cambió a ${target === "annual" ? "Anual" : "Mensual"}`,
    message:
      target === "annual"
        ? "Cambiaste al plan Anual. Se cobró la diferencia proporcional y tu protección sigue sin interrupciones."
        : "Cambiaste al plan Mensual. Tu período ya pagado sigue vigente; la próxima renovación será mensual.",
  });

  revalidatePath("/app/cuenta");
  revalidatePath("/app");
  return { ok: true as const };
}

/**
 * Cancela al final del período pagado.
 *
 * Atiende los DOS tipos de miembro (auditoría del 11-ago):
 *  - con suscripción de Stripe: se marca `cancel_at_period_end` en Stripe.
 *  - **heredado de Memberstack** (activo sin suscripción, 60 de 63): antes
 *    reventaba con "Sin suscripción activa" y el miembro NO PODÍA cancelar.
 *    Ahora se registra la baja aquí y **se avisa al equipo**, porque el cobro
 *    de esa persona no vive en esta plataforma y alguien tiene que detenerlo
 *    por fuera. No se finge que el dinero dejó de moverse.
 */
export async function cancelMembership(reason: string, comments: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const userId = user.id;
  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from("profiles")
    .select("email, first_name, membership_status")
    .eq("id", userId)
    .single();
  if (perfil?.membership_status !== "active")
    throw new Error("Sin membresía activa");

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, stripe_subscription_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("stripe_subscription_id", "is", null)
    .is("pet_id", null)
    .limit(1)
    .maybeSingle();

  // Miembro del $599: cancela peludo por peludo (`cancelarMembresiaDePeludo`).
  // Sin este freno caía en la rama de «cobro heredado» y avisaba al equipo de
  // algo que no pasó.
  if (!sub) {
    const { data: porPeludo } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .not("pet_id", "is", null)
      .eq("status", "active")
      .limit(1);
    if (porPeludo?.length)
      throw new Error("Tu membresía es por peludo: cancélala desde la tarjeta de cada peludo en Mi cuenta.");
  }

  let coverageEnd: Date | null = null;

  if (sub?.stripe_subscription_id) {
    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    const endTs = updated.items.data[0]?.current_period_end;
    coverageEnd = endTs ? new Date(endTs * 1000) : null;
    await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        current_period_end: coverageEnd?.toISOString() ?? null,
      })
      .eq("id", sub.id);
  } else {
    // Heredado: no hay período pagado que consultar. Se deja la baja asentada
    // y el comité decide la fecha real de corte con el proveedor anterior.
    await notifyTeam(
      "notify_memberships",
      "⚠️ Baja de miembro con cobro heredado",
      `<h2 style="color:#1E5350">Canceló un miembro migrado</h2>
       <p><strong>${perfil?.email ?? userId}</strong> canceló su membresía desde su portal.</p>
       <p><strong>Motivo:</strong> ${reason}${comments ? ` — «${comments}»` : ""}</p>
       <p><strong>Qué hay que hacer a mano:</strong> su cobro NO vive en esta
       plataforma (viene de la migración de Memberstack). Hay que detenerlo con
       el proveedor anterior, fijar la fecha real de corte y, cuando llegue,
       dar de baja la cuenta desde Admin → Miembros.</p>`,
    );
  }

  await admin.from("cancellations").insert({
    user_id: userId,
    reason,
    survey: comments ? { comments } : null,
    coverage_end_date: coverageEnd?.toISOString().slice(0, 10) ?? null,
  });

  if (perfil?.email) {
    await sendTemplatedEmail("cancellation", perfil.email, {
      firstName: perfil.first_name ?? "",
      coverageEndLine: coverageEnd
        ? `hasta el <strong>${coverageEnd.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA_MX })}</strong>`
        : "hasta el fin de tu período pagado",
    });
  }

  revalidatePath("/app/cuenta");
  revalidatePath("/app");
  return { ok: true as const, coverageEnd: coverageEnd?.toISOString() ?? null };
}

/** Undo a pending cancellation before the period ends. */
export async function reactivateMembership() {
  const { userId, sub, admin } = await getOwnSubscription();
  const stripe = getStripe();
  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: false,
  });
  await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: false })
    .eq("id", sub.id);
  await admin
    .from("cancellations")
    .update({ rejoined_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("rejoined_at", null);

  revalidatePath("/app/cuenta");
  revalidatePath("/app");
  return { ok: true as const };
}

/** Guarda (o desactiva) los datos de facturación CFDI del miembro. */
export async function saveBillingData(input: {
  wantsInvoice: boolean;
  rfc?: string;
  razonSocial?: string;
  regimenFiscal?: string;
  usoCfdi?: string;
  cpFiscal?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const admin = createAdminClient();

  if (!input.wantsInvoice) {
    await admin
      .from("profiles")
      .update({ cfdi_requested: false })
      .eq("id", user.id);
    revalidatePath("/app/cuenta");
    return { ok: true as const };
  }

  const { isValidRfc } = await import("@/lib/cfdi");
  const rfc = input.rfc?.trim().toUpperCase() ?? "";
  if (!isValidRfc(rfc))
    return { error: "Revisa tu RFC (12 caracteres persona moral, 13 física)." };
  if (!input.razonSocial?.trim())
    return { error: "Escribe la razón social tal como aparece en tu constancia." };
  if (!input.regimenFiscal) return { error: "Selecciona tu régimen fiscal." };
  if (!input.usoCfdi) return { error: "Selecciona el uso del CFDI." };
  if (!/^\d{5}$/.test(input.cpFiscal ?? ""))
    return { error: "El CP fiscal debe tener 5 dígitos." };

  const { error } = await admin
    .from("profiles")
    .update({
      cfdi_requested: true,
      rfc,
      razon_social: input.razonSocial.trim(),
      regimen_fiscal: input.regimenFiscal,
      uso_cfdi: input.usoCfdi,
      cp_fiscal: input.cpFiscal,
    })
    .eq("id", user.id);
  if (error) return { error: "No pudimos guardar tus datos fiscales." };

  revalidatePath("/app/cuenta");
  return { ok: true as const };
}

/**
 * LAS CUENTAS DEL MIEMBRO PARA SU REINTEGRO — hasta tres (equipo 2-sep).
 *
 * Antes era UNA sola y vivía en el perfil. Ahora son hasta tres en
 * `member_bank_accounts` y el miembro elige a cuál se le deposita al pedir el
 * reintegro. `profiles.clabe` YA NO SE ESCRIBE: ver `src/lib/cuentas-bancarias.ts`.
 *
 * Las tres acciones resuelven de quién es la cuenta antes de tocar nada, y
 * escriben con el service role — mismo patrón que el resto de este archivo.
 */
async function miSesion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { userId: user.id, admin: createAdminClient() };
}

export async function agregarCuentaBancaria(entrada: {
  clabe: string;
  bankName: string;
  holder?: string;
}) {
  const ctx = await miSesion();
  if (!ctx) return { error: "Inicia sesión de nuevo." };

  const revisada = revisarCuenta(entrada);
  if ("error" in revisada) return revisada;

  const cuentas = await cuentasDelMiembro(ctx.admin, ctx.userId);
  if (cuentas.length >= CUENTAS_MAX)
    return {
      error: `Puedes guardar hasta ${CUENTAS_MAX} cuentas. Borra una si quieres agregar otra.`,
    };
  if (cuentas.some((c) => c.clabe === revisada.clabe))
    return { error: "Esa cuenta ya está guardada." };

  const { error } = await ctx.admin.from("member_bank_accounts").insert({
    user_id: ctx.userId,
    clabe: revisada.clabe,
    bank_name: revisada.bankName,
    holder: revisada.holder,
    // La primera que guarda queda por omisión sin que tenga que elegir nada.
    is_default: cuentas.length === 0,
  });
  if (error) return { error: "No pudimos guardar la cuenta. Intenta de nuevo." };

  revalidatePath("/app/cuenta");
  revalidatePath("/app/reintegros/nueva");
  return { ok: true as const, bankName: revisada.bankName };
}

export async function borrarCuentaBancaria(id: string) {
  const ctx = await miSesion();
  if (!ctx) return { error: "Inicia sesión de nuevo." };

  const cuentas = await cuentasDelMiembro(ctx.admin, ctx.userId);
  const cuenta = cuentas.find((c) => c.id === id);
  if (!cuenta) return { error: "No encontramos esa cuenta." };

  await ctx.admin
    .from("member_bank_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  // Si se borró la de omisión, la más antigua de las que quedan toma su lugar:
  // sin esto el formulario del reintegro se quedaría sin cuenta propuesta.
  if (cuenta.is_default) {
    const quedan = cuentas.filter((c) => c.id !== id);
    if (quedan.length)
      await ctx.admin
        .from("member_bank_accounts")
        .update({ is_default: true })
        .eq("id", quedan[0].id);
  }

  revalidatePath("/app/cuenta");
  revalidatePath("/app/reintegros/nueva");
  return { ok: true as const };
}

export async function marcarCuentaPorOmision(id: string) {
  const ctx = await miSesion();
  if (!ctx) return { error: "Inicia sesión de nuevo." };

  const cuentas = await cuentasDelMiembro(ctx.admin, ctx.userId);
  if (!cuentas.some((c) => c.id === id))
    return { error: "No encontramos esa cuenta." };

  // Primero se apagan TODAS y luego se prende la elegida: hay un índice único
  // que impide dos por omisión, así que el orden importa.
  await ctx.admin
    .from("member_bank_accounts")
    .update({ is_default: false })
    .eq("user_id", ctx.userId);
  const { error } = await ctx.admin
    .from("member_bank_accounts")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", ctx.userId);
  if (error) return { error: "No pudimos cambiar la cuenta. Intenta de nuevo." };

  revalidatePath("/app/cuenta");
  revalidatePath("/app/reintegros/nueva");
  return { ok: true as const };
}

// ===========================================================================
// Membresía $599: una suscripción por peludo (sección 4, 17-sep-2026)
// ===========================================================================

/** La suscripción de un peludo, solo si es de quien la pide. */
async function suscripcionPropiaDePeludo(subscriptionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, pet_id, status, plan, price_tier, stripe_subscription_id, cancel_at_period_end, pets(name)")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub || sub.user_id !== user.id || !sub.pet_id || !sub.stripe_subscription_id) return null;
  const pet = (Array.isArray(sub.pets) ? sub.pets[0] : sub.pets) as { name?: string } | null;
  return { admin, userId: user.id, sub, petName: pet?.name ?? "tu peludo" };
}

/** Cancela al corte la membresía de UN peludo; los demás siguen igual. */
export async function cancelarMembresiaDePeludo(subscriptionId: string, reason: string) {
  const ctx = await suscripcionPropiaDePeludo(subscriptionId);
  if (!ctx) return { error: "No encontramos esa membresía." };
  const { cancelarAlCorte } = await import("@/lib/plans/peludos-599");
  const r = await cancelarAlCorte(ctx.admin, ctx.sub.id);
  if (!r) return { error: "No pudimos cancelar. Intenta de nuevo." };

  await ctx.admin.from("cancellations").insert({
    user_id: ctx.userId,
    reason: reason || "Sin motivo",
    survey: { membresia_599: true, peludo: ctx.petName, subscription_id: ctx.sub.id },
    coverage_end_date: r.hasta?.slice(0, 10) ?? null,
  });
  await notifyTeam(
    "notify_memberships",
    `Cancelación de la membresía de ${ctx.petName}`,
    `<p>Un miembro canceló la membresía de <strong>${ctx.petName}</strong> al final de su período${r.hasta ? ` (${new Date(r.hasta).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA_MX })})` : ""}.</p><p>Motivo: ${reason || "—"}</p>`,
  );
  revalidatePath("/app/cuenta");
  revalidatePath("/app/peludos");
  return { ok: true as const, hasta: r.hasta };
}

/** Deshace la cancelación de un peludo antes de que termine su período. */
export async function reactivarMembresiaDePeludo(subscriptionId: string) {
  const ctx = await suscripcionPropiaDePeludo(subscriptionId);
  if (!ctx) return { error: "No encontramos esa membresía." };
  await getStripe().subscriptions.update(ctx.sub.stripe_subscription_id!, {
    cancel_at_period_end: false,
  });
  await ctx.admin
    .from("subscriptions")
    .update({ cancel_at_period_end: false })
    .eq("id", ctx.sub.id);
  revalidatePath("/app/cuenta");
  revalidatePath("/app/peludos");
  return { ok: true as const };
}

/**
 * Mensual ↔ anual de UN peludo, dentro del $599 y conservando su nivel
 * (principal o adicional). Mismo criterio de prorrateo que el $159: a anual se
 * cobra la diferencia hoy; a mensual rige desde el siguiente cobro.
 */
export async function cambiarIntervaloDePeludo(
  subscriptionId: string,
  target: "monthly" | "annual",
) {
  const ctx = await suscripcionPropiaDePeludo(subscriptionId);
  if (!ctx) return { error: "No encontramos esa membresía." };
  if (ctx.sub.plan === target) return { ok: true as const };
  if (ctx.sub.status !== "active")
    return { error: "Esta membresía tiene un pago pendiente; primero actualiza tu método de pago." };

  const { PLAN_599 } = await import("@/lib/plans/planes");
  const version = await versionVigente(ctx.admin, target === "annual" ? "year" : "month", PLAN_599);
  const price =
    ctx.sub.price_tier === "adicional"
      ? version?.stripe_additional_price_id
      : version?.stripe_price_id;
  if (!version || !price) return { error: "Ese plan no está disponible en este momento." };

  const stripe = getStripe();
  const actual = await stripe.subscriptions.retrieve(ctx.sub.stripe_subscription_id!);
  const item = actual.items.data[0];
  const nueva = await stripe.subscriptions.update(ctx.sub.stripe_subscription_id!, {
    items: [{ id: item.id, price }],
    proration_behavior: target === "annual" ? "always_invoice" : "none",
    metadata: { ...actual.metadata, plan: target, plan_version_id: version.id },
  });
  const nuevoItem = nueva.items.data[0];
  await ctx.admin
    .from("subscriptions")
    .update({
      plan: target,
      plan_name: target === "annual" ? "Anual" : "Mensual",
      amount: nuevoItem.price.unit_amount != null ? nuevoItem.price.unit_amount / 100 : null,
      current_period_start: nuevoItem.current_period_start
        ? new Date(nuevoItem.current_period_start * 1000).toISOString()
        : null,
      current_period_end: nuevoItem.current_period_end
        ? new Date(nuevoItem.current_period_end * 1000).toISOString()
        : null,
    })
    .eq("id", ctx.sub.id);
  await reemplazarSnapshot(ctx.admin, {
    subscriptionId: ctx.sub.id,
    userId: ctx.userId,
    planVersionId: version.id,
    kind: "plan_cambiado",
    motivo: `${ctx.petName} cambió al plan ${target === "annual" ? "Anual" : "Mensual"} (v${version.version})`,
  });
  revalidatePath("/app/cuenta");
  revalidatePath("/app/peludos");
  return { ok: true as const };
}

/**
 * Garantía de 90 días de UN peludo (sección 6). El sistema calcula el monto
 * (lo cobrado menos lo reintegrado) y deja la solicitud; el equipo confirma y
 * reembolsa desde el panel. «Sin preguntas»: el comentario es opcional.
 */
export async function pedirGarantia(subscriptionId: string, comentario: string) {
  const ctx = await suscripcionPropiaDePeludo(subscriptionId);
  if (!ctx) return { error: "No encontramos esa membresía." };
  const { estadoDeGarantia } = await import("@/lib/garantia");
  const estado = await estadoDeGarantia(ctx.admin, ctx.sub.id);
  if (!estado?.aplica) return { error: "Esta membresía no tiene garantía." };
  if (!estado.dentroDelPlazo) return { error: "El plazo de la garantía ya terminó." };
  if (estado.solicitud?.status === "pendiente")
    return { error: "Ya pediste la garantía de esta membresía; el equipo la está confirmando." };

  const { error } = await ctx.admin.from("guarantee_requests").insert({
    user_id: ctx.userId,
    subscription_id: ctx.sub.id,
    pet_id: ctx.sub.pet_id,
    paid_cents: estado.pagadoCents,
    reimbursed_cents: estado.reintegradoCents,
    refund_cents: estado.reembolsoCents,
    member_comment: comentario.trim() || null,
  });
  if (error) return { error: "No pudimos registrar tu solicitud. Intenta de nuevo." };

  const pesos = (c: number) => `$${(c / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  await ctx.admin.from("notifications").insert({
    user_id: ctx.userId,
    type: "plan_changed",
    title: `Recibimos tu solicitud de garantía para ${ctx.petName}`,
    message: `Te devolveremos ${pesos(estado.reembolsoCents)} MXN (lo pagado menos lo reintegrado). El equipo lo confirma y te avisa cuando se haga el reembolso.`,
  });
  await notifyTeam(
    "notify_memberships",
    `Garantía de 90 días solicitada: ${ctx.petName}`,
    `<h2 style="color:#1E5350">Solicitud de garantía</h2>
     <p><strong>${ctx.petName}</strong> · pagado ${pesos(estado.pagadoCents)} · reintegrado ${pesos(estado.reintegradoCents)} · <strong>a reembolsar ${pesos(estado.reembolsoCents)}</strong></p>
     ${comentario.trim() ? `<p>Comentario: «${comentario.trim()}»</p>` : ""}
     <p>Confírmala en el panel → Finanzas → Garantías.</p>`,
  );
  revalidatePath("/app/cuenta");
  return { ok: true as const, reembolsoCents: estado.reembolsoCents };
}
