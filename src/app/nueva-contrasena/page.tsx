"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

/**
 * Segundo paso de "olvidé mi contraseña": aquí aterriza la liga del correo,
 * ya con sesión de recuperación abierta (la canjea `auth/callback`). Si
 * alguien llega sin esa sesión, se le regresa a pedir la liga de nuevo.
 */
export default function NuevaContrasenaPage() {
  const [estado, setEstado] = useState<"revisando" | "lista" | "sin-sesion">(
    "revisando",
  );
  /** Por qué no hay sesión: cambia lo que se le explica a la persona. */
  const [motivo, setMotivo] = useState<"usada" | "vencida" | "otra" | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  /**
   * La liga del correo puede llegar de TRES formas distintas, y antes solo se
   * entendía una (reporte de una socia, 28-sep-2026: «la liga nunca funcionó»):
   *
   *  · `?code=…`            — la que produce el formulario del sitio. La canjea
   *                           `auth/recuperar` en el servidor, y aquí ya hay sesión.
   *  · `#access_token=…`    — la que produce un enlace hecho desde el panel de
   *                           Supabase o desde la migración. Viene en el TROZO de
   *                           la URL, que el servidor NUNCA ve: hay que leerlo aquí.
   *  · `?token_hash=…`      — el formato nuevo de las plantillas de Supabase.
   *
   * Con las dos últimas la persona veía «esta liga ya venció» aunque su liga
   * estuviera perfecta y sin usar. Eso es lo que se arregla.
   */
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const trozo = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const codigoDeError =
        trozo.get("error_code") ?? query.get("error_code") ?? query.get("error");
      const accessToken = trozo.get("access_token");
      const refreshToken = trozo.get("refresh_token");
      const tokenHash = query.get("token_hash");

      try {
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        } else if (tokenHash) {
          await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        }
      } catch {
        // Da igual por qué falló: abajo se decide qué ve la persona.
      }
      // La liga trae credenciales: no deben quedarse en la barra ni en el
      // historial una vez usadas.
      if (accessToken || tokenHash)
        window.history.replaceState(null, "", window.location.pathname);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setEstado("lista");
        return;
      }
      setMotivo(
        codigoDeError === "otp_expired"
          ? "vencida"
          : codigoDeError
            ? "usada"
            : "otra",
      );
      setEstado("sin-sesion");
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(
        updateError.message.includes("different from the old")
          ? "La nueva contraseña debe ser diferente a la anterior."
          : "No pudimos guardar tu contraseña. Pide la liga de nuevo.",
      );
      return;
    }
    setListo(true);
  }

  const eye = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      className="text-[13px] font-semibold text-teal-deep"
    >
      {show ? "Ocultar" : "Mostrar"}
    </button>
  );

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
      </header>

      <div className="pb-14 pt-8 sm:pt-14">
        <div className="mx-auto flex w-full max-w-[460px] flex-col gap-6 px-5 sm:px-0">
          <div>
            <h1 className="font-display text-3xl text-ink-title sm:text-[38px]">
              {listo ? "¡Listo!" : "Crea tu contraseña nueva"}
            </h1>
            <p className="mt-1.5 text-[15px] text-ink-secondary">
              {listo
                ? "Tu contraseña quedó actualizada."
                : "Elige una contraseña que recuerdes fácil."}
            </p>
          </div>

          {estado === "revisando" && (
            <div className="rounded-[20px] bg-white p-5 text-[15px] text-ink-secondary shadow-[var(--shadow-card)] sm:p-7">
              Validando tu liga…
            </div>
          )}

          {estado === "sin-sesion" && (
            <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
              <p className="text-[15px] leading-relaxed text-ink-body">
                {motivo === "vencida"
                  ? "Esta liga ya venció. Pide una nueva y vuelve a intentarlo — solo toma un minuto."
                  : motivo === "usada"
                    ? "Esta liga ya se había usado. Pide una nueva y vuelve a intentarlo — solo toma un minuto."
                    : "No pudimos validar tu liga. Pide una nueva y vuelve a intentarlo — solo toma un minuto."}
              </p>
              {/* Con la liga de siempre (la del formulario), el canje solo
                  funciona en el MISMO navegador donde se pidió: si abrió el
                  correo en otra app, aquí no hay sesión y nada de lo anterior
                  se lo explica. */}
              <p className="text-[13.5px] leading-relaxed text-ink-secondary">
                Un consejo: pide la liga y ábrela <strong>en el mismo navegador</strong>.
                Si abriste el correo desde otra aplicación, vuelve a pedirla desde aquí.
              </p>
              <Link
                href="/recuperar-contrasena"
                className="grid h-[52px] place-items-center rounded-full bg-teal px-7 text-[15px] font-bold text-white transition-colors hover:bg-teal-deep"
              >
                Pedir una liga nueva
              </Link>
            </div>
          )}

          {estado === "lista" &&
            (listo ? (
              <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
                <span className="text-[40px]" aria-hidden>
                  🐾
                </span>
                <p className="text-[15px] leading-relaxed text-ink-body">
                  Ya puedes entrar con tu contraseña nueva.
                </p>
                <Link
                  href="/iniciar-sesion"
                  className="grid h-[52px] place-items-center rounded-full bg-teal px-7 text-[15px] font-bold text-white transition-colors hover:bg-teal-deep"
                >
                  Iniciar sesión
                </Link>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex w-full flex-col gap-[18px] rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7"
              >
                <TextField
                  label="Nueva contraseña"
                  type={show ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  hint="Mínimo 8 caracteres."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  rightSlot={eye}
                />
                <TextField
                  label="Confírmala"
                  type={show ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                {error && (
                  <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
                    {error}
                  </div>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar contraseña"}
                </Button>
              </form>
            ))}
        </div>
      </div>
    </div>
  );
}
