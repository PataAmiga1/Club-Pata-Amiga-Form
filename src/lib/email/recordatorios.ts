import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "./send";
import { datosFaltantesDelPerfil } from "@/lib/perfil-faltantes";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Recordatorio de datos faltantes a miembros activos con perfil incompleto
 * (equipo, 5-ago). Lo comparten el botón de Comunicados → Envíos y el cron
 * /api/cron/documentos. La reja CORREOS_PERMITIDOS aplica sola en ambientes
 * de prueba (vive en getResend).
 *
 * La lista sale de lib/perfil-faltantes — la MISMA regla del 100% que ve el
 * miembro en "Completa tu perfil": a un extranjero se le pide pasaporte (no
 * CURP, que no puede tener), y ni el INE ni el teléfono se piden aquí porque
 * no cuentan para el 100% (decisiones de Pablo, 10 y 11-ago).
 */
export async function enviarRecordatoriosDatosFaltantes(admin: Admin) {
  const { data: incompletos } = await admin
    .from("profiles")
    .select(
      "id, email, first_name, last_name, curp, birth_date, nationality, street, colony, postal_code",
    )
    .eq("role", "member")
    .eq("membership_status", "active")
    .eq("profile_completed", false)
    .limit(500);

  if (!incompletos?.length) return { candidatos: 0, enviados: 0 };

  // Pasaportes en un solo viaje: definen la identidad de los extranjeros
  const { data: pasaportes } = await admin
    .from("documents")
    .select("user_id")
    .eq("document_type", "passport")
    .in(
      "user_id",
      incompletos.map((p) => p.id),
    );
  const conPasaporte = new Set((pasaportes ?? []).map((d) => d.user_id));

  let enviados = 0;
  for (const p of incompletos) {
    if (!p.email) continue;
    const faltantes = datosFaltantesDelPerfil(p, {
      tienePasaporte: conPasaporte.has(p.id),
    });
    // Bandera desfasada (todo está, solo falta que vuelva a guardar): no se
    // le escribe "te falta algo" a quien no le falta nada.
    if (faltantes.length === 0) continue;

    const ok = await sendTemplatedEmail("profile_incomplete_reminder", p.email, {
      firstName: p.first_name ?? "",
      missingList: faltantes.join(" · "),
    });
    if (ok) enviados++;
  }

  return { candidatos: incompletos.length, enviados };
}
