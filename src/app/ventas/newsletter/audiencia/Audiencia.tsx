"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  agregarBajaManual,
  cargarAudiencia,
  deshacerBaja,
  previsualizarAudiencia,
  type ResumenAudiencia,
} from "./actions";

const ORIGEN: Record<string, string> = {
  sitio_anterior: "Suscriptores del sitio anterior",
  miembro: "Miembros con membresía activa",
};

const MOTIVO: Record<string, string> = {
  correo_invalido: "Correo inválido",
  prueba: "Cuentas de prueba o internas",
  lista_negra: "Se dieron de baja del correo",
  crm_no_contactar: "«No contactar» en el CRM",
  equipo: "Son del equipo",
  sacado_del_mailing: "Sacados del mailing por el equipo",
  baja_del_boletin: "Ya se habían dado de baja del boletín",
};

function nombreOrigen(o: string) {
  return ORIGEN[o] ?? (o.startsWith("landing:") ? `Landing «${o.slice(8)}»` : o);
}

function Lista({ titulo, datos, nombre }: { titulo: string; datos: Record<string, number>; nombre: (k: string) => string }) {
  const filas = Object.entries(datos ?? {});
  if (filas.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[12px] font-bold text-ink-title">{titulo}</p>
      <ul className="flex flex-col gap-0.5 text-[12.5px] text-ink-secondary">
        {filas.map(([k, n]) => (
          <li key={k} className="flex justify-between gap-3">
            <span>{nombre(k)}</span>
            <strong>{n}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CargarAudiencia() {
  const [resumen, setResumen] = useState<ResumenAudiencia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const correr = (aplicar: boolean) =>
    start(async () => {
      setError(null);
      const r = aplicar ? await cargarAudiencia() : await previsualizarAudiencia();
      if ("error" in r) setError(r.error ?? "Algo falló.");
      else setResumen(r.resumen);
    });

  return (
    <div className="flex flex-col gap-3 border-t border-black/5 pt-3">
      <p className="text-[12.5px] leading-snug text-ink-secondary">
        <strong>Cargar audiencia</strong> suma al boletín a quien ya dio permiso:
        los suscriptores del sitio anterior, los registros de landing que
        aceptaron recibir comunicaciones y los miembros con membresía activa.
        Deja fuera a quien se dio de baja, a los «no contactar» del CRM, al
        equipo y a las cuentas de prueba. Se puede correr las veces que sea: no
        duplica a nadie ni vuelve a dar de alta a quien se dio de baja.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => correr(false)}
          className="rounded-full border border-teal px-4 py-2 text-[12.5px] font-bold text-teal disabled:opacity-50"
        >
          Ver cuántos serían
        </button>
        {resumen && !resumen.aplicado && resumen.total_por_agregar > 0 && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(true)}
            className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Cargar {resumen.total_por_agregar} a la lista
          </button>
        )}
      </div>
      {error && <p className="text-[12.5px] font-semibold text-red-700">{error}</p>}
      {resumen && (
        <div className="flex flex-col gap-3 rounded-[12px] bg-cream p-3">
          {resumen.aplicado && (
            <p className="text-[13px] font-bold text-teal-deep">
              Listo: se agregaron {resumen.agregados} a la lista del boletín.
            </p>
          )}
          <Lista titulo="De dónde salen (registros)" datos={resumen.por_origen} nombre={nombreOrigen} />
          <p className="text-[12.5px] text-ink-secondary">
            Correos distintos: <strong>{resumen.correos_unicos}</strong> · ya estaban en la
            lista: <strong>{resumen.ya_en_la_lista}</strong>
          </p>
          <Lista titulo="Quedan fuera" datos={resumen.excluidos} nombre={(k) => MOTIVO[k] ?? k} />
          <Lista
            titulo={resumen.aplicado ? "Se agregaron" : "Se agregarían"}
            datos={resumen.por_agregar}
            nombre={nombreOrigen}
          />
        </div>
      )}
    </div>
  );
}

export type FilaBajaVista = {
  email: string;
  cuando: string;
  origen: string;
  contactId: string | null;
};

export function BajasCorreo({
  filas,
  puedeAdministrar,
}: {
  filas: FilaBajaVista[];
  puedeAdministrar: boolean;
}) {
  const [nuevo, setNuevo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [pendiente, start] = useTransition();

  const visibles = filtro
    ? filas.filter((f) => f.email.includes(filtro.trim().toLowerCase()))
    : filas;

  const agregar = () =>
    start(async () => {
      const r = await agregarBajaManual(nuevo);
      if ("error" in r) setAviso(r.error ?? "Algo falló.");
      else {
        setAviso(r.yaEstaba ? "Ese correo ya estaba dado de baja." : "Listo, ya no le escribiremos.");
        setNuevo("");
      }
    });

  const deshacer = (email: string) => {
    if (!confirm(`¿Volver a escribirle a ${email}? Hazlo solo si la persona lo pidió.`)) return;
    start(async () => {
      const r = await deshacerBaja(email);
      setAviso("error" in r ? (r.error ?? "Algo falló.") : `Se deshizo la baja de ${email}.`);
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-[16px] bg-white p-4 shadow-[0_1px_8px_rgba(30,83,80,.06)] md:p-5">
      <h2 className="font-display text-[18px] text-ink-title">Bajas de correo: {filas.length}</h2>
      <p className="text-[12.5px] leading-snug text-ink-secondary">
        A estas personas no se les manda boletín ni correos masivos. Si alguien
        pide la baja por otro medio (WhatsApp, teléfono, respondiendo un
        correo), agrégala aquí.
      </p>

      {puedeAdministrar && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="min-w-0 flex-1 rounded-[10px] border border-black/15 px-3 py-2 text-[13px]"
          />
          <button
            type="button"
            disabled={pendiente || !nuevo.trim()}
            onClick={agregar}
            className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Dar de baja
          </button>
        </div>
      )}
      {aviso && <p className="text-[12.5px] font-semibold text-ink-title">{aviso}</p>}

      {filas.length > 8 && (
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar correo"
          className="rounded-[10px] border border-black/15 px-3 py-2 text-[13px]"
        />
      )}

      {visibles.length === 0 ? (
        <p className="text-[12.5px] text-ink-tertiary">Nadie se ha dado de baja.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-black/5">
          {visibles.map((f) => (
            <li key={f.email} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col">
                <span className="break-all text-[13px] font-semibold text-ink-title">
                  {f.contactId ? (
                    <Link href={`/ventas/contactos/${f.contactId}`} className="underline">
                      {f.email}
                    </Link>
                  ) : (
                    f.email
                  )}
                </span>
                <span className="text-[11.5px] text-ink-tertiary">
                  {f.cuando} · {f.origen}
                </span>
              </div>
              {puedeAdministrar && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => deshacer(f.email)}
                  className="self-start rounded-full border border-black/15 px-3 py-1 text-[11.5px] font-bold text-ink-secondary disabled:opacity-50 sm:self-auto"
                >
                  Deshacer baja
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
