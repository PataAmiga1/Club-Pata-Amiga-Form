"use client";

import { RegistroHeader } from "@/components/registro/Header";
import { Stepper } from "@/components/registro/Stepper";
import { PetForm } from "@/components/registro/PetForm";

/** Paso 2 del registro: primera mascota (pre-pago). */
export default function PeludoPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <RegistroHeader step={2} />
      <div className="pb-14 pt-4 sm:pt-10">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 sm:px-0">
          <Stepper current={2} />
          <div>
            <h1 className="font-display text-3xl text-ink-title sm:text-[38px]">
              Preséntanos a tu peludo
            </h1>
            <p className="mt-1.5 text-[15px] leading-normal text-ink-secondary">
              Registra a tu primer peludo. Podrás agregar hasta 3 desde tu
              cuenta.
            </p>
          </div>
          <PetForm mode="registro" />
        </div>
      </div>
    </div>
  );
}
