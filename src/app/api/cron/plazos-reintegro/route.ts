import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revisarPlazosDeReintegro } from "@/lib/plazos-reintegro";

/**
 * Cron diario: reintegros del $599 que pasaron de 5 días hábiles sin
 * depositarse (sección 3, 17-sep-2026). Marca y avisa; el mes gratis lo
 * aplica el equipo (sección 6).
 *
 * ⚠ AGENDARLO EN `vercel.json` DE `main`, dentro del merge — nunca en
 * `staging` (ver memoria «La trampa del merge a main»). Entrada sugerida:
 * `{"path": "/api/cron/plazos-reintegro", "schedule": "0 16 * * 1-5"}`
 * (10:00 hora de México, días hábiles).
 *
 * Protección: header "authorization: Bearer <CRON_SECRET>" o ?secret=, o el
 * propio cron de Vercel.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const provided =
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    url.searchParams.get("secret");
  const isVercelCron = request.headers.get("x-vercel-cron") !== null;
  if (secret) {
    if (provided !== secret && !isVercelCron)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  } else if (!isVercelCron) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 401 });
  }

  const resultado = await revisarPlazosDeReintegro(createAdminClient());
  return NextResponse.json({ ok: true, ...resultado });
}
