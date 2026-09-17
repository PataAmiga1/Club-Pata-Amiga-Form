import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ¿SE PUEDE REGISTRAR GENTE NUEVA? — 17-sep-2026.
 *
 * El equipo decidió que la membresía de $159 deja de venderse, pero la de $599
 * todavía no está lista (cobro por peludo, montos que crecen, legales del
 * despacho). Mientras tanto el registro queda CERRADO y quien llega deja sus
 * datos en la lista de interesados (opción B del documento 65).
 *
 * Vive en site_settings para que el equipo lo pueda reabrir desde /admin/sitio
 * sin un despliegue. Por omisión está CERRADO: si la fila no existe o la
 * lectura falla, no se vende. Vender por error una membresía que ya se cerró
 * es peor que perder una venta mientras se arregla la consulta.
 *
 * Tres lugares lo respetan: el proxy (las páginas /registro, /registro/peludo y
 * /registro/plan mandan a la lista), el checkout (no abre cobro) y la portada
 * (cambia los botones y quita los precios).
 */

export const REGISTRO_ABIERTO_KEY = "registro_abierto";

/** A dónde va quien quiere registrarse mientras el registro está cerrado. */
export const RUTA_LISTA_DE_ESPERA = "/landings/nueva-membresia";

/** Las páginas del alta que se cierran. Bienvenida y confirmado NO: son de quien ya pagó. */
export const RUTAS_DEL_ALTA = ["/registro", "/registro/peludo", "/registro/plan"];

export function valorAbierto(valor: string | null | undefined): boolean {
  return /^(s[ií]|true|1|abierto)$/i.test((valor ?? "").trim());
}

export async function registroAbierto(): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from("site_settings")
      .select("value")
      .eq("key", REGISTRO_ABIERTO_KEY)
      .maybeSingle();
    if (error) return false;
    return valorAbierto(data?.value);
  } catch {
    return false;
  }
}
