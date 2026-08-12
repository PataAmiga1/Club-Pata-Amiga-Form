"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { RegistroHeader } from "@/components/registro/Header";
import { StashAmbassadorCode } from "@/components/registro/StashAmbassadorCode";
import { BenefitsMarquee } from "@/components/landing/BenefitsMarquee";
import { Stepper } from "@/components/registro/Stepper";
import { TextField } from "@/components/ui/Field";
import { PhoneField } from "@/components/ui/PhoneField";
import { Button } from "@/components/ui/Button";
import { GoogleIcon } from "@/components/ui/GoogleIcon";

// Los textos legales pesan miles de líneas: el popup se carga SOLO cuando
// alguien lo abre, no viaja con la página de registro.
const LegalPopup = dynamic(
  () => import("@/components/legal/LegalPopup").then((m) => m.LegalPopup),
  { ssr: false },
);

export default function RegistroPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState(false);
  // Popup de legales (equipo, 10-ago): null = cerrado
  const [legalSlug, setLegalSlug] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // trim: un espacio invisible al final (típico de teclados móviles) hacía
    // que Supabase marcara el correo como inválido
    const cleanEmail = email.trim().toLowerCase();
    if (password.length < 8) {
      setError("La contraseña debe tener mínimo 8 caracteres.");
      return;
    }
    if (phone.length !== 10) {
      setError("El teléfono debe tener 10 dígitos.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { phone: `+52${phone}` },
        // La liga del correo de confirmación abre en pestaña nueva: aterriza
        // en una página de marca que invita a cerrarla (el registro sigue solo
        // en la pestaña original). Requiere la URL en la lista de redirecciones
        // permitidas de Supabase Auth.
        emailRedirectTo: `${window.location.origin}/registro/confirmado`,
      },
    });
    if (signUpError) {
      setError(
        signUpError.message === "User already registered"
          ? "Este correo ya es de la manada. Inicia sesión."
          : signUpError.message.toLowerCase().includes("invalid")
            ? "Revisa el correo electrónico — parece incompleto."
            : signUpError.message,
      );
      setLoading(false);
      return;
    }
    if (data.session) {
      router.push("/registro/peludo");
    } else {
      // Email confirmation enabled on the Supabase project
      setConfirmEmail(true);
      setLoading(false);
    }
  }

  // Confirmación de correo hecha en OTRO dispositivo (ej. el teléfono):
  // esta pantalla intenta iniciar sesión en silencio cada pocos segundos
  // con las credenciales recién creadas; en cuanto Supabase acepte
  // (correo confirmado), el registro continúa solo.
  useEffect(() => {
    if (!confirmEmail) return;
    const supabase = createClient();
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (!cancelled && data.session) {
        window.location.assign("/registro/peludo");
      }
    };
    const interval = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmEmail]);

  async function handleGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=/registro/peludo`,
      },
    });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <RegistroHeader step={1} />
      <StashAmbassadorCode />
      {/* Banda de beneficios — refuerzo en móvil como en la app anterior */}
      <div className="sm:hidden">
        <BenefitsMarquee variant="light" />
      </div>
      <div className="pb-14 pt-4 sm:pt-10">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 sm:px-0">
          <Stepper current={1} />
          <div>
            <h1 className="font-display text-3xl text-ink-title sm:text-[38px]">
              Únete a la manada
            </h1>
            <p className="mt-1.5 text-[15px] leading-normal text-ink-secondary">
              Crea tu cuenta con Google o tu correo. Después nos presentas a tu
              peludo.
            </p>
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-[18px] rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7"
          >
            {confirmEmail ? (
              <div className="flex flex-col gap-2 rounded-[12px] bg-info-bg px-4 py-3 text-sm leading-normal text-info-text">
                <span>
                  Te enviamos un correo a <strong>{email}</strong>. Confírmalo
                  (puede ser desde tu teléfono) — esta pantalla continuará
                  sola en cuanto lo hagas.
                </span>
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  <span className="inline-block size-3 animate-spin rounded-full border-2 border-teal border-t-transparent" />
                  Esperando tu confirmación…
                </span>
              </div>
            ) : (
              <>
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
                  hint="Mínimo 8 caracteres."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
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
                <PhoneField
                  label="Teléfono"
                  required
                  value={phone}
                  onChange={setPhone}
                  hint="10 dígitos, sin lada internacional."
                />
                {error && (
                  <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
                    {error}
                  </div>
                )}
                <Button type="submit" disabled={loading}>
                  {loading ? "Creando tu cuenta…" : "Continuar"}
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
                {/* Popup, no navegación: los legales se leen aquí mismo y
                    traen todos los documentos (equipo, 10-ago) */}
                <p className="text-center text-[12.5px] leading-normal text-ink-tertiary">
                  Al continuar aceptas los{" "}
                  <button
                    type="button"
                    onClick={() => setLegalSlug("terminos-y-condiciones")}
                    className="underline"
                  >
                    Términos y condiciones
                  </button>{" "}
                  y el{" "}
                  <button
                    type="button"
                    onClick={() => setLegalSlug("aviso-de-privacidad")}
                    className="underline"
                  >
                    Aviso de privacidad
                  </button>
                  .
                </p>
                {legalSlug && (
                  <LegalPopup
                    initialSlug={legalSlug}
                    onClose={() => setLegalSlug(null)}
                  />
                )}
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
