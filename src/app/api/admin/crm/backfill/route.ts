import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveContact, type ContactType } from "@/lib/crm/contacts";
import { ensureOpportunity, type StageKey } from "@/lib/crm/opportunities";

/**
 * Relleno inicial del CRM desde las 5 fuentes que ya existen en la plataforma.
 *
 * Vive aquí y no en una migración SQL a propósito: usa EXACTAMENTE la misma
 * lógica de resolución (`resolveContact`) que los webhooks de canales y la
 * importación de CSV. Tener una segunda implementación en SQL es lo que produce
 * contactos distintos según por dónde entró la persona.
 *
 * Es idempotente: correrlo dos veces no duplica a nadie, porque
 * `contact_identities` tiene `unique (kind, value)` y `ensureOpportunity` no
 * crea una segunda oportunidad abierta.
 *
 * Orden de precedencia (el primero gana al completar datos):
 *   profiles → ambassadors → wellness_centers → campaign_leads → conversaciones
 *
 * Autorización: super admin con sesión, o `x-cron-secret` para correrlo sin
 * navegador (útil en el cutover a producción).
 */

/** El canal de la conversación → tipo de identidad del contacto. */
const CHANNEL_IDENTITY: Record<string, "instagram" | "messenger" | "whatsapp" | "portal"> = {
  instagram: "instagram",
  facebook: "messenger",
  messenger: "messenger",
  whatsapp: "whatsapp",
  portal: "portal",
  vet: "portal",
};

/** Estado de membresía → etapa del pipeline. Así se llenan solas las etapas
 *  que hoy están en cero en LynSales. */
const MEMBERSHIP_STAGE: Record<string, StageKey> = {
  active: "miembro_activo",
  past_due: "miembro_inactivo",
  canceled: "miembro_inactivo",
  pending_payment: "registro_iniciado",
};

async function autorizado(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") === secret) return true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "super_admin";
}

export async function POST(request: Request) {
  if (!(await autorizado(request)))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const admin = createAdminClient();
  const resumen = {
    perfiles: { revisados: 0, creados: 0, oportunidades: 0 },
    embajadores: { revisados: 0, creados: 0 },
    centros: { revisados: 0, creados: 0 },
    leads: { revisados: 0, creados: 0, oportunidades: 0 },
    conversaciones: { revisados: 0, creados: 0, oportunidades: 0 },
    posiblesDuplicados: 0,
    errores: [] as string[],
  };

  const fallo = (donde: string, err: unknown) => {
    const mensaje = err instanceof Error ? err.message : String(err);
    resumen.errores.push(`${donde}: ${mensaje}`);
  };

  // 1. Miembros (y cuentas creadas sin pagar) ------------------------------
  const { data: profiles } = await admin
    .from("profiles")
    .select(
      "id, email, first_name, last_name, phone, birth_date, city, state, membership_status, utm_source, created_at",
    )
    .eq("role", "member")
    .order("created_at", { ascending: true });

  for (const p of profiles ?? []) {
    resumen.perfiles.revisados += 1;
    try {
      const esMiembro = p.membership_status === "active";
      const { contactId, created, possibleDuplicate } = await resolveContact(admin, {
        identities: { email: p.email, phone: p.phone, portal: p.id },
        firstName: p.first_name,
        lastName: p.last_name,
        birthDate: p.birth_date,
        city: p.city,
        state: p.state,
        source: p.utm_source ?? "registro",
        contactType: (esMiembro ? "miembro" : "lead") as ContactType,
        links: { profileId: p.id },
        actorLabel: "Relleno inicial",
      });
      if (created) resumen.perfiles.creados += 1;
      if (possibleDuplicate) resumen.posiblesDuplicados += 1;

      const stageKey = MEMBERSHIP_STAGE[p.membership_status ?? ""] ?? "registro_iniciado";
      const { created: oppCreated } = await ensureOpportunity(admin, {
        contactId,
        stageKey,
        source: p.utm_source ?? "registro",
        actorLabel: "Relleno inicial",
      });
      if (oppCreated) resumen.perfiles.oportunidades += 1;
    } catch (err) {
      fallo(`perfil ${p.email ?? p.id}`, err);
    }
  }

  // 2. Embajadores ---------------------------------------------------------
  const { data: ambassadors } = await admin
    .from("ambassadors")
    .select("id, user_id, first_name, last_name, email, phone, city, state, created_at")
    .order("created_at", { ascending: true });

  for (const a of ambassadors ?? []) {
    resumen.embajadores.revisados += 1;
    try {
      const { created, possibleDuplicate } = await resolveContact(admin, {
        identities: { email: a.email, phone: a.phone, portal: a.user_id },
        firstName: a.first_name,
        lastName: a.last_name,
        city: a.city,
        state: a.state,
        source: "embajador",
        contactType: "embajador",
        links: { ambassadorId: a.id, profileId: a.user_id },
        actorLabel: "Relleno inicial",
      });
      if (created) resumen.embajadores.creados += 1;
      if (possibleDuplicate) resumen.posiblesDuplicados += 1;
    } catch (err) {
      fallo(`embajador ${a.email ?? a.id}`, err);
    }
  }

  // 3. Centros aliados -----------------------------------------------------
  const { data: centers } = await admin
    .from("wellness_centers")
    .select("id, user_id, name, contact_name, email, phone, created_at")
    .order("created_at", { ascending: true });

  for (const c of centers ?? []) {
    resumen.centros.revisados += 1;
    try {
      const { created, possibleDuplicate } = await resolveContact(admin, {
        identities: { email: c.email, phone: c.phone, portal: c.user_id },
        // El contacto es la PERSONA del centro; el nombre del negocio queda en
        // el vínculo con wellness_centers.
        firstName: c.contact_name ?? c.name,
        source: "centro aliado",
        contactType: "centro",
        links: { centerId: c.id, profileId: c.user_id },
        actorLabel: "Relleno inicial",
      });
      if (created) resumen.centros.creados += 1;
      if (possibleDuplicate) resumen.posiblesDuplicados += 1;
    } catch (err) {
      fallo(`centro ${c.email ?? c.id}`, err);
    }
  }

  // 4. Leads de campañas ---------------------------------------------------
  const { data: leads } = await admin
    .from("campaign_leads")
    .select("id, campaign, first_name, last_name, email, phone, utm_source, created_at")
    .order("created_at", { ascending: true });

  for (const l of leads ?? []) {
    resumen.leads.revisados += 1;
    // Las encuestas por DM se contestan solo con su @: sin correo ni teléfono
    // no hay identidad que ligar en el CRM, y `resolveContact` truena.
    if (!l.email && !l.phone) continue;
    try {
      const { contactId, created, possibleDuplicate } = await resolveContact(admin, {
        identities: { email: l.email, phone: l.phone },
        firstName: l.first_name,
        lastName: l.last_name,
        source: l.utm_source ?? `landing-${l.campaign}`,
        contactType: "lead",
        links: { campaignLeadId: l.id },
        actorLabel: "Relleno inicial",
      });
      if (created) resumen.leads.creados += 1;
      if (possibleDuplicate) resumen.posiblesDuplicados += 1;

      const { created: oppCreated } = await ensureOpportunity(admin, {
        contactId,
        stageKey: "nuevo_prospecto",
        source: l.utm_source ?? `landing-${l.campaign}`,
        actorLabel: "Relleno inicial",
      });
      if (oppCreated) resumen.leads.oportunidades += 1;
    } catch (err) {
      fallo(`lead ${l.email ?? l.id}`, err);
    }
  }

  // 5. Conversaciones de canales ------------------------------------------
  // Suelen llegar sin correo: se crean con su identidad de canal y el nombre
  // que da Meta. Cuando esa persona después deja su correo o se registra, las
  // reglas de resolución la unen con lo que ya existía.
  const { data: conversations } = await admin
    .from("channel_conversations")
    .select("id, channel, external_user_id, display_name, profile_id, pipeline_stage, created_at")
    .order("created_at", { ascending: true });

  for (const conv of conversations ?? []) {
    resumen.conversaciones.revisados += 1;
    try {
      const kind = CHANNEL_IDENTITY[conv.channel];
      if (!kind) {
        fallo(`conversación ${conv.id}`, `canal desconocido: ${conv.channel}`);
        continue;
      }
      const [firstName, ...rest] = (conv.display_name ?? "").trim().split(/\s+/);
      const { contactId, created, possibleDuplicate } = await resolveContact(admin, {
        identities: {
          [kind]: conv.external_user_id,
          portal: conv.profile_id ?? undefined,
        },
        firstName: firstName || null,
        lastName: rest.length > 0 ? rest.join(" ") : null,
        source: conv.channel,
        contactType: "lead",
        links: { profileId: conv.profile_id },
        actorLabel: "Relleno inicial",
      });
      if (created) resumen.conversaciones.creados += 1;
      if (possibleDuplicate) resumen.posiblesDuplicados += 1;

      // Liga la conversación con su contacto (columna que agrega la fase 2;
      // si todavía no existe, no pasa nada).
      await admin
        .from("channel_conversations")
        .update({ contact_id: contactId })
        .eq("id", conv.id);

      // Mapeo conservador de las 5 etapas viejas a las 8 nuevas: solo se
      // traduce lo que no admite duda.
      const stageKey: StageKey | null =
        conv.pipeline_stage === "descartado"
          ? "perdido"
          : conv.pipeline_stage === "soporte"
            ? null // soporte no es una venta
            : conv.pipeline_stage === "convertido"
              ? null // el paso 1 ya lo puso en la etapa que le toca
              : "nuevo_prospecto";
      if (stageKey) {
        const { created: oppCreated } = await ensureOpportunity(admin, {
          contactId,
          stageKey,
          source: conv.channel,
          actorLabel: "Relleno inicial",
        });
        if (oppCreated) resumen.conversaciones.oportunidades += 1;
      }
    } catch (err) {
      fallo(`conversación ${conv.id}`, err);
    }
  }

  const { count: contactos } = await admin
    .from("contacts")
    .select("id", { count: "exact", head: true });
  const { count: oportunidades } = await admin
    .from("opportunities")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    ok: resumen.errores.length === 0,
    resumen,
    totales: { contactos, oportunidades },
  });
}
