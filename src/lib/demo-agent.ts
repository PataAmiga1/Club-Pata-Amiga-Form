import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ¿A esta persona le toca la versión de demostración del asistente?
 *
 * Sección 6, punto 3: solo para cuentas creadas SIN suscripción activa, y solo
 * si el interruptor está encendido (apagado por omisión). Se evalúa en el
 * SERVIDOR con la misma consulta de suscripción que usa `loginDestination()`;
 * no se decide en el navegador.
 *
 * La ruta del agente vuelve a comprobar las dos cosas en cada mensaje. Esto de
 * aquí decide si se PINTA el widget; aquello decide si RESPONDE. Que una
 * pantalla se equivoque no debe abrir nada.
 */
export async function mostrarAgenteDemo(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const [{ data: ajuste }, { data: sub }] = await Promise.all([
      admin
        .from("site_settings")
        .select("value")
        .eq("key", "demo_agent_enabled")
        .maybeSingle(),
      admin
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        // Con el $599 hay una suscripción activa POR PELUDO: sin limit(1),
        // dos filas hacen que maybeSingle() devuelva null (sección 7).
        .limit(1)
        .maybeSingle(),
    ]);

    if ((ajuste?.value ?? "0") !== "1") return false;
    return !sub;
  } catch {
    // Ante la duda no se pinta: una demostración que aparece donde no debe es
    // peor que una que no aparece.
    return false;
  }
}
