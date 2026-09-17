import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Decide a dónde aterriza un usuario tras iniciar sesión (cuando no hay
 * ?next explícito). Reglas, en orden:
 *
 * 1. Admin / super admin           → /admin      (desde ahí puede cambiar de portal)
 * 2. Ventas / gerente de ventas    → /ventas
 * 3. Membresía activa              → /app        (miembro; si además es embajador
 *                                     o centro, navega desde el menú)
 * 4. Embajador sin plan activo     → /embajador  (con opción de unirse como miembro)
 * 5. Centro aliado sin plan activo → /centro     (dashboard de su negocio)
 * 6. Cualquier otro caso           → /app        (p. ej. registro a medias)
 *
 * Si el usuario tiene una solicitud de embajador o de centro aliado hecha SIN
 * sesión (user_id null pero mismo correo), aquí se liga a su cuenta para que
 * el dashboard abra automáticamente.
 *
 * Solo servidor (usa el service role): llamar desde route handlers o server
 * actions, nunca desde componentes cliente.
 */
export async function loginDestination(user: {
  id: string;
  email?: string | null;
}): Promise<string> {
  const admin = createAdminClient();

  const [{ data: profile }, { data: sub }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).single(),
    admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      // Una suscripción por peludo en el $599: sin limit(1), dos filas = null.
      .limit(1)
      .maybeSingle(),
  ]);

  if (profile?.role === "admin" || profile?.role === "super_admin")
    return "/admin";
  if (profile?.role === "ventas" || profile?.role === "gerente_ventas")
    return "/ventas";
  if (sub) return "/app";

  // ¿Es embajador (solicitud pendiente o aprobada) sin membresía?
  const { data: byUser } = await admin
    .from("ambassadors")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["pending", "approved"])
    .limit(1);
  if (byUser?.length) return "/embajador";

  // Solicitud enviada sin sesión con el mismo correo → ligarla a la cuenta
  if (user.email) {
    const { data: byEmail } = await admin
      .from("ambassadors")
      .select("id")
      .is("user_id", null)
      .eq("email", user.email.toLowerCase())
      .in("status", ["pending", "approved"])
      .limit(1);
    if (byEmail?.length) {
      await admin
        .from("ambassadors")
        .update({ user_id: user.id })
        .eq("id", byEmail[0].id);
      return "/embajador";
    }
  }

  // ¿Es centro aliado sin membresía? (los rechazados también van a su
  // dashboard: ahí pueden apelar la decisión)
  const { data: centerByUser } = await admin
    .from("wellness_centers")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["pending", "approved", "rejected"])
    .limit(1);
  if (centerByUser?.length) return "/centro";

  if (user.email) {
    const { data: centerByEmail } = await admin
      .from("wellness_centers")
      .select("id")
      .is("user_id", null)
      .eq("email", user.email.toLowerCase())
      .in("status", ["pending", "approved"])
      .limit(1);
    if (centerByEmail?.length) {
      await admin
        .from("wellness_centers")
        .update({ user_id: user.id })
        .eq("id", centerByEmail[0].id);
      return "/centro";
    }
  }

  return "/app";
}
