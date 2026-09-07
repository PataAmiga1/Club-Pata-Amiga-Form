import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarRecordatoriosDeRenovacion } from "@/lib/email/recordatorios";

/**
 * Cron diario de recordatorios de renovación (equipo; construido el 2-sep).
 *
 * Avisa al miembro antes de que le llegue el cargo, para que le dé tiempo de
 * actualizar su tarjeta si cambió o está por vencer.
 *
 * LA SECUENCIA SE CONFIGURA EN /admin/sitio → "Recordatorios de renovación
 * (días antes)". Por omisión "7,1". Vacío = apagado, y este cron no manda
 * nada sin tocar código.
 *
 * ⚠ FALTA AGENDARLO EN `vercel.json` DE `main`. La rama `staging` trae solo 2
 * crons a propósito (los demás están apagados para pruebas) y `main` trae 8,
 * así que la lista NO se mantiene desde aquí: al fusionar hay que agregar
 * a mano `{"path": "/api/cron/renovaciones", "schedule": "0 15 * * *"}` en el
 * `vercel.json` de `main`. Si se edita el de `staging`, el siguiente merge se
 * llevaría por delante los 8 de producción.
 *
 * Mientras no esté agendado, el envío se dispara a mano desde
 * Comunicados → Envíos.
 *
 * Protección: igual que los demás crons — header "authorization: Bearer
 * <CRON_SECRET>" o ?secret=, o venir del propio cron de Vercel.
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

  const resultado = await enviarRecordatoriosDeRenovacion(createAdminClient());
  return NextResponse.json({ ok: true, ...resultado });
}
