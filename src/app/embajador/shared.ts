import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AmbassadorContext = {
  userId: string;
  ambassador: {
    id: string;
    first_name: string;
    last_name: string | null;
    /** Datos que capturó al aplicar — se los mostramos en "Mi cuenta" (15-ago). */
    second_last_name: string | null;
    email: string | null;
    phone: string | null;
    curp: string | null;
    birth_date: string | null;
    postal_code: string | null;
    colony: string | null;
    city: string | null;
    state: string | null;
    referral_code: string | null;
    code_change_count: number;
    status: string;
    rejection_reason: string | null;
    bank_name: string | null;
    clabe: string | null;
    bank_holder: string | null;
    rfc: string | null;
    social_links: Record<string, string> | null;
    /** Ruta dentro del bucket privado (o URL completa en las filas heredadas). */
    ine_front_url: string | null;
    ine_back_url: string | null;
  };
  isMember: boolean;
  wasMember: boolean;
};

const AMBASSADOR_COLS =
  "id, first_name, last_name, second_last_name, email, phone, curp, birth_date, postal_code, colony, city, state, referral_code, code_change_count, status, rejection_reason, bank_name, clabe, bank_holder, rfc, social_links, ine_front_url, ine_back_url";

/**
 * Contexto del portal del embajador: exige sesión, resuelve el perfil de
 * embajador (ligando por correo las solicitudes hechas sin sesión) y si el
 * dueño también es miembro. Redirige fuera si no hay perfil.
 */
export async function getAmbassadorContext(): Promise<AmbassadorContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/embajador");

  const admin = createAdminClient();
  let { data: rows } = await admin
    .from("ambassadors")
    .select(AMBASSADOR_COLS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Solicitud enviada sin sesión con el correo de esta cuenta → ligarla
  if (!rows?.length && user.email) {
    const { data: byEmail } = await admin
      .from("ambassadors")
      .select(AMBASSADOR_COLS)
      .is("user_id", null)
      .eq("email", user.email.toLowerCase())
      .order("created_at", { ascending: false });
    if (byEmail?.length) {
      await admin
        .from("ambassadors")
        .update({ user_id: user.id })
        .in(
          "id",
          byEmail.map((a) => a.id),
        );
      rows = byEmail;
    }
  }

  // Un perfil aprobado siempre gana sobre solicitudes más nuevas
  const ambassador = rows?.find((a) => a.status === "approved") ?? rows?.[0];
  if (!ambassador) redirect("/embajadores");

  const [{ data: memberProfile }, { data: activeSub }] = await Promise.all([
    admin
      .from("profiles")
      .select("member_since")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  return {
    userId: user.id,
    ambassador,
    isMember: Boolean(activeSub),
    wasMember: Boolean(memberProfile?.member_since),
  };
}
