"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { sendTemplatedEmail } from "@/lib/email/send";
import { notifyTeam } from "@/lib/alerts";
import { ZONA_MX } from "@/lib/zona-horaria";
import { BANCO_OTRO, bankFromClabe, isValidClabe } from "@/lib/banks";
import { versionVigente } from "@/lib/plans/versiones";
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

  // La versión publicada manda; la variable de entorno queda de respaldo
  // mientras el plan no esté publicado en Stripe (mismo criterio que el
  // checkout, para que subir de plan y darse de alta no usen precios
  // distintos).
  const intervalo = target === "annual" ? "year" : "month";
  const version = await versionVigente(admin, intervalo);
  const price = version?.stripe_price_id ?? PRICE_BY_PLAN[target];
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
    .maybeSingle();

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
 * Datos bancarios del miembro (SPEI): se guardan en su perfil y prefillean
 * cada solicitud de reintegro. CLABE validada con dígito de control.
 */
export async function saveMemberBanking(bankNameRaw: string, clabeRaw: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const clabe = clabeRaw?.replace(/\D/g, "") ?? "";
  if (!isValidClabe(clabe))
    return { error: "Revisa tu CLABE — deben ser 18 dígitos válidos." };
  // "Otro" a secas no es un banco (equipo, 13-ago): si llega la palabra sin el
  // nombre real se prefiere el que delata la CLABE.
  const escrito = bankNameRaw?.trim() ?? "";
  const bankName =
    (escrito.toLowerCase() === BANCO_OTRO.toLowerCase() ? "" : escrito) ||
    bankFromClabe(clabe) ||
    "";
  if (!bankName) return { error: "Escribe el nombre de tu banco." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ bank_name: bankName, clabe })
    .eq("id", user.id);
  if (error) return { error: "No pudimos guardar tus datos. Intenta de nuevo." };

  revalidatePath("/app/cuenta");
  return { ok: true as const, bankName };
}
