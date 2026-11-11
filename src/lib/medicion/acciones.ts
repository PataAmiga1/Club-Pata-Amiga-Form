"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { idRegistroPeludo } from "./eventos";
import { contextoDeMedicion, urlDelSitio } from "./capi-servidor";
import { enviarConversion, medicionServidorConfigurada } from "./conversiones-servidor";

/**
 * CompleteRegistration por la API de Conversiones de Meta y la API de Eventos
 * de TikTok (las que estén configuradas): un peludo recién
 * registrado. El alta del peludo se hace desde el navegador (PetForm inserta
 * directo en `pets` con la sesión del miembro), así que el formulario llama a
 * esta acción justo después de guardarlo, con el id que le devolvió la base.
 *
 * Se comprueba aquí —no se confía en el navegador— que el peludo existe, es de
 * quien llama y se creó hace menos de una hora: nadie puede inflar
 * conversiones mandando ids al azar o repitiendo uno viejo.
 *
 * El envío corre en `after()`: la respuesta vuelve de inmediato y el alta no
 * espera a Meta ni a TikTok. Sin llave o sin consentimiento, no hace nada.
 */
export async function medirPeludoRegistrado(
  petId: string,
  origen: "registro" | "cuenta",
): Promise<void> {
  try {
    if (!medicionServidorConfigurada() || typeof petId !== "string" || !petId) return;
    const contexto = await contextoDeMedicion();
    if (!contexto.consentido) return;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const admin = createAdminClient();
    const [{ data: pet }, { data: perfil }] = await Promise.all([
      admin.from("pets").select("id, user_id, created_at").eq("id", petId).maybeSingle(),
      admin.from("profiles").select("email, phone").eq("id", user.id).maybeSingle(),
    ]);
    if (!pet || pet.user_id !== user.id) return;
    if (Date.now() - new Date(pet.created_at).getTime() > 60 * 60 * 1000) return;

    after(() =>
      enviarConversion({
        nombre: "CompleteRegistration",
        eventoId: idRegistroPeludo(pet.id),
        instante: Date.now() / 1000,
        url: urlDelSitio(origen === "registro" ? "/registro/peludo" : "/app/peludos/nueva"),
        persona: {
          correo: perfil?.email ?? user.email ?? null,
          telefono: perfil?.phone ?? (user.user_metadata?.phone as string | undefined) ?? null,
          idExterno: user.id,
          ip: contexto.ip,
          agente: contexto.agente,
          fbp: contexto.fbp,
          fbc: contexto.fbc,
          ttp: contexto.ttp,
          ttclid: contexto.ttclid,
        },
        datos: {
          nombreContenido: origen === "registro" ? "Peludo · alta" : "Peludo · cuenta",
        },
      }),
    );
  } catch (e) {
    // La medición nunca frena el alta del peludo.
    console.error("[capi] CompleteRegistration", e);
  }
}
