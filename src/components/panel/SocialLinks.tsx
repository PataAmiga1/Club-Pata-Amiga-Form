/**
 * Redes sociales en los popups del panel, una línea por red para que el
 * comité vea de un vistazo cuál falta (equipo, 5-ago). Embajadores y centros
 * guardan las mismas tres llaves en su columna `social_links`.
 */
const REDES = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
] as const;

export function SocialLinks({ links }: { links: Record<string, string> | null }) {
  return (
    <div className="flex flex-col gap-1">
      {REDES.map((r) => {
        const url = links?.[r.key];
        return (
          <span key={r.key} className="text-[13px] text-ink-body">
            {r.label}:{" "}
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-teal-deep hover:underline"
              >
                {url.replace(/^https?:\/\/(www\.)?/, "")} ↗
              </a>
            ) : (
              <span className="text-ink-tertiary">— sin registrar</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
