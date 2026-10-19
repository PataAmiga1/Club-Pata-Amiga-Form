import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma de los webhooks de Flowly (contrato §11.2).
 *
 * Encabezado `Flowly-Signature: t=<segundos unix>,v1=<hex>`, donde v1 es el
 * HMAC-SHA256 de `"<t>.<cuerpo crudo>"` con el secreto del webhook (whsec_…).
 * Se verifica contra los BYTES recibidos, nunca contra un JSON re-serializado,
 * y se rechaza un `t` a más de 5 minutos de nuestro reloj.
 *
 * Sin dependencias de la app a propósito: así se prueba suelto con node --test.
 */

export const TOLERANCIA_FIRMA_SEG = 300;

/** true solo si alguna v1 es el HMAC exacto del cuerpo y `t` está en tolerancia. */
export function verificarFirmaFlowly(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  toleranciaSeg = TOLERANCIA_FIRMA_SEG,
  ahoraSeg = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret) return false;
  let t: number | null = null;
  const firmas: string[] = [];
  for (const parte of String(header ?? "").split(",")) {
    const eq = parte.indexOf("=");
    if (eq < 0) continue;
    const k = parte.slice(0, eq).trim();
    const v = parte.slice(eq + 1).trim();
    if (k === "t" && /^\d+$/.test(v)) t = Number(v);
    else if (k === "v1" && /^[0-9a-f]{64}$/i.test(v)) firmas.push(v.toLowerCase());
  }
  if (t === null || firmas.length === 0) return false;
  if (Math.abs(ahoraSeg - t) > toleranciaSeg) return false;

  const esperada = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return firmas.some((f) => {
    const dada = Buffer.from(f, "hex");
    return dada.length === esperada.length && timingSafeEqual(dada, esperada);
  });
}

/** Firma un cuerpo como lo haría Flowly. Solo para pruebas y diagnóstico local. */
export function firmarComoFlowly(rawBody: string, secret: string, tSeg: number): string {
  const v1 = createHmac("sha256", secret).update(`${tSeg}.${rawBody}`).digest("hex");
  return `t=${tSeg},v1=${v1}`;
}

export type VeredictoFirma = "ok" | "ok_sin_verificar" | "sin_secreto" | "invalida";

/**
 * Decide si se acepta una entrega. FALLA CERRADO: sin secreto configurado se
 * rechaza, salvo que alguien lo pida explícitamente para desarrollo local
 * (FLOWLY_WEBHOOK_SIN_FIRMA=1) y NO estemos en producción.
 *
 * Acepta varios secretos para rotar sin perder entregas (§11.6): el nuevo y,
 * unos minutos, el anterior.
 */
export function decidirFirma(input: {
  rawBody: string;
  header: string | null | undefined;
  secretos: (string | null | undefined)[];
  permitirSinFirma: boolean;
  entorno: string | undefined;
  ahoraSeg?: number;
}): VeredictoFirma {
  const secretos = input.secretos.filter((s): s is string => Boolean(s && s.trim()));
  if (secretos.length === 0) {
    if (input.permitirSinFirma && input.entorno !== "production") return "ok_sin_verificar";
    return "sin_secreto";
  }
  const valida = secretos.some((s) =>
    verificarFirmaFlowly(
      input.rawBody,
      input.header,
      s.trim(),
      TOLERANCIA_FIRMA_SEG,
      input.ahoraSeg ?? Math.floor(Date.now() / 1000),
    ),
  );
  return valida ? "ok" : "invalida";
}
