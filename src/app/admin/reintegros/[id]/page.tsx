import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  REIMBURSEMENT_CAPS_MXN,
  REIMBURSEMENT_CATEGORY_LABELS,
  REIMBURSEMENT_SLA_HOURS,
} from "@/lib/constants";
import { formatMxn, hoursSince } from "@/lib/format";
import { formatDateEs, waitingProgress } from "@/lib/dates";
import { ResolutionPanel } from "./ResolutionPanel";
import { ThreadPanel } from "./ThreadPanel";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: req } = await admin
    .from("reimbursements")
    .select(
      "id, folio, category, amount_requested, amount_approved, total_paid_amount, status, rejection_reason, service_date, clabe, bank_holder, clinic_name, vet_name, vet_license, invoice_urls, documents, created_at, user_id, pet_id, pets(name, species, breed, age_years, approval_status, waiting_period_end_date, waiting_period_start_date, waiting_period_bypassed, created_at), profiles!user_id(first_name, last_name, email, member_since)",
    )
    .eq("id", id)
    .single();
  if (!req) notFound();

  const { data: threadRows } = await admin
    .from("reimbursement_messages")
    .select("id, sender, message, created_at")
    .eq("reimbursement_id", id)
    .order("created_at", { ascending: true });

  const pet = (Array.isArray(req.pets) ? req.pets[0] : req.pets) as {
    name: string;
    species: "dog" | "cat";
    breed: string | null;
    age_years: number | null;
    approval_status: string;
    waiting_period_end_date: string | null;
    waiting_period_start_date: string | null;
    waiting_period_bypassed: boolean;
    created_at: string;
  };
  const member = (Array.isArray(req.profiles) ? req.profiles[0] : req.profiles) as {
    first_name: string | null;
    last_name: string | null;
    email: string;
    member_since: string | null;
  };

  // Am I super admin? (for the bypass card)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  const isSuperAdmin = myProfile?.role === "super_admin";

  const wait = waitingProgress(
    pet.created_at,
    pet.waiting_period_end_date,
    pet.waiting_period_bypassed,
    pet.waiting_period_start_date,
  );
  const cap = REIMBURSEMENT_CAPS_MXN[req.category as keyof typeof REIMBURSEMENT_CAPS_MXN];

  // Cap already consumed this year for this pet+category
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const { data: history } = await admin
    .from("reimbursements")
    .select("folio, category, amount_approved, status, created_at")
    .eq("pet_id", req.pet_id)
    .neq("id", req.id)
    .gte("created_at", yearStart)
    .order("created_at", { ascending: false });

  const consumed = (history ?? [])
    .filter(
      (h) =>
        h.category === req.category &&
        ["approved", "partial", "paid"].includes(h.status),
    )
    .reduce((acc, h) => acc + Number(h.amount_approved ?? 0), 0);
  const capLeft = Math.max(cap - consumed, 0);

  const hrs = hoursSince(req.created_at);
  const open = req.status === "pending" || req.status === "in_review";
  const memberLabel = member.first_name
    ? `${member.first_name} ${member.last_name ?? ""}`.trim()
    : member.email;

  // Signed URLs for the private invoice files
  const invoiceLinks = await Promise.all(
    (req.invoice_urls ?? []).map(async (path: string) => {
      const { data } = await admin.storage
        .from("reimbursement-invoices")
        .createSignedUrl(path, 3600);
      return { name: path.split("/").pop() ?? "factura", url: data?.signedUrl };
    }),
  );

  return (
    <div className="flex flex-col gap-[18px] px-5 py-6 md:px-[34px] md:py-[30px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 text-[13px] font-semibold text-ink-tertiary">
          <Link href="/admin/reintegros" className="text-teal-deep">
            Reintegros
          </Link>
          <span>›</span>
          <span className="font-bold text-ink-title">Folio {req.folio}</span>
          {open && hrs >= REIMBURSEMENT_SLA_HOURS - 8 && (
            <span className="rounded-full bg-error-bg px-2.5 py-1 text-[10.5px] font-extrabold text-error-text">
              VENCE EN {Math.max(REIMBURSEMENT_SLA_HOURS - hrs, 0)} HRS
            </span>
          )}
        </div>
        <span className="text-[12.5px] text-ink-tertiary">
          Recibida el {formatDateEs(new Date(req.created_at))}
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* Context card */}
          <div className="flex flex-col gap-3.5 rounded-[18px] bg-white p-[22px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            <div className="flex items-center gap-3.5">
              <div className="grid size-[54px] flex-none place-items-center rounded-[16px] bg-info-bg text-[22px]">
                {pet.species === "dog" ? "🐕" : "🐈"}
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-base font-bold text-ink-title">
                  {pet.name}
                  {pet.breed ? ` · ${pet.breed}` : ""}
                  {pet.age_years ? ` · ${pet.age_years} años` : ""}
                </span>
                <span className="text-[12.5px] text-ink-tertiary">
                  {memberLabel}
                  {member.member_since
                    ? ` · miembro desde ${formatDateEs(new Date(member.member_since))}`
                    : ""}
                  {wait.done ? " · período de espera cumplido ✓" : ` · en espera (${wait.elapsed}/${wait.total})`}
                </span>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold ${
                  pet.approval_status === "approved"
                    ? "bg-success-bg text-success-text"
                    : "bg-warning-bg text-warning-text"
                }`}
              >
                {pet.approval_status === "approved" ? "APROBADO" : "EN REVISIÓN"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="flex flex-col gap-0.5 rounded-[12px] bg-cream p-3">
                <span className="text-[10.5px] font-bold text-ink-tertiary">TIPO</span>
                <span className="text-sm font-bold text-ink-title">
                  {REIMBURSEMENT_CATEGORY_LABELS[
                    req.category as keyof typeof REIMBURSEMENT_CATEGORY_LABELS
                  ]}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[12px] bg-cream p-3">
                <span className="text-[10.5px] font-bold text-ink-tertiary">
                  MONTO SOLICITADO
                </span>
                <span className="text-sm font-bold text-ink-title">
                  {formatMxn(Number(req.amount_requested))} MXN
                </span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[12px] bg-cream p-3">
                <span className="text-[10.5px] font-bold text-ink-tertiary">
                  TOPE DISPONIBLE
                </span>
                <span
                  className={`text-sm font-bold ${Number(req.amount_requested) <= capLeft ? "text-teal-deep" : "text-error-text"}`}
                >
                  {formatMxn(capLeft)} MXN{" "}
                  {Number(req.amount_requested) <= capLeft ? "✓" : "⚠"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-extrabold tracking-[.05em] text-ink-tertiary">
                DOCUMENTOS
              </span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {invoiceLinks.map((doc) => (
                  <a
                    key={doc.name}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-[12px] border-[1.5px] border-border-input p-3 transition-colors hover:border-teal"
                  >
                    <span className="text-lg" aria-hidden>
                      📄
                    </span>
                    <span className="flex-1 truncate text-[12.5px] font-bold text-ink-title">
                      {doc.name}
                    </span>
                    <span className="text-xs font-bold text-teal-deep">Ver</span>
                  </a>
                ))}
                {invoiceLinks.length === 0 && (
                  <span className="text-sm text-ink-secondary">
                    Sin documentos adjuntos.
                  </span>
                )}
              </div>
            </div>
            <div className="text-[12.5px] text-ink-tertiary">
              Fecha de atención:{" "}
              {req.service_date ? formatDateEs(req.service_date) : "—"} · CLABE
              ···· {String(req.clabe ?? "").slice(-4)}
            </div>
          </div>

          {/* Pet history */}
          <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-[22px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            <span className="text-xs font-extrabold tracking-[.05em] text-ink-tertiary">
              HISTORIAL DE ESTA MASCOTA (AÑO EN CURSO)
            </span>
            {(history ?? []).map((h) => (
              <div
                key={h.folio}
                className="flex items-center gap-3 border-b border-[#F2EEE4] py-2 text-[12.5px] text-ink-body last:border-0"
              >
                <span className="font-bold text-teal-deep">{h.folio}</span>
                <span className="flex-1">
                  {REIMBURSEMENT_CATEGORY_LABELS[
                    h.category as keyof typeof REIMBURSEMENT_CATEGORY_LABELS
                  ]}{" "}
                  · {formatMxn(Number(h.amount_approved ?? 0))} · {h.status}
                </span>
                <span className="text-ink-placeholder">
                  {formatDateEs(new Date(h.created_at))}
                </span>
              </div>
            ))}
            {(history ?? []).length === 0 && (
              <span className="text-[12.5px] text-ink-tertiary">
                Sin más solicitudes este año.
              </span>
            )}
          </div>
        </div>

        {/* Resolution */}
        <ResolutionPanel
          reimbursementId={req.id}
          petId={req.pet_id}
          status={req.status}
          amountRequested={Number(req.amount_requested)}
          amountApproved={
            req.amount_approved != null ? Number(req.amount_approved) : null
          }
          rejectionReason={req.rejection_reason}
          clabeLast4={String(req.clabe ?? "").slice(-4)}
          isSuperAdmin={isSuperAdmin}
          waitingDone={wait.done}
        />

        {/* Conversación separada por área: este hilo pertenece SOLO a esta solicitud */}
        <ThreadPanel
          reimbursementId={req.id}
          thread={(threadRows ?? []) as {
            id: string;
            sender: "admin" | "member";
            message: string;
            created_at: string;
          }[]}
        />
      </div>
    </div>
  );
}
