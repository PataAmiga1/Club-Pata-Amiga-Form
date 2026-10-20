import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Cierre de sesión del lado del servidor (lo llama `cerrarSesion()` de
 * `src/lib/cerrar-sesion.ts`).
 *
 * Revoca la sesión en Supabase con las cookies que trae la petición y,
 * pase lo que pase con esa llamada, borra las cookies `sb-*`. El
 * `signOut()` de supabase-js NO borra nada si antes tiene que refrescar un
 * token vencido y el refresco falla (red, 5xx o una rotación que le cambió
 * la cookie a media llamada): devuelve el error y la sesión se queda viva.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Sin red o sin sesión: igual se borran las cookies abajo.
  }

  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-")) cookieStore.delete(name);
  }

  return NextResponse.json({ ok: true });
}
