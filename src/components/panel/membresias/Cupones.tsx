"use client";

import { useState, useTransition } from "react";
import {
  crearCuponPromocional,
  desactivarCuponPromocional,
} from "@/app/ventas/membresias/actions";

export type CuponFila = {
  id: string;
  code: string;
  nombre: string;
  descuento: string;
  duracion: string;
  venceEl: string | null;
  usos: number | null;
  usosMax: number | null;
  planNombre: string | null;
  activo: boolean;
  notas: string | null;
};

export type CampanaOpcion = { slug: string; nombre: string; palabraActual: string };

const ETIQUETA_INPUT =
  "text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary";
const CAMPO =
  "h-[36px] rounded-[10px] border-[1.5px] border-border-input bg-white px-3 text-[13px] outline-none focus:border-teal";

export function Cupones({
  cupones,
  planes,
  campanas,
  puedeAdministrar,
}: {
  cupones: CuponFila[];
  planes: { id: string; nombre: string }[];
  campanas: CampanaOpcion[];
  puedeAdministrar: boolean;
}) {
  const [creando, setCreando] = useState(false);
  const [code, setCode] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"porcentaje" | "monto">("porcentaje");
  const [valor, setValor] = useState("20");
  const [duracion, setDuracion] = useState<"once" | "repeating" | "forever">(
    "once",
  );
  const [duracionMeses, setDuracionMeses] = useState("3");
  const [venceEl, setVenceEl] = useState("");
  const [usosMax, setUsosMax] = useState("");
  const [planId, setPlanId] = useState("");
  const [landingSlug, setLandingSlug] = useState("");
  const [notas, setNotas] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const decir = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(null), 8000);
  };

  const limpiar = () => {
    setCode("");
    setNombre("");
    setValor("20");
    setVenceEl("");
    setUsosMax("");
    setPlanId("");
    setLandingSlug("");
    setNotas("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold text-ink-title">Cupones</h2>
        <span className="flex items-center gap-2">
          {aviso && (
            <span className="text-[12px] font-bold text-success-text">{aviso}</span>
          )}
          {puedeAdministrar && (
            <button
              type="button"
              onClick={() => setCreando((v) => !v)}
              className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep"
            >
              {creando ? "Cancelar" : "+ Nuevo cupón"}
            </button>
          )}
        </span>
      </div>

      <p className="text-[12.5px] leading-snug text-ink-secondary">
        La palabra se teclea en el checkout. Se crea en Stripe al guardarla, así
        que <strong>ya no hay que entrar a Stripe</strong> para una promoción. Los
        usos se leen en vivo desde Stripe.
      </p>

      {creando && (
        <div className="flex flex-col gap-3 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <div className="flex flex-wrap gap-2.5">
            <label className="flex flex-col gap-1">
              <span className={ETIQUETA_INPUT}>PALABRA</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="PATAMIGA20"
                className={`${CAMPO} w-[170px] font-mono tracking-wide`}
              />
            </label>
            <label className="flex min-w-[190px] flex-1 flex-col gap-1">
              <span className={ETIQUETA_INPUT}>NOMBRE (interno)</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Regalo de bienvenida — patrocinador"
                className={CAMPO}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <label className="flex flex-col gap-1">
              <span className={ETIQUETA_INPUT}>DESCUENTO</span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "porcentaje" | "monto")}
                className={CAMPO}
              >
                <option value="porcentaje">Porcentaje (%)</option>
                <option value="monto">Monto fijo (MXN)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={ETIQUETA_INPUT}>
                {tipo === "porcentaje" ? "% DE DESCUENTO" : "PESOS DE DESCUENTO"}
              </span>
              <input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className={`${CAMPO} w-[120px]`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={ETIQUETA_INPUT}>APLICA A</span>
              <select
                value={duracion}
                onChange={(e) =>
                  setDuracion(e.target.value as "once" | "repeating" | "forever")
                }
                className={CAMPO}
              >
                <option value="once">Solo el primer cobro</option>
                <option value="repeating">Los primeros N meses</option>
                <option value="forever">Siempre</option>
              </select>
            </label>
            {duracion === "repeating" && (
              <label className="flex flex-col gap-1">
                <span className={ETIQUETA_INPUT}>MESES</span>
                <input
                  type="number"
                  value={duracionMeses}
                  onChange={(e) => setDuracionMeses(e.target.value)}
                  className={`${CAMPO} w-[90px]`}
                />
              </label>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            <label className="flex flex-col gap-1">
              <span className={ETIQUETA_INPUT}>VIGENTE HASTA (opcional)</span>
              <input
                type="date"
                value={venceEl}
                onChange={(e) => setVenceEl(e.target.value)}
                className={`${CAMPO} w-[170px]`}
              />
              <span className="text-[11px] text-ink-tertiary">
                Vale hasta las 23:59 h de México de ese día.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className={ETIQUETA_INPUT}>TOPE DE USOS (opcional)</span>
              <input
                type="number"
                value={usosMax}
                onChange={(e) => setUsosMax(e.target.value)}
                placeholder="sin tope"
                className={`${CAMPO} w-[150px]`}
              />
            </label>
            <label className="flex min-w-[180px] flex-1 flex-col gap-1">
              <span className={ETIQUETA_INPUT}>SOLO PARA EL PLAN (opcional)</span>
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className={CAMPO}
              >
                <option value="">Cualquier plan</option>
                {planes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {campanas.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className={ETIQUETA_INPUT}>
                DEJARLO COMO LA PALABRA DE UNA LANDING (opcional)
              </span>
              <select
                value={landingSlug}
                onChange={(e) => setLandingSlug(e.target.value)}
                className={`${CAMPO} md:w-[420px]`}
              >
                <option value="">No cambiar ninguna landing</option>
                {campanas.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.nombre}
                    {c.palabraActual ? ` — hoy reparte "${c.palabraActual}"` : " — hoy sin palabra"}
                  </option>
                ))}
              </select>
              <span className="text-[11px] leading-snug text-ink-tertiary">
                La landing empieza a repartir esta palabra en su correo de regalo
                en cuanto se guarda.
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className={ETIQUETA_INPUT}>NOTA (por qué existe este cupón)</span>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className={CAMPO}
            />
          </label>

          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                const res = await crearCuponPromocional({
                  code,
                  nombre,
                  tipo,
                  ...(tipo === "porcentaje"
                    ? { porcentaje: Number(valor) }
                    : { montoPesos: Number(valor) }),
                  duracion,
                  ...(duracion === "repeating"
                    ? { duracionMeses: Number(duracionMeses) }
                    : {}),
                  ...(venceEl ? { venceEl } : {}),
                  ...(usosMax ? { usosMax: Number(usosMax) } : {}),
                  ...(planId ? { planId } : {}),
                  ...(landingSlug ? { landingSlug } : {}),
                  ...(notas ? { notas } : {}),
                });
                if ("error" in res) decir(res.error ?? "No se pudo crear.");
                else {
                  decir(res.aviso);
                  setCreando(false);
                  limpiar();
                }
              })
            }
            className="self-start rounded-full bg-teal px-5 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Crear cupón en Stripe
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {cupones.map((c) => (
          <div
            key={c.id}
            className={`flex flex-col gap-1.5 rounded-[14px] p-3.5 shadow-[0_2px_10px_rgba(30,83,80,.05)] ${
              c.activo ? "bg-white" : "bg-cream/60"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[8px] bg-cream px-2 py-1 font-mono text-[13px] font-bold tracking-wide text-ink-title">
                {c.code}
              </span>
              <span className="text-[13px] font-bold text-ink-title">
                {c.descuento}
              </span>
              <span className="text-[11.5px] text-ink-secondary">{c.duracion}</span>
              {!c.activo && (
                <span className="rounded-full bg-ink-tertiary/20 px-2 py-0.5 text-[10.5px] font-bold text-ink-secondary">
                  desactivado
                </span>
              )}
              <span className="ml-auto text-[11.5px] text-ink-secondary">
                {c.usos === null
                  ? "usos: sin dato de Stripe"
                  : `${c.usos} uso(s)${c.usosMax ? ` de ${c.usosMax}` : ""}`}
              </span>
            </div>

            <span className="text-[11.5px] text-ink-secondary">
              {c.nombre}
              {c.planNombre ? ` · solo ${c.planNombre}` : " · cualquier plan"}
              {c.venceEl ? ` · vigente hasta ${c.venceEl}` : " · sin vencimiento"}
            </span>

            {c.notas && (
              <span className="text-[11.5px] italic text-ink-secondary">
                {c.notas}
              </span>
            )}

            {puedeAdministrar && c.activo && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() =>
                  startTransition(async () => {
                    const res = await desactivarCuponPromocional(c.id);
                    decir(
                      "error" in res && res.error
                        ? res.error
                        : `Cupón ${c.code} desactivado ✓`,
                    );
                  })
                }
                className="self-start text-[11.5px] font-semibold text-ink-tertiary underline"
              >
                Desactivar
              </button>
            )}
          </div>
        ))}

        {cupones.length === 0 && (
          <p className="rounded-[14px] bg-white px-5 py-7 text-center text-[12.5px] text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            Todavía no hay cupones.
          </p>
        )}
      </div>
    </div>
  );
}
