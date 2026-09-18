import { fetchApprovedCenters } from "@/lib/centers";
import { CentersExplorer } from "@/components/centros/CentersExplorer";
import { CentrosProximamente } from "@/components/centros/CentrosProximamente";
import { fetchSiteSettings } from "@/lib/site";
import { valorAbierto } from "@/lib/registro";

export default async function CentrosPage() {
  // «Próximamente» mientras no haya centros reales (equipo, 17-sep-2026).
  const ajustes = await fetchSiteSettings();
  const abierto = valorAbierto(ajustes.directorio_centros_abierto);
  const centers = abierto ? await fetchApprovedCenters() : [];
  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] text-ink-title">
          Centros aliados
        </h1>
        <p className="text-sm text-ink-secondary">
          Beneficios exclusivos para miembros — y recuerda: siempre puedes
          seguir con tu veterinario de confianza.
        </p>
      </div>
      {abierto ? <CentersExplorer centers={centers} /> : <CentrosProximamente />}
    </div>
  );
}
