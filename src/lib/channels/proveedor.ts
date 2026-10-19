import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Por dónde entra cada canal de Meta: el webhook propio ("direct_meta", el
 * camino de siempre) o Flowly ("flowly").
 *
 * Vive en site_settings (`canales_proveedor`, editable en Portal de ventas → IA
 * por el super admin) para cambiar un canal sin desplegar. Formato:
 *
 *     whatsapp=flowly, facebook=flowly, instagram=direct_meta
 *
 * Lo que no se menciona sigue en direct_meta. Solo decide qué webhook ATIENDE
 * los mensajes nuevos; RESPONDER siempre va por donde llegó cada conversación
 * (channel_conversations.provider), para que los hilos viejos sigan vivos.
 */

export type Proveedor = "direct_meta" | "flowly";

export const AJUSTE_PROVEEDOR = "canales_proveedor";

export function leerMapaProveedores(texto: string | null | undefined): Record<string, Proveedor> {
  const mapa: Record<string, Proveedor> = {};
  for (const parte of String(texto ?? "").split(/[,;\n]/)) {
    const [canalCrudo, provCrudo] = parte.split(/[=:]/).map((s) => s?.trim().toLowerCase());
    if (!canalCrudo || !provCrudo) continue;
    const canal = canalCrudo === "messenger" ? "facebook" : canalCrudo;
    if (provCrudo === "flowly" || provCrudo === "direct_meta") mapa[canal] = provCrudo;
    else if (provCrudo === "directo" || provCrudo === "meta") mapa[canal] = "direct_meta";
  }
  return mapa;
}

export function proveedorDe(mapa: Record<string, Proveedor>, canal: string): Proveedor {
  return mapa[canal === "messenger" ? "facebook" : canal] ?? "direct_meta";
}

/** Mapa vigente desde site_settings. Nunca lanza: ante la duda, camino directo. */
export async function mapaDeProveedores(admin: Admin): Promise<Record<string, Proveedor>> {
  try {
    const { data } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", AJUSTE_PROVEEDOR)
      .maybeSingle();
    return leerMapaProveedores((data?.value as string | null) ?? "");
  } catch {
    return {};
  }
}
