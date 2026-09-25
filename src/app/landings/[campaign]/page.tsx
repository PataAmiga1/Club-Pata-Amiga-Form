import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCampaign, campaignPdfSlot } from "@/lib/landings";
import { createAdminClient } from "@/lib/supabase/admin";
import { BenefitsMarquee } from "@/components/landing/BenefitsMarquee";
import { ALTAS_SON_599 } from "@/lib/plans/planes";
import { StashAmbassadorCode } from "@/components/registro/StashAmbassadorCode";
import { LeadForm } from "./LeadForm";
import { SurveyForm } from "./SurveyForm";

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
    /** `?kiosco=1`: la tablet del stand; el formulario se limpia solo. */
    kiosco?: string;
    /** Las ligas de encuesta llegan prellenadas desde el DM. */
    nombre?: string;
    correo?: string;
    handle?: string;
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
  const { utm_source, utm_medium, utm_campaign, kiosco, nombre, correo, handle } =
    await searchParams;
  const campaign = getCampaign(slug);
  if (!campaign || !campaign.active) notFound();

  // Las landings de guía dejan bajar el PDF al terminar el registro.
  const pdfUrl =
    campaign.tipo === "guia"
      ? ((
          await createAdminClient()
            .from("site_assets")
            .select("url")
            .eq("slot", campaignPdfSlot(campaign.slug))
            .maybeSingle()
        ).data?.url ?? null)
      : null;

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

          {/* La escalera, explicada antes de preguntar: para casi todos es la
              primera vez que la ven, y nadie opina bien de lo que no entiende
              (equipo, 24-sep-2026). */}
          {campaign.explicacion && (
            <section className="flex w-full flex-col gap-4 rounded-[20px] bg-white p-5 text-left shadow-[0_16px_44px_rgba(30,83,80,.25)] sm:p-6">
              <div className="flex flex-col gap-1.5">
                <h2 className="font-display text-[22px] leading-tight text-ink-title">
                  {campaign.explicacion.titulo}
                </h2>
                <p className="text-[14px] leading-relaxed text-ink-secondary">
                  {campaign.explicacion.intro}
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                {campaign.explicacion.escalones.map((e, i) => (
                  <div
                    key={e.nivel}
                    className="flex items-start gap-3 rounded-[14px] border-[1.5px] border-border-input p-3.5"
                  >
                    <span
                      className="grid size-[46px] flex-none place-items-center rounded-[12px] bg-info-bg text-center text-[13px] font-extrabold leading-tight text-teal-deep"
                      aria-hidden
                    >
                      {e.meta.split(" ")[0]}
                      <span className="block text-[9.5px] font-bold tracking-[.04em]">
                        {e.meta.split(" ")[1]?.toUpperCase()}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[11px] font-extrabold tracking-[.06em] text-ink-tertiary">
                        NIVEL {i + 1} · {e.nivel.toUpperCase()}
                      </span>
                      <span className="text-[15px] font-bold leading-snug text-ink-title">
                        {e.premio}
                      </span>
                      {e.extra && (
                        <span className="text-[12.5px] leading-snug text-ink-secondary">
                          {e.extra}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 rounded-[14px] bg-cream p-4">
                <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
                  CÓMO FUNCIONA
                </span>
                {campaign.explicacion.reglas.map((r) => (
                  <span key={r} className="flex gap-2.5 text-[13px] leading-snug text-ink-body">
                    <span className="font-extrabold text-teal" aria-hidden>
                      ✓
                    </span>
                    {r}
                  </span>
                ))}
              </div>

              {campaign.explicacion.cierre && (
                <p className="rounded-[12px] bg-warning-bg px-4 py-3 text-[13px] leading-snug text-warning-text">
                  {campaign.explicacion.cierre}
                </p>
              )}
            </section>
          )}

          {/* Links de embajador redirigidos desde /registro?codigo=… */}
          <StashAmbassadorCode />
          {campaign.tipo === "encuesta" ? (
            <SurveyForm
              campaign={campaign.slug}
              preguntas={campaign.preguntas ?? []}
              botonLabel={campaign.botonLabel}
              gracias={campaign.gracias}
              prellenado={{ nombre, correo, handle }}
              pideHandle={campaign.campos?.handle === true}
              correoObligatorio={campaign.campos?.correo !== false}
              utm={{
                source: utm_source,
                medium: utm_medium,
                campaign: utm_campaign,
              }}
            />
          ) : (
          <LeadForm
            campaign={campaign.slug}
            tipo={campaign.tipo}
            campos={campaign.campos}
            pdfUrl={pdfUrl}
            pdfLabel={campaign.pdfLabel}
            kiosco={kiosco === "1"}
            utm={{
              source: utm_source,
              medium: utm_medium,
              campaign: utm_campaign,
            }}
          />
          )}

          <p className="max-w-[420px] text-[11.5px] leading-relaxed text-white/60">
            Membresía de salud para tu peludo — no es un seguro. Tus datos solo
            se usan para{" "}
            {campaign.tipo === "lista_espera"
              ? "avisarte cuando abra el registro"
              : campaign.tipo === "guia"
                ? "enviarte tu guía"
                : campaign.tipo === "encuesta"
                  ? "tomar en cuenta tu opinión"
                  : "enviarte tu regalo"}{" "}
            y novedades de Club Pata Amiga.
          </p>
        </div>
      </main>

      {/* La banda del $159 dice «hasta 3 peludos», que ya no aplica a la
          membresía nueva: en la lista de espera no se muestra. Con las altas
          del $599 la banda ya trae su propia tercera característica. */}
      {campaign.tipo !== "encuesta" && (campaign.tipo !== "lista_espera" || ALTAS_SON_599) && (
        <BenefitsMarquee es599={ALTAS_SON_599} />
      )}
    </div>
  );
}
