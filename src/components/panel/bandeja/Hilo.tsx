"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  alternarDestacado,
  archivar,
  asignarConversacion,
  devolverAlAgente,
  enviarMensaje,
  enviarPlantillaWhatsApp,
  marcarNoLeido,
  posponer,
  previsualizarPlantilla,
  subirAdjunto,
  tomarConversacion,
  votarMensaje,
} from "@/app/ventas/conversaciones/actions";
import { CANAL_SELLO } from "./ListaConversaciones";
// La regla de las 24 h vive en un solo lugar: la misma que aplica el servidor.
import { ventanaAbierta } from "@/lib/channels/ventana";

export type PlantillaResumen = {
  id: string;
  name: string;
  category: string | null;
  channels: string[];
};

export type PlantillaWhatsApp = {
  id: string;
  metaName: string;
  preview: string;
  status: string;
};

export type Pieza =
  | {
      tipo: "mensaje";
      id: string;
      quien: "contacto" | "ia" | "persona";
      autor: string | null;
      texto: string;
      interna: boolean;
      cuando: string;
      errorEnvio: string | null;
      programadoPara: string | null;
      voto: 1 | -1 | null;
    }
  | {
      tipo: "evento";
      id: string;
      texto: string;
      cuando: string;
      icono: string;
    };

export type CabezaHilo = {
  id: string;
  canal: string;
  nombre: string;
  contactId: string | null;
  asignadoA: string | null;
  asignadoId: string | null;
  iaPausada: boolean;
  necesitaAtencion: boolean;
  destacado: boolean;
  cerrado: boolean;
  pospuestoHasta: string | null;
  /** Fecha del último mensaje entrante, para la ventana de 24 h de Meta. */
  ultimoEntrante: string | null;
};

const HORA = new Intl.DateTimeFormat("es-MX", {
  hour: "numeric",
  minute: "2-digit",
});
const FECHA_LARGA = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function diaDe(iso: string) {
  return iso.slice(0, 10);
}

function etiquetaDia(iso: string) {
  const hoy = new Date();
  const ayer = new Date(Date.now() - 86_400_000);
  const d = diaDe(iso);
  if (d === hoy.toISOString().slice(0, 10)) return "Hoy";
  if (d === ayer.toISOString().slice(0, 10)) return "Ayer";
  return FECHA_LARGA.format(new Date(iso));
}

/**
 * Hilo de la conversación: mensajes de cualquier canal, notas internas y
 * eventos de la plataforma, todo en orden cronológico y con separadores de día
 * y la línea "Nuevo" — la misma lectura que el equipo ya tiene.
 */
export function Hilo({
  cabeza,
  piezas,
  primerNoLeido,
  equipo,
  puedeEditar,
  plantillas = [],
  plantillasWa = [],
}: {
  cabeza: CabezaHilo;
  piezas: Pieza[];
  /** Id del primer mensaje que yo no había leído (para la línea "Nuevo"). */
  primerNoLeido: string | null;
  equipo: { id: string; nombre: string }[];
  puedeEditar: boolean;
  plantillas?: PlantillaResumen[];
  plantillasWa?: PlantillaWhatsApp[];
}) {
  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [programar, setProgramar] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [adjuntos, setAdjuntos] = useState<{ ruta: string; nombre: string }[]>([]);
  const [faltantes, setFaltantes] = useState<string[]>([]);

  const decir = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(null), 6000);
  };

  const correr = (fn: () => Promise<{ error?: string; aviso?: string } | { ok: true }>) =>
    startTransition(async () => {
      const res = await fn();
      if ("error" in res && res.error) decir(res.error);
      else if ("aviso" in res && res.aviso) decir(res.aviso);
      else decir("Listo ✓");
    });

  const abierta = ventanaAbierta(cabeza.canal, cabeza.ultimoEntrante);
  const bloqueado = !interna && !abierta;

  // Dónde va cada separador de día. Se calcula ANTES del JSX (comparando cada
  // pieza con la anterior) en vez de ir arrastrando una variable dentro del
  // `.map`: reasignar durante el render deja el resultado a merced de cuántas
  // veces React decida re-renderizar.
  const abreDia = piezas.map(
    (p, i) => i === 0 || diaDe(p.cuando) !== diaDe(piezas[i - 1].cuando),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-divider px-4 py-2.5">
        <span aria-hidden className="text-[15px]">
          {CANAL_SELLO[cabeza.canal] ?? "•"}
        </span>
        {cabeza.contactId ? (
          <Link
            href={`/ventas/contactos/${cabeza.contactId}`}
            className="text-[14px] font-bold text-ink-title hover:text-teal"
          >
            {cabeza.nombre}
          </Link>
        ) : (
          <span className="text-[14px] font-bold text-ink-title">{cabeza.nombre}</span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => alternarDestacado(cabeza.id))}
            title="Destacar (solo para mí)"
            className="grid size-[30px] place-items-center rounded-full text-[13px] hover:bg-cream"
          >
            {cabeza.destacado ? "⭐" : "☆"}
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => marcarNoLeido(cabeza.id))}
            title="Marcar como no leída"
            className="grid size-[30px] place-items-center rounded-full text-[13px] hover:bg-cream"
          >
            ✉️
          </button>
          {puedeEditar && (
            <>
              <select
                aria-label="Asignar conversación"
                value={cabeza.asignadoId ?? ""}
                disabled={pendiente}
                onChange={(e) =>
                  correr(() => asignarConversacion(cabeza.id, e.target.value || null))
                }
                className="h-[30px] rounded-full border-[1.5px] border-border-input bg-white px-2 text-[11.5px] font-semibold text-ink-body outline-none focus:border-teal"
              >
                <option value="">Sin asignar</option>
                {equipo.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <input
                type="date"
                aria-label="Posponer hasta"
                disabled={pendiente}
                onChange={(e) =>
                  correr(() =>
                    posponer(
                      cabeza.id,
                      e.target.value
                        ? new Date(`${e.target.value}T09:00:00`).toISOString()
                        : null,
                    ),
                  )
                }
                className="h-[30px] rounded-full border-[1.5px] border-border-input px-2 text-[11px] outline-none focus:border-teal"
              />
              <button
                type="button"
                disabled={pendiente}
                onClick={() => correr(() => archivar(cabeza.id, !cabeza.cerrado))}
                className="rounded-full border-[1.5px] border-border-input px-3 py-1 text-[11.5px] font-bold text-ink-secondary hover:border-teal"
              >
                {cabeza.cerrado ? "Reabrir" : "Archivar"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Estado de la IA / atención */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-divider bg-cream/60 px-4 py-2">
        {cabeza.necesitaAtencion && (
          <span className="rounded-full bg-pink/15 px-2.5 py-1 text-[11px] font-bold text-pink">
            ❗ Marcada para atención humana
          </span>
        )}
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            cabeza.iaPausada
              ? "bg-orange/15 text-orange"
              : "bg-lime/25 text-ink-title"
          }`}
        >
          {cabeza.iaPausada ? "La IA no responde aquí" : "La IA está respondiendo"}
        </span>
        {puedeEditar &&
          (cabeza.iaPausada ? (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => devolverAlAgente(cabeza.id))}
              className="text-[11.5px] font-bold text-teal underline"
            >
              Devolver al asistente
            </button>
          ) : (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => tomarConversacion(cabeza.id))}
              className="text-[11.5px] font-bold text-teal underline"
            >
              Tomar la conversación
            </button>
          ))}
        {aviso && (
          <span className="ml-auto text-[11.5px] font-bold text-success-text">
            {aviso}
          </span>
        )}
      </div>

      {/* Piezas del hilo */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {piezas.length === 0 && (
          <p className="py-10 text-center text-[13px] text-ink-secondary">
            Sin mensajes todavía.
          </p>
        )}
        {piezas.map((p, i) => {
          const nuevoDia = abreDia[i];

          return (
            <div key={`${p.tipo}-${p.id}`}>
              {nuevoDia && (
                <div className="my-2.5 flex items-center gap-2">
                  <span className="h-px flex-1 bg-border-divider" />
                  <span className="rounded-full bg-cream px-2.5 py-0.5 text-[10.5px] font-bold text-ink-tertiary">
                    {etiquetaDia(p.cuando)}
                  </span>
                  <span className="h-px flex-1 bg-border-divider" />
                </div>
              )}
              {primerNoLeido === p.id && (
                <div className="my-2 flex items-center gap-2">
                  <span className="h-px flex-1 bg-pink/50" />
                  <span className="text-[10.5px] font-extrabold text-pink">NUEVO</span>
                  <span className="h-px flex-1 bg-pink/50" />
                </div>
              )}

              {p.tipo === "evento" ? (
                <div className="my-1.5 flex items-center justify-center gap-1.5">
                  <span className="rounded-full bg-cream px-2.5 py-1 text-[10.5px] text-ink-secondary">
                    <span aria-hidden>{p.icono} </span>
                    {p.texto}
                  </span>
                </div>
              ) : (
                <div
                  className={`my-1.5 flex ${
                    p.quien === "contacto" ? "justify-start" : "justify-end"
                  }`}
                >
                  <div
                    className={`flex max-w-[78%] flex-col gap-1 rounded-[12px] px-3 py-2 ${
                      p.interna
                        ? "border-[1.5px] border-dashed border-orange/60 bg-orange/[.07]"
                        : p.quien === "contacto"
                          ? "bg-cream"
                          : "bg-teal/10"
                    }`}
                  >
                    {p.interna && (
                      <span className="text-[9.5px] font-extrabold tracking-[.05em] text-orange">
                        👁️ NOTA INTERNA — EL CLIENTE NO LA VE
                      </span>
                    )}
                    <span className="whitespace-pre-line text-[13px] leading-snug text-ink-body">
                      {p.texto}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-ink-tertiary">
                      {p.quien === "ia" && <span title="Respuesta de la IA">✨ IA</span>}
                      {p.autor && <span>{p.autor}</span>}
                      <span>{HORA.format(new Date(p.cuando))}</span>
                      {p.programadoPara && (
                        <span className="font-bold text-teal">
                          programado{" "}
                          {new Intl.DateTimeFormat("es-MX", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                          }).format(new Date(p.programadoPara))}
                        </span>
                      )}
                    </span>
                    {p.errorEnvio && (
                      <span className="rounded-[6px] bg-error-bg px-2 py-1 text-[10.5px] font-semibold text-error-text">
                        No salió: {p.errorEnvio}
                      </span>
                    )}
                    {p.quien === "ia" && (
                      <span className="flex items-center gap-1.5">
                        {([1, -1] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            disabled={pendiente}
                            onClick={() => correr(() => votarMensaje(p.id, v))}
                            aria-label={v === 1 ? "Buena respuesta" : "Mala respuesta"}
                            className={`text-[12px] ${
                              p.voto === v ? "opacity-100" : "opacity-40 hover:opacity-80"
                            }`}
                          >
                            {v === 1 ? "👍" : "👎"}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Compositor */}
      {puedeEditar && (
        <div className="border-t border-border-divider px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {(
              [
                [false, `Responder por ${cabeza.canal}`],
                [true, "👁️ Comentario interno"],
              ] as const
            ).map(([valor, label]) => (
              <button
                key={String(valor)}
                type="button"
                onClick={() => setInterna(valor)}
                className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                  interna === valor
                    ? "bg-teal text-white"
                    : "border-[1.5px] border-border-input bg-white text-ink-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Fuera de la ventana de 24 h: la salida son las plantillas aprobadas */}
          {bloqueado && (
            <div className="mb-2 flex flex-col gap-2 rounded-[10px] bg-orange/10 px-3 py-2.5">
              <p className="text-[12px] leading-snug text-ink-title">
                El usuario no ha escrito en las últimas 24 horas, así que{" "}
                {cabeza.canal} no permite texto libre.
                {cabeza.canal === "whatsapp"
                  ? " Puedes reabrir la conversación con una plantilla aprobada:"
                  : " Puedes dejar un comentario interno."}
              </p>
              {cabeza.canal === "whatsapp" && (
                <div className="flex flex-col gap-1.5">
                  {plantillasWa.length === 0 && (
                    <span className="text-[11.5px] text-ink-secondary">
                      Todavía no hay plantillas registradas.
                    </span>
                  )}
                  {plantillasWa.map((p) => {
                    const lista = p.status === "aprobada";
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={pendiente || !lista}
                        title={
                          lista
                            ? p.preview
                            : `Meta todavía no la aprueba (está ${p.status})`
                        }
                        onClick={() =>
                          correr(() => enviarPlantillaWhatsApp(cabeza.id, p.id))
                        }
                        className={`flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[11.5px] ${
                          lista
                            ? "bg-white font-bold text-teal-deep hover:bg-cream"
                            : "cursor-not-allowed bg-white/60 text-ink-tertiary"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {p.metaName}
                        </span>
                        <span className="flex-none text-[10px] font-semibold">
                          {lista ? "enviar" : p.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            disabled={bloqueado}
            placeholder={
              interna
                ? "Nota para el equipo — el cliente no la ve"
                : "Escribe un mensaje…"
            }
            className="w-full rounded-[10px] border-[1.5px] border-border-input px-3 py-2 text-[13px] text-ink-title outline-none focus:border-teal disabled:bg-cream/60"
          />

          {/* Variables que la plantilla no pudo llenar con datos de este contacto */}
          {faltantes.length > 0 && (
            <p className="mt-2 rounded-[10px] bg-orange/10 px-3 py-2 text-[11.5px] text-ink-title">
              Revisa antes de enviar: la plantilla usa{" "}
              <strong>{faltantes.join(", ")}</strong> y este contacto no tiene ese
              dato, así que quedó en blanco.
            </p>
          )}

          {/* Adjuntos ya subidos */}
          {adjuntos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {adjuntos.map((a) => (
                <span
                  key={a.ruta}
                  className="flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1 text-[11px] text-ink-body"
                >
                  📎 {a.nombre}
                  <button
                    type="button"
                    onClick={() =>
                      setAdjuntos((l) => l.filter((x) => x.ruta !== a.ruta))
                    }
                    aria-label={`Quitar ${a.nombre}`}
                    className="font-bold text-ink-tertiary"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!interna && plantillas.length > 0 && (
              <select
                aria-label="Insertar plantilla"
                defaultValue=""
                disabled={pendiente || bloqueado}
                onChange={(e) => {
                  const id = e.target.value;
                  e.target.value = "";
                  if (!id) return;
                  startTransition(async () => {
                    const res = await previsualizarPlantilla(cabeza.id, id);
                    if ("error" in res) {
                      decir(res.error ?? "No se pudo cargar la plantilla.");
                      return;
                    }
                    setTexto(res.texto);
                    setFaltantes(res.faltantes);
                    if (res.adjuntos.length > 0)
                      setAdjuntos((l) => [
                        ...l,
                        ...res.adjuntos.map((r) => ({
                          ruta: r,
                          nombre: r.split("/").pop() ?? r,
                        })),
                      ]);
                    decir(`Plantilla "${res.nombre}" lista — revísala antes de enviar`);
                  });
                }}
                className="h-[34px] rounded-[10px] border-[1.5px] border-border-input bg-white px-2 text-[11.5px] font-semibold text-ink-body outline-none focus:border-teal"
              >
                <option value="">📄 Plantilla…</option>
                {plantillas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.category ? ` · ${p.category}` : ""}
                  </option>
                ))}
              </select>
            )}

            {!interna && (
              <label className="grid h-[34px] cursor-pointer place-items-center rounded-[10px] border-[1.5px] border-border-input px-2.5 text-[11.5px] font-semibold text-ink-body hover:border-teal">
                📎 Adjuntar
                <input
                  type="file"
                  className="hidden"
                  disabled={pendiente || bloqueado}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const fd = new FormData();
                    fd.set("file", f);
                    startTransition(async () => {
                      const res = await subirAdjunto(fd);
                      if ("error" in res) decir(res.error ?? "No se pudo subir.");
                      else {
                        setAdjuntos((l) => [...l, { ruta: res.ruta, nombre: res.nombre }]);
                        decir("Adjunto listo ✓");
                      }
                    });
                  }}
                />
              </label>
            )}

            {!interna && (
              <input
                type="datetime-local"
                aria-label="Programar envío"
                value={programar}
                onChange={(e) => setProgramar(e.target.value)}
                className="h-[34px] rounded-[10px] border-[1.5px] border-border-input px-2 text-[11.5px] outline-none focus:border-teal"
              />
            )}
            <button
              type="button"
              disabled={pendiente || !texto.trim() || bloqueado}
              onClick={() =>
                correr(async () => {
                  const res = await enviarMensaje(cabeza.id, texto, {
                    interna,
                    programarPara: programar
                      ? new Date(programar).toISOString()
                      : null,
                    adjuntos,
                  });
                  if (!("error" in res)) {
                    setTexto("");
                    setProgramar("");
                    setAdjuntos([]);
                    setFaltantes([]);
                  }
                  return res;
                })
              }
              className="rounded-full bg-teal px-5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
            >
              {interna ? "Guardar nota" : programar ? "Programar" : "Enviar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
