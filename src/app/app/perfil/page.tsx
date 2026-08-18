import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { datosConocidos } from "@/lib/datos-conocidos";
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
        "first_name, last_name, mother_last_name, phone, curp, birth_date, nationality, postal_code, state, city, colony, street, number_ext, number_int, avatar_url",
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

  // Quien ya fue embajador o centro no vuelve a capturar lo mismo (equipo,
  // 15-ago): lo que falte en su perfil de miembro se rellena con lo que dio en
  // ese otro rol. SOLO rellena huecos — nunca pisa lo que ya escribió aquí.
  const conocidos = await datosConocidos();
  const inicial = {
    ...(profile ?? {}),
    first_name: profile?.first_name || conocidos?.firstName || null,
    last_name: profile?.last_name || conocidos?.lastName || null,
    mother_last_name:
      profile?.mother_last_name || conocidos?.secondLastName || null,
    phone: profile?.phone || conocidos?.phone || null,
    curp: profile?.curp || conocidos?.curp || null,
    birth_date: profile?.birth_date || conocidos?.birthDate || null,
    postal_code: profile?.postal_code || conocidos?.postalCode || null,
    colony: profile?.colony || conocidos?.colony || null,
    city: profile?.city || conocidos?.city || null,
    state: profile?.state || conocidos?.state || null,
  };

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col gap-[22px] px-5 py-6 md:py-10">
      <ProfileForm
        userId={user.id}
        initial={inicial}
        passport={docs?.[0]?.file_name ?? null}
        avatarUrl={profile?.avatar_url ?? null}
      />
    </div>
  );
}
