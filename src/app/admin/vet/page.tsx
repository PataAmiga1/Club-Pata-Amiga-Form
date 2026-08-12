import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateEs } from "@/lib/dates";
import { MiniBarChart } from "@/components/panel/MiniBarChart";
import { FilterChips } from "@/components/panel/FilterChips";

export const metadata = { title: "Orientación vet 24/7 · Panel" };

/**
 * Métricas de la orientación veterinaria 24/7 — destino de la tarjeta
 * "Orientaciones vet" del resumen: conversaciones por mes y las más
 * recientes, con el miembro y su volumen de mensajes.
 */
export default async function AdminVetPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; orden?: string }>;
}) {
  const { q, orden } = await searchParams;
  const query = q?.trim().toLowerCase() ?? "";
  // Por omisión las más recientes arriba, con filtro para invertir (Fase 4)
  const masAntiguas = orden === "antiguas";
  const admin = createAdminClient();

  const yearAgo = new Date();
  yearAgo.setMonth(yearAgo.getMonth() - 11);
  yearAgo.setDate(1);

  const [{ data: conversations }, { count: totalCount }] = await Promise.all([
    admin
      .from("vet_conversations")
      .select(
        "id, created_at, updated_at, profiles!user_id(first_name, last_name, email), vet_messages(id)",
      )
      .gte("created_at", yearAgo.toISOString())
      .order("created_at", { ascending: false }),
    admin
      .from("vet_conversations")
      .select("id", { count: "exact", head: true }),
  ]);

  const rows = conversations ?? [];

  // Serie mensual (últimos 12 meses)
  const keys: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  const series = keys.map((key) => ({
    label: new Intl.DateTimeFormat("es-MX", { month: "short" })
      .format(new Date(`${key}-15T12:00:00`))
      .replace(".", ""),
    value: rows.filter((c) => c.created_at.slice(0, 7) === key).length,
  }));

  const monthKey = keys[keys.length - 1];
  const monthCount = rows.filter(
    (c) => c.created_at.slice(0, 7) === monthKey,
  ).length;

  const memberOf = (p: unknown) => {
    const m = (Array.isArray(p) ? p[0] : p) as {
      first_name: string | null;
      last_name: string | null;
      email: string;
    } | null;
    if (!m) return "Miembro";
    return m.first_name
      ? `${m.first_name} ${m.last_name ?? ""}`.trim()
      : m.email;
  };

  // Búsqueda por miembro y orden de la tabla (Fase 4: filtros en todas las
  // listas). Las tarjetas y la gráfica siguen contando TODO: el filtro solo
  // acota la tabla de conversaciones.
  const emailOf = (p: unknown) => {
    const m = (Array.isArray(p) ? p[0] : p) as { email?: string } | null;
    return m?.email ?? "";
  };
  const tabla = rows.filter(
    (c) =>
      !query ||
      memberOf(c.profiles).toLowerCase().includes(query) ||
      emailOf(c.profiles).toLowerCase().includes(query),
  );
  if (masAntiguas) tabla.reverse();

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div>
        <h1 className="font-display text-[26px] text-ink-title">
          Orientación veterinaria 24/7
        </h1>
        <p className="text-[13px] text-ink-secondary">
          Conversaciones de los miembros con la orientación veterinaria.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <span className="text-[11px] font-bold tracking-[.06em] text-ink-tertiary">
            ESTE MES
          </span>
          <span className="font-display text-[28px] text-ink-title">
            {monthCount}
          </span>
          <span className="text-[11.5px] text-ink-tertiary">conversaciones</span>
        </div>
        <div className="flex flex-col gap-1 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <span className="text-[11px] font-bold tracking-[.06em] text-ink-tertiary">
            ÚLTIMOS 12 MESES
          </span>
          <span className="font-display text-[28px] text-ink-title">
            {rows.length}
          </span>
          <span className="text-[11.5px] text-ink-tertiary">conversaciones</span>
        </div>
        <div className="flex flex-col gap-1 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <span className="text-[11px] font-bold tracking-[.06em] text-ink-tertiary">
            HISTÓRICO
          </span>
          <span className="font-display text-[28px] text-ink-title">
            {(totalCount ?? 0).toLocaleString("es-MX")}
          </span>
          <span className="text-[11.5px] text-ink-tertiary">
            desde el lanzamiento
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <span className="text-[11px] font-bold tracking-[.06em] text-ink-tertiary">
            MENSAJES PROMEDIO
          </span>
          <span className="font-display text-[28px] text-ink-title">
            {rows.length
              ? Math.round(
                  rows.reduce(
                    (sum, c) => sum + (c.vet_messages?.length ?? 0),
                    0,
                  ) / rows.length,
                )
              : 0}
          </span>
          <span className="text-[11.5px] text-ink-tertiary">
            por conversación
          </span>
        </div>
      </div>

      <MiniBarChart
        title="Conversaciones por mes"
        data={series}
        color="#1CBCAD"
      />

      <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg text-ink-title">
            Conversaciones recientes
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <FilterChips
              basePath="/admin/vet"
              current={orden}
              param="orden"
              keep={{ q: query || undefined }}
              allLabel="Más recientes"
              options={[{ value: "antiguas", label: "Más antiguas" }]}
            />
            <form action="/admin/vet" className="flex items-center gap-2">
              {orden && <input type="hidden" name="orden" value={orden} />}
              <input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Buscar miembro…"
                className="h-9 w-[190px] rounded-full border-[1.5px] border-border-input bg-white px-3.5 text-[12.5px] text-ink-title outline-none focus:border-teal"
              />
              <button
                type="submit"
                className="grid h-9 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep"
              >
                Buscar
              </button>
            </form>
          </div>
        </div>
        <div className="flex flex-col overflow-x-auto">
          <div className="grid min-w-[480px] grid-cols-[1fr_130px_110px] gap-2 border-b-[1.5px] border-[#F2EEE4] py-2 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder">
            <span>MIEMBRO</span>
            <span>INICIO</span>
            <span>MENSAJES</span>
          </div>
          {tabla.slice(0, 20).map((c) => (
            <div
              key={c.id}
              className="grid min-w-[480px] grid-cols-[1fr_130px_110px] items-center gap-2 border-b border-[#F2EEE4] py-[10px] text-[12.5px] text-ink-body"
            >
              <span>{memberOf(c.profiles)}</span>
              <span>{formatDateEs(new Date(c.created_at))}</span>
              <span>{c.vet_messages?.length ?? 0}</span>
            </div>
          ))}
          {tabla.length === 0 && (
            <span className="py-3 text-sm text-ink-secondary">
              {query
                ? "Sin conversaciones de ese miembro."
                : "Aún no hay conversaciones."}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
