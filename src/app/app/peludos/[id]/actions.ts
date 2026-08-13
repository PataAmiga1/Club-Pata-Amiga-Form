"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeam } from "@/lib/alerts";
import { PET_GALLERY_MAX } from "@/lib/constants";

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

/** Respuesta del miembro en el hilo con el comité. */
export async function replyPetThread(petId: string, message: string) {
  const ctx = await ownPet(petId);
  if (!ctx) return { error: "No encontramos a tu peludo." };
  const text = message?.trim();
  if (!text || text.length < 2) return { error: "Escribe tu mensaje." };

  await ctx.admin.from("pet_messages").insert({
    pet_id: petId,
    sender: "member",
    author_id: ctx.userId,
    message: text,
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
     <p>${text}</p>
     <p>Revisa el hilo en el panel → Miembros → expediente.</p>`,
  );

  revalidatePath(`/app/peludos/${petId}`);
  return { ok: true as const };
}

/** Motivos válidos para dar de baja una mascota (nota del cliente 15-jul-2026). */
const DEACTIVATION_REASONS: Record<string, string> = {
  fallecio: "Falleció",
  ya_no_esta: "Ya no vive conmigo",
  otro: "Otro motivo",
};

/**
 * Dar de baja: la mascota deja de contar en el límite de activas, pero su
 * tarjeta queda (gris) como recuerdo. El miembro puede registrar otra en su
 * lugar — la nueva entra como reemplazo (tiempo de espera de 180 días).
 */
export async function deactivatePet(
  petId: string,
  reasonKey: string,
  details?: string,
) {
  const ctx = await ownPet(petId);
  if (!ctx) return { error: "No encontramos a tu peludo." };

  const label = DEACTIVATION_REASONS[reasonKey];
  if (!label) return { error: "Elige el motivo de la baja." };
  const reason = details?.trim() ? `${label}: ${details.trim()}` : label;

  const { error } = await ctx.admin
    .from("pets")
    .update({
      is_active: false,
      deactivation_reason: reason,
      deactivated_at: new Date().toISOString(),
    })
    .eq("id", petId);
  if (error) return { error: "No pudimos dar de baja a tu peludo. Intenta de nuevo." };

  await notifyTeam(
    "notify_pets",
    `Baja de mascota: ${ctx.pet.name} 🕊️`,
    `<h2 style="color:#1E5350">Un miembro dio de baja a ${ctx.pet.name}</h2>
     <p>Motivo: ${reason}</p>
     <p>El miembro conserva su lugar y puede registrar otra mascota (entrará como reemplazo, 180 días de tiempo de espera).</p>`,
  );

  revalidatePath("/app/peludos");
  revalidatePath(`/app/peludos/${petId}`);
  return { ok: true as const };
}
