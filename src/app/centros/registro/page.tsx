import type { Metadata } from "next";
import { PublicHeader } from "@/components/public/PublicHeader";
import { datosConocidos } from "@/lib/datos-conocidos";
import { CenterForm } from "./CenterForm";

export const metadata: Metadata = {
  title: "Quiero ser centro aliado · Club Pata Amiga",
};

export default async function CentroRegistroPage() {
  // Con sesión abierta el formulario llega lleno con lo que ya dio (15-ago).
  const conocidos = await datosConocidos();
  return (
    <div className="min-h-dvh bg-cream">
      <PublicHeader />
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2 px-5 py-8">
        <h1 className="font-display text-[28px] leading-tight text-ink-title sm:text-[34px]">
          Únete a la red de centros aliados
        </h1>
        <p className="mb-4 max-w-[560px] text-[14.5px] leading-relaxed text-ink-secondary">
          Clínicas, tiendas, hoteles, estéticas y más: aparece en el directorio
          de Pata Amiga y recibe a miembros de toda la manada con un beneficio
          exclusivo.
        </p>
        <CenterForm conocidos={conocidos} />
      </div>
    </div>
  );
}
