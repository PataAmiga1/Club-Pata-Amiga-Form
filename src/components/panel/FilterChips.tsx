import Link from "next/link";

/**
 * Filtros por estado para las listas grandes del panel (nota del cliente
 * 16-jul): chips que filtran vía querystring, sin JS de cliente.
 */
export function FilterChips({
  basePath,
  current,
  options,
  allLabel = "Todas",
  param = "estado",
  keep = {},
}: {
  basePath: string;
  current?: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  /** Nombre del parámetro de querystring que controla este grupo de chips. */
  param?: string;
  /** Otros parámetros activos que estos chips no deben pisar. */
  keep?: Record<string, string | undefined>;
}) {
  const chip = (active: boolean) =>
    active
      ? "rounded-full bg-teal px-4 py-[7px] text-xs font-bold text-white"
      : "rounded-full border-[1.5px] border-border-input bg-white px-4 py-[7px] text-xs font-semibold text-ink-secondary transition-colors hover:border-teal";
  const url = (value?: string) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) qs.set(k, v);
    if (value) qs.set(param, value);
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={url()} className={chip(!current)}>
        {allLabel}
      </Link>
      {options.map((o) => (
        <Link
          key={o.value}
          href={url(o.value)}
          className={chip(current === o.value)}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
