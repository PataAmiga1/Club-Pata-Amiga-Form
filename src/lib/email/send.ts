import { createAdminClient } from "@/lib/supabase/admin";
import { getResend, EMAIL_FROM } from "@/lib/resend";
import { getTemplateDef, renderTemplate } from "./templates";

/**
 * Base de las ligas de los correos. El respaldo es el dominio de producción y
 * NO localhost a propósito: si la variable falta en un despliegue, un correo
 * con botones a `http://localhost:3000` es peor que uno sin botones. Mismo
 * criterio que el logo del encabezado (hallazgo 7-ago).
 */
const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pataamiga.mx";

/**
 * Envía un correo transaccional por su clave de plantilla. Si el comité
 * personalizó la plantilla en /admin/comunicados se usa esa versión; si no,
 * la versión por defecto en código. Nunca lanza: un correo fallido no debe
 * romper el flujo que lo dispara.
 */
export async function sendTemplatedEmail(
  key: string,
  to: string,
  vars: Record<string, string> = {},
): Promise<boolean> {
  const def = getTemplateDef(key);
  if (!def) {
    console.error(`email template desconocida: ${key}`);
    return false;
  }

  try {
    const admin = createAdminClient();
    const { data: override } = await admin
      .from("email_templates")
      .select("subject, html")
      .eq("key", key)
      .maybeSingle();

    // `siteUrl` va en TODOS los correos sin que nadie la pase: las plantillas
    // con destino fijo escriben {{siteUrl}}/app/cuenta y ya. Solo las que
    // necesitan un id —reintegro, perfil del peludo, lo apelado— reciben su
    // URL de quien manda el correo. Si quien llama la trae, gana la suya.
    const conSitio = { siteUrl: SITIO, ...vars };
    const subject = renderTemplate(override?.subject ?? def.subject, conSitio);
    const html = renderTemplate(override?.html ?? def.html, conSitio);

    const { error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });
    if (error) {
      console.error(`email "${key}" rejected`, error);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`email "${key}" failed`, e);
    return false;
  }
}
