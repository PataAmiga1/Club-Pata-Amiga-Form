import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public/PublicHeader";
import { LEGAL_DOCS } from "@/lib/site";
import { LEGAL_TEXTS } from "@/data/legal-texts";
import { limpiarMarcasLegales } from "@/lib/legal-format";

/**
 * Placeholder de documentos legales — la redacción final llega en el
 * milestone de legales (los textos los proporciona el equipo).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  return { title: doc ? `${doc.title} · Club Pata Amiga` : "Club Pata Amiga" };
}

export default async function LegalDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  if (!doc) notFound();

  const text = LEGAL_TEXTS[slug];

  return (
    <div className="min-h-dvh bg-cream">
      <PublicHeader />
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-5 py-12">
        <h1 className="font-display text-[30px] text-ink-title">{doc.title}</h1>
        {text ? (
          <div className="whitespace-pre-line rounded-[18px] bg-white p-6 text-[13.5px] leading-relaxed text-ink-body shadow-[0_2px_12px_rgba(30,83,80,.06)] sm:p-8">
            {limpiarMarcasLegales(text)}
          </div>
        ) : (
          <div className="rounded-[18px] bg-white p-6 text-sm leading-relaxed text-ink-secondary shadow-[0_2px_12px_rgba(30,83,80,.06)]">
            Este documento está en preparación y estará disponible antes del
            lanzamiento. Si tienes dudas mientras tanto, escríbenos a{" "}
            <a
              href="mailto:soporte@pataamiga.mx"
              className="font-semibold text-teal-deep"
            >
              soporte@pataamiga.mx
            </a>
            .
          </div>
        )}
        <Link href="/" className="text-sm font-semibold text-teal-deep">
          ← Volver al inicio
        </Link>
      </div>
    </div>
  );
}
