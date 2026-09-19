"use client";

import { useEffect, useState } from "react";
import { Stepper } from "@/components/registro/Stepper";
import { useValorLocal } from "@/lib/hooks";
import type { GrupoCatalogo } from "@/lib/catalogo-cuidados";
import type { Oferta599 } from "@/lib/plans/oferta";
import { describirPromocion, type Promocion } from "@/lib/plans/promocion-texto";

/**
 * Selector de plan de la membresía $599 (sección 2, 17-sep-2026).
 *
 * Diferencias con el del $159: el precio es POR PELUDO (el adicional paga 15%
 * menos), los beneficios son montos que crecen, y el catálogo de cuidados
 * cotidianos se enseña ANTES de pagar (doc 63). Precios y montos llegan del
 * servidor, leídos de la versión publicada: aquí no hay cifras escritas.
 */

type Plan = "monthly" | "annual";
/** El anual también se puede pagar a meses sin intereses (17-sep-2026). */
type Cobro = Plan | "annual_msi";


const CHECK = (
  <span className="font-extrabold text-teal" aria-hidden>
    ✓
  </span>
);

const mxn = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

export function PlanSelector599({
  petName,
  initialCode,
  oferta,
  catalogo,
}: {
  petName: string;
  initialCode?: string;
  oferta: Oferta599;
  catalogo: GrupoCatalogo[];
}) {
  const [selected, setSelected] = useState<Plan>("annual");
  const [loading, setLoading] = useState<Cobro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);

  // «¿Tienes un código?» (19-sep-2026): una casilla para los dos tipos. Se
  // puede tener uno de cada uno: el del embajador que la invitó y una
  // promoción. El del embajador también llega solo, por su enlace (?codigo=).
  const guardado = useValorLocal("pa_ambassador_code");
  const codigoPrellenado = (initialCode?.trim() || guardado?.trim() || "").toUpperCase();
  const [texto, setTexto] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [embajador, setEmbajador] = useState<string | null>(null);
  const [promo, setPromo] = useState<Promocion | null>(null);
  // El del enlace se revisa una vez; si lo quitan, no vuelve.
  const [prellenadoQuitado, setPrellenadoQuitado] = useState(false);
  const [prellenadoValido, setPrellenadoValido] = useState<boolean | null>(null);
  const embajadorVigente =
    embajador ?? (!prellenadoQuitado && prellenadoValido ? codigoPrellenado : null);

  useEffect(() => {
    if (!codigoPrellenado) return;
    let cancelado = false;
    reconocerCodigo(codigoPrellenado)
      .then((r) => {
        if (!cancelado) setPrellenadoValido(r?.tipo === "embajador");
      })
      .catch(() => {
        if (!cancelado) setPrellenadoValido(false);
      });
    return () => {
      cancelado = true;
    };
  }, [codigoPrellenado]);

  async function aplicarCodigo() {
    const codigo = texto.trim().toUpperCase();
    if (!codigo) return;
    setRevisando(true);
    setAviso(null);
    try {
      const r = await reconocerCodigo(codigo);
      if (r?.tipo === "embajador") {
        setEmbajador(r.codigo);
        setPrellenadoQuitado(true);
        setTexto("");
      } else if (r?.tipo === "promocion") {
        setPromo(r.promocion);
        setTexto("");
      } else {
        setAviso("Ese código no existe o ya no está activo. Revísalo e intenta de nuevo.");
      }
    } catch {
      setAviso("No pudimos revisar el código. Intenta de nuevo.");
    } finally {
      setRevisando(false);
    }
  }

  // Qué hace la promoción en cada plan: EXPOCAN es el primer mes gratis en el
  // mensual y $599 menos en el anual.
  const promoMensual = promo
    ? describirPromocion(promo, { centavos: Math.round(oferta.mensualPesos * 100), intervalo: "month" })
    : null;
  const promoAnual = promo
    ? describirPromocion(promo, { centavos: Math.round(oferta.anualPesos * 100), intervalo: "year" })
    : null;

  async function checkout(plan: Cobro) {
    setError(null);
    setLoading(plan);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        ambassadorCode: embajadorVigente ?? undefined,
        promotionCode: promo?.codigo,
      }),
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(cuerpo.error ?? "No pudimos iniciar el pago. Intenta de nuevo.");
      setLoading(null);
      return;
    }
    window.localStorage.removeItem("pa_ambassador_code");
    window.location.href = cuerpo.url;
  }

  const adicional = oferta.nivel === "adicional";
  const tarjeta = (plan: Plan) =>
    `flex flex-col gap-4 rounded-[20px] bg-white p-5 text-left sm:p-7 cursor-pointer ${
      selected === plan
        ? "border-[2.5px] border-teal shadow-[0_6px_24px_rgba(28,188,173,.16)]"
        : "border-[1.5px] border-border-input"
    }`;

  return (
    <>
      <div className="sm:hidden">
        <Stepper current={3} />
      </div>
      <div className="text-left sm:text-center">
        <h1 className="font-display text-3xl text-ink-title sm:text-[40px]">
          La membresía de {petName}
        </h1>
        <p className="mt-2 text-[15px] text-ink-secondary">
          Precio por peludo · Sin permanencia mínima · {oferta.garantiaDias} días
          de garantía
        </p>
        {adicional && (
          <p className="mt-2 inline-block rounded-full bg-success-bg px-3 py-1 text-[13px] font-semibold text-success-text">
            Por ser un peludo adicional, pagas 15% menos
          </p>
        )}
      </div>

      {/* Planes */}
      <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelected("monthly")}
          onKeyDown={(e) => e.key === "Enter" && setSelected("monthly")}
          className={`${tarjeta("monthly")} sm:order-1`}
        >
          <span className="self-start rounded-full bg-[#EFEAE0] px-3 py-1 text-[11.5px] font-bold tracking-[.06em] text-ink-secondary">
            FLEXIBLE
          </span>
          <span className="text-xl font-bold text-ink-title">Mensual</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl text-ink-title sm:text-[44px]">
              {mxn(oferta.mensualPesos)}
            </span>
            <span className="text-[15px] text-ink-tertiary">MXN / mes</span>
          </div>
          <div className="flex flex-col gap-2.5 text-sm leading-snug text-ink-body">
            <div className="flex gap-2.5">{CHECK}Cancelas cuando quieras</div>
            <div className="flex gap-2.5">{CHECK}Tus montos crecen cada mes pagado</div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              checkout("monthly");
            }}
            className="mt-auto hidden h-[50px] place-items-center rounded-full border-2 border-teal text-[15px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white sm:grid"
          >
            {loading === "monthly" ? "Un momento…" : "Elegir mensual"}
          </button>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelected("annual")}
          onKeyDown={(e) => e.key === "Enter" && setSelected("annual")}
          className={`relative order-first ${tarjeta("annual")} sm:order-2`}
        >
          {oferta.ahorroAnualPesos > 0 && (
            <span className="absolute -top-3.5 right-5 rounded-full bg-pink px-3.5 py-1.5 text-[11.5px] font-extrabold tracking-[.06em] text-white">
              TE AHORRAS {mxn(oferta.ahorroAnualPesos)}
            </span>
          )}
          <span className="self-start rounded-full bg-info-bg px-3 py-1 text-[11.5px] font-bold tracking-[.06em] text-teal-deep">
            PAGO ANUAL DE CONTADO
          </span>
          <span className="text-xl font-bold text-ink-title">Anual</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl text-ink-title sm:text-[44px]">
              {mxn(oferta.anualPesos)}
            </span>
            <span className="text-[15px] text-ink-tertiary">MXN / año</span>
          </div>
          <div className="flex flex-col gap-2.5 text-sm leading-snug text-ink-body">
            <div className="flex gap-2.5">{CHECK}Un solo pago al año</div>
            <div className="flex gap-2.5">{CHECK}Tus montos crecen cada mes</div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              checkout("annual");
            }}
            className="mt-auto hidden h-[50px] place-items-center rounded-full bg-teal text-[15px] font-bold text-white transition-colors hover:bg-teal-deep sm:grid"
          >
            {loading === "annual" ? "Un momento…" : "Elegir anual"}
          </button>
          {/* Meses sin intereses (17-sep-2026): Stripe solo los permite en un
              pago único, así que es un botón aparte, no un plan aparte. La
              opción de 3 o 6 meses la muestra Stripe si la tarjeta la tiene. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              checkout("annual_msi");
            }}
            className="grid h-[46px] place-items-center rounded-full border-2 border-teal px-4 text-[13.5px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            {loading === "annual_msi" ? "Un momento…" : "Pagarlo a 3 o 6 meses sin intereses"}
          </button>
          <span className="text-center text-[11.5px] leading-snug text-ink-tertiary">
            Con tarjetas de crédito participantes. Lo eliges en la pantalla de pago.
          </span>
        </div>
      </div>

      {/* Lo que incluye */}
      <section className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
        <h2 className="font-display text-[22px] text-ink-title">
          Lo que incluye, por peludo y por año
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 rounded-[14px] bg-cream p-4">
            <span className="text-[13px] font-bold text-teal-deep">
              Cuidados cotidianos
            </span>
            {/* Pablo, 17-sep: «$500 → $2,000» y «sube $125 por mes pagado» se
                leía como jerga interna. Rango en palabras + nota sencilla. */}
            <span className="font-display text-[22px] leading-tight text-ink-title">
              <span className="font-sans text-[13px] font-semibold text-ink-tertiary">De </span>
              {mxn(oferta.cuidados.inicial)}
              <span className="font-sans text-[13px] font-semibold text-ink-tertiary"> a </span>
              {mxn(oferta.cuidados.tope)}
              <span className="font-sans text-[13px] font-semibold text-ink-tertiary"> al año</span>
            </span>
            <span className="text-[12.5px] leading-snug text-ink-secondary">
              Consultas, vacunas, desparasitación y dental.
            </span>
            <span className="text-[11.5px] leading-snug text-ink-tertiary">
              Empiezas con {mxn(oferta.cuidados.inicial)} a partir del día{" "}
              {oferta.cuidados.aperturaDia}, y tu monto disponible crece poco a poco
              cada mes que pagas.
            </span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-[14px] bg-cream p-4">
            <span className="text-[13px] font-bold text-teal-deep">
              Emergencia veterinaria
            </span>
            <span className="font-display text-[22px] leading-tight text-ink-title">
              <span className="font-sans text-[13px] font-semibold text-ink-tertiary">De </span>
              {mxn(oferta.emergencia.inicial)}
              <span className="font-sans text-[13px] font-semibold text-ink-tertiary"> a </span>
              {mxn(oferta.emergencia.tope)}
              <span className="font-sans text-[13px] font-semibold text-ink-tertiary"> al año</span>
            </span>
            <span className="text-[12.5px] leading-snug text-ink-secondary">
              Hospital, cirugía, estudios y medicinas.
            </span>
            <span className="text-[11.5px] leading-snug text-ink-tertiary">
              Empiezas con {mxn(oferta.emergencia.inicial)} a partir del mes{" "}
              {oferta.emergencia.aperturaMes}, y tu monto disponible crece poco a poco
              cada mes que pagas.
            </span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-[14px] bg-cream p-4">
            <span className="text-[13px] font-bold text-teal-deep">Despedida</span>
            <span className="font-display text-[22px] text-ink-title">
              {mxn(oferta.despedida.monto)}
            </span>
            <span className="text-[12.5px] leading-snug text-ink-secondary">
              Disponible a partir del día {oferta.despedida.aperturaDia}.
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-[13.5px] leading-snug text-ink-body">
          <div className="flex gap-2.5">
            {CHECK}Montos anuales por peludo: se renuevan cada año, no se acumulan
          </div>
          <div className="flex gap-2.5">
            {CHECK}Te depositamos en {oferta.diasHabiles} días hábiles. Si nos
            tardamos más, tu mes es gratis
          </div>
          <div className="flex gap-2.5">{CHECK}Mantienes a tu veterinario de confianza</div>
          <div className="flex gap-2.5">{CHECK}Orientación veterinaria 24/7</div>
          <div className="flex gap-2.5">
            {CHECK}Cada peludo adicional de tu hogar paga 15% menos
          </div>
        </div>

        {/* Catálogo, antes de pagar */}
        <div className="rounded-[14px] border-[1.5px] border-border-input">
          <button
            type="button"
            onClick={() => setCatalogoAbierto((v) => !v)}
            aria-expanded={catalogoAbierto}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="text-[14px] font-bold text-ink-title">
              ¿Qué gastos incluyen los cuidados cotidianos?
            </span>
            <span
              aria-hidden
              className={`text-teal-deep transition-transform ${catalogoAbierto ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </button>
          {catalogoAbierto && (
            <div className="flex flex-col gap-3 border-t border-border-divider px-4 py-3">
              {catalogo.map((g) => (
                <div key={g.id} className="flex flex-col gap-1">
                  <span className="text-[13px] font-bold text-teal-deep">
                    {String(g.posicion).padStart(2, "0")} · {g.titulo}
                  </span>
                  <span className="text-[13px] leading-relaxed text-ink-body">
                    {g.conceptos.map((c) => c.nombre).join(" · ")}
                  </span>
                </div>
              ))}
              <p className="text-[12.5px] leading-relaxed text-ink-secondary">
                Si algo no está en la lista, pero tu veterinario lo indicó,
                escríbenos: lo revisamos y si tiene sentido lo agregamos para
                todos. No tenemos tarifas por procedimiento: tu veterinario cobra
                lo que cobra y te reintegramos esa cantidad, mientras tengas
                monto disponible.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ¿Tienes un código? — de promoción o de embajador */}
      <div className="flex flex-col gap-3 rounded-[16px] bg-white px-4 py-4 shadow-[var(--shadow-card)] sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-bold text-ink-title">¿Tienes un código?</span>
            <span className="text-[12.5px] text-ink-tertiary">
              De promoción (como EXPOCAN) o de la persona embajadora que te
              invitó. Aplícalo antes de pagar.
            </span>
          </div>
          <form
            className="flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              aplicarCodigo();
            }}
          >
            <input
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value.toUpperCase());
                setAviso(null);
              }}
              placeholder="CÓDIGO"
              aria-label="Código de promoción o de embajador"
              className="h-[46px] w-full rounded-[12px] border-[1.5px] border-dashed border-[#C9C3B4] bg-white px-3.5 text-sm tracking-[.1em] text-ink-title placeholder:text-ink-placeholder outline-none focus:border-solid focus:border-teal sm:w-[220px]"
            />
            <button
              type="submit"
              disabled={revisando}
              className="grid h-[46px] flex-none place-items-center rounded-full bg-info-bg px-5 text-sm font-bold text-info-text transition-colors hover:bg-teal hover:text-white disabled:opacity-60"
            >
              {revisando ? "…" : "Aplicar"}
            </button>
          </form>
        </div>
        {(promo || embajadorVigente) && (
          <div className="flex flex-wrap gap-2">
            {promo && (
              <span className="inline-flex items-center gap-2 rounded-[14px] bg-success-bg py-1.5 pl-3.5 pr-2 text-[13px] font-semibold leading-snug text-success-text">
                ✓ {promo.codigo}:{" "}
                {promoMensual === promoAnual
                  ? promoMensual
                  : `${promoMensual} en el mensual · ${promoAnual?.replace(/ en tu primer pago$/, "")} en el anual`}
                <button
                  type="button"
                  onClick={() => setPromo(null)}
                  aria-label={`Quitar ${promo.codigo}`}
                  className="grid size-6 place-items-center rounded-full hover:bg-white/60"
                >
                  ✕
                </button>
              </span>
            )}
            {embajadorVigente && (
              <span className="inline-flex items-center gap-2 rounded-full bg-info-bg py-1.5 pl-3.5 pr-2 text-[13px] font-semibold text-info-text">
                ✓ Te invitó: <span className="font-mono">{embajadorVigente}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEmbajador(null);
                    setPrellenadoQuitado(true);
                  }}
                  aria-label={`Quitar ${embajadorVigente}`}
                  className="grid size-6 place-items-center rounded-full hover:bg-white/60"
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        )}
        {aviso && (
          <div className="rounded-[12px] bg-error-bg px-4 py-2.5 text-sm text-error-text">
            {aviso}
          </div>
        )}
      </div>
      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
          {error}
        </div>
      )}

      {/* Pago en móvil */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        <button
          type="button"
          onClick={() => checkout(selected)}
          disabled={loading !== null}
          className="grid h-[52px] place-items-center rounded-full bg-teal text-base font-bold text-white disabled:opacity-60"
        >
          {loading
            ? "Un momento…"
            : `Pagar ${mxn(selected === "annual" ? oferta.anualPesos : oferta.mensualPesos)} MXN`}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 text-[13px] text-ink-tertiary">
        <span className="inline-block size-4 rounded-[4px] bg-teal-dark" />
        Procesamiento de pago protegido por Stripe · Tarjeta de crédito y débito
      </div>
    </>
  );
}

type CodigoReconocido =
  | { tipo: "embajador"; codigo: string }
  | { tipo: "promocion"; codigo: string; promocion: Promocion }
  | { tipo: "invalido"; codigo: string };

/** Pregunta al servidor si la palabra es de un embajador, una promoción o ninguna. */
async function reconocerCodigo(codigo: string): Promise<CodigoReconocido | null> {
  const res = await fetch(`/api/codigos/validar?code=${encodeURIComponent(codigo)}`);
  if (!res.ok) return null;
  return (await res.json()) as CodigoReconocido;
}
