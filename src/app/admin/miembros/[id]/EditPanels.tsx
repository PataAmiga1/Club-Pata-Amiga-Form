"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberByAdmin, updatePetByAdmin } from "@/app/admin/actions";

/**
 * Edición de miembro y mascotas por el SUPER ADMIN (equipo, 5-ago): para
 * cuando una persona mayor llama por teléfono y el comité captura por ella.
 */

const field =
  "h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal";

function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-title/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[86dvh] w-full max-w-[560px] overflow-y-auto rounded-[20px] bg-white p-5 shadow-[0_12px_40px_rgba(30,83,80,.25)]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="font-display text-[19px] text-ink-title">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-8 flex-none place-items-center rounded-full bg-cream text-ink-secondary"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EditMemberButton({
  userId,
  initial,
}: {
  userId: string;
  initial: {
    first_name: string | null;
    last_name: string | null;
    mother_last_name: string | null;
    phone: string | null;
    birth_date: string | null;
    nationality: string | null;
    curp: string | null;
    street: string | null;
    number_ext: string | null;
    number_int: string | null;
    colony: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(initial).map(([k, v]) => [k, v ?? ""]),
    ) as Record<string, string>,
  );
  const [error, setError] = useState<string | null>(null);

  const F = (key: string, label: string, type = "text") => (
    <label className="flex flex-col gap-1 text-[11.5px] font-bold text-ink-secondary">
      {label}
      <input
        type={type}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={field}
      />
    </label>
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-full border-[1.5px] border-teal px-4 py-2 text-[12.5px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
      >
        ✏️ Editar datos del miembro
      </button>
    );
  }

  return (
    <Overlay title="Editar datos del miembro" onClose={() => setOpen(false)}>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="col-span-2">{F("first_name", "Nombre(s)")}</div>
        {F("last_name", "Apellido paterno")}
        {F("mother_last_name", "Apellido materno")}
        {F("birth_date", "Fecha de nacimiento", "date")}
        {F("nationality", "Nacionalidad")}
        {F("phone", "Teléfono")}
        {F("curp", "CURP")}
        <div className="col-span-2">{F("street", "Calle")}</div>
        {F("number_ext", "No. exterior")}
        {F("number_int", "No. interior")}
        {F("colony", "Colonia")}
        {F("postal_code", "Código postal")}
        {F("city", "Ciudad")}
        {F("state", "Estado")}
      </div>
      {error && (
        <p className="mt-2 text-xs font-semibold text-error-text">{error}</p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await updateMemberByAdmin(userId, form);
            if ("error" in res && res.error) setError(res.error);
            else {
              setOpen(false);
              router.refresh();
            }
          })
        }
        className="mt-4 grid h-11 w-full place-items-center rounded-full bg-teal text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </Overlay>
  );
}

export function EditPetButton({
  petId,
  initial,
}: {
  petId: string;
  initial: {
    name: string;
    breed: string | null;
    sex: string | null;
    age_years: number | null;
    age_months: number | null;
    coat_color: string | null;
    eye_color: string | null;
    nose_color: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, string>>({
    name: initial.name ?? "",
    breed: initial.breed ?? "",
    sex: initial.sex ?? "",
    age_years: initial.age_years != null ? String(initial.age_years) : "",
    age_months: initial.age_months != null ? String(initial.age_months) : "",
    coat_color: initial.coat_color ?? "",
    eye_color: initial.eye_color ?? "",
    nose_color: initial.nose_color ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const F = (key: string, label: string, type = "text") => (
    <label className="flex flex-col gap-1 text-[11.5px] font-bold text-ink-secondary">
      {label}
      <input
        type={type}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={field}
      />
    </label>
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-bold text-teal-deep hover:underline"
      >
        ✏️ Editar
      </button>
    );
  }

  return (
    <Overlay title={`Editar a ${initial.name}`} onClose={() => setOpen(false)}>
      <div className="grid grid-cols-2 gap-2.5">
        {F("name", "Nombre")}
        {F("breed", "Raza")}
        <label className="flex flex-col gap-1 text-[11.5px] font-bold text-ink-secondary">
          Sexo
          <select
            value={form.sex}
            onChange={(e) => setForm({ ...form, sex: e.target.value })}
            className={field}
          >
            <option value="">—</option>
            <option value="male">Macho</option>
            <option value="female">Hembra</option>
          </select>
        </label>
        {F("age_years", "Edad (años)", "number")}
        {F("age_months", "Edad (meses)", "number")}
        {F("coat_color", "Color de pelaje")}
        {F("eye_color", "Color de ojos")}
        {F("nose_color", "Color de nariz")}
      </div>
      {error && (
        <p className="mt-2 text-xs font-semibold text-error-text">{error}</p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await updatePetByAdmin(petId, form);
            if ("error" in res && res.error) setError(res.error);
            else {
              setOpen(false);
              router.refresh();
            }
          })
        }
        className="mt-4 grid h-11 w-full place-items-center rounded-full bg-teal text-[13.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </Overlay>
  );
}
