import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  RUTAS_DEL_ALTA,
  RUTA_LISTA_DE_ESPERA,
  registroAbierto,
} from "@/lib/registro";

export async function proxy(request: NextRequest) {
  // Registro cerrado (17-sep-2026, ver src/lib/registro.ts): las páginas del
  // alta mandan a la lista de interesados. Solo se consulta la base en esas
  // tres rutas. La búsqueda viaja completa: los links de embajador llegan con
  // ?codigo=… y las campañas con utm_*, y la lista los guarda.
  if (
    RUTAS_DEL_ALTA.includes(request.nextUrl.pathname) &&
    !(await registroAbierto())
  ) {
    const url = request.nextUrl.clone();
    url.pathname = RUTA_LISTA_DE_ESPERA;
    return NextResponse.redirect(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * All paths except static assets and images.
     */
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|otf|woff2?)$).*)",
  ],
};
