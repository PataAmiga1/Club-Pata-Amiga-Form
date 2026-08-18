import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortal } from "@/lib/panel-guard";
import { uno } from "@/lib/crm/embed";
import { haceDias } from "@/lib/dates";
import {
  ListaConversaciones,
  type FilaHilo,
} from "@/components/panel/bandeja/ListaConversaciones";
import { Hilo, type Pieza } from "@/components/panel/bandeja/Hilo";

export const metadata = { title: "Conversaciones · Portal de ventas" };

/** Solo la variante de mensaje, para poder mirar `quien` sin estrecharla. */
type PiezaMensaje = Extract<Pieza, { tipo: "mensaje" }>;

/** Alcances de la bandeja (los rieles de la izquierda). */
const ALCANCES = [
  { key: "mias", label: "Mías", icono: "👤" },
  { key: "sin", label: "Sin asignar", icono: "📥" },
  { key: "equipo", label: "Del equipo", icono: "👥" },
  { key: "supervision", label: "Supervisión", icono: "👁️" },
] as const;

const FILTROS = [
  { key: "no_leidas", label: "No leídas" },
  { key: "todo", label: "Todo" },
  { key: "recientes", label: "Recientes" },
  { key: "destacadas", label: "Destacadas" },
] as const;

/** Canales de solo lectura: se supervisan, no se contestan desde aquí. */
const CANALES_SUPERVISION = ["portal", "vet"];

const ICONO_EVENTO: Record<string, string> = {
  etapa_movida: "🎯",
  pago_confirmado: "💳",
  membresia_activa: "💚",
  membresia_inactiva: "🟡",
  checkout_abierto: "🛒",
  checkout_abandonado: "🛒",
  contacto_creado: "✨",
  etiqueta_agregada: "🏷️",
  propietario_asignado: "🙋",
  contactos_fusionados: "🔗",
  mascota_aprobada: "🐾",
};

export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePortal("ventas");
  const params = await searchParams;
  const admin = createAdminClient();

  const alcance = (params.alcance ?? "mias") as (typeof ALCANCES)[number]["key"];
  const filtro = (params.filtro ?? "todo") as (typeof FILTROS)[number]["key"];
  const canal = params.canal ?? "";
  const convId = params.conv ?? null;
  const puedeEditar = session.can["contactos.editar"];

  // --- Lista -------------------------------------------------------------
  let consulta = admin
    .from("channel_conversations")
    .select(
      "id, channel, display_name, contact_id, assigned_to, human_takeover, needs_attention, status, last_message_at, snoozed_until, starred_by, subject",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(120);

  if (alcance === "mias") consulta = consulta.eq("assigned_to", session.userId);
  else if (alcance === "sin") consulta = consulta.is("assigned_to", null);
  if (alcance === "supervision")
    consulta = consulta.in("channel", CANALES_SUPERVISION);
  else consulta = consulta.not("channel", "in", `(${CANALES_SUPERVISION.join(",")})`);

  if (canal) consulta = consulta.eq("channel", canal);
  if (filtro === "destacadas")
    consulta = consulta.contains("starred_by", [session.userId]);
  if (filtro === "recientes")
    consulta = consulta.gte("last_message_at", haceDias(7));

  const { data: hilos } = await consulta;
  const idsHilos = (hilos ?? []).map((h) => h.id);

  // Mi estado de leído + el último mensaje de cada hilo
  const [
    { data: lecturas },
    { data: ultimos },
    { data: equipoCat },
    { data: plantillasCat },
    { data: plantillasWaCat },
  ] = await Promise.all([
      admin
        .from("conversation_reads")
        .select("conversation_id, last_read_at")
        .eq("user_id", session.userId)
        .in("conversation_id", idsHilos.length > 0 ? idsHilos : ["-"]),
      admin
        .from("channel_messages")
        .select("conversation_id, content, created_at, internal, direction")
        .in("conversation_id", idsHilos.length > 0 ? idsHilos : ["-"])
        .order("created_at", { ascending: false })
        .limit(600),
      admin
        .from("profiles")
        .select("id, first_name, email, role")
        .in("role", ["ventas", "gerente_ventas", "admin", "super_admin"])
        .order("first_name"),
      admin
        .from("message_templates")
        .select("id, name, category, channels")
        .is("archived_at", null)
        .order("usos", { ascending: false })
        .limit(50),
      admin
        .from("whatsapp_templates")
        .select("id, meta_name, body_preview, status")
        .order("meta_name"),
    ]);

  const equipo = (equipoCat ?? []).map((m) => ({
    id: m.id,
    nombre: m.first_name || m.email?.split("@")[0] || "Equipo",
  }));
  const nombrePorId = new Map(equipo.map((m) => [m.id, m.nombre]));
  const leidoHasta = new Map(
    (lecturas ?? []).map((l) => [l.conversation_id, l.last_read_at]),
  );

  // Sin leer POR PERSONA: mensajes entrantes posteriores a mi última lectura
  const sinLeerPorHilo = new Map<string, number>();
  const ultimoTextoPorHilo = new Map<string, string>();
  for (const m of ultimos ?? []) {
    if (!ultimoTextoPorHilo.has(m.conversation_id))
      ultimoTextoPorHilo.set(
        m.conversation_id,
        m.internal ? `📝 ${m.content}` : m.content,
      );
    if (m.direction !== "in") continue;
    const leido = leidoHasta.get(m.conversation_id);
    if (!leido || m.created_at > leido)
      sinLeerPorHilo.set(
        m.conversation_id,
        (sinLeerPorHilo.get(m.conversation_id) ?? 0) + 1,
      );
  }

  const ahora = new Date().toISOString();
  let filas: FilaHilo[] = (hilos ?? []).map((h) => ({
    id: h.id,
    canal: h.channel,
    nombre: h.display_name || h.subject || "Sin nombre",
    contactId: h.contact_id,
    ultimo: h.last_message_at,
    ultimoTexto: (ultimoTextoPorHilo.get(h.id) ?? "").slice(0, 90),
    sinLeer: sinLeerPorHilo.get(h.id) ?? 0,
    destacado: ((h.starred_by ?? []) as string[]).includes(session.userId),
    necesitaAtencion: h.needs_attention,
    asignadoA: h.assigned_to ? nombrePorId.get(h.assigned_to) ?? null : null,
    pospuestoHasta: h.snoozed_until,
    iaPausada: h.human_takeover,
    cerrado: h.status === "closed",
  }));

  // Pospuestas: fuera de la lista hasta su fecha (salvo que se pidan a propósito)
  if (filtro !== "todo")
    filas = filas.filter((f) => !f.pospuestoHasta || f.pospuestoHasta <= ahora);
  if (filtro === "no_leidas") filas = filas.filter((f) => f.sinLeer > 0);

  const totalSinLeer = filas.reduce((s, f) => s + f.sinLeer, 0);

  // --- Hilo abierto ------------------------------------------------------
  let cabeza = null;
  let piezas: Pieza[] = [];
  let primerNoLeido: string | null = null;

  if (convId) {
    const { data: hilo } = await admin
      .from("channel_conversations")
      .select(
        "id, channel, display_name, subject, contact_id, assigned_to, human_takeover, needs_attention, status, snoozed_until, starred_by",
      )
      .eq("id", convId)
      .maybeSingle();

    if (hilo) {
      const [{ data: mensajes }, { data: votos }] = await Promise.all([
        admin
          .from("channel_messages")
          .select(
            "id, direction, sender, author_id, content, internal, created_at, send_error, scheduled_for, sent_at",
          )
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true })
          .limit(300),
        admin
          .from("message_feedback")
          .select("message_id, value")
          .eq("user_id", session.userId),
      ]);

      const votoPorMensaje = new Map(
        (votos ?? []).map((v) => [v.message_id, v.value as 1 | -1]),
      );
      const miLectura = leidoHasta.get(convId) ?? null;

      const deMensajes: PiezaMensaje[] = (mensajes ?? []).map((m) => ({
        tipo: "mensaje" as const,
        id: m.id,
        quien:
          m.direction === "in"
            ? ("contacto" as const)
            : m.sender === "ai"
              ? ("ia" as const)
              : ("persona" as const),
        autor: m.author_id ? nombrePorId.get(m.author_id) ?? "Equipo" : null,
        texto: m.content,
        interna: m.internal,
        cuando: m.created_at,
        errorEnvio: m.send_error,
        programadoPara: m.sent_at ? null : m.scheduled_for,
        voto: votoPorMensaje.get(m.id) ?? null,
      }));

      // Eventos de plataforma intercalados: es lo que el equipo ya ve hoy en
      // LynSales ("Opportunity … created") y sale de contact_activities.
      let deEventos: Pieza[] = [];
      if (hilo.contact_id) {
        const { data: actividades } = await admin
          .from("contact_activities")
          .select("id, kind, summary, created_at")
          .eq("contact_id", hilo.contact_id)
          .in("kind", Object.keys(ICONO_EVENTO))
          .order("created_at", { ascending: true })
          .limit(60);
        deEventos = (actividades ?? []).map((a) => ({
          tipo: "evento" as const,
          id: a.id,
          texto: a.summary,
          cuando: a.created_at,
          icono: ICONO_EVENTO[a.kind] ?? "•",
        }));
      }

      piezas = [...deMensajes, ...deEventos].sort((a, b) =>
        a.cuando < b.cuando ? -1 : a.cuando > b.cuando ? 1 : 0,
      );

      const primerNuevo = deMensajes.find(
        (m) => m.quien === "contacto" && (!miLectura || m.cuando > miLectura),
      );
      primerNoLeido = primerNuevo?.id ?? null;

      const ultimoEntrante =
        [...deMensajes].reverse().find((m) => m.quien === "contacto")?.cuando ?? null;

      cabeza = {
        id: hilo.id,
        canal: hilo.channel,
        nombre: hilo.display_name || hilo.subject || "Sin nombre",
        contactId: hilo.contact_id,
        asignadoA: hilo.assigned_to ? nombrePorId.get(hilo.assigned_to) ?? null : null,
        asignadoId: hilo.assigned_to,
        iaPausada: hilo.human_takeover,
        necesitaAtencion: hilo.needs_attention,
        destacado: ((hilo.starred_by ?? []) as string[]).includes(session.userId),
        cerrado: hilo.status === "closed",
        pospuestoHasta: hilo.snoozed_until,
        ultimoEntrante,
      };

      // Abrirlo cuenta como leerlo — para mí, no para los demás.
      await admin.from("conversation_reads").upsert(
        {
          conversation_id: convId,
          user_id: session.userId,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" },
      );
    }
  }

  // Perfil compacto del contacto del hilo abierto
  let contacto = null;
  if (cabeza?.contactId) {
    const { data } = await admin
      .from("contacts")
      .select(
        "id, first_name, last_name, contact_type, source, dnd, profile_id, contact_identities(kind, value), opportunities(title, pipeline_stages(name))",
      )
      .eq("id", cabeza.contactId)
      .maybeSingle();
    if (data) {
      const idents = (data.contact_identities ?? []) as { kind: string; value: string }[];
      const oportunidad = (data.opportunities ?? [])[0];
      contacto = {
        id: data.id,
        nombre:
          [data.first_name, data.last_name].filter(Boolean).join(" ") || "Sin nombre",
        tipo: data.contact_type,
        fuente: data.source,
        esMiembro: !!data.profile_id,
        correo: idents.find((i) => i.kind === "email")?.value ?? null,
        telefono: idents.find((i) => i.kind === "phone")?.value ?? null,
        dnd: Object.keys((data.dnd as Record<string, boolean>) ?? {}),
        etapa: oportunidad ? uno(oportunidad.pipeline_stages)?.name ?? null : null,
      };
    }
  }

  const qs = (extra: Record<string, string>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ alcance, filtro, canal, ...extra }))
      if (v && !(k === "alcance" && v === "mias") && !(k === "filtro" && v === "todo"))
        sp.set(k, v);
    return sp.toString();
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-5 md:px-[22px] md:py-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-[24px] text-ink-title">
          Conversaciones{" "}
          {totalSinLeer > 0 && (
            <span className="rounded-full bg-teal px-2.5 py-1 align-middle text-[12px] font-extrabold text-white">
              {totalSinLeer} sin leer
            </span>
          )}
        </h1>
        <div className="flex flex-wrap gap-1.5">
          {ALCANCES.map((a) => (
            <Link
              key={a.key}
              href={`/ventas/conversaciones?${qs({ alcance: a.key, conv: "" })}`}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                alcance === a.key
                  ? "bg-teal text-white"
                  : "border-[1.5px] border-border-input bg-white text-ink-secondary hover:border-teal"
              }`}
            >
              <span aria-hidden>{a.icono} </span>
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <Link
            key={f.key}
            href={`/ventas/conversaciones?${qs({ filtro: f.key, conv: convId ?? "" })}`}
            className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors ${
              filtro === f.key
                ? "bg-ink-title text-white"
                : "bg-white text-ink-secondary hover:bg-cream"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <span className="mx-1 w-px bg-border-divider" />
        {["", "instagram", "facebook", "whatsapp", "email"].map((c) => (
          <Link
            key={c || "todos"}
            href={`/ventas/conversaciones?${qs({ canal: c, conv: convId ?? "" })}`}
            className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors ${
              canal === c
                ? "bg-ink-title text-white"
                : "bg-white text-ink-secondary hover:bg-cream"
            }`}
          >
            {c === "" ? "Todos los canales" : c}
          </Link>
        ))}
      </div>

      <div className="flex min-h-[560px] gap-3">
        {/* Lista */}
        <div
          className={`flex min-h-0 w-full flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_2px_10px_rgba(30,83,80,.05)] md:w-[320px] md:flex-none ${
            convId ? "hidden md:flex" : "flex"
          }`}
        >
          <ListaConversaciones
            filas={filas}
            seleccionadaId={convId}
            equipo={equipo}
            puedeEditar={puedeEditar}
            querystring={qs({})}
          />
        </div>

        {/* Hilo */}
        <div
          className={`min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_2px_10px_rgba(30,83,80,.05)] ${
            convId ? "flex" : "hidden md:flex"
          }`}
        >
          {cabeza ? (
            <>
              <Link
                href={`/ventas/conversaciones?${qs({ conv: "" })}`}
                className="border-b border-border-divider px-4 py-2 text-[12px] font-semibold text-ink-tertiary hover:text-teal md:hidden"
              >
                ← Todas las conversaciones
              </Link>
              <Hilo
                cabeza={cabeza}
                piezas={piezas}
                primerNoLeido={primerNoLeido}
                equipo={equipo}
                puedeEditar={
                  puedeEditar && !CANALES_SUPERVISION.includes(cabeza.canal)
                }
                // Solo las plantillas que sirven para este canal (vacío = todas)
                plantillas={(plantillasCat ?? [])
                  .filter(
                    (p) =>
                      (p.channels ?? []).length === 0 ||
                      (p.channels as string[]).includes(cabeza!.canal),
                  )
                  .map((p) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    channels: (p.channels as string[]) ?? [],
                  }))}
                plantillasWa={(plantillasWaCat ?? []).map((p) => ({
                  id: p.id,
                  metaName: p.meta_name,
                  preview: p.body_preview,
                  status: p.status,
                }))}
              />
            </>
          ) : (
            <p className="grid flex-1 place-items-center px-6 text-center text-[13.5px] text-ink-secondary">
              Elige una conversación de la lista.
            </p>
          )}
        </div>

        {/* Perfil del contacto */}
        {contacto && (
          <aside className="hidden w-[240px] flex-none flex-col gap-2 rounded-[16px] bg-white p-4 shadow-[0_2px_10px_rgba(30,83,80,.05)] lg:flex">
            <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
              CONTACTO
            </span>
            <Link
              href={`/ventas/contactos/${contacto.id}`}
              className="text-[14px] font-bold text-ink-title hover:text-teal"
            >
              {contacto.nombre}
            </Link>
            <span className="text-[11.5px] text-ink-secondary">
              {contacto.tipo}
              {contacto.esMiembro && " · miembro"}
            </span>
            {contacto.correo && (
              <span className="truncate text-[11.5px] text-ink-body">
                ✉️ {contacto.correo}
              </span>
            )}
            {contacto.telefono && (
              <span className="text-[11.5px] text-ink-body">📞 {contacto.telefono}</span>
            )}
            {contacto.etapa && (
              <span className="rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold text-ink-secondary">
                🎯 {contacto.etapa}
              </span>
            )}
            {contacto.dnd.length > 0 && (
              <span className="rounded-full bg-pink/15 px-2.5 py-1 text-[11px] font-bold text-pink">
                🚫 no contactar: {contacto.dnd.join(", ")}
              </span>
            )}
            {contacto.fuente && (
              <span className="text-[11px] text-ink-tertiary">
                origen: {contacto.fuente}
              </span>
            )}
            <Link
              href={`/ventas/contactos/${contacto.id}`}
              className="mt-1 rounded-full border-[1.5px] border-border-input px-3 py-1.5 text-center text-[11.5px] font-bold text-teal-deep hover:border-teal"
            >
              Ver perfil completo
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}
