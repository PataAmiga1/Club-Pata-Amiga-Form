"use client";

import { useId } from "react";

/**
 * Teléfono mexicano (regla del sitio anterior): prefijo fijo 🇲🇽 +52,
 * solo dígitos, máximo 10, con formato automático "123 123 1234".
 * `value` guarda solo los dígitos (sin formato) para la BD.
 */
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

export function PhoneField({
  label,
  value,
  onChange,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  hint?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-title">
        {label}
      </label>
      <div className="flex h-12 w-full items-center rounded-[12px] border-[1.5px] border-border-input bg-white focus-within:border-2 focus-within:border-teal">
        <span className="flex items-center gap-1.5 border-r border-border-divider px-3.5 text-[15px]">
          <span aria-hidden>🇲🇽</span>
          <span className="font-semibold text-ink-secondary">+52</span>
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          required={required}
          value={formatMxPhone(value)}
          onChange={(e) => onChange(soloDigitosMx(e.target.value))}
          placeholder="123 123 1234"
          autoComplete="tel-national"
          /* Sin maxLength: recortaba lo pegado a la mitad ("+52 55 1092 " → 8
             dígitos) antes de poder limpiarlo. El tope real lo pone
             soloDigitosMx. */
          className="h-full min-w-0 flex-1 rounded-r-[12px] bg-transparent px-3.5 text-[15px] text-ink-title outline-none placeholder:text-ink-placeholder"
        />
      </div>
      {hint && <span className="text-xs text-ink-tertiary">{hint}</span>}
    </div>
  );
}
