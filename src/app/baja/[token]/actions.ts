"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarPorToken, darDeBajaCorreo, revertirBajaCorreo } from "@/lib/correo/bajas";
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

/**
 * «¿Te diste de baja por error? Volver a suscribirme». La misma identificación
 * que la baja —el token de su correo—, así que la persona se regresa sola, sin
 * escribirle al equipo. Una queja de spam no se deshace desde aquí (ver
 * `revertirBajaCorreo`): la página ni siquiera muestra el botón en ese caso.
 */
export async function volverASuscribirme(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const admin = createAdminClient();
  const fila = await buscarPorToken(admin, token);
  if (!fila) redirect(`/baja/${encodeURIComponent(token)}`);

  try {
    const r = await revertirBajaCorreo(admin, fila.email, {
      tipo: "persona",
      via: "pagina_baja",
    });
    if (!r.ok && r.motivo === "error")
      await reportError("volver a suscribirse (página de baja)", r.error).catch(() => {});
  } catch (err) {
    await reportError("volver a suscribirse (página de baja)", err).catch(() => {});
  }
  redirect(`/baja/${token}?vuelta=1`);
}
