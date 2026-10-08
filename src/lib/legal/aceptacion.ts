import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/alerts";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * ACEPTACIÓN DE LOS LEGALES AL CONTRATAR (8-oct-2026).
 *
 * Hasta hoy el alta solo decía «Al continuar aceptas…»: sin casilla y sin
 * registro. `legal_acceptances` existía desde julio y nadie la escribía — en
 * producción tenía 0 filas con 87 socios pagando. Pesó en la primera disputa de
 * Stripe: no había cómo demostrar qué aceptó la persona ni cuándo.
 *
 * Ahora queda en DOS lugares, a propósito:
 * 1. Nuestra base: una fila por documento (versión vigente) cuando la persona
 *    marca la casilla y da clic en pagar, o cuando Stripe confirma que aceptó.
 * 2. Stripe: la casilla de términos del Checkout (`consent_collection`), que
 *    Stripe guarda en la sesión y presenta como evidencia en las disputas.
 *
 * Los socios anteriores NO se rellenan: no hay registro de que hayan aceptado y
 * no se inventa uno.
 */

/** Lo que acepta quien contrata la membresía. Se busca por slug. */
export const DOCUMENTOS_AL_CONTRATAR = [
  "terminos-y-condiciones",
  "reglamento-de-reintegros",
  "aviso-de-privacidad",
] as const;

/**
 * Registra que `userId` aceptó la versión vigente de cada documento. Si ya la
 * tenía aceptada no duplica. Nunca bloquea el pago: si falla, avisa al equipo.
 */
export async function registrarAceptacion(admin: Admin, userId: string): Promise<boolean> {
  try {
    const { data: docs, error } = await admin
      .from("legal_documents")
      .select("id, slug, version")
      .in("slug", [...DOCUMENTOS_AL_CONTRATAR])
      .eq("is_active", true);
    if (error) throw error;

    // La versión vigente de cada documento es la mayor que esté activa.
    const vigentes = new Map<string, { id: string; version: number }>();
    for (const d of docs ?? []) {
      const previa = vigentes.get(d.slug);
      if (!previa || d.version > previa.version) vigentes.set(d.slug, { id: d.id, version: d.version });
    }
    const ids = [...vigentes.values()].map((d) => d.id);
    if (!ids.length) throw new Error("No hay documentos legales activos para registrar la aceptación");

    const { data: previas } = await admin
      .from("legal_acceptances")
      .select("legal_document_id")
      .eq("user_id", userId)
      .in("legal_document_id", ids);
    const yaAceptados = new Set((previas ?? []).map((a) => a.legal_document_id));
    const faltan = ids.filter((id) => !yaAceptados.has(id));
    if (!faltan.length) return true;

    const ahora = new Date().toISOString();
    const { error: alGuardar } = await admin
      .from("legal_acceptances")
      .insert(faltan.map((id) => ({ user_id: userId, legal_document_id: id, accepted_at: ahora })));
    if (alGuardar) throw alGuardar;
    return true;
  } catch (e) {
    await reportError("aceptacion-legal", e, { userId });
    return false;
  }
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pataamiga.mx";

/**
 * Abre un Checkout con la casilla de términos de Stripe. Stripe exige que la
 * cuenta tenga la URL de términos en el panel (Configuración → Detalles
 * públicos); si falta, en vez de tumbar el pago se abre sin la casilla y se
 * avisa al equipo para que la configure. La aceptación en nuestra base no
 * depende de esto.
 */
export async function crearSesionConTerminos(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  try {
    return await stripe.checkout.sessions.create({
      ...params,
      consent_collection: { ...params.consent_collection, terms_of_service: "required" },
      custom_text: {
        ...params.custom_text,
        terms_of_service_acceptance: {
          message: `Acepto los [Términos y condiciones](${SITE_URL}/legales/terminos-y-condiciones) y el [Reglamento de reintegros](${SITE_URL}/legales/reglamento-de-reintegros) de Club Pata Amiga.`,
        },
      },
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    if (!/terms of service|terms_of_service/i.test(mensaje)) throw e;
    await reportError("checkout-terminos", e, {
      que_hacer:
        "Poner la URL de términos en Stripe → Configuración → Detalles públicos (https://www.pataamiga.mx/legales/terminos-y-condiciones). Mientras tanto el pago se abrió sin la casilla de Stripe; la aceptación sí quedó en la plataforma.",
    });
    return stripe.checkout.sessions.create(params);
  }
}
