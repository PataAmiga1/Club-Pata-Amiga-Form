import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconocerCodigo } from "@/lib/plans/codigos";

/**
 * La casilla «¿Tienes un código?» de la página del plan: dice si la palabra es
 * de un embajador, una promoción de Stripe o ninguna. Solo con sesión, para que
 * no sirva de adivinador de códigos desde fuera.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const texto = new URL(request.url).searchParams.get("code") ?? "";
  const r = await reconocerCodigo(createAdminClient(), texto);
  if (r.tipo === "promocion")
    return NextResponse.json({ tipo: r.tipo, codigo: r.codigo, promocion: r.promocion });
  return NextResponse.json({ tipo: r.tipo, codigo: r.codigo });
}
