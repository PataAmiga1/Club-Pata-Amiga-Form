"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolvePet } from "@/app/admin/actions";
import { PET_REJECTION_REASONS } from "@/lib/constants";

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
      <div className="flex w-full flex-col gap-2 sm:w-auto">
        <div className="flex w-full gap-2 sm:w-auto">
          <input
            autoFocus
            placeholder="Observaciones para el miembro"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-full border-[1.5px] border-border-input px-4 text-[13px] text-ink-title outline-none focus:border-teal sm:w-80"
          />
          <button
            type="button"
            disabled={pending || notes.trim().length === 0}
            onClick={() => run({ approve: false, notes: notes.trim() })}
            className="grid h-10 flex-none place-items-center rounded-full bg-error-text px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            Denegar
          </button>
        </div>
        {/* Los motivos PRELLENAN el campo y se pueden editar — a diferencia de
            los del reintegro, que son la resolución misma y no se tocan. Lo
            que el miembro recibe es este texto tal cual, así que tiene que
            poder decir CUÁL foto o CUÁL dato hay que corregir. */}
        <div className="flex flex-wrap gap-1.5">
          {PET_REJECTION_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setNotes(r)}
              className={`rounded-full border px-2.5 py-[5px] text-left text-[11px] font-semibold transition-colors ${
                notes === r
                  ? "border-error-text bg-error-bg text-error-text"
                  : "border-border-input text-ink-secondary hover:border-error-text"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
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
        Denegar…
      </button>
    </div>
  );
}
