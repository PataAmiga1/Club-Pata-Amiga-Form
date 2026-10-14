"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarLoteComoPagado } from "@/app/admin/reintegros/pagos-actions";
import { formatMxn } from "@/lib/format";

export type FilaDelLayout = {
  id: string;
  folio: string;
  miembro: string;
  monto: number;
  sinClabe: boolean;
};

/**
 * «Marcar lote como pagado» (13-oct-2026). Enseña EXACTAMENTE lo que trae hoy
 * el layout bancario del mes, todo seleccionado. Se desmarca lo que el banco
 * rechazó (o lo que no se subió) y se registra el resto con una sola fecha y
 * referencia. El servidor vuelve a comprobar que cada id siga en el layout.
 */
export function LotePagadoPanel({ filas, hoy }: { filas: FilaDelLayout[]; hoy: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [elegidos, setElegidos] = useState<Set<string>>(
    () => new Set(filas.filter((f) => !f.sinClabe).map((f) => f.id)),
  );
  const [fecha, setFecha] = useState(hoy);
  const [ref, setRef] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const total = filas.filter((f) => elegidos.has(f.id)).reduce((a, f) => a + f.monto, 0);
  const alternar = (id: string) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  return (
    <details className="group rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink-title">
          ✓ Marcar lote como pagado{" "}
          <span className="font-normal text-ink-tertiary">
            · {filas.length} en el layout bancario del mes
          </span>
        </span>
        <span className="text-xs font-bold text-teal-deep group-open:hidden">Abrir</span>
      </summary>
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-secondary">
          Son los mismos reintegros del CSV. Desmarca los que el banco no dispersó. Al
          guardar, cada miembro recibe su aviso de depósito y salen del layout.
        </p>
        <div className="flex flex-col">
          {filas.map((f) => (
            <label
              key={f.id}
              className="flex items-center gap-3 border-b border-[#F2EEE4] py-2 text-[12.5px] text-ink-body last:border-0"
            >
              <input
                type="checkbox"
                checked={elegidos.has(f.id)}
                onChange={() => alternar(f.id)}
                className="size-4 accent-teal"
              />
              <span className="w-[64px] font-bold text-teal-deep">{f.folio}</span>
              <span className="min-w-0 flex-1 truncate">
                {f.miembro}
                {f.sinClabe && <span className="ml-1 font-bold text-error-text">· sin CLABE</span>}
              </span>
              <span className="font-bold">{formatMxn(f.monto)}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-ink-title">Fecha del depósito</span>
            <input
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => setFecha(e.target.value)}
              className="h-11 rounded-[12px] border-[1.5px] border-border-input px-3.5 text-sm text-ink-title outline-none focus:border-teal"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-ink-title">
              Referencia del lote <span className="font-normal text-ink-tertiary">(opcional)</span>
            </span>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              maxLength={60}
              placeholder="Clave o folio de la dispersión"
              className="h-11 rounded-[12px] border-[1.5px] border-border-input px-3.5 text-sm text-ink-title outline-none focus:border-teal"
            />
          </label>
        </div>
        {aviso && (
          <span className={`text-[12.5px] font-bold ${aviso.ok ? "text-success-text" : "text-error-text"}`}>
            {aviso.texto}
          </span>
        )}
        <button
          type="button"
          disabled={pendiente || elegidos.size === 0 || !fecha}
          onClick={() => {
            if (!window.confirm(`¿Marcar ${elegidos.size} reintegro(s) como pagados por ${formatMxn(total)} MXN?`))
              return;
            startTransition(async () => {
              setAviso(null);
              try {
                const r = await marcarLoteComoPagado([...elegidos], { fecha, referencia: ref });
                if ("error" in r && r.error) setAviso({ ok: false, texto: r.error });
                else if ("pagados" in r) {
                  setAviso({
                    ok: true,
                    texto: `Listo: ${r.pagados} marcado(s) como pagado(s)${r.ignorados ? ` · ${r.ignorados} ya no estaban en el layout` : ""}.`,
                  });
                  router.refresh();
                }
              } catch {
                setAviso({ ok: false, texto: "No se pudo registrar el lote. Intenta de nuevo." });
              }
            });
          }}
          className="grid h-11 place-items-center self-start rounded-full bg-teal px-6 text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
        >
          {pendiente
            ? "Registrando…"
            : `Marcar ${elegidos.size} como pagado(s) · ${formatMxn(total)}`}
        </button>
      </div>
    </details>
  );
}
