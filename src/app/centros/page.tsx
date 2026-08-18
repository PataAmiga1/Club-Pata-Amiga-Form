import type { Metadata } from "next";
import { fetchApprovedCenters } from "@/lib/centers";
import { PublicHeader } from "@/components/public/PublicHeader";
import { CentersExplorer } from "@/components/centros/CentersExplorer";

export const metadata: Metadata = {
  title: "Centros aliados · Club Pata Amiga",
  description:
    "Clínicas, pet shops, hospedajes y más con beneficios para la manada en todo México.",
};

export default async function CentrosPublicPage() {
  const centers = await fetchApprovedCenters();
  return (
    <div className="min-h-dvh bg-cream">
      <PublicHeader />
      <CentersExplorer centers={centers} hero />
    </div>
  );
}
