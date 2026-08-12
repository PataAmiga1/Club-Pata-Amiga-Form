import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarRecordatoriosDatosFaltantes } from "@/lib/email/recordatorios";

/**
 * Cron de recordatorios de datos faltantes (equipo, 5-ago): correo periódico
 * a miembros activos con el perfil incompleto.
 *
 * CONECTAR: agregar a vercel.json → crons cuando la cuenta sea Pro (el plan
 * de prueba solo permite 2 crons y ya están ocupados por cumpleaños y
 * carritos). Mientras, el botón "Enviar ahora" vive en Admin → Comunicados
 * → Envíos. Sugerido: semanal, `0 16 * * 1` (lunes 10am CDMX).
 *
 * Protección: igual que los demás crons (Bearer CRON_SECRET o x-vercel-cron).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const provided =
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    url.searchParams.get("secret");
  const isVercelCron = request.headers.get("x-vercel-cron") !== null;
  if (secret) {
    if (provided !== secret && !isVercelCron) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  } else if (!isVercelCron) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const result = await enviarRecordatoriosDatosFaltantes(admin);
  return NextResponse.json(result);
}
