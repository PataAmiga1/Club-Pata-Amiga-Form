"use client";

import { useState, useTransition } from "react";
import {
  agregarIdentidad,
  alternarEtiqueta,
  asignarPropietario,
  actualizarContacto,
  fijarDND,
  guardarCampoPersonalizado,
  seguirContacto,
} from "@/app/ventas/contactos/actions";

export type CampoDef = {
  key: string;
  label: string;
  type: "texto" | "numero" | "fecha" | "seleccion" | "booleano";
  group: string | null;
  options: string[];
};

export type FichaDatos = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
  contactType: string;
  ownerId: string | null;
  correos: string[];
  telefonos: string[];
  canales: { kind: string; value: string }[];
  etiquetas: string[];
  dnd: Record<string, boolean>;
  camposPropios: Record<string, unknown>;
  sigo: boolean;
  seguidores: number;
};

const CANALES_DND = [
  { key: "email", label: "Correo" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "llamada", label: "Llamada" },
  { key: "todos", label: "Todos los canales" },
] as const;

const TIPOS = ["lead", "miembro", "embajador", "centro", "otro"];

/**
 * Panel derecho del perfil, con la misma disposición que el equipo ya usa en
 * LynSales: Propietario · Seguidores · Etiquetas · pestañas
 * "Todos los campos / DND / Acciones" · grupos de campos.
 *
 * Correos y teléfonos son VARIOS por contacto, con su ⊕ para agregar.
 */
export function FichaLateral({
  datos,
  equipo,
  etiquetasCat,
  campos,
  puedeEditar,
}: {
  datos: FichaDatos;
  equipo: { id: string; nombre: string }[];
  etiquetasCat: { id: string; name: string }[];
  campos: CampoDef[];
  puedeEditar: boolean;
}) {
  const [pestana, setPestana] = useState<"campos" | "dnd" | "acciones">("campos");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [nuevoTel, setNuevoTel] = useState("");
  const [abriendoCorreo, setAbriendoCorreo] = useState(false);
  const [abriendoTel, setAbriendoTel] = useState(false);

  const correr = (fn: () => Promise<{ error?: string } | { ok: true }>) =>
    startTransition(async () => {
      const res = await fn();
      setAviso("error" in res && res.error ? res.error : "Guardado ✓");
      setTimeout(() => setAviso(null), 3500);
    });

  const grupos = [...new Set(campos.map((c) => c.group ?? "Contacto"))];

  const etiqueta = (texto: string) => (
    <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
      {texto}
    </span>
  );

  return (
    <aside className="flex w-full flex-col gap-3.5 rounded-[16px] bg-white p-4 shadow-[0_2px_10px_rgba(30,83,80,.05)] lg:w-[320px] lg:flex-none">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-ink-title">
          Detalles del contacto
        </span>
        {aviso && (
          <span className="text-[11px] font-bold text-success-text">{aviso}</span>
        )}
      </div>

      {/* Propietario y seguidores */}
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          {etiqueta("PROPIETARIO")}
          <select
            value={datos.ownerId ?? ""}
            disabled={!puedeEditar || pendiente}
            onChange={(e) =>
              correr(() => asignarPropietario(datos.id, e.target.value || null))
            }
            className="h-[34px] rounded-[8px] border-[1.5px] border-border-input bg-white px-2 text-[12px] text-ink-title outline-none focus:border-teal"
          >
            <option value="">Sin asignar</option>
            {equipo.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          {etiqueta("SEGUIDORES")}
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => seguirContacto(datos.id, !datos.sigo))}
            className={`h-[34px] rounded-[8px] border-[1.5px] text-[12px] font-bold transition-colors ${
              datos.sigo
                ? "border-teal bg-teal/10 text-teal-deep"
                : "border-border-input bg-white text-ink-secondary hover:border-teal"
            }`}
          >
            {datos.sigo ? "✓ Sigo esto" : "Seguir"}
            {datos.seguidores > 0 && ` (${datos.seguidores})`}
          </button>
        </div>
      </div>

      {/* Etiquetas */}
      <div className="flex flex-col gap-1.5">
        {etiqueta("ETIQUETAS")}
        <div className="flex flex-wrap gap-1.5">
          {etiquetasCat.map((t) => {
            const puesta = datos.etiquetas.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={!puedeEditar || pendiente}
                onClick={() => correr(() => alternarEtiqueta(datos.id, t.id, !puesta))}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  puesta
                    ? "bg-teal text-white"
                    : "border-[1.5px] border-border-input bg-white text-ink-secondary hover:border-teal"
                }`}
              >
                {puesta ? "✓ " : "+ "}
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 rounded-[10px] bg-cream p-1">
        {(
          [
            ["campos", "Todos los campos"],
            ["dnd", "DND"],
            ["acciones", "Acciones"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPestana(key)}
            className={`flex-1 rounded-[8px] px-2 py-1.5 text-[11.5px] font-bold transition-colors ${
              pestana === key
                ? "bg-white text-ink-title shadow-[0_1px_4px_rgba(30,83,80,.08)]"
                : "text-ink-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {pestana === "campos" && (
        <div className="flex flex-col gap-3">
          {/* Datos base */}
          <div className="flex flex-col gap-2.5">
            {etiqueta("CONTACTO")}
            <CampoTexto
              label="Nombre"
              valor={datos.firstName}
              editable={puedeEditar}
              onGuardar={(v) => correr(() => actualizarContacto(datos.id, { first_name: v }))}
            />
            <CampoTexto
              label="Apellidos"
              valor={datos.lastName}
              editable={puedeEditar}
              onGuardar={(v) => correr(() => actualizarContacto(datos.id, { last_name: v }))}
            />

            {/* Correos (varios) */}
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5">
                {etiqueta("CORREO ELECTRÓNICO")}
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => setAbriendoCorreo((v) => !v)}
                    aria-label="Agregar correo"
                    className="text-[13px] leading-none text-teal"
                  >
                    ⊕
                  </button>
                )}
              </span>
              {datos.correos.length === 0 && (
                <span className="text-[12.5px] text-ink-tertiary">—</span>
              )}
              {datos.correos.map((c) => (
                <a
                  key={c}
                  href={`mailto:${c}`}
                  className="text-[12.5px] text-ink-body underline decoration-border-divider"
                >
                  {c}
                </a>
              ))}
              {abriendoCorreo && (
                <span className="flex gap-1.5">
                  <input
                    value={nuevoCorreo}
                    onChange={(e) => setNuevoCorreo(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="h-[32px] flex-1 rounded-[8px] border-[1.5px] border-border-input px-2 text-[12px] outline-none focus:border-teal"
                  />
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() =>
                      correr(async () => {
                        const r = await agregarIdentidad(datos.id, "email", nuevoCorreo);
                        if (!("error" in r)) {
                          setNuevoCorreo("");
                          setAbriendoCorreo(false);
                        }
                        return r;
                      })
                    }
                    className="rounded-[8px] bg-teal px-3 text-[12px] font-bold text-white"
                  >
                    Agregar
                  </button>
                </span>
              )}
            </div>

            {/* Teléfonos (varios) */}
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5">
                {etiqueta("TELÉFONO")}
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => setAbriendoTel((v) => !v)}
                    aria-label="Agregar teléfono"
                    className="text-[13px] leading-none text-teal"
                  >
                    ⊕
                  </button>
                )}
              </span>
              {datos.telefonos.length === 0 && (
                <span className="text-[12.5px] text-ink-tertiary">—</span>
              )}
              {datos.telefonos.map((t) => (
                <a
                  key={t}
                  href={`tel:${t}`}
                  className="text-[12.5px] text-ink-body underline decoration-border-divider"
                >
                  🇲🇽 {t}
                </a>
              ))}
              {abriendoTel && (
                <span className="flex gap-1.5">
                  <input
                    value={nuevoTel}
                    onChange={(e) => setNuevoTel(e.target.value)}
                    placeholder="55 1234 5678"
                    className="h-[32px] flex-1 rounded-[8px] border-[1.5px] border-border-input px-2 text-[12px] outline-none focus:border-teal"
                  />
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() =>
                      correr(async () => {
                        const r = await agregarIdentidad(datos.id, "phone", nuevoTel);
                        if (!("error" in r)) {
                          setNuevoTel("");
                          setAbriendoTel(false);
                        }
                        return r;
                      })
                    }
                    className="rounded-[8px] bg-teal px-3 text-[12px] font-bold text-white"
                  >
                    Agregar
                  </button>
                </span>
              )}
            </div>

            <CampoTexto
              label="Fecha de nacimiento"
              valor={datos.birthDate}
              tipo="date"
              editable={puedeEditar}
              onGuardar={(v) => correr(() => actualizarContacto(datos.id, { birth_date: v }))}
            />
            <CampoTexto
              label="Ciudad"
              valor={datos.city}
              editable={puedeEditar}
              onGuardar={(v) => correr(() => actualizarContacto(datos.id, { city: v }))}
            />
            <CampoTexto
              label="Fuente de contacto"
              valor={datos.source}
              editable={puedeEditar}
              onGuardar={(v) => correr(() => actualizarContacto(datos.id, { source: v }))}
            />

            <label className="flex flex-col gap-1">
              {etiqueta("TIPO DE CONTACTO")}
              <select
                value={datos.contactType}
                disabled={!puedeEditar || pendiente}
                onChange={(e) =>
                  correr(() =>
                    actualizarContacto(datos.id, { contact_type: e.target.value }),
                  )
                }
                className="h-[32px] rounded-[8px] border-[1.5px] border-border-input bg-white px-2 text-[12px] text-ink-title outline-none focus:border-teal"
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            {/* Identidades de canal, solo lectura */}
            {datos.canales.length > 0 && (
              <div className="flex flex-col gap-1">
                {etiqueta("CANALES")}
                {datos.canales.map((c) => (
                  <span key={`${c.kind}${c.value}`} className="text-[12px] text-ink-body">
                    {c.kind}: <span className="text-ink-tertiary">{c.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Campos personalizados por grupo */}
          {grupos.map((g) => {
            const delGrupo = campos.filter((c) => (c.group ?? "Contacto") === g);
            if (delGrupo.length === 0) return null;
            return (
              <div key={g} className="flex flex-col gap-2.5 border-t border-border-divider pt-3">
                {etiqueta(g.toUpperCase())}
                {delGrupo.map((c) => (
                  <CampoPropio
                    key={c.key}
                    def={c}
                    valor={datos.camposPropios[c.key]}
                    editable={puedeEditar}
                    onGuardar={(v) =>
                      correr(() => guardarCampoPersonalizado(datos.id, c.key, v))
                    }
                  />
                ))}
              </div>
            );
          })}
          {campos.length === 0 && (
            <p className="border-t border-border-divider pt-3 text-[11.5px] text-ink-tertiary">
              Todavía no hay campos personalizados. Los crea el gerente de ventas
              y aparecen aquí para todo el equipo.
            </p>
          )}
        </div>
      )}

      {pestana === "dnd" && (
        <div className="flex flex-col gap-2">
          <p className="text-[11.5px] leading-snug text-ink-secondary">
            No contactar, <strong>por canal</strong>. Se respeta en el compositor
            de la bandeja, en los envíos masivos y en los agentes IA.
          </p>
          {CANALES_DND.map((c) => {
            const activo = !!datos.dnd[c.key];
            return (
              <label
                key={c.key}
                className="flex items-center justify-between rounded-[10px] bg-cream px-3 py-2"
              >
                <span className="text-[12.5px] font-semibold text-ink-body">
                  {c.label}
                </span>
                <input
                  type="checkbox"
                  checked={activo}
                  disabled={!puedeEditar || pendiente}
                  onChange={() => correr(() => fijarDND(datos.id, c.key, !activo))}
                  className="size-[18px]"
                />
              </label>
            );
          })}
        </div>
      )}

      {pestana === "acciones" && (
        <div className="flex flex-col gap-2">
          {datos.correos[0] && (
            <a
              href={`mailto:${datos.correos[0]}`}
              className="rounded-[10px] bg-cream px-3 py-2.5 text-[12.5px] font-bold text-ink-title hover:bg-cream-light"
            >
              ✉️ Escribir correo
            </a>
          )}
          {datos.telefonos[0] && (
            <>
              <a
                href={`tel:${datos.telefonos[0]}`}
                className="rounded-[10px] bg-cream px-3 py-2.5 text-[12.5px] font-bold text-ink-title hover:bg-cream-light"
              >
                📞 Llamar
              </a>
              <a
                href={`https://wa.me/${datos.telefonos[0].replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-[10px] bg-cream px-3 py-2.5 text-[12.5px] font-bold text-ink-title hover:bg-cream-light"
              >
                🟢 Abrir WhatsApp
              </a>
            </>
          )}
          <p className="text-[11.5px] leading-snug text-ink-tertiary">
            Responder desde la plataforma, con plantillas y adjuntos, llega con la
            bandeja unificada (fase 2).
          </p>
        </div>
      )}
    </aside>
  );
}

/** Campo de texto que se guarda al salir del foco. */
function CampoTexto({
  label,
  valor,
  tipo = "text",
  editable,
  onGuardar,
}: {
  label: string;
  valor: string | null;
  tipo?: "text" | "date";
  editable: boolean;
  onGuardar: (valor: string) => void;
}) {
  const [texto, setTexto] = useState(valor ?? "");

  if (!editable)
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
          {label.toUpperCase()}
        </span>
        <span className="text-[12.5px] text-ink-body">{valor || "—"}</span>
      </div>
    );

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
        {label.toUpperCase()}
      </span>
      <input
        type={tipo}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto !== (valor ?? "")) onGuardar(texto);
        }}
        placeholder="—"
        className="h-[32px] rounded-[8px] border-[1.5px] border-border-input px-2 text-[12.5px] text-ink-title outline-none focus:border-teal"
      />
    </label>
  );
}

function CampoPropio({
  def,
  valor,
  editable,
  onGuardar,
}: {
  def: CampoDef;
  valor: unknown;
  editable: boolean;
  onGuardar: (valor: string | number | boolean | null) => void;
}) {
  const [texto, setTexto] = useState(valor == null ? "" : String(valor));

  if (def.type === "booleano")
    return (
      <label className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] text-ink-body">{def.label}</span>
        <input
          type="checkbox"
          checked={valor === true}
          disabled={!editable}
          onChange={(e) => onGuardar(e.target.checked)}
          className="size-[18px]"
        />
      </label>
    );

  if (def.type === "seleccion")
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
          {def.label.toUpperCase()}
        </span>
        <select
          value={texto}
          disabled={!editable}
          onChange={(e) => {
            setTexto(e.target.value);
            onGuardar(e.target.value || null);
          }}
          className="h-[32px] rounded-[8px] border-[1.5px] border-border-input bg-white px-2 text-[12.5px] outline-none focus:border-teal"
        >
          <option value="">—</option>
          {def.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
        {def.label.toUpperCase()}
      </span>
      <input
        type={def.type === "numero" ? "number" : def.type === "fecha" ? "date" : "text"}
        value={texto}
        disabled={!editable}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const actual = valor == null ? "" : String(valor);
          if (texto !== actual)
            onGuardar(
              texto === ""
                ? null
                : def.type === "numero"
                  ? Number(texto)
                  : texto,
            );
        }}
        className="h-[32px] rounded-[8px] border-[1.5px] border-border-input px-2 text-[12.5px] outline-none focus:border-teal"
      />
    </label>
  );
}
