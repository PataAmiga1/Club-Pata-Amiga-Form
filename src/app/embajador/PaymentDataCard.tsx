"use client";

import { useState } from "react";
import { BANK_OPTIONS, BANCO_OTRO, bankFromClabe } from "@/lib/banks";
import { savePaymentData } from "./actions";

/**
 * Datos de pago del embajador (banco + CLABE + RFC), al estilo del paso
 * bancario del sistema anterior. Necesarios para recibir el corte mensual
 * por SPEI.
 *
 * DOS CAMBIOS DEL 13-AGO (equipo):
 *  - "Otro" en la lista de bancos abre un campo para ESCRIBIR el banco. Antes
 *    se guardaba literalmente la palabra "Otro" y el corte salía sin saber a
 *    qué institución iba.
 *  - El RFC se pide AQUÍ, junto con lo bancario, porque es parte de lo mismo
 *    (el comprobante de la comisión). Vivía en una tarjeta aparte revuelto con
 *    las redes sociales.
 */
export function PaymentDataCard({
  initialBank,
  initialClabe,
  initialHolder,
  initialRfc,
}: {
  initialBank: string | null;
  initialClabe: string | null;
  initialHolder: string | null;
  initialRfc: string | null;
}) {
  const [editing, setEditing] = useState(!initialClabe);
  const [clabe, setClabe] = useState(initialClabe ?? "");
  const [holder, setHolder] = useState(initialHolder ?? "");
  const [rfc, setRfc] = useState(initialRfc ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const detected = clabe.length >= 3 ? bankFromClabe(clabe) : null;

  // El banco guardado puede ser uno del catálogo o uno escrito a mano. Si no
  // está en la lista, el selector arranca en "Otro" con el nombre ya puesto.
  const guardadoEsDeCatalogo =
    !initialBank || BANK_OPTIONS.includes(initialBank as never);
  const [bank, setBank] = useState(
    guardadoEsDeCatalogo ? (initialBank ?? "") : BANCO_OTRO,
  );
  const [bankOtro, setBankOtro] = useState(
    guardadoEsDeCatalogo ? "" : (initialBank ?? ""),
  );

  const eligioOtro = bank === BANCO_OTRO;
  /** Lo que realmente se guarda como nombre del banco. */
  const bancoFinal = eligioOtro ? bankOtro.trim() : bank;
  const nombreVisible = guardadoEsDeCatalogo
    ? (initialBank ?? bancoFinal)
    : initialBank;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await savePaymentData(bancoFinal, clabe, holder, rfc);
      if (result.error) setError(result.error);
      else {
        if (result.bankName) {
          if (BANK_OPTIONS.includes(result.bankName as never)) {
            setBank(result.bankName);
            setBankOtro("");
          } else {
            setBank(BANCO_OTRO);
            setBankOtro(result.bankName);
          }
        }
        setEditing(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg text-ink-title">
          Datos de pago
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[12px] font-bold text-teal-deep hover:underline"
          >
            Editar
          </button>
        )}
      </div>

      {!editing ? (
        <div className="flex flex-col gap-1 text-[13px] text-ink-body">
          <span>
            <strong className="text-ink-title">{nombreVisible || "Banco"}</strong>{" "}
            · CLABE ····{clabe.slice(-4)}
          </span>
          {holder && <span>Titular: {holder}</span>}
          {rfc && <span>RFC: {rfc}</span>}
          <span className="text-xs text-success-text">
            ✓ Lista para recibir tu corte mensual por SPEI
          </span>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="text-[12.5px] leading-relaxed text-ink-secondary">
            Tus comisiones se pagan por transferencia (SPEI) el día 5.
            Necesitamos tu CLABE de 18 dígitos y tu RFC para el comprobante.
          </p>
          <input
            value={clabe}
            onChange={(e) =>
              setClabe(e.target.value.replace(/\D/g, "").slice(0, 18))
            }
            placeholder="CLABE interbancaria (18 dígitos)"
            inputMode="numeric"
            className="h-11 rounded-[12px] border-[1.5px] border-border-input px-3.5 text-sm tracking-wider text-ink-title outline-none focus:border-teal"
          />
          {detected && (
            <span className="text-xs font-semibold text-info-text">
              Banco detectado: {detected}
            </span>
          )}
          <input
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            placeholder="Nombre del titular de la cuenta"
            className="h-11 rounded-[12px] border-[1.5px] border-border-input px-3.5 text-sm text-ink-title outline-none focus:border-teal"
          />
          <select
            value={bank || detected || ""}
            onChange={(e) => setBank(e.target.value)}
            className="h-11 appearance-none rounded-[12px] border-[1.5px] border-border-input bg-white px-3.5 text-sm text-ink-title outline-none focus:border-teal"
          >
            <option value="">Selecciona tu banco</option>
            {BANK_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            {detected && !BANK_OPTIONS.includes(detected as never) && (
              <option value={detected}>{detected}</option>
            )}
          </select>
          {eligioOtro && (
            <input
              value={bankOtro}
              onChange={(e) => setBankOtro(e.target.value)}
              placeholder="¿Cuál es tu banco?"
              autoFocus
              className="h-11 rounded-[12px] border-[1.5px] border-border-input px-3.5 text-sm text-ink-title outline-none focus:border-teal"
            />
          )}
          <input
            value={rfc}
            onChange={(e) => setRfc(e.target.value.toUpperCase())}
            placeholder="RFC (para tus comprobantes de comisión)"
            maxLength={13}
            className="h-11 rounded-[12px] border-[1.5px] border-border-input px-3.5 text-sm tracking-wide text-ink-title outline-none focus:border-teal"
          />
          {error && (
            <span className="text-xs font-semibold text-error-text">
              {error}
            </span>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              clabe.length !== 18 ||
              !holder.trim() ||
              (eligioOtro && !bankOtro.trim())
            }
            className="grid h-10 place-items-center rounded-full bg-teal text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
          >
            {busy ? "Guardando…" : "Guardar datos de pago"}
          </button>
        </form>
      )}
    </div>
  );
}
