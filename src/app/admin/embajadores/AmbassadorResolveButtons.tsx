"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resolveAmbassador,
  deactivateAmbassador,
} from "@/app/admin/actions";

/**
 * Aprobar / Rechazar con motivo — suelto para usarse en la fila y dentro del
 * popup de la solicitud (petición del equipo, 5-ago).
 */
export function AmbassadorResolveButtons({
  ambassadorId,
}: {
  ambassadorId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function run(decision: Parameters<typeof resolveAmbassador>[1]) {
    startTransition(async () => {
      await resolveAmbassador(ambassadorId, decision);
      router.refresh();
    });
  }

  if (rejecting) {
    return (
      <div className="flex w-full gap-2 sm:w-auto">
        <input
          autoFocus
          placeholder="Motivo para el solicitante"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-full border-[1.5px] border-border-input px-4 text-[13px] text-ink-title outline-none focus:border-teal sm:w-64"
        />
        <button
          type="button"
          disabled={pending || reason.trim().length === 0}
          onClick={() => run({ approve: false, reason: reason.trim() })}
          className="grid h-10 flex-none place-items-center rounded-full bg-error-text px-4 text-[13px] font-bold text-white disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run({ approve: true })}
        className="grid h-10 place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-60"
      >
        ✓ Aprobar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="grid h-10 place-items-center rounded-full border-[1.5px] border-[#F2C7D4] px-5 text-[13px] font-semibold text-error-text transition-colors hover:bg-error-bg"
      >
        Rechazar…
      </button>
    </div>
  );
}

/** Dar de baja a un embajador aprobado — solo super admin (equipo, 5-ago). */
export function AmbassadorDeactivateButton({
  ambassadorId,
  name,
}: {
  ambassadorId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-full border-[1.5px] border-[#F2C7D4] px-4 py-2 text-[12.5px] font-bold text-error-text transition-colors hover:bg-error-bg"
      >
        Dar de baja al embajador…
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-ink-secondary">
        {name} dejará de aparecer como embajador y su código dejará de generar
        comisiones nuevas.
      </p>
      <div className="flex w-full gap-2">
        <input
          autoFocus
          placeholder="Motivo de la baja"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-full border-[1.5px] border-border-input px-4 text-[13px] text-ink-title outline-none focus:border-teal"
        />
        <button
          type="button"
          disabled={pending || reason.trim().length < 5}
          onClick={() =>
            startTransition(async () => {
              await deactivateAmbassador(ambassadorId, reason.trim());
              router.refresh();
            })
          }
          className="grid h-10 flex-none place-items-center rounded-full bg-error-text px-4 text-[13px] font-bold text-white disabled:opacity-50"
        >
          Confirmar baja
        </button>
      </div>
    </div>
  );
}
