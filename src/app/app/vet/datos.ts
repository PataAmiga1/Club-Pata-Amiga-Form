import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esMiembro599 } from "@/lib/reintegros-599";
import { estadoDelChatVet } from "@/lib/chat-vet";

/**
 * Lo que necesita la pantalla del chat veterinario. Lo usan `/app/vet` (dentro
 * del área de miembros) y `/orientacion` (para embajadores y centros sin
 * membresía, que no entran a /app): el chat está abierto a toda cuenta desde
 * el 17-sep-2026.
 */
export async function datosDelChatVet(userId: string) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: profile }, { data: pets }, es599, estado] = await Promise.all([
    supabase.from("profiles").select("first_name").eq("id", userId).single(),
    supabase
      .from("pets")
      .select("name")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    esMiembro599(admin, userId),
    estadoDelChatVet(admin, userId),
  ]);

  const petNames = (pets ?? []).map((p) => p.name);
  const greeting = `¡Hola${profile?.first_name ? `, ${profile.first_name}` : ""}! 🐾 Soy tu guía veterinaria. ¿Cómo ${
    petNames.length > 1
      ? `están ${petNames.slice(0, -1).join(", ")} y ${petNames.at(-1)}`
      : petNames.length === 1
        ? `está ${petNames[0]}`
        : "está tu peludo"
  } hoy?`;

  return {
    greeting,
    es599,
    esMiembro: estado.esMiembro,
    restantes: estado.restantes,
    necesitaTelefono: !estado.esMiembro && !estado.tieneTelefono,
  };
}
