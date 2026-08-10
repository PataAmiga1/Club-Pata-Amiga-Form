import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "./send";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Recordatorio de datos faltantes a miembros activos con perfil incompleto
 * (equipo, 5-ago). Lo comparten el botón de Comunicados → Envíos y el cron
 * /api/cron/documentos. La reja CORREOS_PERMITIDOS aplica sola en ambientes
 * de prueba (vive en getResend).
 */
export async function enviarRecordatoriosDatosFaltantes(admin: Admin) {
  const { data: incompletos } = await admin
    .from("profiles")
    .select(
      "id, email, first_name, curp, birth_date, nationality, street, postal_code, phone",
    )
    .eq("role", "member")
    .eq("membership_status", "active")
    .eq("profile_completed", false)
    .limit(500);

  if (!incompletos?.length) return { candidatos: 0, enviados: 0 };

  // El INE ya NO se pide aquí: es opcional y no cuenta para el perfil
  // completo (decisión de Pablo, 10-ago). Se solicita al pedir el primer
  // reintegro, que es cuando de verdad hace falta.
  let enviados = 0;
  for (const p of incompletos) {
    if (!p.email) continue;
    const faltantes = [
      !p.curp && "CURP",
      !p.birth_date && "fecha de nacimiento",
      !p.nationality && "nacionalidad",
      !(p.street && p.postal_code) && "domicilio",
      !p.phone && "teléfono",
    ].filter(Boolean) as string[];
    if (faltantes.length === 0) continue;

    const ok = await sendTemplatedEmail("profile_incomplete_reminder", p.email, {
      firstName: p.first_name ?? "",
      missingList: faltantes.join(" · "),
    });
    if (ok) enviados++;
  }

  return { candidatos: incompletos.length, enviados };
}
