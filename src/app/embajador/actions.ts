"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AMBASSADOR_CODE_PREFIX } from "@/lib/constants";
import { BANCO_OTRO, bankFromClabe, isValidClabe } from "@/lib/banks";
import { RFC_REGEX } from "@/lib/rfc";
import { esDocumentoValido, guardarFotoIne } from "@/lib/documentos-ine";

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

/** Personalizar código — permitido una sola vez (code_change_count). */
export async function customizeCode(suffixRaw: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión de nuevo." };

  const suffix = suffixRaw?.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{3,15}$/.test(suffix))
    return {
      error: "Usa de 3 a 15 letras o números, sin espacios (ej. PAOLA).",
    };

  const admin = createAdminClient();
  const { data: ambassador } = await admin
    .from("ambassadors")
    .select("id, code_change_count, status")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!ambassador) return { error: "No encontramos tu perfil de embajador." };
  if (ambassador.code_change_count >= 1)
    return { error: "Tu código ya fue personalizado — solo se puede una vez." };

  const code = `${AMBASSADOR_CODE_PREFIX}${suffix}`;
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
      code_change_count: ambassador.code_change_count + 1,
    })
    .eq("id", ambassador.id);
  if (error) return { error: "No pudimos actualizar el código. Intenta de nuevo." };

  revalidatePath("/embajador");
  return { ok: true as const, code };
}
