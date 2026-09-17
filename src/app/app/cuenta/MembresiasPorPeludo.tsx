"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  cambiarIntervaloDePeludo,
  cancelarMembresiaDePeludo,
  reactivarMembresiaDePeludo,
} from "./actions";

/**
 * Mi cuenta · membresía $599 (sección 4). Una fila por peludo: cada uno se
 * cancela, se reactiva o cambia de plan por su cuenta, sin tocar a los demás.
 */

export type MembresiaDePeludo = {
  id: string;
  petId: string;
  petName: string;
  plan: "monthly" | "annual";
  nivel: "principal" | "adicional" | null;
  monto: number;
  estado: string;
  cancelaAlCorte: boolean;
  /** Fecha legible del próximo cobro o del fin de la membresía. */
  corte: string | null;
};

export function MembresiasPorPeludo({ membresias }: { membresias: MembresiaDePeludo[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);

  const correr = (accion: () => Promise<{ ok?: true; error?: string }>, exito: string) =>
    startTransition(async () => {
      setAviso(null);
      const r = await accion();
      if (r.error) setAviso({ texto: r.error, error: true });
      else {
        setAviso({ texto: exito, error: false });
        setConfirmando(null);
        router.refresh();
      }
    });

  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
      <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
        MEMBRESÍAS DE TUS PELUDOS
      </span>
      {aviso && (
        <div
          className={`rounded-[12px] px-4 py-2.5 text-[13px] font-semibold ${aviso.error ? "bg-error-bg text-error-text" : "bg-success-bg text-success-text"}`}
        >
          {aviso.texto}
        </div>
      )}
      <ul className="flex flex-col divide-y divide-border-divider">
        {membresias.map((m) => {
          const enMora = m.estado === "past_due" || m.estado === "unpaid";
          const otro = m.plan === "annual" ? "monthly" : "annual";
          return (
            <li key={m.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-bold text-ink-title">{m.petName}</span>
                <span className="text-[14px] font-bold text-ink-title">
                  ${m.monto.toLocaleString("es-MX")} MXN / {m.plan === "annual" ? "año" : "mes"}
                </span>
              </div>
              <span className="text-[12.5px] text-ink-secondary">
                {m.plan === "annual" ? "Plan anual" : "Plan mensual"}
                {m.nivel === "adicional" ? " · peludo adicional (15% menos)" : ""}
                {enMora
                  ? " · pago pendiente"
                  : m.cancelaAlCorte
                    ? m.corte
                      ? ` · termina el ${m.corte}`
                      : " · cancelada al corte"
                    : m.corte
                      ? ` · próximo cobro el ${m.corte}`
                      : ""}
              </span>
              <div className="flex flex-wrap gap-2">
                {m.cancelaAlCorte ? (
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() =>
                      correr(() => reactivarMembresiaDePeludo(m.id), `La membresía de ${m.petName} sigue activa.`)
                    }
                    className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
                  >
                    Conservar su membresía
                  </button>
                ) : confirmando === m.id ? (
                  <>
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() =>
                        correr(
                          () => cancelarMembresiaDePeludo(m.id, "Cancelada desde Mi cuenta"),
                          `Cancelamos la membresía de ${m.petName} al final de su período.`,
                        )
                      }
                      className="rounded-full bg-error-bg px-4 py-2 text-[12.5px] font-bold text-error-text disabled:opacity-50"
                    >
                      Sí, cancelar al final del período
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(null)}
                      className="rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-bold text-ink-secondary"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <>
                    {!enMora && (
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() =>
                          correr(
                            () => cambiarIntervaloDePeludo(m.id, otro),
                            `${m.petName} cambió al plan ${otro === "annual" ? "anual" : "mensual"}.`,
                          )
                        }
                        className="rounded-full border-[1.5px] border-teal px-4 py-2 text-[12.5px] font-bold text-teal-deep disabled:opacity-50"
                      >
                        Cambiar a {otro === "annual" ? "anual" : "mensual"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmando(m.id)}
                      className="rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-bold text-ink-secondary"
                    >
                      Cancelar…
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Link href="/app/peludos" className="text-[13px] font-semibold text-teal-deep">
        Agregar otro peludo →
      </Link>
    </section>
  );
}
