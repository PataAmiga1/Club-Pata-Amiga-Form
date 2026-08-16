"use client";

import { useEffect, useRef, useState } from "react";
import {
  CODIGO_MAX,
  CODIGO_MIN,
  normalizarCodigo,
  revisarCodigo,
} from "@/lib/codigo-embajador";
import { customizeCode, revisarDisponibilidadCodigo } from "./actions";

/**
 * Tarjeta teal oscuro del código de embajador (screen 6a), ahora con el
 * elegidor de código que pide el documento de lineamientos (16-ago):
 *
 *  - Se escribe y se CORRIGE SOLO: acentos, minúsculas, espacios y símbolos se
 *    resuelven mientras teclea, en vez de rechazarlo al final.
 *  - Vista previa en vivo de cómo va a quedar el código y el link.
 *  - Mensaje de disponibilidad consultando la base, con sugerencias cuando ya
 *    está tomado (como cuando el usuario de Instagram existe).
 *  - Confirmación antes de guardar: el código es lo que la persona va a
 *    imprimir y repartir, no algo que se cambia a la ligera.
 *
 * El código YA NO lleva el prefijo `PATAMIGA-` (equipo, 16-ago): es lo que la
 * persona escribe, de 3 a 8 caracteres.
 */
export function CodeCard({
  code,
  canCustomize,
}: {
  code: string;
  canCustomize: boolean;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [editing, setEditing] = useState(false);
  const [borrador, setBorrador] = useState("");
  /**
   * Solo lo que hay que preguntarle al servidor. Lo demás —largo, caracteres,
   * palabras bloqueadas— se calcula al pintar: son reglas locales y meterlas
   * aquí obligaría a sincronizar dos fuentes de verdad.
   */
  const [disponibilidad, setDisponibilidad] = useState<
    | { tipo: "revisando" }
    | { tipo: "libre" }
    | { tipo: "ocupado"; error: string; sugerencias: string[] }
    | null
  >(null);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const peticion = useRef(0);

  const copy = async (text: string, what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  const shareLink = () => {
    const url = `${window.location.origin}/registro?codigo=${encodeURIComponent(code)}`;
    if (navigator.share) {
      navigator
        .share({
          title: "Club Pata Amiga",
          text: `Únete a la manada con mi código ${code} 🐾`,
          url,
        })
        .catch(() => {});
    } else {
      copy(url, "link");
    }
  };

  // Reglas locales: se resuelven al pintar, sin esperar al servidor.
  const revisionLocal = borrador ? revisarCodigo(borrador) : null;
  const listoParaConsultar = Boolean(revisionLocal?.ok);

  // Solo si pasó lo local se le pregunta a la base, y con retraso para no
  // disparar una petición por cada tecla.
  useEffect(() => {
    if (!listoParaConsultar) return;
    const mio = ++peticion.current;
    const t = setTimeout(async () => {
      const r = await revisarDisponibilidadCodigo(borrador);
      // Llegó tarde: ya se tecleó algo más y esta respuesta ya no aplica.
      if (mio !== peticion.current) return;
      setDisponibilidad(
        r.disponible
          ? { tipo: "libre" }
          : {
              tipo: "ocupado",
              error: r.error ?? "Ese código no se puede usar.",
              sugerencias: r.sugerencias ?? [],
            },
      );
    }, 450);
    return () => clearTimeout(t);
  }, [borrador, listoParaConsultar]);

  const guardar = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await customizeCode(borrador);
      if (result.error) {
        setError(result.error);
        setConfirmando(false);
      } else {
        setEditing(false);
        setConfirmando(false);
        setBorrador("");
      }
    } finally {
      setBusy(false);
    }
  };

  const puedeGuardar =
    listoParaConsultar && disponibilidad?.tipo === "libre" && !busy;

  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-[20px] bg-teal-dark p-6">
      <div className="blob absolute -bottom-[70px] -right-[60px] size-[220px] bg-white/[.08]" />
      <span className="relative text-[11px] font-extrabold tracking-[.08em] text-lime">
        TU CÓDIGO DE EMBAJADOR
      </span>
      <div className="relative flex flex-wrap items-center gap-3">
        {/* Monoespaciada a propósito (lineamientos, 16-ago): con la tipografía
            de marca el 0 y la O, y el 1 con la I y la L, se confunden — y este
            código la gente lo dicta y lo teclea de memoria. */}
        <span className="font-mono text-[24px] font-bold tracking-[.08em] text-white sm:text-[30px]">
          {code}
        </span>
        <button
          type="button"
          onClick={() => copy(code, "code")}
          className="rounded-full bg-white/15 px-3.5 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-white/25"
        >
          {copied === "code" ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
      <span className="relative text-[12.5px] text-white/75">
        Compártelo en tus redes — cada suscripción con tu código te genera
        comisión.
      </span>

      {editing ? (
        <div className="relative flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={borrador}
              onChange={(e) => {
                setBorrador(normalizarCodigo(e.target.value));
                // La respuesta anterior deja de valer en cuanto cambia el
                // texto: si no se limpia, se vería "disponible" de un código
                // que ya no es el que está escrito.
                setDisponibilidad(null);
                setError(null);
                setConfirmando(false);
              }}
              autoFocus
              placeholder="TUNOMBRE"
              aria-label="Tu código nuevo"
              className="h-11 w-48 rounded-[10px] border-[1.5px] border-white/30 bg-white/10 px-3 font-mono text-[15px] font-bold tracking-[.08em] text-white outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-white/40 focus:border-lime"
            />
            <span className="text-[11.5px] text-white/60">
              {borrador.length}/{CODIGO_MAX}
            </span>
          </div>

          {/* Estado en vivo: primero manda lo local, después la base */}
          {revisionLocal && !revisionLocal.ok && (
            <span className="text-[12.5px] font-semibold text-[#FFB3C4]">
              {revisionLocal.error}
            </span>
          )}
          {listoParaConsultar && !disponibilidad && (
            <span className="text-[12px] text-white/60">Revisando…</span>
          )}
          {listoParaConsultar && disponibilidad?.tipo === "libre" && (
            <span className="text-[12.5px] font-bold text-lime">
              ✓ {borrador} está disponible
            </span>
          )}
          {listoParaConsultar && disponibilidad?.tipo === "ocupado" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-[#FFB3C4]">
                {disponibilidad.error}
              </span>
              {disponibilidad.sugerencias.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] text-white/60">¿Y estos?</span>
                  {disponibilidad.sugerencias.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setBorrador(s);
                        setDisponibilidad(null);
                      }}
                      className="rounded-full bg-white/15 px-3 py-1 font-mono text-[12px] font-bold tracking-wide text-white transition-colors hover:bg-white/25"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Vista previa del link que va a repartir */}
          {revisionLocal?.ok && (
            <span className="break-all text-[11.5px] text-white/50">
              Tu link quedaría: pataamiga.mx/registro?codigo={borrador}
            </span>
          )}

          {confirmando ? (
            <div className="flex flex-col gap-2 rounded-[12px] bg-white/10 p-3">
              <span className="text-[12.5px] leading-relaxed text-white">
                ¿Seguro que quieres <strong className="font-mono">{borrador}</strong>?
                Es el código que vas a repartir; si lo cambias después, los
                materiales que ya hayas compartido con el anterior dejan de
                funcionar.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={guardar}
                  disabled={busy}
                  className="grid h-9 place-items-center rounded-full bg-lime px-4 text-xs font-extrabold text-teal-dark disabled:opacity-50"
                >
                  {busy ? "Guardando…" : "Sí, es mi código"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="text-xs font-semibold text-white/70 hover:text-white"
                >
                  Mejor no
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                disabled={!puedeGuardar}
                className="grid h-10 place-items-center rounded-full bg-lime px-4 text-xs font-extrabold text-teal-dark disabled:opacity-50"
              >
                Usar este código
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setBorrador("");
                  setError(null);
                }}
                className="text-xs font-semibold text-white/70 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          )}

          <span className="text-[11.5px] text-white/60">
            De {CODIGO_MIN} a {CODIGO_MAX} caracteres, solo letras y números.
          </span>
          {error && (
            <span className="text-[12px] font-semibold text-[#FFB3C4]">
              {error}
            </span>
          )}
        </div>
      ) : (
        <div className="relative flex flex-wrap gap-2">
          <button
            type="button"
            onClick={shareLink}
            className="grid h-10 place-items-center rounded-full bg-lime px-[18px] text-xs font-extrabold text-teal-dark transition-opacity hover:opacity-90"
          >
            {copied === "link" ? "¡Link copiado!" : "Compartir link"}
          </button>
          {canCustomize && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="grid h-10 place-items-center rounded-full border-[1.5px] border-white/35 px-[18px] text-xs font-bold text-white transition-colors hover:bg-white/10"
            >
              Personalizar código
            </button>
          )}
        </div>
      )}
    </div>
  );
}
