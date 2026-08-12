"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveLoginDestination, attemptLegacyBridgeLogin } from "./actions";
import { TextField } from "@/components/ui/Field";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { Button } from "@/components/ui/Button";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? "No pudimos iniciar tu sesión. Intenta de nuevo." : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError) {
      // Puede ser un miembro legacy (Memberstack) que aún no migra su
      // password a Supabase Auth: intentamos el puente antes de rendirnos.
      const bridged = await attemptLegacyBridgeLogin(email.trim().toLowerCase(), password);
      if (!bridged.success) {
        setError("Correo o contraseña incorrectos.");
        setLoading(false);
        return;
      }
      window.location.assign(bridged.destination ?? "/app");
      return;
    }
    // Sin ?next explícito, el rol y estado deciden el destino:
    // admin → /admin · miembro con plan → /app · embajador sin plan → /embajador
    let dest = next;
    if (!searchParams.get("next")) {
      try {
        dest = await resolveLoginDestination();
      } catch {
        dest = "/app";
      }
    }
    // Navegación completa (no router.push): garantiza que las cookies de
    // sesión viajen al servidor y evita quedarse "atorado" en el login
    window.location.assign(dest);
  }

  async function handleGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-[18px] rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7"
    >
      <TextField
        label="Correo electrónico"
        type="email"
        required
        placeholder="tu@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <TextField
        label="Contraseña"
        type={showPassword ? "text" : "password"}
        required
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        rightSlot={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-[13px] font-semibold text-teal-deep"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        }
      />
      <Link
        href="/recuperar-contrasena"
        className="-mt-1.5 self-end text-[13px] font-semibold text-teal-deep hover:underline"
      >
        ¿Olvidaste tu contraseña?
      </Link>
      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
          {error}
        </div>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Entrando…" : "Iniciar sesión"}
      </Button>
      <div className="flex items-center gap-3 text-xs text-ink-placeholder">
        <span className="h-px flex-1 bg-border-divider" />
        o
        <span className="h-px flex-1 bg-border-divider" />
      </div>
      <button
        type="button"
        onClick={handleGoogle}
        className="flex h-[52px] items-center justify-center gap-2.5 rounded-full border-[1.5px] border-border-input bg-white text-[15px] font-semibold text-ink-body transition-colors hover:border-teal"
      >
        <GoogleIcon />
        Continuar con Google
      </button>
    </form>
  );
}

export default function IniciarSesionPage() {
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
          ¿Aún no eres de la manada?{" "}
          <Link href="/registro" className="font-semibold text-teal-deep">
            Únete
          </Link>
        </div>
      </header>
      <div className="pb-14 pt-8 sm:pt-14">
        <div className="mx-auto flex w-full max-w-[460px] flex-col gap-6 px-5 sm:px-0">
          <div>
            <h1 className="font-display text-3xl text-ink-title sm:text-[38px]">
              Hola de nuevo
            </h1>
            <p className="mt-1.5 text-[15px] text-ink-secondary">
              Inicia sesión para cuidar a tu manada.
            </p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
