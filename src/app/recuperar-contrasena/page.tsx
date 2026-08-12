"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

/**
 * "Olvidé mi contraseña" — el sitio viejo (Memberstack) tenía este flujo y no
 * se había portado a la plataforma nueva: quien olvidara su contraseña quedaba
 * bloqueado sin autoservicio (hallazgo 7-ago-2026).
 *
 * Supabase manda el correo con una liga de tipo `recovery`; `/auth/recuperar`
 * la canjea y aterriza en /nueva-contrasena con la sesión ya abierta.
 *
 * Siempre se responde lo mismo (haya o no cuenta con ese correo) para no
 * revelar qué direcciones están registradas.
 */
export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      // Ruta limpia, sin query: la lista blanca de Supabase recorta los
      // destinos con parámetros (comprobado el 7-ago).
      redirectTo: `${window.location.origin}/auth/recuperar`,
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="flex items-center justify-between border-b border-border-divider bg-white px-5 py-3.5 sm:px-8">
        <Link href="/">
          <Image
            src="/brand/logo-light-bg.svg"
            alt="Pata Amiga"
            width={130}
            height={46}
            className="h-[42px] w-auto sm:h-[46px]"
            priority
          />
        </Link>
        <div className="text-sm text-ink-secondary">
          ¿Ya la recordaste?{" "}
          <Link href="/iniciar-sesion" className="font-semibold text-teal-deep">
            Inicia sesión
          </Link>
        </div>
      </header>

      <div className="pb-14 pt-8 sm:pt-14">
        <div className="mx-auto flex w-full max-w-[460px] flex-col gap-6 px-5 sm:px-0">
          <div>
            <h1 className="font-display text-3xl text-ink-title sm:text-[38px]">
              Recupera tu acceso
            </h1>
            <p className="mt-1.5 text-[15px] text-ink-secondary">
              Te mandamos una liga para crear una contraseña nueva.
            </p>
          </div>

          {sent ? (
            <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
              <span className="text-[40px]" aria-hidden>
                📬
              </span>
              <p className="text-[15px] leading-relaxed text-ink-body">
                Si <strong>{email.trim().toLowerCase()}</strong> tiene una
                cuenta en Club Pata Amiga, ya va en camino un correo con la liga
                para crear tu contraseña nueva.
              </p>
              <p className="text-sm leading-relaxed text-ink-secondary">
                Revisa también la carpeta de spam. La liga funciona una sola vez
                y vence en una hora.
              </p>
              <Link
                href="/iniciar-sesion"
                className="grid h-[52px] place-items-center rounded-full bg-teal px-7 text-[15px] font-bold text-white transition-colors hover:bg-teal-deep"
              >
                Volver a iniciar sesión
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="flex w-full flex-col gap-[18px] rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7"
            >
              <TextField
                label="Correo electrónico"
                type="email"
                required
                placeholder="tu@correo.com"
                hint="El mismo con el que te registraste."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <Button type="submit" disabled={loading}>
                {loading ? "Enviando…" : "Enviarme la liga"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
