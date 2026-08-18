"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveAmbassadorExtras,
  requestAmbassadorDeactivation,
} from "./actions";

const REDES = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/tuperfil" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/tuperfil" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@tuperfil" },
] as const;

/**
 * Redes sociales del embajador, línea por red (equipo, 5-ago).
 *
 * El RFC salió de aquí el 13-ago: se pide junto con los datos bancarios, que
 * es donde tiene sentido (ampara el comprobante de la comisión). Esta tarjeta
 * quedó dedicada a las redes, que son otra categoría.
 */
export function ExtrasCard({
  initialLinks,
}: {
  initialLinks: Record<string, string> | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [links, setLinks] = useState<Record<string, string>>({
    instagram: initialLinks?.instagram ?? "",
    facebook: initialLinks?.facebook ?? "",
    tiktok: initialLinks?.tiktok ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
      <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
        REDES SOCIALES
      </span>
      {REDES.map((r) => (
        <label
          key={r.key}
          className="flex flex-col gap-1 text-[12px] font-bold text-ink-secondary"
        >
          {r.label}
          <input
            value={links[r.key]}
            onChange={(e) => {
              setLinks({ ...links, [r.key]: e.target.value });
              setMsg(null);
            }}
            placeholder={r.placeholder}
            className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] font-normal text-ink-title outline-none focus:border-teal"
          />
        </label>
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await saveAmbassadorExtras(links);
            setMsg("error" in res && res.error ? res.error : "Guardado ✓");
            router.refresh();
          })
        }
        className="self-start rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
      {msg && (
        <span
          className={`text-xs font-semibold ${msg.includes("✓") ? "text-success-text" : "text-error-text"}`}
        >
          {msg}
        </span>
      )}
    </div>
  );
}

/** Baja voluntaria como embajador (equipo, 5-ago). */
export function BajaEmbajadorCard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] border-[1.5px] border-[#F2C7D4] bg-white p-5">
      <span className="text-[11px] font-extrabold tracking-[.06em] text-error-text">
        DARME DE BAJA COMO EMBAJADOR
      </span>
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* La promesa dice exactamente lo que el sistema paga (Pablo,
              16-ago): cuenta la membresía cobrada HASTA el día de la baja. Un
              pago que cae después no se abona — la operación no puede
              garantizar que esa membresía llegue a cobrarse. */}
          <p className="text-[12.5px] leading-normal text-ink-secondary">
            Tu código dejaría de generar comisiones nuevas. Se te pagan en el
            siguiente corte las membresías que se hayan cobrado hasta el día de
            tu baja; las que se cobren después ya no generan comisión.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-none rounded-full border-[1.5px] border-[#F2C7D4] px-4 py-2 text-[12.5px] font-bold text-error-text transition-colors hover:bg-error-bg"
          >
            Darme de baja…
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Cuéntanos el motivo…"
            className="rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-body outline-none focus:border-teal"
          />
          {error && (
            <span className="text-xs font-semibold text-error-text">{error}</span>
          )}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-bold text-ink-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending || reason.trim().length < 5}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await requestAmbassadorDeactivation(
                    reason.trim(),
                  );
                  if ("error" in res && res.error) setError(res.error);
                  else router.refresh();
                })
              }
              className="rounded-full bg-error-text px-4 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Procesando…" : "Confirmar baja"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
