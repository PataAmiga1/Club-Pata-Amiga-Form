import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "./send";
import { destinatarioPermitido } from "@/lib/resend";
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
  // La reja de pruebas responde sin error: sin descontarlos, el contador de
  // la pantalla presumía recordatorios que nunca salieron.
  let bloqueados = 0;
  for (const p of incompletos) {
    if (!p.email) continue;
    if (!destinatarioPermitido(p.email)) {
      bloqueados++;
      continue;
    }
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

  return { candidatos: incompletos.length, enviados, bloqueados };
}

/**
 * RECORDATORIOS DE RENOVACIÓN (equipo, pendiente desde el 14-jul; construido
 * el 2-sep).
 *
 * Le avisa al miembro que su membresía se va a renovar ANTES de que le llegue
 * el cargo. No es un cobro que tenga que autorizar —se hace solo— así que el
 * correo tiene un propósito concreto: que le dé tiempo de actualizar la
 * tarjeta si cambió o está por vencer. Eso es exactamente lo que produjo el
 * cobro duplicado del 29-ago: una renovación que falló, y un miembro que se
 * enteró tarde y volvió a contratar.
 *
 * LA SECUENCIA NO ESTÁ EN EL CÓDIGO. El equipo no la ha definido, así que se
 * lee del ajuste `renewal_reminder_days` de /admin/sitio ("7,1" por omisión).
 * El día que decidan, lo cambian ahí y no hace falta un despliegue. Vacío o
 * sin números válidos = apagado, sin tocar nada.
 *
 * NO SE MANDA DOS VECES, y eso lo garantiza la BASE, no este código: se
 * INSERTA en `renewal_reminders` primero y se manda el correo después. Si el
 * renglón ya existía, la restricción única lo rechaza y se salta. Un
 * `select … si no existe` dejaría pasar dos procesos simultáneos; esto no.
 *
 * QUIÉN NO LO RECIBE:
 * - Quien ya canceló (`cancel_at_period_end`): decirle "te vamos a cobrar" a
 *   quien pidió que no se le cobre sería un error caro. Su aviso sería otro
 *   —"tu membresía termina el X"— y todavía no está definido.
 * - Quien está en mora: ese ya recibió `pago_fallido`, que dice justo lo
 *   contrario. Dos correos opuestos el mismo día confunden más que ayudar.
 */
export async function enviarRecordatoriosDeRenovacion(
  admin: Admin,
  opciones?: { diasForzados?: number[] },
) {
  const { hoyEnMexico, diaEnMexicoMasDias, inicioDelDia, finDelDia } =
    await import("@/lib/zona-horaria");
  const { fetchSiteSettings } = await import("@/lib/site");
  const { formatDateEs } = await import("@/lib/dates");
  const { formatMxn } = await import("@/lib/format");

  // La ventana se calcula en hora de MÉXICO, nunca con `new Date()` pelón: el
  // cron corre en UTC y "dentro de 7 días" se recorrería un día para quien
  // renueva de noche.
  const ajustes = await fetchSiteSettings();
  const dias =
    opciones?.diasForzados ??
    (ajustes.renewal_reminder_days ?? "")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 90);

  if (!dias.length)
    return { candidatos: 0, enviados: 0, bloqueados: 0, yaEnviados: 0, dias };

  const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pataamiga.mx";
  let candidatos = 0;
  let enviados = 0;
  let bloqueados = 0;
  let yaEnviados = 0;

  for (const d of dias) {
    const objetivo = d === 0 ? hoyEnMexico() : diaEnMexicoMasDias(d);
    const { data: subs } = await admin
      .from("subscriptions")
      .select(
        "id, user_id, plan, amount, currency, current_period_end, cancel_at_period_end, status, profiles!user_id(email, first_name)",
      )
      .eq("status", "active")
      .not("cancel_at_period_end", "is", true)
      .gte("current_period_end", inicioDelDia(objetivo).toISOString())
      .lte("current_period_end", finDelDia(objetivo).toISOString());

    for (const sub of subs ?? []) {
      const perfil = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles;
      const correo = (perfil as { email?: string } | null)?.email;
      if (!correo) continue;
      candidatos++;

      if (!destinatarioPermitido(correo)) {
        bloqueados++;
        continue;
      }

      // PRIMERO el registro. Si ya existía, la restricción única lo rechaza y
      // no se manda nada — ni siquiera si dos procesos entran a la vez.
      const { error: yaEstaba } = await admin.from("renewal_reminders").insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        period_end: sub.current_period_end,
        days_before: d,
      });
      if (yaEstaba) {
        yaEnviados++;
        continue;
      }

      const cuantoFalta =
        d === 0 ? "hoy" : d === 1 ? "mañana" : `${d} días`;
      const ok = await sendTemplatedEmail("renovacion_proxima", correo, {
        firstName:
          (perfil as { first_name?: string | null } | null)?.first_name ?? "",
        fecha: formatDateEs(new Date(sub.current_period_end as string)),
        dias: cuantoFalta,
        monto: `${formatMxn(Number(sub.amount ?? 0))} ${String(sub.currency ?? "MXN").toUpperCase()}`,
        plan: sub.plan === "annual" ? "Anual" : "Mensual",
        cuentaUrl: `${SITE_URL}/app/cuenta`,
      });
      if (ok) enviados++;
      else {
        // El correo no salió: se borra el registro para que el siguiente
        // intento lo vuelva a tomar. Si se dejara, el aviso se perdería para
        // siempre por una caída pasajera del proveedor.
        await admin
          .from("renewal_reminders")
          .delete()
          .eq("subscription_id", sub.id)
          .eq("period_end", sub.current_period_end as string)
          .eq("days_before", d);
      }
    }
  }

  return { candidatos, enviados, bloqueados, yaEnviados, dias };
}
