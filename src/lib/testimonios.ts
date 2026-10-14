import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email/send";
import { valorAbierto } from "@/lib/registro";
import { SITE_SETTINGS } from "@/lib/site";
import { diaEnMexico, diaEnMexicoMasDias, finDelDia, inicioDelDia } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * CASOS DE ÉXITO (13-oct-2026). Cuando un reintegro queda pagado, se le pide
 * al miembro un testimonio —video cortito o nota de voz, contestando el
 * correo— sin que nadie del equipo tenga que acordarse.
 *
 * Reglas:
 * - UNA vez por MIEMBRO, no por reintegro. La garantía es la restricción única
 *   de `testimonial_requests.user_id`: se INSERTA primero y se manda después
 *   (mismo patrón que `member_reminders`). Si el correo falla, el renglón queda
 *   con `email_ok = false` y no se reintenta solo: pedirlo dos veces es peor
 *   que no pedirlo.
 * - Despedida / fallecimiento NUNCA en automático. Ese correo lo manda el
 *   comité a mano desde la solicitud. Y quien tenga un reintegro de despedida
 *   tampoco recibe el general automático por otro reintegro: llegarle un «¿nos
 *   cuentas cómo te fue?» alegre después de perder a su mascota es justo lo
 *   que hay que evitar.
 * - Respeta el DND del CRM (`contacts.dnd.todos` / `.email`).
 * - Encendido y días tras el pago en /admin/sitio (`testimonio_automatico`,
 *   `testimonio_dias_tras_pago`).
 *
 * Cuentas de prueba: no hay una marca en la base; en staging las protege la
 * reja `CORREOS_PERMITIDOS` de `src/lib/resend.ts`, igual que a todo correo.
 */

export const TESTIMONIO_GENERAL = "testimonial_request";
export const TESTIMONIO_DESPEDIDA = "testimonial_request_despedida";

/** Las respuestas llegan aquí, no a la dirección que envía. */
export const RESPONDER_A = "miembros@pataamiga.mx";

/** Categorías que son despedida (la de $159 y la de $599). */
const CATEGORIAS_DESPEDIDA = ["death", "despedida"];
export function esDespedida(category: string): boolean {
  return CATEGORIAS_DESPEDIDA.includes(category);
}

/**
 * Pagos más viejos que esto no se piden aunque nadie los haya pedido: el día
 * que se encienda (o se vuelva a encender) no debe salir una ráfaga de correos
 * por reintegros de hace meses.
 */
const VENTANA_DIAS = 30;

const DEFAULT_DE = (key: string) => SITE_SETTINGS.find((s) => s.key === key)?.default ?? "";

export async function leerAjustesDeTestimonio(
  admin: Admin,
): Promise<{ automatico: boolean; dias: number }> {
  const { data } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", ["testimonio_automatico", "testimonio_dias_tras_pago"]);
  const valor = (key: string) =>
    (data ?? []).find((s) => s.key === key && s.value)?.value ?? DEFAULT_DE(key);
  const dias = Number(String(valor("testimonio_dias_tras_pago")).trim());
  return {
    automatico: valorAbierto(valor("testimonio_automatico")),
    dias: Number.isInteger(dias) && dias >= 0 && dias <= 60 ? dias : 3,
  };
}

/** ¿El contacto del CRM de este miembro pidió no recibir correo? */
export async function tieneDndDeCorreo(admin: Admin, userId: string, email?: string | null) {
  const fuera = (dnd: unknown) => {
    const d = (dnd ?? {}) as Record<string, unknown>;
    return d.todos === true || d.email === true;
  };
  const { data: porPerfil } = await admin
    .from("contacts")
    .select("dnd")
    .eq("profile_id", userId);
  if ((porPerfil ?? []).some((c) => fuera(c.dnd))) return true;
  if (!email) return false;
  const { data: porCorreo } = await admin
    .from("contact_identities")
    .select("contacts!contact_id(dnd)")
    .eq("kind", "email")
    .eq("value", email.trim().toLowerCase());
  return (porCorreo ?? []).some((f) => {
    const c = Array.isArray(f.contacts) ? f.contacts[0] : f.contacts;
    return fuera(c?.dnd);
  });
}

export type ResultadoDeTestimonio =
  | { estado: "enviado"; emailOk: boolean }
  | { estado: "ya_pedido" }
  | { estado: "dnd" }
  | { estado: "sin_correo" }
  | { estado: "error"; motivo: string };

/** Pide el testimonio a UN miembro, una sola vez en la vida. */
export async function pedirTestimonio(
  admin: Admin,
  args: {
    userId: string;
    reimbursementId: string;
    templateKey: typeof TESTIMONIO_GENERAL | typeof TESTIMONIO_DESPEDIDA;
    sentBy: string | null;
    auto: boolean;
  },
): Promise<ResultadoDeTestimonio> {
  const { data: perfil } = await admin
    .from("profiles")
    .select("email, first_name")
    .eq("id", args.userId)
    .maybeSingle();
  if (!perfil?.email) return { estado: "sin_correo" };
  if (await tieneDndDeCorreo(admin, args.userId, perfil.email)) return { estado: "dnd" };

  const { data: req } = await admin
    .from("reimbursements")
    .select("folio, pets(name)")
    .eq("id", args.reimbursementId)
    .maybeSingle();
  const pet = (Array.isArray(req?.pets) ? req?.pets[0] : req?.pets) as { name?: string } | null;

  // Primero el renglón: si ya existía, la restricción única lo rechaza y no
  // sale ningún correo (cron y botón a la vez quedan cubiertos).
  const { data: fila, error } = await admin
    .from("testimonial_requests")
    .insert({
      user_id: args.userId,
      reimbursement_id: args.reimbursementId,
      template_key: args.templateKey,
      sent_by: args.sentBy,
      auto: args.auto,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { estado: "ya_pedido" };
    return { estado: "error", motivo: error.message };
  }

  const ok = await sendTemplatedEmail(
    args.templateKey,
    perfil.email,
    {
      firstName: perfil.first_name ?? "",
      petName: pet?.name ?? "tu mascota",
      folio: req?.folio ?? "",
    },
    { replyTo: RESPONDER_A },
  );
  await admin.from("testimonial_requests").update({ email_ok: ok }).eq("id", fila.id);
  return { estado: "enviado", emailOk: ok };
}

/**
 * El paso diario (va dentro del cron de `plazos-reintegro`, para no sumar un
 * cron a `vercel.json`). Busca reintegros pagados hace N días o más —dentro de
 * la ventana de 30— de miembros a quienes nunca se les pidió, y les manda el
 * general. Uno por miembro aunque tenga varios reintegros pagados.
 */
export async function pedirTestimoniosAutomaticos(
  admin: Admin,
  opciones?: { dias?: number; ignorarApagado?: boolean },
): Promise<{
  apagado?: boolean;
  dias: number;
  candidatos: number;
  enviados: number;
  fallidos: number;
  omitidos: number;
}> {
  const ajustes = await leerAjustesDeTestimonio(admin);
  const dias = opciones?.dias ?? ajustes.dias;
  if (!ajustes.automatico && !opciones?.ignorarApagado)
    return { apagado: true, dias, candidatos: 0, enviados: 0, fallidos: 0, omitidos: 0 };

  // «Pagado hace N días o más» en días MEXICANOS: el corte es el final del día
  // de hace N días; el piso, el inicio del día de hace N + 30.
  const hasta = finDelDia(diaEnMexicoMasDias(-dias));
  const desde = inicioDelDia(diaEnMexicoMasDias(-(dias + VENTANA_DIAS)));

  const { data: pagados } = await admin
    .from("reimbursements")
    .select("id, user_id, category, paid_at")
    .eq("status", "paid")
    .not("paid_at", "is", null)
    .lte("paid_at", hasta.toISOString())
    .gte("paid_at", desde.toISOString())
    .order("paid_at", { ascending: true });

  const usuarios = [...new Set((pagados ?? []).map((r) => r.user_id))];
  if (usuarios.length === 0)
    return { dias, candidatos: 0, enviados: 0, fallidos: 0, omitidos: 0 };

  const [{ data: yaPedidos }, { data: despedidas }] = await Promise.all([
    admin.from("testimonial_requests").select("user_id").in("user_id", usuarios),
    admin
      .from("reimbursements")
      .select("user_id")
      .in("user_id", usuarios)
      .in("category", CATEGORIAS_DESPEDIDA)
      .neq("status", "rejected"),
  ]);
  const fuera = new Set([
    ...(yaPedidos ?? []).map((r) => r.user_id),
    ...(despedidas ?? []).map((r) => r.user_id),
  ]);

  // El primer reintegro pagado (no despedida) de cada miembro elegible.
  const porMiembro = new Map<string, string>();
  for (const r of pagados ?? []) {
    if (esDespedida(r.category) || fuera.has(r.user_id) || porMiembro.has(r.user_id)) continue;
    porMiembro.set(r.user_id, r.id);
  }

  let enviados = 0;
  let fallidos = 0;
  let omitidos = 0;
  for (const [userId, reimbursementId] of porMiembro) {
    const r = await pedirTestimonio(admin, {
      userId,
      reimbursementId,
      templateKey: TESTIMONIO_GENERAL,
      sentBy: null,
      auto: true,
    });
    if (r.estado === "enviado") {
      if (r.emailOk) enviados++;
      else fallidos++;
    } else omitidos++;
  }
  return { dias, candidatos: porMiembro.size, enviados, fallidos, omitidos };
}

/** Lo que enseña la solicitud en /admin/reintegros/[id]. */
export type EstadoDeTestimonio =
  | { tipo: "pedido"; sentAt: string; auto: boolean; emailOk: boolean | null; template: string }
  | { tipo: "boton" }
  | { tipo: "programado"; fecha: string }
  | { tipo: "apagado" }
  | { tipo: "dnd" }
  | { tipo: "fuera_de_ventana" }
  | { tipo: "despedida_en_cuenta" }
  | { tipo: "no_aplica" };

export async function estadoDeTestimonio(
  admin: Admin,
  req: { user_id: string; category: string; status: string; paid_at: string | null },
): Promise<EstadoDeTestimonio> {
  const { data: pedido } = await admin
    .from("testimonial_requests")
    .select("sent_at, auto, email_ok, template_key")
    .eq("user_id", req.user_id)
    .maybeSingle();
  if (pedido)
    return {
      tipo: "pedido",
      sentAt: pedido.sent_at,
      auto: pedido.auto,
      emailOk: pedido.email_ok,
      template: pedido.template_key,
    };
  if (req.status !== "paid" || !req.paid_at) return { tipo: "no_aplica" };
  if (await tieneDndDeCorreo(admin, req.user_id)) return { tipo: "dnd" };
  if (esDespedida(req.category)) return { tipo: "boton" };

  const { data: despedida } = await admin
    .from("reimbursements")
    .select("id")
    .eq("user_id", req.user_id)
    .in("category", CATEGORIAS_DESPEDIDA)
    .neq("status", "rejected")
    .limit(1);
  if ((despedida ?? []).length > 0) return { tipo: "despedida_en_cuenta" };

  const ajustes = await leerAjustesDeTestimonio(admin);
  if (!ajustes.automatico) return { tipo: "apagado" };
  const fecha = diaEnMexicoMasDias(ajustes.dias, new Date(req.paid_at));
  const limite = diaEnMexicoMasDias(ajustes.dias + VENTANA_DIAS, new Date(req.paid_at));
  if (limite < diaEnMexico(new Date())) return { tipo: "fuera_de_ventana" };
  return { tipo: "programado", fecha };
}
