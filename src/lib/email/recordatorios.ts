import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "./send";
import { destinatarioPermitido } from "@/lib/resend";
import { datosFaltantesDelPerfil } from "@/lib/perfil-faltantes";
import { ESTADOS_VIVOS as ESTADOS_DE_COBRO_VIVO } from "@/lib/plans/suscripciones";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * SECUENCIA DE RECORDATORIOS DEL ALTA (equipo, 21-sep-2026).
 *
 * La gerencia de ventas pidió (nota de voz del 21-sep) que a quien se registró
 * —o usó el cupón— se le recuerde terminar: «varios que están activos siguen
 * incompletos» y el comité no puede aprobar a su peludo sin el perfil.
 *
 * Son dos avisos distintos del mismo problema:
 *   · `perfil` — ya pagó, su membresía está activa, pero el perfil está
 *     incompleto: sin esos datos el comité no aprueba a su peludo.
 *   · `pago`   — creó su cuenta (casi siempre con su peludo ya registrado) y
 *     nunca pagó.
 *
 * TRES AVISOS Y SE ACABA (Pablo, 21-sep). Antes esto le escribía a TODOS los
 * perfiles incompletos cada lunes, para siempre; ahora cada aviso queda
 * asentado en `member_reminders` y, cuando salen los tres, esa persona ya no
 * recibe más. Los días viven en /admin/sitio (`profile_reminder_days`,
 * `payment_reminder_days`): el día que el equipo quiera otra cadencia la
 * cambia ahí, sin un despliegue. Vacío = apagado.
 *
 * NO SE MANDA DOS VECES, y eso lo garantiza la BASE: se INSERTA el renglón
 * antes de mandar (restricción única), como en los recordatorios de
 * renovación. Si el correo falla, el renglón se BORRA para que mañana se
 * vuelva a intentar — un fallo de Resend no debe quemarle un aviso a nadie.
 */

/** Días entre un aviso y el siguiente, pase lo que pase. */
const MIN_DIAS_ENTRE_AVISOS = 2;

/** Quien se registró hace mucho ya no recibe el recordatorio de pago. */
const MAX_DIAS_PARA_EL_PAGO = 30;

const DIA = 24 * 60 * 60 * 1000;

/** Los números de un ajuste «1,4,10»; vacío = apagado. */
function leerDiasDeAjuste(valor: string | undefined | null): number[] {
  return (valor ?? "")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 365);
}

async function ajusteDeDias(admin: Admin, key: string, porOmision: string) {
  const { data } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return leerDiasDeAjuste(data?.value?.trim() || porOmision);
}

type Enviados = { candidatos: number; enviados: number; bloqueados: number; yaAlDia: number };

/**
 * ¿Le toca aviso hoy a esta persona? Devuelve el número de aviso (1, 2, 3…) o
 * `null`. `dias` son días desde que empezó a contar: el alta para el pago, la
 * activación de la membresía para el perfil.
 */
function avisoQueToca(
  dias: number[],
  diasDesdeElAncla: number,
  enviados: { numero: number; sent_at: string }[],
  ahora: number,
): number | null {
  const numero = enviados.length + 1;
  if (numero > dias.length) return null; // ya recibió toda la secuencia
  if (diasDesdeElAncla < dias[numero - 1]) return null;
  const ultimo = enviados
    .map((e) => new Date(e.sent_at).getTime())
    .sort((a, b) => b - a)[0];
  if (ultimo !== undefined && (ahora - ultimo) / DIA < MIN_DIAS_ENTRE_AVISOS) return null;
  return numero;
}

/** Aparta el aviso en la base. `false` = alguien más ya lo mandó. */
async function apartarAviso(
  admin: Admin,
  userId: string,
  tipo: "perfil" | "pago",
  numero: number,
): Promise<boolean> {
  const { error } = await admin
    .from("member_reminders")
    .insert({ user_id: userId, tipo, numero });
  return !error;
}

async function soltarAviso(
  admin: Admin,
  userId: string,
  tipo: "perfil" | "pago",
  numero: number,
) {
  await admin
    .from("member_reminders")
    .delete()
    .eq("user_id", userId)
    .eq("tipo", tipo)
    .eq("numero", numero);
}

/** Lo que ya se le mandó a cada persona, por tipo. */
async function avisosPrevios(admin: Admin, tipo: "perfil" | "pago", userIds: string[]) {
  const previos = new Map<string, { numero: number; sent_at: string }[]>();
  if (!userIds.length) return previos;
  const { data } = await admin
    .from("member_reminders")
    .select("user_id, numero, sent_at")
    .eq("tipo", tipo)
    .in("user_id", userIds);
  for (const r of data ?? []) {
    const lista = previos.get(r.user_id) ?? [];
    lista.push({ numero: r.numero, sent_at: r.sent_at });
    previos.set(r.user_id, lista);
  }
  return previos;
}

/**
 * Recordatorio de datos faltantes a miembros activos con perfil incompleto
 * (equipo, 5-ago; secuencia de tres desde el 21-sep). Lo comparten el botón de
 * Comunicados → Envíos y el cron /api/cron/documentos. La reja
 * CORREOS_PERMITIDOS aplica sola en ambientes de prueba (vive en getResend).
 *
 * La lista sale de lib/perfil-faltantes — la MISMA regla del 100% que ve el
 * miembro en "Completa tu perfil": a un extranjero se le pide pasaporte (no
 * CURP, que no puede tener), y ni el INE ni el teléfono se piden aquí porque
 * no cuentan para el 100% (decisiones de Pablo, 10 y 11-ago).
 */
export async function enviarRecordatoriosDatosFaltantes(admin: Admin): Promise<Enviados & { dias: number[] }> {
  const dias = await ajusteDeDias(admin, "profile_reminder_days", "1,4,10");
  const vacio = { candidatos: 0, enviados: 0, bloqueados: 0, yaAlDia: 0, dias };
  if (!dias.length) return vacio;

  const { data: incompletos } = await admin
    .from("profiles")
    .select(
      "id, email, first_name, last_name, curp, birth_date, nationality, street, colony, postal_code, member_since, created_at",
    )
    .eq("role", "member")
    .eq("membership_status", "active")
    .eq("profile_completed", false)
    .limit(500);

  if (!incompletos?.length) return vacio;

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
  const previos = await avisosPrevios(
    admin,
    "perfil",
    incompletos.map((p) => p.id),
  );

  const ahora = Date.now();
  let enviados = 0;
  // La reja de pruebas responde sin error: sin descontarlos, el contador de
  // la pantalla presumía recordatorios que nunca salieron.
  let bloqueados = 0;
  let yaAlDia = 0;
  for (const p of incompletos) {
    if (!p.email) continue;
    const faltantes = datosFaltantesDelPerfil(p, {
      tienePasaporte: conPasaporte.has(p.id),
    });
    // Bandera desfasada (todo está, solo falta que vuelva a guardar): no se
    // le escribe "te falta algo" a quien no le falta nada.
    if (faltantes.length === 0) continue;

    const ancla = new Date(p.member_since ?? p.created_at).getTime();
    const numero = avisoQueToca(
      dias,
      (ahora - ancla) / DIA,
      previos.get(p.id) ?? [],
      ahora,
    );
    if (numero === null) {
      yaAlDia++;
      continue;
    }
    if (!destinatarioPermitido(p.email)) {
      bloqueados++;
      continue;
    }
    if (!(await apartarAviso(admin, p.id, "perfil", numero))) continue;

    const ok = await sendTemplatedEmail("profile_incomplete_reminder", p.email, {
      firstName: p.first_name ?? "",
      missingList: faltantes.join(" · "),
    });
    if (ok) enviados++;
    else await soltarAviso(admin, p.id, "perfil", numero);
  }

  return { candidatos: incompletos.length, enviados, bloqueados, yaAlDia, dias };
}

/**
 * Recordatorio a quien creó su cuenta y NO pagó (equipo, 21-sep-2026). El
 * embudo más caro del negocio: 46 cuentas en 30 días, 31 de ellas con su
 * peludo ya registrado, a un paso del pago.
 *
 * Solo las de los últimos 30 días: escribirle a una cuenta de hace meses no es
 * un recordatorio, es correo frío. Y solo a quien no tiene ninguna suscripción
 * viva, para no molestar a quien ya pagó y aparece «pendiente» por un cobro en
 * camino.
 */
export async function enviarRecordatoriosDePagoPendiente(admin: Admin): Promise<Enviados & { dias: number[] }> {
  const dias = await ajusteDeDias(admin, "payment_reminder_days", "1,3,7");
  const vacio = { candidatos: 0, enviados: 0, bloqueados: 0, yaAlDia: 0, dias };
  if (!dias.length) return vacio;

  const desde = new Date(Date.now() - MAX_DIAS_PARA_EL_PAGO * DIA).toISOString();
  const { data: sinPagar } = await admin
    .from("profiles")
    .select("id, email, first_name, created_at")
    .eq("role", "member")
    .eq("membership_status", "pending_payment")
    .gte("created_at", desde)
    .limit(500);
  if (!sinPagar?.length) return vacio;

  const ids = sinPagar.map((p) => p.id);
  const [{ data: suscripciones }, { data: peludos }, previos] = await Promise.all([
    admin.from("subscriptions").select("user_id, status").in("user_id", ids),
    admin
      .from("pets")
      .select("user_id, name, created_at")
      .in("user_id", ids)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    avisosPrevios(admin, "pago", ids),
  ]);
  // Una suscripción viva quiere decir que el cobro ya pasó (o está en camino):
  // esa persona no recibe "te falta pagar".
  const conSuscripcion = new Set(
    (suscripciones ?? [])
      .filter((s) => ESTADOS_DE_COBRO_VIVO.includes(s.status ?? ""))
      .map((s) => s.user_id),
  );
  const primerPeludo = new Map<string, string>();
  for (const x of peludos ?? []) if (!primerPeludo.has(x.user_id)) primerPeludo.set(x.user_id, x.name);

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pataamiga.mx";
  const ahora = Date.now();
  let candidatos = 0;
  let enviados = 0;
  let bloqueados = 0;
  let yaAlDia = 0;
  for (const p of sinPagar) {
    if (!p.email || conSuscripcion.has(p.id)) continue;
    candidatos++;
    const numero = avisoQueToca(
      dias,
      (ahora - new Date(p.created_at).getTime()) / DIA,
      previos.get(p.id) ?? [],
      ahora,
    );
    if (numero === null) {
      yaAlDia++;
      continue;
    }
    if (!destinatarioPermitido(p.email)) {
      bloqueados++;
      continue;
    }
    if (!(await apartarAviso(admin, p.id, "pago", numero))) continue;

    const peludo = primerPeludo.get(p.id);
    const ok = await sendTemplatedEmail("pago_pendiente_alta", p.email, {
      firstName: p.first_name ?? "",
      // Sin peludo registrado, el correo lo manda a registrarlo primero.
      petName: peludo ?? "tu peludo",
      continuarUrl: `${SITE_URL}${peludo ? "/registro/plan" : "/registro/peludo"}`,
    });
    if (ok) enviados++;
    else await soltarAviso(admin, p.id, "pago", numero);
  }

  return { candidatos, enviados, bloqueados, yaAlDia, dias };
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
  const leerDias = (valor: string | undefined) =>
    (valor ?? "")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 90);

  const diasNormales = opciones?.diasForzados ?? leerDias(ajustes.renewal_reminder_days);
  // El año pagado por adelantado (meses sin intereses) se avisa con más
  // anticipación: si quiere volver a pagar a meses, tiene que hacerlo ANTES del
  // aniversario (17-sep-2026).
  const diasDelAnual =
    opciones?.diasForzados ?? leerDias(ajustes.renewal_reminder_days_anual || "30,15,3");
  const dias = [...new Set([...diasNormales, ...diasDelAnual])].sort((a, b) => b - a);

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
        "id, user_id, plan, amount, currency, current_period_end, cancel_at_period_end, status, pet_id, anual_prepagado, msi_meses, profiles!user_id(email, first_name), pets(name)",
      )
      // `trialing` = año pagado por adelantado: la suscripción existe pero no
      // cobra hasta el aniversario. También necesita su recordatorio.
      .in("status", ["active", "trialing"])
      .not("cancel_at_period_end", "is", true)
      .gte("current_period_end", inicioDelDia(objetivo).toISOString())
      .lte("current_period_end", finDelDia(objetivo).toISOString());

    for (const sub of subs ?? []) {
      // Cada tipo de membresía tiene su propia lista de días.
      const toca = sub.anual_prepagado ? diasDelAnual.includes(d) : diasNormales.includes(d);
      if (!toca) continue;
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
        // $599: cada peludo se cobra aparte, así que el correo dice de cuál
        // («tu membresía Mensual de Luna se renueva…», sección 8).
        plan: `${sub.plan === "annual" ? "Anual" : "Mensual"}${
          sub.pet_id
            ? ` de ${((Array.isArray(sub.pets) ? sub.pets[0] : sub.pets) as { name?: string } | null)?.name ?? "tu peludo"}`
            : ""
        }`,
        cuentaUrl: `${SITE_URL}/app/cuenta`,
        // Solo el anual pagado por adelantado puede volver a pagarse a meses:
        // Stripe no ofrece meses sin intereses en un cobro automático.
        msiLine: sub.anual_prepagado
          ? `<p>Si quieres, puedes <strong>renovar tu año a 3 o 6 meses sin intereses</strong> antes de esa fecha, desde Mi cuenta (si tu tarjeta lo permite). Si prefieres no hacer nada, ese día te cobramos el año completo con tu tarjeta guardada.</p>`
          : "",
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
