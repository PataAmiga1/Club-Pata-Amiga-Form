import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { REIMBURSEMENT_CATEGORY_LABELS } from "@/lib/constants";
import { formatMxn, hoursSince } from "@/lib/format";
import { FilterChips } from "@/components/panel/FilterChips";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_review: "En revisión",
  approved: "Aprobado",
  partial: "Parcial",
  rejected: "Rechazado",
  paid: "Pagado",
};

export default async function AdminReintegrosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; tipo?: string; orden?: string }>;
}) {
  const { estado, tipo, orden } = await searchParams;
  const admin = createAdminClient();
  // Por omisión los más recientes arriba, con filtro para invertir (Fase 4)
  const masAntiguos = orden === "antiguos";
  // Los filtros van EN la consulta: filtrarlos después del limit escondía
  // solicitudes que no cupieran entre las 100 más recientes.
  let rowsQuery = admin
    .from("reimbursements")
    .select(
      "id, folio, category, amount_requested, amount_approved, status, created_at, pets(name, species), profiles!user_id(first_name, last_name, email)",
    )
    .order("created_at", { ascending: masAntiguos })
    .limit(100);
  if (estado) rowsQuery = rowsQuery.eq("status", estado);
  if (tipo) rowsQuery = rowsQuery.eq("category", tipo);
  const { data: rowsRaw } = await rowsQuery;
  const rows = rowsRaw ?? [];

  const memberName = (p: unknown) => {
    const prof = (Array.isArray(p) ? p[0] : p) as {
      first_name?: string;
      last_name?: string;
      email?: string;
    } | null;
    return prof?.first_name
      ? `${prof.first_name} ${prof.last_name ?? ""}`.trim()
      : (prof?.email ?? "Miembro");
  };

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-[26px] text-ink-title">Reintegros</h1>
        <div className="flex flex-wrap gap-2">
          {/* Cuando hay centros, el gasto sale como pago directo, no como
              reintegro — acceso pedido por el equipo (5-ago). */}
          <Link
            href="/admin/centros/pagos"
            className="grid h-9 place-items-center rounded-full border-[1.5px] border-teal px-4 text-xs font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            🏥 Pagos a centros de bienestar →
          </Link>
          <a
            href="/api/admin/layouts/reintegros"
            title="CSV con CLABE, beneficiario y monto de los reintegros aprobados del mes — para dispersión masiva (SPEI) en el portal del banco"
            className="grid h-9 place-items-center rounded-full border-[1.5px] border-teal px-4 text-xs font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            ⬇ Layout bancario del mes (CSV)
          </a>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          basePath="/admin/reintegros"
          current={estado}
          keep={{ tipo, orden }}
          allLabel="Todos"
          options={[
            { value: "pending", label: "Pendientes" },
            { value: "in_review", label: "En revisión" },
            { value: "approved", label: "Aprobados" },
            { value: "rejected", label: "Rechazados" },
            { value: "paid", label: "Pagados" },
          ]}
        />
        <FilterChips
          basePath="/admin/reintegros"
          current={orden}
          param="orden"
          keep={{ estado, tipo }}
          allLabel="Más recientes"
          options={[{ value: "antiguos", label: "Más antiguos" }]}
        />
      </div>
      {/* Filtro por tipo de gasto (petición del equipo, 5-ago) */}
      <FilterChips
        basePath="/admin/reintegros"
        current={tipo}
        param="tipo"
        keep={{ estado, orden }}
        allLabel="Todos los tipos"
        options={Object.entries(REIMBURSEMENT_CATEGORY_LABELS).map(
          ([value, label]) => ({ value, label }),
        )}
      />
      <div className="flex flex-col overflow-x-auto rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        {/* Miembro y mascota en columnas separadas (petición del equipo, 5-ago) */}
        <div className="grid min-w-[820px] grid-cols-[80px_1fr_140px_120px_100px_100px_90px] gap-2 border-b-[1.5px] border-[#F2EEE4] py-2 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder">
          <span>FOLIO</span>
          <span>MIEMBRO</span>
          <span>MASCOTA</span>
          <span>TIPO</span>
          <span>MONTO</span>
          <span>ESTADO</span>
          <span>ESPERA</span>
        </div>
        {(rows ?? []).map((r) => {
          const pet = (Array.isArray(r.pets) ? r.pets[0] : r.pets) as {
            name: string;
            species: string;
          } | null;
          const open = r.status === "pending" || r.status === "in_review";
          return (
            <Link
              key={r.id}
              href={`/admin/reintegros/${r.id}`}
              className="grid min-w-[820px] grid-cols-[80px_1fr_140px_120px_100px_100px_90px] items-center gap-2 border-b border-[#F2EEE4] py-[11px] text-[12.5px] text-ink-body transition-colors hover:bg-cream"
            >
              <span className="font-bold text-teal-deep">{r.folio}</span>
              <span>{memberName(r.profiles)}</span>
              <span>
                {pet?.name} {pet?.species === "dog" ? "🐕" : "🐈"}
              </span>
              <span>
                {REIMBURSEMENT_CATEGORY_LABELS[
                  r.category as keyof typeof REIMBURSEMENT_CATEGORY_LABELS
                ] ?? r.category}
              </span>
              <span className="font-bold">
                {formatMxn(Number(r.amount_approved ?? r.amount_requested))}
              </span>
              <span>{STATUS_LABEL[r.status] ?? r.status}</span>
              <span className="text-ink-tertiary">
                {open ? `${hoursSince(r.created_at)} hrs` : "—"}
              </span>
            </Link>
          );
        })}
        {(rows ?? []).length === 0 && (
          <span className="py-3 text-sm text-ink-secondary">
            Sin solicitudes todavía.
          </span>
        )}
      </div>
    </div>
  );
}
