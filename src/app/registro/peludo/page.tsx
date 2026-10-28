import { RegistroHeader } from "@/components/registro/Header";
import { Stepper } from "@/components/registro/Stepper";
import { PetForm } from "@/components/registro/PetForm";
import { CuentaCreadaEvent } from "@/components/analytics/CuentaCreadaEvent";
import { ALTAS_SON_599 } from "@/lib/plans/planes";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarAtribucionDelMiembro } from "@/lib/atribucion-servidor";

/** Una cuenta «recién creada» para medir el Lead: menos de un día. */
const UN_DIA_MS = 24 * 60 * 60 * 1000;

function cuentaReciente(creada: string | undefined): boolean {
  return creada != null && Date.now() - new Date(creada).getTime() < UN_DIA_MS;
}

/** Paso 2 del registro: primera mascota (pre-pago). */
export default async function PeludoPage() {
  // Primera pantalla del servidor que ve toda cuenta nueva (correo, correo
  // confirmado en otro dispositivo, Google): aquí se liga la campaña de la que
  // llegó (cookie `pa_origen`, solo si aceptó cookies) y se mide el Lead.
  // Sin sesión no se hace nada: PetForm la manda de vuelta a /registro.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await guardarAtribucionDelMiembro(createAdminClient(), user.id);
  const recienCreada = cuentaReciente(user?.created_at);
  const metodo = user?.app_metadata?.provider === "google" ? "google" : "email";

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      {user && recienCreada && <CuentaCreadaEvent userId={user.id} metodo={metodo} />}
      <RegistroHeader step={2} />
      <div className="pb-14 pt-4 sm:pt-10">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 sm:px-0">
          <Stepper current={2} />
          <div>
            <h1 className="font-display text-3xl text-ink-title sm:text-[38px]">
              Preséntanos a tu peludo
            </h1>
            <p className="mt-1.5 text-[15px] leading-normal text-ink-secondary">
              Registra a tu primer peludo. A los demás los agregas después
              desde tu cuenta.
            </p>
          </div>
          <PetForm mode="registro" modelo599={ALTAS_SON_599} />
        </div>
      </div>
    </div>
  );
}
