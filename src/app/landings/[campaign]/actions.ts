"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email/send";
import { ALTAS_SON_599 } from "@/lib/plans/planes";
import { MEMBERSHIP_FEATURES, MEMBERSHIP_FEATURES_599 } from "@/lib/constants";
import {
  getCampaign,
  campaignCouponKey,
  campaignPdfSlot,
  EDAD_MINIMA_LANDING,
} from "@/lib/landings";
import { bloqueDeCodigoDeGuia } from "@/lib/landings-correo";

export type LeadInput = {
  campaign: string;
  firstName: string;
  lastName: string;
  /** Edad de la persona, solo en landings que la preguntan (ExpoCan). */
  age?: string;
  email: string;
  phone: string;
  consent: boolean;
  utm?: { source?: string; medium?: string; campaign?: string };
  /** Código de embajador con el que llegó (link ?codigo=…), si lo trae. */
  ambassadorCode?: string;
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Arma los bloques del correo de regalo según lo que el equipo ya cargó en
 * Admin → Landings. Si el cupón o el PDF aún no existen, el correo lo dice
 * con gracia en lugar de mostrar huecos.
 */
async function buildGiftBlocks(slug: string) {
  const pdfLabel = getCampaign(slug)?.pdfLabel ?? "📘 Descargar tu guía de cuidado";
  const admin = createAdminClient();
  const [{ data: couponRow }, { data: pdfRow }] = await Promise.all([
    admin
      .from("site_settings")
      .select("value")
      .eq("key", campaignCouponKey(slug))
      .maybeSingle(),
    admin
      .from("site_assets")
      .select("url")
      .eq("slot", campaignPdfSlot(slug))
      .maybeSingle(),
  ]);

  const coupon = couponRow?.value?.trim();
  // Una landing de guía nunca prometió cupón: sin código configurado el
  // bloque va vacío, no «por activarse». Con código, dice qué hace y dónde
  // se escribe (EXPOCAN, 19-sep-2026).
  const couponBlock =
    getCampaign(slug)?.tipo === "guia"
      ? coupon
        ? await bloqueDeCodigoDeGuia(admin, coupon)
        : ""
      : coupon
    ? `<div style="background:#FDF9EF;border:2px dashed #1CBCAD;border-radius:14px;padding:16px;text-align:center;margin:8px 0"><span style="font-size:12px;color:#6B7C79;letter-spacing:.08em">TU CUPÓN DE DESCUENTO</span><br><span style="font-size:26px;font-weight:800;color:#1E5350;letter-spacing:.06em">${coupon}</span></div>`
    : `<div style="background:#FDF9EF;border-radius:14px;padding:14px;text-align:center;margin:8px 0;color:#6B7C79;font-size:14px">Tu cupón de descuento está por activarse — te lo enviaremos a este mismo correo muy pronto. 🐾</div>`;

  const pdfBlock = pdfRow?.url
    ? `<p style="text-align:center;margin:16px 0"><a href="${pdfRow.url}" style="background:#1CBCAD;color:#ffffff;padding:14px 28px;border-radius:999px;font-weight:700;text-decoration:none;display:inline-block">${pdfLabel}</a></p>`
    : `<p style="text-align:center;color:#6B7C79;font-size:14px;margin:12px 0">📘 Tu guía de cuidado llegará a este correo en los próximos días.</p>`;

  return { couponBlock, pdfBlock };
}

/** Registra un lead de campaña y dispara el correo "obtén tu regalo". */
export async function registerLead(input: LeadInput) {
  const campaign = getCampaign(input.campaign);
  if (!campaign || !campaign.active)
    return { error: "Esta campaña ya no está activa." };

  const pideApellidos = campaign.campos?.apellidos !== false;
  const pideEdad = campaign.campos?.edad === true;
  const firstName = input.firstName?.trim();
  // Sin apellidos en el formulario la columna queda vacía (es NOT NULL).
  const lastName = pideApellidos ? input.lastName?.trim() : "";
  const age = pideEdad ? Number(input.age) : null;
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();

  if (!firstName || (pideApellidos && !lastName))
    return {
      error: pideApellidos ? "Escribe tu nombre y apellidos." : "Escribe tu nombre.",
    };
  if (pideEdad) {
    if (!Number.isInteger(age) || age === null || age < 1 || age > 110)
      return { error: "Escribe tu edad en años." };
    if (age < EDAD_MINIMA_LANDING)
      return {
        error:
          "Para registrarte necesitas ser mayor de edad. Pídele a un adulto que deje sus datos.",
      };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? ""))
    return { error: "Revisa tu correo electrónico." };
  if (!phone || phone.replace(/\D/g, "").length < 10)
    return { error: "Escribe un teléfono válido (10 dígitos)." };
  if (!input.consent)
    return {
      error:
        campaign.tipo === "lista_espera"
          ? "Necesitamos tu consentimiento para avisarte."
          : campaign.tipo === "guia"
            ? "Necesitamos tu consentimiento para enviarte la guía."
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
      email,
      phone,
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

  await sendGiftEmail(lead.id, campaign.slug, email, firstName);
  return { ok: true as const, repetido: false };
}

/** Envía (o reenvía) el correo de regalo y actualiza el estatus del lead. */
export async function sendGiftEmail(
  leadId: string,
  slug: string,
  email: string,
  firstName: string,
) {
  const admin = createAdminClient();
  // La lista de espera no lleva cupón ni PDF: solo confirma que quedó apuntada.
  // La guía lleva el PDF sin cupón.
  const tipo = getCampaign(slug)?.tipo;
  const comunes = {
    firstName,
    registroUrl: `${SITE_URL}/registro`,
    terceraCaracteristica: ALTAS_SON_599
      ? MEMBERSHIP_FEATURES_599[2]
      : MEMBERSHIP_FEATURES[2],
  };
  const sent =
    tipo === "lista_espera"
      ? await sendTemplatedEmail("lista_espera", email, { firstName })
      : tipo === "guia"
        ? await sendTemplatedEmail("campaign_guide", email, {
            ...comunes,
            ...(await buildGiftBlocks(slug)),
          })
        : await sendTemplatedEmail("campaign_gift", email, {
            ...comunes,
            ...(await buildGiftBlocks(slug)),
          });
  await admin
    .from("campaign_leads")
    .update(
      sent
        ? {
            gift_email_status: "sent",
            gift_email_sent_at: new Date().toISOString(),
          }
        : { gift_email_status: "failed" },
    )
    .eq("id", leadId);
  return sent;
}
