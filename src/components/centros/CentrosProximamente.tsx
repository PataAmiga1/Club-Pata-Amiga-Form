import Link from "next/link";

/**
 * Mientras la red de centros aliados no tenga centros reales, el directorio
 * se sustituye por este aviso (equipo, 17-sep-2026): en producción solo había
 * registros de prueba («Veterinaria test», «Hospital Guaf»…). Se abre desde
 * /admin/sitio con «directorio_centros_abierto = si».
 *
 * La invitación a sumarse como centro se queda: es como la red va a crecer.
 */
export function CentrosProximamente({ hero = false }: { hero?: boolean }) {
  return (
    <div className={`flex flex-col gap-5 ${hero ? "px-5 py-10 sm:px-10" : ""}`}>
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-3 rounded-[20px] bg-white px-6 py-10 text-center shadow-[var(--shadow-card)]">
        <span className="text-[40px]" aria-hidden>
          📍
        </span>
        <span className="rounded-full bg-info-bg px-3 py-1 text-[11.5px] font-extrabold tracking-[.06em] text-teal-deep">
          PRÓXIMAMENTE
        </span>
        <h2 className="font-display text-[26px] leading-tight text-ink-title">
          Nuestra red de centros aliados
        </h2>
        <p className="max-w-[460px] text-[14px] leading-relaxed text-ink-secondary">
          Muy pronto vas a encontrar aquí clínicas, pet shops, estéticas,
          hospedajes y más, con beneficios para la manada en todo México.
          Mientras tanto, recuerda que siempre puedes seguir con tu veterinario
          de confianza.
        </p>
      </div>
      <div className="mx-auto flex w-full max-w-[640px] flex-wrap items-center justify-between gap-3 rounded-[16px] border-[1.5px] border-dashed border-border-input bg-white/60 px-5 py-4">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-ink-title">¿Tienes un negocio pet-friendly?</span>
          <span className="text-[12.5px] text-ink-tertiary">Súmate a nuestra red de centros aliados.</span>
        </div>
        <Link
          href="/centros/registro"
          className="grid h-11 place-items-center rounded-full border-2 border-teal px-6 text-[13px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
        >
          Quiero ser centro aliado
        </Link>
      </div>
    </div>
  );
}
