import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  APPEAL_MAX_PER_SUBJECT,
  REIMBURSEMENT_CATEGORY_LABELS,
} from "@/lib/constants";
import { DOC_TYPE_LABELS, type ReimbursementDocType } from "@/lib/reimbursement-docs";
import { formatMxn } from "@/lib/format";
import { formatDateEs } from "@/lib/dates";
import { AppealButton } from "@/components/app/AppealButton";
import {
  ReimbursementThread,
  type ReimbursementMessage,
} from "./ReimbursementThread";
import { firmarAdjuntosDeHilo } from "@/lib/documentos-conversacion";

const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  pending: { text: "EN REVISIÓN", cls: "bg-warning-bg text-warning-text" },
  in_review: { text: "EN REVISIÓN", cls: "bg-warning-bg text-warning-text" },
  approved: { text: "✓ APROBADO", cls: "bg-success-bg text-success-text" },
  partial: { text: "✓ APROBADO PARCIAL", cls: "bg-success-bg text-success-text" },
  rejected: { text: "DENEGADO", cls: "bg-error-bg text-error-text" },
  paid: { text: "✓ PAGADO", cls: "bg-info-bg text-info-text" },
};

type StoredDoc = { type: ReimbursementDocType; path: string; name: string };

/** Detalle de una solicitud: montos, documentos tipados e hilo con el comité. */
export default async function ReintegroDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/reintegros");

  const [{ data: req }, { data: messages }, { data: appeals }] =
    await Promise.all([
      supabase
        .from("reimbursements")
        .select(
          "id, folio, category, amount_requested, amount_approved, total_paid_amount, status, rejection_reason, service_date, description, clabe, bank_holder, clinic_name, vet_name, vet_license, invoice_urls, documents, created_at, resolved_at, paid_at, pets(name, species)",
        )
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("reimbursement_messages")
        .select("id, sender, message, documents, created_at")
        .eq("reimbursement_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("appeals")
        .select("id, folio, status")
        .eq("user_id", user.id)
        .eq("reimbursement_id", id),
    ]);
  if (!req) notFound();

  const chip = STATUS_CHIP[req.status] ?? STATUS_CHIP.pending;
  const pet = Array.isArray(req.pets)
    ? (req.pets[0] as { name: string; species: string } | undefined)
    : (req.pets as { name: string; species: string } | null);

  // Documentos tipados (nuevo esquema) o facturas planas (solicitudes previas)
  const storedDocs = (req.documents ?? []) as StoredDoc[];
  const legacyPaths = storedDocs.length
    ? []
    : (req.invoice_urls ?? []).map((p: string, i: number) => ({
        type: "receipt" as const,
        path: p,
        name: `Factura ${i + 1}`,
      }));
  const allDocs = [...storedDocs, ...legacyPaths];

  const docsWithUrls = await Promise.all(
    allDocs.map(async (d) => {
      const { data } = await supabase.storage
        .from("reimbursement-invoices")
        .createSignedUrl(d.path, 60 * 60);
      return { ...d, url: data?.signedUrl ?? null };
    }),
  );

  const thread = (messages ?? []) as ReimbursementMessage[];
  const showThread = thread.some((m) => m.sender === "admin");
  // Los adjuntos del hilo se firman aquí: el bucket es privado y el miembro no
  // puede leer directo lo que subió el comité (vive en la carpeta del admin).
  const adjuntosDelHilo = Object.fromEntries(
    await firmarAdjuntosDeHilo(
      (messages ?? []) as { id: string; documents?: unknown }[],
    ),
  );
  const pendingAppeal = (appeals ?? []).find((a) => a.status === "pending");

  const rows: { label: string; value: string | null }[] = [
    {
      label: "Motivo",
      value:
        REIMBURSEMENT_CATEGORY_LABELS[
          req.category as keyof typeof REIMBURSEMENT_CATEGORY_LABELS
        ] ?? req.category,
    },
    { label: "Peludo", value: pet?.name ?? null },
    {
      label: "Monto solicitado",
      value: `${formatMxn(Number(req.amount_requested))} MXN`,
    },
    {
      label: "Monto aprobado",
      value:
        req.amount_approved != null
          ? `${formatMxn(Number(req.amount_approved))} MXN`
          : "Por resolver",
    },
    {
      label: "Total que pagaste",
      value:
        req.total_paid_amount != null
          ? `${formatMxn(Number(req.total_paid_amount))} MXN`
          : null,
    },
    {
      label: "Fecha de atención",
      value: req.service_date ? formatDateEs(req.service_date) : null,
    },
    { label: "Clínica / veterinaria", value: req.clinic_name },
    {
      label: "Veterinario",
      value: req.vet_name
        ? `${req.vet_name}${req.vet_license ? ` · Céd. ${req.vet_license}` : ""}`
        : null,
    },
    {
      label: "CLABE",
      value: req.clabe ? `···· ${req.clabe.slice(-4)}` : null,
    },
    { label: "Titular de la cuenta", value: req.bank_holder },
    {
      label: "Solicitado",
      value: formatDateEs(new Date(req.created_at)),
    },
    {
      label: "Resuelto",
      value: req.resolved_at ? formatDateEs(new Date(req.resolved_at)) : null,
    },
    {
      label: "Pagado",
      value: req.paid_at ? formatDateEs(new Date(req.paid_at)) : null,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-5 py-6 md:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/app/reintegros"
          className="text-sm font-semibold text-teal-deep"
        >
          ← Reintegros
        </Link>
        <h1 className="font-display text-[28px] text-ink-title">{req.folio}</h1>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${chip.cls}`}
        >
          {chip.text}
        </span>
      </div>

      {req.status === "rejected" && req.rejection_reason && (
        <div className="rounded-[14px] bg-error-bg px-4 py-3 text-[13.5px] leading-relaxed text-error-text">
          <strong>Motivo de la denegación:</strong> {req.rejection_reason}
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          DETALLE DE TU SOLICITUD
        </span>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
          {rows
            .filter((r) => r.value)
            .map((r) => (
              <div key={r.label} className="flex flex-col">
                <span className="text-[11px] font-extrabold tracking-[.05em] text-ink-tertiary">
                  {r.label.toUpperCase()}
                </span>
                <span className="text-sm text-ink-body">{r.value}</span>
              </div>
            ))}
        </div>
        {req.description && (
          <p className="rounded-[12px] bg-cream px-4 py-3 text-[13px] leading-relaxed text-ink-body">
            {req.description}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          TUS DOCUMENTOS
        </span>
        {docsWithUrls.length > 0 ? (
          docsWithUrls.map((d, i) => (
            <div
              key={`${d.path}-${i}`}
              className="flex items-center gap-2.5 rounded-[12px] border-[1.5px] border-border-input px-3.5 py-2.5"
            >
              <span className="flex-1 text-[12.5px] font-semibold text-ink-title">
                {DOC_TYPE_LABELS[d.type as ReimbursementDocType] ?? d.type}
                <span className="block text-[11px] font-normal text-ink-tertiary">
                  {d.name}
                </span>
              </span>
              {d.url && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11.5px] font-bold text-teal-deep hover:underline"
                >
                  Ver
                </a>
              )}
            </div>
          ))
        ) : (
          <span className="text-[13px] text-ink-secondary">
            Sin documentos adjuntos.
          </span>
        )}
      </section>

      {req.status === "rejected" &&
        (pendingAppeal ? (
          <span className="self-start rounded-full bg-info-bg px-3 py-1 text-[11px] font-extrabold tracking-[.04em] text-info-text">
            APELACIÓN {pendingAppeal.folio} EN REVISIÓN
          </span>
        ) : (appeals ?? []).length < APPEAL_MAX_PER_SUBJECT ? (
          <AppealButton
            reimbursementId={req.id}
            subjectLabel={`el reintegro ${req.folio}`}
          />
        ) : null)}

      {/* Hilo con el comité — visible solo cuando el comité ya escribió */}
      {showThread && (
        <ReimbursementThread
          reimbursementId={req.id}
          thread={thread}
          adjuntos={adjuntosDelHilo}
        />
      )}
    </div>
  );
}
