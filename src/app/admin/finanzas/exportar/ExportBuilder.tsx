"use client";

import { useMemo, useState } from "react";
import {
  REPORTES,
  columnasPorOmision,
  porGrupo,
  type GranoDeReporte,
} from "@/lib/exportacion";

/**
 * Armador de exportaciones (equipo, 26-ago).
 *
 * El equipo pidió «que el documento pueda incluir las variables que el admin
 * elija al exportar». Un CSV tiene UN significado por renglón, así que el
 * primer paso no es una columna: es decidir qué es un renglón. Ya con eso, las
 * columnas se tican libremente. Es la misma pantalla y la elección sigue siendo
 * del admin; lo único que no se permite es mezclar granos, porque eso produce
 * un archivo con media tabla vacía en cada renglón.
 */
export function ExportBuilder() {
  const [grano, setGrano] = useState<GranoDeReporte>("padron");
  const reporte = useMemo(
    () => REPORTES.find((r) => r.grano === grano)!,
    [grano],
  );

  // Al cambiar de reporte se reinicia la selección: las columnas de un grano no
  // existen en otro.
  const [elegidas, setElegidas] = useState<string[]>(() =>
    columnasPorOmision(REPORTES.find((r) => r.grano === "padron")!),
  );
  const cambiarGrano = (g: GranoDeReporte) => {
    setGrano(g);
    setElegidas(columnasPorOmision(REPORTES.find((r) => r.grano === g)!));
  };

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alternar = (key: string) =>
    setElegidas((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  // Se respeta el orden del catálogo, no el orden en que se fueron ticando:
  // así dos exportaciones con las mismas columnas salen siempre iguales.
  const enOrden = reporte.columnas
    .filter((c) => elegidas.includes(c.key))
    .map((c) => c.key);

  const descargar = async () => {
    setError(null);
    setBajando(true);
    try {
      const q = new URLSearchParams({ grano, columnas: enOrden.join(",") });
      if (desde) q.set("desde", desde);
      if (hasta) q.set("hasta", hasta);
      const res = await fetch(`/api/admin/exportar?${q}`);
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        setError(cuerpo?.error ?? "No pudimos generar el archivo.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ?? `pata-amiga-${grano}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("No pudimos generar el archivo. Intenta de nuevo.");
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Paso 1 — qué es un renglón */}
      <section className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
            1 · QUÉ QUIERES BAJAR
          </span>
          <span className="text-[12.5px] text-ink-tertiary">
            Cada opción arma un archivo distinto porque cada renglón significa
            otra cosa.
          </span>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {REPORTES.map((r) => (
            <button
              key={r.grano}
              type="button"
              onClick={() => cambiarGrano(r.grano)}
              aria-pressed={grano === r.grano}
              className={`flex flex-col items-start gap-1 rounded-[14px] border-[1.5px] px-4 py-3 text-left transition-colors ${
                grano === r.grano
                  ? "border-teal bg-teal/10"
                  : "border-border-input bg-white hover:border-teal"
              }`}
            >
              <span className="text-[13.5px] font-bold text-ink-title">
                {r.nombre}
              </span>
              <span className="rounded-full bg-cream px-2 py-0.5 text-[10.5px] font-bold text-ink-secondary">
                un renglón = {r.unRenglonEs}
              </span>
              <span className="text-[11.5px] leading-snug text-ink-tertiary">
                {r.descripcion}
              </span>
            </button>
          ))}
        </div>
        {reporte.advertencia && (
          <div className="rounded-[12px] bg-warning-bg px-4 py-3 text-[12.5px] leading-relaxed text-warning-text">
            ⚠ {reporte.advertencia}
          </div>
        )}
      </section>

      {/* Paso 2 — columnas */}
      <section className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
              2 · QUÉ COLUMNAS SE LLEVA
            </span>
            <span className="text-[12.5px] text-ink-tertiary">
              {enOrden.length} de {reporte.columnas.length} elegidas. Salen en
              este orden.
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setElegidas(reporte.columnas.map((c) => c.key))}
              className="rounded-full border-[1.5px] border-border-input px-3.5 py-1.5 text-[12px] font-bold text-teal-deep transition-colors hover:border-teal"
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setElegidas(columnasPorOmision(reporte))}
              className="rounded-full border-[1.5px] border-border-input px-3.5 py-1.5 text-[12px] font-bold text-ink-secondary transition-colors hover:border-teal"
            >
              Las de siempre
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {porGrupo(reporte).map(([grupo, columnas]) => (
            <div key={grupo} className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                {grupo.toUpperCase()}
              </span>
              {columnas.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-body"
                >
                  <input
                    type="checkbox"
                    checked={elegidas.includes(c.key)}
                    onChange={() => alternar(c.key)}
                    className="h-4 w-4 flex-none accent-[#1CBCAD]"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Paso 3 — rango y descarga */}
      <section className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
            3 · DESDE CUÁNDO (opcional)
          </span>
          <span className="text-[12.5px] text-ink-tertiary">
            {grano === "pagos"
              ? "Filtra por la fecha del cobro."
              : grano === "padron"
                ? "Filtra por la fecha de alta del miembro."
                : "Filtra los meses del resumen."}{" "}
            Vacío = todo el histórico.
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-body outline-none focus:border-teal"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-secondary">
            Hasta
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-body outline-none focus:border-teal"
            />
          </label>
          <button
            type="button"
            onClick={descargar}
            disabled={bajando || enOrden.length === 0}
            className="grid h-10 place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
          >
            {bajando ? "Generando…" : "⬇ Bajar CSV"}
          </button>
        </div>
        {enOrden.length === 0 && (
          <span className="text-[12px] font-semibold text-warning-text">
            Elige al menos una columna.
          </span>
        )}
        {error && (
          <span className="text-[12.5px] font-semibold text-error-text">
            {error}
          </span>
        )}
      </section>
    </div>
  );
}
