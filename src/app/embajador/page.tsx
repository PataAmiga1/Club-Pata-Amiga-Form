import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ZONA_MX } from "@/lib/zona-horaria";
import { formatMxn } from "@/lib/format";
import { AMBASSADOR_PAYOUT_DAY } from "@/lib/constants";
import { WelcomeOnce } from "@/components/app/WelcomeOnce";
import { CodeCard } from "./CodeCard";
import { getAmbassadorContext } from "./shared";

export const metadata = { title: "Dashboard de embajador · Club Pata Amiga" };

type ReferralRow = {
  id: string;
  created_at: string;
  commission_amount: number | null;
  status: string;
  subscriptions: {
    plan: string | null;
    status: string | null;
    updated_at: string | null;
  } | null;
};

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

const shortDate = (iso: string) =>
  // timeZone explícita: sin ella, un alta de la noche (hora CDMX) se corría
  // al día siguiente al renderizar en Vercel (UTC).
  new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: ZONA_MX,
  })
    .format(new Date(iso))
    .replace(".", "");

/** Resumen del embajador: código, KPIs, cortes mensuales y referidos (anónimos). */
export default async function EmbajadorResumenPage() {
  const { ambassador } = await getAmbassadorContext();
  const admin = createAdminClient();

  const [{ data: referralsRaw }, { data: payouts }] = await Promise.all([
    admin
      .from("referrals")
      .select(
        // Sin datos personales del referido: solo fechas, plan y estado
        "id, created_at, commission_amount, status, subscriptions(plan, status, updated_at)",
      )
      .eq("ambassador_id", ambassador.id)
      .order("created_at", { ascending: false }),
    admin
      .from("ambassador_payouts")
      .select("period_month, total_amount, status, paid_at")
      .eq("ambassador_id", ambassador.id)
      .order("period_month", { ascending: false })
      .limit(6),
  ]);

  const referrals: ReferralRow[] = (referralsRaw ?? []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    commission_amount: r.commission_amount,
    status: r.status,
    subscriptions: one(r.subscriptions),
  }));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const active = referrals.filter(
    (r) => !r.subscriptions?.status || r.subscriptions.status === "active",
  );
  const thisMonth = referrals.filter(
    (r) => new Date(r.created_at) >= monthStart,
  );
  const monthTotal = thisMonth.reduce(
    (sum, r) => sum + Number(r.commission_amount ?? 0),
    0,
  );
  const historicTotal = referrals.reduce(
    (sum, r) => sum + Number(r.commission_amount ?? 0),
    0,
  );
  const monthName = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    timeZone: ZONA_MX,
  }).format(now);

  const planLabel = (r: ReferralRow) => {
    const plan = r.subscriptions?.plan ?? null;
    return plan === "annual" ? "Anual" : plan === "monthly" ? "Mensual" : "—";
  };

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-5 py-5 sm:px-8">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <CodeCard
          code={ambassador.referral_code ?? ""}
          canCustomize={ambassador.code_change_count === 0}
        />
        {/* Finanzas del mes: KPIs y cortes mensuales juntos */}
        <div className="flex flex-col gap-3">
          <Link
            href="/embajador/metricas"
            className="flex items-center justify-between rounded-[16px] bg-white px-[18px] py-4 shadow-[0_2px_10px_rgba(30,83,80,.05)] transition-shadow hover:shadow-[0_6px_18px_rgba(30,83,80,.12)]"
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-bold tracking-[.06em] text-ink-tertiary">
                REFERIDOS ACTIVOS
              </span>
              <span className="font-display text-[26px] text-ink-title">
                {active.length}
              </span>
            </div>
            <span className="flex items-center gap-2 text-[11.5px] font-semibold text-teal-deep">
              {thisMonth.length > 0 && (
                <span className="text-success-text">
                  ▲ {thisMonth.length} este mes
                </span>
              )}
              Ver métricas →
            </span>
          </Link>
          <Link
            href="/embajador/metricas"
            className="flex items-center justify-between rounded-[16px] bg-white px-[18px] py-4 shadow-[0_2px_10px_rgba(30,83,80,.05)] transition-shadow hover:shadow-[0_6px_18px_rgba(30,83,80,.12)]"
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-bold tracking-[.06em] text-ink-tertiary">
                COMISIONES DE {monthName.toUpperCase()}
              </span>
              <span className="font-display text-[26px] text-ink-title">
                {formatMxn(monthTotal)} MXN
              </span>
            </div>
            <span className="text-[11.5px] text-ink-tertiary">
              Pago el día {AMBASSADOR_PAYOUT_DAY}
            </span>
          </Link>
          <div className="flex flex-col gap-2 rounded-[16px] bg-white px-[18px] py-4 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold tracking-[.06em] text-ink-tertiary">
                  TOTAL HISTÓRICO
                </span>
                <span className="font-display text-[26px] text-ink-title">
                  {formatMxn(historicTotal)} MXN
                </span>
              </div>
            </div>
            {(payouts ?? []).length > 0 && (
              <div className="flex flex-col border-t border-[#F2EEE4] pt-2">
                <span className="pb-1 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder">
                  TUS CORTES MENSUALES
                </span>
                {(payouts ?? []).map((p) => (
                  <div
                    key={p.period_month}
                    className="flex items-center justify-between border-b border-[#F2EEE4] py-1.5 text-[12.5px] text-ink-body last:border-0"
                  >
                    <span className="capitalize">
                      {new Intl.DateTimeFormat("es-MX", {
                        month: "long",
                        year: "numeric",
                      }).format(new Date(`${p.period_month}T12:00:00`))}
                    </span>
                    <span className="flex items-center gap-2">
                      <strong className="text-ink-title">
                        {formatMxn(Number(p.total_amount))}
                      </strong>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                          p.status === "paid"
                            ? "bg-success-bg text-success-text"
                            : "bg-warning-bg text-warning-text"
                        }`}
                      >
                        {p.status === "paid" ? "PAGADO" : "POR PAGAR"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Referidos recientes — sin nombres: solo fechas de alta/baja y plan */}
      <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg text-ink-title">
            Tus referidos recientes
          </span>
          <Link
            href="/embajador/metricas"
            className="text-[12px] font-bold text-teal-deep hover:underline"
          >
            Ver métricas detalladas →
          </Link>
        </div>
        <div className="grid grid-cols-[1fr_90px_80px] gap-2 border-b-[1.5px] border-[#F2EEE4] pb-1.5 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder sm:grid-cols-[1fr_110px_90px]">
          <span>REFERIDO</span>
          <span>PLAN</span>
          <span>COMISIÓN</span>
        </div>
        {referrals.length > 0 ? (
          referrals.slice(0, 8).map((r) => {
            const inactive =
              r.subscriptions?.status && r.subscriptions.status !== "active";
            return (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_90px_80px] items-center gap-2 border-b border-[#F2EEE4] py-2 text-[12.5px] text-ink-body last:border-0 sm:grid-cols-[1fr_110px_90px]"
              >
                <span>
                  Alta el {shortDate(r.created_at)}
                  {inactive && r.subscriptions?.updated_at
                    ? ` · baja el ${shortDate(r.subscriptions.updated_at)}`
                    : ""}
                </span>
                <span>{planLabel(r)}</span>
                <span className="font-bold text-teal-deep">
                  {r.commission_amount != null
                    ? formatMxn(Number(r.commission_amount))
                    : "—"}
                </span>
              </div>
            );
          })
        ) : (
          <p className="py-3 text-[13px] text-ink-secondary">
            Aún no tienes referidos. Comparte tu código y aquí verás cada
            suscripción que llegue con él. 🐾
          </p>
        )}
      </div>

      {/* Bienvenida (una sola vez tras la aprobación) */}
      <WelcomeOnce
        storageKey={`pa_welcome_embajador_${ambassador.id}`}
        emoji="🎉"
        title={`¡Bienvenido al equipo, ${ambassador.first_name}!`}
        message={`Tu código ${ambassador.referral_code ?? ""} ya está activo. Copia tu link, compártelo en tus redes y registra tus datos de pago para recibir tus comisiones el día ${AMBASSADOR_PAYOUT_DAY} de cada mes.`}
        cta="Empezar a compartir"
      />
    </div>
  );
}
