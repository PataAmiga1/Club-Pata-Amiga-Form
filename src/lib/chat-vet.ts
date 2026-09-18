import type { createAdminClient } from "@/lib/supabase/admin";
import { hoyEnMexico, inicioDelDia } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * EL CHAT DE ORIENTACIÓN VETERINARIA, ABIERTO A TODAS LAS CUENTAS
 * (decisión del equipo, 17-sep-2026 — juntas/75).
 *
 *   · Lo usa cualquiera que tenga cuenta (correo, contraseña y teléfono),
 *     aunque no haya pagado.
 *   · Quien no es miembro tiene 10 mensajes al día; al acabarse, el chat lo
 *     invita a unirse.
 *   · A quien no es miembro el chat lo orienta igual, pero sin prometer
 *     reintegros ni ofrecer el enlace telefónico con nuestro veterinario.
 *
 * El tope de gasto diario de la IA (/admin/sitio) sigue aplicando a todos.
 */

/** Mensajes al día para quien todavía no tiene membresía. */
export const LIMITE_DIARIO_SIN_MEMBRESIA = 10;

export type EstadoDelChatVet = {
  esMiembro: boolean;
  /** Registró un teléfono (el equipo lo pidió como condición para chatear). */
  tieneTelefono: boolean;
  usadosHoy: number;
  /** Mensajes que le quedan hoy. `null` = sin límite (miembro). */
  restantes: number | null;
};

/** Un teléfono con al menos 10 dígitos (con o sin lada internacional). */
export function telefonoValido(valor: string | null | undefined): boolean {
  return (valor ?? "").replace(/\D/g, "").length >= 10;
}

/** Cuántos mensajes mandó hoy (día mexicano) esa persona al chat veterinario. */
export async function mensajesDeHoy(admin: Admin, userId: string): Promise<number> {
  const { data: conversaciones } = await admin
    .from("vet_conversations")
    .select("id")
    .eq("user_id", userId);
  const ids = (conversaciones ?? []).map((c) => c.id);
  if (!ids.length) return 0;
  const { count } = await admin
    .from("vet_messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", ids)
    .eq("role", "user")
    .gte("created_at", inicioDelDia(hoyEnMexico()).toISOString());
  return count ?? 0;
}

export async function estadoDelChatVet(admin: Admin, userId: string): Promise<EstadoDelChatVet> {
  const { data: perfil } = await admin
    .from("profiles")
    .select("membership_status, phone")
    .eq("id", userId)
    .maybeSingle();
  const esMiembro = perfil?.membership_status === "active";
  const usadosHoy = esMiembro ? 0 : await mensajesDeHoy(admin, userId);
  return {
    esMiembro,
    tieneTelefono: telefonoValido(perfil?.phone),
    usadosHoy,
    restantes: esMiembro ? null : Math.max(0, LIMITE_DIARIO_SIN_MEMBRESIA - usadosHoy),
  };
}
