"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { versionVigente } from "@/lib/plans/versiones";
import { PLAN_599 } from "@/lib/plans/planes";
import { ESTADOS_VIVOS, type NivelDePrecio } from "@/lib/plans/suscripciones";
import {
  metodoDePagoGuardado,
  registrarCobro,
  registrarSuscripcionDePeludo,
  controlarAltaDePeludo,
} from "@/lib/plans/peludos-599";
import { notifyTeam } from "@/lib/alerts";

/**
 * Activa la membresía $599 de un peludo con la TARJETA GUARDADA (sección 4).
 *
 * Quien ya paga por un peludo no debería volver a teclear su tarjeta para el
 * siguiente. Se crea la suscripción directo en Stripe con su método de pago y
 * `error_if_incomplete`: si el cobro no pasa o pide autenticación, no queda
 * nada a medias y la pantalla lo manda al checkout con otra tarjeta.
 *
 * `checkout: true` en la respuesta = hay que ir por Stripe Checkout.
 */
export async function activarMembresiaDePeludo(
  petId: string,
  plan: "monthly" | "annual",
): Promise<{ ok: true } | { error?: string; checkout?: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  if (plan !== "monthly" && plan !== "annual") return { error: "Elige tu plan." };
  const admin = createAdminClient();

  const [{ data: pet }, { data: suyas }] = await Promise.all([
    admin.from("pets").select("id, name, user_id, is_active").eq("id", petId).maybeSingle(),
    admin
      .from("subscriptions")
      .select("id, status, pet_id")
      .eq("user_id", user.id),
  ]);
  if (!pet || pet.user_id !== user.id || !pet.is_active)
    return { error: "No encontramos a tu peludo." };

  const vivas = (suyas ?? []).filter((s) => ESTADOS_VIVOS.includes(s.status ?? ""));
  if (vivas.some((s) => !s.pet_id))
    return { error: "Tu membresía actual ya incluye hasta 3 peludos." };
  if (vivas.some((s) => s.pet_id === pet.id))
    return { error: `${pet.name} ya tiene su membresía.` };
  if (vivas.some((s) => s.status === "past_due" || s.status === "unpaid"))
    return {
      error:
        "Tienes un pago pendiente. Actualiza tu método de pago desde Mi cuenta antes de agregar otro peludo.",
    };

  const nivel: NivelDePrecio = vivas.length > 0 ? "adicional" : "principal";
  const version = await versionVigente(admin, plan === "annual" ? "year" : "month", PLAN_599);
  const precio =
    nivel === "principal" ? version?.stripe_price_id : version?.stripe_additional_price_id;
  if (!version || !precio) return { error: "La membresía no está disponible en este momento." };

  const previasDelPeludo = (suyas ?? []).filter((s) => s.pet_id === pet.id).length;
  const metodo = await metodoDePagoGuardado(admin, user.id);
  if (!metodo) return { checkout: true };

  const stripe = getStripe();
  let suscripcion;
  try {
    suscripcion = await stripe.subscriptions.create(
      {
        customer: metodo.customerId,
        items: [{ price: precio, quantity: 1 }],
        default_payment_method: metodo.paymentMethodId,
        payment_behavior: "error_if_incomplete",
        metadata: {
          user_id: user.id,
          plan,
          plan_slug: PLAN_599,
          plan_version_id: version.id,
          pet_id: pet.id,
          price_tier: nivel,
          origen: "tarjeta_guardada",
        },
        expand: ["latest_invoice"],
      },
      // Doble clic o reintento = una sola suscripción. La llave cambia solo
      // cuando cambia cuántas suscripciones ha tenido el peludo, así que
      // reactivar después de cancelar sí crea una nueva (sección 9: antes iba
      // por minuto y un reintento al minuto siguiente cobraba doble).
      { idempotencyKey: `activar-${pet.id}-${plan}-${nivel}-${previasDelPeludo}` },
    );
  } catch {
    return {
      error: `No pudimos cobrar con ${metodo.etiqueta}. Puedes pagar con otra tarjeta.`,
      checkout: true,
    };
  }

  // Pudo llegar otro pago del mismo peludo mientras tanto (un checkout abierto
  // en otra pestaña): mismo control que el webhook.
  const control = await controlarAltaDePeludo(admin, {
    userId: user.id,
    petId: pet.id,
    nivel,
    stripeSubscriptionId: suscripcion.id,
    planVersionId: version.id,
  });
  if (control.duplicada)
    return { error: `${pet.name} ya tenía su membresía. Cancelamos este cobro y te lo devolvimos.` };

  const filaId = await registrarSuscripcionDePeludo(admin, {
    userId: user.id,
    petId: pet.id,
    nivel: control.nivel ?? nivel,
    plan,
    planVersionId: version.id,
    suscripcion,
  });
  if (suscripcion.latest_invoice && typeof suscripcion.latest_invoice !== "string")
    await registrarCobro(admin, suscripcion.latest_invoice);

  await admin.from("notifications").insert({
    user_id: user.id,
    type: "plan_changed",
    title: `${pet.name} ya tiene su membresía 🐾`,
    message: `Activamos la membresía de ${pet.name} con ${metodo.etiqueta}. En cuanto el comité apruebe su perfil empiezan a contar sus beneficios.`,
  });
  await notifyTeam(
    "notify_memberships",
    `Nuevo peludo con membresía: ${pet.name}`,
    `<p>Un miembro activó la membresía de <strong>${pet.name}</strong> (${nivel}, ${plan === "annual" ? "anual" : "mensual"}) con su tarjeta guardada.</p><p>Su perfil entra a revisión del comité.</p>`,
  );

  revalidatePath("/app/peludos");
  revalidatePath("/app/cuenta");
  return filaId ? { ok: true } : { error: "Se cobró, pero no pudimos registrar la membresía. El equipo ya fue avisado." };
}
