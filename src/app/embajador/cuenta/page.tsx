import { ChangePasswordCard } from "@/components/app/ChangePasswordCard";
import { LogoutButton } from "@/components/app/LogoutButton";
import { PaymentDataCard } from "../PaymentDataCard";
import { IneCard } from "../IneCard";
import { ExtrasCard, BajaEmbajadorCard } from "../ExtrasCard";
import { getAmbassadorContext } from "../shared";

export const metadata = { title: "Mi cuenta de embajador · Club Pata Amiga" };

/**
 * Ajustes del embajador: datos de pago (titular y RFC), redes sociales,
 * contraseña y baja voluntaria (equipo, 5-ago; RFC movido a la tarjeta
 * bancaria el 13-ago).
 */
export default async function EmbajadorCuentaPage() {
  const { ambassador } = await getAmbassadorContext();

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-5 py-5 sm:px-8">
      <h1 className="font-display text-[24px] text-ink-title">Mi cuenta</h1>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <PaymentDataCard
          initialBank={ambassador.bank_name}
          initialClabe={ambassador.clabe}
          initialHolder={ambassador.bank_holder}
          initialRfc={ambassador.rfc}
        />
        <IneCard
          tieneFrente={Boolean(ambassador.ine_front_url)}
          tieneReverso={Boolean(ambassador.ine_back_url)}
        />
        <ExtrasCard initialLinks={ambassador.social_links} />
        <ChangePasswordCard />
        <BajaEmbajadorCard />
      </div>
      <div className="flex justify-start">
        <LogoutButton variant="button" />
      </div>
    </div>
  );
}
