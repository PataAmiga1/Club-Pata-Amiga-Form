import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { esToken, tokensDeBaja } from "@/lib/correo/bajas";

export const metadata: Metadata = {
  title: "Dejar de recibir correos · Club Pata Amiga",
  robots: { index: false, follow: false },
};

/**
 * Liga de baja VIEJA del boletín (token por suscriptor). Se conserva para que
 * los correos ya enviados sigan funcionando, pero ahora lleva a la baja única
 * de /baja/<token>, que además de quitar el boletín pone a la persona en la
 * lista negra de todo correo de mercadotecnia. No da de baja al abrir: la
 * página de destino pide el clic.
 */
export default async function BajaBoletinViejaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!esToken(token)) redirect("/baja/sin-token");

  const admin = createAdminClient();
  const { data: suscriptor } = await admin
    .from("newsletter_subscribers")
    .select("email")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!suscriptor?.email) redirect("/baja/sin-token");

  const tokens = await tokensDeBaja(admin, [suscriptor.email]);
  const nuevo = tokens.get(String(suscriptor.email).trim().toLowerCase());
  redirect(nuevo ? `/baja/${nuevo}` : "/baja/sin-token");
}
