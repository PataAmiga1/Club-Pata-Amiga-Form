import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarPorToken } from "@/lib/correo/bajas";
import { confirmarBaja, volverASuscribirme } from "./actions";

export const metadata: Metadata = {
  title: "Dejar de recibir correos · Club Pata Amiga",
  // Una página con el token de alguien no tiene por qué acabar en un buscador.
  robots: { index: false, follow: false },
};

/**
 * Baja de correo de mercadotecnia — sin sesión, con el token del correo.
 *
 * POR QUÉ HAY UN BOTÓN Y NO SE DA DE BAJA AL ABRIR: los clientes de correo y
 * los antivirus visitan las ligas por su cuenta para revisarlas. Si la baja
 * ocurriera al cargar la página, esa visita automática daría de baja a alguien
 * que nunca hizo clic. El botón «un clic» del propio cliente de correo va por
 * POST a /api/baja/<token> y ese sí da de baja directo (RFC 8058).
 */
export default async function BajaCorreoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ listo?: string; vuelta?: string }>;
}) {
  const { token } = await params;
  const { listo, vuelta } = await searchParams;
  const fila = await buscarPorToken(createAdminClient(), token);
  const dadoDeBaja = !!fila?.baja_at;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-4 py-12">
      <div className="flex w-full max-w-[440px] flex-col gap-4 rounded-[20px] bg-white p-6 text-center shadow-[0_2px_16px_rgba(30,83,80,.08)] sm:p-7">
        <span className="text-[34px]" aria-hidden>
          🐾
        </span>

        {!fila && (
          <>
            <h1 className="font-display text-[22px] text-ink-title">Esta liga no funciona</h1>
            <p className="text-[13.5px] leading-relaxed text-ink-secondary">
              No la encontramos. Puede que esté incompleta. Si quieres dejar de
              recibir nuestros correos, escríbenos a{" "}
              <a href="mailto:contacto@pataamiga.mx" className="font-semibold underline">
                contacto@pataamiga.mx
              </a>{" "}
              y lo hacemos por ti.
            </p>
          </>
        )}

        {fila && dadoDeBaja && (
          <>
            <h1 className="font-display text-[22px] text-ink-title">
              {listo ? "Listo, ya no te escribiremos" : "Ya no te escribimos"}
            </h1>
            <p className="break-words text-[13.5px] leading-relaxed text-ink-secondary">
              No vamos a mandar boletines ni promociones a{" "}
              <strong>{fila.email}</strong>.
            </p>
            <p className="rounded-[12px] bg-cream px-4 py-3 text-left text-[12.5px] leading-relaxed text-ink-secondary">
              Si tienes una membresía, <strong>sigue igual</strong>. Te seguirán
              llegando los correos de tu cuenta: tus cobros, tus reintegros y los
              avisos legales.
            </p>
            {fila.origen === "queja_spam" ? (
              <p className="text-[12px] leading-relaxed text-ink-tertiary">
                ¿Fue un error? Escríbenos a{" "}
                <a href="mailto:contacto@pataamiga.mx" className="font-semibold underline">
                  contacto@pataamiga.mx
                </a>{" "}
                y te volvemos a dar de alta.
              </p>
            ) : (
              <form
                action={volverASuscribirme}
                className="text-[12px] leading-relaxed text-ink-tertiary"
              >
                <input type="hidden" name="token" value={token} />
                ¿Te diste de baja por error?{" "}
                <button type="submit" className="font-semibold text-teal underline">
                  Volver a suscribirme
                </button>
              </form>
            )}
          </>
        )}

        {fila && !dadoDeBaja && vuelta && (
          <>
            <h1 className="font-display text-[22px] text-ink-title">
              ¡Qué gusto tenerte de vuelta!
            </h1>
            <p className="break-words text-[13.5px] leading-relaxed text-ink-secondary">
              Te volverán a llegar el boletín y nuestras novedades en{" "}
              <strong>{fila.email}</strong>.
            </p>
            <a
              href="https://www.pataamiga.mx"
              className="w-full rounded-full bg-teal px-6 py-3 text-[14px] font-bold text-white hover:bg-teal-deep"
            >
              Ir al sitio
            </a>
          </>
        )}

        {fila && !dadoDeBaja && !vuelta && (
          <>
            <h1 className="font-display text-[22px] text-ink-title">
              ¿Dejamos de escribirte?
            </h1>
            <p className="break-words text-[13.5px] leading-relaxed text-ink-secondary">
              Dejarás de recibir el boletín y nuestras promociones en{" "}
              <strong>{fila.email}</strong>.
            </p>
            <p className="rounded-[12px] bg-cream px-4 py-3 text-left text-[12.5px] leading-relaxed text-ink-secondary">
              Si tienes una membresía, esto <strong>no la toca</strong>. Te
              seguirán llegando los correos de tu cuenta: tus cobros, tus
              reintegros y los avisos legales.
            </p>
            <form action={confirmarBaja}>
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="w-full rounded-full bg-teal px-6 py-3 text-[14px] font-bold text-white hover:bg-teal-deep"
              >
                Sí, ya no quiero recibirlos
              </button>
            </form>
            <a
              href="https://www.pataamiga.mx"
              className="text-[12.5px] font-semibold text-ink-tertiary underline"
            >
              Mejor no, llévame al sitio
            </a>
          </>
        )}
      </div>
    </div>
  );
}
