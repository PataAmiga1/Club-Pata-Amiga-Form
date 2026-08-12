/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { waitingProgress } from "@/lib/dates";

export type PetRow = {
  id: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  age_years: number | null;
  age_months: number | null;
  photo_url: string | null;
  approval_status: "pending" | "approved" | "rejected";
  waiting_period_end_date: string | null;
  waiting_period_start_date?: string | null;
  waiting_period_bypassed: boolean;
  created_at: string;
  /** Para distinguir "completar documentos" de "en revisión" (equipo, 11-ago) */
  is_senior?: boolean;
  vet_certificate_url?: string | null;
  info_requested?: boolean;
  is_active?: boolean;
  deactivation_reason?: string | null;
  deactivated_at?: string | null;
};

function ageLabel(pet: PetRow) {
  if (pet.age_months) return `${pet.age_months} meses`;
  if (pet.age_years === 1) return "1 año";
  return `${pet.age_years ?? "?"} años`;
}

const STATUS_CHIP = {
  approved: { text: "✓ APROBADO", cls: "bg-success-bg text-success-text" },
  pending: { text: "EN REVISIÓN", cls: "bg-warning-bg text-warning-text" },
  // "rechazado", no "denegado" (equipo, 11-ago)
  rejected: { text: "RECHAZADO", cls: "bg-error-bg text-error-text" },
} as const;

export function PetCard({ pet }: { pet: PetRow }) {
  const inactive = pet.is_active === false;
  const chip = STATUS_CHIP[pet.approval_status];
  const wait = waitingProgress(
    pet.created_at,
    pet.waiting_period_end_date,
    pet.waiting_period_bypassed,
    pet.waiting_period_start_date,
  );
  // La espera arranca cuando el comité aprueba (PM, 11-ago): una ficha en
  // revisión no muestra un conteo corriendo.
  const enRevision = pet.approval_status === "pending" && !pet.waiting_period_bypassed;
  // Si el miembro ya subió todo (foto + certificado si es senior y el comité
  // no pidió nada más), la leyenda dice "en revisión" — decirle "completar
  // documentos" cuando no le falta nada confunde (equipo, 11-ago; se decidió
  // en la junta conservar el aviso pero distinguir el estatus).
  const docsCompletos =
    Boolean(pet.photo_url) &&
    (!pet.is_senior || Boolean(pet.vet_certificate_url)) &&
    !pet.info_requested;
  const photoTone =
    pet.approval_status === "approved"
      ? "border-[#C9E9E4] bg-info-bg text-teal"
      : "border-[#F2D9AC] bg-warning-bg text-warning-text";

  // Dada de baja: la tarjeta queda como recuerdo (gris) y no cuenta en el límite
  return (
    <div
      className={`flex gap-4 rounded-[20px] bg-white p-4 shadow-[var(--shadow-card)] sm:p-[22px] ${
        inactive ? "opacity-70 grayscale" : ""
      }`}
    >
      <div
        className={`relative grid size-16 flex-none place-items-center overflow-hidden rounded-[16px] border-2 border-dashed text-center text-[11px] font-bold sm:size-[86px] sm:rounded-[20px] ${photoTone}`}
      >
        {pet.photo_url ? (
          // Absoluta: height 100% en fila auto de grid se resuelve como auto
          // y el recorte deja de estar centrado (muestra la franja superior)
          <img
            src={pet.photo_url}
            alt={pet.name}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <>
            FOTO
            <br />
            {pet.name}
          </>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-ink-title">{pet.name}</span>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-extrabold tracking-[.04em] ${
              inactive ? "bg-cream text-ink-tertiary" : chip.cls
            }`}
          >
            {inactive ? "🕊️ DADA DE BAJA" : chip.text}
          </span>
        </div>
        <span className="text-[13px] text-ink-secondary">
          {pet.species === "dog" ? "Perro" : "Gato"}
          {pet.breed ? ` · ${pet.breed}` : ""} · {ageLabel(pet)}
        </span>
        {inactive ? (
          <span className="text-[12px] text-ink-tertiary">
            {pet.deactivated_at
              ? `Se despidió de la manada el ${new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(new Date(pet.deactivated_at))}.`
              : "Ya no está en la manada."}{" "}
            Su recuerdo se queda contigo. 💛
          </span>
        ) : enRevision ? (
        <div className="flex flex-col gap-[5px]">
          <span className="text-[11.5px] text-ink-tertiary">
            {docsCompletos
              ? "Su ficha está en revisión del comité — el período de espera empieza al aprobarse · "
              : "Su período de espera empieza cuando el comité apruebe su ficha · "}
            <Link href="/app/peludos" className="font-semibold text-teal-deep">
              {docsCompletos ? "Ver ficha" : "Completar documentos"}
            </Link>
          </span>
        </div>
        ) : (
        <div className="flex flex-col gap-[5px]">
          <div className="flex justify-between text-[11.5px] text-ink-tertiary">
            <span>
              {wait.done
                ? "Período de espera completado"
                : "Período de espera en curso"}
            </span>
            <span
              className={
                wait.done
                  ? "font-bold text-teal-deep"
                  : "font-bold text-warning-text"
              }
            >
              {wait.elapsed} / {wait.total} días
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#EFEAE0]">
            <div
              className={`h-full rounded-full ${wait.done ? "bg-teal" : "bg-orange"}`}
              style={{ width: `${wait.pct}%` }}
            />
          </div>
          {/* La rama "pending" vive arriba (enRevision): aquí solo llegan
              fichas aprobadas o con bypass. */}
          {wait.done && pet.approval_status === "approved" ? (
            <Link
              href="/app/reintegros/nueva"
              className="text-[11.5px] font-semibold text-teal-deep hover:underline"
            >
              Reintegro disponible 🎉 Utilizar mis beneficios →
            </Link>
          ) : null}
        </div>
        )}
      </div>
    </div>
  );
}
