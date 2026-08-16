"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import {
  REIMBURSEMENT_CAPS_MXN,
  REIMBURSEMENT_SLA_HOURS,
} from "@/lib/constants";
import type { CategoryBalance } from "@/lib/reimbursement-balance";
import {
  AMOUNT_LABEL_BY_CATEGORY,
  BANK_HOLDER_NOTICE,
  DATE_LABEL_BY_CATEGORY,
  DOCS_BY_CATEGORY,
  type ReimbursementDocType,
} from "@/lib/reimbursement-docs";
import { formatMxn } from "@/lib/format";
import { hoyEnMexico } from "@/lib/zona-horaria";
import { notifyReimbursementSubmitted } from "./actions";

export type EligiblePet = {
  id: string;
  name: string;
  species: "dog" | "cat";
  eligible: boolean;
  waitLabel: string;
  pendingApproval: boolean;
};

type Category = keyof typeof REIMBURSEMENT_CAPS_MXN;

const CATEGORIES: {
  key: Category;
  title: string;
  note: string;
}[] = [
  {
    key: "vet_expenses",
    title: "GASTOS VETERINARIOS",
    note: "Urgencias, análisis y estudios, cirugía y hospitalización",
  },
  { key: "death", title: "FALLECIMIENTO", note: "Gastos funerarios de tu peludo" },
  { key: "vaccines", title: "VACUNAS", note: "Esquema de vacunación al día" },
];

export function RequestForm({
  userId,
  pets,
  lastClabe,
  holderName,
  balances,
  blocked,
}: {
  userId: string;
  pets: EligiblePet[];
  lastClabe: string;
  holderName: string;
  balances: Record<Category, CategoryBalance>;
  blocked: boolean;
}) {
  const [category, setCategory] = useState<Category>("vet_expenses");
  const [petId, setPetId] = useState(pets.find((p) => p.eligible)?.id ?? "");
  const [amount, setAmount] = useState("");
  const [totalPaid, setTotalPaid] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [vetName, setVetName] = useState("");
  const [vetLicense, setVetLicense] = useState("");
  const [files, setFiles] = useState<
    Partial<Record<ReimbursementDocType, File | null>>
  >({});
  const [clabe, setClabe] = useState(lastClabe);
  const [holder, setHolder] = useState(holderName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRefs = useRef<Partial<Record<ReimbursementDocType, HTMLInputElement | null>>>({});

  const balance = balances[category];
  const docSlots = DOCS_BY_CATEGORY[category] ?? [];


  /**
   * ¿Hay al menos un peludo que HOY pueda pedir un reintegro?
   *
   * Con todos en tiempo de espera el formulario se desplegaba completo y se
   * dejaba llenar entero para nada: al final no había a quién asignárselo
   * (equipo, 15-ago). Ahora ni siquiera se pinta.
   */
  const hayPeludoDisponible = pets.some((p) => p.eligible);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNum = parseFloat(amount.replace(/[^0-9.]/g, ""));
    const totalPaidNum = parseFloat(totalPaid.replace(/[^0-9.]/g, ""));
    if (!petId) return setError("Elige a tu peludo.");
    if (Number.isNaN(amountNum) || amountNum <= 0)
      return setError("Indica el monto que solicitas.");
    if (amountNum > balance.available)
      return setError(
        `El monto solicitado (${formatMxn(amountNum)}) excede tu disponible de este año para este apoyo (${formatMxn(balance.available)} MXN).`,
      );
    if (!serviceDate) return setError("Indica la fecha.");
    if (!clinicName.trim())
      return setError("Indica en qué veterinaria o clínica lo atendieron.");
    if (!vetName.trim())
      return setError("Escribe el nombre del médico veterinario que lo atendió.");
    if (!vetLicense.trim())
      return setError("Escribe la cédula profesional del veterinario.");
    if (!files.evidence_photo)
      return setError(`Sube: ${docSlots[0]?.label ?? "la evidencia"}.`);
    if (!files.receipt)
      return setError(`Sube: ${docSlots[2]?.label ?? "la factura o comprobante"}.`);
    if (!/^\d{18}$/.test(clabe.replace(/\s/g, "")))
      return setError("La CLABE debe tener 18 dígitos.");
    if (!holder.trim())
      return setError("Escribe el nombre del titular de la cuenta.");

    setLoading(true);
    const supabase = createClient();

    // Subir cada documento catalogado con su tipo
    const documents: { type: ReimbursementDocType; path: string; name: string }[] = [];
    for (const slot of docSlots) {
      const file = files[slot.type];
      if (!file) continue;
      // eslint-disable-next-line react-hooks/purity -- corre en el submit, no en render
      const path = `${userId}/${Date.now()}-${slot.type}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("reimbursement-invoices")
        .upload(path, file);
      if (upErr) {
        setError(`No pudimos subir "${slot.label}". Intenta de nuevo.`);
        setLoading(false);
        return;
      }
      documents.push({ type: slot.type, path, name: file.name });
    }

    const { error: insErr } = await supabase.from("reimbursements").insert({
      user_id: userId,
      pet_id: petId,
      category,
      amount_requested: amountNum,
      total_paid_amount: Number.isNaN(totalPaidNum) ? null : totalPaidNum,
      service_date: serviceDate,
      documents,
      invoice_urls: documents.map((d) => d.path),
      clabe: clabe.replace(/\s/g, ""),
      bank_holder: holder.trim(),
      clinic_name: clinicName.trim() || null,
      vet_name: vetName.trim() || null,
      vet_license: vetLicense.trim() || null,
    });
    if (insErr) {
      setError("No pudimos enviar tu solicitud. Intenta de nuevo.");
      setLoading(false);
      return;
    }
    // Aviso al comité (no bloquea la navegación si falla)
    notifyReimbursementSubmitted().catch(() => {});
    // De regreso a la lista, con confirmación
    window.location.assign("/app/reintegros?enviada=1");
  }

  return (
    <>
      {/* Category cards con disponible del año */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        {CATEGORIES.map((c) => {
          const b = balances[c.key];
          const exhausted = b.available <= 0;
          return (
            <button
              key={c.key}
              type="button"
              disabled={exhausted}
              onClick={() => {
                setCategory(c.key);
                setFiles({});
              }}
              className={`flex flex-1 flex-col gap-1 rounded-[16px] bg-white p-4 text-left ${
                category === c.key
                  ? "border-2 border-teal shadow-[0_4px_14px_rgba(28,188,173,.12)]"
                  : "border-[1.5px] border-border-input"
              } ${exhausted ? "opacity-60" : ""}`}
            >
              <span
                className={`text-xs font-bold ${category === c.key ? "text-teal-deep" : "text-ink-tertiary"}`}
              >
                {c.title}
              </span>
              <span className="font-display text-[22px] text-ink-title">
                {formatMxn(b.available)} disp.
              </span>
              <span className="text-[11.5px] text-ink-tertiary">
                {exhausted
                  ? `Usaste tu tope anual de ${formatMxn(b.limit)} — se renueva en enero`
                  : `de ${formatMxn(b.limit)} MXN este año · ${c.note}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sin ningún peludo disponible NO se pinta el formulario (equipo,
          15-ago). Antes se desplegaba completo con un aviso arriba, y se podía
          llenar entero —montos, fechas, facturas, CLABE— para toparse al final
          con que no había a quién asignar la solicitud. */}
      {!hayPeludoDisponible ? (
        <div className="flex flex-col gap-3 rounded-[20px] bg-white p-6 shadow-[var(--shadow-card)] md:p-[30px]">
          <span className="font-display text-[19px] text-ink-title">
            Todavía no puedes solicitar un reintegro
          </span>
          <p className="text-[13.5px] leading-relaxed text-ink-secondary">
            {pets.length === 0
              ? "Aún no tienes peludos registrados. Preséntanos al primero y, en cuanto el comité apruebe su perfil, empieza a correr su tiempo de espera."
              : "Ninguno de tus peludos está disponible por ahora: el comité tiene que aprobar su perfil y después corre su tiempo de espera. Te avisamos en cuanto el primero quede listo."}
          </p>
          {pets.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {pets.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-[12px] bg-cream px-3.5 py-2.5 text-[13px] text-ink-body"
                >
                  <span aria-hidden>{p.species === "dog" ? "🐕" : "🐈"}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-title">
                    {p.name}
                  </span>
                  <span className="flex-none text-[12.5px] text-ink-secondary">
                    {p.pendingApproval ? "en revisión del comité" : p.waitLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={pets.length === 0 ? "/app/peludos/nueva" : "/app/peludos"}
            className="mt-1 grid h-11 place-items-center self-start rounded-full bg-teal px-6 text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep"
          >
            {pets.length === 0 ? "Registrar a mi peludo" : "Ver mis peludos"}
          </Link>
        </div>
      ) : (
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-[18px] rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]"
      >
        {/* Pet selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-semibold text-ink-title">
            ¿Para quién es el reintegro?
          </label>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            {pets.map((p) => {
              const disabled = !p.eligible;
              const selected = petId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPetId(p.id)}
                  /* `min-w-0`: sin él, el ancho mínimo de cada botón es el de
                     su texto completo (min-width:auto de flex), así que con
                     tres peludos la fila se salía de la tarjeta blanca en vez
                     de recortar el nombre — el recuadro rojo del equipo,
                     13-ago. El `truncate` de adentro nunca llegaba a actuar. */
                  className={`flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-[12px] px-3.5 text-sm ${
                    selected
                      ? "bg-teal font-bold text-white"
                      : disabled
                        ? "border-[1.5px] border-border-input font-semibold text-ink-placeholder"
                        : "border-[1.5px] border-border-input font-semibold text-ink-body hover:border-teal"
                  }`}
                >
                  <span
                    className={`grid size-[30px] flex-none place-items-center rounded-full text-[13px] ${selected ? "bg-white/25" : "bg-[#EFEAE0]"}`}
                  >
                    {p.species === "dog" ? "🐕" : "🐈"}
                  </span>
                  <span className="truncate">
                    {p.name} ·{" "}
                    {p.eligible
                      ? "disponible"
                      : p.pendingApproval
                        ? "en revisión del comité"
                        : p.waitLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <TextField
            label={AMOUNT_LABEL_BY_CATEGORY[category]}
            placeholder={`$ hasta ${formatMxn(balance.available)} MXN`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={`Tú eliges cuánto solicitar — tienes ${formatMxn(balance.available)} MXN disponibles este año.`}
          />
          <TextField
            label="¿Cuánto pagaste en total? (opcional)"
            placeholder="$ total de la factura"
            inputMode="decimal"
            value={totalPaid}
            onChange={(e) => setTotalPaid(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <TextField
            label={DATE_LABEL_BY_CATEGORY[category]}
            type="date"
            /* `hoyEnMexico()`, no `new Date().toISOString()`: en Vercel el
               proceso corre en UTC y de las 18:00 en adelante el tope se
               adelantaba un día, bloqueando una factura de HOY. */
            max={hoyEnMexico()}
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
          <TextField
            label="¿En qué veterinaria o clínica lo atendieron?"
            placeholder="Nombre del consultorio"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
          />
        </div>

        {/* DÓNDE Y QUIÉN ATENDIÓ — en las tres categorías, y obligatorio.
            Empezó siendo opcional y solo en gastos veterinarios. El 15-ago se
            volvió obligatorio y se sumó a vacunas; el 16-ago, también a
            fallecimiento. Ahí también aplica: ese reintegro exige un
            "certificado de defunción o informe médico", y ese documento lo
            firma un veterinario — sin su nombre y su cédula no hay forma de
            verificar quién lo emitió. */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <TextField
            label="Médico veterinario que lo atendió"
            placeholder="Nombre del veterinario"
            value={vetName}
            onChange={(e) => setVetName(e.target.value)}
          />
          <TextField
            label="Cédula profesional"
            placeholder="Cédula del veterinario"
            value={vetLicense}
            onChange={(e) => setVetLicense(e.target.value)}
          />
        </div>

        {/* Documentos por motivo — cada archivo se guarda catalogado */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-semibold text-ink-title">
            Documentos para tu solicitud
          </label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {docSlots.map((slot) => {
              const file = files[slot.type];
              return (
                <div key={slot.type}>
                  <button
                    type="button"
                    onClick={() => fileRefs.current[slot.type]?.click()}
                    className={`flex h-full w-full flex-col items-center gap-1.5 rounded-[14px] border-2 border-dashed p-4 text-center transition-colors ${
                      file
                        ? "border-[#D4EDD4] bg-[#F4FAF4]"
                        : "border-[#C9E9E4] bg-[#F2FAF9] hover:border-teal"
                    }`}
                  >
                    <span className="text-xl" aria-hidden>
                      {file ? "✅" : "📄"}
                    </span>
                    <span
                      className={`text-[12px] font-semibold leading-snug ${file ? "text-success-text" : "text-teal-deep"}`}
                    >
                      {file ? file.name : slot.label}
                    </span>
                    <span className="text-[10.5px] text-ink-tertiary">
                      JPG, PNG o PDF
                    </span>
                  </button>
                  <input
                    ref={(el) => {
                      fileRefs.current[slot.type] = el;
                    }}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) =>
                      setFiles((prev) => ({
                        ...prev,
                        [slot.type]: e.target.files?.[0] ?? null,
                      }))
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <TextField
            label="Cuenta para tu transferencia (CLABE)"
            placeholder="18 dígitos"
            inputMode="numeric"
            maxLength={18}
            value={clabe}
            onChange={(e) => setClabe(e.target.value.replace(/\D/g, ""))}
          />
          <TextField
            label="Nombre del titular de la cuenta"
            placeholder="Como aparece en tu banco"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
          />
        </div>

        {/* Aviso de seguridad — texto del sitio vivo */}
        <div className="rounded-[12px] bg-warning-bg px-4 py-3 text-[13px] leading-normal text-[#8A5A12]">
          🔒 {BANK_HOLDER_NOTICE}
        </div>

        <div className="rounded-[12px] bg-info-bg px-4 py-3 text-[13px] leading-normal text-info-text">
          Recibirás tu reintegro en un máximo de{" "}
          <strong>{REIMBURSEMENT_SLA_HOURS} horas</strong> después de la
          aprobación del comité.
        </div>

        {error && (
          <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
            {error}
          </div>
        )}

        <Button type="submit" disabled={loading || blocked || !petId}>
          {loading ? "Enviando…" : "Enviar solicitud"}
        </Button>
      </form>
      )}
    </>
  );
}
