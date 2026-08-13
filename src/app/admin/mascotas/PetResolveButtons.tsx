"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolvePet } from "@/app/admin/actions";

/**
 * Aprobar / Denegar con notas. Vive suelto para poder usarse tanto en la fila
 * de la lista como dentro del perfil (popup) — petición del equipo: resolver
 * sin salir del popup.
 */
export function PetResolveButtons({ petId }: { petId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState("");

  function run(decision: Parameters<typeof resolvePet>[1]) {
    startTransition(async () => {
      await resolvePet(petId, decision);
      router.refresh();
    });
  }

  if (rejecting) {
    return (
      <div className="flex w-full gap-2 sm:w-auto">
        <input
          autoFocus
          placeholder="Observaciones para el miembro"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-full border-[1.5px] border-border-input px-4 text-[13px] text-ink-title outline-none focus:border-teal sm:w-64"
        />
        <button
          type="button"
          disabled={pending || notes.trim().length === 0}
          onClick={() => run({ approve: false, notes: notes.trim() })}
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
