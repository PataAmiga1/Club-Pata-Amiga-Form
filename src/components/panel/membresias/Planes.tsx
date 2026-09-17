"use client";

import { useState, useTransition } from "react";
import {
  confirmarLegal,
  crearBorrador,
  publicar,
  retirarVersion,
} from "@/app/ventas/membresias/actions";

export type VersionFila = {
  id: string;
  version: number;
  interval: "month" | "year";
  precioPesos: number;
  /** Cada peludo después del primero (membresía $599). null = no cobra por peludo. */
  precioAdicionalPesos: number | null;
  estado: string;
  diferencias: { label: string; valor: string; vinculante: boolean }[];
  tienePrecioStripe: boolean;
  legalConfirmado: boolean;
  miembros: number;
  notas: string | null;
};

export type BeneficioEditable = {
  llave: string;
  label: string;
  tipo: string;
  unidad?: string;
  porOmision: number | boolean;
  vinculante: boolean;
  consumidoPor: string[];
};

const INTERVALO = { month: "Mensual", year: "Anual" } as const;

export function Planes({
  planId,
  planNombre,
  versiones,
  beneficios,
  documentosLegales,
  esSuper,
  puedeAdministrar,
}: {
  planId: string;
  planNombre: string;
  versiones: VersionFila[];
  beneficios: BeneficioEditable[];
  documentosLegales: { id: string; titulo: string }[];
  esSuper: boolean;
  puedeAdministrar: boolean;
}) {
  const [creando, setCreando] = useState(false);
  const [interval, setInterval] = useState<"month" | "year">("year");
  const [precio, setPrecio] = useState("1699");
  const [notas, setNotas] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const decir = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(null), 6000);
  };

  // Lo que el formulario va a mandar: solo lo que difiere del catálogo
  const cambios = beneficios.filter((b) => {
    const v = valores[b.llave];
    if (v === undefined || v === "") return false;
    const actual = b.tipo === "booleano" ? v === "true" : Number(v);
    return actual !== b.porOmision;
  });
  const cambiosVinculantes = cambios.filter((b) => b.vinculante);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold text-ink-title">{planNombre}</h2>
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
              {creando ? "Cancelar" : "+ Nueva versión"}
            </button>
          )}
        </span>
      </div>

      {/* Editor de versión nueva */}
      {creando && (
        <div className="flex flex-col gap-3 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <div className="flex flex-wrap gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                INTERVALO
              </span>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as "month" | "year")}
                className="h-[36px] rounded-[10px] border-[1.5px] border-border-input bg-white px-2 text-[13px] outline-none focus:border-teal"
              >
                <option value="month">Mensual</option>
                <option value="year">Anual</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                PRECIO (MXN)
              </span>
              <input
                type="number"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                className="h-[36px] w-[140px] rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] outline-none focus:border-teal"
              />
            </label>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                NOTA (por qué esta versión)
              </span>
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="h-[36px] rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] outline-none focus:border-teal"
              />
            </label>
          </div>

          <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
            BENEFICIOS — en blanco = igual que hoy
          </span>
          <div className="grid gap-2 md:grid-cols-2">
            {beneficios.map((b) => {
              const bloqueado = b.vinculante && !esSuper;
              return (
                <label key={b.llave} className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-ink-body">
                      {b.label}
                    </span>
                    {b.vinculante && (
                      <span
                        title="Está en el reglamento que el miembro aceptó"
                        className="rounded-full bg-orange/15 px-1.5 py-0.5 text-[9.5px] font-bold text-orange"
                      >
                        reglamento
                      </span>
                    )}
                  </span>
                  <span className="text-[10.5px] text-ink-tertiary">
                    hoy: {String(b.porOmision)} {b.unidad ?? ""} · lo obedece:{" "}
                    {b.consumidoPor.join(", ")}
                  </span>
                  {b.tipo === "booleano" ? (
                    <select
                      value={valores[b.llave] ?? ""}
                      disabled={bloqueado}
                      onChange={(e) =>
                        setValores({ ...valores, [b.llave]: e.target.value })
                      }
                      className="h-[32px] rounded-[8px] border-[1.5px] border-border-input bg-white px-2 text-[12px] outline-none focus:border-teal disabled:bg-cream/60"
                    >
                      <option value="">igual que hoy</option>
                      <option value="true">sí</option>
                      <option value="false">no</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      value={valores[b.llave] ?? ""}
                      disabled={bloqueado}
                      placeholder="igual que hoy"
                      onChange={(e) =>
                        setValores({ ...valores, [b.llave]: e.target.value })
                      }
                      className="h-[32px] rounded-[8px] border-[1.5px] border-border-input px-2 text-[12px] outline-none focus:border-teal disabled:bg-cream/60"
                    />
                  )}
                </label>
              );
            })}
          </div>

          {/* Comparador: se ve ANTES de guardar */}
          {cambios.length > 0 && (
            <div className="flex flex-col gap-1 rounded-[12px] bg-cream p-3">
              <span className="text-[11px] font-extrabold text-ink-tertiary">
                CAMBIA {cambios.length} BENEFICIO(S) — los miembros actuales NO se
                mueven
              </span>
              {cambios.map((b) => (
                <span key={b.llave} className="text-[12px] text-ink-body">
                  {b.label}: <s>{String(b.porOmision)}</s> →{" "}
                  <strong>{valores[b.llave]}</strong>
                  {b.vinculante && (
                    <span className="ml-1 text-[11px] font-bold text-orange">
                      (reglamento)
                    </span>
                  )}
                </span>
              ))}
              {cambiosVinculantes.length > 0 && (
                <span className="mt-1 text-[11.5px] leading-snug text-ink-secondary">
                  Al publicarla se pedirá el documento legal que ya refleje estos
                  cambios y la confirmación de un super admin.
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                const beneficiosEnviados: Record<string, number | boolean> = {};
                for (const b of cambios)
                  beneficiosEnviados[b.llave] =
                    b.tipo === "booleano"
                      ? valores[b.llave] === "true"
                      : Number(valores[b.llave]);
                const res = await crearBorrador({
                  planId,
                  interval,
                  precioPesos: Number(precio),
                  beneficios: beneficiosEnviados,
                  notas,
                });
                if ("error" in res) decir(res.error ?? "No se pudo crear.");
                else {
                  decir("Borrador creado ✓ — revísalo y publícalo");
                  setCreando(false);
                  setValores({});
                }
              })
            }
            className="self-start rounded-full bg-teal px-5 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Crear borrador
          </button>
        </div>
      )}

      {/* Versiones */}
      <div className="flex flex-col gap-2.5">
        {versiones.map((v) => (
          <div
            key={v.id}
            className={`flex flex-col gap-2 rounded-[14px] p-3.5 shadow-[0_2px_10px_rgba(30,83,80,.05)] ${
              v.estado === "publicada"
                ? "bg-white"
                : v.estado === "borrador"
                  ? "bg-orange/[.06]"
                  : "bg-cream/60"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-bold text-ink-title">
                v{v.version} · {INTERVALO[v.interval]} · $
                {v.precioPesos.toLocaleString("es-MX")} MXN
                {v.precioAdicionalPesos != null && (
                  <span className="font-semibold text-ink-secondary">
                    {" "}
                    · peludo adicional ${v.precioAdicionalPesos.toLocaleString("es-MX")}
                  </span>
                )}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                  v.estado === "publicada"
                    ? "bg-lime/30 text-ink-title"
                    : v.estado === "borrador"
                      ? "bg-orange/20 text-ink-title"
                      : "bg-ink-tertiary/20 text-ink-secondary"
                }`}
              >
                {v.estado}
              </span>
              {v.tienePrecioStripe && (
                <span className="text-[10.5px] text-ink-tertiary">
                  con precio en Stripe
                </span>
              )}
              <span className="ml-auto text-[11.5px] text-ink-secondary">
                {/* $599: una suscripción por peludo, así que se cuentan suscripciones (sección 8). */}
                {v.miembros} suscripción(es) en esta versión
              </span>
            </div>

            {v.diferencias.length === 0 ? (
              <span className="text-[12px] text-ink-tertiary">
                Beneficios iguales a los del catálogo (las reglas de siempre).
              </span>
            ) : (
              <span className="flex flex-wrap gap-1.5">
                {v.diferencias.map((d) => (
                  <span
                    key={d.label}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      d.vinculante
                        ? "bg-orange/15 font-semibold text-ink-title"
                        : "bg-cream text-ink-secondary"
                    }`}
                  >
                    {d.label}: {d.valor}
                  </span>
                ))}
              </span>
            )}

            {v.notas && (
              <span className="text-[11.5px] italic text-ink-secondary">
                {v.notas}
              </span>
            )}

            {puedeAdministrar && v.estado === "borrador" && (
              <div className="flex flex-wrap items-center gap-2">
                {v.diferencias.some((d) => d.vinculante) && !v.legalConfirmado && (
                  <select
                    aria-label="Documento legal que respalda el cambio"
                    defaultValue=""
                    disabled={pendiente || !esSuper}
                    onChange={(e) => {
                      const doc = e.target.value;
                      if (!doc) return;
                      startTransition(async () => {
                        const res = await confirmarLegal(v.id, doc);
                        decir(
                          "error" in res && res.error
                            ? res.error
                            : "Documento legal confirmado ✓",
                        );
                      });
                    }}
                    className="h-[32px] rounded-[8px] border-[1.5px] border-orange/60 bg-white px-2 text-[11.5px] outline-none disabled:opacity-60"
                  >
                    <option value="">
                      {esSuper
                        ? "Confirmar reglamento…"
                        : "Requiere super admin"}
                    </option>
                    {documentosLegales.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.titulo}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await publicar(v.id);
                      decir(
                        "error" in res && res.error
                          ? res.error
                          : ("aviso" in res && res.aviso) || "Publicada ✓",
                      );
                    })
                  }
                  className="rounded-full bg-teal px-4 py-1.5 text-[12px] font-bold text-white hover:bg-teal-deep disabled:opacity-50"
                >
                  Publicar en Stripe
                </button>
              </div>
            )}

            {esSuper && v.estado === "publicada" && v.miembros === 0 && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() =>
                  startTransition(async () => {
                    await retirarVersion(v.id);
                    decir("Versión retirada ✓");
                  })
                }
                className="self-start text-[11.5px] font-semibold text-ink-tertiary underline"
              >
                Retirar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
