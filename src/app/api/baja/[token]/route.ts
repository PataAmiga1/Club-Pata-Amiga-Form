import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarPorToken, darDeBajaCorreo } from "@/lib/correo/bajas";
import { reportError } from "@/lib/alerts";

/**
 * Baja de UN CLIC (RFC 8058).
 *
 * Los correos masivos llevan:
 *   List-Unsubscribe: <https://www.pataamiga.mx/api/baja/TOKEN>, <mailto:…>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *
 * Cuando la persona toca «Cancelar suscripción» en Gmail o Apple Mail, el
 * cliente hace un POST aquí (cuerpo `List-Unsubscribe=One-Click`) y la baja
 * ocurre sin abrir ninguna página. Por eso este POST sí da de baja directo:
 * a diferencia de un GET, los revisores automáticos de ligas no hacen POST.
 *
 * Un GET (alguien abrió la liga a mano) lleva a la página con el botón.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const admin = createAdminClient();
  const fila = await buscarPorToken(admin, token);
  // 404 sin más detalle: no se confirma ni se niega qué tokens existen.
  if (!fila) return NextResponse.json({ ok: false }, { status: 404 });

  try {
    const r = await darDeBajaCorreo(admin, fila.email, "un_clic");
    if (!r.ok) return NextResponse.json({ ok: false }, { status: 400 });
  } catch (err) {
    await reportError("baja de correo (un clic)", err).catch(() => {});
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/baja/${encodeURIComponent(token)}`, request.url), 303);
}
