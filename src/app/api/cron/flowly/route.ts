import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { conciliar } from "@/lib/channels/flowly/procesar";
import { sincronizarPlantillasFlowly } from "@/lib/channels/flowly/plantillas";

/**
 * Conciliación con Flowly (contrato §11.5: "no dependas solo de los webhooks").
 *
 * - Reprocesa entregas del webhook que quedaron a medias (se guardó su cuerpo).
 * - Reenvía respuestas del agente que no salieron por una falla pasajera, con
 *   su MISMA llave: Flowly nunca las manda dos veces.
 * - Vuelve a traer las plantillas de WhatsApp (su estado no llega por webhook).
 *
 * PENDIENTE AL SALIR A PRODUCCIÓN: registrarla en vercel.json (cada 5–10 min).
 * No se registró en esta rama a propósito: el merge de crons a main se revisa
 * aparte.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const esVercel = request.headers.get("x-vercel-cron") !== null;
  if (!esVercel && secret && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Sin permisos" }, { status: 401 });
  if (!process.env.FLOWLY_API_KEY && !process.env.FLOWLY_WEBHOOK_SECRET)
    return NextResponse.json({ ok: true, omitido: "Flowly no está configurado" });

  const admin = createAdminClient();
  const conciliacion = await conciliar(admin);
  const plantillas = process.env.FLOWLY_API_KEY
    ? await sincronizarPlantillasFlowly(admin)
    : null;

  return NextResponse.json({ ok: true, ...conciliacion, plantillas });
}
