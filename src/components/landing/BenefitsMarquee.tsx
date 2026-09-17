import { MEMBERSHIP_FEATURES, MEMBERSHIP_FEATURES_599 } from "@/lib/constants";

/** Huellita monocroma que hereda el color del texto (currentColor). */
function PawIcon({ className }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <ellipse cx="7" cy="7.5" rx="2.3" ry="3" />
      <ellipse cx="17" cy="7.5" rx="2.3" ry="3" />
      <ellipse cx="3.4" cy="12.5" rx="2" ry="2.6" />
      <ellipse cx="20.6" cy="12.5" rx="2" ry="2.6" />
      <path d="M12 11c3.2 0 6.2 2.6 6.2 5.6 0 2.2-1.5 3.4-3.4 3.4-1 0-1.9-.4-2.8-.4s-1.8.4-2.8.4c-1.9 0-3.4-1.2-3.4-3.4C5.8 13.6 8.8 11 12 11z" />
    </svg>
  );
}

/**
 * Banda animada con las 5 características de la membresía (SIEMPRE en el
 * orden vinculante). El contenido va duplicado para que el loop CSS sea
 * continuo; se pausa al pasar el cursor y respeta prefers-reduced-motion.
 * Inspirada en el banner móvil del registro de app.pataamiga.mx.
 */
export function BenefitsMarquee({
  variant = "dark",
  es599 = false,
}: {
  variant?: "dark" | "light";
  /** Altas del $599 (`ALTAS_SON_599`): la tercera característica cambia. */
  es599?: boolean;
}) {
  const features = es599 ? MEMBERSHIP_FEATURES_599 : MEMBERSHIP_FEATURES;
  // El loop CSS recorre -50% del riel, así que el contenido va duplicado.
  // Cada mitad repite la lista 3 veces para que una sola mitad sea más ancha
  // que cualquier pantalla — sin huecos vacíos en monitores grandes.
  const REPEATS_PER_HALF = 3;
  const items = Array.from(
    { length: REPEATS_PER_HALF * 2 },
    () => features,
  ).flat();

  return (
    <div
      aria-label={`Beneficios: ${features.join(", ")}`}
      className={`overflow-hidden py-3 ${
        variant === "dark" ? "bg-teal-dark" : "border-y border-border-divider bg-white"
      }`}
    >
      <div className="marquee-track flex w-max items-center" aria-hidden>
        {items.map((feature, i) => (
          <span
            key={i}
            className={`flex items-center gap-3 whitespace-nowrap pr-3 text-[13px] font-bold tracking-wide ${
              variant === "dark" ? "text-white/90" : "text-teal-dark"
            }`}
          >
            {/* Huellita SVG (el emoji 🐾 no se puede recolorear con CSS) */}
            <PawIcon
              className={variant === "dark" ? "text-white" : "text-teal"}
            />
            {feature}
          </span>
        ))}
      </div>
    </div>
  );
}
