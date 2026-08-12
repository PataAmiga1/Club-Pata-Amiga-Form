import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CP lookup → state, city, colonias. Tries the Sepomex mirror first (has
 * municipio + full colonia list), then zippopotam (colonias + state only).
 * The form degrades to manual entry when both are down.
 *
 * ⚠ ESTADO AL 11-AGO-2026: el espejo de Sepomex (sepomex.icalialabs.com) YA NO
 * EXISTE — su dominio ni siquiera resuelve en DNS. O sea que hoy TODAS las
 * búsquedas de CP caen en zippopotam, que no trae municipio (por eso la
 * alcaldía/municipio no se autocompleta) y devuelve nombres de estado viejos
 * ("Distrito Federal"). Los dos hallazgos que reportó el equipo salen de aquí.
 *
 * El arreglo de fondo es importar el catálogo de Sepomex a una tabla propia
 * (ya estaba en el plan); mientras tanto, al menos normalizamos el estado.
 */

/**
 * Nombres de estado que las fuentes externas devuelven desactualizados.
 * El Distrito Federal dejó de existir en 2016 — el equipo lo pidió explícito.
 */
const ESTADO_NORMALIZADO: Record<string, string> = {
  "distrito federal": "Ciudad de México",
  df: "Ciudad de México",
  "d.f.": "Ciudad de México",
  cdmx: "Ciudad de México",
  "mexico city": "Ciudad de México",
  "estado de mexico": "Estado de México",
  "méxico": "Estado de México",
  mexico: "Estado de México",
};

function normalizaEstado(estado: string | null | undefined): string {
  const limpio = (estado ?? "").trim();
  if (!limpio) return "";
  const clave = limpio
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return ESTADO_NORMALIZADO[clave] ?? limpio;
}

/**
 * Catálogo propio (tabla `postal_codes`, migración 20260811000002). Es la
 * fuente BUENA: trae municipio/alcaldía y los nombres con acentos y al día.
 * Las fuentes externas quedan solo como red de seguridad.
 */
async function fromOurCatalog(cp: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("postal_codes")
    .select("colonia, municipio, estado")
    .eq("cp", cp)
    .order("colonia");
  if (error || !data?.length) return null;
  return {
    found: true,
    state: data[0].estado,
    // El formulario pide "Ciudad, alcaldía o municipio": es este campo.
    city: data[0].municipio,
    colonies: data.map((r) => r.colonia),
    source: "catalogo" as const,
  };
}

async function fromSepomexMirror(cp: string) {
  const res = await fetch(
    `https://sepomex.icalialabs.com/api/v1/zip_codes?zip_code=${cp}`,
    { next: { revalidate: 86400 }, signal: AbortSignal.timeout(4000) },
  );
  if (!res.ok) throw new Error(`sepomex ${res.status}`);
  const data = await res.json();
  const rows: { d_estado: string; d_mnpio: string; d_asenta: string }[] =
    data.zip_codes ?? [];
  if (!rows.length) return null;
  return {
    found: true,
    state: normalizaEstado(rows[0].d_estado),
    city: rows[0].d_mnpio,
    colonies: rows.map((r) => r.d_asenta),
  };
}

async function fromZippopotam(cp: string) {
  const res = await fetch(`https://api.zippopotam.us/mx/${cp}`, {
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`zippopotam ${res.status}`);
  const data = await res.json();
  const places: { "place name": string; state: string }[] = data.places ?? [];
  if (!places.length) return null;
  return {
    found: true,
    state: normalizaEstado(places[0].state),
    // zippopotam no trae municipio: el usuario lo captura a mano hasta que
    // tengamos el catálogo de Sepomex en tabla propia.
    city: "",
    colonies: places.map((p) => p["place name"]),
  };
}

export async function GET(request: Request) {
  const cp = new URL(request.url).searchParams.get("cp");
  if (!cp || !/^\d{5}$/.test(cp)) {
    return NextResponse.json({ error: "CP inválido" }, { status: 400 });
  }

  // Catálogo propio primero; lo externo solo si aún no se ha importado.
  for (const source of [fromOurCatalog, fromSepomexMirror, fromZippopotam]) {
    try {
      const result = await source(cp);
      if (result) return NextResponse.json(result);
    } catch {
      // try the next source
    }
  }
  return NextResponse.json({ found: false, degraded: true });
}
