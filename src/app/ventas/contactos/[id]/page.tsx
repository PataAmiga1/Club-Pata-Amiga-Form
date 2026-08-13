import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortal } from "@/lib/panel-guard";
import { formatDateEs } from "@/lib/dates";
import { formatMxn } from "@/lib/format";
import { uno } from "@/lib/crm/embed";
import {
  FichaLateral,
  type CampoDef,
} from "@/components/panel/contactos/FichaLateral";
import { NotasYTareas } from "@/components/panel/contactos/NotasYTareas";

export const metadata = { title: "Perfil de contacto · Portal de ventas" };

/** Iconos de la línea de tiempo por tipo de evento. */
const ICONO_EVENTO: Record<string, string> = {
  contacto_creado: "✨",
  primer_mensaje: "💬",
  mensaje_recibido: "📩",
  mensaje_enviado: "📤",
  pidio_llamada: "📞",
  cuenta_creada: "🪪",
  checkout_abandonado: "🛒",
  pago_confirmado: "💳",
  membresia_activa: "💚",
  membresia_inactiva: "🟡",
  etapa_movida: "🎯",
  etiqueta_agregada: "🏷️",
  etiqueta_quitada: "🏷️",
  propietario_asignado: "🙋",
  nota: "📝",
  tarea_creada: "☑️",
  tarea_completada: "✅",
  escalacion: "❗",
  contactos_fusionados: "🔗",
  importado: "⬆️",
  mascota_alta: "🐾",
  reintegro_solicitado: "💚",
};

function tiempoRelativo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `hace ${Math.max(mins, 1)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const dias = Math.floor(hrs / 24);
  if (dias < 30) return `hace ${dias} d`;
  return formatDateEs(iso);
}

export default async function FichaContactoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePortal("ventas");
  const { id } = await params;
  const admin = createAdminClient();

  const { data: contacto } = await admin
    .from("contacts")
    .select(
      `id, first_name, last_name, birth_date, city, state, source, contact_type,
       owner_id, custom_fields, dnd, profile_id, ambassador_id, center_id,
       campaign_lead_id, created_at,
       contact_identities(kind, value, is_primary),
       contact_tags(tag_id)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!contacto) notFound();

  const [
    { data: actividades },
    { data: oportunidades },
    { data: tareas },
    { data: etiquetasCat },
    { data: equipoCat },
    { data: camposCat },
    { data: seguidores },
    { data: conversaciones },
  ] = await Promise.all([
    admin
      .from("contact_activities")
      .select("id, kind, summary, actor_id, actor_label, created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(60),
    admin
      .from("opportunities")
      .select(
        "id, title, value_cents, value_is_estimate, status, stage_entered_at, pipeline_stages(name, color)",
      )
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("tasks")
      .select("id, title, due_at, assigned_to")
      .eq("contact_id", id)
      .is("completed_at", null)
      .order("due_at", { ascending: true, nullsFirst: false }),
    admin.from("tags").select("id, name").order("name"),
    admin
      .from("profiles")
      .select("id, first_name, email, role")
      .in("role", ["ventas", "gerente_ventas", "admin", "super_admin"])
      .order("first_name"),
    admin
      .from("custom_field_defs")
      .select("key, label, type, field_group, options")
      .eq("applies_to", "contact")
      .is("archived_at", null)
      .order("position"),
    admin.from("contact_followers").select("user_id").eq("contact_id", id),
    admin
      .from("channel_conversations")
      .select("id, channel, status, last_message_at, needs_attention")
      .eq("contact_id", id)
      .order("last_message_at", { ascending: false })
      .limit(10),
  ]);

  const equipo = (equipoCat ?? []).map((m) => ({
    id: m.id,
    nombre: m.first_name || m.email?.split("@")[0] || "Equipo",
  }));
  const nombrePorId = new Map(equipo.map((m) => [m.id, m.nombre]));

  const identidades = (contacto.contact_identities ?? []) as {
    kind: string;
    value: string;
    is_primary: boolean;
  }[];
  const nombre =
    [contacto.first_name, contacto.last_name].filter(Boolean).join(" ") ||
    "Sin nombre";

  // Bloque de membresía: solo datos NO sensibles. Los roles de ventas nunca ven
  // INE, CURP, RFC, bancarios ni expedientes de reintegro (sección 1, punto 4),
  // así que ni se consultan aquí — no basta con no mostrarlos.
  let membresia: {
    estado: string | null;
    desde: string | null;
    mascotas: { name: string; species: string }[];
    reintegros: number;
  } | null = null;

  if (contacto.profile_id) {
    const [{ data: perfil }, { data: mascotas }, { count: reintegros }] =
      await Promise.all([
        admin
          .from("profiles")
          .select("membership_status, member_since")
          .eq("id", contacto.profile_id)
          .maybeSingle(),
        admin
          .from("pets")
          .select("name, species")
          .eq("user_id", contacto.profile_id)
          .eq("is_active", true),
        admin
          .from("reimbursements")
          .select("id", { count: "exact", head: true })
          .eq("user_id", contacto.profile_id),
      ]);
    membresia = {
      estado: perfil?.membership_status ?? null,
      desde: perfil?.member_since ?? null,
      mascotas: (mascotas ?? []) as { name: string; species: string }[],
      reintegros: reintegros ?? 0,
    };
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/ventas/contactos"
            className="text-[13px] font-semibold text-ink-tertiary hover:text-teal"
          >
            ← Contactos
          </Link>
          <h1 className="font-display text-[24px] text-ink-title">{nombre}</h1>
        </div>
        <span className="text-[12px] text-ink-tertiary">
          En el CRM desde {formatDateEs(contacto.created_at)}
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
        <FichaLateral
          datos={{
            id: contacto.id,
            firstName: contacto.first_name,
            lastName: contacto.last_name,
            birthDate: contacto.birth_date,
            city: contacto.city,
            state: contacto.state,
            source: contacto.source,
            contactType: contacto.contact_type,
            ownerId: contacto.owner_id,
            correos: identidades.filter((i) => i.kind === "email").map((i) => i.value),
            telefonos: identidades.filter((i) => i.kind === "phone").map((i) => i.value),
            canales: identidades.filter(
              (i) => !["email", "phone"].includes(i.kind),
            ),
            etiquetas: ((contacto.contact_tags ?? []) as { tag_id: string }[]).map(
              (t) => t.tag_id,
            ),
            dnd: (contacto.dnd as Record<string, boolean>) ?? {},
            camposPropios: (contacto.custom_fields as Record<string, unknown>) ?? {},
            sigo: (seguidores ?? []).some((s) => s.user_id === session.userId),
            seguidores: (seguidores ?? []).length,
          }}
          equipo={equipo}
          etiquetasCat={etiquetasCat ?? []}
          campos={((camposCat ?? []) as {
            key: string;
            label: string;
            type: CampoDef["type"];
            field_group: string | null;
            options: unknown;
          }[]).map((c) => ({
            key: c.key,
            label: c.label,
            type: c.type,
            group: c.field_group,
            options: (c.options as string[]) ?? [],
          }))}
          puedeEditar={session.can["contactos.editar"]}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Membresía — solo lo que un rol de ventas puede ver */}
          {membresia && (
            <div className="flex flex-col gap-2.5 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-bold text-ink-title">Membresía</h2>
                {session.can["miembro.expediente"] && (
                  <Link
                    href={`/admin/miembros/${contacto.profile_id}`}
                    className="text-[12px] font-bold text-teal underline"
                  >
                    Ver expediente completo →
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Dato label="ESTADO" valor={membresia.estado ?? "—"} />
                <Dato
                  label="MIEMBRO DESDE"
                  valor={membresia.desde ? formatDateEs(membresia.desde) : "—"}
                />
                <Dato
                  label="MASCOTAS"
                  valor={
                    membresia.mascotas.length > 0
                      ? membresia.mascotas
                          .map((m) => `${m.species === "cat" ? "🐱" : "🐶"} ${m.name}`)
                          .join(", ")
                      : "—"
                  }
                />
                <Dato label="REINTEGROS" valor={String(membresia.reintegros)} />
              </div>
              <p className="text-[11px] leading-snug text-ink-tertiary">
                🔒 Identidad, domicilio, datos bancarios y fiscales, y los
                expedientes de reintegro no son visibles desde el portal de
                ventas.
              </p>
            </div>
          )}

          {/* Oportunidades */}
          <div className="flex flex-col gap-2.5 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink-title">Oportunidades</h2>
              <span className="text-[11.5px] text-ink-tertiary">
                El tablero llega en la fase 1c
              </span>
            </div>
            {(oportunidades ?? []).length === 0 && (
              <span className="text-[12.5px] text-ink-tertiary">
                Sin oportunidades.
              </span>
            )}
            {(oportunidades ?? []).map((o) => {
              const etapa = uno(o.pipeline_stages);
              return (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-cream px-3 py-2.5"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-semibold text-ink-title">
                      {o.title}
                    </span>
                    <span className="text-[11px] text-ink-tertiary">
                      {etapa?.name ?? "—"} · desde{" "}
                      {formatDateEs(o.stage_entered_at)}
                    </span>
                  </span>
                  <span className="text-[13px] font-bold text-ink-title">
                    {formatMxn(o.value_cents / 100)}
                    {o.value_is_estimate && (
                      <span className="ml-1 text-[10.5px] font-semibold text-ink-tertiary">
                        est.
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Conversaciones */}
          {(conversaciones ?? []).length > 0 && (
            <div className="flex flex-col gap-2.5 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
              <h2 className="text-[15px] font-bold text-ink-title">Conversaciones</h2>
              {(conversaciones ?? []).map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/conversaciones?conv=${c.id}`}
                  className="flex items-center justify-between gap-2 rounded-[10px] bg-cream px-3 py-2 hover:bg-cream-light"
                >
                  <span className="text-[12.5px] font-semibold text-ink-title">
                    {c.needs_attention && "❗ "}
                    {c.channel}
                  </span>
                  <span className="text-[11px] text-ink-tertiary">
                    {c.last_message_at ? tiempoRelativo(c.last_message_at) : "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <NotasYTareas
            contactId={contacto.id}
            tareas={(tareas ?? []).map((t) => ({
              id: t.id,
              title: t.title,
              dueAt: t.due_at,
              responsable: t.assigned_to
                ? nombrePorId.get(t.assigned_to) ?? null
                : null,
            }))}
            equipo={equipo}
            puedeEditar={session.can["contactos.editar"]}
            ahora={new Date().getTime()}
          />

          {/* Línea de tiempo — el sumidero único de emitEvent */}
          <div className="flex flex-col gap-2.5 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            <h2 className="text-[15px] font-bold text-ink-title">Actividad</h2>
            {(actividades ?? []).length === 0 && (
              <span className="text-[12.5px] text-ink-tertiary">
                Sin actividad todavía.
              </span>
            )}
            <div className="flex flex-col">
              {(actividades ?? []).map((a) => (
                <div
                  key={a.id}
                  className="flex gap-2.5 border-b border-border-divider py-2.5 last:border-0"
                >
                  <span className="text-[14px] leading-none" aria-hidden>
                    {ICONO_EVENTO[a.kind] ?? "•"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[12.5px] leading-snug text-ink-body">
                      {a.summary}
                    </span>
                    <span className="text-[10.5px] text-ink-tertiary">
                      {a.actor_id
                        ? nombrePorId.get(a.actor_id) ?? "Equipo"
                        : a.actor_label ?? "Sistema"}{" "}
                      · {tiempoRelativo(a.created_at)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
        {label}
      </span>
      <span className="text-[13px] text-ink-body">{valor}</span>
    </div>
  );
}
