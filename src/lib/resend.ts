import { Resend } from "resend";

/**
 * Reja de destinatarios para ambientes de prueba.
 *
 * `CORREOS_PERMITIDOS` es una lista separada por comas: entradas que empiezan
 * con "@" permiten el dominio completo, el resto son direcciones exactas.
 * Ej.: "@pataamiga.dev,ana@gmail.com". Sin la variable no hay filtro — así
 * corre producción.
 *
 * Por qué existe: la base de staging es copia de producción, con correos de
 * miembros REALES. Sin esta reja, cualquier prueba del equipo (un comunicado,
 * un boletín) podría escribirle a un miembro de verdad desde el ambiente de
 * pruebas.
 */
function destinatarioPermitido(destino: string): boolean {
  const lista = (process.env.CORREOS_PERMITIDOS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (lista.length === 0) return true;
  const dir = destino.toLowerCase();
  return lista.some((regla) =>
    regla.startsWith("@") ? dir.endsWith(regla) : dir === regla,
  );
}

export function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  const resend = new Resend(key);
  if (!process.env.CORREOS_PERMITIDOS) return resend;

  const enviarReal = resend.emails.send.bind(resend.emails);
  resend.emails.send = (async (
    payload: Parameters<typeof enviarReal>[0],
    options?: Parameters<typeof enviarReal>[1],
  ) => {
    const originales = Array.isArray(payload.to) ? payload.to : [payload.to];
    const permitidos = originales.filter(destinatarioPermitido);
    const bloqueados = originales.filter((d) => !destinatarioPermitido(d));
    if (bloqueados.length > 0) {
      console.warn(
        `[correo] destinatarios bloqueados por CORREOS_PERMITIDOS: ${bloqueados.join(", ")}`,
      );
    }
    if (permitidos.length === 0) {
      // El flujo que dispara el correo no debe fallar por la reja: se reporta
      // como enviado con un id reconocible y queda constancia en los logs.
      return { data: { id: "bloqueado-en-pruebas" }, error: null };
    }
    return enviarReal({ ...payload, to: permitidos }, options);
  }) as typeof resend.emails.send;
  return resend;
}

/** Until pataamiga.mx is verified in Resend, use the sandbox sender. */
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Club Pata Amiga <onboarding@resend.dev>";
