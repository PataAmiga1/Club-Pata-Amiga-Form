import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/crm/events";
import { moveStage } from "@/lib/crm/opportunities";

/**
 * Tarea diaria: quien abrió el checkout y no pagó en 24 horas pasa a
 * "Carrito abandonado".
 *
 * Es el embudo más caro del negocio: en LynSales hay 228 tarjetas ahí contra 2
 * pagos en revisión, y hoy no se pueden trabajar porque el CRM no sabe en qué
 * paso del registro se cayó cada persona. Aquí sí lo sabemos, porque el propio
 * checkout deja el evento `checkout_abierto`.
 *
 * El movimiento va como automatización (sin `actorId`), así que respeta las
 * tarjetas que el equipo haya fijado a mano.
 *
 * En Vercel el cron se autentica solo; `CRON_SECRET` es para llamadas manuales.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const esVercel = request.headers.get("x-vercel-cron") !== null;
  if (!esVercel && secret && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Sin permisos" }, { status: 401 });

  const admin = createAdminClient();
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Tarjetas que siguen en "Registro iniciado"
  const { data: enRegistro } = await admin
    .from("opportunities")
    .select("id, contact_id, stage_entered_at, pipeline_stages!inner(key)")
    .eq("pipeline_stages.key", "registro_iniciado")
    .eq("status", "abierta");

  let movidas = 0;
  let bloqueadas = 0;
  let sinCheckout = 0;
  const revisadas = enRegistro?.length ?? 0;

  for (const opp of enRegistro ?? []) {
    // ¿Llegó al checkout hace más de 24 h?
    const { data: abrio } = await admin
      .from("contact_activities")
      .select("created_at")
      .eq("contact_id", opp.contact_id)
      .eq("kind", "checkout_abierto")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!abrio || abrio.created_at > hace24h) {
      sinCheckout += 1;
      continue;
    }

    // ¿Ya pagó? (el pago mueve la tarjeta solo, pero se verifica por si acaso)
    const { data: contacto } = await admin
      .from("contacts")
      .select("profile_id")
      .eq("id", opp.contact_id)
      .maybeSingle();
    if (contacto?.profile_id) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("id")
        .eq("user_id", contacto.profile_id)
        .eq("status", "active")
        // Una suscripción por peludo en el $599: sin limit(1), dos filas =
        // null y un miembro que paga se marcaba como carrito abandonado.
        .limit(1)
        .maybeSingle();
      if (sub) continue;
    }

    const res = await moveStage(admin, {
      opportunityId: opp.id,
      stageKey: "carrito_abandonado",
      actorId: null, // automatización
      actorLabel: "Tarea diaria",
    });
    if (res.moved) {
      movidas += 1;
      await emitEvent(admin, {
        contactId: opp.contact_id,
        kind: "checkout_abandonado",
        summary: "Abrió el checkout y no completó el pago en 24 horas",
        actorLabel: "Tarea diaria",
      });
    } else if (res.reason === "bloqueada") {
      bloqueadas += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    revisadas,
    movidas,
    bloqueadas,
    sinCheckoutReciente: sinCheckout,
  });
}
