import type { createAdminClient } from "@/lib/supabase/admin";
import { resolveContact, type IdentityKind } from "@/lib/crm/contacts";
import { splitFullName } from "@/lib/crm/normalize";
import { emitEvent } from "@/lib/crm/events";
import { ensureOpportunity } from "@/lib/crm/opportunities";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Lo que le pasa al CRM cuando alguien escribe por un canal, venga por el
 * webhook directo de Meta o por Flowly. Es el mismo comportamiento en los dos
 * caminos: contacto (creado o encontrado), evento `primer_mensaje` y
 * oportunidad en "Nuevo prospecto".
 */

/** El canal de Meta → el tipo de identidad con que se guarda en el CRM. */
export const IDENTIDAD_POR_CANAL: Record<string, "instagram" | "messenger" | "whatsapp"> = {
  instagram: "instagram",
  facebook: "messenger",
  messenger: "messenger",
  whatsapp: "whatsapp",
};

/** Atribución de anuncio en la forma en que se guarda (ver flowly/mapeo.ts). */
export type AnuncioGuardado = {
  headline: string | null;
  ad_id: string | null;
  ctwa_clid: string | null;
  source_url: string | null;
  [k: string]: unknown;
};

/**
 * Liga la conversación con su contacto del CRM (creándolo si hace falta) y le
 * abre su oportunidad en "Nuevo prospecto".
 *
 * Nunca lanza: si el CRM falla, la conversación y la respuesta de la IA siguen
 * su curso. Perder una respuesta a un cliente por un problema de bitácora sería
 * peor que perder la bitácora.
 */
export async function vincularContactoDeConversacion(
  admin: Admin,
  datos: {
    conversationId: string;
    channel: string;
    externalUserId: string;
    displayName: string | null;
    texto: string;
    /** Identidad explícita (Flowly). Por omisión: canal + externalUserId. */
    identidad?: { kind: IdentityKind; value: string };
    /** Fuente del contacto/oportunidad. Por omisión, el canal. */
    fuente?: string;
    /** Si llegó por anuncio, queda en el contacto y en la oportunidad. */
    anuncio?: AnuncioGuardado | null;
  },
): Promise<{ contactId: string | null }> {
  try {
    let identidad = datos.identidad;
    if (!identidad) {
      const kind = IDENTIDAD_POR_CANAL[datos.channel];
      if (!kind) return { contactId: null };
      identidad = { kind, value: datos.externalUserId };
    }
    const fuente = datos.fuente ?? datos.channel;

    const { firstName, lastName } = splitFullName(datos.displayName);
    const { contactId } = await resolveContact(admin, {
      identities: { [identidad.kind]: identidad.value },
      firstName,
      lastName,
      source: fuente,
      contactType: "lead",
      actorLabel: "Mensaje entrante",
    });

    await admin
      .from("channel_conversations")
      .update({ contact_id: contactId })
      .eq("id", datos.conversationId);

    await emitEvent(admin, {
      contactId,
      kind: "primer_mensaje",
      summary: `Primer mensaje por ${datos.channel}: "${datos.texto.slice(0, 120)}"`,
      payload: { conversationId: datos.conversationId },
      actorLabel: "Mensaje entrante",
    });

    const { opportunityId } = await ensureOpportunity(admin, {
      contactId,
      stageKey: "nuevo_prospecto",
      source: fuente,
      actorLabel: "Mensaje entrante",
    });

    if (datos.anuncio)
      await registrarAtribucion(admin, {
        conversationId: datos.conversationId,
        contactId,
        opportunityId,
        fuente,
        anuncio: datos.anuncio,
      });

    return { contactId };
  } catch (err) {
    console.error("[crm] no se pudo ligar la conversación con el contacto", err);
    return { contactId: null };
  }
}

/**
 * Deja constancia de que la persona llegó por un anuncio: en la conversación
 * (primer toque), en el contacto y en su oportunidad (custom_fields.anuncio y
 * la fuente, si estaba vacía), y como nota en su línea de tiempo.
 *
 * Nunca pisa una atribución anterior: el primer anuncio es el que la trajo.
 * Nunca lanza.
 */
export async function registrarAtribucion(
  admin: Admin,
  input: {
    conversationId: string;
    contactId: string | null;
    opportunityId?: string | null;
    fuente: string;
    anuncio: AnuncioGuardado;
  },
): Promise<void> {
  try {
    await admin
      .from("channel_conversations")
      .update({ ad_referral: input.anuncio })
      .eq("id", input.conversationId)
      .is("ad_referral", null);

    if (!input.contactId) return;

    const { data: contacto } = await admin
      .from("contacts")
      .select("source, custom_fields")
      .eq("id", input.contactId)
      .maybeSingle();
    const camposContacto = (contacto?.custom_fields ?? {}) as Record<string, unknown>;
    if (contacto && !camposContacto.anuncio)
      await admin
        .from("contacts")
        .update({
          custom_fields: { ...camposContacto, anuncio: input.anuncio },
          ...(contacto.source ? {} : { source: input.fuente }),
        })
        .eq("id", input.contactId);

    let opportunityId = input.opportunityId ?? null;
    if (!opportunityId) {
      const { data: op } = await admin
        .from("opportunities")
        .select("id")
        .eq("contact_id", input.contactId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      opportunityId = op?.id ?? null;
    }
    if (opportunityId) {
      const { data: op } = await admin
        .from("opportunities")
        .select("source, custom_fields")
        .eq("id", opportunityId)
        .maybeSingle();
      const camposOp = (op?.custom_fields ?? {}) as Record<string, unknown>;
      if (op && !camposOp.anuncio)
        await admin
          .from("opportunities")
          .update({
            custom_fields: { ...camposOp, anuncio: input.anuncio },
            // La fuente de una oportunidad recién abierta por el mensaje es el
            // canal; si llegó por anuncio, el anuncio es la fuente buena.
            ...(!op.source || ["whatsapp", "instagram", "facebook", "messenger"].includes(op.source)
              ? { source: input.fuente }
              : {}),
          })
          .eq("id", opportunityId);
    }

    if (!camposContacto.anuncio)
      await emitEvent(admin, {
        contactId: input.contactId,
        kind: "nota",
        summary: `Llegó por anuncio${input.anuncio.headline ? `: «${String(input.anuncio.headline).slice(0, 120)}»` : ""}`,
        payload: {
          conversationId: input.conversationId,
          adId: input.anuncio.ad_id,
          ctwaClid: input.anuncio.ctwa_clid,
        },
        actorLabel: "Mensaje entrante",
      });
  } catch (err) {
    console.error("[crm] no se pudo registrar la atribución del anuncio", err);
  }
}
