"use client";

import { useEffect, useState } from "react";
import { Stepper } from "@/components/registro/Stepper";
import { useValorLocal } from "@/lib/hooks";

type Plan = "monthly" | "annual";

const CHECK = (
  <span className="font-extrabold text-teal" aria-hidden>
    ✓
  </span>
);

export function PlanSelector({
  petName,
  initialCode,
}: {
  petName: string;
  initialCode?: string;
}) {
  const [selected, setSelected] = useState<Plan>("annual");
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  // El código de embajador puede llegar por el enlace (?codigo=) o quedar
  // guardado en /registro. Se lee DURANTE el render con `useValorLocal`, no
  // con un efecto que hace `setState`, y lo que la persona escriba encima va
  // aparte: así el prellenado no pelea con lo que está tecleando.
  const guardado = useValorLocal("pa_ambassador_code");
  const codigoPrellenado = initialCode?.trim() || guardado?.trim() || "";
  const [codeEscrito, setCodeEscrito] = useState<string | null>(null);
  const code = codeEscrito ?? codigoPrellenado;

  const [estadoRevisado, setEstadoRevisado] = useState<
    "idle" | "checking" | "valid" | "invalid" | null
  >(null);
  // Mientras no se haya revisado el prellenado, la pantalla dice "verificando".
  const codeStatus = estadoRevisado ?? (codigoPrellenado ? "checking" : "idle");

  // Revisa el código prellenado. El `setState` va solo dentro de la respuesta
  // asíncrona: hacerlo de forma síncrona aquí encadena renders de más.
  useEffect(() => {
    if (!codigoPrellenado) return;
    let cancelado = false;
    fetch(`/api/referrals/validate?code=${encodeURIComponent(codigoPrellenado)}`)
      .then((r) => r.json())
      .then(({ valid }) => {
        if (!cancelado) setEstadoRevisado(valid ? "valid" : "invalid");
      })
      .catch(() => {
        if (!cancelado) setEstadoRevisado("idle");
      });
    return () => {
      cancelado = true;
    };
  }, [codigoPrellenado]);

  async function applyCode() {
    if (!code.trim()) return;
    setEstadoRevisado("checking");
    const res = await fetch(
      `/api/referrals/validate?code=${encodeURIComponent(code.trim())}`,
    );
    const { valid } = await res.json();
    setEstadoRevisado(valid ? "valid" : "invalid");
  }

  async function checkout(plan: Plan) {
    setError(null);
    setLoading(plan);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        ambassadorCode: codeStatus === "valid" ? code.trim() : undefined,
      }),
    });
    if (!res.ok) {
      setError("No pudimos iniciar el pago. Intenta de nuevo.");
      setLoading(null);
      return;
    }
    const { url } = await res.json();
    window.localStorage.removeItem("pa_ambassador_code");
    window.location.href = url;
  }

  return (
    <>
      <div className="sm:hidden">
        <Stepper current={3} />
      </div>
      <div className="text-left sm:text-center">
        <h1 className="font-display text-3xl text-ink-title sm:text-[40px]">
          Elige el plan para {petName}
        </h1>
        <p className="mt-2 text-[15px] text-ink-secondary">
          Mismos beneficios en ambos planes. Cancela cuando quieras.
        </p>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2">
        {/* Annual first on mobile (selected by default), second on desktop */}
        <button
          type="button"
          onClick={() => setSelected("monthly")}
          className={`flex flex-col gap-4 rounded-[20px] bg-white p-5 text-left sm:order-1 sm:p-7 ${
            selected === "monthly"
              ? "border-[2.5px] border-teal shadow-[0_6px_24px_rgba(28,188,173,.16)] sm:border-0 sm:shadow-[var(--shadow-card)]"
              : "border-[1.5px] border-border-input sm:border-0 sm:shadow-[var(--shadow-card)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="self-start rounded-full bg-[#EFEAE0] px-3 py-1 text-[11.5px] font-bold tracking-[.06em] text-ink-secondary">
              FLEXIBLE
            </span>
            <span
              className={`grid size-[22px] place-items-center rounded-full text-xs sm:hidden ${
                selected === "monthly"
                  ? "bg-teal text-white"
                  : "border-[1.5px] border-border-input"
              }`}
            >
              {selected === "monthly" ? "✓" : ""}
            </span>
          </div>
          <span className="text-xl font-bold text-ink-title">Mensual</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl text-ink-title sm:text-[44px]">
              $159
            </span>
            <span className="text-[15px] text-ink-tertiary">MXN / mes</span>
          </div>
          <div className="flex flex-col gap-2.5 text-sm leading-snug text-ink-body">
            {/* Cuarta viñeta: «Red de centros de bienestar» → «100% digital»
                (pantalla 06 del tono 2.0). El documento escribió «período de
                espera» en esta tarjeta y «tiempo de espera» en la de junto; se
                aplica «tiempo», que es la regla vinculante del 13-ago. */}
            <div className="flex gap-2.5">{CHECK}Sin plazos forzosos</div>
            <div className="flex gap-2.5">{CHECK}Orientación veterinaria 24/7</div>
            <div className="flex gap-2.5">
              {CHECK}Reintegros al cumplir tiempo de espera
            </div>
            <div className="flex gap-2.5">{CHECK}100% digital</div>
          </div>
          <span
            onClick={(e) => {
              e.stopPropagation();
              checkout("monthly");
            }}
            className="mt-auto hidden h-[50px] cursor-pointer place-items-center rounded-full border-2 border-teal text-[15px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white sm:grid"
          >
            {loading === "monthly" ? "Un momento…" : "Elegir mensual"}
          </span>
        </button>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelected("annual")}
          onKeyDown={(e) => e.key === "Enter" && setSelected("annual")}
          className="relative order-first flex cursor-pointer flex-col gap-4 rounded-[20px] border-[2.5px] border-teal bg-white p-5 text-left shadow-[0_6px_24px_rgba(28,188,173,.16)] sm:order-2 sm:p-7"
        >
          <span className="absolute -top-3.5 right-5 rounded-full bg-pink px-3.5 py-1.5 text-[11.5px] font-extrabold tracking-[.06em] text-white">
            AHORRA 10%
          </span>
          <div className="flex items-center justify-between">
            <span className="self-start rounded-full bg-info-bg px-3 py-1 text-[11.5px] font-bold tracking-[.06em] text-teal-deep">
              MEJOR VALOR
            </span>
            <span
              className={`grid size-[22px] place-items-center rounded-full text-xs sm:hidden ${
                selected === "annual"
                  ? "bg-teal text-white"
                  : "border-[1.5px] border-border-input"
              }`}
            >
              {selected === "annual" ? "✓" : ""}
            </span>
          </div>
          <span className="text-xl font-bold text-ink-title">Anual</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl text-ink-title sm:text-[44px]">
              $1,699
            </span>
            <span className="text-[15px] text-ink-tertiary">MXN / año</span>
          </div>
          <div className="flex flex-col gap-2.5 text-sm leading-snug text-ink-body">
            <div className="flex gap-2.5">{CHECK}Tranquilidad los 365 días</div>
            <div className="flex gap-2.5">{CHECK}Orientación veterinaria 24/7</div>
            <div className="flex gap-2.5">
              {CHECK}Reintegros al cumplir tiempo de espera
            </div>
            <div className="flex gap-2.5">
              {CHECK}Respuesta a reintegros en máximo 72 hrs
            </div>
          </div>
          <span
            onClick={(e) => {
              e.stopPropagation();
              checkout("annual");
            }}
            className="mt-auto hidden h-[50px] cursor-pointer place-items-center rounded-full bg-teal text-[15px] font-bold text-white transition-colors hover:bg-teal-deep sm:grid"
          >
            {loading === "annual" ? "Un momento…" : "Elegir anual"}
          </span>
        </div>
      </div>

      {/* Ambassador code */}
      <div className="flex flex-col gap-3 rounded-[16px] bg-white px-4 py-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-bold text-ink-title">
            ¿Tienes un código de embajador?
          </span>
          <span className="text-[12.5px] text-ink-tertiary">
            Aplícalo antes de pagar para recibir su beneficio.
          </span>
        </div>
        <div className="flex gap-3">
          <input
            value={code}
            onChange={(e) => {
              setCodeEscrito(e.target.value.toUpperCase());
              setEstadoRevisado("idle");
            }}
            placeholder="CÓDIGO"
            className="h-[46px] w-full rounded-[12px] border-[1.5px] border-dashed border-[#C9C3B4] bg-white px-3.5 text-sm tracking-[.1em] text-ink-title placeholder:text-ink-placeholder outline-none focus:border-solid focus:border-teal sm:w-[220px]"
          />
          <button
            type="button"
            onClick={applyCode}
            className="grid h-[46px] flex-none place-items-center rounded-full bg-info-bg px-5 text-sm font-bold text-info-text transition-colors hover:bg-teal hover:text-white"
          >
            {codeStatus === "checking" ? "…" : "Aplicar"}
          </button>
        </div>
      </div>
      {codeStatus === "valid" && (
        <div className="-mt-3 rounded-[12px] bg-success-bg px-4 py-2.5 text-sm font-semibold text-success-text sm:-mt-5">
          ✓ Código {code} aplicado
        </div>
      )}
      {codeStatus === "invalid" && (
        <div className="-mt-3 rounded-[12px] bg-error-bg px-4 py-2.5 text-sm text-error-text sm:-mt-5">
          No encontramos ese código. Revísalo e intenta de nuevo.
        </div>
      )}
      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
          {error}
        </div>
      )}

      {/* Mobile pay CTA */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        <button
          type="button"
          onClick={() => checkout(selected)}
          disabled={loading !== null}
          className="grid h-[52px] place-items-center rounded-full bg-teal text-base font-bold text-white disabled:opacity-60"
        >
          {loading
            ? "Un momento…"
            : `Pagar ${selected === "annual" ? "$1,699" : "$159"} MXN`}
        </button>
      </div>

      {/* Solo tarjeta (Pablo, 16-ago). OJO: los métodos NO se declaran en el
          código —no hay `payment_method_types`—, así que el checkout ofrece lo
          que esté prendido en el panel de Stripe. Si OXXO y SPEI siguen
          activos allá, esta línea va a mentir. */}
      <div className="flex items-center justify-center gap-2 text-[13px] text-ink-tertiary">
        <span className="inline-block size-4 rounded-[4px] bg-teal-dark" />
        Procesamiento de pago protegido por Stripe · Tarjeta de crédito y débito
      </div>
    </>
  );
}
