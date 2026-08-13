import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email/send";
import { reportError } from "@/lib/alerts";
import { AMBASSADOR_COMMISSION_MXN } from "@/lib/constants";
import { petWaitingPeriodDays } from "@/lib/waiting-period";
import { crmEventoDeUsuario, marcarComoMiembro } from "@/lib/crm/sync";
import {
  beneficiosDeVersion,
  esperasDe,
  tomarSnapshot,
} from "@/lib/plans/resolve";

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  if (!userId) return;
  const supabase = createAdminClient();

  // 0. Beneficios de la versión contratada. Sin versión (o si algo falla) son
  //    los valores por omisión, que son las reglas de siempre.
  const beneficios = await beneficiosDeVersion(
    supabase,
    session.metadata?.plan_version_id,
  );

  // 1. Member is ACTIVE immediately on payment.
  // El contratante NO tiene tiempo de espera (PM, 11-ago): quien compra la
  // membresía se vuelve miembro automáticamente, sin aprobación ni espera.
  // Antes aquí se escribía profiles.waiting_period_end_date (90 días); las
  // fechas viejas se quedan en la columna pero ya nadie las lee.
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, first_name")
    .eq("id", userId)
    .single();

  await supabase
    .from("profiles")
    .update({
      membership_status: "active",
      member_since: new Date().toISOString(),
      ...(session.metadata?.ambassador_code
        ? { ambassador_code_used: session.metadata.ambassador_code }
        : {}),
    })
    .eq("id", userId);

  // 2. Los días de espera de cada mascota — SOLO para informarlos en el
  // correo de bienvenida. La fecha real ya NO se escribe aquí: el reloj
  // arranca cuando el comité APRUEBA el perfil (regla de la PM, 11-ago;
  // lo fija resolvePet vía iniciarEsperaDeMascota). Escribirla al pagar era
  // parte del bug de los "13 días transcurridos": si el pago llegaba días
  // después de crear el perfil, esa brecha aparecía como avance fantasma.
  const hasReferral = Boolean(session.metadata?.ambassador_code);
  const { data: pets } = await supabase
    .from("pets")
    .select("id, species, name, breed, is_adopted")
    .eq("user_id", userId)
    .is("waiting_period_end_date", null);

  const petDays = new Map<string, number>();
  for (const pet of pets ?? []) {
    const days = petWaitingPeriodDays(
      {
        isAdopted: pet.is_adopted,
        breed: pet.breed,
        hasReferralCode: hasReferral,
      },
      esperasDe(beneficios),
    );
    petDays.set(pet.id, days);
  }

  // 3. Record the subscription.
  //    `plan_version_id` viaja en la metadata del checkout para que el webhook
  //    NUNCA tenga que adivinar de qué versión fue un pago.
  // El período (inicio y fin) se pide a Stripe AQUÍ, en el alta.
  //
  // Por qué: Stripe NO dispara `customer.subscription.updated` al suscribirse
  // (eso pasa en la primera renovación o en un cambio de plan), así que la fila
  // se quedaba con `current_period_start/end` en NULL durante todo el primer
  // período. Consecuencias que eso tenía: el comité no veía "Próximo cobro" en
  // el expediente, el miembro veía una fecha ADIVINADA (`member_since` + 1 mes)
  // en lugar de la real, y los recordatorios de renovación no tendrían de dónde
  // leer. Detectado el 11-ago comparando la BD contra Stripe.
  let periodoInicio: string | null = null;
  let periodoFin: string | null = null;
  if (session.subscription) {
    try {
      const suscripcion = await getStripe().subscriptions.retrieve(
        session.subscription as string,
      );
      const item = suscripcion.items.data[0];
      if (item?.current_period_start)
        periodoInicio = new Date(item.current_period_start * 1000).toISOString();
      if (item?.current_period_end)
        periodoFin = new Date(item.current_period_end * 1000).toISOString();
    } catch (e) {
      // Si Stripe no responde, la fila se crea igual: el pago ya ocurrió y no
      // se puede perder. Las fechas las rellenará el evento de renovación.
      console.error("[webhook] no se pudo leer el período de la suscripción", e);
    }
  }

  const { data: subRow } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        plan: session.metadata?.plan ?? null,
        amount: session.amount_total ? session.amount_total / 100 : null,
        currency: (session.currency ?? "mxn").toUpperCase(),
        status: "active",
        ...(periodoInicio ? { current_period_start: periodoInicio } : {}),
        ...(periodoFin ? { current_period_end: periodoFin } : {}),
      },
      { onConflict: "stripe_subscription_id" },
    )
    .select("id")
    .single();

  // 3b. Foto de los beneficios: a partir de aquí este miembro se rige por SU
  //     copia, no por lo que diga el plan después (grandfathering).
  if (subRow?.id)
    await tomarSnapshot(supabase, {
      subscriptionId: subRow.id,
      planVersionId: session.metadata?.plan_version_id ?? null,
    });

  // 4. Referral for the ambassador — commission fixed at signup, paid at the
  // monthly cut (día 5 del mes siguiente)
  if (session.metadata?.ambassador_code) {
    const { data: ambassador } = await supabase
      .from("ambassadors")
      .select("id")
      .eq("referral_code", session.metadata.ambassador_code)
      .eq("status", "approved")
      .maybeSingle();
    if (ambassador) {
      await supabase
        .from("referrals")
        .upsert(
          {
            ambassador_id: ambassador.id,
            referred_user_id: userId,
            subscription_id: subRow?.id ?? null,
            // La comisión también sale del plan contratado.
            commission_amount:
              session.metadata?.plan === "annual"
                ? Number(beneficios.comision_embajador_anual_mxn) ||
                  AMBASSADOR_COMMISSION_MXN.annual
                : Number(beneficios.comision_embajador_mensual_mxn) ||
                  AMBASSADOR_COMMISSION_MXN.monthly,
            status: "pending",
          },
          { onConflict: "referred_user_id", ignoreDuplicates: true },
        );
    }
  }

  // 5. CRM: la tarjeta pasa a "Pago procesado / En revisión". Llega a "Miembro
  //    activo" cuando el comité aprueba la mascota (ver resolvePet). Es la
  //    etapa que en LynSales nunca se llenó porque dependía de que alguien la
  //    moviera a mano.
  await crmEventoDeUsuario(supabase, {
    userId,
    kind: "pago_confirmado",
    summary: `Pago confirmado — plan ${session.metadata?.plan ?? "membresía"}`,
    stageKey: "pago_procesado",
    interval: session.metadata?.plan === "annual" ? "year" : "month",
    payload: { sessionId: session.id, amount: session.amount_total },
  });
  await marcarComoMiembro(supabase, userId);

  // 6. Welcome email (sendTemplatedEmail never throws)
  if (profile?.email) {
    const firstPet = pets?.[0];
    await sendTemplatedEmail("welcome", profile.email, {
      firstName: profile.first_name ?? "",
      petNotice: firstPet
        ? `<strong>${firstPet.name}</strong> entra a revisión del comité. En cuanto su perfil sea aprobado empezará su tiempo de espera de ${petDays.get(firstPet.id) ?? 180} días.`
        : "",
    });
  }
}

/** Keeps the local subscription row in sync (plan switches, renewals, cancel flags). */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const priceId = item?.price.id;
  const plan =
    priceId === process.env.STRIPE_PRICE_ANNUAL
      ? "annual"
      : priceId === process.env.STRIPE_PRICE_MONTHLY
        ? "monthly"
        : null;

  const supabase = createAdminClient();
  await supabase
    .from("subscriptions")
    .update({
      ...(plan ? { plan, plan_name: plan === "annual" ? "Anual" : "Mensual" } : {}),
      amount: item?.price.unit_amount != null ? item.price.unit_amount / 100 : undefined,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_start: item?.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : undefined,
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : undefined,
    })
    .eq("stripe_subscription_id", subscription.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = createAdminClient();
  const { data: subRow } = await supabase
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", subscription.id)
    .select("user_id")
    .maybeSingle();
  if (subRow?.user_id) {
    await supabase
      .from("profiles")
      .update({ membership_status: "canceled" })
      .eq("id", subRow.user_id);
    await crmEventoDeUsuario(supabase, {
      userId: subRow.user_id,
      kind: "membresia_inactiva",
      summary: "Suscripción cancelada en Stripe",
      stageKey: "miembro_inactivo",
      payload: { stripeSubscriptionId: subscription.id },
    });
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subId =
    typeof invoice.parent?.subscription_details?.subscription === "string"
      ? invoice.parent.subscription_details.subscription
      : null;
  if (!subId) return;
  const supabase = createAdminClient();
  const { data: subRow } = await supabase
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subId)
    .select("user_id")
    .maybeSingle();
  if (subRow?.user_id) {
    await supabase
      .from("profiles")
      .update({ membership_status: "past_due" })
      .eq("id", subRow.user_id);
    // Un pago fallido es la señal más accionable que tiene ventas: la tarjeta
    // aparece en "Miembro inactivo" el mismo día, no cuando alguien lo note.
    await crmEventoDeUsuario(supabase, {
      userId: subRow.user_id,
      kind: "membresia_inactiva",
      summary: "Pago rechazado — la membresía quedó en mora",
      stageKey: "miembro_inactivo",
      payload: { invoiceId: invoice.id },
    });
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  const stripe = getStripe();
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
    }
  } catch (e) {
    // Alerta al equipo: un webhook fallido puede dejar una membresía sin activar
    await reportError("stripe-webhook", e, { eventType: event.type, eventId: event.id });
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
