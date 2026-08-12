import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRole } from "@/lib/admin-guard";
import { formatDateEs } from "@/lib/dates";
import { FilterChips } from "@/components/panel/FilterChips";

const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  active: { text: "ACTIVO", cls: "bg-success-bg text-success-text" },
  pending_payment: { text: "SIN PAGO", cls: "bg-warning-bg text-warning-text" },
  canceled: { text: "CANCELADO", cls: "bg-error-bg text-error-text" },
  past_due: { text: "PAGO VENCIDO", cls: "bg-error-bg text-error-text" },
};

type Sub = {
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  mother_last_name: string | null;
  email: string | null;
  phone: string | null;
  membership_status: string;
  member_since: string | null;
  created_at: string;
  birth_date: string | null;
  nationality: string | null;
  bank_name: string | null;
  clabe: string | null;
  cfdi_requested: boolean | null;
  profile_completed: boolean | null;
  pets: { id: string; name: string; is_active: boolean }[];
  subscriptions: Sub[];
};

/** Una columna de la tabla: encabezado, ancho de la rejilla y cómo pintarse. */
type Col = { h: string; w: string; render: (m: Row) => React.ReactNode };

/**
 * Directorio de miembros con buscador global (nombre, correo, mascota o folio
 * R-####) y las TRES poblaciones separadas que pidió el equipo (Fase 4):
 * pagaron y siguen activos · pagaron y ya no · registrados que nunca pagaron
 * (tabla aparte, con teléfono para poder contactarlos). Cada vista trae sus
 * columnas: próximo pago, nacimiento, nacionalidad, banco/CLABE y motivo de
 * baja donde aplica. "Nunca pagó" = sin fecha de "miembro desde", que solo se
 * escribe al confirmarse el primer pago (verificado contra la base: ningún
 * activo carece de ella).
 */
export default async function AdminMiembrosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; factura?: string; estado?: string }>;
}) {
  const { q, factura, estado } = await searchParams;
  const query = q?.trim() ?? "";
  const admin = createAdminClient();
  const isSuper = (await getAdminRole()) === "super_admin";

  // Folio directo: R-#### abre el reintegro
  if (/^r-\d+$/i.test(query)) {
    const { data: r } = await admin
      .from("reimbursements")
      .select("id")
      .eq("folio", query.toUpperCase())
      .maybeSingle();
    if (r) {
      const { redirect } = await import("next/navigation");
      redirect(`/admin/reintegros/${r.id}`);
    }
  }

  let memberIds: string[] | null = null;
  if (query && !/^[ra]-\d+$/i.test(query)) {
    // Mascotas que coincidan → dueños incluidos en el resultado
    const { data: petOwners } = await admin
      .from("pets")
      .select("user_id")
      .ilike("name", `%${query}%`)
      .limit(50);
    memberIds = [...new Set((petOwners ?? []).map((p) => p.user_id))];
  }

  let membersQuery = admin
    .from("profiles")
    .select(
      "id, first_name, last_name, mother_last_name, email, phone, membership_status, member_since, created_at, birth_date, nationality, bank_name, clabe, cfdi_requested, profile_completed, pets!user_id(id, name, is_active), subscriptions(plan, status, current_period_end, cancel_at_period_end)",
    )
    .eq("role", "member")
    .order("created_at", { ascending: false })
    .limit(100);

  // Las poblaciones se separan EN LA CONSULTA: filtrarlas después del limit
  // escondía a los inactivos que no cupieran entre los 100 más recientes.
  if (estado === "activos")
    membersQuery = membersQuery.eq("membership_status", "active");
  else if (estado === "inactivos")
    membersQuery = membersQuery
      .neq("membership_status", "active")
      .not("member_since", "is", null);
  else if (estado === "nunca")
    membersQuery = membersQuery.is("member_since", null);
  if (factura === "si") membersQuery = membersQuery.eq("cfdi_requested", true);
  else if (factura === "no")
    membersQuery = membersQuery.not("cfdi_requested", "is", true);

  if (query && !/^[ra]-\d+$/i.test(query)) {
    const like = `%${query.replace(/[%_,]/g, "")}%`;
    const orParts = [
      `first_name.ilike.${like}`,
      `last_name.ilike.${like}`,
      `email.ilike.${like}`,
    ];
    if (memberIds && memberIds.length > 0)
      orParts.push(`id.in.(${memberIds.join(",")})`);
    membersQuery = membersQuery.or(orParts.join(","));
  }

  // Contadores reales de toda la base (no solo la página visible)
  const base = () =>
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "member");
  const [{ data: membersRaw }, activosQ, exMiembrosQ, nuncaQ, facturaQ] =
    await Promise.all([
      membersQuery,
      base().eq("membership_status", "active"),
      base().neq("membership_status", "active").not("member_since", "is", null),
      base().is("member_since", null),
      base().eq("cfdi_requested", true),
    ]);
  const members = (membersRaw ?? []) as unknown as Row[];

  // Motivo de baja: la cancelación más reciente de cada miembro listado
  const motivoDeBaja = new Map<string, string>();
  if (estado === "inactivos" && members.length > 0) {
    const { data: bajas } = await admin
      .from("cancellations")
      .select("user_id, reason, created_at")
      .in("user_id", members.map((m) => m.id))
      .order("created_at", { ascending: false });
    for (const b of bajas ?? [])
      if (b.reason && !motivoDeBaja.has(b.user_id))
        motivoDeBaja.set(b.user_id, b.reason);
  }

  const fullName = (m: Row) =>
    [m.first_name, m.last_name, m.mother_last_name].filter(Boolean).join(" ") ||
    "Sin nombre";
  const fecha = (iso: string | null | undefined, conHora = false) =>
    iso ? formatDateEs(new Date(conHora ? iso : iso.slice(0, 10) + "T12:00:00")) : "—";
  const activeSub = (m: Row) =>
    (m.subscriptions ?? []).find((s) => s.status === "active");
  const planLabel = (s?: Sub) =>
    s?.plan === "annual" ? "Anual" : s?.plan === "monthly" ? "Mensual" : "—";

  /* ---- Celdas reutilizadas entre vistas ---- */
  const cMiembro: Col = {
    h: "MIEMBRO",
    w: "minmax(200px,1fr)",
    render: (m) => (
      <span className="min-w-0">
        <strong className="text-ink-title">{fullName(m)}</strong>
        <span className="block truncate text-ink-tertiary">{m.email}</span>
      </span>
    ),
  };
  const cEstatus: Col = {
    h: "ESTATUS",
    w: "100px",
    render: (m) => {
      const chip = STATUS_CHIP[m.membership_status] ?? STATUS_CHIP.pending_payment;
      return (
        <span
          className={`justify-self-start rounded-full px-2.5 py-[3px] text-[10.5px] font-extrabold ${chip.cls}`}
        >
          {chip.text}
        </span>
      );
    },
  };
  const cPlan: Col = { h: "PLAN", w: "72px", render: (m) => planLabel(activeSub(m)) };
  const cProximoPago: Col = {
    h: "PRÓXIMO PAGO",
    w: "110px",
    render: (m) => {
      const s = activeSub(m);
      // Activo sin suscripción registrada = cobro heredado (plataforma
      // anterior); no se inventa fecha — mismo criterio que situacionDeCobro.
      if (!s) return m.membership_status === "active" ? "Heredado" : "—";
      if (!s.current_period_end) return "—";
      return `${s.cancel_at_period_end ? "Termina" : ""} ${fecha(s.current_period_end, true)}`.trim();
    },
  };
  const cSolicitud: Col = {
    h: "SOLICITUD",
    w: "105px",
    render: (m) => formatDateEs(new Date(m.created_at)),
  };
  const cDesde: Col = {
    h: "MIEMBRO DESDE",
    w: "110px",
    render: (m) => fecha(m.member_since, true),
  };
  const cNacimiento: Col = {
    h: "NACIMIENTO",
    w: "100px",
    render: (m) => fecha(m.birth_date),
  };
  const cNacionalidad: Col = {
    h: "NACIONALIDAD",
    w: "105px",
    render: (m) => m.nationality || "—",
  };
  const cBanco: Col = {
    h: "BANCO · CLABE",
    w: "150px",
    render: (m) => {
      if (!m.bank_name && !m.clabe) return "—";
      // La CLABE completa es dato sensible: solo la ve el super admin;
      // el admin normal ve los últimos 4 dígitos.
      const clabe = m.clabe
        ? isSuper
          ? m.clabe
          : `•••${m.clabe.slice(-4)}`
        : null;
      return (
        <span className="min-w-0">
          {m.bank_name || "Banco sin capturar"}
          {clabe && (
            <span className="block truncate text-[11px] text-ink-tertiary">{clabe}</span>
          )}
        </span>
      );
    },
  };
  const cPerfil: Col = {
    h: "PERFIL",
    w: "92px",
    render: (m) => (
      <span
        className={`justify-self-start rounded-full px-2 py-[3px] text-[10px] font-extrabold ${
          m.profile_completed
            ? "bg-success-bg text-success-text"
            : "bg-warning-bg text-warning-text"
        }`}
      >
        {m.profile_completed ? "COMPLETO" : "INCOMPLETO"}
      </span>
    ),
  };
  const cFactura: Col = {
    h: "FACTURA",
    w: "68px",
    render: (m) => (m.cfdi_requested ? "Sí 🧾" : "No"),
  };
  const cMascotas: Col = {
    h: "MASCOTAS",
    w: "140px",
    render: (m) => {
      const activas = (m.pets ?? []).filter((p) => p.is_active);
      if (activas.length === 0) return "0 🐾";
      return (
        <span className="min-w-0">
          {activas.length} 🐾
          <span className="block truncate text-[11px] text-ink-tertiary">
            {activas.map((p) => p.name).join(", ")}
          </span>
        </span>
      );
    },
  };
  const cTelefono: Col = {
    h: "TELÉFONO",
    w: "110px",
    render: (m) => m.phone || "—",
  };
  const cMotivoBaja: Col = {
    h: "MOTIVO DE BAJA",
    w: "150px",
    render: (m) => (
      <span className="min-w-0 truncate" title={motivoDeBaja.get(m.id)}>
        {motivoDeBaja.get(m.id) || "—"}
      </span>
    ),
  };

  // Cada población con las columnas que pidió el equipo (Fase 4)
  const cols: Col[] =
    estado === "activos"
      ? [cMiembro, cEstatus, cPlan, cProximoPago, cDesde, cNacimiento, cNacionalidad, cBanco, cPerfil, cFactura, cMascotas]
      : estado === "inactivos"
        ? [cMiembro, cEstatus, cMotivoBaja, cDesde, cNacimiento, cNacionalidad, cBanco, cPerfil, cFactura, cMascotas]
        : estado === "nunca"
          ? [cMiembro, cTelefono, cSolicitud, cNacimiento, cPerfil, cFactura, cMascotas]
          : [cMiembro, cEstatus, cPlan, cSolicitud, cDesde, cPerfil, cFactura, cMascotas];
  const gridCols = cols.map((c) => c.w).join(" ");
  const minW =
    estado === "activos" || estado === "inactivos" ? "min-w-[1250px]" : "min-w-[1000px]";

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[26px] text-ink-title">Miembros</h1>
          <p className="text-sm text-ink-secondary">
            {members.length} resultado{members.length === 1 ? "" : "s"}
            {query ? ` para “${query}”` : " (más recientes)"} ·{" "}
            <strong className="text-success-text">
              {activosQ.count ?? 0} activos
            </strong>{" "}
            ·{" "}
            <strong className="text-ink-secondary">
              {exMiembrosQ.count ?? 0} pagaron y ya no están
            </strong>{" "}
            ·{" "}
            <strong className="text-warning-text">
              {nuncaQ.count ?? 0} nunca pagaron
            </strong>{" "}
            · {facturaQ.count ?? 0} solicitan factura
          </p>
        </div>
        <form action="/admin/miembros" className="flex items-center gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Nombre, correo, mascota o folio…"
            className="h-[42px] w-[280px] rounded-full border-[1.5px] border-border-input bg-white px-4 text-[13px] text-ink-title outline-none focus:border-teal"
          />
          <button
            type="submit"
            className="grid h-[42px] place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep"
          >
            Buscar
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <FilterChips
          basePath="/admin/miembros"
          current={estado}
          keep={{ q: query || undefined, factura }}
          allLabel="Todos"
          options={[
            { value: "activos", label: `Pagaron · activos (${activosQ.count ?? 0})` },
            { value: "inactivos", label: `Pagaron · inactivos (${exMiembrosQ.count ?? 0})` },
            { value: "nunca", label: `Nunca pagaron (${nuncaQ.count ?? 0})` },
          ]}
        />
        <FilterChips
          basePath="/admin/miembros"
          current={factura}
          param="factura"
          keep={{ q: query || undefined, estado }}
          allLabel="Con y sin factura"
          options={[
            { value: "si", label: "Solicitan factura" },
            { value: "no", label: "Sin factura" },
          ]}
        />
      </div>

      {estado === "nunca" && (
        <p className="rounded-[12px] bg-info-bg px-4 py-2.5 text-[12.5px] text-info-text">
          Personas que crearon su cuenta pero nunca completaron un pago: no son
          miembros. El teléfono y el correo están a la vista para poder
          contactarlas.
        </p>
      )}

      <div className="flex flex-col overflow-x-auto rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <div
          className={`grid ${minW} gap-2 border-b-[1.5px] border-[#F2EEE4] pb-2 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder`}
          style={{ gridTemplateColumns: gridCols }}
        >
          {cols.map((c) => (
            <span key={c.h}>{c.h}</span>
          ))}
        </div>
        {members.map((m) => (
          <Link
            key={m.id}
            href={`/admin/miembros/${m.id}`}
            className={`grid ${minW} items-center gap-2 border-b border-[#F2EEE4] py-[11px] text-[12.5px] text-ink-body transition-colors last:border-0 hover:bg-cream`}
            style={{ gridTemplateColumns: gridCols }}
          >
            {cols.map((c) => (
              <span key={c.h} className="min-w-0">
                {c.render(m)}
              </span>
            ))}
          </Link>
        ))}
        {members.length === 0 && (
          <span className="py-4 text-sm text-ink-secondary">
            Sin resultados. Prueba con otro nombre, correo, mascota o folio.
          </span>
        )}
      </div>
    </div>
  );
}
