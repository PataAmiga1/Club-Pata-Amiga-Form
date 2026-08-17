import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  REIMBURSEMENT_CATEGORY_LABELS,
  REIMBURSEMENT_SLA_HOURS,
} from "@/lib/constants";
import { beneficiosDe, topesDe } from "@/lib/plans/resolve";
import {
  calculateBalances,
  startOfCurrentYear,
} from "@/lib/reimbursement-balance";
import { formatMxn } from "@/lib/format";
import { formatDateEs } from "@/lib/dates";

const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  pending: { text: "EN REVISIÓN", cls: "bg-warning-bg text-warning-text" },
  in_review: { text: "EN REVISIÓN", cls: "bg-warning-bg text-warning-text" },
  approved: { text: "✓ APROBADO", cls: "bg-success-bg text-success-text" },
  partial: { text: "✓ APROBADO PARCIAL", cls: "bg-success-bg text-success-text" },
  rejected: { text: "RECHAZADO", cls: "bg-error-bg text-error-text" },
  paid: { text: "✓ PAGADO", cls: "bg-info-bg text-info-text" },
};

const BALANCE_CARDS = [
  { key: "vet_expenses" as const, emoji: "🚑", label: "Gastos veterinarios" },
  { key: "death" as const, emoji: "🕊️", label: "Fallecimiento" },
  { key: "vaccines" as const, emoji: "💉", label: "Vacunas" },
];

export default async function ReintegrosPage({
  searchParams,
}: {
  searchParams: Promise<{ enviada?: string }>;
}) {
  const { enviada } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/reintegros");

  const [{ data: rows }, { data: yearRows }, { data: sub }] = await Promise.all([
    supabase
      .from("reimbursements")
      .select(
        "id, folio, category, amount_requested, amount_approved, status, rejection_reason, created_at, pets(name)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    // Solo las solicitudes del año calendario consumen saldo (se renueva en enero)
    supabase
      .from("reimbursements")
      .select("category, amount_requested, amount_approved, status")
      .eq("user_id", user.id)
      .gte("created_at", startOfCurrentYear()),
    // Los topes salen de lo que ESTE miembro contrató, no de una constante
    // global: si el plan cambia después, su saldo no se mueve.
    supabase
      .from("subscriptions")
      .select("benefits_snapshot")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const beneficios = beneficiosDe(
    sub?.benefits_snapshot as Record<string, unknown> | null,
  );
  const balances = calculateBalances(yearRows ?? [], topesDe(beneficios));
  const year = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:gap-[22px] md:px-[34px] md:py-[30px]">
      {enviada && (
        <div className="rounded-[14px] bg-success-bg px-4 py-3 text-sm font-semibold text-success-text">
          💚 Tu solicitud quedó registrada. El comité la revisa y te
          respondemos en máximo {REIMBURSEMENT_SLA_HOURS} horas.
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] text-ink-title md:text-[32px]">
            Reintegros
          </h1>
          <p className="text-[12.5px] text-ink-secondary md:text-sm">
            Envías tu factura y te reintegramos en máximo{" "}
            {REIMBURSEMENT_SLA_HOURS} horas tras la aprobación del comité.
          </p>
        </div>
        <Link
          href="/app/reintegros/nueva"
          className="grid h-11 flex-none place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep"
        >
          + Nueva solicitud
        </Link>
      </div>

      {/* Saldos del año por categoría (usado / disponible; se renuevan en enero) */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 md:gap-4">
        {BALANCE_CARDS.map((c) => {
          const b = balances[c.key];
          const pct = b.limit > 0 ? (b.used / b.limit) * 100 : 0;
          return (
            <div
              key={c.key}
              className="flex flex-col gap-2 rounded-[16px] bg-white px-4 py-3.5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                  {c.emoji} {c.label.toUpperCase()}
                </span>
                <span className="text-[11px] text-ink-placeholder">{year}</span>
              </div>
              <span className="font-display text-[22px] leading-none text-ink-title">
                {formatMxn(b.available)}{" "}
                <span className="text-[13px] text-ink-tertiary">
                  disponibles
                </span>
              </span>
              <div className="h-2 rounded-full bg-[#EFEAE0]">
                <div
                  className={`h-full rounded-full ${b.available === 0 ? "bg-orange" : "bg-teal"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[11.5px] text-ink-tertiary">
                Usaste {formatMxn(b.used)} de {formatMxn(b.limit)} MXN — tu
                saldo se renueva en enero.
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        {(rows ?? []).map((r) => {
          const chip = STATUS_CHIP[r.status] ?? STATUS_CHIP.pending;
          const pet = Array.isArray(r.pets)
            ? (r.pets[0] as { name: string } | undefined)
            : (r.pets as { name: string } | null);
          return (
            <Link
              key={r.id}
              href={`/app/reintegros/${r.id}`}
              className="flex flex-col gap-2 rounded-[16px] bg-white px-4 py-3.5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[0_6px_18px_rgba(30,83,80,.12)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:px-5"
            >
              <span className="w-16 font-bold text-teal-deep">{r.folio}</span>
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-bold text-ink-title">
                  {pet?.name ?? "Peludo"} ·{" "}
                  {REIMBURSEMENT_CATEGORY_LABELS[
                    r.category as keyof typeof REIMBURSEMENT_CATEGORY_LABELS
                  ] ?? r.category}
                </span>
                <span className="text-xs text-ink-tertiary">
                  Solicitado el {formatDateEs(new Date(r.created_at))}
                  {r.status === "rejected" && r.rejection_reason
                    ? ` · Motivo: ${r.rejection_reason}`
                    : ""}
                </span>
              </div>
              <span className="text-sm font-bold text-ink-title">
                {r.amount_approved != null && r.status !== "pending"
                  ? `${formatMxn(Number(r.amount_approved))} de ${formatMxn(Number(r.amount_requested))}`
                  : formatMxn(Number(r.amount_requested))}{" "}
                MXN
              </span>
              <span
                className={`self-start rounded-full px-3 py-1 text-[11px] font-extrabold tracking-[.04em] sm:self-auto ${chip.cls}`}
              >
                {chip.text}
              </span>
              <span className="hidden text-sm font-bold text-teal-deep sm:inline">
                →
              </span>
            </Link>
          );
        })}
        {(rows ?? []).length === 0 && (
          <div className="rounded-[20px] bg-white p-6 text-sm text-ink-secondary shadow-[var(--shadow-card)]">
            Aún no tienes solicitudes de reintegro. Cuando tu peludo cumpla su
            tiempo de espera podrás enviar la primera.
          </div>
        )}
      </div>
    </div>
  );
}
