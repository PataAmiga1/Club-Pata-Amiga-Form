"use server";

import { revalidatePath } from "next/cache";
import { darDeBajaPeludo } from "@/lib/pets/dar-de-baja";
import { formatDateEs } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeam } from "@/lib/alerts";
import { PET_GALLERY_MAX } from "@/lib/constants";
import {
  sanearAdjuntos,
  type AdjuntoConversacion,
} from "@/lib/documentos-conversacion";

async function ownPet(petId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: pet } = await admin
    .from("pets")
    .select("id, name, user_id")
    .eq("id", petId)
    .single();
  if (!pet || pet.user_id !== user.id) return null;
  return { pet, admin, userId: user.id };
}

export type PetFichaInput = {
  /** Se captura aquí desde el 12-ago: el alta se redujo a tipo, nombre y edad. */
  breed?: string;
  sex?: string;
  coatColor?: string;
  noseColor?: string;
  eyeColor?: string;
  isAdopted?: boolean;
  adoptionStory?: string;
  photoUrl?: string;
  galleryPhotos?: string[];
  vetCertificateUrl?: string;
};

/** Guarda el perfil completo (datos + foto principal + galería máx. 5). */
export async function updatePetFicha(petId: string, input: PetFichaInput) {
  const ctx = await ownPet(petId);
  if (!ctx) return { error: "No encontramos a tu peludo." };

  const gallery = (input.galleryPhotos ?? []).slice(0, PET_GALLERY_MAX);
  const { error } = await ctx.admin
    .from("pets")
    .update({
      breed: input.breed?.trim() || null,
      sex: input.sex || null,
      coat_color: input.coatColor?.trim() || null,
      nose_color: input.noseColor?.trim() || null,
      eye_color: input.eyeColor?.trim() || null,
      is_adopted: input.isAdopted ?? false,
      adoption_story: input.isAdopted ? input.adoptionStory?.trim() || null : null,
      ...(input.photoUrl ? { photo_url: input.photoUrl } : {}),
      gallery_photos: gallery,
      ...(input.vetCertificateUrl
        ? { vet_certificate_url: input.vetCertificateUrl }
        : {}),
    })
    .eq("id", petId);
  if (error) return { error: "No pudimos guardar el perfil. Intenta de nuevo." };

  revalidatePath(`/app/peludos/${petId}`);
  revalidatePath("/app/peludos");
  return { ok: true as const };
}

/**
 * Respuesta del miembro en el hilo con el comité, CON ADJUNTOS desde el 19-ago.
 * Es el hilo por el que el comité pide "foto principal" o "certificado
 * veterinario" (`requested_items`) y hasta hoy no había dónde entregarlos.
 *
 * Un mensaje puede ser SOLO adjuntos: mandar la foto que pidieron sin escribir
 * nada es una respuesta completa, y exigir dos palabras sería un trámite.
 */
export async function replyPetThread(
  petId: string,
  message: string,
  documents?: AdjuntoConversacion[],
) {
  const ctx = await ownPet(petId);
  if (!ctx) return { error: "No encontramos a tu peludo." };
  const text = message?.trim() ?? "";
  const adjuntos = sanearAdjuntos(documents);
  if (text.length < 2 && !adjuntos.length)
    return { error: "Escribe tu mensaje o adjunta un archivo." };

  await ctx.admin.from("pet_messages").insert({
    pet_id: petId,
    sender: "member",
    author_id: ctx.userId,
    message: text || "(envió archivos)",
    documents: adjuntos,
  });
  // El miembro ya respondió: se apaga la bandera de "info solicitada"
  await ctx.admin
    .from("pets")
    .update({ info_requested: false })
    .eq("id", petId);

  await notifyTeam(
    "notify_pets",
    `Respuesta sobre ${ctx.pet.name} 🐾`,
    `<h2 style="color:#1E5350">El miembro respondió sobre ${ctx.pet.name}</h2>
     <p>${text || "(sin texto)"}</p>
     ${adjuntos.length ? `<p>Adjuntó ${adjuntos.length} archivo(s).</p>` : ""}
     <p>Revisa el hilo en el panel → Miembros → expediente.</p>`,
  );

  revalidatePath(`/app/peludos/${petId}`);
  return { ok: true as const };
}

/**
 * Dar de baja: la mascota deja de contar en el límite de activas, pero su
 * tarjeta queda (gris) como recuerdo. Toda la lógica (incluida la cancelación
 * al corte de su membresía $599 y los avisos al equipo) vive en
 * `darDeBajaPeludo`, que comparte con la baja que registra el comité.
 */
export async function deactivatePet(
  petId: string,
  reasonKey: string,
  details?: string,
) {
  const ctx = await ownPet(petId);
  if (!ctx) return { error: "No encontramos a tu peludo." };

  const res = await darDeBajaPeludo(ctx.admin, {
    petId,
    petName: ctx.pet.name,
    reasonKey,
    details,
  });
  if ("error" in res) return { error: res.error };

  revalidatePath("/app/peludos");
  revalidatePath(`/app/peludos/${petId}`);
  revalidatePath("/app/cuenta");
  return {
    ok: true as const,
    ...(res.membresiaHasta
      ? { mensaje: `Su membresía termina el ${formatDateEs(res.membresiaHasta)}; no se te vuelve a cobrar por ${ctx.pet.name}.` }
      : {}),
  };
}
