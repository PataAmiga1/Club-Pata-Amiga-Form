"use client";

import Link from "next/link";
import { guardarConsentimiento, type Consentimiento } from "@/lib/consentimiento";
import { medicionActiva } from "@/lib/analytics";
import { useConsentimiento } from "./useConsentimiento";

/**
 * Banner de cookies.
 *
 * Solo aparece si (a) hay medición configurada y (b) la persona todavía no ha
 * decidido. Si el equipo no ha puesto ninguna llave, no se carga ningún
 * rastreador y entonces preguntar sería teatro: no se muestra.
 *
 * Las dos opciones pesan igual —mismo tamaño, misma jerarquía— porque un
 * «Rechazar» escondido en letra chica es justo lo que la marca promete no
 * hacer.
 */
export function BannerCookies() {
  const decision = useConsentimiento();

  if (!medicionActiva()) return null;
  if (decision !== null) return null;

  const responder = (valor: Consentimiento) => () => {
    guardarConsentimiento(valor);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Preferencias de cookies"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-[#eee9dd] bg-white p-5 shadow-lg sm:flex-row sm:items-center sm:gap-6">
        <p className="flex-1 text-sm leading-relaxed text-[#3d524f]">
          Usamos cookies para entender cómo se usa el sitio y mejorar lo que
          ofrecemos. <strong className="font-semibold">Las opcionales no se
          activan si no las aceptas.</strong>{" "}
          <Link
            href="/legales/politica-de-cookies"
            className="font-semibold text-[#0e8377] underline underline-offset-2"
          >
            Ver la política de cookies
          </Link>
        </p>

        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={responder("rechazado")}
            className="flex-1 rounded-full border border-[#0e8377] px-5 py-2.5 text-sm font-semibold text-[#0e8377] transition hover:bg-[#e9f7f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e8377] sm:flex-none"
          >
            Solo las necesarias
          </button>
          <button
            type="button"
            onClick={responder("aceptado")}
            className="flex-1 rounded-full bg-[#0e8377] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1e5350] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e8377] sm:flex-none"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
