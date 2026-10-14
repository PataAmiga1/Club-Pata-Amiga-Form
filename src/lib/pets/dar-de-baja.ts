import { cancelarAlCorte } from "@/lib/plans/peludos-599";
import { ESTADOS_VIVOS } from "@/lib/plans/suscripciones";
import { notifyTeam } from "@/lib/alerts";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Motivos válidos para dar de baja una mascota (nota del cliente 15-jul-2026). */
export const MOTIVOS_DE_BAJA: Record<string, string> = {
  fallecio: "Falleció",
  ya_no_esta: "Ya no vive conmigo",
  otro: "Otro motivo",
};

/** Lo que se agrega al motivo cuando la baja la captura el comité. */
export const MARCA_COMITE = "(registrado por el comité)";

/**
 * Dar de baja a un peludo — el corazón compartido por el miembro
 * (`deactivatePet`, su perfil del peludo) y el comité (`deactivatePetByAdmin`,
 * expediente del miembro; 13-oct-2026). Que vivan en un solo lugar es lo que
 * garantiza que las dos bajas hagan EXACTAMENTE lo mismo:
 *
 * - La mascota deja de contar en el límite de activas, pero su tarjeta queda
 *   (gris) como recuerdo. El miembro puede registrar otra en su lugar — la
 *   nueva entra como reemplazo (tiempo de espera de 180 días).
 * - Membresía $599: el peludo tiene SU suscripción. Se cancela al final del
 *   período ya pagado (no se cobra otra vez ni se reembolsa lo que corre). Si
 *   era el principal, al terminar sube el siguiente peludo (webhook). Si Stripe
 *   no acepta, se avisa al equipo para cancelarla a mano.
 *
 * No hay columna `deactivated_by`: cuando la registra el comité, el motivo
 * lleva `MARCA_COMITE` al final (sin migración, decisión del 13-oct).
 */
export async function darDeBajaPeludo(
  admin: Admin,
  input: {
    petId: string;
    petName: string;
    reasonKey: string;
    details?: string;
    porComite?: boolean;
  },
): Promise<
  | { error: string }
  | {
      ok: true;
      reason: string;
      membresiaHasta: string | null;
      /** Stripe no aceptó cancelar su membresía: el equipo ya recibió el aviso. */
      cancelacionPendiente: boolean;
    }
> {
  const label = MOTIVOS_DE_BAJA[input.reasonKey];
  if (!label) return { error: "Elige el motivo de la baja." };
  const base = input.details?.trim() ? `${label}: ${input.details.trim()}` : label;
  const reason = input.porComite ? `${base} ${MARCA_COMITE}` : base;

  const { error } = await admin
    .from("pets")
    .update({
      is_active: false,
      deactivation_reason: reason,
      deactivated_at: new Date().toISOString(),
    })
    .eq("id", input.petId);
  if (error) return { error: "No pudimos dar de baja al peludo. Intenta de nuevo." };

  let membresiaHasta: string | null = null;
  let cancelacionPendiente = false;
  const { data: suyaDelPeludo } = await admin
    .from("subscriptions")
    .select("id, status, cancel_at_period_end, current_period_end")
    .eq("pet_id", input.petId)
    .order("created_at", { ascending: false });
  const viva = (suyaDelPeludo ?? []).find((s) => ESTADOS_VIVOS.includes(s.status ?? ""));
  if (viva) {
    if (viva.cancel_at_period_end) membresiaHasta = viva.current_period_end;
    else {
      try {
        membresiaHasta = (await cancelarAlCorte(admin, viva.id))?.hasta ?? null;
      } catch {
        cancelacionPendiente = true;
        await notifyTeam(
          "notify_memberships",
          `⚠️ No se pudo cancelar la membresía de ${input.petName}`,
          `<p>${input.porComite ? "El comité" : "El miembro"} dio de baja a <strong>${input.petName}</strong>, pero Stripe no aceptó cancelar su suscripción. Hay que cancelarla a mano para que no se le vuelva a cobrar.</p>`,
        );
      }
    }
  }

  await notifyTeam(
    "notify_pets",
    `Baja de peludo: ${input.petName} 🕊️`,
    `<h2 style="color:#1E5350">${input.porComite ? "El comité registró la baja de" : "Un miembro dio de baja a"} ${input.petName}</h2>
     <p>Motivo: ${reason}</p>
     <p>El miembro conserva su lugar y puede registrar otro peludo (entrará como reemplazo, 180 días de tiempo de espera).</p>`,
  );

  return { ok: true, reason, membresiaHasta, cancelacionPendiente };
}
