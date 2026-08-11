import { createAdminClient } from "@/lib/supabase/admin";
import { petWaitingPeriodDays } from "@/lib/waiting-period";
import { esperasDe, beneficiosDeUsuario } from "@/lib/plans/resolve";
import { hoyEnMexico, diaEnMexicoMasDias } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Fija el período de espera de una mascota EN EL MOMENTO DE SU APROBACIÓN
 * (regla de la PM, 11-ago): el reloj no corre mientras la ficha está en
 * revisión, así que el inicio es el día en que el comité aprueba.
 *
 * Se usa desde los DOS caminos que aprueban mascotas: `resolvePet` y la
 * aceptación de una apelación. Antes la fecha fin la escribía el registro o el
 * webhook de pago, y como el inicio nunca se guardaba, la pantalla lo adivinaba
 * con `created_at` — de ahí los "13 días transcurridos" en una mascota recién
 * dada de alta.
 *
 * Los días salen de los beneficios que CONTRATÓ este miembro (snapshot), y el
 * código de embajador se lee de `profiles.ambassador_code_used`: es un
 * beneficio de la MEMBRESÍA, no de la mascota — la tercera mascota registrada
 * meses después lo conserva (PM, 11-ago).
 */
export async function iniciarEsperaDeMascota(
  admin: Admin,
  petId: string,
): Promise<{ days: number; endDate: string } | null> {
  const { data: pet } = await admin
    .from("pets")
    .select("id, user_id, breed, is_adopted, created_at")
    .eq("id", petId)
    .single();
  if (!pet) return null;

  const [{ data: profile }, { data: previousInactive }, beneficios] =
    await Promise.all([
      admin
        .from("profiles")
        .select("ambassador_code_used")
        .eq("id", pet.user_id)
        .maybeSingle(),
      // Reemplazo = ya dio de baja otra mascota antes de registrar esta
      admin
        .from("pets")
        .select("id")
        .eq("user_id", pet.user_id)
        .eq("is_active", false)
        .lt("created_at", pet.created_at)
        .limit(1),
      beneficiosDeUsuario(admin, pet.user_id),
    ]);

  const days = petWaitingPeriodDays(
    {
      isAdopted: pet.is_adopted,
      breed: pet.breed,
      hasReferralCode: Boolean(profile?.ambassador_code_used),
      isReplacement: (previousInactive ?? []).length > 0,
    },
    esperasDe(beneficios),
  );

  const endDate = diaEnMexicoMasDias(days);
  await admin
    .from("pets")
    .update({
      waiting_period_start_date: hoyEnMexico(),
      waiting_period_end_date: endDate,
    })
    .eq("id", petId);

  return { days, endDate };
}
