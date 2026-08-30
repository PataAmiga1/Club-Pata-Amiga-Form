import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

/**
 * Portal de facturación de Stripe — para que el miembro actualice su tarjeta
 * (29-ago).
 *
 * POR QUÉ EXISTE. Cuando un cobro falla, la plataforma marca la membresía en
 * `past_due`, avisa a ventas… y al miembro no le dice nada. Y hasta hoy no
 * había NINGUNA forma de cambiar la tarjeta: el único camino que la persona
 * veía era volver a contratar, que es justo lo que produjo el cobro duplicado
 * del 29-ago. Poner el candado en el checkout sin abrir esta puerta habría
 * dejado a esa gente sin salida ninguna.
 *
 * Stripe hospeda la pantalla: aquí nunca pasa un número de tarjeta.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const admin = createAdminClient();
  // Cualquier suscripción que no esté cancelada sirve para llegar al cliente
  // de Stripe: lo que se necesita es el `customer`, no una suscripción sana.
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .neq("status", "canceled")
    .not("stripe_customer_id", "is", null)
    .maybeSingle();

  if (!sub?.stripe_customer_id)
    return NextResponse.json(
      {
        error:
          "No encontramos tu método de pago. Escríbenos y lo resolvemos contigo.",
      },
      { status: 404 },
    );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${siteUrl}/app/cuenta`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("portal de facturación", e);
    return NextResponse.json(
      { error: "No pudimos abrir el portal de pagos. Intenta de nuevo." },
      { status: 502 },
    );
  }
}
