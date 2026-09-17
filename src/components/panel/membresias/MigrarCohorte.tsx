"use client";

import { useState, useTransition } from "react";
import {
  migrarCohorte,
  previsualizarCohorte,
} from "@/app/ventas/membresias/actions";
import type { Previsualizacion } from "@/lib/plans/migracion";

export type VersionOpcion = {
  id: string;
  etiqueta: string;
  publicada: boolean;
};

const ETIQUETA =
  "text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary";
const CAMPO =
  "h-[36px] rounded-[10px] border-[1.5px] border-border-input bg-white px-3 text-[13px] outline-none focus:border-teal";

/** Un valor de beneficio como lo leería una persona. */
function valor(v: number | boolean) {
  if (typeof v === "boolean") return v ? "sí" : "no";
  return v.toLocaleString("es-MX");
}

export function MigrarCohorte({
  versiones,
  documentosLegales,
}: {
  versiones: VersionOpcion[];
  documentosLegales: { id: string; titulo: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [destinoId, setDestinoId] = useState("");
  const [origenId, setOrigenId] = useState("");
  const [antiguedad, setAntiguedad] = useState("");
  const [incluirMorosos, setIncluirMorosos] = useState(true);
  const [previa, setPrevia] = useState<Previsualizacion | null>(null);
  const [legalId, setLegalId] = useState("");
  const [entiendo, setEntiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const decir = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(null), 10000);
  };

  const filtro = () => ({
    ...(origenId ? { versionOrigenId: origenId } : {}),
    ...(antiguedad ? { antiguedadMinMeses: Number(antiguedad) } : {}),
    estados: incluirMorosos ? ["active", "past_due"] : ["active"],
  });

  const listoParaEjecutar =
    !!previa && previa.resumen.total > 0 && (!previa.exigePapel || (!!legalId && entiendo));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold text-ink-title">Migrar una cohorte</h2>
        <span className="flex items-center gap-2">
          {aviso && (
            <span className="text-[12px] font-bold text-success-text">{aviso}</span>
          )}
          <button
            type="button"
            onClick={() => {
              setAbierto((v) => !v);
              setPrevia(null);
            }}
            className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep"
          >
            {abierto ? "Cerrar" : "Abrir"}
          </button>
        </span>
      </div>

      <p className="text-[12.5px] leading-snug text-ink-secondary">
        Publicar una versión nueva no mueve a nadie. Esto es la excepción: mover a
        un grupo de miembros a otra versión.{" "}
        <strong>Nunca es silencioso</strong> — cada persona queda con su registro
        y su correo — y{" "}
        <strong>nunca es a peor sin el reglamento que lo respalde</strong>.
      </p>

      {abierto && (
        <div className="flex flex-col gap-3 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <div className="flex flex-wrap gap-2.5">
            <label className="flex min-w-[210px] flex-1 flex-col gap-1">
              <span className={ETIQUETA}>VERSIÓN DESTINO</span>
              <select
                value={destinoId}
                onChange={(e) => {
                  setDestinoId(e.target.value);
                  setPrevia(null);
                }}
                className={CAMPO}
              >
                <option value="">Elegir…</option>
                {versiones
                  .filter((v) => v.publicada)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.etiqueta}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex min-w-[210px] flex-1 flex-col gap-1">
              <span className={ETIQUETA}>SOLO LOS QUE HOY ESTÁN EN</span>
              <select
                value={origenId}
                onChange={(e) => {
                  setOrigenId(e.target.value);
                  setPrevia(null);
                }}
                className={CAMPO}
              >
                <option value="">Cualquier versión</option>
                {versiones.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={ETIQUETA}>ANTIGÜEDAD MÍNIMA (MESES)</span>
              <input
                type="number"
                value={antiguedad}
                onChange={(e) => {
                  setAntiguedad(e.target.value);
                  setPrevia(null);
                }}
                placeholder="sin mínimo"
                className={`${CAMPO} w-[170px]`}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-[12.5px] text-ink-body">
            <input
              type="checkbox"
              checked={incluirMorosos}
              onChange={(e) => {
                setIncluirMorosos(e.target.checked);
                setPrevia(null);
              }}
              className="h-4 w-4 accent-teal"
            />
            Incluir a quienes tienen un pago pendiente (siguen siendo miembros)
          </label>

          <button
            type="button"
            disabled={pendiente || !destinoId}
            onClick={() =>
              startTransition(async () => {
                const res = await previsualizarCohorte({
                  versionDestinoId: destinoId,
                  filtro: filtro(),
                });
                if ("error" in res) {
                  setPrevia(null);
                  decir(res.error);
                } else {
                  setPrevia(res);
                  setLegalId("");
                  setEntiendo(false);
                }
              })
            }
            className="self-start rounded-full bg-ink-title px-5 py-2 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            Ver el antes y el después
          </button>

          {previa && (
            <div className="flex flex-col gap-3 rounded-[14px] bg-cream p-3.5">
              <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                <span className="font-bold text-ink-title">
                  {previa.resumen.total} miembro(s) en la cohorte
                </span>
                <span className="rounded-full bg-lime/40 px-2 py-0.5 font-semibold text-ink-title">
                  {previa.resumen.mejoran} mejora(n)
                </span>
                <span className="rounded-full bg-orange/25 px-2 py-0.5 font-semibold text-ink-title">
                  {previa.resumen.empeoran} queda(n) peor
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-ink-secondary">
                  {previa.resumen.sinCambio} sin cambio
                </span>
              </div>

              {previa.resumen.total === 0 && (
                <span className="text-[12.5px] text-ink-secondary">
                  Ningún miembro entra con esos filtros. Nada que migrar.
                </span>
              )}

              {previa.fueraPorOtroPlan > 0 && (
                <span className="text-[12.5px] text-ink-secondary">
                  {previa.fueraPorOtroPlan} miembro(s) quedan fuera por ser de
                  otro plan. Una migración nunca cambia a nadie de plan: solo
                  movería sus beneficios, y seguiría pagando el precio del suyo.
                </span>
              )}

              {previa.miembros.slice(0, 25).map((m) => (
                <div
                  key={m.subscriptionId}
                  className="flex flex-col gap-1 rounded-[10px] bg-white px-3 py-2"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-bold text-ink-title">
                      {m.nombre}
                    </span>
                    <span className="text-[11px] text-ink-tertiary">
                      hoy en {m.versionOrigen}
                    </span>
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        m.saldo === "empeora"
                          ? "bg-orange/25 text-ink-title"
                          : m.saldo === "mejora"
                            ? "bg-lime/40 text-ink-title"
                            : "bg-cream text-ink-secondary"
                      }`}
                    >
                      {m.saldo}
                    </span>
                  </span>
                  {m.cambios.length === 0 ? (
                    <span className="text-[11.5px] text-ink-tertiary">
                      Mismos beneficios; solo cambia de versión.
                    </span>
                  ) : (
                    m.cambios.map((c) => (
                      <span key={c.llave} className="text-[11.5px] text-ink-body">
                        {c.label}: <s>{valor(c.antes)}</s> →{" "}
                        <strong>{valor(c.despues)}</strong>
                        {c.direccion === -1 && (
                          <span className="ml-1 font-bold text-orange">
                            peor{c.vinculante ? " · reglamento" : ""}
                          </span>
                        )}
                      </span>
                    ))
                  )}
                </div>
              ))}

              {previa.miembros.length > 25 && (
                <span className="text-[11.5px] text-ink-secondary">
                  …y {previa.miembros.length - 25} más. Se migran todos, no solo
                  los que se ven aquí.
                </span>
              )}

              {/* La compuerta legal */}
              {previa.exigePapel && (
                <div className="flex flex-col gap-2 rounded-[12px] border-[1.5px] border-orange/60 bg-white p-3">
                  <span className="text-[12.5px] font-bold text-ink-title">
                    Esta migración deja gente peor en beneficios del reglamento
                  </span>
                  <span className="text-[11.5px] leading-snug text-ink-secondary">
                    {previa.empeoranVinculante
                      .map((e) => `${e.label} (${e.personas} persona(s))`)
                      .join(" · ")}
                    . Estas reglas están escritas en el documento que cada
                    persona aceptó, así que no se puede ejecutar sin señalar el
                    reglamento que ya las refleja.
                  </span>
                  <select
                    value={legalId}
                    onChange={(e) => setLegalId(e.target.value)}
                    className={CAMPO}
                  >
                    <option value="">Elegir el reglamento vigente…</option>
                    {documentosLegales.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.titulo}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-start gap-2 text-[12px] text-ink-body">
                    <input
                      type="checkbox"
                      checked={entiendo}
                      onChange={(e) => setEntiendo(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-teal"
                    />
                    Confirmo que ese documento ya refleja estos cambios y que
                    puedo respaldarlos ante los miembros afectados.
                  </label>
                </div>
              )}

              <button
                type="button"
                disabled={pendiente || !listoParaEjecutar}
                onClick={() =>
                  startTransition(async () => {
                    const res = await migrarCohorte({
                      versionDestinoId: destinoId,
                      filtro: filtro(),
                      legalDocumentId: legalId || null,
                    });
                    if ("error" in res) decir(res.error ?? "No se pudo migrar.");
                    else {
                      decir(res.aviso);
                      setPrevia(null);
                      setAbierto(false);
                    }
                  })
                }
                className="self-start rounded-full bg-teal px-5 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep disabled:opacity-40"
              >
                Migrar a {previa.resumen.total} miembro(s)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
