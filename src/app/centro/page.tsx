import { WelcomeOnce } from "@/components/app/WelcomeOnce";
import { CenterInfoCard } from "./CenterInfoCard";
import { ServiciosCard, type LocationRow } from "./ServiciosCard";
import { getCenterContext, getCenterLocations } from "./shared";

export const metadata = { title: "Resumen · Centro aliado · Club Pata Amiga" };

/**
 * Resumen: cómo se ve el centro en el directorio (foto, beneficio, contacto) y
 * qué servicios y sucursales ofrece. Promociones, pagos y ajustes de la cuenta
 * viven en sus propias pestañas desde el 19-ago.
 */
export default async function CentroResumenPage() {
  const { center } = await getCenterContext();
  const locations = await getCenterLocations(center.id);

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-5 py-7 sm:px-8">
      <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
        <CenterInfoCard
          initialLogoUrl={center.logo_url}
          initialBenefit={center.member_benefit}
          initialPhone={center.phone}
          initialWebsite={center.website}
        />
        {/* Servicios y ubicaciones editables por el centro (equipo, 5-ago) */}
        <ServiciosCard
          initialServices={center.services ?? []}
          locations={locations as LocationRow[]}
        />
      </div>

      {/* Bienvenida (una sola vez tras la aprobación) */}
      <WelcomeOnce
        storageKey={`pa_welcome_centro_${center.id}`}
        emoji="🎉"
        title={`¡${center.name} ya es parte de la red!`}
        message="Tu centro ya aparece en el directorio de centros aliados. Completa tu perfil, publica promociones y los miembros las verán al instante."
        cta="Completar mi perfil"
      />
    </div>
  );
}
