import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email/send";
import { ALTAS_SON_599 } from "@/lib/plans/planes";
import { MEMBERSHIP_FEATURES, MEMBERSHIP_FEATURES_599 } from "@/lib/constants";
import { getCampaign, campaignCouponKey, campaignPdfSlot } from "@/lib/landings";
import { bloqueDeCodigoDeGuia } from "@/lib/landings-correo";

/*
 * Envío del correo de las landings de campaña. Vive aquí y NO en
 * `app/landings/[campaign]/actions.ts` a propósito: todo lo que exporta un
 * archivo "use server" es una Server Action que cualquiera puede invocar con
 * un POST y los argumentos que quiera. Con `sendGiftEmail` ahí, cualquiera
 * mandaba correos con nuestra marca, a cualquier dirección y con el texto que
 * quisiera en el nombre (19-sep-2026). Solo lo llaman `registerLead`, con el
 * correo y el nombre que acaba de validar y guardar, y el reenvío del CRM,
 * que carga el lead de la base y exige admin.
 */

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

/** Envía (o reenvía) el correo de regalo y actualiza el estatus del lead. */
export async function sendGiftEmail(
  leadId: string,
  slug: string,
  email: string,
  firstName: string,
) {
  const admin = createAdminClient();
  // El nombre lo escribió quien llenó el formulario: va escapado al cuerpo
  // para que no pueda meter ligas ni HTML en un correo con nuestra marca.
  const opciones = { escapar: ["firstName"] };
  // La lista de espera no lleva cupón ni PDF: solo confirma que quedó apuntada.
  // La guía lleva el PDF y, si la landing tiene uno, el código de promoción.
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
      ? await sendTemplatedEmail("lista_espera", email, { firstName }, opciones)
      : tipo === "guia"
        ? await sendTemplatedEmail(
            "campaign_guide",
            email,
            { ...comunes, ...(await buildGiftBlocks(slug)) },
            opciones,
          )
        : await sendTemplatedEmail(
            "campaign_gift",
            email,
            { ...comunes, ...(await buildGiftBlocks(slug)) },
            opciones,
          );
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
