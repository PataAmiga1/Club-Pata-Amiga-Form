import { ChangePasswordCard } from "@/components/app/ChangePasswordCard";
import { RedesCard } from "../RedesCard";
import { BajaVoluntariaCard } from "../BajaVoluntariaCard";
import { getCenterContext } from "../shared";

export const metadata = { title: "Mi cuenta · Centro aliado · Club Pata Amiga" };

/**
 * Ajustes de la cuenta del centro: redes, contraseña y baja voluntaria.
 * El "Cerrar sesión" vive solo en el menú del encabezado — aquí estaba
 * duplicado (hallazgo del equipo).
 */
export default async function CentroCuentaPage() {
  const { center } = await getCenterContext();

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-5 py-7 sm:px-8">
      <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          <RedesCard initial={center.social_links} />
          <ChangePasswordCard />
        </div>
        <BajaVoluntariaCard centerName={center.name} />
      </div>
    </div>
  );
}
