import type { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/crm/events";
import {
  nameKey,
  normalizeChannelId,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "@/lib/crm/normalize";

type Admin = ReturnType<typeof createAdminClient>;

export type IdentityKind =
  | "email"
  | "phone"
  | "instagram"
  | "messenger"
  | "whatsapp"
  | "portal";

export type ContactType = "lead" | "miembro" | "embajador" | "centro" | "otro";

/**
 * Identidades FUERTES: pertenecen a una sola persona, así que coincidir en una
 * de ellas basta para decir "es la misma" y unir sin preguntar.
 *
 * El teléfono NO está aquí, y eso salió de correr el relleno inicial con datos
 * reales: dos cuentas distintas (asahiprueba@ y asahizv@) se unieron en un solo
 * contacto por compartir teléfono, y un centro aliado se mezcló con un lead por
 * lo mismo. Un teléfono se comparte —familia, negocio, recepción— y unir dos
 * clientes distintos es peor que tener dos registros del mismo.
 */
const STRONG_KINDS: IdentityKind[] = [
  "email",
  "portal",
  "instagram",
  "messenger",
  "whatsapp",
];

/** Precedencia del tipo de contacto: solo sube, nunca baja. */
const TYPE_RANK: Record<ContactType, number> = {
  otro: 0,
  lead: 1,
  centro: 2,
  embajador: 3,
  miembro: 4,
};

export type ResolveContactInput = {
  /** Formas de alcanzar a la persona. Se normalizan aquí. */
  identities: Partial<Record<IdentityKind, string | null | undefined>>;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  city?: string | null;
  state?: string | null;
  source?: string | null;
  contactType?: ContactType;
  /**
   * Cuándo llegó realmente esta persona, si no es ahora. Solo lo usa la
   * importación del histórico: sin esto, traer el CRM anterior haría que el
   * tablero reportara cientos de prospectos nuevos el día de la importación y
   * dejara los meses anteriores en cero.
   *
   * SOLO aplica al crear. A un contacto que ya existe no se le mueve la fecha
   * de alta: la nuestra es la buena, y reescribirla cambiaría números ya
   * reportados.
   */
  createdAt?: string | null;
  lastActivityAt?: string | null;
  /** Vínculos con la plataforma; se escriben solo si están vacíos. */
  links?: {
    profileId?: string | null;
    campaignLeadId?: string | null;
    ambassadorId?: string | null;
    centerId?: string | null;
  };
  /** Para la actividad "contacto_creado". */
  actorId?: string | null;
  actorLabel?: string | null;
};

export type ResolveResult = {
  contactId: string;
  created: boolean;
  /** Más de un contacto existente coincidió: quedó marcado para revisión. */
  possibleDuplicate: boolean;
};

/**
 * La única identidad que traía el registro es un teléfono que ya pertenece a
 * OTRO contacto, y el nombre no coincide. Crear el contacto igual produciría una
 * perfil sin forma de alcanzar a la persona —y que nunca volvería a empatar, así
 * que cada reimportación crearía otra— así que mejor no se crea y lo resuelve
 * alguien. Lo detectó la importación de prueba de la fase 1e.
 */
export class SinIdentidadPropiaError extends Error {
  readonly otroContacto: string;
  constructor(otroContacto: string) {
    super(
      "El único dato de contacto es un teléfono que ya pertenece a otra persona",
    );
    this.name = "SinIdentidadPropiaError";
    this.otroContacto = otroContacto;
  }
}

/**
 * Normaliza las identidades que llegan y las devuelve como pares.
 *
 * Detalle que importa: el id de WhatsApp de Meta ES un número telefónico. Si
 * llega uno, se guarda también como identidad `phone`, y así la persona que
 * escribió por WhatsApp y después dejó su teléfono en una landing resulta ser
 * un solo contacto en lugar de dos.
 */
function buildIdentities(
  input: ResolveContactInput["identities"],
): { kind: IdentityKind; value: string }[] {
  const pairs: { kind: IdentityKind; value: string }[] = [];
  const push = (kind: IdentityKind, value: string | null) => {
    if (value && !pairs.some((p) => p.kind === kind && p.value === value))
      pairs.push({ kind, value });
  };

  push("email", normalizeEmail(input.email));
  push("phone", normalizePhone(input.phone));
  push("instagram", normalizeChannelId(input.instagram));
  push("messenger", normalizeChannelId(input.messenger));
  push("portal", normalizeChannelId(input.portal));

  const whatsapp = normalizeChannelId(input.whatsapp);
  if (whatsapp) {
    push("whatsapp", whatsapp);
    push("phone", normalizePhone(whatsapp)); // el id de WhatsApp es el teléfono
  }

  return pairs;
}

/**
 * Encuentra o crea el contacto de una persona. Es la ÚNICA puerta de entrada:
 * la usan los webhooks de canales, la importación de CSV y el relleno inicial.
 * Tener dos implementaciones es lo que produce contactos distintos según por
 * dónde llegó la persona.
 */
export async function resolveContact(
  admin: Admin,
  input: ResolveContactInput,
): Promise<ResolveResult> {
  const identities = buildIdentities(input.identities);
  if (identities.length === 0)
    throw new Error("resolveContact necesita al menos una identidad");

  // 1. ¿Alguna de estas identidades ya existe?
  const { data: existing } = await admin
    .from("contact_identities")
    .select("contact_id, kind, value")
    .in(
      "value",
      identities.map((i) => i.value),
    );

  const matched = (existing ?? []).filter((row) =>
    identities.some((i) => i.kind === row.kind && i.value === row.value),
  );

  // Coincidencias por identidad fuerte (unen solas) y por teléfono (no unen por
  // sí solas: hacen falta indicios más).
  const strongIds = [
    ...new Set(
      matched
        .filter((m) => STRONG_KINDS.includes(m.kind as IdentityKind))
        .map((m) => m.contact_id),
    ),
  ];
  const phoneIds = [
    ...new Set(
      matched.filter((m) => m.kind === "phone").map((m) => m.contact_id),
    ),
  ].filter((id) => !strongIds.includes(id));

  let contactIds = strongIds;

  // Solo coincide el teléfono: se acepta la unión únicamente si el nombre
  // también coincide. Nombres vacíos no cuentan como indicio (dos contactos sin
  // nombre no son "la misma persona").
  const soloTelefono = strongIds.length === 0 && phoneIds.length > 0;
  let telefonoAjeno: string | null = null;
  if (soloTelefono) {
    const clave = nameKey(input.firstName, input.lastName);
    if (clave) {
      const { data: candidatos } = await admin
        .from("contacts")
        .select("id, first_name, last_name")
        .in("id", phoneIds);
      const igual = (candidatos ?? []).find(
        (c) => nameKey(c.first_name, c.last_name) === clave,
      );
      if (igual) contactIds = [igual.id];
    }
    if (contactIds.length === 0) {
      // No se une: el teléfono se queda con quien lo tenía (el `unique` de la
      // tabla lo impide de todos modos) y se deja constancia en ambos lados.
      telefonoAjeno = phoneIds[0];
    }
  }

  // 2. Sin coincidencias → contacto nuevo
  if (contactIds.length === 0) {
    // El teléfono ajeno no se puede adjuntar (y el `unique` lo impediría). Si era
    // la ÚNICA identidad, no se crea un perfil inalcanzable: se avisa para que lo
    // resuelva una persona.
    const tomados = new Set(
      matched.filter((m) => m.kind === "phone").map((m) => m.value),
    );
    const propias = identities.filter(
      (i) => !(i.kind === "phone" && tomados.has(i.value)),
    );
    if (propias.length === 0) throw new SinIdentidadPropiaError(telefonoAjeno!);

    const { data: created, error } = await admin
      .from("contacts")
      .insert({
        first_name: normalizeName(input.firstName),
        last_name: normalizeName(input.lastName),
        birth_date: input.birthDate ?? null,
        city: normalizeName(input.city),
        state: normalizeName(input.state),
        source: input.source ?? null,
        contact_type: input.contactType ?? "lead",
        profile_id: input.links?.profileId ?? null,
        campaign_lead_id: input.links?.campaignLeadId ?? null,
        ambassador_id: input.links?.ambassadorId ?? null,
        center_id: input.links?.centerId ?? null,
        // `created_at` tiene default now(): solo se manda cuando el histórico
        // trae una fecha real, para no escribir "ahora" dos veces.
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
        last_activity_at: input.lastActivityAt ?? new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !created)
      throw new Error(`No se pudo crear el contacto: ${error?.message}`);

    await admin.from("contact_identities").insert(
      propias.map((i, index) => ({
        contact_id: created.id,
        kind: i.kind,
        value: i.value,
        is_primary: index === 0,
      })),
    );

    await emitEvent(admin, {
      contactId: created.id,
      kind: "contacto_creado",
      summary: `Contacto creado desde ${input.source ?? "la plataforma"}`,
      payload: { identities: propias },
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? "Sistema",
    });

    // Comparten teléfono pero nada más: se avisa en los dos lados para que una
    // persona decida si son la misma o no. Nunca se unen solos.
    if (telefonoAjeno) {
      const aviso = {
        kind: "contacto_creado" as const,
        summary: "Posible duplicado: otro contacto tiene el mismo teléfono",
        payload: { otroContacto: telefonoAjeno, nuevoContacto: created.id },
        actorLabel: "Sistema",
      };
      await emitEvent(admin, { ...aviso, contactId: created.id });
      await emitEvent(admin, { ...aviso, contactId: telefonoAjeno });
    }

    return {
      contactId: created.id,
      created: true,
      possibleDuplicate: telefonoAjeno !== null,
    };
  }

  // 3. Varias coincidencias: NO se fusiona solo. Mezclar dos clientes distintos
  //    es peor que tener dos registros del mismo. Se usa el más antiguo y se
  //    deja constancia para que una persona lo resuelva.
  let contactId = contactIds[0];
  const possibleDuplicate = contactIds.length > 1;
  if (possibleDuplicate) {
    const { data: oldest } = await admin
      .from("contacts")
      .select("id")
      .in("id", contactIds)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    contactId = oldest?.id ?? contactId;

    await emitEvent(admin, {
      contactId,
      kind: "contacto_creado",
      summary: `Posible duplicado: estas identidades apuntan a ${contactIds.length} contactos`,
      payload: { contactIds, identities },
      actorLabel: "Sistema",
    });
  }

  // 4. Adjuntar identidades que faltaban
  const yaTiene = new Set(
    matched
      .filter((m) => m.contact_id === contactId)
      .map((m) => `${m.kind}:${m.value}`),
  );
  const nuevas = identities.filter((i) => !yaTiene.has(`${i.kind}:${i.value}`));

  // Dos cuentas de plataforma en un mismo contacto: puede ser la misma persona
  // con dos registros, pero `contacts.profile_id` apunta a una sola. Se avisa
  // para que se resuelva a mano en lugar de dejar a un miembro invisible.
  const portalEntrante = nuevas.find((i) => i.kind === "portal");
  if (portalEntrante) {
    const { data: yaPortal } = await admin
      .from("contact_identities")
      .select("value")
      .eq("contact_id", contactId)
      .eq("kind", "portal");
    const otras = (yaPortal ?? []).filter((r) => r.value !== portalEntrante.value);
    if (otras.length > 0) {
      await emitEvent(admin, {
        contactId,
        kind: "contacto_creado",
        summary:
          "Este contacto quedó con dos cuentas de la plataforma — revisar si son la misma persona",
        payload: {
          cuentas: [...otras.map((o) => o.value), portalEntrante.value],
        },
        actorLabel: "Sistema",
      });
    }
  }

  if (nuevas.length > 0) {
    // onConflict: si otra fila ya tomó ese (kind,value), se ignora en silencio;
    // el paso 3 ya dejó constancia del posible duplicado.
    await admin
      .from("contact_identities")
      .upsert(
        nuevas.map((i) => ({ contact_id: contactId, kind: i.kind, value: i.value })),
        { onConflict: "kind,value", ignoreDuplicates: true },
      );
  }

  // 5. Completar huecos SIN pisar lo que ya hay (puede haberlo escrito una
  //    persona, y su dato vale más que el que trae un webhook).
  const { data: current } = await admin
    .from("contacts")
    .select(
      "first_name, last_name, birth_date, city, state, source, contact_type, profile_id, campaign_lead_id, ambassador_id, center_id",
    )
    .eq("id", contactId)
    .single();

  if (current) {
    const patch: Record<string, unknown> = {};
    const fill = (key: string, value: string | null | undefined) => {
      if (value && !current[key as keyof typeof current]) patch[key] = value;
    };
    fill("first_name", normalizeName(input.firstName));
    fill("last_name", normalizeName(input.lastName));
    fill("birth_date", input.birthDate);
    fill("city", normalizeName(input.city));
    fill("state", normalizeName(input.state));
    fill("source", input.source);
    fill("profile_id", input.links?.profileId);
    fill("campaign_lead_id", input.links?.campaignLeadId);
    fill("ambassador_id", input.links?.ambassadorId);
    fill("center_id", input.links?.centerId);

    // El tipo solo sube: un miembro que además escribe por Instagram no vuelve
    // a ser "lead".
    const nextType = input.contactType;
    if (
      nextType &&
      TYPE_RANK[nextType] > TYPE_RANK[current.contact_type as ContactType]
    )
      patch.contact_type = nextType;

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      await admin.from("contacts").update(patch).eq("id", contactId);
    }
  }

  return { contactId, created: false, possibleDuplicate };
}

/** Agrega una identidad a un contacto ya conocido (p. ej. dejó su correo en el chat). */
export async function attachIdentity(
  admin: Admin,
  contactId: string,
  kind: IdentityKind,
  rawValue: string,
): Promise<boolean> {
  const value =
    kind === "email"
      ? normalizeEmail(rawValue)
      : kind === "phone"
        ? normalizePhone(rawValue)
        : normalizeChannelId(rawValue);
  if (!value) return false;

  const { error } = await admin
    .from("contact_identities")
    .upsert({ contact_id: contactId, kind, value }, { onConflict: "kind,value", ignoreDuplicates: true });
  return !error;
}
