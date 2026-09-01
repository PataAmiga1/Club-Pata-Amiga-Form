"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizarCodigo,
  revisarCodigo,
  sugerenciasDeCodigo,
} from "@/lib/codigo-embajador";
import { BANCO_OTRO, bankFromClabe, isValidClabe } from "@/lib/banks";
import { RFC_REGEX } from "@/lib/rfc";
import { esDocumentoValido, guardarFotoIne } from "@/lib/documentos-ine";
import { notifyTeam } from "@/lib/alerts";
import {
  sanearAdjuntos,
  type AdjuntoConversacion,
} from "@/lib/documentos-conversacion";

/**
 * Datos de pago del embajador (banco + CLABE + RFC) para recibir el corte
 * mensual por SPEI. La CLABE se valida con dígito de control; el banco se
 * detecta automáticamente y puede corregirse con el selector.
 *
 * El RFC se guarda AQUÍ desde el 13-ago (equipo): se pide junto con lo
 * bancario, porque es lo que ampara el comprobante de la comisión. Antes
 * vivía en otra tarjeta, revuelto con las redes sociales.
 */
export async function savePaymentData(
  bankNameRaw: string,
  clabeRaw: string,
  holderRaw?: string,
  rfcRaw?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const clabe = clabeRaw?.replace(/\D/g, "") ?? "";
  if (!isValidClabe(clabe))
    return { error: "Revisa tu CLABE — deben ser 18 dígitos válidos." };
  // "Otro" a secas no es un banco: si llega la palabra sin el nombre real, se
  // usa el que delata la CLABE antes que guardar algo inservible para el corte.
  const escrito = bankNameRaw?.trim() ?? "";
  const bankName =
    (escrito.toLowerCase() === BANCO_OTRO.toLowerCase() ? "" : escrito) ||
    bankFromClabe(clabe) ||
    "";
  if (!bankName) return { error: "Escribe el nombre de tu banco." };
  const holder = holderRaw?.trim() || null;
  if (!holder)
    return { error: "Escribe el nombre del titular de la cuenta." };
  const rfc = rfcRaw?.trim().toUpperCase() || null;
  if (rfc && !RFC_REGEX.test(rfc))
    return { error: "Revisa tu RFC — el formato no parece válido." };

  const admin = createAdminClient();
  const { data: ambassador } = await admin
    .from("ambassadors")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!ambassador) return { error: "No encontramos tu perfil de embajador." };

  const { error } = await admin
    .from("ambassadors")
    .update({ bank_name: bankName, clabe, bank_holder: holder, rfc })
    .eq("id", ambassador.id);
  if (error) return { error: "No pudimos guardar tus datos. Intenta de nuevo." };

  revalidatePath("/embajador");
  return { ok: true as const, bankName };
}

/**
 * INE del embajador desde su propio portal (equipo, 13-ago).
 *
 * El registro ya la pide, pero esto hace falta igual por dos motivos: los
 * embajadores que se dieron de alta ANTES de que existiera el campo no tienen
 * ninguna, y a quien mande una foto borrosa hay que dejarlo reemplazarla sin
 * escribirle al comité. Se puede guardar un solo lado a la vez.
 */
export async function saveAmbassadorIne(input: {
  ineFront?: string;
  ineBack?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const hayFrente = esDocumentoValido(input.ineFront);
  const hayReverso = esDocumentoValido(input.ineBack);
  if (!hayFrente && !hayReverso)
    return { error: "Elige el archivo de tu INE antes de guardar." };

  const admin = createAdminClient();
  // Sin filtrar por status: un embajador EN REVISIÓN es justo quien más
  // necesita poder mandar su INE, porque sin ella no lo aprueban.
  const { data: ambassador } = await admin
    .from("ambassadors")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ambassador) return { error: "No encontramos tu perfil de embajador." };

  const cambios: Record<string, string> = {};
  if (hayFrente) {
    const ruta = await guardarFotoIne(user.id, "ine_front", input.ineFront!);
    if (!ruta) return { error: "No pudimos guardar el frente. Intenta de nuevo." };
    cambios.ine_front_url = ruta;
  }
  if (hayReverso) {
    const ruta = await guardarFotoIne(user.id, "ine_back", input.ineBack!);
    if (!ruta) return { error: "No pudimos guardar el reverso. Intenta de nuevo." };
    cambios.ine_back_url = ruta;
  }

  const { error } = await admin
    .from("ambassadors")
    .update(cambios)
    .eq("id", ambassador.id);
  if (error) return { error: "No pudimos guardar tu INE. Intenta de nuevo." };

  revalidatePath("/embajador");
  revalidatePath("/embajador/cuenta");
  return { ok: true as const };
}

/**
 * Redes sociales del embajador — las captura él mismo (equipo, 5-ago).
 * El RFC dejó de pasar por aquí el 13-ago: se guarda con los datos de pago.
 */
export async function saveAmbassadorExtras(input: {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const links: Record<string, string> = {};
  for (const key of ["instagram", "facebook", "tiktok"] as const) {
    const v = input[key]?.trim();
    if (v) links[key] = v.startsWith("http") ? v : `https://${v}`;
  }

  const admin = createAdminClient();
  const { data: ambassador } = await admin
    .from("ambassadors")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!ambassador) return { error: "No encontramos tu perfil de embajador." };

  const { error } = await admin
    .from("ambassadors")
    .update({ social_links: links })
    .eq("id", ambassador.id);
  if (error) return { error: "No pudimos guardar. Intenta de nuevo." };

  revalidatePath("/embajador");
  revalidatePath("/embajador/cuenta");
  return { ok: true as const };
}

/**
 * Baja voluntaria del embajador (equipo, 5-ago): su código deja de operar
 * (todo el flujo de referidos filtra por status approved).
 */
export async function requestAmbassadorDeactivation(reason: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };
  const motivo = reason?.trim();
  if (!motivo || motivo.length < 5)
    return { error: "Cuéntanos el motivo de la baja." };

  const admin = createAdminClient();
  const { data: ambassador } = await admin
    .from("ambassadors")
    .select("id, first_name, last_name")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!ambassador) return { error: "No encontramos tu perfil de embajador." };

  const { error } = await admin
    .from("ambassadors")
    .update({
      status: "canceled",
      deactivated_at: new Date().toISOString(),
      deactivation_reason: `Baja voluntaria — ${motivo}`,
    })
    .eq("id", ambassador.id);
  if (error) return { error: "No pudimos procesar la baja. Intenta de nuevo." };

  const { notifyTeam } = await import("@/lib/alerts");
  await notifyTeam(
    "notify_ambassadors",
    "Baja voluntaria de embajador 🕊️",
    `<h2 style="color:#1E5350">${ambassador.first_name}${ambassador.last_name ? ` ${ambassador.last_name}` : ""} se dio de baja como embajador</h2>
     <p><strong>Motivo:</strong> ${motivo}</p>
     <p>Su código dejó de operar. Puede verse en el panel → Embajadores → Bajas.</p>`,
  );

  revalidatePath("/embajador");
  return { ok: true as const };
}

/**
 * ¿Está libre este código? Se llama mientras la persona escribe, para decirle
 * en el momento si puede quedárselo (documento de lineamientos, 16-ago).
 *
 * Devuelve sugerencias cuando está ocupado, como hacen las redes sociales.
 * No escribe nada: apartar un código por teclearlo permitiría bloquear los
 * buenos sin quedarse con ninguno.
 */
export async function revisarDisponibilidadCodigo(entrada: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { disponible: false, error: "Inicia sesión de nuevo." };

  const codigo = normalizarCodigo(entrada);
  const revision = revisarCodigo(codigo);
  if (!revision.ok)
    return { disponible: false, codigo, error: revision.error };

  const admin = createAdminClient();
  const { data: tomado } = await admin
    .from("ambassadors")
    .select("id, user_id")
    .eq("referral_code", codigo)
    .maybeSingle();

  // El propio también cuenta como libre: si no, "revisar" el que ya traes
  // diría que está ocupado por ti mismo.
  if (tomado && tomado.user_id !== user.id) {
    const candidatas = sugerenciasDeCodigo(codigo);
    const { data: ocupadas } = await admin
      .from("ambassadors")
      .select("referral_code")
      .in("referral_code", candidatas);
    const yaTomadas = new Set((ocupadas ?? []).map((o) => o.referral_code));
    return {
      disponible: false,
      codigo,
      error: "Ese código ya está tomado.",
      sugerencias: candidatas.filter((c) => !yaTomadas.has(c)),
    };
  }

  return { disponible: true as const, codigo };
}

/**
 * Elige (o cambia) el código de embajador.
 *
 * REGLAS NUEVAS (documento de lineamientos, 16-ago): el código ES lo que la
 * persona escribe —de 3 a 8 caracteres, A-Z y 0-9—, sin el prefijo
 * `PATAMIGA-`. Los códigos ya emitidos con prefijo siguen valiendo; esto
 * aplica a lo que se elija de aquí en adelante.
 *
 * OJO, DIFERENCIA CON EL DOCUMENTO: los lineamientos dicen "no se pueden hacer
 * cambios al código". El equipo decidió el 16-ago que SÍ se pueda cambiar, así
 * que el tope de un solo cambio se quitó. `code_change_count` se conserva
 * llevando la cuenta, que sirve para auditar quién cambia seguido.
 */
export async function customizeCode(entrada: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const code = normalizarCodigo(entrada);
  const revision = revisarCodigo(code);
  if (!revision.ok) return { error: revision.error };

  const admin = createAdminClient();
  const { data: ambassador } = await admin
    .from("ambassadors")
    .select("id, code_change_count, status, referral_code")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!ambassador) return { error: "No encontramos tu perfil de embajador." };
  if (ambassador.referral_code === code)
    return { ok: true as const, code };

  const { data: taken } = await admin
    .from("ambassadors")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();
  if (taken) return { error: "Ese código ya está tomado. Prueba otro." };

  const { error } = await admin
    .from("ambassadors")
    .update({
      referral_code: code,
      code_change_count: (ambassador.code_change_count ?? 0) + 1,
    })
    .eq("id", ambassador.id);
  if (error) return { error: "No pudimos actualizar el código. Intenta de nuevo." };

  revalidatePath("/embajador");
  revalidatePath("/embajador/cuenta");
  return { ok: true as const, code };
}

/**
 * RESPUESTA DEL EMBAJADOR EN EL HILO CON EL COMITÉ (Cipatli, 1-sep).
 *
 * OJO CON EL ESTADO: las demás acciones de este archivo exigen `approved`,
 * porque tocan datos de alguien que ya es embajador. Esta NO puede: el hilo
 * existe justamente para resolver una solicitud PENDIENTE —una INE borrosa,
 * una constancia vencida—. Exigir aprobación dejaría mudo a quien más
 * necesita contestar.
 *
 * Un mensaje puede ser SOLO adjuntos: mandar la foto que le pidieron es una
 * respuesta completa, y pedirle además dos palabras sería un trámite.
 */
export async function replySolicitudEmbajador(
  message: string,
  documents?: AdjuntoConversacion[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const text = message?.trim() ?? "";
  const adjuntos = sanearAdjuntos(documents);
  if (text.length < 2 && !adjuntos.length)
    return { error: "Escribe tu mensaje o adjunta un archivo." };

  const admin = createAdminClient();
  const { data: filas } = await admin
    .from("ambassadors")
    .select("id, first_name, status")
    .eq("user_id", user.id)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false });
  // Un perfil aprobado siempre gana sobre solicitudes más nuevas, igual que en
  // `getAmbassadorContext`.
  const amb = filas?.find((a) => a.status === "approved") ?? filas?.[0];
  if (!amb) return { error: "No encontramos tu solicitud de embajador." };

  await admin.from("solicitud_messages").insert({
    ambassador_id: amb.id,
    sender: "solicitante",
    author_id: user.id,
    message: text || "(envió archivos)",
    documents: adjuntos,
  });
  // Ya contestó: se apaga la bandera de "te pedimos algo".
  await admin
    .from("ambassadors")
    .update({ info_requested: false })
    .eq("id", amb.id);

  await notifyTeam(
    "notify_ambassadors",
    `Respuesta de ${amb.first_name} sobre su solicitud de embajador`,
    `<h2 style="color:#1E5350">${amb.first_name} respondió al comité</h2>
     <p>${text || "(sin texto)"}</p>
     ${adjuntos.length ? `<p>Adjuntó ${adjuntos.length} archivo(s).</p>` : ""}
     <p>Revisa el hilo en el panel → Embajadores.</p>`,
  );

  revalidatePath("/embajador");
  revalidatePath("/admin/embajadores");
  return { ok: true as const };
}
