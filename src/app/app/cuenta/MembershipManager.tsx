"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchPlan, cancelMembership, reactivateMembership } from "./actions";
import { PLANS } from "@/lib/constants";
import { formatMxn } from "@/lib/format";
import { NOTA_HEREDADO_MIEMBRO } from "@/lib/membresia";

const CANCEL_REASONS = [
  "Es muy costoso para mí",
  "No lo he usado",
  "Mi peludo falleció",
  "Encontré otra opción",
  "Otro motivo",
];

/** Lo que se pierde al cancelar — popup de retención (equipo, 5-ago). */
const BENEFITS_LOST = [
  "💬 Orientación veterinaria 24/7 para tu manada",
  "🐾 Reintegros: hasta $3,000 MXN en gastos veterinarios, $2,000 por fallecimiento y $300 en vacunas",
  "📍 Beneficios y promociones en la red de centros aliados",
  "👨‍👩‍👧 Protección de hasta 3 mascotas con una sola membresía",
  "⏳ El tiempo de espera ya avanzado — si vuelves después, empieza de nuevo",
];

export function MembershipManager({
  plan,
  cancelAtPeriodEnd,
  renewsLabel,
  periodEndIso,
  heredado = false,
  bajaSolicitada = false,
}: {
  plan: "monthly" | "annual";
  cancelAtPeriodEnd: boolean;
  renewsLabel: string | null;
  periodEndIso?: string | null;
  /** Miembro migrado de Memberstack: activo, pero su cobro no vive aquí. */
  heredado?: boolean;
  /** Heredado que ya pidió su baja (el comité fija el corte a mano). */
  bajaSolicitada?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [farewellOpen, setFarewellOpen] = useState(false);
  // Días de protección restantes; se calcula al confirmar la cancelación
  // (Date.now() no puede vivir en el render).
  const [remainingDays, setRemainingDays] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const other = plan === "monthly" ? "annual" : "monthly";
  const otherInfo = PLANS[other];
  const currentInfo = PLANS[plan];

  function run(action: () => Promise<unknown>, successMessage: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(successMessage);
        setConfirmSwitch(false);
        setCancelOpen(false);
        router.refresh();
      } catch {
        setError("No pudimos completar el cambio. Intenta de nuevo.");
      }
    });
  }

  return (
    <>
      {/* Current plan */}
      <section className="relative flex flex-col gap-2 overflow-hidden rounded-[20px] bg-teal p-5 md:p-[26px]">
        <div className="blob absolute -bottom-[60px] -right-10 size-[170px] bg-white/[.14]" />
        <span className="relative text-[11px] font-bold tracking-[.06em] text-white/85">
          MEMBRESÍA{" "}
          {heredado
            ? bajaSolicitada
              ? "· BAJA EN TRÁMITE"
              : "ACTIVA"
            : cancelAtPeriodEnd
              ? "· CANCELACIÓN PROGRAMADA"
              : "ACTIVA"}
        </span>
        {heredado ? (
          <>
            <span className="relative font-display text-[26px] text-white">
              Tu protección está activa
            </span>
            <span className="relative text-[12.5px] leading-relaxed text-white/85">
              {NOTA_HEREDADO_MIEMBRO}
            </span>
          </>
        ) : (
          <>
            <span className="relative font-display text-[26px] text-white">
              Plan {currentInfo.name} · {formatMxn(currentInfo.amountMxn)} MXN/
              {plan === "annual" ? "año" : "mes"}
            </span>
            {renewsLabel && (
              <span className="relative text-[12.5px] text-white/85">
                {cancelAtPeriodEnd
                  ? `Tu protección termina el ${renewsLabel}`
                  : `Renueva el ${renewsLabel}`}
              </span>
            )}
          </>
        )}
      </section>

      {message && (
        <div className="rounded-[12px] bg-success-bg px-4 py-3 text-sm font-semibold text-success-text">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
          {error}
        </div>
      )}

      {cancelAtPeriodEnd ? (
        /* Pending cancellation → offer reactivation */
        <section className="flex flex-col items-start gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
          <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
            ¿CAMBIASTE DE OPINIÓN?
          </span>
          <p className="text-sm leading-normal text-ink-body">
            Tu membresía sigue activa hasta {renewsLabel ?? "el fin de tu período"};
            después ya no se renovará. Puedes reactivarla y todo sigue igual.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(reactivateMembership, "¡Bienvenido de vuelta! Tu membresía se renovará con normalidad.")
            }
            className="grid h-11 place-items-center rounded-full bg-teal px-6 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-60"
          >
            {pending ? "Un momento…" : "Reactivar mi membresía"}
          </button>
        </section>
      ) : heredado && bajaSolicitada ? (
        /* Heredado que ya pidió su baja: no repetir el flujo de cancelación */
        <section className="flex flex-col items-start gap-2 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
          <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
            BAJA EN TRÁMITE
          </span>
          <p className="text-sm leading-normal text-ink-body">
            Recibimos tu solicitud de baja. Como tu cobro viene de nuestra
            plataforma anterior, el equipo confirma por correo la fecha exacta en
            que termina tu protección. Mientras tanto sigues cubierto.
          </p>
          <p className="text-[13px] text-ink-secondary">
            ¿Cambiaste de opinión o tienes dudas? Escríbenos a{" "}
            <a
              href="mailto:soporte@pataamiga.mx"
              className="font-bold text-teal-deep hover:underline"
            >
              soporte@pataamiga.mx
            </a>
            .
          </p>
        </section>
      ) : (
        <>
          {/* Plan switch — solo con cobro en la plataforma: sin suscripción de
              Stripe no hay nada que prorratear (auditoría 11-ago). */}
          {!heredado && (
          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
            <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
              CAMBIAR DE PLAN
            </span>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="flex items-center gap-2 text-sm font-bold text-ink-title">
                  Plan {otherInfo.name}
                  {other === "annual" && (
                    <span className="rounded-full bg-pink px-2.5 py-0.5 text-[10.5px] font-extrabold tracking-[.06em] text-white">
                      AHORRA 10%
                    </span>
                  )}
                </span>
                <span className="text-[12.5px] text-ink-tertiary">
                  {formatMxn(otherInfo.amountMxn)} MXN/
                  {other === "annual" ? "año" : "mes"}
                </span>
              </div>
              {!confirmSwitch && (
                <button
                  type="button"
                  onClick={() => setConfirmSwitch(true)}
                  className="grid h-11 flex-none place-items-center rounded-full border-2 border-teal px-5 text-[13px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
                >
                  Cambiar a {otherInfo.name}
                </button>
              )}
            </div>
            {confirmSwitch && (
              <div className="flex flex-col gap-3 rounded-[14px] bg-cream p-4">
                <p className="text-[13px] leading-normal text-ink-body">
                  {other === "annual"
                    ? "El cambio aplica hoy: se abona lo que ya pagaste de tu mes en curso y se cobra la diferencia del plan Anual en tu tarjeta."
                    : `El cambio aplica hoy sin reembolso: tu período Anual ya pagado sigue vigente${renewsLabel ? ` hasta el ${renewsLabel}` : ""} y a partir de entonces se cobra ${formatMxn(PLANS.monthly.amountMxn)} MXN al mes.`}
                </p>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => switchPlan(other),
                        `¡Listo! Ahora tienes el plan ${otherInfo.name}.`,
                      )
                    }
                    className="grid h-11 flex-1 place-items-center rounded-full bg-teal text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-60"
                  >
                    {pending ? "Cambiando…" : `Confirmar cambio a ${otherInfo.name}`}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirmSwitch(false)}
                    className="grid h-11 place-items-center rounded-full border-[1.5px] border-border-input px-5 text-[13px] font-semibold text-ink-secondary"
                  >
                    Ahora no
                  </button>
                </div>
              </div>
            )}
          </section>
          )}

          {/* Cancellation */}
          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
            <span className="text-[13px] font-extrabold tracking-[.06em] text-ink-tertiary">
              CANCELAR MEMBRESÍA
            </span>
            {!cancelOpen ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] leading-normal text-ink-secondary">
                  Tu protección seguiría activa hasta el fin de tu período pagado
                  y tus datos se conservan por si quieres volver.
                </p>
                <button
                  type="button"
                  onClick={() => setBenefitsOpen(true)}
                  className="grid h-10 flex-none place-items-center rounded-full border-[1.5px] border-border-input px-5 text-[13px] font-semibold text-ink-secondary transition-colors hover:border-error-text hover:text-error-text"
                >
                  Cancelar…
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <span className="text-sm font-semibold text-ink-title">
                  ¿Por qué te vas? Nos ayuda a mejorar.
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CANCEL_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        reason === r
                          ? "border-teal bg-info-bg text-teal-deep"
                          : "border-border-input text-ink-secondary hover:border-teal"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="¿Algo más que quieras contarnos? (opcional)"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={2}
                  className="rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-title placeholder:text-ink-placeholder outline-none focus:border-teal"
                />
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    disabled={pending || !reason}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        try {
                          await cancelMembership(reason, comments.trim());
                          setCancelOpen(false);
                          // Despedida con los días restantes (equipo, 5-ago)
                          setRemainingDays(
                            periodEndIso
                              ? Math.max(
                                  0,
                                  Math.ceil(
                                    (new Date(periodEndIso).getTime() -
                                      Date.now()) /
                                      86_400_000,
                                  ),
                                )
                              : null,
                          );
                          setFarewellOpen(true);
                          router.refresh();
                        } catch {
                          setError(
                            "No pudimos completar el cambio. Intenta de nuevo.",
                          );
                        }
                      });
                    }}
                    className="grid h-11 place-items-center rounded-full bg-error-text px-5 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    {pending ? "Cancelando…" : "Confirmar cancelación"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setCancelOpen(false)}
                    className="grid h-11 place-items-center rounded-full border-[1.5px] border-border-input px-5 text-[13px] font-semibold text-ink-secondary"
                  >
                    Conservar mi membresía
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Popup 1 — lo que pierdes al cancelar (retención; equipo, 5-ago) */}
      {benefitsOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-title/40 p-4"
          onClick={() => setBenefitsOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Antes de cancelar"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[460px] rounded-[20px] bg-white p-6 shadow-[0_12px_40px_rgba(30,83,80,.25)]"
          >
            <h3 className="font-display text-[20px] text-ink-title">
              Antes de irte… esto es lo que tu manada perdería 🐾
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {BENEFITS_LOST.map((b) => (
                <li key={b} className="text-[13.5px] leading-normal text-ink-body">
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setBenefitsOpen(false)}
                className="grid h-12 place-items-center rounded-full bg-teal text-[14px] font-bold text-white transition-colors hover:bg-teal-deep"
              >
                Conservar mi membresía 💚
              </button>
              <button
                type="button"
                onClick={() => {
                  setBenefitsOpen(false);
                  setCancelOpen(true);
                }}
                className="grid h-11 place-items-center rounded-full text-[13px] font-semibold text-ink-tertiary transition-colors hover:text-error-text"
              >
                Quiero cancelar de todos modos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup 2 — despedida con los días restantes (equipo, 5-ago) */}
      {farewellOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-title/40 p-4"
          onClick={() => setFarewellOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Cancelación programada"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-[20px] bg-white p-6 text-center shadow-[0_12px_40px_rgba(30,83,80,.25)]"
          >
            <span className="text-[40px]" aria-hidden>
              💔🐾
            </span>
            <h3 className="mt-2 font-display text-[20px] text-ink-title">
              Te vamos a extrañar
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-body">
              Tu cancelación quedó programada.
              {remainingDays != null && remainingDays > 0 ? (
                <>
                  {" "}
                  Tu manada sigue protegida{" "}
                  <strong>
                    {remainingDays} día{remainingDays === 1 ? "" : "s"} más
                  </strong>
                  {renewsLabel ? ` (hasta el ${renewsLabel})` : ""}, con todos
                  tus beneficios.
                </>
              ) : (
                <> Tu protección sigue hasta el fin de tu período pagado.</>
              )}{" "}
              Si cambias de opinión antes de esa fecha, puedes reactivarla aquí
              mismo y todo sigue igual. 💚
            </p>
            <button
              type="button"
              onClick={() => setFarewellOpen(false)}
              className="mt-5 grid h-11 w-full place-items-center rounded-full bg-teal text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
