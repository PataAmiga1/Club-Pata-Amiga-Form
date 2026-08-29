"use client";

import { useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET_CONVERSACION,
  ADJUNTOS_MAX,
  type AdjuntoConversacion,
} from "@/lib/documentos-conversacion";

/**
 * Selector de adjuntos para los hilos con el comité (peludo y reintegro),
 * 19-ago. Lo usan LAS DOS PARTES (decisión 4.2): el miembro desde su hilo y el
 * comité desde el panel.
 *
 * Los archivos suben DIRECTO a Storage desde el navegador —aquí siempre hay
 * sesión— y a la Server Action solo viajan las rutas. Así no pasan por el
 * cuerpo de la acción, que tiene tope de tamaño, y un adjunto de 8 MB no
 * tumba el envío del mensaje.
 *
 * Es el mismo patrón que `AppealButton` estrenó el 15-ago; aquí se sacó a un
 * componente propio porque ahora son cuatro pantallas las que lo necesitan.
 */

const MAX_MB = 10;

export function AdjuntosPicker({
  adjuntos,
  onChange,
  onError,
  disabled,
  subiendo,
  onSubiendo,
  ayuda,
}: {
  adjuntos: AdjuntoConversacion[];
  onChange: (adjuntos: AdjuntoConversacion[]) => void;
  onError: (mensaje: string | null) => void;
  disabled?: boolean;
  subiendo: boolean;
  onSubiendo: (v: boolean) => void;
  /** Una línea de contexto: qué conviene mandar en esta pantalla. */
  ayuda?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function agregar(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!elegidos.length) return;
    onError(null);

    if (adjuntos.length + elegidos.length > ADJUNTOS_MAX) {
      onError(`Puedes adjuntar hasta ${ADJUNTOS_MAX} archivos.`);
      return;
    }
    const pesado = elegidos.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (pesado) {
      onError(`"${pesado.name}" pesa más de ${MAX_MB} MB.`);
      return;
    }

    onSubiendo(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        onError("Inicia sesión de nuevo.");
        return;
      }
      const nuevos: AdjuntoConversacion[] = [];
      for (const file of elegidos) {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage
          .from(BUCKET_CONVERSACION)
          .upload(path, file);
        if (error) {
          onError(`No pudimos subir "${file.name}". Intenta de nuevo.`);
          return;
        }
        nuevos.push({ path, name: file.name, type: file.type });
      }
      onChange([...adjuntos, ...nuevos]);
    } finally {
      onSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.pdf"
        className="hidden"
        onChange={agregar}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled || subiendo || adjuntos.length >= ADJUNTOS_MAX}
        className="self-start rounded-full border-[1.5px] border-border-input bg-white px-3.5 py-1.5 text-[12px] font-bold text-teal-deep transition-colors hover:border-teal disabled:opacity-50"
      >
        {subiendo ? "Subiendo…" : "📎 Adjuntar fotos o documentos"}
      </button>
      <span className="text-[11px] text-ink-tertiary">
        {ayuda ?? "Opcional."} JPG, PNG o PDF · hasta {ADJUNTOS_MAX} archivos.
      </span>
      {adjuntos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {adjuntos.map((a) => (
            <li
              key={a.path}
              className="flex items-center gap-2 text-[12px] text-ink-body"
            >
              <span aria-hidden>
                {a.type === "application/pdf" ? "📄" : "🖼️"}
              </span>
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <button
                type="button"
                onClick={() =>
                  onChange(adjuntos.filter((x) => x.path !== a.path))
                }
                className="flex-none text-[11px] font-bold text-error-text hover:underline"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
