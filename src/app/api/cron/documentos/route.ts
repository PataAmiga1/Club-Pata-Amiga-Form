import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarRecordatoriosDatosFaltantes } from "@/lib/email/recordatorios";

/**
 * Cron de recordatorios de datos faltantes (equipo, 5-ago): correo periódico
 * a miembros activos con el perfil incompleto.
 *
 * AGENDADO EL 2-SEP, `30 16 * * 1` — lunes 10:30 CDMX. La nota vieja decía
 * "cuando la cuenta sea Pro"; la cuenta ya lo es desde hace tiempo y esto
 * simplemente se quedó sin agendar, así que durante semanas solo salió si
 * alguien apretaba el botón de Comunicados → Envíos. Ese botón sigue ahí para
 * adelantarlo.
 *
 * ⚠ NO LLEVA CONTROL DE REPETICIÓN, a diferencia de `/api/cron/renovaciones`:
 * manda a TODOS los del perfil incompleto cada vez que corre. Semanal quiere
 * decir que quien nunca lo complete va a recibirlo todos los lunes. Si eso
 * empieza a molestar, la solución es un tope por persona (tabla de registro
 * como `renewal_reminders`), no bajar la frecuencia.
 *
 * OJO: la entrada del calendario vive en el `vercel.json` de `main`, no en el
 * de `staging` — allá hay 2 crons a propósito y editarlo apagaría los de
 * producción al fusionar.
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
