import type { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/crm/events";
import { normalizeEmail } from "@/lib/crm/normalize";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * BAJAS DE CORREO — la «lista negra» de mercadotecnia.
 *
 * Pedido de la PM (oct-2026): quien se da de baja deja de recibir el boletín y
 * CUALQUIER correo masivo o de campaña. Los correos de servicio de su cuenta
 * (cobros, reintegros, avisos legales) le siguen llegando: no son publicidad.
 *
 * La lista vive en `correo_bajas` (una fila por correo, con su token de baja) y
 * además se refleja en el CRM como «no contactar por correo» (`contacts.dnd`)
 * cuando la persona tiene contacto, para que ventas lo vea en su perfil.
 *
 * TOKEN: uuid aleatorio por correo, guardado en la base (ver la migración
 * 20261014000000). Quien manda correos masivos fuera de esta app —el kit de
 * Python de la tanda— lo pide con `POST /rest/v1/rpc/tokens_de_baja`.
 *
 * RECETA PARA UN ENVÍO MASIVO FUERA DE LA APP (kit de Python u otro):
 *   1. Excluir `correo_bajas?select=email&baja_at=not.is.null` (además del DND
 *      del CRM y las bajas/rebotes de `newsletter_subscribers`).
 *   2. POST {SUPABASE_URL}/rest/v1/rpc/tokens_de_baja con la llave de servicio
 *      (apikey + Authorization: Bearer, y un User-Agent de navegador) y cuerpo
 *      {"correos": [...]}, en lotes de ≤500. Devuelve [{email, token}].
 *   3. Por correo: liga visible `https://www.pataamiga.mx/baja/<token>` y los
 *      encabezados de `encabezadosDeBaja(token)`:
 *        List-Unsubscribe: <https://www.pataamiga.mx/api/baja/<token>>, <mailto:…>
 *        List-Unsubscribe-Post: List-Unsubscribe=One-Click
 */

export const SITIO = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pataamiga.mx").replace(
  /\/$/,
  "",
);

/** Respaldo por si el cliente de correo no sabe hacer el POST de un clic. */
const MAILTO_BAJA = "mailto:contacto@pataamiga.mx?subject=Baja%20de%20correos";

export type OrigenBaja = "pagina" | "un_clic" | "queja_spam" | "equipo";

export const ETIQUETA_ORIGEN: Record<OrigenBaja, string> = {
  pagina: "Liga del correo",
  un_clic: "Botón del correo (un clic)",
  queja_spam: "Lo marcó como spam",
  equipo: "La agregó el equipo",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esToken(token: string | null | undefined): token is string {
  return !!token && UUID.test(token);
}

/** La página donde la persona confirma su baja. */
export function urlDeBaja(token: string) {
  return `${SITIO}/baja/${token}`;
}

/** El endpoint de un clic (RFC 8058) que llama el propio cliente de correo. */
export function urlDeBajaUnClic(token: string) {
  return `${SITIO}/api/baja/${token}`;
}

/**
 * Encabezados para cualquier correo masivo. Con estos, Gmail y Apple Mail
 * muestran su botón «Cancelar suscripción» junto al remitente, y Gmail/Yahoo
 * los exigen a quien manda en volumen desde 2024.
 */
export function encabezadosDeBaja(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${urlDeBajaUnClic(token)}>, <${MAILTO_BAJA}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * El token de baja de cada correo; los crea si faltan. Un solo viaje a la base
 * para todo el lote.
 */
export async function tokensDeBaja(
  admin: Admin,
  correos: string[],
): Promise<Map<string, string>> {
  const limpios = [
    ...new Set(correos.map((c) => normalizeEmail(c)).filter((c): c is string => !!c)),
  ];
  const mapa = new Map<string, string>();
  if (limpios.length === 0) return mapa;

  const { data, error } = await admin.rpc("tokens_de_baja", { correos: limpios });
  if (error) throw new Error(`No se pudieron generar las ligas de baja: ${error.message}`);
  for (const fila of (data ?? []) as { email: string; token: string }[])
    mapa.set(fila.email, fila.token);
  return mapa;
}

export type FilaBaja = {
  email: string;
  token: string;
  baja_at: string | null;
  origen: OrigenBaja | null;
  contact_id: string | null;
  revertida_at: string | null;
};

export async function buscarPorToken(admin: Admin, token: string): Promise<FilaBaja | null> {
  if (!esToken(token)) return null;
  const { data } = await admin
    .from("correo_bajas")
    .select("email, token, baja_at, origen, contact_id, revertida_at")
    .eq("token", token)
    .maybeSingle();
  return (data as FilaBaja | null) ?? null;
}

/** El contacto del CRM de este correo: por su identidad, o por su cuenta. */
async function contactoDelCorreo(admin: Admin, email: string): Promise<string | null> {
  const { data: identidad } = await admin
    .from("contact_identities")
    .select("contact_id")
    .eq("kind", "email")
    .eq("value", email)
    .maybeSingle();
  if (identidad?.contact_id) return identidad.contact_id as string;

  // `ilike` sin comodines: se escapan % y _ para que sea igualdad sin mayúsculas.
  const patron = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: perfil } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", patron)
    .limit(1)
    .maybeSingle();
  if (!perfil?.id) return null;

  const { data: contacto } = await admin
    .from("contacts")
    .select("id")
    .eq("profile_id", perfil.id)
    .limit(1)
    .maybeSingle();
  return (contacto?.id as string | undefined) ?? null;
}

/** Pone o quita el «no contactar por correo» del CRM, dejando constancia. */
async function marcarDndCorreo(
  admin: Admin,
  contactId: string,
  valor: boolean,
  resumen: string,
  actorId: string | null,
) {
  const { data: actual } = await admin
    .from("contacts")
    .select("dnd")
    .eq("id", contactId)
    .maybeSingle();
  const dnd = { ...((actual?.dnd as Record<string, boolean>) ?? {}) };
  if (valor) dnd.email = true;
  else delete dnd.email;

  await admin
    .from("contacts")
    .update({ dnd, updated_at: new Date().toISOString() })
    .eq("id", contactId);

  await emitEvent(admin, {
    contactId,
    kind: "nota",
    summary: resumen,
    payload: { dnd },
    actorId,
    actorLabel: actorId ? null : "Plataforma",
  });
}

/**
 * Mete un correo a la lista negra. Idempotente: si ya estaba, conserva la fecha
 * y el origen de la primera baja.
 *
 * Toca tres lugares:
 *   1. `correo_bajas` (la lista que leen el boletín y el kit de la tanda);
 *   2. `newsletter_subscribers` → 'baja' si estaba activo;
 *   3. el contacto del CRM → «no contactar por correo», con nota en su historial.
 */
export async function darDeBajaCorreo(
  admin: Admin,
  emailCrudo: string,
  origen: OrigenBaja,
  actorId: string | null = null,
): Promise<{ ok: true; email: string; yaEstaba: boolean } | { ok: false; error: string }> {
  const email = normalizeEmail(emailCrudo);
  if (!email) return { ok: false, error: "Ese correo no es válido." };

  const ahora = new Date().toISOString();
  await tokensDeBaja(admin, [email]); // asegura la fila

  const { data: fila } = await admin
    .from("correo_bajas")
    .select("baja_at, contact_id")
    .eq("email", email)
    .single();
  const yaEstaba = !!fila?.baja_at;

  const contactId = (fila?.contact_id as string | null) ?? (await contactoDelCorreo(admin, email));

  if (!yaEstaba) {
    const { error } = await admin
      .from("correo_bajas")
      .update({
        baja_at: ahora,
        origen,
        contact_id: contactId,
        revertida_at: null,
        revertida_por: null,
        updated_at: ahora,
      })
      .eq("email", email);
    if (error) return { ok: false, error: "No pudimos registrar tu baja. Intenta de nuevo." };
  }

  // Se repite aunque ya estuviera: si alguien lo reactivó a mano en el boletín
  // o en el CRM, la baja de la persona vuelve a mandar.
  await admin
    .from("newsletter_subscribers")
    .update({ status: "baja", unsubscribed_at: ahora })
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .eq("status", "activo");

  if (contactId && !yaEstaba)
    await marcarDndCorreo(
      admin,
      contactId,
      true,
      `Se dio de baja del correo de mercadotecnia (${ETIQUETA_ORIGEN[origen].toLowerCase()})`,
      actorId,
    );

  return { ok: true, email, yaEstaba };
}

/**
 * Deshace una baja cuando la persona lo pide. Vuelve a activar su suscripción
 * al boletín si se había dado de baja (un rebote duro no se toca: ese buzón no
 * existe) y le quita el «no contactar por correo» del CRM.
 */
export async function revertirBajaCorreo(
  admin: Admin,
  emailCrudo: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = normalizeEmail(emailCrudo);
  if (!email) return { ok: false, error: "Ese correo no es válido." };

  const { data: fila } = await admin
    .from("correo_bajas")
    .select("baja_at, contact_id")
    .eq("email", email)
    .maybeSingle();
  if (!fila?.baja_at) return { ok: false, error: "Ese correo no está dado de baja." };

  const ahora = new Date().toISOString();
  await admin
    .from("correo_bajas")
    .update({ baja_at: null, revertida_at: ahora, revertida_por: actorId, updated_at: ahora })
    .eq("email", email);

  await admin
    .from("newsletter_subscribers")
    .update({ status: "activo", unsubscribed_at: null })
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .eq("status", "baja");

  const contactId = (fila.contact_id as string | null) ?? (await contactoDelCorreo(admin, email));
  if (contactId)
    await marcarDndCorreo(
      admin,
      contactId,
      false,
      "El equipo deshizo su baja del correo (la persona lo pidió)",
      actorId,
    );

  return { ok: true };
}

/**
 * Al activarse una membresía, el miembro entra al boletín — salvo que la regla
 * única de exclusión (`correo_fuera_del_boletin`, en la base) diga que no:
 * lista negra, «no contactar», equipo, prueba o baja previa.
 *
 * Nunca lanza: un webhook de pago no se cae por esto.
 */
export async function sumarMiembroAlBoletin(admin: Admin, userId: string) {
  try {
    const { data: perfil } = await admin
      .from("profiles")
      .select("email, role")
      .eq("id", userId)
      .maybeSingle();
    const email = normalizeEmail(perfil?.email as string | undefined);
    if (!email || perfil?.role !== "member") return;

    const { data: motivo, error } = await admin.rpc("correo_fuera_del_boletin", {
      p_email: email,
    });
    if (error || motivo) return;

    await admin
      .from("newsletter_subscribers")
      .upsert({ email, source: "miembro" }, { onConflict: "email", ignoreDuplicates: true });
  } catch (err) {
    console.error("[boletín] no se pudo sumar al miembro", userId, err);
  }
}
