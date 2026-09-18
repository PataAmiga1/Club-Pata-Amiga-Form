"use server";

import { createClient } from "@/lib/supabase/server";
import { telefonoValido } from "@/lib/chat-vet";

/**
 * El teléfono es la única condición para chatear sin membresía (equipo,
 * 17-sep-2026). Quien se registró con Google no lo dio: se le pide aquí.
 */
export async function guardarTelefonoParaChat(telefono: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  if (!telefonoValido(telefono)) return { error: "Revisa tu teléfono: son 10 dígitos." };
  const { error } = await supabase.from("profiles").update({ phone: telefono }).eq("id", user.id);
  if (error) return { error: "No pudimos guardar tu teléfono. Intenta de nuevo." };
  return { ok: true as const };
}
