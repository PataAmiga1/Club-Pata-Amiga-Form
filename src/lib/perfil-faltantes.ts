import { validateCurp } from "@/lib/curp";

/**
 * QUÉ LE FALTA A UN PERFIL DE MIEMBRO — la misma regla del 100% que aplica
 * "Completa tu perfil" (ProfileForm), en una sola función para que el panel
 * (popups, expediente, edición por el super admin) nunca diga algo distinto
 * de lo que ve el miembro:
 *
 *   nombre y apellido · identidad (CURP válida para mexicanos, pasaporte
 *   subido para extranjeros — equipo, 11-ago) · fecha de nacimiento ·
 *   nacionalidad (obligatorias desde el 5-ago) · domicilio (CP + colonia +
 *   calle). El INE es OPCIONAL (Pablo, 10-ago) y no cuenta aquí; el teléfono
 *   tampoco entra al 100%.
 */
export type PerfilCampos = {
  first_name?: string | null;
  last_name?: string | null;
  curp?: string | null;
  birth_date?: string | null;
  nationality?: string | null;
  postal_code?: string | null;
  colony?: string | null;
  street?: string | null;
};

/** Nacionalidad vacía se trata como mexicana (misma regla del ProfileForm). */
export function esNacionalidadExtranjera(
  nationality: string | null | undefined,
): boolean {
  const n = (nationality ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return n.length > 0 && !["mexicana", "mexicano", "mexico", "mx"].includes(n);
}

/** Lista legible de lo que falta; vacía = perfil al 100%. */
export function datosFaltantesDelPerfil(
  p: PerfilCampos,
  opts?: { tienePasaporte?: boolean },
): string[] {
  const faltan: string[] = [];
  if (!p.first_name?.trim() || !p.last_name?.trim())
    faltan.push("nombre y apellido");
  if (esNacionalidadExtranjera(p.nationality)) {
    if (!opts?.tienePasaporte) faltan.push("pasaporte");
  } else if (!p.curp || !validateCurp(p.curp).isValid) {
    faltan.push("CURP válida");
  }
  if (!p.birth_date || !/^\d{4}-\d{2}-\d{2}$/.test(p.birth_date))
    faltan.push("fecha de nacimiento");
  if (!p.nationality?.trim()) faltan.push("nacionalidad");
  if (!(p.postal_code?.length === 5 && p.colony && p.street))
    faltan.push("domicilio (CP, colonia y calle)");
  return faltan;
}

export function perfilCompleto(
  p: PerfilCampos,
  opts?: { tienePasaporte?: boolean },
): boolean {
  return datosFaltantesDelPerfil(p, opts).length === 0;
}
