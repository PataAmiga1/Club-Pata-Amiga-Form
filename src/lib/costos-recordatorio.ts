import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeam } from "@/lib/alerts";
import { getResend, EMAIL_FROM } from "@/lib/resend";
import { hoyEnMexico } from "@/lib/zona-horaria";
import {
  mesDe,
  mesMas,
  etiquetaMes,
  mesIncompleto,
  proveedoresFaltantes,
  etiquetaProveedor,
  type Costo,
} from "@/lib/costos";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Recordatorio mensual de captura de costos.
 *
 * Va colgado del cron diario de métricas en lugar de pedir una tarea nueva:
 * el plan de Vercel limita cuántas caben y una tarea más por un correo al mes
 * no se justifica. Adentro decide si hoy toca (día configurado en Ajustes) y
 * si de verdad falta algo — si el mes anterior ya está capturado, no escribe.
 */
export async function recordarCapturaDeCostos(admin: Admin) {
  const [{ data: ajustes }, { data: filas, error }] = await Promise.all([
    admin
      .from("site_settings")
      .select("key, value")
      .in("key", ["costos_responsable_email", "costos_dia_recordatorio"]),
    admin
      .from("platform_costs")
      .select(
        "id, proveedor, concepto, categoria, periodo, monto_centavos, moneda, monto_mxn_centavos, origen, recurrente, prorratear_meses, nota",
      ),
  ]);
  // Sin tabla (migración pendiente) no hay nada que recordar
  if (error) return { corrio: false, motivo: "sin tabla" };

  const conf = Object.fromEntries(
    (ajustes ?? []).map((a) => [a.key, a.value]),
  );
  const diaConfig = Number(conf.costos_dia_recordatorio ?? "5");
  const hoy = Number(hoyEnMexico().slice(8, 10));
  if (hoy !== diaConfig) return { corrio: false, motivo: "no toca hoy" };

  const mesPasado = mesMas(mesDe(hoyEnMexico()), -1);
  const costos = (filas ?? []) as unknown as Costo[];
  if (!mesIncompleto(costos, mesPasado))
    return { corrio: false, motivo: "mes ya capturado" };

  const faltantes = proveedoresFaltantes(costos, mesPasado);
  const detalle =
    faltantes.length > 0
      ? `Falta capturar: <strong>${faltantes.map(etiquetaProveedor).join(" · ")}</strong>.`
      : "Todavía nadie captura costos de ese mes.";
  const cuerpo = `<h2 style="color:#1E5350">Faltan los costos de ${etiquetaMes(mesPasado)}</h2>
     <p>${detalle}</p>
     <p>Sin esos montos, el tablero de costos no puede decir cuánto costó
     operar ni si el mes cerró con margen — y marca el mes como incompleto en
     lugar de inventar un total.</p>
     <p><a href="https://www.pataamiga.mx/admin/costos" style="color:#0E8377;font-weight:700">Capturar los costos →</a></p>`;

  const responsable = (conf.costos_responsable_email ?? "").trim();
  if (responsable) {
    try {
      await getResend().emails.send({
        from: EMAIL_FROM,
        to: responsable,
        subject: `Faltan los costos de ${etiquetaMes(mesPasado)} 📉`,
        html: cuerpo,
      });
    } catch {
      // Si el correo directo falla, al menos queda el aviso al equipo
    }
  }
  // Siempre queda constancia en el canal del equipo, haya responsable o no
  await notifyTeam("notify_errors", `Faltan los costos de ${etiquetaMes(mesPasado)}`, cuerpo);

  return { corrio: true, mes: mesPasado, faltantes, responsable: Boolean(responsable) };
}
