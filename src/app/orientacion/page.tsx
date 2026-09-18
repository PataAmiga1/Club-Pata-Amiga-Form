import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicHeader } from "@/components/public/PublicHeader";
import { VetChat } from "@/app/app/vet/VetChat";
import { datosDelChatVet } from "@/app/app/vet/datos";

export const metadata: Metadata = {
  title: "Orientación veterinaria 24/7 · Club Pata Amiga",
};

/**
 * El mismo chat de /app/vet para cuentas que no entran al área de miembros:
 * embajadores y centros aliados sin membresía (el layout de /app los manda a
 * su propio panel). Abierto a toda cuenta desde el 17-sep-2026.
 */
export default async function OrientacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/orientacion");

  const admin = createAdminClient();
  const [datos, { data: embajador }, { data: centro }] = await Promise.all([
    datosDelChatVet(user.id),
    admin.from("ambassadors").select("id").eq("user_id", user.id).limit(1),
    admin.from("wellness_centers").select("id").eq("user_id", user.id).limit(1),
  ]);
  const volverA = embajador?.length ? "/embajador" : centro?.length ? "/centro" : "/app";

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <PublicHeader />
      <div className="mx-auto w-full max-w-[760px] flex-1">
        <VetChat {...datos} volverA={volverA} />
      </div>
    </div>
  );
}
