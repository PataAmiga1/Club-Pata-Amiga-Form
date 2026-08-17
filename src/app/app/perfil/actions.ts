"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeam } from "@/lib/alerts";
import { EDAD_MINIMA, edadEnAnios } from "@/lib/edad";

/**
 * Aviso al equipo cuando la edad sale menor de 18 AL COMPLETAR EL PERFIL.
 *
 * Es la contraparte obligada de la decisión del 16-ago: la fecha de nacimiento
 * dejó de pedirse en el alta y la edad se comprueba después, ya con la
 * membresía pagada. Cuando eso pasa, el perfil se queda bloqueado —el guardado
 * no deja pasar a un menor— pero el cobro YA ocurrió, así que alguien tiene que
 * enterarse para reembolsar y cancelar. Sin este aviso el caso queda invisible:
 * la persona ve un error en su pantalla y nadie más se entera.
 *
 * No lanza nunca: si el correo falla, el bloqueo del perfil sigue en pie.
 */
export async function avisarMenorDeEdad(fechaNacimiento: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const edad = edadEnAnios(fechaNacimiento);
  // Se confía en el servidor, no en lo que mande el navegador: si la fecha ya
  // es de alguien mayor de edad, aquí no hay nada que avisar.
  if (edad === null || edad >= EDAD_MINIMA) return;

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("profiles")
    .select("email, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan, amount, status, stripe_subscription_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    // limit(1): un usuario puede acumular filas de suscripción y maybeSingle
    // truena si le llega más de una.
    .limit(1)
    .maybeSingle();

  const nombre =
    `${perfil?.first_name ?? ""} ${perfil?.last_name ?? ""}`.trim() ||
    (perfil?.email ?? user.id);

  await notifyTeam(
    "notify_memberships",
    "⚠️ Menor de edad detectado al completar el perfil",
    `<h2 style="color:#1E5350">${nombre} no tiene ${EDAD_MINIMA} años</h2>
     <p>La fecha que trae su CURP (<strong>${fechaNacimiento}</strong>) le da
     <strong>${edad} años</strong>. Su perfil quedó bloqueado: no puede
     completarlo ni pedir reintegros.</p>
     <p><strong>Correo:</strong> ${perfil?.email ?? "—"}</p>
     <p><strong>Membresía:</strong> ${
       sub
         ? `plan ${sub.plan ?? "—"}, ${sub.amount ?? "—"} MXN${
             sub.stripe_subscription_id
               ? ` — suscripción <code>${sub.stripe_subscription_id}</code>`
               : ""
           }`
         : "sin suscripción activa registrada"
     }</p>
     <p><strong>Qué hay que hacer a mano:</strong> reembolsar el cobro en Stripe
     y cancelar la suscripción. El titular de la membresía tiene que ser mayor
     de edad — si hay un adulto en casa, puede abrir la cuenta con sus datos.</p>`,
  );
}
