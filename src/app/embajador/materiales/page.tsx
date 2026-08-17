import { MATERIAL_SLOTS, fetchSiteAssets } from "@/lib/site";
import { getAmbassadorContext } from "../shared";

export const metadata = { title: "Materiales de embajador · Club Pata Amiga" };

/** Materiales para compartir — sección propia, separada de las finanzas. */
export default async function EmbajadorMaterialesPage() {
  await getAmbassadorContext();
  const siteAssets = await fetchSiteAssets();
  const materials = MATERIAL_SLOTS.map((m) => ({
    ...m,
    href: siteAssets[m.slot] ?? null,
  }));

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-5 py-5 sm:px-8">
      <div>
        <h1 className="font-display text-[24px] text-ink-title">
          Materiales para compartir
        </h1>
        <p className="text-[12.5px] text-ink-secondary">
          Descarga el kit del mes y compártelo con tu código en redes.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {materials.map((m) => (
          <div
            key={m.slot}
            className="flex items-center gap-3 rounded-[16px] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(30,83,80,.05)]"
          >
            <span className="text-[22px]" aria-hidden>
              {m.emoji}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13.5px] font-bold text-ink-title">
                {m.label}
              </span>
              <span className="text-[11.5px] text-ink-tertiary">{m.hint}</span>
            </div>
            {m.href ? (
              <a
                href={m.href}
                download
                className="flex-none rounded-full bg-teal px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-teal-deep"
              >
                Descargar
              </a>
            ) : (
              <span className="flex-none rounded-full bg-cream px-2.5 py-1 text-[10px] font-extrabold text-ink-tertiary">
                MUY PRONTO
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
