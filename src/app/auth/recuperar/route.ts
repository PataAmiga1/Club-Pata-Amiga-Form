import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Aterrizaje de la liga de "olvidé mi contraseña".
 *
 * Es una ruta propia y SIN query string a propósito: la lista blanca de
 * Redirect URLs de Supabase compara la URL completa, y al mandar
 * `/auth/callback?next=…` el destino llegaba recortado. Con una ruta limpia
 * basta que la lista tenga el dominio con `/**`.
 *
 * Canjea el código por sesión (deja la cookie para el servidor) y manda a
 * /nueva-contrasena, que es donde la persona elige su contraseña.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/nueva-contrasena`);
  }

  // Liga vencida o ya usada: la página lo explica y ofrece pedir otra.
  return NextResponse.redirect(`${origin}/nueva-contrasena`);
}
