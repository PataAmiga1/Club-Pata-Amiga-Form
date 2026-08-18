"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WELLNESS_SERVICES, type WellnessService } from "@/lib/constants";
import { PhoneField } from "@/components/ui/PhoneField";
import {
  updateCenterServices,
  addCenterLocation,
  updateCenterLocation,
  deleteCenterLocation,
  type LocationInput,
} from "./actions";

export type LocationRow = {
  id: string;
  address: string | null;
  colony: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
};

const EMPTY: LocationInput = {
  address: "",
  colony: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
};

/**
 * Servicios y ubicaciones editables por el propio centro (equipo, 5-ago):
 * chips para (des)marcar servicios y formulario para agregar, editar o
 * quitar sucursales — sin escribirle al comité.
 */
export function ServiciosCard({
  initialServices,
  locations,
}: {
  initialServices: string[];
  locations: LocationRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [services, setServices] = useState<string[]>(initialServices);
  const [dirtyServices, setDirtyServices] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<LocationInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggleService = (key: string) => {
    setServices((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    );
    setDirtyServices(true);
    setSaved(false);
  };

  const startEdit = (l: LocationRow) => {
    setEditing(l.id);
    setForm({
      address: l.address ?? "",
      colony: l.colony ?? "",
      city: l.city ?? "",
      state: l.state ?? "",
      postalCode: l.postal_code ?? "",
      phone: l.phone ?? "",
    });
    setError(null);
  };

  const submit = (fn: () => Promise<{ error?: string } | { ok: true }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      setEditing(null);
      setForm(EMPTY);
      setSaved(true);
      router.refresh();
    });
  };

  const input = (
    key: keyof LocationInput,
    placeholder: string,
    span2 = false,
  ) => (
    <input
      value={(form[key] as string) ?? ""}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      placeholder={placeholder}
      className={`h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] text-ink-title outline-none focus:border-teal ${span2 ? "col-span-2" : ""}`}
    />
  );

  // El teléfono lleva selector de lada como el resto del sitio (equipo,
  // 13-ago): hay centros con número de otro país y antes no cabían.
  const telefonoSucursal = (
    <PhoneField
      compact
      className="col-span-2"
      value={form.phone ?? ""}
      onChange={(t) => setForm({ ...form, phone: t })}
      hint="Teléfono de la sucursal"
    />
  );

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
      <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
        TUS SERVICIOS
      </span>
      <div className="flex flex-wrap gap-2">
        {(
          Object.entries(WELLNESS_SERVICES) as [
            WellnessService,
            (typeof WELLNESS_SERVICES)[WellnessService],
          ][]
        ).map(([key, svc]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleService(key)}
            className={
              services.includes(key)
                ? "rounded-full bg-info-bg px-3 py-1.5 text-xs font-bold text-info-text"
                : "rounded-full border-[1.5px] border-border-input px-3 py-1.5 text-xs font-semibold text-ink-tertiary transition-colors hover:border-teal"
            }
          >
            {svc.emoji} {svc.label}
            {services.includes(key) ? " ✓" : ""}
          </button>
        ))}
      </div>
      {dirtyServices && (
        <button
          type="button"
          disabled={pending || services.length === 0}
          onClick={() =>
            submit(async () => {
              const res = await updateCenterServices(services);
              if (!("error" in res && res.error)) setDirtyServices(false);
              return res;
            })
          }
          className="self-start rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar servicios"}
        </button>
      )}

      <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
        TUS UBICACIONES
      </span>
      {locations.map((l) =>
        editing === l.id ? (
          <div
            key={l.id}
            className="grid grid-cols-2 gap-2 rounded-[12px] border-[1.5px] border-teal p-3"
          >
            {input("address", "Calle y número", true)}
            {input("colony", "Colonia")}
            {input("postalCode", "Código postal")}
            {input("city", "Alcaldía o municipio")}
            {input("state", "Estado")}
            {telefonoSucursal}
            <div className="col-span-2 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => submit(() => updateCenterLocation(l.id, form))}
                className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
              >
                Guardar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  submit(() => deleteCenterLocation(l.id))
                }
                className="rounded-full border-[1.5px] border-[#F2C7D4] px-4 py-2 text-[12.5px] font-bold text-error-text hover:bg-error-bg"
              >
                Quitar sucursal
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-semibold text-ink-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div
            key={l.id}
            className="flex items-start justify-between gap-2 rounded-[12px] border-[1.5px] border-border-input px-3.5 py-2.5 text-[12.5px] text-ink-body"
          >
            <div className="flex flex-col">
              <span className="font-semibold text-ink-title">{l.address}</span>
              <span className="text-ink-tertiary">
                {[l.colony, l.city, l.state, l.postal_code]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              {l.phone && <span className="text-ink-tertiary">📞 {l.phone}</span>}
            </div>
            <button
              type="button"
              onClick={() => startEdit(l)}
              className="flex-none text-[12px] font-bold text-teal-deep hover:underline"
            >
              Editar
            </button>
          </div>
        ),
      )}

      {editing === "new" ? (
        <div className="grid grid-cols-2 gap-2 rounded-[12px] border-[1.5px] border-teal p-3">
          {input("address", "Calle y número", true)}
          {input("colony", "Colonia")}
          {input("postalCode", "Código postal")}
          {input("city", "Alcaldía o municipio")}
          {input("state", "Estado")}
          {telefonoSucursal}
          <div className="col-span-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => submit(() => addCenterLocation(form))}
              className="rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            >
              Agregar sucursal
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-semibold text-ink-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing("new");
            setForm(EMPTY);
            setError(null);
          }}
          className="self-start rounded-full border-[1.5px] border-teal px-4 py-2 text-[12.5px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
        >
          + Agregar sucursal
        </button>
      )}

      {error && (
        <span className="text-xs font-semibold text-error-text">{error}</span>
      )}
      {saved && !error && (
        <span className="text-xs font-semibold text-success-text">
          Guardado — el directorio ya muestra el cambio. ✓
        </span>
      )}
    </div>
  );
}
