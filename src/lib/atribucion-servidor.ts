import { cookies } from "next/headers";
import type { createAdminClient } from "@/lib/supabase/admin";
import { COOKIE_ATRIBUCION, leerAtribucion, type AtribucionGuardada } from "@/lib/atribucion";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Liga la atribución de la cookie `pa_origen` al perfil de quien acaba de
 * crear su cuenta. Se llama en el paso del peludo del alta (la primera
 * pantalla del servidor que ve TODA cuenta nueva: correo, correo confirmado
 * en otro dispositivo o Google) y, de red de seguridad, al abrir el checkout.
 *
 * · Se escribe con la llave de servicio: un miembro no puede tocar la columna
 *   (la migración 20261028000000 la protege con un trigger).
 * · La primera escritura gana (`attribution is null`): volver al paso o pagar
 *   otro peludo meses después no reescribe de dónde llegó.
 * · Sin cookie (no aceptó cookies, o llegó sin campaña) no se escribe nada.
 * · Nunca lanza: la atribución no puede frenar un alta.
 */
export async function guardarAtribucionDelMiembro(admin: Admin, userId: string): Promise<void> {
  try {
    const galletas = await cookies();
    const atribucion = leerAtribucion(galletas.get(COOKIE_ATRIBUCION)?.value);
    if (!atribucion) return;
    const guardada: AtribucionGuardada = { ...atribucion, guardada: new Date().toISOString() };
    const { error } = await admin
      .from("profiles")
      .update({ attribution: guardada })
      .eq("id", userId)
      .is("attribution", null);
    if (error) console.error("[atribucion] no se pudo guardar", error.message);
  } catch (e) {
    console.error("[atribucion] no se pudo guardar", e);
  }
}
