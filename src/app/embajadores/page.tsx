import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { datosConocidos } from "@/lib/datos-conocidos";
import { AmbassadorForm } from "./AmbassadorForm";
import { AMBASSADOR_PAYOUT_DAY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Programa de embajadores · Club Pata Amiga",
  description:
    "Comparte tu código, suma miembros a la manada y genera comisiones cada mes.",
};

const PERKS = [
  {
    emoji: "🔗",
    // El ejemplo ya no lleva el prefijo `PATAMIGA-`: los códigos nuevos se
    // eligen sin él (equipo, 16-ago), y se puede cambiar cuantas veces quiera.
    title: "Tu código único",
    text: "Tú lo eliges (ej. PAOLA2026). Compártelo en tus redes o con tu comunidad.",
  },
  {
    emoji: "💸",
    // El documento pedía «en los 10 primeros días». Pablo lo dejó como está:
    // el día 5, que es lo que hace `payAmbassadorCut`.
    title: "Comisión por referido",
    text: `Cada suscripción con tu código te genera comisión. Corte mensual con pago el día ${AMBASSADOR_PAYOUT_DAY}.`,
  },
  {
    emoji: "🎨",
    title: "Materiales listos",
    text: "Kits para historias, videos y guía de tono de marca para compartir sin complicarte.",
  },
];

export default async function EmbajadoresPage() {
  // Con sesión abierta el formulario llega lleno con lo que ya dio (15-ago).
  const conocidos = await datosConocidos();
  return (
    <div className="min-h-dvh bg-cream">
      <PublicHeader />

      <div className="relative overflow-hidden bg-teal-dark px-5 py-10 sm:px-10">
        <div className="blob absolute -right-[70px] -top-[80px] size-[260px] bg-white/[.08]" />
        <div className="relative mx-auto flex w-full max-w-[880px] flex-col gap-3.5">
          <h1 className="font-display text-[30px] leading-tight text-white sm:text-[38px]">
            Conviértete en embajador de la manada
          </h1>
          <p className="max-w-[560px] text-[14.5px] leading-[1.55] text-white/85">
            Comparte Pata Amiga con tu comunidad y genera comisiones por cada
            suscripción con tu código. Sumando esfuerzos con causa para cuidar a
            más peludos en todo México.
          </p>
          <p className="text-[12.5px] text-white/70">
            ¿Ya eres embajador?{" "}
            <Link href="/embajador" className="font-bold text-lime hover:underline">
              Entra a tu perfil →
            </Link>
          </p>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[880px] gap-6 px-5 py-8 lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-3.5">
          {PERKS.map((perk) => (
            <div
              key={perk.title}
              className="flex items-start gap-3.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]"
            >
              <span className="text-[26px]" aria-hidden>
                {perk.emoji}
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-bold text-ink-title">
                  {perk.title}
                </span>
                <span className="text-[13px] leading-relaxed text-ink-secondary">
                  {perk.text}
                </span>
              </div>
            </div>
          ))}
          {/* CORRECCIÓN DE FONDO, no de tono (equipo 16-ago, confirmada por
              Pablo). Esta línea decía que el código «no reduce tiempos de
              espera» y era falso: `petWaitingPeriodDays` baja la espera de 180
              a 90 días cuando la membresía trae código de embajador, desde el
              11-jul. La página le estaba escondiendo al embajador su mejor
              argumento para compartirlo. */}
          <p className="px-1 text-xs leading-relaxed text-ink-tertiary">
            El programa de embajadores está pensado para influencers, refugios y
            ONGs con fines de difusión: el código reduce el tiempo de espera de
            6 a 3 meses, pero no modifica los demás beneficios de la membresía.
            Registro con revisión del comité — solo mayores de edad.
          </p>
        </div>
        <AmbassadorForm conocidos={conocidos} />
      </div>
    </div>
  );
}
