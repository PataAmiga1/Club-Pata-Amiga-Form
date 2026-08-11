import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/perfil");

  const [{ data: profile }, { data: docs }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "first_name, last_name, mother_last_name, phone, curp, birth_date, nationality, postal_code, state, city, colony, street, number_ext, number_int",
      )
      .eq("id", user.id)
      .single(),
    // El INE se dejó de pedir a miembros (equipo, 11-ago); los extranjeros
    // suben pasaporte en lugar de CURP.
    supabase
      .from("documents")
      .select("document_type, file_name")
      .eq("user_id", user.id)
      .eq("document_type", "passport"),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col gap-[22px] px-5 py-6 md:py-10">
      <ProfileForm
        userId={user.id}
        initial={profile ?? {}}
        passport={docs?.[0]?.file_name ?? null}
      />
    </div>
  );
}
