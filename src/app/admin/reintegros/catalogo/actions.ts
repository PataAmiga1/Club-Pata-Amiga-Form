"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRoute } from "@/lib/admin-guard";
import { revisarNombreConcepto } from "@/lib/catalogo-cuidados";

function revalidar() {
  revalidatePath("/admin/reintegros/catalogo");
}

/** Agrega un concepto al final de su grupo. «Lo agregamos para todos». */
export async function agregarConcepto(input: { grupoId: string; nombre: string }) {
  const sesion = await requireAdminRoute();
  if (!sesion) return { error: "Sin permisos." };
  const revision = revisarNombreConcepto(input.nombre);
  if (!revision.ok) return { error: revision.error };

  const { data: ultimo } = await sesion.admin
    .from("care_catalog_items")
    .select("position")
    .eq("group_id", input.grupoId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await sesion.admin.from("care_catalog_items").insert({
    group_id: input.grupoId,
    name: revision.nombre,
    position: (ultimo?.position ?? 0) + 1,
    created_by: sesion.adminId,
  });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "Ese concepto ya está en el grupo (puede estar desactivado)."
          : "No se pudo agregar.",
    };
  revalidar();
  return { ok: true as const };
}

export async function renombrarConcepto(input: { id: string; nombre: string }) {
  const sesion = await requireAdminRoute();
  if (!sesion) return { error: "Sin permisos." };
  const revision = revisarNombreConcepto(input.nombre);
  if (!revision.ok) return { error: revision.error };

  const { error } = await sesion.admin
    .from("care_catalog_items")
    .update({ name: revision.nombre, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error)
    return {
      error:
        error.code === "23505"
          ? "Ya hay otro concepto con ese nombre en el grupo."
          : "No se pudo guardar.",
    };
  revalidar();
  return { ok: true as const };
}

/** Desactivar en lugar de borrar: un reintegro viejo puede citar el concepto. */
export async function cambiarActivoConcepto(input: { id: string; activo: boolean }) {
  const sesion = await requireAdminRoute();
  if (!sesion) return { error: "Sin permisos." };
  const { error } = await sesion.admin
    .from("care_catalog_items")
    .update({ active: input.activo, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { error: "No se pudo guardar." };
  revalidar();
  return { ok: true as const };
}
