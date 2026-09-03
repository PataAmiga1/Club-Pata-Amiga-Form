import type { SupabaseClient } from "@supabase/supabase-js";
import { BANCO_OTRO, bankFromClabe, isValidClabe } from "@/lib/banks";

/**
 * LAS CUENTAS DEL MIEMBRO PARA SU REINTEGRO (equipo 2-sep; Pablo fijó el tope
 * en tres y que elija el miembro).
 *
 * Antes se guardaba UNA sola, en el perfil. El equipo lo pidió como "algo
 * parecido a guardar tarjetas".
 *
 * DÓNDE SE ELIGE, Y POR QUÉ AHÍ. La cuenta se escoge AL PEDIR el reintegro, no
 * en "Mi cuenta". Si la elección viviera solo en el perfil, cambiarla después
 * movería el destino de una solicitud ya enviada —incluso de una ya aprobada y
 * esperando transferencia—. Eso no pasa porque `reimbursements.clabe` congela
 * la CLABE al momento de solicitar y el archivo del banco lee ESA. Aquí solo
 * se amplía de dónde se elige; el congelado ya existía y no se tocó.
 *
 * ESTA TABLA ES LA FUENTE DE VERDAD. `profiles.clabe` y `profiles.bank_name`
 * quedaron obsoletas: siguen ahí como respaldo histórico pero ya no se
 * escriben, y todo lo que muestre "la cuenta del miembro" lee de aquí. Dos
 * lugares con una CLABE distinta es justo el error que acaba en una
 * transferencia al destino equivocado.
 */

/** Pablo, 2-sep. También lo obliga un trigger en la base. */
export const CUENTAS_MAX = 3;

export type CuentaBancaria = {
  id: string;
  clabe: string;
  bank_name: string | null;
  holder: string | null;
  is_default: boolean;
  created_at: string;
};

/** Cómo se le muestra una cuenta a la persona, sin enseñar los 18 dígitos. */
export function etiquetaDeCuenta(c: {
  clabe: string;
  bank_name?: string | null;
}): string {
  const banco = c.bank_name || bankFromClabe(c.clabe) || "Cuenta";
  return `${banco} ···· ${c.clabe.slice(-4)}`;
}

/**
 * Valida y normaliza lo que capturó la persona.
 *
 * El banco se deduce de la CLABE cuando no lo escribió, y "Otro" a secas no
 * cuenta como banco (equipo, 13-ago): si llega esa palabra sin el nombre real
 * se prefiere el que delata la CLABE.
 */
export function revisarCuenta(entrada: {
  clabe?: string;
  bankName?: string;
  holder?: string;
}): { error: string } | { clabe: string; bankName: string; holder: string | null } {
  const clabe = (entrada.clabe ?? "").replace(/\D/g, "");
  if (!isValidClabe(clabe))
    return { error: "Revisa tu CLABE — deben ser 18 dígitos válidos." };

  const escrito = (entrada.bankName ?? "").trim();
  const bankName =
    (escrito.toLowerCase() === BANCO_OTRO.toLowerCase() ? "" : escrito) ||
    bankFromClabe(clabe) ||
    "";
  if (!bankName) return { error: "Escribe el nombre de tu banco." };

  return { clabe, bankName, holder: (entrada.holder ?? "").trim() || null };
}

/** Las cuentas de una persona, la de omisión primero. */
export async function cuentasDelMiembro(
  admin: SupabaseClient,
  userId: string,
): Promise<CuentaBancaria[]> {
  const { data } = await admin
    .from("member_bank_accounts")
    .select("id, clabe, bank_name, holder, is_default, created_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as CuentaBancaria[];
}

/**
 * La que se propone al pedir un reintegro: la marcada por omisión y, si no hay
 * ninguna marcada, la más antigua.
 *
 * Quien tenga UNA sola cuenta no debe notar que ahora caben tres: el
 * formulario se ve igual que siempre y ya viene llena.
 */
export function cuentaPorOmision(
  cuentas: CuentaBancaria[],
): CuentaBancaria | null {
  return cuentas.find((c) => c.is_default) ?? cuentas[0] ?? null;
}

/**
 * La cuenta por omisión de VARIOS miembros de una vez, para el panel.
 *
 * El panel lista cientos de miembros y muestra "su" cuenta; pedirlas de una en
 * una serían cientos de viajes por pantalla. Se traen todas en una consulta y
 * se agrupan aquí.
 *
 * Devuelve un mapa `user_id → cuenta`. Quien no tenga ninguna guardada no
 * aparece, y la pantalla pinta el guion de siempre.
 */
export async function cuentasPorOmisionDe(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, CuentaBancaria>> {
  const mapa = new Map<string, CuentaBancaria>();
  if (!userIds.length) return mapa;

  const { data } = await admin
    .from("member_bank_accounts")
    .select("id, user_id, clabe, bank_name, holder, is_default, created_at")
    .in("user_id", userIds)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  for (const fila of (data ?? []) as (CuentaBancaria & { user_id: string })[]) {
    // El orden ya trae primero la de omisión, así que la PRIMERA de cada
    // persona es la buena y las siguientes se ignoran.
    if (!mapa.has(fila.user_id)) mapa.set(fila.user_id, fila);
  }
  return mapa;
}
