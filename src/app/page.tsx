import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PLANS } from "@/lib/constants";
import { COMPANY_LINE, LEGAL_DOCS, fetchSiteAssets, fetchSiteSettings } from "@/lib/site";
import { LEGAL_TEXTS } from "@/data/legal-texts";
import { Faq } from "@/components/landing/Faq";
import { NewsletterForm } from "@/components/landing/NewsletterForm";
import { BenefitsMarquee } from "@/components/landing/BenefitsMarquee";
import { SocialIcon } from "@/components/landing/SocialIcons";
import { PhoneMockup } from "@/components/landing/PhoneMockup";

export const metadata: Metadata = {
  title: "Club Pata Amiga — Protección para tu manada",
  description:
    "Membresía de salud para tu peludo (michi o lomito) orgullosamente 100% mexicana: orientación veterinaria 24/7, reintegros para gastos veterinarios y acceso a nuestra red de centros aliados.",
};

/** Landing pública (screen 2a + secciones del sitio actual pataamiga.mx). */

/**
 * Las tres tarjetas de «Amor que deja huella» (pantalla 02 del tono 2.0).
 *
 * El documento del equipo le asignó a la tarjeta de centros aliados el texto de
 * reintegros —montos y 72 hrs, que ya está en la tarjeta de junto—, así que el
 * cuerpo se tomó de su propia redacción nueva para el directorio (pantalla 26),
 * que habla del mismo concepto y ya viene con el tono 2.0 (Pablo, 16-ago).
 */
const BENEFITS = [
  {
    emoji: "💬",
    bg: "bg-info-bg",
    title: "Orientación veterinaria 24/7",
    text: "Orientación veterinaria inmediata y personalizada, disponible desde el primer día de tu membresía.",
  },
  {
    emoji: "🐾",
    bg: "bg-warning-bg",
    title: "Reintegros",
    text: "Hasta $3,000 MXN en gastos veterinarios, $2,000 para momentos de despedida y $300 en vacunas. Proceso de reintegro en solo 72 hrs.",
  },
  {
    emoji: "📍",
    bg: "bg-success-bg",
    title: "Centros aliados (Próximamente)",
    text: "Clínicas, pet shops, hospedajes y más con beneficios para la manada en todo México.",
  },
];

const HOW_IT_WORKS = [
  "Vas a tu veterinario de confianza",
  "Subes la foto de la factura",
  "Transferimos tu reintegro en 72 hrs",
];

const NAV_LINKS = [
  { href: "/#beneficios", label: "Beneficios" },
  { href: "/centros", label: "Centros aliados" },
  { href: "/embajadores", label: "Embajadores" },
];

/* eslint-disable @next/next/no-img-element -- site_assets URLs are remote uploads */
function AssetOrPlaceholder({
  url,
  alt,
  className,
  placeholder,
  placeholderClassName,
}: {
  url: string | undefined;
  alt: string;
  className: string;
  placeholder: React.ReactNode;
  placeholderClassName: string;
}) {
  if (url) return <img src={url} alt={alt} className={className} />;
  return <div className={placeholderClassName}>{placeholder}</div>;
}

export default async function Home() {
  const [assets, settings] = await Promise.all([
    fetchSiteAssets(),
    fetchSiteSettings(),
  ]);
  const socials = [
    { network: "instagram", label: "Instagram", href: settings.social_instagram },
    { network: "facebook", label: "Facebook", href: settings.social_facebook },
    { network: "tiktok", label: "TikTok", href: settings.social_tiktok },
  ].filter((s) => s.href);

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-border-divider bg-white px-5 py-3.5 sm:px-8">
        <Link href="/">
          <Image
            src="/brand/logo-light-bg.svg"
            alt="Pata Amiga"
            width={124}
            height={44}
            className="h-11 w-auto"
            priority
          />
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold text-ink-body lg:gap-[26px]">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hidden transition-colors hover:text-teal-deep md:inline"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/iniciar-sesion"
            className="whitespace-nowrap text-teal-deep transition-colors hover:text-teal"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/registro"
            className="whitespace-nowrap rounded-full bg-teal px-4 py-2.5 font-bold text-white transition-colors hover:bg-teal-deep sm:px-[22px]"
          >
            <span className="hidden sm:inline">Únete a la manada</span>
            <span className="sm:hidden">Únete</span>
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative grid overflow-hidden bg-teal lg:min-h-[440px] lg:grid-cols-[1.1fr_1fr]">
        <div className="blob absolute -bottom-[120px] -left-[100px] size-[360px] bg-white/10" />
        <div className="relative flex flex-col justify-center gap-5 px-5 py-12 sm:px-14 lg:py-14">
          <h1 className="font-display text-[40px] leading-[1.02] text-white sm:text-[58px]">
            Salud y tranquilidad
            <br />
            para tu manada.
          </h1>
          <p className="max-w-[440px] text-[16px] leading-[1.55] text-white/[.92] sm:text-[17px]">
            Membresía de salud para tu peludo (michi o lomito) orgullosamente
            100% mexicana. Disfruta de orientación veterinaria 24/7, reintegros
            para gastos veterinarios y acceso a nuestra red de centros aliados.
            Mantienes a tu veterinario de confianza.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/registro"
              className="grid h-[54px] place-items-center rounded-full bg-white px-[30px] text-base font-bold text-teal-deep transition-colors hover:bg-cream-light"
            >
              Obtener mi membresía
            </Link>
            <Link
              href="/#planes"
              className="grid h-[54px] place-items-center px-2 text-[15px] font-semibold text-white underline underline-offset-4 sm:px-6"
            >
              Desde ${PLANS.monthly.amountMxn} MXN al mes
            </Link>
          </div>
        </div>
        {/* Bloque de foto del hero (wireframe del diseño 2a) */}
        <div className="relative hidden items-end justify-center lg:flex">
          <AssetOrPlaceholder
            url={assets["landing-hero"]}
            alt="Gato de la manada Pata Amiga mirando arriba"
            className="h-[86%] w-[88%] rounded-t-[24px] object-cover object-top"
            placeholderClassName="grid h-[86%] w-[88%] place-items-center rounded-t-[24px] border-2 border-dashed border-white/50 text-center text-[13px] font-semibold tracking-[.05em] text-white/75"
            placeholder={
              <>
                FOTO
                <br />
                lomito y michi mirando arriba
                <br />
                (recorte sobre teal)
              </>
            }
          />
        </div>
      </section>

      {/* Las 5 características — banda animada */}
      <BenefitsMarquee />

      {/* Beneficios */}
      <section
        id="beneficios"
        className="flex flex-col gap-8 px-5 py-12 sm:px-14"
      >
        <div className="text-center">
          <h2 className="font-display text-[30px] text-ink-title sm:text-4xl">
            Amor que deja huella
          </h2>
          <p className="mt-2 text-[15px] text-ink-secondary">
            Todo lo que tu peludo recibe al unirse a la manada.
          </p>
        </div>
        <div className="grid gap-[18px] md:grid-cols-3">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="flex flex-col gap-2.5 rounded-[20px] bg-white p-[26px] shadow-[0_2px_12px_rgba(30,83,80,.06)]"
            >
              <div
                className={`grid size-[52px] place-items-center rounded-[16px] text-2xl ${b.bg}`}
              >
                <span aria-hidden>{b.emoji}</span>
              </div>
              <h3 className="text-[17px] font-bold text-ink-title">
                {b.title}
              </h3>
              <p className="text-[13.5px] leading-[1.55] text-ink-secondary">
                {b.text}
              </p>
            </div>
          ))}
        </div>

        {/* Planes */}
        <div
          id="planes"
          className="grid items-center gap-[18px] rounded-[24px] bg-white p-6 shadow-[0_2px_12px_rgba(30,83,80,.06)] sm:p-8 lg:grid-cols-2"
        >
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-[26px] leading-tight text-ink-title sm:text-[30px]">
              Planes simples,
              <br />
              sin letras chiquitas
            </h2>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1 rounded-[16px] border-[1.5px] border-border-input p-4">
                <div className="text-[13px] font-bold text-ink-tertiary">
                  MENSUAL
                </div>
                <div className="font-display text-[28px] text-ink-title">
                  ${PLANS.monthly.amountMxn}{" "}
                  <span className="font-sans text-[13px] text-ink-tertiary">
                    MXN/mes
                  </span>
                </div>
              </div>
              <div className="relative flex-1 rounded-[16px] border-2 border-teal p-4">
                <span className="absolute -top-2.5 right-3 rounded-full bg-pink px-2.5 py-1 text-[10px] font-extrabold text-white">
                  {PLANS.annual.badge}
                </span>
                <div className="text-[13px] font-bold text-teal-deep">
                  ANUAL
                </div>
                <div className="font-display text-[28px] text-ink-title">
                  ${PLANS.annual.amountMxn.toLocaleString("es-MX")}{" "}
                  <span className="font-sans text-[13px] text-ink-tertiary">
                    MXN/año
                  </span>
                </div>
              </div>
            </div>
            <Link
              href="/registro"
              className="grid h-[52px] place-items-center rounded-full bg-teal text-[15px] font-bold text-white transition-colors hover:bg-teal-deep"
            >
              Ver planes completos
            </Link>
          </div>
          <AssetOrPlaceholder
            url={assets["landing-planes"]}
            alt="Tutora abrazando a su perro"
            className="hidden h-[280px] w-full rounded-[20px] object-cover lg:block"
            placeholderClassName="hidden h-[280px] place-items-center rounded-[20px] border-2 border-dashed border-[#C9C3B4] text-center text-[13px] font-semibold text-ink-placeholder lg:grid"
            placeholder={
              <>
                FOTO
                <br />
                tutora abrazando a su perro
                <br />
                (estilo brandbook)
              </>
            }
          />
        </div>
      </section>

      {/* ¿Cómo funciona? — mockup del registro móvil (o imagen del slot) */}
      <section className="bg-white px-5 py-14 sm:px-14">
        <div className="mx-auto grid max-w-[980px] items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div className="hidden lg:block">
            {assets["landing-como-funciona"] ? (
              <img
                src={assets["landing-como-funciona"]}
                alt="Así funciona el reintegro en Pata Amiga"
                className="mx-auto max-h-[460px] object-contain"
              />
            ) : (
              <PhoneMockup />
            )}
          </div>
          <div className="flex flex-col gap-7">
            <h2 className="font-display text-[30px] text-ink-title sm:text-4xl">
              ¿Cómo funciona?
            </h2>
            <ol className="flex flex-col gap-6">
              {HOW_IT_WORKS.map((step, i) => (
                <li key={step} className="flex items-center gap-4">
                  <span className="grid size-12 flex-none place-items-center rounded-full bg-teal-dark font-display text-[17px] text-white">
                    {i + 1}
                  </span>
                  <span className="text-[16px] font-semibold text-ink-body sm:text-[17px]">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
            <Link
              href="/registro"
              className="grid h-[52px] place-items-center self-start rounded-full bg-orange px-8 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
            >
              Únete a la manada
            </Link>
          </div>
        </div>
      </section>

      {/* Preguntas frecuentes */}
      <section id="faq" className="flex flex-col gap-8 px-5 py-14 sm:px-14">
        <div className="text-center">
          <h2 className="font-display text-[30px] text-ink-title sm:text-4xl">
            Preguntas frecuentes
          </h2>
          <p className="mt-2 text-[15px] text-ink-secondary">
            Resolvemos tus dudas de manera clara y directa.
          </p>
        </div>
        <div className="mx-auto w-full max-w-[860px]">
          <Faq />
        </div>
      </section>

      {/* Red veterinaria y de cuidado — fondo blanco, collage completo */}
      <section className="bg-white px-5 py-14 sm:px-14">
        <div className="mx-auto grid w-full max-w-[1060px] items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col items-start gap-4">
            <span className="text-[11px] font-extrabold tracking-[.08em] text-teal-deep">
              RED PATA AMIGA
            </span>
            <h2 className="font-display text-[30px] leading-tight text-ink-title sm:text-4xl">
              Red veterinaria
              <br />
              <span className="text-teal">y de cuidado (Próximamente)</span>
            </h2>
            <p className="max-w-[560px] text-[14.5px] leading-[1.55] text-ink-secondary">
              Estamos consolidando la red de cuidado más grande para nuestros
              peludos: clínicas veterinarias, hospitales y comercios
              pet-friendly que comparten nuestros valores de empatía y
              responsabilidad. Explora nuestros centros aliados o suma tu
              establecimiento a la manada hoy mismo.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/centros"
                className="grid h-[50px] place-items-center rounded-full bg-teal px-7 text-[14px] font-bold text-white transition-colors hover:bg-teal-deep"
              >
                Explorar centros aliados
              </Link>
              <Link
                href="/centros/registro"
                className="grid h-[50px] place-items-center rounded-full border-2 border-teal px-7 text-[14px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
              >
                Unirme como aliado
              </Link>
            </div>
          </div>
          {assets["landing-red"] ? (
            // Collage con fondo transparente — sin marco ni sombra
            <img
              src={assets["landing-red"]}
              alt="Peludos de la red Pata Amiga"
              className="mx-auto hidden max-h-[440px] w-full object-contain lg:block"
            />
          ) : (
            <div className="hidden h-[340px] place-items-center rounded-[24px] border-2 border-dashed border-[#C9C3B4] text-center text-[13px] font-semibold text-ink-placeholder lg:grid">
              FOTO
              <br />
              peludos de la red
              <br />
              (collage con fondo transparente)
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto flex flex-col gap-9 bg-teal-dark px-5 pb-8 pt-12 sm:px-14">
        <div className="mx-auto grid w-full max-w-[980px] gap-9 border-b border-white/10 pb-9 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-[22px] text-white">Contáctanos</h3>
            <a
              href={`mailto:${settings.contact_email}`}
              className="text-sm font-semibold text-white/85 transition-colors hover:text-white"
            >
              ✉️ {settings.contact_email}
            </a>
            <div className="flex gap-3">
              {socials.map((s) => (
                <a
                  key={s.network}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className="grid size-10 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <SocialIcon network={s.network} />
                </a>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-[22px] text-white">Suscríbete</h3>
            <NewsletterForm />
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-[980px] gap-9 border-b border-white/10 pb-9 sm:grid-cols-2 md:grid-cols-3">
          <div className="flex flex-col gap-2.5">
            <span className="text-[11px] font-extrabold tracking-[.08em] text-white/50">
              LEGAL
            </span>
            {/* Solo los que ya tienen texto: el pie enlazaba "Convenio
                asociado", que sigue en manos de legal, y el visitante caía en
                un aviso de "en preparación" (hallazgo 7-ago). Cuando llegue
                su texto a legal-texts.ts aparece solo, sin tocar esto. */}
            {LEGAL_DOCS.filter((doc) => LEGAL_TEXTS[doc.slug]).map((doc) => (
              <Link
                key={doc.slug}
                href={`/legales/${doc.slug}`}
                className="text-[13px] text-white/75 transition-colors hover:text-white"
              >
                {doc.title}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[11px] font-extrabold tracking-[.08em] text-white/50">
              INFORMACIÓN
            </span>
            <Link
              href="/#beneficios"
              className="text-[13px] text-white/75 transition-colors hover:text-white"
            >
              Beneficios
            </Link>
            <Link
              href="/#faq"
              className="text-[13px] text-white/75 transition-colors hover:text-white"
            >
              Dudas frecuentes
            </Link>
            <a
              href={`mailto:${settings.contact_email}`}
              className="text-[13px] text-white/75 transition-colors hover:text-white"
            >
              Contacto
            </a>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[11px] font-extrabold tracking-[.08em] text-white/50">
              COMUNIDAD
            </span>
            <Link
              href="/centros"
              className="text-[13px] text-white/75 transition-colors hover:text-white"
            >
              Centros aliados
            </Link>
            <Link
              href="/centros/registro"
              className="text-[13px] text-white/75 transition-colors hover:text-white"
            >
              Quiero ser centro aliado
            </Link>
            <Link
              href="/embajadores"
              className="text-[13px] text-white/75 transition-colors hover:text-white"
            >
              Quiero ser embajador
            </Link>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[980px] flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Image
            src="/brand/logo-on-dark.svg"
            alt="Pata Amiga"
            width={99}
            height={35}
            className="h-[35px] w-auto"
          />
          <p className="text-xs text-white/55">{COMPANY_LINE}</p>
        </div>
      </footer>
    </div>
  );
}
