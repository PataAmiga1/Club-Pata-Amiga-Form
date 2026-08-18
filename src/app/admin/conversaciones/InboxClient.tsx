"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  markConversationRead,
  sendAdminMessage,
  setPipelineStage,
  toggleTakeover,
} from "./actions";

export type Conversation = {
  id: string;
  /** "portal" = chat con el asistente dentro del área de miembros (solo lectura) */
  channel: string;
  kind: "social" | "portal";
  display_name: string | null;
  external_user_id: string;
  human_takeover: boolean;
  status: string;
  pipeline_stage: string;
  needs_attention: boolean;
  last_message_at: string;
  last_admin_read_at: string | null;
  preview: string | null;
};

/** Etapas del pipeline de ventas (las clasifica la IA; el equipo puede corregir). */
const STAGES = ["nuevo", "interesado", "convertido", "descartado", "soporte"] as const;
const STAGE_META: Record<string, { label: string; cls: string }> = {
  nuevo: { label: "Nuevo", cls: "bg-cream text-ink-secondary" },
  interesado: { label: "Interesado", cls: "bg-orange/15 text-orange" },
  convertido: { label: "Convertido", cls: "bg-teal/10 text-teal" },
  descartado: { label: "Descartado", cls: "bg-cream text-ink-tertiary" },
  soporte: { label: "Soporte (no venta)", cls: "bg-[#0084FF]/10 text-[#0068c9]" },
};

type Message = {
  id: string;
  direction: "in" | "out";
  sender: "contact" | "ai" | "admin";
  content: string;
  created_at: string;
};

/** Colores de marca de cada canal para identificarlos de un vistazo. */
const CHANNEL_META: Record<
  string,
  { label: string; badgeCls: string; chipCls: string }
> = {
  facebook: {
    label: "Messenger",
    badgeCls: "bg-[#0084FF] text-white",
    chipCls: "border-[#0084FF] text-[#0068c9]",
  },
  instagram: {
    label: "Instagram",
    badgeCls: "bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white",
    chipCls: "border-[#DD2A7B] text-[#c02069]",
  },
  whatsapp: {
    label: "WhatsApp",
    badgeCls: "bg-[#25D366] text-white",
    chipCls: "border-[#1da851] text-[#178943]",
  },
  portal: {
    label: "Portal",
    badgeCls: "bg-teal text-white",
    chipCls: "border-teal text-teal-deep",
  },
  email: {
    label: "Correo",
    badgeCls: "bg-ink-title text-white",
    chipCls: "border-ink-title text-ink-title",
  },
  vet: {
    label: "Veterinario",
    badgeCls: "bg-orange text-white",
    chipCls: "border-orange text-orange",
  },
};

/**
 * Datos del canal, con respaldo. Un canal que todavía no esté en el mapa NO
 * debe tumbar la bandeja: antes, `CHANNEL_META[canal].badgeCls` reventaba la
 * página entera en cuanto aparecía uno nuevo (pasó con "email").
 */
function metaCanal(channel: string) {
  return (
    CHANNEL_META[channel] ?? {
      label: channel,
      badgeCls: "bg-ink-tertiary text-white",
      chipCls: "border-border-input text-ink-secondary",
    }
  );
}

/** Pastilla de canal (lista y encabezado del hilo). */
function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span
      className={`inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${metaCanal(channel).badgeCls}`}
    >
      {metaCanal(channel).label}
    </span>
  );
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/**
 * Bandeja de conversaciones de canales sociales (estilo GoHighLevel):
 * lista a la izquierda, hilo a la derecha, botón para que el equipo tome la
 * conversación (pausa la IA) y responda a mano. Se actualiza en tiempo real
 * vía Supabase Realtime.
 */
export function InboxClient({ initial }: { initial: Conversation[] }) {
  const [conversations, setConversations] = useState<Conversation[]>(initial);
  const [channelFilter, setChannelFilter] = useState<"all" | Conversation["channel"]>("all");
  const [stageFilter, setStageFilter] = useState<"all" | (typeof STAGES)[number]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // `useState(createClient)` crea el cliente UNA sola vez, en forma diferida.
  // Con `useRef(createClient())` se creaba uno en cada render y se tiraban
  // todos menos el primero.
  const [supabase] = useState(createClient);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from("channel_conversations")
      .select(
        "id, channel, display_name, external_user_id, human_takeover, status, pipeline_stage, needs_attention, last_message_at, last_admin_read_at",
      )
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (data) {
      setConversations((prev) => {
        // Solo recarga las de redes; las del portal (asistente) vienen del
        // servidor y se conservan tal cual
        const portal = prev.filter((c) => c.kind === "portal");
        const social = data.map((c) => ({
          ...(c as Omit<Conversation, "preview" | "kind">),
          kind: "social" as const,
          preview: prev.find((p) => p.id === c.id)?.preview ?? null,
        }));
        return [...social, ...portal].sort((a, b) =>
          b.last_message_at.localeCompare(a.last_message_at),
        );
      });
    }
  }, [supabase]);

  const loadMessages = useCallback(
    async (convId: string, kind: Conversation["kind"] = "social") => {
      if (kind === "portal") {
        // Chats del asistente del portal (assistant_messages) — supervisión
        const { data } = await supabase
          .from("assistant_messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true })
          .limit(200);
        setMessages(
          ((data ?? []) as { id: string; role: string; content: string; created_at: string }[]).map(
            (m) => ({
              id: m.id,
              direction: m.role === "user" ? ("in" as const) : ("out" as const),
              sender: m.role === "user" ? ("contact" as const) : ("ai" as const),
              content: m.content,
              created_at: m.created_at,
            }),
          ),
        );
        return;
      }
      const { data } = await supabase
        .from("channel_messages")
        .select("id, direction, sender, content, created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true })
        .limit(200);
      setMessages((data as Message[]) ?? []);
    },
    [supabase],
  );

  // Tiempo real: nuevo mensaje → refrescar lista y, si aplica, el hilo abierto
  useEffect(() => {
    const channel = supabase
      .channel("admin-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channel_messages" },
        (payload) => {
          const convId = (payload.new as { conversation_id?: string }).conversation_id;
          loadConversations();
          if (convId && convId === selectedId) loadMessages(convId);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_conversations" },
        () => loadConversations(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedId, loadConversations, loadMessages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function select(conv: Conversation) {
    setSelectedId(conv.id);
    setNotice(null);
    await loadMessages(conv.id, conv.kind);
    if (conv.kind === "portal") return; // portal: solo lectura, sin no-leídos
    await markConversationRead(conv.id); // también apaga el ❗ de atención
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conv.id
          ? { ...c, last_admin_read_at: new Date().toISOString(), needs_attention: false }
          : c,
      ),
    );
  }

  async function onStageChange(stage: string) {
    if (!selected) return;
    await setPipelineStage(selected.id, stage);
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, pipeline_stage: stage } : c)),
    );
  }

  async function onToggleTakeover() {
    if (!selected) return;
    const next = !selected.human_takeover;
    await toggleTakeover(selected.id, next);
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, human_takeover: next } : c)),
    );
  }

  async function onSend() {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const { sent } = await sendAdminMessage(selected.id, draft.trim());
      setDraft("");
      await loadMessages(selected.id);
      if (!sent) {
        setNotice(
          "Guardado en la bandeja, pero NO se envió al canal: el conector de Meta aún no está configurado (ver docs/AGENTES-IA.md).",
        );
      }
    } catch {
      setNotice("No se pudo enviar el mensaje. Intenta de nuevo.");
    } finally {
      setSending(false);
    }
  }

  const unread = (c: Conversation) =>
    !c.last_admin_read_at || c.last_admin_read_at < c.last_message_at;

  const filtered = conversations.filter(
    (c) =>
      (channelFilter === "all" || c.channel === channelFilter) &&
      // El pipeline de ventas solo aplica a redes; al filtrar por etapa se
      // ocultan los chats del portal
      (stageFilter === "all" || (c.kind === "social" && c.pipeline_stage === stageFilter)),
  );
  const socialConvs = conversations.filter((c) => c.kind === "social");

  return (
    <>
      {/* Pipeline de ventas — resumen en vivo por etapa (clic para filtrar) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {STAGES.map((st) => {
          const count = socialConvs.filter((c) => c.pipeline_stage === st).length;
          const active = stageFilter === st;
          return (
            <button
              key={st}
              onClick={() => setStageFilter(active ? "all" : st)}
              className={`flex flex-col items-start gap-0.5 rounded-[14px] border-[1.5px] p-3 text-left transition-colors ${
                active ? "border-teal bg-teal/5" : "border-transparent bg-white hover:bg-cream"
              } shadow-[0_2px_10px_rgba(30,83,80,.05)]`}
            >
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${STAGE_META[st].cls}`}>
                {STAGE_META[st].label}
              </span>
              <span className="font-display text-[22px] text-ink-title">{count}</span>
            </button>
          );
        })}
      </div>

    <div className="flex min-h-[70dvh] overflow-hidden rounded-[18px] bg-white shadow-[0_2px_10px_rgba(30,83,80,.05)]">
      {/* Lista de conversaciones */}
      <div
        className={`w-full flex-col border-r border-border-divider md:flex md:w-[300px] md:flex-none ${
          selected ? "hidden" : "flex"
        }`}
      >
        {conversations.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <span className="text-3xl" aria-hidden>
              📨
            </span>
            <p className="text-sm font-semibold text-ink-title">Aún no hay conversaciones</p>
            <p className="text-xs text-ink-tertiary">
              Cuando se conecten los canales de Meta, los mensajes de Messenger,
              Instagram y WhatsApp aparecerán aquí y el agente IA los responderá.
            </p>
          </div>
        ) : (
          <>
            {/* Filtros — canal y etapa del pipeline */}
            <div className="grid grid-cols-2 gap-2 border-b border-border-divider px-3.5 py-2.5">
              <select
                id="filtro-canal"
                aria-label="Filtrar por canal"
                value={channelFilter}
                onChange={(e) =>
                  setChannelFilter(e.target.value as "all" | Conversation["channel"])
                }
                className="h-9 w-full rounded-[10px] border-[1.5px] border-border-input bg-white px-2 text-[12.5px] font-semibold text-ink-title outline-none focus:border-teal"
              >
                <option value="all">Canal: todos ({conversations.length})</option>
                {Object.keys(CHANNEL_META).map((ch) => (
                  <option key={ch} value={ch}>
                    {metaCanal(ch).label} (
                    {conversations.filter((c) => c.channel === ch).length})
                  </option>
                ))}
              </select>
              <select
                id="filtro-etapa"
                aria-label="Filtrar por etapa de ventas"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)}
                className="h-9 w-full rounded-[10px] border-[1.5px] border-border-input bg-white px-2 text-[12.5px] font-semibold text-ink-title outline-none focus:border-teal"
              >
                <option value="all">Etapa: todas</option>
                {STAGES.map((st) => (
                  <option key={st} value={st}>
                    {STAGE_META[st].label} (
                    {conversations.filter((c) => c.pipeline_stage === st).length})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => select(c)}
                  className={`flex w-full flex-col gap-1 border-b border-border-divider px-4 py-3 text-left transition-colors hover:bg-cream ${
                    c.id === selectedId ? "bg-cream" : ""
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {c.needs_attention && (
                        <span title="Necesita atención del equipo" aria-label="Necesita atención">
                          ❗
                        </span>
                      )}
                      <ChannelBadge channel={c.channel} />
                      <span className="truncate text-[13.5px] font-bold text-ink-title">
                        {c.display_name ?? `Contacto ${c.external_user_id.slice(-6)}`}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-1.5">
                      {c.kind === "social" && unread(c) && (
                        <span className="size-2 rounded-full bg-orange" aria-label="No leído" />
                      )}
                      <span className="text-[11px] text-ink-tertiary">{timeLabel(c.last_message_at)}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {c.kind === "social" ? (
                      <span
                        className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-extrabold ${STAGE_META[c.pipeline_stage]?.cls ?? "bg-cream text-ink-tertiary"}`}
                      >
                        {STAGE_META[c.pipeline_stage]?.label ?? c.pipeline_stage}
                      </span>
                    ) : (
                      <span className="flex-none rounded-full bg-cream px-2 py-0.5 text-[10px] font-extrabold text-ink-tertiary">
                        Asistente IA
                      </span>
                    )}
                    {c.human_takeover && (
                      <span className="flex-none rounded-full bg-pink/15 px-2 py-0.5 text-[10px] font-extrabold text-pink">
                        EQUIPO
                      </span>
                    )}
                    <span className="truncate text-xs text-ink-tertiary">
                      {c.preview ?? metaCanal(c.channel).label}
                    </span>
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="p-6 text-center text-xs text-ink-tertiary">
                  Sin conversaciones con los filtros elegidos.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Hilo */}
      <div className={`w-full flex-1 flex-col md:flex ${selected ? "flex" : "hidden"}`}>
        {!selected ? (
          <div className="grid flex-1 place-items-center p-8 text-sm text-ink-tertiary">
            Elige una conversación para ver el hilo.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border-divider px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  onClick={() => setSelectedId(null)}
                  className="grid size-8 flex-none place-items-center rounded-full text-ink-secondary hover:bg-cream md:hidden"
                  aria-label="Volver a la lista"
                >
                  ←
                </button>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <ChannelBadge channel={selected.channel} />
                    <span className="truncate text-sm font-bold text-ink-title">
                      {selected.display_name ?? `Contacto ${selected.external_user_id.slice(-6)}`}
                    </span>
                  </span>
                  <span className="text-[11px] text-ink-tertiary">
                    {selected.kind === "portal"
                      ? "chat del miembro con el asistente · solo lectura"
                      : `${selected.channel === "whatsapp" ? `+${selected.external_user_id} · ` : ""}${
                          selected.human_takeover ? "responde el equipo 👤" : "responde la IA 🤖"
                        }`}
                  </span>
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {selected.kind === "social" && (
                <>
                {/* Etapa del pipeline — la IA clasifica, el equipo corrige aquí */}
                <select
                  aria-label="Etapa de ventas"
                  value={selected.pipeline_stage}
                  onChange={(e) => onStageChange(e.target.value)}
                  className="h-9 max-w-[130px] rounded-[10px] border-[1.5px] border-border-input bg-white px-2 text-[12px] font-semibold text-ink-title outline-none focus:border-teal"
                >
                  {STAGES.map((st) => (
                    <option key={st} value={st}>
                      {STAGE_META[st].label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={onToggleTakeover}
                  className={`flex-none rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${
                    selected.human_takeover
                      ? "bg-cream text-ink-title hover:bg-border-divider"
                      : "bg-teal text-white hover:bg-teal-deep"
                  }`}
                >
                  {selected.human_takeover ? "Devolver a la IA" : "Tomar conversación"}
                </button>
                </>
                )}
              </div>
            </div>

            <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-cream px-4 py-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] whitespace-pre-wrap rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-snug ${
                    m.direction === "in"
                      ? "mr-auto rounded-bl-[4px] bg-white text-ink-title shadow-[0_1px_4px_rgba(30,83,80,.08)]"
                      : "ml-auto rounded-br-[4px] bg-teal text-white"
                  }`}
                >
                  {m.direction === "out" && (
                    <span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-white/70">
                      {m.sender === "ai" ? "🤖 Agente IA" : "👤 Equipo"}
                    </span>
                  )}
                  {m.content}
                  <span
                    className={`mt-1 block text-[10px] ${m.direction === "in" ? "text-ink-tertiary" : "text-white/60"}`}
                  >
                    {timeLabel(m.created_at)}
                  </span>
                </div>
              ))}
            </div>

            {notice && (
              <p className="border-t border-border-divider bg-orange/10 px-4 py-2 text-xs font-semibold text-ink-title">
                ⚠️ {notice}
              </p>
            )}

            {selected.kind === "portal" ? (
              <p className="border-t border-border-divider bg-cream px-4 py-3 text-xs text-ink-tertiary">
                👁️ Vista de supervisión: el miembro conversa con el asistente IA
                dentro de su portal. Para contactarlo directamente, usa
                Comunicados o su perfil en Miembros.
              </p>
            ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSend();
              }}
              className="flex items-center gap-2 border-t border-border-divider p-3"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  selected.human_takeover
                    ? "Escribe como el equipo…"
                    : "Toma la conversación para responder a mano (o escribe y la IA se pausa sola)"
                }
                maxLength={2000}
                className="h-11 flex-1 rounded-full border-[1.5px] border-border-input px-4 text-sm text-ink-title outline-none focus:border-teal"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Enviar"
                className="grid size-11 flex-none place-items-center rounded-full bg-teal text-white transition-colors hover:bg-teal-deep disabled:opacity-40"
              >
                ➤
              </button>
            </form>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}
