"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Popup para miembros (sobre todo los migrados de la plataforma anterior)
 * con el perfil incompleto: al primer login los guía a llenar lo que falta
 * (decisión de Pablo, 5-ago). Una sola vez por usuario (localStorage);
 * el recordatorio permanente sigue siendo la tarjeta "Completa tu perfil".
 */
export function CompleteProfileNudge({
  userId,
  missing,
}: {
  userId: string;
  missing: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const storageKey = `pa_perfil_nudge_${userId}`;

  useEffect(() => {
    if (!window.localStorage.getItem(storageKey)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe tras montar
      setOpen(true);
    }
  }, [storageKey]);

  if (!open) return null;

  const dismiss = () => {
    window.localStorage.setItem(storageKey, new Date().toISOString());
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-teal-dark/40 p-5 backdrop-blur-[2px]"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Completa tu perfil"
    >
      <div
        className="flex w-full max-w-[440px] flex-col items-center gap-4 rounded-[24px] bg-white p-8 text-center shadow-[0_24px_60px_rgba(30,83,80,.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[52px]" aria-hidden>
          📝
        </span>
        <h2 className="font-display text-[24px] leading-tight text-ink-title">
          ¡Nos falta conocerte un poco más!
        </h2>
        <p className="text-sm leading-relaxed text-ink-secondary">
          Para habilitar tus reintegros necesitamos que completes tu perfil.
          {missing.length > 0 && (
            <>
              {" "}
              Nos falta: <strong>{missing.join(" · ")}</strong>.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(storageKey, new Date().toISOString());
            router.push("/app/perfil");
          }}
          className="grid h-12 w-full place-items-center rounded-full bg-teal text-[15px] font-bold text-white transition-colors hover:bg-teal-deep"
        >
          Completar mi perfil →
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="text-[13px] font-semibold text-ink-tertiary transition-colors hover:text-ink-secondary"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
