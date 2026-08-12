import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Correo confirmado — Club Pata Amiga",
};

/**
 * Aterrizaje de la liga de confirmación de correo. Se abre en una pestaña
 * nueva (desde el cliente de correo); la pestaña original del registro avanza
 * sola en cuanto Supabase acepta la sesión, así que aquí solo se confirma y
 * se invita a cerrar. El botón es el plan B por si cerraron la original.
 */
export default function CorreoConfirmadoPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-teal px-6 py-16">
      <div className="blob absolute -left-[90px] -top-[70px] size-[320px] bg-white/[.12]" />
      <div className="blob absolute -bottom-[120px] -right-[100px] size-[380px] bg-white/10" />

      <div className="relative flex w-full max-w-[560px] flex-col items-center gap-[18px] text-center">
        <Image
          src="/brand/logo-color.svg"
          alt="Pata Amiga"
          width={220}
          height={80}
          className="w-[220px]"
          priority
        />
        <h1 className="font-display text-[40px] leading-[1.05] text-white sm:text-[52px]">
          ¡Correo
          <br />
          confirmado!
        </h1>
        <p className="text-base leading-relaxed text-white/[.92]">
          Gracias por confirmar tu correo. Tu registro continúa solo en la
          pestaña donde lo empezaste — <strong>ya puedes cerrar esta</strong>.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          ¿Cerraste la otra pestaña? No pasa nada:
        </p>
        <Link
          href="/iniciar-sesion"
          className="grid h-[52px] place-items-center rounded-full bg-white px-7 text-[15px] font-bold text-teal-deep transition-colors hover:bg-cream-light"
        >
          Continuar mi registro
        </Link>
      </div>
    </main>
  );
}
