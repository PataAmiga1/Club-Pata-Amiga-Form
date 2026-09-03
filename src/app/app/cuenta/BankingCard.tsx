"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BANCO_OTRO, BANK_OPTIONS, bankFromClabe } from "@/lib/banks";
import { SelectField, TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import {
  CUENTAS_MAX,
  etiquetaDeCuenta,
  type CuentaBancaria,
} from "@/lib/cuentas-bancarias";
import {
  agregarCuentaBancaria,
  borrarCuentaBancaria,
  marcarCuentaPorOmision,
} from "./actions";

/**
 * LAS CUENTAS DEL MIEMBRO PARA SUS REINTEGROS — hasta tres (equipo, 2-sep).
 *
 * Antes era UNA sola y el formulario era "captura tu CLABE y guarda". El
 * equipo lo pidió como "algo parecido a guardar tarjetas": varias guardadas, y
 * el miembro elige a cuál se le deposita.
 *
 * QUIEN TENGA UNA SOLA NO DEBE NOTAR EL CAMBIO: con una cuenta no se pinta ni
 * la marca de "por omisión" ni el botón para cambiarla — no hay entre qué
 * elegir— y lo único que aparece de más es el botón de agregar otra.
 *
 * NO SE MUESTRA LA CLABE COMPLETA, solo los últimos cuatro dígitos. Una cuenta
 * ya guardada no hace falta volver a leerla entera, y sí hace falta poder
 * distinguirla de la otra.
 */
export function BankingCard({ cuentas }: { cuentas: CuentaBancaria[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [agregando, setAgregando] = useState(cuentas.length === 0);
  const [bank, setBank] = useState("");
  const [bankOtro, setBankOtro] = useState("");
  const [clabe, setClabe] = useState("");
  const [holder, setHolder] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligioOtro = bank === BANCO_OTRO;
  const lleno = cuentas.length >= CUENTAS_MAX;
  const unaSola = cuentas.length === 1;

  function limpiar() {
    setClabe("");
    setBank("");
    setBankOtro("");
    setHolder("");
  }

  // Las tres acciones devuelven `{error}` o `{ok:true, …}`, así que se lee el
  // error con `in` en vez de tipar una forma que no todas cumplen.
  type Resultado = { error: string } | { ok: true };
  function correr(accion: () => Promise<Resultado>, exito: string) {
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const r = await accion();
      if ("error" in r) setError(r.error);
      else {
        setNotice(exito);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
      <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
        TUS CUENTAS PARA REINTEGROS
      </span>
      <p className="-mt-1 text-[13px] leading-normal text-ink-secondary">
        {cuentas.length > 1
          ? `Tus reintegros se transfieren por SPEI. Al pedir uno eliges a cuál de tus cuentas quieres que llegue; la marcada aquí es la que te proponemos.`
          : `Tus reintegros se transfieren por SPEI a esta cuenta. Puedes guardar hasta ${CUENTAS_MAX} y elegir a cuál va cada uno.`}
      </p>

      {cuentas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {cuentas.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] border-[1.5px] border-border-input px-4 py-3"
            >
              <span className="text-[13.5px] font-bold text-ink-title">
                {etiquetaDeCuenta(c)}
              </span>
              {c.holder && (
                <span className="text-[12px] text-ink-tertiary">
                  {c.holder}
                </span>
              )}
              {!unaSola && c.is_default && (
                <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-extrabold text-success-text">
                  POR OMISIÓN
                </span>
              )}
              <span className="ml-auto flex items-center gap-3">
                {!unaSola && !c.is_default && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      correr(
                        () => marcarCuentaPorOmision(c.id),
                        "Listo, esa es la que te proponemos ✓",
                      )
                    }
                    className="text-[12px] font-bold text-teal-deep hover:underline disabled:opacity-50"
                  >
                    Usar por omisión
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    correr(() => borrarCuentaBancaria(c.id), "Cuenta borrada ✓")
                  }
                  className="text-[12px] font-bold text-error-text hover:underline disabled:opacity-50"
                >
                  Borrar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
          {error}
        </div>
      )}
      {notice && (
        <span className="text-sm font-semibold text-success-text">{notice}</span>
      )}

      {agregando ? (
        <form
          className="flex flex-col gap-3.5 border-t border-border-divider pt-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            correr(async () => {
              const r = await agregarCuentaBancaria({
                clabe,
                bankName: eligioOtro ? bankOtro.trim() : bank,
                holder,
              });
              if (!("error" in r)) {
                limpiar();
                setAgregando(false);
              }
              return r;
            }, "Cuenta guardada ✓");
          }}
        >
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <TextField
              label="CLABE (18 dígitos)"
              inputMode="numeric"
              placeholder="000 000 00000000000 0"
              value={clabe}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 18);
                setClabe(digits);
                // El banco se delata solo con los primeros tres dígitos.
                const detected = bankFromClabe(digits);
                if (detected) {
                  setBank(detected);
                  setBankOtro("");
                }
              }}
            />
            <SelectField
              label="Banco"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
            >
              <option value="">Selecciona tu banco</option>
              {BANK_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </SelectField>
          </div>
          {/* "Otro" abre un campo para ESCRIBIRLO (equipo, 13-ago): antes se
              guardaba la palabra "Otro" y el archivo del banco salía sin saber
              a qué institución iba el dinero. */}
          {eligioOtro && (
            <TextField
              label="¿Cuál es tu banco?"
              placeholder="Escribe el nombre de tu banco"
              value={bankOtro}
              onChange={(e) => setBankOtro(e.target.value)}
            />
          )}
          <TextField
            label="Nombre del titular (opcional)"
            placeholder="Como aparece en tu banco"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            hint="Si la cuenta no está a tu nombre, escríbelo aquí para que el banco no rechace la transferencia."
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending} className="self-start">
              {pending ? "Guardando…" : "Guardar cuenta"}
            </Button>
            {cuentas.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  limpiar();
                  setAgregando(false);
                  setError(null);
                }}
                className="text-[13px] font-semibold text-ink-secondary"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : (
        <button
          type="button"
          disabled={lleno}
          onClick={() => {
            setAgregando(true);
            setNotice(null);
          }}
          className="self-start rounded-full border-[1.5px] border-border-input bg-white px-4 py-2 text-[13px] font-bold text-teal-deep transition-colors hover:border-teal disabled:opacity-50"
        >
          {lleno
            ? `Ya guardaste ${CUENTAS_MAX} cuentas`
            : "+ Agregar otra cuenta"}
        </button>
      )}
    </div>
  );
}
