"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Oferta599 } from "@/lib/plans/oferta";
import { activarMembresiaDePeludo } from "./actions";

const mxn = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

export function ActivarMembresia({
  petId,
  petName,
  oferta,
  tarjeta,
}: {
  petId: string;
  petName: string;
  oferta: Oferta599;
  /** Tarjeta guardada («Visa ···· 4242»), o null si no tiene. */
  tarjeta: string | null;
}) {
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const precio = plan === "annual" ? oferta.anualPesos : oferta.mensualPesos;

  async function conOtraTarjeta(cobro: "monthly" | "annual" | "annual_msi" = plan) {
    setError(null);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: cobro, petId }),
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) return setError(cuerpo.error ?? "No pudimos abrir el pago. Intenta de nuevo.");
    window.location.href = cuerpo.url;
  }

  if (hecho)
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-white p-6 shadow-[var(--shadow-card)]">
        <span className="font-display text-[24px] text-ink-title">
          ¡{petName} ya tiene su membresía! 🐾
        </span>
        <p className="text-[14px] leading-relaxed text-ink-secondary">
          El comité revisa su perfil y, en cuanto lo apruebe, empiezan a contar sus beneficios:
          cuidados cotidianos y despedida desde el día {oferta.cuidados.aperturaDia}, emergencia
          veterinaria desde el mes {oferta.emergencia.aperturaMes}.
        </p>
        <Link
          href="/app/peludos"
          className="grid h-11 place-items-center self-start rounded-full bg-teal px-6 text-[13.5px] font-bold text-white"
        >
          Ver mis peludos
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[28px] text-ink-title md:text-[34px]">
          La membresía de {petName}
        </h1>
        <p className="mt-1.5 text-[14.5px] text-ink-secondary">
          {oferta.nivel === "adicional"
            ? "Por ser un peludo adicional de tu hogar, pagas 15% menos."
            : "Precio por peludo. Sin permanencia mínima."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["monthly", "annual"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlan(p)}
            aria-pressed={plan === p}
            className={`flex flex-col gap-1 rounded-[18px] bg-white p-5 text-left ${
              plan === p
                ? "border-[2.5px] border-teal shadow-[0_6px_24px_rgba(28,188,173,.16)]"
                : "border-[1.5px] border-border-input"
            }`}
          >
            <span className="text-[13px] font-bold text-ink-tertiary">
              {p === "annual" ? "ANUAL" : "MENSUAL"}
            </span>
            <span className="font-display text-[32px] text-ink-title">
              {mxn(p === "annual" ? oferta.anualPesos : oferta.mensualPesos)}
              <span className="ml-1 font-sans text-[14px] text-ink-tertiary">
                MXN / {p === "annual" ? "año" : "mes"}
              </span>
            </span>
            {p === "annual" && oferta.ahorroAnualPesos > 0 && (
              <span className="text-[12.5px] font-semibold text-success-text">
                Te ahorras {mxn(oferta.ahorroAnualPesos)}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">{error}</div>
      )}

      {tarjeta ? (
        <>
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await activarMembresiaDePeludo(petId, plan);
                if ("ok" in r) return setHecho(true);
                if (r.error) setError(r.error);
                else if (r.checkout) await conOtraTarjeta();
              })
            }
            className="grid h-[52px] place-items-center rounded-full bg-teal text-[15px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-60"
          >
            {pendiente ? "Activando…" : `Pagar ${mxn(precio)} con ${tarjeta}`}
          </button>
          <button
            type="button"
            onClick={() => conOtraTarjeta()}
            className="self-center text-[13px] font-bold text-teal-deep hover:underline"
          >
            Pagar con otra tarjeta
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => conOtraTarjeta()}
          className="grid h-[52px] place-items-center rounded-full bg-teal text-[15px] font-bold text-white transition-colors hover:bg-teal-deep"
        >
          Pagar {mxn(precio)}
        </button>
      )}
      {/* Meses sin intereses (17-sep-2026): solo en el anual y como pago
          único, que es lo único que Stripe permite. */}
      {plan === "annual" && (
        <>
          <button
            type="button"
            onClick={() => conOtraTarjeta("annual_msi")}
            className="grid h-[46px] place-items-center rounded-full border-2 border-teal text-[13.5px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            Pagarlo a 3 o 6 meses sin intereses
          </button>
          <span className="-mt-2 text-center text-[11.5px] leading-snug text-ink-tertiary">
            Con tarjetas de crédito participantes. Lo eliges en la pantalla de pago.
          </span>
        </>
      )}
      <span className="text-center text-[12px] text-ink-tertiary">
        Pago procesado por Stripe · Cancelas cuando quieras desde Mi cuenta
      </span>
    </div>
  );
}
