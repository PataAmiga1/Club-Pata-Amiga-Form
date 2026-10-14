"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revertirBajaCorreo } from "@/lib/correo/bajas";
import { reportError } from "@/lib/alerts";

/**
 * Alta al newsletter desde el footer de la landing.
 *
 * Escribir tu correo aquí ES pedir explícitamente recibir correos, así que si
 * ese correo estaba en la lista negra (`correo_bajas`), sale de ella solo, sin
 * que el equipo intervenga (PM, 14-oct-2026: la lista no debe atrapar a nadie).
 * `revertirBajaCorreo` reactiva el boletín (salvo rebote duro), quita el «no
 * contactar por correo» del CRM y deja la nota «Volvió a suscribirse desde el
 * sitio». La excepción es la queja de spam: esa solo la deshace el equipo (el
 * porqué está junto a `revertirBajaCorreo`).
 */
export async function subscribeNewsletter(emailRaw: string) {
  const email = emailRaw?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Revisa tu correo electrónico." };

  const admin = createAdminClient();

  const { data: baja } = await admin
    .from("correo_bajas")
    .select("baja_at")
    .eq("email", email)
    .maybeSingle();
  if (baja?.baja_at) {
    const r = await revertirBajaCorreo(admin, email, {
      tipo: "persona",
      via: "formulario_sitio",
    });
    if (!r.ok && r.motivo === "queja_spam") return { error: r.error };
    if (!r.ok && r.motivo === "error") {
      await reportError("re-suscripción al boletín (formulario)", r.error).catch(() => {});
      return { error: "No pudimos registrarte. Intenta de nuevo." };
    }
  } else {
    // Baja vieja solo del boletín (anterior a la lista negra): pedirlo de nuevo
    // también la deshace. Un rebote duro no se toca: ese buzón no existe.
    await admin
      .from("newsletter_subscribers")
      .update({ status: "activo", unsubscribed_at: null })
      .eq("email", email)
      .eq("status", "baja");
  }

  const { error } = await admin
    .from("newsletter_subscribers")
    .upsert({ email, source: "landing" }, { onConflict: "email", ignoreDuplicates: true });
  if (error) return { error: "No pudimos registrarte. Intenta de nuevo." };

  return { ok: true as const };
}
