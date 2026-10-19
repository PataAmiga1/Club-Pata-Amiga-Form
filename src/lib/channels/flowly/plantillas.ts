import type { createAdminClient } from "@/lib/supabase/admin";
import { clienteFlowly, sinConfigurar } from "./client";
import { categoriaPlantilla, estadoPlantilla } from "./mapeo";
import type { PlantillaFlowly } from "./tipos";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Trae de Flowly las plantillas de WhatsApp de Pata Amiga y las deja en
 * `whatsapp_templates`, que es lo que ya lee la bandeja.
 *
 * Las CREA el operador de Flowly (con la redacción que le pase el equipo) y las
 * aprueba Meta; aquí solo se copian. Flowly no avisa por webhook cuando una
 * cambia de estado (§11.5), así que hay que volver a sincronizar antes de
 * depender de una.
 *
 * Si la misma plantilla aparece varias veces (una por número, o en varios
 * idiomas), se queda la aprobada y, entre ellas, la de es_MX.
 */
export function elegirPorNombre(lista: PlantillaFlowly[]): PlantillaFlowly[] {
  const puntaje = (p: PlantillaFlowly) =>
    (p.status.toUpperCase() === "APPROVED" ? 4 : 0) +
    (p.supported ? 2 : 0) +
    (p.language === "es_MX" ? 1 : 0);
  const porNombre = new Map<string, PlantillaFlowly>();
  for (const p of lista) {
    const actual = porNombre.get(p.name);
    if (!actual || puntaje(p) > puntaje(actual)) porNombre.set(p.name, p);
  }
  return [...porNombre.values()];
}

export async function sincronizarPlantillasFlowly(
  admin: Admin,
): Promise<{ ok: true; total: number; aprobadas: number } | { ok: false; error: string }> {
  const cliente = clienteFlowly();
  if (!cliente) return { ok: false, error: sinConfigurar().paraEquipo };

  const r = await cliente.listarPlantillas();
  if (!r.ok) return { ok: false, error: r.paraEquipo };

  const elegidas = elegirPorNombre(r.data);
  const ahora = new Date().toISOString();
  const filas = elegidas.map((p) => ({
    meta_name: p.name,
    language: p.language,
    category: categoriaPlantilla(p.category),
    body_preview: p.preview || p.name,
    variables: p.variables,
    status: estadoPlantilla(p.status),
    synced_at: ahora,
    provider: "flowly",
    flowly_template_id: p.id,
    flowly_connection_id: p.connection_id,
    supported: p.supported,
  }));
  if (filas.length > 0) {
    const { error } = await admin
      .from("whatsapp_templates")
      .upsert(filas, { onConflict: "meta_name" });
    if (error) return { ok: false, error: "No se pudieron guardar las plantillas." };
  }
  return {
    ok: true,
    total: filas.length,
    aprobadas: filas.filter((f) => f.status === "aprobada" && f.supported).length,
  };
}
