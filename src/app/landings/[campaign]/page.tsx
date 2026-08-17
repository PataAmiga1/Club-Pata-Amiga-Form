import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/landings";
import { BenefitsMarquee } from "@/components/landing/BenefitsMarquee";
import { LeadForm } from "./LeadForm";

/**
 * Landing de campaña (ads / patrocinadores) — página de conversión aislada
 * del sitio principal: sin menú, un solo objetivo (registrarse y recibir el
 * regalo). Los leads caen en campaign_leads y el CRM está en /admin/landings.
 */

type Params = { params: Promise<{ campaign: string }> };
type SearchParams = {
  searchParams: Promise<{
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { campaign } = await params;
  const c = getCampaign(campaign);
  return {
    title: c ? `${c.headline} · Club Pata Amiga` : "Club Pata Amiga",
    description: c?.subheadline,
    // Página de campaña: que no compita con el sitio en buscadores
    robots: { index: false },
  };
}

export default async function CampaignLandingPage({
  params,
  searchParams,
}: Params & SearchParams) {
  const { campaign: slug } = await params;
  const { utm_source, utm_medium, utm_campaign } = await searchParams;
  const campaign = getCampaign(slug);
  if (!campaign || !campaign.active) notFound();

  return (
    <div className="flex min-h-dvh flex-col bg-teal">
      {/* Logo solo — sin navegación para no fugar la conversión */}
      <header className="flex justify-center px-5 pb-2 pt-7">
        <Image
          src="/brand/logo-on-dark.svg"
          alt="Club Pata Amiga"
          width={150}
          height={53}
          className="h-[53px] w-auto"
          priority
        />
      </header>

      <main className="relative flex flex-1 flex-col items-center overflow-hidden px-5 pb-14 pt-6">
        <div className="blob absolute -left-[110px] top-[30%] size-[340px] bg-white/10" />
        <div className="blob absolute -right-[90px] -top-[70px] size-[260px] bg-white/10" />

        <div className="relative flex w-full max-w-[520px] flex-col items-center gap-5 text-center">
          <h1 className="font-display text-[34px] leading-[1.08] text-white sm:text-[42px]">
            {campaign.headline}
          </h1>
          <p className="max-w-[440px] text-[15px] leading-[1.55] text-white/90">
            {campaign.subheadline}
          </p>

          {/* Lo que recibes */}
          <div className="flex w-full flex-col gap-2 rounded-[18px] bg-white/10 p-4 text-left">
            {campaign.perks.map((perk) => (
              <div
                key={perk.text}
                className="flex items-center gap-3 text-[14px] font-semibold text-white"
              >
                <span className="text-[18px]" aria-hidden>
                  {perk.emoji}
                </span>
                {perk.text}
              </div>
            ))}
          </div>

          <LeadForm
            campaign={campaign.slug}
            utm={{
              source: utm_source,
              medium: utm_medium,
              campaign: utm_campaign,
            }}
          />

          <p className="max-w-[420px] text-[11.5px] leading-relaxed text-white/60">
            Membresía de salud para tu peludo — no es un seguro. Tus datos solo
            se usan para enviarte tu regalo y novedades de Club Pata Amiga.
          </p>
        </div>
      </main>

      <BenefitsMarquee />
    </div>
  );
}
