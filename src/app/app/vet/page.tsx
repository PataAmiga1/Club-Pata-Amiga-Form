import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VetChat } from "./VetChat";
import { datosDelChatVet } from "./datos";

/** Orientación veterinaria 24/7 — abierta a toda cuenta desde el 17-sep-2026. */
export default async function VetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/vet");

  const datos = await datosDelChatVet(user.id);
  return <VetChat {...datos} />;
}
