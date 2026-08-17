import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateEs } from "@/lib/dates";
import { formatMxn } from "@/lib/format";
import { PaymentForm } from "./PaymentForm";
import { CONCEPT_LABELS } from "./concepts";

/**
 * Pagos a centros de bienestar (equipo, 5-ago) — etapa manual: el SPEI se
 * hace fuera de la plataforma; aquí queda el registro y la estadística, y
 * cada centro ve los suyos en su portal.
 */
export default async function AdminPagosCentrosPage() {
  const admin = createAdminClient();
  const [{ data: centers }, { data: payments }] = await Promise.all([
    admin
      .from("wellness_centers")
      .select("id, name")
      .eq("status", "approved")
      .order("name"),
    admin
      .from("center_payments")
      .select("id, concept, amount, notes, paid_at, wellness_centers(name)")
      .order("paid_at", { ascending: false })
      .limit(100),
  ]);

  const total = (payments ?? []).reduce(
    (s, p) => s + Number(p.amount ?? 0),
    0,
  );
  const centerName = (wc: unknown) =>
    ((Array.isArray(wc) ? wc[0] : wc) as { name?: string } | null)?.name ??
    "Centro";

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/centros"
          className="text-sm font-semibold text-teal-deep"
        >
          ← Centros
        </Link>
        <h1 className="font-display text-[26px] text-ink-title">
          Pagos a centros aliados
        </h1>
      </div>
      <p className="text-sm text-ink-secondary">
        {payments?.length ?? 0} pago{payments?.length === 1 ? "" : "s"}{" "}
        registrados · {formatMxn(total)} MXN en total
      </p>

      <PaymentForm centers={centers ?? []} />

      <div className="flex flex-col overflow-x-auto rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <div className="grid min-w-[720px] grid-cols-[1fr_150px_110px_120px_1fr] gap-2 border-b-[1.5px] border-[#F2EEE4] pb-2 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder">
          <span>CENTRO</span>
          <span>CONCEPTO</span>
          <span>MONTO</span>
          <span>FECHA</span>
          <span>NOTAS</span>
        </div>
        {(payments ?? []).map((p) => (
          <div
            key={p.id}
            className="grid min-w-[720px] grid-cols-[1fr_150px_110px_120px_1fr] items-center gap-2 border-b border-[#F2EEE4] py-[10px] text-[12.5px] text-ink-body last:border-0"
          >
            <span className="font-semibold text-ink-title">
              {centerName(p.wellness_centers)}
            </span>
            <span>{CONCEPT_LABELS[p.concept] ?? p.concept}</span>
            <span className="font-bold">{formatMxn(Number(p.amount))} MXN</span>
            <span>{formatDateEs(p.paid_at)}</span>
            <span className="truncate text-ink-tertiary">{p.notes ?? "—"}</span>
          </div>
        ))}
        {(payments ?? []).length === 0 && (
          <span className="py-3 text-sm text-ink-secondary">
            Aún sin pagos registrados.
          </span>
        )}
      </div>
    </div>
  );
}
