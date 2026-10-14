"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarPorToken, darDeBajaCorreo } from "@/lib/correo/bajas";
import { reportError } from "@/lib/alerts";

/**
 * Confirma la baja. No pide sesión a propósito: el token del correo ES la
 * identificación, y exigir contraseña para dejar de recibir correo es la forma
 * más rápida de acabar marcado como spam.
 */
export async function confirmarBaja(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const admin = createAdminClient();
  const fila = await buscarPorToken(admin, token);
  if (!fila) redirect(`/baja/${encodeURIComponent(token)}`);

  try {
    await darDeBajaCorreo(admin, fila.email, "pagina");
  } catch (err) {
    await reportError("baja de correo (página)", err).catch(() => {});
  }
  redirect(`/baja/${token}?listo=1`);
}
