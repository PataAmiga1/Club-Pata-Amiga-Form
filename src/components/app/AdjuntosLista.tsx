import type { AdjuntoFirmado } from "@/lib/documentos-conversacion";

/**
 * Los adjuntos de un mensaje, ya firmados por quien pintó el hilo. Se usa en
 * las cuatro pantallas (los dos hilos, de los dos lados) para que un adjunto
 * se vea igual lo mande quien lo mande.
 *
 * Un adjunto sin liga se pinta en gris y sin enlace: si Storage no pudo firmar,
 * es mejor que el hilo diga "aquí hubo un archivo" a que desaparezca.
 */
export function AdjuntosLista({ adjuntos }: { adjuntos: AdjuntoFirmado[] }) {
  if (!adjuntos.length) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {adjuntos.map((a) =>
        a.url ? (
          <li key={a.path}>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-[220px] items-center gap-1.5 rounded-full border-[1.5px] border-border-input bg-white px-2.5 py-1 text-[11.5px] font-semibold text-teal-deep transition-colors hover:border-teal"
            >
              <span aria-hidden>
                {a.type === "application/pdf" ? "📄" : "🖼️"}
              </span>
              <span className="truncate">{a.name}</span>
            </a>
          </li>
        ) : (
          <li
            key={a.path}
            className="flex max-w-[220px] items-center gap-1.5 rounded-full border-[1.5px] border-border-input px-2.5 py-1 text-[11.5px] font-semibold text-ink-tertiary"
            title="No pudimos abrir este archivo"
          >
            <span aria-hidden>📎</span>
            <span className="truncate">{a.name}</span>
          </li>
        ),
      )}
    </ul>
  );
}
