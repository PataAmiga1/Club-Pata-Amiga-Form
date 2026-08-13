import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MAX_ACTIVE_PETS } from "@/lib/constants";
import { PetForm } from "@/components/registro/PetForm";

/**
 * Miembro activo agrega otro peludo — sin stepper ni "plan y pago":
 * la membresía ya está pagada, solo corre su tiempo de espera.
 */
export default async function NuevoPeludoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/peludos/nueva");

  const { count } = await supabase
    .from("pets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);
  if ((count ?? 0) >= MAX_ACTIVE_PETS) redirect("/app/peludos");

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5 px-5 py-6 md:py-10">
      <div>
        <h1 className="font-display text-[28px] text-ink-title md:text-[34px]">
          Registra a un nuevo peludo
        </h1>
        <p className="mt-1.5 text-[14.5px] leading-normal text-ink-secondary">
          Tu membresía cubre hasta {MAX_ACTIVE_PETS} mascotas. El comité
          revisará su perfil y su tiempo de espera empieza hoy.
        </p>
      </div>
      <PetForm mode="member" />
    </div>
  );
}
