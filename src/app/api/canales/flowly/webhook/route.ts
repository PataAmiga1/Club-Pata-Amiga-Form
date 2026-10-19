import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decidirFirma } from "@/lib/channels/flowly/firma";
import { leerEvento } from "@/lib/channels/flowly/mapeo";
import { procesarEntrega, registrarEntrega } from "@/lib/channels/flowly/procesar";

/**
 * Webhook de Flowly: WhatsApp (con coexistencia), Messenger e Instagram llegan
 * aquí ya pasados por Flowly, que es quien tiene la app de Meta.
 *
 * CONECTAR (lo hace el operador de Flowly, no Meta): registrar esta URL
 * (https://<dominio>/api/canales/flowly/webhook) como webhook del cliente Pata
 * Amiga en la consola de Flowly. El secreto que muestra UNA vez (whsec_…) va en
 * FLOWLY_WEBHOOK_SECRET. Contrato: PLATFORM-INTEGRATION.md §11 del repo de
 * Flowly.
 *
 * Flowly espera un 2xx en menos de 10 segundos y reintenta todo lo demás
 * (incluidos los redireccionamientos). Por eso aquí solo se verifica, se
 * deduplica y se contesta; el trabajo —incluido el LLM— corre después con
 * `after()`.
 */

// Lo que corre en after() (CRM + LLM + envío) cabe holgado en un minuto.
export const maxDuration = 60;

export async function POST(request: Request) {
  // La firma se verifica sobre los bytes crudos, nunca sobre JSON re-armado.
  const rawBody = await request.text();
  const firma = decidirFirma({
    rawBody,
    header: request.headers.get("flowly-signature"),
    secretos: [process.env.FLOWLY_WEBHOOK_SECRET, process.env.FLOWLY_WEBHOOK_SECRET_ANTERIOR],
    permitirSinFirma: process.env.FLOWLY_WEBHOOK_SIN_FIRMA === "1",
    entorno: process.env.NODE_ENV,
  });
  if (firma === "sin_secreto") {
    // Falla cerrado. 503 (y no 401) para que Flowly reintente cuando se
    // configure el secreto, en lugar de perder la entrega.
    console.error("[flowly] FLOWLY_WEBHOOK_SECRET no configurado — entrega rechazada");
    return new Response("Webhook sin configurar", { status: 503 });
  }
  if (firma === "invalida") return new Response("Firma inválida", { status: 401 });
  if (firma === "ok_sin_verificar")
    console.warn("[flowly] firma SIN verificar (FLOWLY_WEBHOOK_SIN_FIRMA=1, solo desarrollo local)");

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(rawBody);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const evento = leerEvento(cuerpo);
  if (!evento) return new Response("Evento inválido", { status: 400 });

  // El id de la entrega es estable entre reintentos: se deduplica ANTES de
  // cualquier trabajo (y antes del LLM).
  const admin = createAdminClient();
  let registro: Awaited<ReturnType<typeof registrarEntrega>>;
  try {
    registro = await registrarEntrega(admin, evento);
  } catch (e) {
    console.error("[flowly] no se pudo registrar la entrega", e);
    // Sin registro no hay dedupe: mejor que Flowly reintente.
    return new Response("No disponible", { status: 503 });
  }
  if (registro === "duplicado") return NextResponse.json({ received: true, duplicate: true });

  after(() => procesarEntrega(admin, evento));
  return NextResponse.json({ received: true });
}
