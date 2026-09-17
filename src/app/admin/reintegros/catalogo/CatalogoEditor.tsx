"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GrupoCatalogo } from "@/lib/catalogo-cuidados";
import {
  agregarConcepto,
  cambiarActivoConcepto,
  renombrarConcepto,
} from "./actions";

const CAMPO =
  "h-9 min-w-0 flex-1 rounded-[10px] border-[1.5px] border-border-input bg-white px-3 text-[13px] text-ink-title outline-none focus:border-teal";

export function CatalogoEditor({ grupos }: { grupos: GrupoCatalogo[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [nuevo, setNuevo] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(
    null,
  );
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(
    null,
  );

  const correr = (
    accion: () => Promise<{ ok?: true; error?: string }>,
    exito: string,
    despues?: () => void,
  ) =>
    startTransition(async () => {
      const r = await accion();
      if (r.error) setAviso({ texto: r.error, error: true });
      else {
        setAviso({ texto: exito, error: false });
        despues?.();
        router.refresh();
      }
      setTimeout(() => setAviso(null), 5000);
    });

  return (
    <div className="flex flex-col gap-4">
      {aviso && (
        <div
          className={`rounded-[12px] px-4 py-2.5 text-[13px] font-semibold ${aviso.error ? "bg-error-bg text-error-text" : "bg-success-bg text-success-text"}`}
        >
          {aviso.texto}
        </div>
      )}

      {grupos.map((g) => (
        <section
          key={g.id}
          className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]"
        >
          <h2 className="text-[15px] font-bold text-ink-title">
            <span className="mr-2 text-ink-tertiary">
              {String(g.posicion).padStart(2, "0")}
            </span>
            {g.titulo}
          </h2>

          <ul className="flex flex-col divide-y divide-border-divider">
            {g.conceptos.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 py-2 text-[13.5px]"
              >
                {editando?.id === c.id ? (
                  <>
                    <input
                      value={editando.nombre}
                      onChange={(e) =>
                        setEditando({ id: c.id, nombre: e.target.value })
                      }
                      className={CAMPO}
                      aria-label="Nombre del concepto"
                    />
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() =>
                        correr(
                          () =>
                            renombrarConcepto({ id: c.id, nombre: editando.nombre }),
                          "Concepto actualizado.",
                          () => setEditando(null),
                        )
                      }
                      className="rounded-full bg-teal px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-teal-deep disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditando(null)}
                      className="px-2 text-[12px] font-semibold text-ink-secondary"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className={`min-w-0 flex-1 ${c.activo ? "text-ink-body" : "text-ink-placeholder line-through"}`}
                    >
                      {c.nombre}
                    </span>
                    {!c.activo && (
                      <span className="rounded-full bg-cream px-2 py-0.5 text-[10.5px] font-bold text-ink-tertiary">
                        DESACTIVADO
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditando({ id: c.id, nombre: c.nombre })}
                      className="text-[12px] font-semibold text-teal-deep hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() =>
                        correr(
                          () =>
                            cambiarActivoConcepto({ id: c.id, activo: !c.activo }),
                          c.activo ? "Concepto desactivado." : "Concepto activado.",
                        )
                      }
                      className="text-[12px] font-semibold text-ink-secondary hover:underline disabled:opacity-50"
                    >
                      {c.activo ? "Desactivar" : "Activar"}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>

          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              correr(
                () => agregarConcepto({ grupoId: g.id, nombre: nuevo[g.id] ?? "" }),
                "Concepto agregado para todos.",
                () => setNuevo({ ...nuevo, [g.id]: "" }),
              );
            }}
          >
            <input
              value={nuevo[g.id] ?? ""}
              onChange={(e) => setNuevo({ ...nuevo, [g.id]: e.target.value })}
              placeholder="Agregar un concepto a este grupo…"
              className={CAMPO}
            />
            <button
              type="submit"
              disabled={pendiente || !(nuevo[g.id] ?? "").trim()}
              className="rounded-full bg-teal px-4 py-2 text-[12px] font-bold text-white hover:bg-teal-deep disabled:opacity-40"
            >
              Agregar
            </button>
          </form>
        </section>
      ))}
    </div>
  );
}
