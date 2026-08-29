"use client";

import { useEffect, useRef, useState } from "react";
import { TextField } from "@/components/ui/Field";
import { FotoDocumento } from "@/components/ui/FotoDocumento";
import { esRfcDeMoral } from "@/lib/rfc";
import type { TipoPersona } from "@/lib/documentos-solicitud";

/**
 * Persona física o moral, al inicio de los dos formularios de alta
 * (equipo, 19-ago — decisiones 1.1 a 1.3).
 *
 * Los dos formularios daban por hecho que quien se da de alta es una persona.
 * En la práctica muchos centros son una sociedad, y el convenio se firma —y las
 * comisiones se pagan— a nombre de la razón social.
 *
 * QUÉ SE PIDE Y QUÉ NO. De la entidad: razón social y constancia de situación
 * fiscal (RFC). NADA de acta constitutiva: son treinta y tantas páginas que una
 * clínica chica rara vez tiene escaneadas, y pedirla en el alta mata la
 * conversión de justo el perfil que se quiere sumar. La constancia ya prueba lo
 * que importa —que la entidad existe, está registrada ante el SAT y trae razón
 * social y domicilio fiscal— y el riesgo se termina de cubrir con la
 * identificación del representante y la revisión de la CLABE contra la razón
 * social que hace el comité. Si algo no cuadra, se pide después.
 */
export function TipoPersonaFields({
  tipo,
  onTipo,
  razonSocial,
  onRazonSocial,
  rfc,
  onRfc,
  constancia,
  onConstancia,
  quien,
}: {
  tipo: TipoPersona;
  onTipo: (t: TipoPersona) => void;
  razonSocial: string;
  onRazonSocial: (v: string) => void;
  rfc: string;
  onRfc: (v: string) => void;
  constancia: string;
  onConstancia: (v: string) => void;
  /** Cambia solo el texto: es el mismo bloque en los dos formularios. */
  quien: "embajador" | "centro";
}) {
  // El aviso del representante sale UNA vez, al subir la constancia
  // (decisión 1.1b). Se recuerda que ya se mostró para que no reaparezca si la
  // persona cambia el archivo.
  const [avisoAbierto, setAvisoAbierto] = useState(false);
  const yaAvisado = useRef(false);
  useEffect(() => {
    if (tipo === "moral" && constancia && !yaAvisado.current) {
      yaAvisado.current = true;
      setAvisoAbierto(true);
    }
  }, [tipo, constancia]);

  const rfcMal = rfc.trim().length > 0 && !esRfcDeMoral(rfc);

  const OPCIONES: { valor: TipoPersona; titulo: string; pie: string }[] = [
    {
      valor: "fisica",
      titulo: "Persona física",
      pie:
        quien === "embajador"
          ? "Te das de alta a título personal."
          : "El centro opera a nombre de una persona.",
    },
    {
      valor: "moral",
      titulo: "Persona moral",
      pie:
        quien === "embajador"
          ? "Te das de alta a nombre de una empresa o sociedad."
          : "El centro opera a nombre de una empresa o sociedad.",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-title">
          ¿Cómo te das de alta?
        </span>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {OPCIONES.map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => onTipo(o.valor)}
              aria-pressed={tipo === o.valor}
              className={`flex flex-col items-start gap-0.5 rounded-[14px] border-[1.5px] px-4 py-3 text-left transition-colors ${
                tipo === o.valor
                  ? "border-teal bg-teal/10"
                  : "border-border-input bg-white hover:border-teal"
              }`}
            >
              <span className="text-[13.5px] font-bold text-ink-title">
                {o.titulo}
              </span>
              <span className="text-[11.5px] leading-snug text-ink-tertiary">
                {o.pie}
              </span>
            </button>
          ))}
        </div>
      </div>

      {tipo === "moral" && (
        <div className="flex flex-col gap-3 rounded-[14px] bg-cream/60 p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-ink-title">
              Datos de la empresa
            </span>
            <span className="text-xs text-ink-tertiary">
              No necesitamos el acta constitutiva: con la constancia de
              situación fiscal basta.
            </span>
          </div>
          <TextField
            label="Razón social"
            value={razonSocial}
            onChange={(e) => onRazonSocial(e.target.value)}
            placeholder="Tal como aparece en la constancia"
            required
          />
          <TextField
            label="RFC de la empresa"
            value={rfc}
            onChange={(e) => onRfc(e.target.value.toUpperCase())}
            maxLength={12}
            placeholder="12 caracteres"
            hint={
              rfcMal
                ? "El RFC de una empresa son 12 caracteres. Si escribiste uno de 13, ese es el de una persona."
                : "El de la empresa, no el tuyo."
            }
            required
          />
          <FotoDocumento
            label="Constancia de situación fiscal"
            hint="Foto o PDF. La descargas del portal del SAT."
            value={constancia}
            onChange={onConstancia}
          />
        </div>
      )}

      {avisoAbierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Datos del representante legal"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-5"
          onClick={() => setAvisoAbierto(false)}
        >
          <div
            className="flex w-full max-w-[420px] flex-col gap-3 rounded-[20px] bg-white p-6 text-center shadow-[0_8px_30px_rgba(30,83,80,.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[38px]" aria-hidden>
              📇
            </span>
            <h3 className="font-display text-[20px] text-ink-title">
              Falta quién responde por la empresa
            </h3>
            <p className="text-[13.5px] leading-relaxed text-ink-secondary">
              Ya con la constancia sabemos que la empresa existe. Ahora
              necesitamos los datos de su <strong>representante legal</strong>:
              nombre, CURP e identificación oficial por los dos lados. Son los
              campos que siguen abajo.
            </p>
            <button
              type="button"
              onClick={() => setAvisoAbierto(false)}
              className="mt-1 grid h-11 place-items-center rounded-full bg-teal px-6 text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
