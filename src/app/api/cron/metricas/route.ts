import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularAgregadosDelDia } from "@/lib/tableros/metricas";
import { diaEnMexico } from "@/lib/tableros/rango";
import { reportError } from "@/lib/alerts";
import { recordarCapturaDeCostos } from "@/lib/costos-recordatorio";

/**
 * Agregado nocturno del tablero de ventas. Corre una vez al día.
 *
 * Recalcula AYER y, de paso, los seis días anteriores. Repasar la semana no
 * cuesta casi nada (son consultas de un día) y hace que un día perdido —porque
 * la tarea falló o el despliegue estuvo caído— se arregle solo en la siguiente
 * corrida, en lugar de quedarse como un hueco para siempre.
 *
 * Es idempotente: la llave primaria es fecha+métrica+dimensión.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const esVercel = request.headers.get("x-vercel-cron") !== null;
  if (!esVercel && secret && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Sin permisos" }, { status: 401 });

  const admin = createAdminClient();
  const dias: string[] = [];
  let fallidos = 0;

  for (let atras = 1; atras <= 7; atras++) {
    // Días MEXICANOS, no del reloj del proceso: en Vercel corre en UTC y los
    // números tienen que ser los mismos que aquí.
    const dia = diaEnMexico(new Date(Date.now() - atras * 86400000));
    try {
      await calcularAgregadosDelDia(admin, dia);
      dias.push(dia);
    } catch (e) {
      fallidos++;
      // Se avisa pero no se corta: que falle un día no debe impedir los otros.
      await reportError("metricas-tablero", e, { dia });
    }
  }

  // Recordatorio de captura de costos: va aquí y no en una tarea propia
  // porque el plan de Vercel limita cuántas caben, y adentro decide si hoy
  // toca y si de verdad falta algo.
  let recordatorio: unknown = null;
  try {
    recordatorio = await recordarCapturaDeCostos(admin);
  } catch (e) {
    await reportError("recordatorio-costos", e);
  }

  return NextResponse.json({ ok: true, dias, fallidos, recordatorio });
}
