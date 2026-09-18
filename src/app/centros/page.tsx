import type { Metadata } from "next";
import { fetchApprovedCenters } from "@/lib/centers";
import { PublicHeader } from "@/components/public/PublicHeader";
import { CentersExplorer } from "@/components/centros/CentersExplorer";
import { CentrosProximamente } from "@/components/centros/CentrosProximamente";
import { fetchSiteSettings } from "@/lib/site";
import { valorAbierto } from "@/lib/registro";

export const metadata: Metadata = {
  title: "Centros aliados · Club Pata Amiga",
  description:
    "Clínicas, pet shops, hospedajes y más con beneficios para la manada en todo México.",
};

export default async function CentrosPublicPage() {
  const ajustes = await fetchSiteSettings();
  const abierto = valorAbierto(ajustes.directorio_centros_abierto);
  const centers = abierto ? await fetchApprovedCenters() : [];
  return (
    <div className="min-h-dvh bg-cream">
      <PublicHeader />
      {abierto ? <CentersExplorer centers={centers} hero /> : <CentrosProximamente hero />}
    </div>
  );
}
