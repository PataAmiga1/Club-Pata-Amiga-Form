import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { crmEventoDeUsuario } from "@/lib/crm/sync";
import { versionVigente } from "@/lib/plans/versiones";
import { ALTAS_SON_599, PLAN_159, PLAN_DE_ALTAS } from "@/lib/plans/planes";
import { ESTADOS_VIVOS, type NivelDePrecio } from "@/lib/plans/suscripciones";
import { registroAbierto } from "@/lib/registro";
import { anualParaMSI, sesionDePagoAnual } from "@/lib/plans/msi";

const PRICE_BY_PLAN: Record<string, string | undefined> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Registro cerrado (17-sep-2026): no se abre ningún cobro nuevo, aunque
  // alguien llegue directo a esta ruta o traiga la página vieja en caché.
  // Los miembros actuales no pasan por aquí: cambian de plan desde Mi cuenta.
  // Quien ya paga por un peludo del $599 no es un alta: agregar otro peludo
  // sigue permitido aunque el registro de gente nueva esté cerrado.
  const { data: vivasDelMiembro } = await createAdminClient()
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .not("pet_id", "is", null);
  const yaEsMiembro599 = (vivasDelMiembro ?? []).some((s) =>
    ESTADOS_VIVOS.includes(s.status ?? ""),
  );
  if (!yaEsMiembro599 && !(await registroAbierto())) {
    return NextResponse.json(
      {
        error:
          "Estamos preparando la nueva membresía y por ahora no hay registro. Déjanos tus datos y te avisamos en cuanto abra.",
        motivo: "registro_cerrado",
      },
      { status: 403 },
    );
  }

  const { plan: planPedido, ambassadorCode, petId } = await request.json();
  // «annual_msi» es el MISMO plan anual, pagado de una vez y a meses sin
  // intereses (17-sep-2026). Stripe no admite MSI dentro de una suscripción,
  // así que cambia CÓMO se cobra, no qué se contrata: de ahí `plan` para todo
  // lo demás y `esMSI` solo para armar la sesión de pago.
  const esMSI = planPedido === "annual_msi";
  const plan = esMSI ? "annual" : planPedido;
  if (!PRICE_BY_PLAN[plan] && plan !== "monthly" && plan !== "annual") {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }
  if (esMSI && !ALTAS_SON_599) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }

  // Quien se registra contrata el plan de altas (PLAN_DE_ALTAS). La versión
  // publicada manda sobre la variable de entorno; si todavía no hay versión con
  // precio en Stripe (o falla la consulta), se usa el precio de siempre.
  //
  // Ese respaldo es SOLO del plan de $159: las variables de entorno apuntan a
  // sus precios. Si el plan de altas es otro y no tiene precio publicado, el
  // checkout se niega — venderle $159 a quien debía contratar el plan nuevo
  // sería un error que no se ve hasta el primer reintegro.
  const versionPublicada = await versionVigente(
    createAdminClient(),
    plan === "annual" ? "year" : "month",
    PLAN_DE_ALTAS,
  );
  let price =
    versionPublicada?.stripe_price_id ??
    (PLAN_DE_ALTAS === PLAN_159 ? PRICE_BY_PLAN[plan] : undefined);
  if (!price) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }

  const guard = createAdminClient();

  // ===== Membresía $599: una suscripción POR PELUDO (sección 2) =====
  //
  // El candado del $159 de abajo bloquea a quien tenga cualquier suscripción
  // viva; aquí eso impediría pagar el segundo peludo. Las reglas son otras:
  //   · quien tiene el $159 vivo no contrata $599: su membresía ya incluye
  //     hasta 3 peludos (decisión del 17-sep);
  //   · un peludo no se cobra dos veces;
  //   · con un cobro pendiente no se abre otro: primero se arregla la tarjeta;
  //   · el primer peludo paga el principal y los siguientes el adicional.
  let peludo: { id: string; nivel: NivelDePrecio; customerId: string | null } | null =
    null;
  if (ALTAS_SON_599) {
    const [{ data: suyas }, { data: peludos }] = await Promise.all([
      guard
        .from("subscriptions")
        .select("id, status, pet_id, stripe_customer_id")
        .eq("user_id", user.id),
      guard
        .from("pets")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
    ]);
    const vivas = (suyas ?? []).filter((s) => ESTADOS_VIVOS.includes(s.status ?? ""));

    if (vivas.some((s) => !s.pet_id))
      return NextResponse.json(
        {
          error:
            "Tu membresía actual ya incluye hasta 3 peludos. Agrega a tu peludo desde tu cuenta.",
          motivo: "miembro_159",
        },
        { status: 409 },
      );
    if (vivas.some((s) => s.status === "past_due" || s.status === "unpaid"))
      return NextResponse.json(
        {
          error:
            "Tienes un pago pendiente. Actualiza tu método de pago desde Mi cuenta y el cobro se reintenta solo.",
          motivo: "pago_pendiente",
        },
        { status: 409 },
      );

    const cubiertos = new Set(vivas.map((s) => s.pet_id));
    const propios = (peludos ?? []).map((p) => p.id);
    const elegido = petId
      ? propios.includes(petId)
        ? petId
        : null
      : (propios.find((id) => !cubiertos.has(id)) ?? null);
    if (!elegido)
      return NextResponse.json(
        { error: "Registra a tu peludo antes de pagar.", motivo: "sin_peludo" },
        { status: 400 },
      );
    if (cubiertos.has(elegido))
      return NextResponse.json(
        { error: "Ese peludo ya tiene su membresía.", motivo: "peludo_con_membresia" },
        { status: 409 },
      );

    const nivel: NivelDePrecio = vivas.length > 0 ? "adicional" : "principal";
    const precioDelNivel =
      nivel === "principal"
        ? versionPublicada?.stripe_price_id
        : versionPublicada?.stripe_additional_price_id;
    if (!precioDelNivel)
      return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
    price = precioDelNivel;

    // Todos los peludos de una persona cuelgan del MISMO cliente de Stripe:
    // una tarjeta, un portal, un estado de cuenta.
    const customerId =
      (suyas ?? []).find((s) => s.stripe_customer_id)?.stripe_customer_id ?? null;
    peludo = { id: elegido, nivel, customerId };
  }

  // ===== Candado contra la doble suscripción (caso real, 29-ago) =====
  //
  // Antes este candado solo miraba `status = 'active'`, y ahí estaba el hueco:
  // a quien le fallaba la renovación le quedaba la suscripción en `past_due`
  // —viva en Stripe, con reintentos automáticos programados— pero el checkout
  // lo dejaba contratar OTRA. Si el reintento de Stripe después cobraba la
  // vieja, la persona terminaba con dos suscripciones y pagando doble.
  // Pasó: un miembro con cobros fallidos el 24 y 27 de agosto se registró de
  // nuevo el 26, y el 29 Stripe le cobró también la anterior.
  //
  // SE BLOQUEA TODO LO QUE NO ESTÉ CANCELADO, no una lista de estados malos.
  // `past_due` era el que faltaba, pero `unpaid`, `trialing`, `paused` e
  // `incomplete` fallan igual: la suscripción sigue existiendo en Stripe y
  // puede volver a cobrar. Con una lista de estados bloqueados, cualquier
  // estado nuevo de Stripe se colaría; con esta, se frena por omisión.
  // `.limit(1)` y NO `.maybeSingle()`: quien ya arrastra dos suscripciones vivas
  // —el caso que este candado existe para evitar— haría que `maybeSingle()`
  // devolviera error, y con error `data` viene null y el candado FALLA ABIERTO,
  // dejando pasar justo a quien más hay que frenar.
  const { data: existentes } = await guard
    .from("subscriptions")
    .select("id, status")
    .eq("user_id", user.id)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1);
  const existingSub = existentes?.[0];
  if (existingSub && !ALTAS_SON_599) {
    // El mensaje distingue los dos casos porque la salida es distinta: quien
    // ya está al corriente cambia de plan; a quien le falló el cobro hay que
    // mandarlo a actualizar su tarjeta, no a contratar otra vez.
    const enMora =
      existingSub.status === "past_due" || existingSub.status === "unpaid";
    return NextResponse.json(
      {
        error: enMora
          ? "Tu membresía tiene un pago pendiente, no hace falta contratar de nuevo. Actualiza tu método de pago desde Mi cuenta y el cobro se reintenta solo."
          : "Ya tienes una membresía activa. Cambia de plan desde Mi cuenta.",
        motivo: enMora ? "pago_pendiente" : "ya_activa",
      },
      { status: 409 },
    );
  }

  // Ambassador code is optional; only forward it if it is real and approved
  let validCode: string | undefined;
  if (ambassadorCode) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ambassadors")
      .select("id")
      .eq("referral_code", ambassadorCode)
      .eq("status", "approved")
      .maybeSingle();
    if (data) validCode = ambassadorCode;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const stripe = getStripe();

  // ===== Anual a meses sin intereses (17-sep-2026) =====
  // Un pago único por el año, con MSI prendido; la suscripción que renueva se
  // crea en el webhook, con el primer cobro a 12 meses.
  if (esMSI) {
    if (!peludo) return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
    const anual = await anualParaMSI(guard, peludo.nivel);
    if (!anual)
      return NextResponse.json(
        { error: "La membresía anual no está disponible en este momento." },
        { status: 400 },
      );
    const url = await sesionDePagoAnual({
      anual,
      clienteStripe: peludo.customerId,
      correo: user.email ?? null,
      descripcion: "Membresía Pata Amiga · un año",
      metadata: {
        user_id: user.id,
        plan: "annual",
        plan_slug: PLAN_DE_ALTAS,
        pet_id: peludo.id,
        price_tier: peludo.nivel,
        plan_version_id: anual.planVersionId,
        msi: "1",
        ...(validCode ? { ambassador_code: validCode } : {}),
      },
      successUrl:
        peludo.nivel === "adicional"
          ? `${siteUrl}/app/peludos?membresia=1`
          : `${siteUrl}/registro/bienvenida?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl:
        peludo.nivel === "adicional"
          ? `${siteUrl}/app/peludos/${peludo.id}/membresia`
          : `${siteUrl}/registro/plan`,
    });
    if (!url) return NextResponse.json({ error: "No pudimos abrir el pago." }, { status: 502 });
    await crmEventoDeUsuario(guard, {
      userId: user.id,
      kind: "checkout_abierto",
      summary: "Abrió el checkout del plan anual a meses sin intereses",
      stageKey: "registro_iniciado",
      interval: "year",
      payload: { plan: "annual_msi", petId: peludo.id, nivel: peludo.nivel },
    });
    return NextResponse.json({ url });
  }

  // Membresía $599 (sección 9): un checkout nuevo reemplaza a los que esta
  // persona dejó abiertos. Una sesión de Stripe vive 24 horas y se puede pagar
  // cuando sea; con dos abiertas (dos pestañas, el botón «atrás») se podían
  // pagar las dos: el mismo peludo dos veces, o dos peludos a precio completo.
  // Si aun así se cruzan dos pagos, el webhook los corrige
  // (`controlarAltaDePeludo`).
  if (peludo) {
    try {
      const desde = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      for await (const abierta of stripe.checkout.sessions.list({
        status: "open",
        created: { gte: desde },
        limit: 100,
      })) {
        if (abierta.metadata?.user_id === user.id && abierta.id)
          await stripe.checkout.sessions.expire(abierta.id);
      }
    } catch (e) {
      // No detiene el pago: el webhook sigue siendo la red de seguridad.
      console.error("[checkout] no se pudieron expirar las sesiones abiertas", e);
    }
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    ...(peludo?.customerId
      ? { customer: peludo.customerId }
      : { customer_email: user.email }),
    // Campo "código de promoción" en el checkout — aquí viven los cupones
    // de las landings (se crean manualmente en Stripe → Promotion codes)
    allow_promotion_codes: true,
    // Un peludo adicional se paga desde la cuenta: vuelve a sus peludos, no
    // a la bienvenida del alta.
    success_url:
      peludo?.nivel === "adicional"
        ? `${siteUrl}/app/peludos?membresia=1`
        : `${siteUrl}/registro/bienvenida?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:
      peludo?.nivel === "adicional"
        ? `${siteUrl}/app/peludos/${peludo.id}/membresia`
        : `${siteUrl}/registro/plan`,
    metadata: {
      user_id: user.id,
      plan,
      plan_slug: PLAN_DE_ALTAS,
      ...(peludo ? { pet_id: peludo.id, price_tier: peludo.nivel } : {}),
      // Viaja la versión para que el webhook NUNCA tenga que adivinar de qué
      // versión fue este pago al tomar la foto de beneficios.
      ...(versionPublicada ? { plan_version_id: versionPublicada.id } : {}),
      ...(validCode ? { ambassador_code: validCode } : {}),
    },
    subscription_data: {
      metadata: {
        user_id: user.id,
        plan,
        plan_slug: PLAN_DE_ALTAS,
        ...(peludo ? { pet_id: peludo.id, price_tier: peludo.nivel } : {}),
        ...(versionPublicada ? { plan_version_id: versionPublicada.id } : {}),
      },
    },
  });

  // CRM: llegó al checkout. La tarjeta entra a "Registro iniciado" y, si en 24 h
  // no hay pago, la tarea diaria la pasa a "Carrito abandonado" — el embudo que
  // hoy tiene 228 tarjetas en LynSales y nadie puede trabajar porque no se sabe
  // en qué paso se cayó cada persona.
  await crmEventoDeUsuario(guard, {
    userId: user.id,
    kind: "checkout_abierto",
    summary: `Abrió el checkout del plan ${plan}`,
    stageKey: "registro_iniciado",
    interval: plan === "annual" ? "year" : "month",
    payload: { sessionId: session.id, plan, ...(peludo ? { petId: peludo.id, nivel: peludo.nivel } : {}) },
  });

  return NextResponse.json({ url: session.url });
}
