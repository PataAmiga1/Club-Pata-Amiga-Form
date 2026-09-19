import type { createAdminClient } from "@/lib/supabase/admin";
import { buscarPromocion, limpiarCodigo } from "@/lib/plans/codigos";
import { describirPromocion } from "@/lib/plans/promocion-texto";
import { versionVigente } from "@/lib/plans/versiones";
import { PLAN_DE_ALTAS } from "@/lib/plans/planes";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * El código de promoción dentro del correo de una landing de guía (ExpoCan,
 * 19-sep-2026). Dice qué hace, hasta cuándo vale y dónde se escribe. La frase
 * sale de `describirPromocion`, la misma que ve la persona en la página del
 * plan. Si Stripe no responde, el correo sale igual, con la palabra sola: un
 * correo nunca se detiene por esto.
 */
export async function bloqueDeCodigoDeGuia(admin: Admin, palabra: string): Promise<string> {
  const codigo = limpiarCodigo(palabra);
  let frase = "";
  let vence = "";
  try {
    const [promo, mensual] = await Promise.all([
      buscarPromocion(codigo),
      versionVigente(admin, "month", PLAN_DE_ALTAS),
    ]);
    if (promo) {
      const texto = describirPromocion(
        promo.promocion,
        mensual?.price_cents ? { centavos: mensual.price_cents, intervalo: "month" } : undefined,
      );
      frase = `${texto.charAt(0).toUpperCase()}${texto.slice(1)} en la membresía mensual.`;
      if (promo.vence)
        vence = `Válido hasta el ${new Intl.DateTimeFormat("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "America/Mexico_City",
        }).format(new Date(promo.vence * 1000))}.`;
    }
  } catch (e) {
    console.error("[correo guía] no se pudo describir la promoción", e);
  }

  return `<div style="background:#FDF9EF;border:2px dashed #1CBCAD;border-radius:14px;padding:18px 16px;text-align:center;margin:8px 0 14px">
<span style="font-size:12px;color:#6B7C79;letter-spacing:.08em">TU CÓDIGO DE PROMOCIÓN</span><br>
<span style="font-size:28px;font-weight:800;color:#1E5350;letter-spacing:.06em">${codigo}</span>
${frase ? `<p style="margin:8px 0 0;font-size:15px;font-weight:700;color:#1E5350">${frase}</p>` : ""}
${vence ? `<p style="margin:4px 0 0;font-size:13px;color:#6B7C79">${vence}</p>` : ""}
<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#3D524F">Escríbelo en <strong>«¿Tienes un código?»</strong> al elegir tu plan.</p>
</div>`;
}
