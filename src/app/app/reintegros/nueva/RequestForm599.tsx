"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import {
  cuentaPorOmision,
  etiquetaDeCuenta,
  type CuentaBancaria,
} from "@/lib/cuentas-bancarias";
import {
  AMOUNT_LABEL_BY_CATEGORY,
  BANK_HOLDER_NOTICE,
  DATE_LABEL_BY_CATEGORY,
  DOCS_BY_CATEGORY,
  type ReimbursementDocType,
} from "@/lib/reimbursement-docs";
import { formatMxn } from "@/lib/format";
import { formatDateEs } from "@/lib/dates";
import { hoyEnMexico } from "@/lib/zona-horaria";
import type { GrupoCatalogo } from "@/lib/catalogo-cuidados";
import type { Rubro599 } from "@/lib/plans/montos";
import { solicitarReintegro599 } from "./actions";

/**
 * Solicitud de reintegro de la membresía $599 (sección 3). Por peludo y por
 * rubro. Las cifras llegan calculadas del servidor (motor `reintegros-599`) y
 * el servidor las vuelve a calcular al guardar: lo que se ve aquí orienta, lo
 * que manda es la acción.
 */

export type PeludoParaSolicitud = {
  id: string;
  nombre: string;
  especie: "dog" | "cat";
  aprobado: boolean;
  puedePedir: boolean;
  anioHasta: string;
  diasHabiles: number;
  rubros: {
    rubro: Rubro599;
    label: string;
    abierto: boolean;
    fechaApertura: string | null;
    monto: number;
    gastado: number;
    disponible: number;
  }[];
};

const EMOJI: Record<Rubro599, string> = {
  cuidados: "🩺",
  emergencia: "🚑",
  despedida: "🕊️",
};

export function RequestForm599({
  userId,
  peludos,
  catalogo,
  cuentas,
  ultimaClabe,
  holderName,
  blocked,
}: {
  userId: string;
  peludos: PeludoParaSolicitud[];
  catalogo: GrupoCatalogo[];
  cuentas: CuentaBancaria[];
  ultimaClabe: string;
  holderName: string;
  blocked: boolean;
}) {
  const disponibles = peludos.filter(
    (p) => p.puedePedir && p.rubros.some((r) => r.abierto && r.disponible > 0),
  );
  const [petId, setPetId] = useState(disponibles[0]?.id ?? "");
  const peludo = peludos.find((p) => p.id === petId) ?? null;
  const primerRubro = peludo?.rubros.find((r) => r.abierto && r.disponible > 0)?.rubro;
  const [rubro, setRubro] = useState<Rubro599>(primerRubro ?? "cuidados");
  const estadoRubro = peludo?.rubros.find((r) => r.rubro === rubro) ?? null;

  const [conceptos, setConceptos] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [totalPaid, setTotalPaid] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [vetName, setVetName] = useState("");
  const [vetLicense, setVetLicense] = useState("");
  const [files, setFiles] = useState<Partial<Record<ReimbursementDocType, File | null>>>({});
  const propuesta = cuentaPorOmision(cuentas);
  const [clabe, setClabe] = useState(propuesta?.clabe ?? ultimaClabe);
  const [holder, setHolder] = useState(propuesta?.holder ?? holderName);
  const elegida = cuentas.find((c) => c.clabe === clabe) ?? null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRefs = useRef<Partial<Record<ReimbursementDocType, HTMLInputElement | null>>>({});
  const docSlots = DOCS_BY_CATEGORY[rubro] ?? [];

  function elegirPeludo(id: string) {
    setPetId(id);
    const p = peludos.find((x) => x.id === id);
    const r = p?.rubros.find((x) => x.abierto && x.disponible > 0)?.rubro;
    if (r) setRubro(r);
    setConceptos([]);
    setFiles({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const monto = parseFloat(amount.replace(/[^0-9.]/g, ""));
    const total = parseFloat(totalPaid.replace(/[^0-9.]/g, ""));
    if (!peludo) return setError("Elige a tu peludo.");
    if (!estadoRubro?.abierto) return setError("Ese reintegro todavía no está disponible.");
    if (Number.isNaN(monto) || monto <= 0) return setError("Indica el monto que solicitas.");
    if (monto > estadoRubro.disponible)
      return setError(
        `El monto (${formatMxn(monto)}) excede lo disponible este año (${formatMxn(estadoRubro.disponible)} MXN).`,
      );
    if (rubro === "cuidados" && conceptos.length === 0)
      return setError("Elige qué cuidado fue, de la lista.");
    if (!serviceDate) return setError("Indica la fecha.");
    if (!files.evidence_photo) return setError(`Sube: ${docSlots[0]?.label}.`);
    if (!files.receipt) return setError(`Sube: ${docSlots[2]?.label}.`);

    setLoading(true);
    const supabase = createClient();
    const documentos: { type: ReimbursementDocType; path: string; name: string }[] = [];
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
      documentos.push({ type: slot.type, path, name: file.name });
    }

    const r = await solicitarReintegro599({
      petId: peludo.id,
      rubro,
      monto,
      totalPagado: Number.isNaN(total) ? null : total,
      fechaServicio: serviceDate,
      clinica: clinicName,
      veterinario: vetName,
      cedula: vetLicense,
      conceptoIds: rubro === "cuidados" ? conceptos : [],
      documentos,
      clabe,
      titular: holder,
    });
    if ("error" in r) {
      setError(r.error);
      setLoading(false);
      return;
    }
    window.location.assign("/app/reintegros?enviada=1");
  }

  if (disponibles.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-white p-6 shadow-[var(--shadow-card)] md:p-[30px]">
        <span className="font-display text-[19px] text-ink-title">
          Todavía no puedes solicitar un reintegro
        </span>
        <ul className="flex flex-col gap-1.5">
          {peludos.map((p) => {
            const siguiente = p.rubros
              .filter((r) => r.fechaApertura && !r.abierto)
              .sort((a, b) => (a.fechaApertura! < b.fechaApertura! ? -1 : 1))[0];
            return (
              <li
                key={p.id}
                className="flex items-center gap-2.5 rounded-[12px] bg-cream px-3.5 py-2.5 text-[13px] text-ink-body"
              >
                <span aria-hidden>{p.especie === "dog" ? "🐕" : "🐈"}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-title">
                  {p.nombre}
                </span>
                <span className="flex-none text-[12.5px] text-ink-secondary">
                  {!p.aprobado
                    ? "en revisión del comité"
                    : !p.puedePedir
                      ? "pago pendiente"
                      : siguiente
                        ? `${siguiente.label.toLowerCase()} se abre el ${formatDateEs(siguiente.fechaApertura!)}`
                        : "sin monto disponible este año"}
                </span>
              </li>
            );
          })}
        </ul>
        <Link
          href="/app/peludos"
          className="mt-1 grid h-11 place-items-center self-start rounded-full bg-teal px-6 text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep"
        >
          Ver mis peludos
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-[18px] rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]"
    >
      {/* Peludo */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink-title">¿Para quién es el reintegro?</span>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          {peludos.map((p) => {
            const puede = disponibles.some((d) => d.id === p.id);
            const elegido = p.id === petId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!puede}
                onClick={() => elegirPeludo(p.id)}
                className={`flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-[12px] px-3.5 text-sm ${
                  elegido
                    ? "bg-teal font-bold text-white"
                    : puede
                      ? "border-[1.5px] border-border-input font-semibold text-ink-body hover:border-teal"
                      : "border-[1.5px] border-border-input font-semibold text-ink-placeholder"
                }`}
              >
                <span
                  className={`grid size-[30px] flex-none place-items-center rounded-full text-[13px] ${elegido ? "bg-white/25" : "bg-[#EFEAE0]"}`}
                >
                  {p.especie === "dog" ? "🐕" : "🐈"}
                </span>
                <span className="truncate">{p.nombre}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rubros del peludo elegido */}
      {peludo && (
        <div className="flex flex-col gap-2.5 sm:flex-row">
          {peludo.rubros.map((r) => {
            const usable = r.abierto && r.disponible > 0;
            return (
              <button
                key={r.rubro}
                type="button"
                disabled={!usable}
                onClick={() => {
                  setRubro(r.rubro);
                  setFiles({});
                }}
                className={`flex flex-1 flex-col gap-1 rounded-[16px] bg-white p-4 text-left ${
                  rubro === r.rubro
                    ? "border-2 border-teal shadow-[0_4px_14px_rgba(28,188,173,.12)]"
                    : "border-[1.5px] border-border-input"
                } ${usable ? "" : "opacity-60"}`}
              >
                <span
                  className={`text-xs font-bold ${rubro === r.rubro ? "text-teal-deep" : "text-ink-tertiary"}`}
                >
                  {EMOJI[r.rubro]} {r.label.toUpperCase()}
                </span>
                <span className="font-display text-[22px] text-ink-title">
                  {r.abierto ? `${formatMxn(r.disponible)} disp.` : "Aún no"}
                </span>
                <span className="text-[11.5px] leading-snug text-ink-tertiary">
                  {!r.abierto
                    ? r.fechaApertura
                      ? `Se abre el ${formatDateEs(r.fechaApertura)}`
                      : "Se abre al aprobar su perfil"
                    : r.disponible <= 0
                      ? `Usaste ${formatMxn(r.monto)} este año · se renueva el ${formatDateEs(peludo.anioHasta)}`
                      : `de ${formatMxn(r.monto)} este año · se renueva el ${formatDateEs(peludo.anioHasta)}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Catálogo: solo en cuidados cotidianos */}
      {rubro === "cuidados" && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-title">
            ¿Qué cuidado fue? Elige de la lista
          </span>
          <div className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-border-input p-3.5">
            {catalogo.map((g) => (
              <div key={g.id} className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-teal-deep">{g.titulo}</span>
                <div className="flex flex-wrap gap-1.5">
                  {g.conceptos.map((c) => {
                    const marcado = conceptos.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={marcado}
                        onClick={() =>
                          setConceptos((prev) =>
                            marcado ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                          )
                        }
                        className={`rounded-full border-[1.5px] px-3 py-1.5 text-left text-[12px] font-semibold transition-colors ${
                          marcado
                            ? "border-teal bg-info-bg text-teal-deep"
                            : "border-border-input bg-white text-ink-secondary hover:border-teal"
                        }`}
                      >
                        {marcado ? "✓ " : ""}
                        {c.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <span className="text-[11.5px] leading-snug text-ink-tertiary">
              ¿No está en la lista y tu veterinario lo indicó? Escríbenos antes de pedirlo: lo
              revisamos y, si tiene sentido, lo agregamos para todos.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <TextField
          label={AMOUNT_LABEL_BY_CATEGORY[rubro]}
          placeholder={`$ hasta ${formatMxn(estadoRubro?.disponible ?? 0)} MXN`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`Tienes ${formatMxn(estadoRubro?.disponible ?? 0)} MXN disponibles este año.`}
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
          label={DATE_LABEL_BY_CATEGORY[rubro]}
          type="date"
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

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink-title">Documentos para tu solicitud</span>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {docSlots.map((slot) => {
            const file = files[slot.type];
            return (
              <div key={slot.type}>
                <button
                  type="button"
                  onClick={() => fileRefs.current[slot.type]?.click()}
                  className={`flex h-full w-full flex-col items-center gap-1.5 rounded-[14px] border-2 border-dashed p-4 text-center transition-colors ${
                    file ? "border-[#D4EDD4] bg-[#F4FAF4]" : "border-[#C9E9E4] bg-[#F2FAF9] hover:border-teal"
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
                  <span className="text-[10.5px] text-ink-tertiary">JPG, PNG o PDF</span>
                </button>
                <input
                  ref={(el) => {
                    fileRefs.current[slot.type] = el;
                  }}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) =>
                    setFiles((prev) => ({ ...prev, [slot.type]: e.target.files?.[0] ?? null }))
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {cuentas.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-bold text-ink-title">¿A cuál cuenta te lo depositamos?</span>
          <div className="flex flex-wrap gap-2">
            {cuentas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setClabe(c.clabe);
                  setHolder(c.holder ?? holderName);
                }}
                className={`rounded-full border-[1.5px] px-3.5 py-2 text-[12.5px] font-bold transition-colors ${
                  clabe === c.clabe
                    ? "border-teal bg-info-bg text-teal-deep"
                    : "border-border-input bg-white text-ink-secondary hover:border-teal"
                }`}
              >
                {etiquetaDeCuenta(c)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {elegida && cuentas.length > 1 ? (
          <TextField
            label="Cuenta para tu transferencia (CLABE)"
            value={elegida.clabe}
            readOnly
            hint="Para depositar a otra cuenta, agrégala en Mi cuenta."
            onChange={() => {}}
          />
        ) : (
          <TextField
            label="Cuenta para tu transferencia (CLABE)"
            placeholder="18 dígitos"
            inputMode="numeric"
            maxLength={18}
            value={clabe}
            onChange={(e) => setClabe(e.target.value.replace(/\D/g, ""))}
          />
        )}
        <TextField
          label="Nombre del titular de la cuenta"
          placeholder="Como aparece en tu banco"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
        />
      </div>

      <div className="rounded-[12px] bg-warning-bg px-4 py-3 text-[13px] leading-normal text-[#8A5A12]">
        🔒 {BANK_HOLDER_NOTICE}
      </div>
      <div className="rounded-[12px] bg-info-bg px-4 py-3 text-[13px] leading-normal text-info-text">
        Te depositamos en <strong>{peludo?.diasHabiles ?? 5} días hábiles</strong>. Si nos
        tardamos más, el mes de {peludo?.nombre ?? "tu peludo"} es gratis.
      </div>

      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">{error}</div>
      )}

      <Button type="submit" disabled={loading || blocked || !petId}>
        {loading ? "Enviando…" : "Enviar solicitud"}
      </Button>
    </form>
  );
}
