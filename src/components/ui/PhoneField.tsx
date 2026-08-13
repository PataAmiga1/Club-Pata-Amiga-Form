"use client";

import { useId, useMemo } from "react";
import { COUNTRY_DIAL_CODES, banderaDe, ladaDe, paises } from "@/data/countries";

/**
 * Teléfono con LADA SELECCIONABLE (equipo, 13-ago).
 *
 * Antes el prefijo era 🇲🇽 +52 fijo, así que un miembro extranjero no tenía
 * dónde capturar su número. Ahora la lada es un selector de todos los países
 * y México sigue siendo el predeterminado.
 *
 * QUÉ GUARDA `value`: el número completo en E.164 ("+525510926645"). Se
 * acepta y se entiende también el formato viejo —10 dígitos pelones, que es
 * como quedaron los teléfonos capturados hasta hoy—: se leen como mexicanos.
 * `normalizePhone` del CRM ya trataba ambos igual, así que nada río abajo se
 * rompe con el cambio.
 */

/** Formato mexicano "123 123 1234" (el resto de países se deja en bloques de 3). */
export function formatMxPhone(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

/**
 * Deja solo los 10 dígitos nacionales de lo que la persona escribió o pegó.
 *
 * Por qué existe: el campo ya muestra el prefijo +52, así que quien pega su
 * número completo ("+52 55 1092 6645", "52 5510926645", "0052...") acababa con
 * un número equivocado o corto, y el registro se detenía con "El teléfono debe
 * tener 10 dígitos" sin explicar por qué (hallazgo 10-ago). Ahora se le quita
 * la lada del país en lugar de rechazarlo.
 */
export function soloDigitosMx(entrada: string): string {
  let d = entrada.replace(/\D/g, "");
  // "0052..." → "52..."  (prefijo de marcación internacional)
  if (d.length > 10 && d.startsWith("00")) d = d.slice(2);
  // "52 55…" → "55…" (lada de México), solo si al quitarla sí quedan 10
  if (d.length > 10 && d.startsWith("52")) d = d.slice(2);
  // "1 55…" — el 1 que algunos operadores agregaban antes del celular
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.slice(0, 10);
}

/**
 * Hay ladas que comparten varios países ("1" es EE. UU. y Canadá, "7" es Rusia
 * y Kazajistán, "39" es Italia y el Vaticano). Al leer un número guardado no
 * hay forma de saber cuál era; se elige el de mayor población para que la
 * bandera que se muestra sea la esperada casi siempre.
 */
const PAIS_PRINCIPAL = new Set(["US", "RU", "IT"]);

/** Ladas de más dígitos primero: "1868" (Trinidad) antes que "1" (EE. UU.). */
const LADAS_POR_LARGO = [...COUNTRY_DIAL_CODES].sort(
  (a, b) =>
    b[1].length - a[1].length ||
    Number(PAIS_PRINCIPAL.has(b[0])) - Number(PAIS_PRINCIPAL.has(a[0])),
);

/**
 * Parte un teléfono guardado en país + número nacional.
 * Sin "+" se asume México, que es como está capturado el histórico.
 */
export function parseTelefono(value: string): { iso: string; nacional: string } {
  const bruto = (value ?? "").trim();
  if (!bruto.startsWith("+")) {
    return { iso: "MX", nacional: soloDigitosMx(bruto) };
  }
  const digitos = bruto.replace(/\D/g, "");
  // Ladas compartidas (1 → EE. UU./Canadá, 7 → Rusia/Kazajistán, 52 → México):
  // se elige la primera coincidencia del catálogo, que está ordenado con el
  // país principal arriba.
  for (const [iso, lada] of LADAS_POR_LARGO) {
    if (digitos.startsWith(lada)) return { iso, nacional: digitos.slice(lada.length) };
  }
  return { iso: "MX", nacional: digitos };
}

/** Arma el valor guardable a partir de país + número nacional. */
export function armaTelefono(iso: string, nacional: string): string {
  const d = nacional.replace(/\D/g, "");
  if (!d) return "";
  return `+${ladaDe(iso)}${d}`;
}

/**
 * ¿Es un teléfono capturable? México pide sus 10 dígitos exactos (regla de
 * siempre); para el resto de países basta con 6 a 15 dígitos, porque los
 * largos nacionales varían demasiado como para inventar una regla por país.
 */
export function telefonoCompleto(value: string): boolean {
  const { iso, nacional } = parseTelefono(value);
  if (iso === "MX") return nacional.length === 10;
  return nacional.length >= 6 && nacional.length <= 15;
}

export function PhoneField({
  label,
  value,
  onChange,
  hint,
  required,
  compact,
  className,
}: {
  /** Sin etiqueta (formularios densos) el placeholder la sustituye. */
  label?: string;
  /** Teléfono en E.164 ("+52…"). También se acepta el formato viejo de 10 dígitos. */
  value: string;
  /** Devuelve siempre E.164 ("+52…"), o "" si no hay número. */
  onChange: (telefono: string) => void;
  hint?: string;
  required?: boolean;
  /** Alto y tipografía de los formularios en rejilla (sucursales del centro). */
  compact?: boolean;
  className?: string;
}) {
  const id = useId();
  const { iso, nacional } = parseTelefono(value);
  const lista = useMemo(() => paises(), []);
  const esMx = iso === "MX";
  const alto = compact ? "h-10" : "h-12";
  const texto = compact ? "text-[13px]" : "text-[15px]";

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-semibold text-ink-title">
          {label}
        </label>
      )}
      <div
        className={`flex ${alto} w-full items-center rounded-[12px] border-[1.5px] border-border-input bg-white focus-within:border-2 focus-within:border-teal`}
      >
        {/* Lada: el <select> va encima, transparente, para conservar el menú
            nativo del sistema (el mejor en móvil) sin heredar su apariencia. */}
        <div className="relative flex h-full flex-none items-center border-r border-border-divider">
          <span
            className={`pointer-events-none flex items-center gap-1.5 ${compact ? "px-2.5" : "px-3.5"} ${texto}`}
          >
            <span aria-hidden>{banderaDe(iso)}</span>
            <span className="font-semibold text-ink-secondary">
              +{ladaDe(iso)}
            </span>
            <span aria-hidden className="text-[10px] text-ink-tertiary">
              ▾
            </span>
          </span>
          <select
            aria-label="Código de país"
            value={iso}
            onChange={(e) => onChange(armaTelefono(e.target.value, nacional))}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          >
            {lista.map((p) => (
              <option key={p.iso} value={p.iso}>
                {p.bandera} {p.nombre} (+{p.lada})
              </option>
            ))}
          </select>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          required={required}
          value={esMx ? formatMxPhone(nacional) : nacional}
          onChange={(e) =>
            onChange(
              armaTelefono(
                iso,
                esMx
                  ? soloDigitosMx(e.target.value)
                  : e.target.value.replace(/\D/g, "").slice(0, 15),
              ),
            )
          }
          placeholder={esMx ? "123 123 1234" : "Número sin lada"}
          autoComplete="tel-national"
          /* Sin maxLength: recortaba lo pegado a la mitad ("+52 55 1092 " → 8
             dígitos) antes de poder limpiarlo. El tope real lo pone
             soloDigitosMx. */
          className={`h-full min-w-0 flex-1 rounded-r-[12px] bg-transparent ${compact ? "px-2.5" : "px-3.5"} ${texto} text-ink-title outline-none placeholder:text-ink-placeholder`}
        />
      </div>
      {hint && <span className="text-xs text-ink-tertiary">{hint}</span>}
    </div>
  );
}
