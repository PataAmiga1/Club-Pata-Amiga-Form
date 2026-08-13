"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FotoDocumento } from "@/components/ui/FotoDocumento";
import { saveAmbassadorIne } from "./actions";

/**
 * INE del embajador en su portal (equipo, 13-ago).
 *
 * El registro ya la pide, pero esta tarjeta hace falta igual: los embajadores
 * que se dieron de alta antes de que existiera el campo no tienen ninguna —el
 * panel los marcaba como "falta INE" sin que hubiera forma de subirla— y quien
 * mandó una foto borrosa necesita poder reemplazarla.
 *
 * Cuando ya están las dos, la tarjeta se queda callada: solo confirma y ofrece
 * cambiarlas. No tiene caso gritarle a quien ya cumplió.
 */
export function IneCard({
  tieneFrente,
  tieneReverso,
}: {
  tieneFrente: boolean;
  tieneReverso: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const completa = tieneFrente && tieneReverso;
  const [abierto, setAbierto] = useState(!completa);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const guardar = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await saveAmbassadorIne({
        ineFront: front || undefined,
        ineBack: back || undefined,
      });
      if ("error" in res && res.error) {
        setMsg(res.error);
        return;
      }
      setFront("");
      setBack("");
      setMsg("Guardado ✓");
      // Se cierra siempre: si con esto ya quedaron los dos lados, se ve el
      // resumen; y si todavía falta uno, `completa` sigue en falso y el
      // formulario se vuelve a pintar solo.
      setAbierto(false);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          TU INE
        </span>
        {completa && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="text-[12px] font-bold text-teal-deep hover:underline"
          >
            Cambiar
          </button>
        )}
      </div>

      {completa && !abierto ? (
        <span className="text-[13px] text-success-text">
          ✓ Frente y reverso recibidos — el comité ya puede validar tu
          identidad.
        </span>
      ) : (
        <>
          <p className="text-[12.5px] leading-relaxed text-ink-secondary">
            {completa
              ? "Sube solo el lado que quieras reemplazar; el otro se queda como está."
              : "Necesitamos los dos lados de tu identificación oficial. Solo la ve el comité, para validar tu identidad y pagarte tus comisiones a tu nombre."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FotoDocumento
              label="INE — frente"
              hint={tieneFrente ? "Ya tenemos uno; súbela solo si vas a cambiarlo." : "El lado de tu foto."}
              value={front}
              onChange={setFront}
            />
            <FotoDocumento
              label="INE — reverso"
              hint={tieneReverso ? "Ya tenemos uno; súbela solo si vas a cambiarlo." : "El lado del código de barras."}
              value={back}
              onChange={setBack}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending || (!front && !back)}
              onClick={guardar}
              className="self-start rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar mi INE"}
            </button>
            {completa && (
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="text-[12.5px] font-semibold text-ink-tertiary hover:text-ink-secondary"
              >
                Cancelar
              </button>
            )}
          </div>
        </>
      )}

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
