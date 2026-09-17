import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VetChat } from "./VetChat";
import { createAdminClient } from "@/lib/supabase/admin";
import { esMiembro599 } from "@/lib/reintegros-599";

export default async function VetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/vet");

  const [{ data: profile }, { data: pets }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, membership_status")
      .eq("id", user.id)
      .single(),
    supabase
      .from("pets")
      .select("name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  const es599 = await esMiembro599(createAdminClient(), user.id);
  const petNames = (pets ?? []).map((p) => p.name);
  const greeting = `¡Hola${profile?.first_name ? `, ${profile.first_name}` : ""}! 🐾 Soy tu guía veterinaria. ¿Cómo ${
    petNames.length > 1
      ? `están ${petNames.slice(0, -1).join(", ")} y ${petNames.at(-1)}`
      : petNames.length === 1
        ? `está ${petNames[0]}`
        : "está tu peludo"
  } hoy?`;

  return (
    <VetChat
      active={profile?.membership_status === "active"}
      greeting={greeting}
      es599={es599}
    />
  );
}
