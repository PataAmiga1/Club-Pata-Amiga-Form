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
        {/* El documento escribió «Centros de Bienestar» aquí y «centros
            aliados» en la portada. Pablo eligió CENTROS ALIADOS (decisión 2),
            así que se normaliza a ese nombre en todo el flujo. */}
        <h1 className="font-display text-[28px] leading-tight text-ink-title sm:text-[34px]">
          Súmate a la red de centros aliados
        </h1>
        <p className="mb-4 max-w-[560px] text-[14.5px] leading-relaxed text-ink-secondary">
          Clínicas, pet shops, hospedajes, estéticas y más: forma parte de
          nuestro directorio y recibe a la manada de Pata Amiga con un beneficio
          especial.
        </p>
        <CenterForm conocidos={conocidos} />
      </div>
    </div>
  );
}
