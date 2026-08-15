"use client";

import { useRef, useState } from "react";

/**
 * Carga de una foto de documento (INE, pasaporte…) que viaja al servidor
 * dentro del formulario, no por Storage.
 *
 * POR QUÉ NO SUBE DIRECTO A STORAGE: el registro de embajador es público. Los
 * documentos se piden ANTES de que exista la cuenta, y las políticas del bucket
 * `ine-documents` exigen sesión y que la primera carpeta sea el id del usuario.
 * Así que la foto se manda con el resto del formulario y la sube el servidor
 * cuando ya creó la cuenta y sabe a qué carpeta va.
 *
 * POR QUÉ SE COMPRIME: una foto de INE recién tomada con el teléfono pesa 3-5
 * MB, y el cuerpo de una Server Action de Next tiene tope. Se reescala a 1400 px
 * y se guarda en JPEG, que deja el archivo en 150-350 KB — de sobra para que el
 * comité lea una credencial, y sin arriesgar el envío.
 *
 * TAMBIÉN ACEPTA PDF (equipo, 15-ago): mucha gente tiene su identificación
 * escaneada en PDF y antes solo cabían imágenes. Un PDF NO pasa por el
 * compresor —el canvas solo sabe de imágenes— así que viaja tal cual y lo
 * único que se revisa es que no pase del tope. Tampoco tiene vista previa:
 * en su lugar se muestra el nombre del archivo.
 */

const LADO_MAX = 1400;
const CALIDAD = 0.78;
/** Tope para un PDF sin comprimir. Por encima de esto no cabe en el envío. */
const PDF_MAX_MB = 4;

const esPdf = (dataUrl: string) => dataUrl.startsWith("data:application/pdf");

/** Lee un archivo tal cual, sin tocarlo. Devuelve su data URL. */
function leerTalCual(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("no se pudo leer"));
    lector.readAsDataURL(file);
  });
}

/** Reescala y recomprime en el navegador. Devuelve un data URL JPEG. */
async function comprimir(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close?.();
  return lienzo.toDataURL("image/jpeg", CALIDAD);
}

export function FotoDocumento({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  /** Data URL del documento (JPEG ya comprimido, o PDF tal cual). "" si no hay. */
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // El input se limpia siempre: si no, elegir DOS VECES la misma foto no
    // dispara el evento y parece que la pantalla se quedó pasmada.
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      if (file.type === "application/pdf") {
        if (file.size > PDF_MAX_MB * 1024 * 1024) {
          setError(
            `Ese PDF pesa demasiado (máximo ${PDF_MAX_MB} MB). Prueba con una foto de tu identificación.`,
          );
          return;
        }
        setNombre(file.name);
        onChange(await leerTalCual(file));
      } else {
        setNombre(null);
        onChange(await comprimir(file));
      }
    } catch {
      setError("No pudimos leer ese archivo. Intenta con otro.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink-title">{label}</span>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className={
          value
            ? "relative flex h-[124px] items-center justify-center overflow-hidden rounded-[14px] border-[1.5px] border-[#D4EDD4] bg-[#F4FAF4]"
            : "flex h-[124px] flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed border-[#C9E9E4] bg-[#F2FAF9] transition-colors hover:border-teal"
        }
      >
        <input
          ref={ref}
          type="file"
          /* Sin `capture`: forzaba la cámara y dejaba fuera al que ya tiene su
             identificación escaneada en el teléfono o en PDF (equipo, 15-ago).
             Sin el atributo, el celular ofrece cámara Y archivos. */
          accept="image/*,application/pdf"
          className="hidden"
          onChange={elegir}
        />
        {busy ? (
          <span className="text-[13px] font-semibold text-teal-deep">
            Preparando el archivo…
          </span>
        ) : value && esPdf(value) ? (
          <span className="flex flex-col items-center gap-1 px-3">
            <span className="text-xl" aria-hidden>
              📄
            </span>
            <span className="max-w-full truncate text-[12.5px] font-semibold text-success-text">
              {nombre ?? "Documento PDF"}
            </span>
            <span className="text-[11.5px] text-ink-tertiary">
              ✓ Listo — toca para cambiarlo
            </span>
          </span>
        ) : value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className="absolute inset-0 size-full object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-[11.5px] font-bold text-white">
              ✓ Listo — toca para cambiarla
            </span>
          </>
        ) : (
          <>
            <span className="text-xl" aria-hidden>
              🪪
            </span>
            <span className="text-[13px] font-semibold text-teal-deep">
              Tomar foto o subir archivo
            </span>
            <span className="text-[11px] text-ink-tertiary">JPG, PNG o PDF</span>
          </>
        )}
      </button>
      {error ? (
        <span className="text-xs font-semibold text-error-text">{error}</span>
      ) : (
        hint && <span className="text-xs text-ink-tertiary">{hint}</span>
      )}
    </div>
  );
}
