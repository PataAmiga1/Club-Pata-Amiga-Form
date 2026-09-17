import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * CATÁLOGO DE CUIDADOS COTIDIANOS — membresía $599 (sección 1, 17-sep-2026).
 *
 * Es CERRADO: la bolsa de cuidados cotidianos solo reintegra lo que está aquí.
 * Pero el equipo lo amplía cuando un caso lo amerita («si algo no está en la
 * lista pero tu veterinario lo indicó… lo agregamos para todos»), así que vive
 * en la base y se edita en /admin/reintegros/catalogo.
 *
 * Un concepto no se borra, se desactiva: un reintegro viejo puede citarlo.
 */

export type ConceptoCatalogo = {
  id: string;
  nombre: string;
  activo: boolean;
  posicion: number;
};

export type GrupoCatalogo = {
  id: string;
  posicion: number;
  titulo: string;
  conceptos: ConceptoCatalogo[];
};

export const CONCEPTO_MAX = 200;

export async function leerCatalogo(
  admin: Admin,
  opciones: { incluirInactivos?: boolean } = {},
): Promise<GrupoCatalogo[]> {
  const [{ data: grupos }, { data: conceptos }] = await Promise.all([
    admin
      .from("care_catalog_groups")
      .select("id, position, title")
      .order("position"),
    admin
      .from("care_catalog_items")
      .select("id, group_id, position, name, active")
      .order("position"),
  ]);

  return (grupos ?? []).map((g) => ({
    id: g.id,
    posicion: g.position,
    titulo: g.title,
    conceptos: (conceptos ?? [])
      .filter((c) => c.group_id === g.id && (opciones.incluirInactivos || c.active))
      .map((c) => ({
        id: c.id,
        nombre: c.name,
        activo: c.active,
        posicion: c.position,
      })),
  }));
}

/** Limpia y valida el nombre de un concepto. Devuelve el error o el texto. */
export function revisarNombreConcepto(
  nombre: string,
): { ok: true; nombre: string } | { ok: false; error: string } {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  if (limpio.length < 3) return { ok: false, error: "Escribe el concepto." };
  if (limpio.length > CONCEPTO_MAX)
    return { ok: false, error: `Máximo ${CONCEPTO_MAX} caracteres.` };
  return { ok: true, nombre: limpio.charAt(0).toUpperCase() + limpio.slice(1) };
}
