"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMxn } from "@/lib/format";
import {
  CATEGORIAS,
  PROVEEDORES,
  etiquetaProveedor,
  etiquetaMes,
  type Costo,
} from "@/lib/costos";
import {
  guardarCosto,
  borrarCosto,
  copiarRecurrentes,
  recalcularAutomaticos,
  guardarResponsableCostos,
} from "./actions";

const pesos = (centavos: number) => formatMxn(Math.round(centavos) / 100);

/**
 * Captura y edición de los costos del mes. Solo la ve el super admin (la
 * página ya lo valida en el servidor).
 */
export function CostosPanel({
  mes,
  costos,
  responsable,
  diaRecordatorio,
}: {
  mes: string;
  costos: Costo[];
  responsable: string;
  diaRecordatorio: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<Costo | null>(null);
  const [abierto, setAbierto] = useState(false);

  const [proveedor, setProveedor] = useState("vercel");
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState("infraestructura");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("MXN");
  const [recurrente, setRecurrente] = useState(true);
  const [prorratear, setProrratear] = useState("");
  const [nota, setNota] = useState("");

  const [correo, setCorreo] = useState(responsable);
  const [dia, setDia] = useState(diaRecordatorio);

  function limpiar() {
    setEditando(null);
    setProveedor("vercel");
    setConcepto("");
    setCategoria("infraestructura");
    setMonto("");
    setMoneda("MXN");
    setRecurrente(true);
    setProrratear("");
    setNota("");
  }

  function cargar(c: Costo) {
    setEditando(c);
    setAbierto(true);
    setProveedor(c.proveedor);
    setConcepto(c.concepto);
    setCategoria(c.categoria);
    setMonto(String(c.monto_centavos / 100));
    setMoneda(c.moneda);
    setRecurrente(c.recurrente);
    setProrratear(c.prorratear_meses ? String(c.prorratear_meses) : "");
    setNota(c.nota ?? "");
  }

  const delMes = costos.filter((c) => c.periodo.slice(0, 7) === mes);

  return (
    <div className="flex flex-col gap-4">
      {/* Acciones del mes */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            limpiar();
            setAbierto((v) => !v);
          }}
          className="grid h-9 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep"
        >
          {abierto && !editando ? "Cerrar" : "+ Capturar costo"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setMsg(null);
              const res = await copiarRecurrentes(mes);
              setMsg(
                "error" in res && res.error
                  ? res.error
                  : (res as { copiados: number; desde: string }).copiados > 0
                    ? `Copiados ${(res as { copiados: number }).copiados} costos recurrentes de ${etiquetaMes((res as { desde: string }).desde)} ✓`
                    : "No había recurrentes nuevos que copiar.",
              );
              router.refresh();
            })
          }
          className="grid h-9 place-items-center rounded-full border-[1.5px] border-border-input px-4 text-xs font-bold text-ink-secondary transition-colors hover:border-teal disabled:opacity-50"
        >
          ⧉ Copiar recurrentes del mes anterior
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setMsg(null);
              const res = await recalcularAutomaticos(mes);
              if ("error" in res && res.error) setMsg(res.error);
              else {
                const r = res as {
                  iaCentavos: number;
                  stripeCentavos: number;
                  stripeError: string | null;
                };
                setMsg(
                  `IA: ${pesos(r.iaCentavos)} · Comisiones Stripe: ${r.stripeError ? "no se pudo leer" : pesos(r.stripeCentavos)} ✓`,
                );
              }
              router.refresh();
            })
          }
          className="grid h-9 place-items-center rounded-full border-[1.5px] border-border-input px-4 text-xs font-bold text-ink-secondary transition-colors hover:border-teal disabled:opacity-50"
        >
          ↻ Recalcular IA y comisiones
        </button>
        {msg && (
          <span
            className={`text-xs font-semibold ${msg.includes("✓") ? "text-success-text" : "text-error-text"}`}
          >
            {msg}
          </span>
        )}
      </div>

      {/* Formulario */}
      {abierto && (
        <div className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-border-input bg-white p-5">
          <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
            {editando ? `EDITANDO: ${editando.concepto}` : `NUEVO COSTO DE ${etiquetaMes(mes).toUpperCase()}`}
          </span>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
              Proveedor
              <select
                value={proveedor}
                onChange={(e) => {
                  setProveedor(e.target.value);
                  const p = PROVEEDORES.find((x) => x.key === e.target.value);
                  if (p) setCategoria(p.categoria);
                }}
                className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal"
              >
                {PROVEEDORES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
              Concepto
              <input
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Plan Pro, asiento extra…"
                className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
              Categoría
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal"
              >
                {Object.entries(CATEGORIAS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                    {v.grupo === "adquisicion" ? " (total aparte)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
                Monto
                <input
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  inputMode="decimal"
                  placeholder="1200.50"
                  className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal"
                />
              </label>
              <label className="flex w-[92px] flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
                Moneda
                <select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  className="h-10 rounded-[10px] border-[1.5px] border-border-input px-2 text-[13px] text-ink-title outline-none focus:border-teal"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
              Prorratear en (meses)
              <input
                value={prorratear}
                onChange={(e) => setProrratear(e.target.value)}
                inputMode="numeric"
                placeholder="12 para un pago anual · vacío = todo en este mes"
                className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
              Nota (opcional)
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
            <input
              type="checkbox"
              checked={recurrente}
              onChange={(e) => setRecurrente(e.target.checked)}
              className="size-4 accent-[#1CBCAD]"
            />
            Se repite cada mes (permite copiarlo al mes siguiente y avisa si
            falta)
          </label>
          {moneda === "USD" && (
            <span className="rounded-[10px] bg-info-bg px-3 py-2 text-[12px] text-info-text">
              Se convierte a pesos con el tipo de cambio de Ajustes de IA y{" "}
              <strong>se congela</strong>: si el dólar se mueve, este costo no
              cambia después.
            </span>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setMsg(null);
                  const res = await guardarCosto({
                    id: editando?.id,
                    proveedor,
                    concepto,
                    categoria,
                    mes,
                    monto,
                    moneda,
                    recurrente,
                    prorratearMeses: prorratear || undefined,
                    nota,
                  });
                  if ("error" in res && res.error) setMsg(res.error);
                  else {
                    setMsg("Costo guardado ✓");
                    limpiar();
                    setAbierto(false);
                    router.refresh();
                  }
                })
              }
              className="grid h-10 place-items-center rounded-full bg-teal px-5 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
            >
              {pending ? "Guardando…" : editando ? "Guardar cambios" : "Agregar costo"}
            </button>
            <button
              type="button"
              onClick={() => {
                limpiar();
                setAbierto(false);
              }}
              className="grid h-10 place-items-center rounded-full border-[1.5px] border-border-input px-5 text-[12.5px] font-semibold text-ink-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Renglones del mes */}
      <div className="flex flex-col overflow-x-auto rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <div className="grid min-w-[760px] grid-cols-[1fr_150px_110px_110px_120px_80px] gap-2 border-b-[1.5px] border-[#F2EEE4] pb-2 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder">
          <span>CONCEPTO</span>
          <span>PROVEEDOR</span>
          <span>CATEGORÍA</span>
          <span>MONTO</span>
          <span>NOTAS</span>
          <span></span>
        </div>
        {delMes.map((c) => (
          <div
            key={c.id}
            className="grid min-w-[760px] grid-cols-[1fr_150px_110px_110px_120px_80px] items-center gap-2 border-b border-[#F2EEE4] py-[10px] text-[12.5px] text-ink-body last:border-0"
          >
            <span className="min-w-0">
              <strong className="text-ink-title">{c.concepto}</strong>
              {c.prorratear_meses ? (
                <span className="block text-[11px] text-ink-tertiary">
                  prorrateado en {c.prorratear_meses} meses
                </span>
              ) : null}
            </span>
            <span>{etiquetaProveedor(c.proveedor)}</span>
            <span>{CATEGORIAS[c.categoria]?.label ?? c.categoria}</span>
            <span className="font-bold">
              {pesos(c.monto_mxn_centavos)}
              {c.moneda === "USD" ? (
                <span className="block text-[11px] font-normal text-ink-tertiary">
                  USD {(c.monto_centavos / 100).toLocaleString("es-MX")}
                </span>
              ) : null}
            </span>
            <span className="min-w-0 truncate text-[11.5px] text-ink-tertiary">
              {c.origen === "automatico" ? "🤖 automático" : (c.nota ?? "—")}
              {c.recurrente ? " · mensual" : ""}
            </span>
            <span className="flex gap-1.5">
              {c.origen === "manual" && (
                <>
                  <button
                    type="button"
                    onClick={() => cargar(c)}
                    className="text-[11.5px] font-bold text-teal-deep hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await borrarCosto(c.id);
                        if ("error" in res && res.error) setMsg(res.error);
                        router.refresh();
                      })
                    }
                    className="text-[11.5px] font-bold text-error-text hover:underline"
                  >
                    Borrar
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
        {delMes.length === 0 && (
          <span className="py-3 text-sm text-ink-secondary">
            Todavía no hay costos capturados en {etiquetaMes(mes)}.
          </span>
        )}
      </div>

      {/* Responsable de captura */}
      <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
          RESPONSABLE DE LA CAPTURA
        </span>
        <p className="text-[12.5px] leading-normal text-ink-secondary">
          A este correo le llega el recordatorio mensual si el mes anterior
          quedó sin capturar. Sin responsable con fecha, la tabla se llena dos
          meses y se abandona.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
            Correo
            <input
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="quien-captura@pataamiga.mx"
              className="h-10 w-[260px] rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
            Día del mes
            <input
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              inputMode="numeric"
              className="h-10 w-[90px] rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setMsg(null);
                const res = await guardarResponsableCostos(correo, dia);
                setMsg(
                  "error" in res && res.error ? res.error : "Responsable guardado ✓",
                );
                router.refresh();
              })
            }
            className="grid h-10 place-items-center rounded-full bg-teal px-5 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
