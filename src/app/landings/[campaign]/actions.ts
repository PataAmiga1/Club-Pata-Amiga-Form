"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCampaign, EDAD_MINIMA_LANDING } from "@/lib/landings";
import { sendGiftEmail } from "@/lib/landings-envio";

export type LeadInput = {
  campaign: string;
  firstName: string;
  lastName: string;
  /** Edad de la persona, solo en landings que la preguntan (ExpoCan). */
  age?: string;
  /** @ de redes, cuando la campaña lo pide (encuesta por DM de Instagram). */
  handle?: string;
  email: string;
  phone: string;
  consent: boolean;
  utm?: { source?: string; medium?: string; campaign?: string };
  /** Código de embajador con el que llegó (link ?codigo=…), si lo trae. */
  ambassadorCode?: string;
  /** Respuestas, solo en las landings de encuesta. */
  respuestas?: Record<string, string>;
};

/** Registra un lead de campaña y dispara el correo "obtén tu regalo". */
export async function registerLead(input: LeadInput) {
  const campaign = getCampaign(input.campaign);
  if (!campaign || !campaign.active)
    return { error: "Esta campaña ya no está activa." };

  const esEncuesta = campaign.tipo === "encuesta";
  const pideApellidos = campaign.campos?.apellidos !== false;
  const pideEdad = campaign.campos?.edad === true;
  const firstName = input.firstName?.trim();
  // Sin apellidos en el formulario la columna queda vacía (es NOT NULL).
  const lastName = pideApellidos ? input.lastName?.trim() : "";
  const age = pideEdad ? Number(input.age) : null;
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();
  const pideHandle = campaign.campos?.handle === true;
  const correoObligatorio = campaign.campos?.correo !== false;
  // Se guarda siempre con arroba y en minúsculas: así «Corgi», «@corgi» y
  // «CORGI» son la misma persona y contestar dos veces no duplica.
  const handle = pideHandle
    ? "@" + (input.handle ?? "").trim().replace(/^@+/, "").toLowerCase()
    : null;

  if (!firstName || (pideApellidos && !lastName))
    return {
      error: pideApellidos
        ? "Escribe tu nombre y apellidos."
        : esEncuesta
          ? "Escribe tu nombre o tu @usuario."
          : "Escribe tu nombre.",
    };
  // El nombre va en el saludo del correo: un nombre de verdad cabe de sobra;
  // un párrafo ahí sería un mensaje ajeno con nuestra marca.
  if (firstName.length > 60 || (lastName?.length ?? 0) > 80)
    return { error: "Revisa tu nombre: es demasiado largo." };
  if (pideEdad) {
    if (!Number.isInteger(age) || age === null || age < 1 || age > 110)
      return { error: "Escribe tu edad en años." };
    if (age < EDAD_MINIMA_LANDING)
      return {
        error:
          "Para registrarte necesitas ser mayor de edad. Pídele a un adulto que deje sus datos.",
      };
  }
  if (pideHandle && (handle === null || handle.length < 3))
    return { error: "Escribe tu @ de Instagram." };
  // Sin correo obligatorio (encuesta por DM), solo se revisa si lo escribieron.
  if ((correoObligatorio || email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? ""))
    return { error: "Revisa tu correo electrónico." };
  // Una encuesta no pide teléfono: a esa gente ya la conocemos.
  if (!esEncuesta && (!phone || phone.replace(/\D/g, "").length < 10))
    return { error: "Escribe un teléfono válido (10 dígitos)." };
  if (!input.consent)
    return {
      error:
        campaign.tipo === "lista_espera"
          ? "Necesitamos tu consentimiento para avisarte."
          : campaign.tipo === "guia"
            ? "Necesitamos tu consentimiento para enviarte la guía."
            : esEncuesta
              ? "Necesitamos tu consentimiento para guardar tus respuestas."
              : "Necesitamos tu consentimiento para enviarte el regalo.",
    };

  // Se guarda tal cual llegó, solo si parece un código: al abrir la membresía
  // nueva sirve para darle su referido al embajador.
  const codigo = input.ambassadorCode?.trim().toUpperCase();
  const ambassadorCode =
    codigo && /^[A-Z0-9-]{3,30}$/.test(codigo) ? codigo : null;

  const admin = createAdminClient();
  const { data: lead, error } = await admin
    .from("campaign_leads")
    .insert({
      campaign: campaign.slug,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      ...(handle ? { handle } : {}),
      phone: phone || "",
      ...(esEncuesta ? { respuestas: input.respuestas ?? {}, gift_email_status: "no_aplica" } : {}),
      ...(pideEdad ? { age } : {}),
      utm_source: input.utm?.source?.slice(0, 100) || null,
      utm_medium: input.utm?.medium?.slice(0, 100) || null,
      utm_campaign: input.utm?.campaign?.slice(0, 100) || null,
      // Solo si viene: así la landing de regalo no depende de la columna.
      ...(ambassadorCode ? { ambassador_code: ambassadorCode } : {}),
    })
    .select("id")
    .single();

  if (error) {
    // Índice único (campaign, email): registro repetido
    if (error.code === "23505") {
      // Contestar dos veces no es un error: se guarda la última versión.
      if (esEncuesta) {
        // La identidad es el @ cuando la campaña lo pide; si no, el correo.
        const donde = admin
          .from("campaign_leads")
          .update({
            first_name: firstName,
            respuestas: input.respuestas ?? {},
            ...(email ? { email } : {}),
            ...(ambassadorCode ? { ambassador_code: ambassadorCode } : {}),
          })
          .eq("campaign", campaign.slug);
        await (handle ? donde.ilike("handle", handle) : donde.eq("email", email!));
        return { ok: true as const, repetido: true };
      }
      // En el stand la gente se vuelve a registrar para bajar la guía: se le
      // deja descargar sin mandarle otro correo.
      if (campaign.tipo === "guia") return { ok: true as const, repetido: true };
      return {
        error:
          campaign.tipo === "lista_espera"
            ? "¡Ya estás en la lista! Te avisaremos a este correo en cuanto abra el registro."
            : "¡Ya estás registrado! Revisa tu correo (y la carpeta de spam) — ahí está tu regalo.",
      };
    }
    return { error: "No pudimos registrarte. Intenta de nuevo." };
  }

  // La encuesta no manda correo: la persona ya sabe que contestó.
  if (!esEncuesta) await sendGiftEmail(lead.id, campaign.slug, email, firstName);
  return { ok: true as const, repetido: false };
}
