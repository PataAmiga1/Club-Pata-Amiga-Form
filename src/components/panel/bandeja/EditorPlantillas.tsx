"use client";

import { useState, useTransition } from "react";
import {
  archivarPlantilla,
  guardarPlantilla,
} from "@/app/ventas/plantillas/actions";
import { VARIABLES } from "@/lib/crm/plantillas-variables";

export type PlantillaFila = {
  id: string;
  name: string;
  category: string | null;
  channels: string[];
  subject: string | null;
  body: string;
  usos: number;
  archivada: boolean;
};

const CANALES = [
  { key: "email", label: "Correo" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Messenger" },
];

const VACIA: PlantillaFila = {
  id: "",
  name: "",
  category: "",
  channels: [],
  subject: "",
  body: "",
  usos: 0,
  archivada: false,
};

export function EditorPlantillas({
  plantillas,
  puedeAdministrar,
}: {
  plantillas: PlantillaFila[];
  puedeAdministrar: boolean;
}) {
  const [editando, setEditando] = useState<PlantillaFila | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const decir = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(null), 4000);
  };

  const guardar = () => {
    if (!editando) return;
    startTransition(async () => {
      const res = await guardarPlantilla({
        id: editando.id || undefined,
        name: editando.name,
        category: editando.category ?? "",
        channels: editando.channels,
        subject: editando.subject ?? "",
        body: editando.body,
      });
      if ("error" in res) decir(res.error ?? "No se pudo guardar.");
      else {
        decir("Guardada ✓");
        setEditando(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] text-ink-secondary">
          {plantillas.filter((p) => !p.archivada).length} activas
        </span>
        <span className="flex items-center gap-2">
          {aviso && (
            <span className="text-[12px] font-bold text-success-text">{aviso}</span>
          )}
          {puedeAdministrar && (
            <button
              type="button"
              onClick={() => setEditando({ ...VACIA })}
              className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep"
            >
              + Nueva plantilla
            </button>
          )}
        </span>
      </div>

      {/* Editor */}
      {editando && (
        <div className="flex flex-col gap-3 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <h2 className="text-[15px] font-bold text-ink-title">
            {editando.id ? "Editar plantilla" : "Nueva plantilla"}
          </h2>
          <div className="grid gap-2.5 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                NOMBRE
              </span>
              <input
                value={editando.name}
                onChange={(e) => setEditando({ ...editando, name: e.target.value })}
                placeholder="Precios y planes"
                className="h-[36px] rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] outline-none focus:border-teal"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                CATEGORÍA
              </span>
              <input
                value={editando.category ?? ""}
                onChange={(e) =>
                  setEditando({ ...editando, category: e.target.value })
                }
                placeholder="ventas, soporte…"
                className="h-[36px] rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] outline-none focus:border-teal"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
              CANALES (ninguno = sirve para todos)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CANALES.map((c) => {
                const puesto = editando.channels.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() =>
                      setEditando({
                        ...editando,
                        channels: puesto
                          ? editando.channels.filter((x) => x !== c.key)
                          : [...editando.channels, c.key],
                      })
                    }
                    className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${
                      puesto
                        ? "bg-teal text-white"
                        : "border-[1.5px] border-border-input bg-white text-ink-secondary"
                    }`}
                  >
                    {puesto ? "✓ " : ""}
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
              ASUNTO (solo correo)
            </span>
            <input
              value={editando.subject ?? ""}
              onChange={(e) => setEditando({ ...editando, subject: e.target.value })}
              className="h-[36px] rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] outline-none focus:border-teal"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
              CUERPO
            </span>
            <textarea
              value={editando.body}
              onChange={(e) => setEditando({ ...editando, body: e.target.value })}
              rows={5}
              className="rounded-[10px] border-[1.5px] border-border-input px-3 py-2 text-[13px] outline-none focus:border-teal"
            />
          </label>

          {/* Variables disponibles: se insertan al hacer clic */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
              VARIABLES — se llenan con los datos del contacto al usarla
            </span>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v.clave}
                  type="button"
                  title={v.que}
                  onClick={() =>
                    setEditando({
                      ...editando,
                      body: `${editando.body}{{${v.clave}}}`,
                    })
                  }
                  className="rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold text-ink-secondary hover:bg-cream-light"
                >
                  {`{{${v.clave}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={guardar}
              className="rounded-full bg-teal px-5 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditando(null)}
              className="rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-bold text-ink-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="flex flex-col gap-2.5">
        {plantillas.map((p) => (
          <div
            key={p.id}
            className={`flex flex-wrap items-start gap-3 rounded-[14px] p-3.5 shadow-[0_2px_10px_rgba(30,83,80,.05)] ${
              p.archivada ? "bg-cream/60" : "bg-white"
            }`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-bold text-ink-title">
                  {p.name}
                </span>
                {p.category && (
                  <span className="rounded-full bg-cream px-2 py-0.5 text-[10.5px] font-semibold text-ink-secondary">
                    {p.category}
                  </span>
                )}
                {p.channels.length === 0 ? (
                  <span className="text-[10.5px] text-ink-tertiary">
                    todos los canales
                  </span>
                ) : (
                  p.channels.map((c) => (
                    <span key={c} className="text-[10.5px] text-ink-tertiary">
                      {c}
                    </span>
                  ))
                )}
                {p.archivada && (
                  <span className="rounded-full bg-ink-tertiary/20 px-2 py-0.5 text-[10px] font-bold text-ink-secondary">
                    archivada
                  </span>
                )}
              </span>
              {p.subject && (
                <span className="text-[11.5px] font-semibold text-ink-secondary">
                  Asunto: {p.subject}
                </span>
              )}
              <span className="line-clamp-2 text-[12px] leading-snug text-ink-body">
                {p.body}
              </span>
              <span className="text-[10.5px] text-ink-tertiary">
                usada {p.usos} {p.usos === 1 ? "vez" : "veces"}
              </span>
            </span>
            {puedeAdministrar && (
              <span className="flex flex-none gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditando(p)}
                  className="rounded-full border-[1.5px] border-border-input px-3 py-1.5 text-[11.5px] font-bold text-teal-deep hover:border-teal"
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    startTransition(async () => {
                      await archivarPlantilla(p.id, !p.archivada);
                      decir(p.archivada ? "Reactivada ✓" : "Archivada ✓");
                    })
                  }
                  className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-ink-tertiary underline"
                >
                  {p.archivada ? "Reactivar" : "Archivar"}
                </button>
              </span>
            )}
          </div>
        ))}
        {plantillas.length === 0 && (
          <p className="rounded-[16px] bg-white px-5 py-10 text-center text-[13px] text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            Todavía no hay plantillas.
          </p>
        )}
      </div>
    </div>
  );
}
