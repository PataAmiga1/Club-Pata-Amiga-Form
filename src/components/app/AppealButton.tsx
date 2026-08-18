"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitAppeal } from "@/app/app/apelaciones/actions";

/**
 * Botón "Apelar decisión" con formulario inline para reintegros rechazados,
 * perfiles de mascota denegados y centros rechazados. Una segunda revisión
 * del comité.
 *
 * CON ADJUNTOS DESDE EL 15-AGO. El equipo lo pidió con el caso que lo vuelve
 * evidente: si al comité no le convenció la foto del peludo, antes no había
 * forma de mandar otra. Se podía explicar por escrito, pero no demostrarlo, y
 * el comité volvía a resolver con exactamente lo mismo que ya había rechazado.
 *
 * Los archivos suben DIRECTO a Storage desde el navegador —aquí sí hay sesión,
 * a diferencia del alta de embajador— y a la acción solo viajan las rutas. Así
 * no pasan por el cuerpo de la Server Action y no hay tope que estorbe.
 */

const MAX_ARCHIVOS = 5;
const MAX_MB = 10;

type Adjunto = { path: string; name: string; type: string };

export function AppealButton({
  reimbursementId,
  petId,
  centerId,
  subjectLabel,
}: {
  reimbursementId?: string;
  petId?: string;
  centerId?: string;
  subjectLabel: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [folio, setFolio] = useState<string | null>(null);

  async function agregarArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!elegidos.length) return;
    setError(null);

    if (adjuntos.length + elegidos.length > MAX_ARCHIVOS) {
      setError(`Puedes adjuntar hasta ${MAX_ARCHIVOS} archivos.`);
      return;
    }
    const pesado = elegidos.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (pesado) {
      setError(`"${pesado.name}" pesa más de ${MAX_MB} MB.`);
      return;
    }

    setSubiendo(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Inicia sesión de nuevo.");
        return;
      }
      const nuevos: Adjunto[] = [];
      for (const file of elegidos) {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("appeal-documents")
          .upload(path, file);
        if (upErr) {
          setError(`No pudimos subir "${file.name}". Intenta de nuevo.`);
          return;
        }
        nuevos.push({ path, name: file.name, type: file.type });
      }
      setAdjuntos((prev) => [...prev, ...nuevos]);
    } finally {
      setSubiendo(false);
    }
  }

  if (folio) {
    return (
      <span className="rounded-full bg-info-bg px-3 py-1 text-[11px] font-extrabold tracking-[.04em] text-info-text">
        APELACIÓN {folio} EN REVISIÓN
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-full border-[1.5px] border-teal px-4 py-1.5 text-[12px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
      >
        ⚖️ Apelar decisión
      </button>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-2 rounded-[14px] bg-cream p-3.5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          const result = await submitAppeal({
            reimbursementId,
            petId,
            centerId,
            message,
            documents: adjuntos,
          });
          if (result.error) setError(result.error);
          else {
            setFolio(result.folio ?? "");
            router.refresh();
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="text-[12.5px] font-semibold text-ink-title">
        Apelar {subjectLabel} — el comité hará una segunda revisión
      </span>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder="Cuéntanos tu caso: qué información adicional debería considerar el comité (mínimo 10 caracteres)…"
        className="rounded-[10px] border-[1.5px] border-border-input bg-white p-3 text-[13px] text-ink-body outline-none focus:border-teal"
      />

      <div className="flex flex-col gap-1.5">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.pdf"
          className="hidden"
          onChange={agregarArchivos}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={subiendo || adjuntos.length >= MAX_ARCHIVOS}
          className="self-start rounded-full border-[1.5px] border-border-input bg-white px-3.5 py-1.5 text-[12px] font-bold text-teal-deep transition-colors hover:border-teal disabled:opacity-50"
        >
          {subiendo ? "Subiendo…" : "📎 Adjuntar fotos o documentos"}
        </button>
        <span className="text-[11px] text-ink-tertiary">
          Opcional. Si el comité no quedó conforme con una foto, aquí puedes
          mandar otra. JPG, PNG o PDF · hasta {MAX_ARCHIVOS} archivos.
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
                    setAdjuntos((prev) => prev.filter((x) => x.path !== a.path))
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

      {error && (
        <span className="text-xs font-semibold text-error-text">{error}</span>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || subiendo || message.trim().length < 10}
          className="grid h-9 place-items-center rounded-full bg-teal px-4 text-xs font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
        >
          {busy ? "Enviando…" : "Enviar apelación"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-ink-secondary hover:text-ink-title"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
