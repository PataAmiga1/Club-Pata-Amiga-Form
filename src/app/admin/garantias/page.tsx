import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateEs } from "@/lib/dates";
import { GarantiaAcciones } from "./GarantiaAcciones";

const pesos = (c: number) => `$${(c / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

/** Garantías de 90 días de la membresía $599 (sección 6). */
export default async function GarantiasPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("guarantee_requests")
    .select("id, status, paid_cents, reimbursed_cents, refund_cents, member_comment, team_notes, requested_at, resolved_at, pets(name), profiles!user_id(first_name, last_name, email)")
    .order("requested_at", { ascending: false })
    .limit(100);
  const filas = data ?? [];
  const pendientes = filas.filter((f) => f.status === "pendiente");

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-col gap-1">
        <Link href="/admin/finanzas" className="text-[12.5px] font-semibold text-teal-deep hover:underline">
          ← Finanzas
        </Link>
        <h1 className="font-display text-[26px] text-ink-title">Garantías de satisfacción</h1>
        <p className="max-w-[680px] text-sm leading-relaxed text-ink-secondary">
          Membresía $599: en sus primeros 90 días, la persona recibe lo que pagó por
          ese peludo menos lo que ya se le reintegró. El sistema calcula el monto;
          aquí se confirma. Al confirmar se reembolsa en Stripe, se cancela esa
          membresía y se anulan sus comisiones de embajador sin pagar. Solo super
          admin.
        </p>
      </div>
      {pendientes.length === 0 && (
        <div className="rounded-[18px] bg-white p-5 text-sm text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          No hay garantías por confirmar.
        </div>
      )}
      <div className="flex flex-col gap-3">
        {filas.map((f) => {
          const persona = (Array.isArray(f.profiles) ? f.profiles[0] : f.profiles) as
            | { first_name?: string; last_name?: string; email?: string }
            | null;
          const pet = (Array.isArray(f.pets) ? f.pets[0] : f.pets) as { name?: string } | null;
          return (
            <div
              key={f.id}
              className="flex flex-col gap-2 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-bold text-ink-title">
                  {pet?.name ?? "Peludo"} ·{" "}
                  {persona?.first_name
                    ? `${persona.first_name} ${persona.last_name ?? ""}`.trim()
                    : persona?.email}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold ${
                    f.status === "pendiente"
                      ? "bg-warning-bg text-warning-text"
                      : f.status === "reembolsada"
                        ? "bg-success-bg text-success-text"
                        : "bg-cream text-ink-tertiary"
                  }`}
                >
                  {f.status.toUpperCase()}
                </span>
              </div>
              <span className="text-[13px] text-ink-body">
                Pagado {pesos(f.paid_cents)} · reintegrado {pesos(f.reimbursed_cents)} ·{" "}
                <strong>a reembolsar {pesos(f.refund_cents)}</strong>
              </span>
              <span className="text-[12px] text-ink-tertiary">
                Pedida el {formatDateEs(f.requested_at)}
                {f.resolved_at ? ` · resuelta el ${formatDateEs(f.resolved_at)}` : ""}
                {f.member_comment ? ` · «${f.member_comment}»` : ""}
                {f.team_notes ? ` · nota: ${f.team_notes}` : ""}
              </span>
              {f.status === "pendiente" && <GarantiaAcciones id={f.id} monto={pesos(f.refund_cents)} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
