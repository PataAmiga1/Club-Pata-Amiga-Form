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

  // Sin código, o con uno que no se pudo canjear. OJO: esto NO quiere decir que
  // la liga esté mal. Puede traer su token en el TROZO de la URL
  // (`#access_token=…`), que el servidor nunca ve; el navegador lo conserva al
  // seguir este redireccionamiento y /nueva-contrasena lo lee desde ahí
  // (reporte de una socia, 28-sep-2026).
  //
  // Lo que sí se arrastra aquí es el motivo, cuando Supabase lo manda: así la
  // página dice «venció» o «ya se usó» en vez de adivinar.
  const motivo = new URLSearchParams();
  for (const llave of ["error", "error_code", "error_description", "token_hash", "type"]) {
    const valor = searchParams.get(llave);
    if (valor) motivo.set(llave, valor);
  }
  const cola = motivo.toString();
  return NextResponse.redirect(`${origin}/nueva-contrasena${cola ? `?${cola}` : ""}`);
}
