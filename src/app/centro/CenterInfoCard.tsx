"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { TextField } from "@/components/ui/Field";
import { PhoneField } from "@/components/ui/PhoneField";
import { Button } from "@/components/ui/Button";
import { updateCenterInfo, uploadCenterLogo } from "./actions";

/**
 * Datos del centro que salen en el directorio: logo/foto, beneficio para
 * miembros, teléfono y sitio web. Los cambios se publican al instante.
 */
export function CenterInfoCard({
  initialLogoUrl,
  initialBenefit,
  initialPhone,
  initialWebsite,
}: {
  initialLogoUrl: string | null;
  initialBenefit: string | null;
  initialPhone: string | null;
  initialWebsite: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [benefit, setBenefit] = useState(initialBenefit ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [website, setWebsite] = useState(initialWebsite ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("logo");
    setError(null);
    setNotice(null);
    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadCenterLogo(formData);
    setBusy(null);
    if (result.error) setError(result.error);
    else if (result.url) {
      setLogoUrl(result.url);
      setNotice("Imagen actualizada ✓");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    setNotice(null);
    const result = await updateCenterInfo({
      memberBenefit: benefit,
      phone,
      website,
    });
    setBusy(null);
    if (result.error) setError(result.error);
    else setNotice("Datos guardados ✓");
  }

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
        TU CENTRO EN EL DIRECTORIO
      </span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy === "logo"}
          className="grid h-[84px] w-[120px] flex-none place-items-center overflow-hidden rounded-[14px] border-2 border-dashed border-[#C9E9E4] bg-[#F2FAF9] text-[24px] text-teal"
          title="Foto o logo del centro — toca para cambiar"
        >
          {busy === "logo" ? (
            "…"
          ) : logoUrl ? (
            <img src={logoUrl} alt="Logo del centro" className="size-full object-contain" />
          ) : (
            "+"
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleLogo}
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-ink-title">
            Foto o logo del centro
          </span>
          <span className="text-[12.5px] text-ink-tertiary">
            Es la imagen de tu tarjeta en el directorio.
          </span>
        </div>
      </div>
      <TextField
        label="Beneficio para miembros"
        required
        placeholder="Ej. 10% en consultas presentando su membresía"
        value={benefit}
        onChange={(e) => setBenefit(e.target.value)}
      />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <PhoneField label="Teléfono" value={phone} onChange={setPhone} />
        <TextField
          label="Sitio web (opcional)"
          placeholder="https://tucentro.mx"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      {error && (
        <div className="rounded-[12px] bg-error-bg px-4 py-3 text-sm text-error-text">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy === "save"}>
          {busy === "save" ? "Guardando…" : "Guardar datos"}
        </Button>
        {notice && (
          <span className="text-sm font-semibold text-success-text">
            {notice}
          </span>
        )}
      </div>
    </form>
  );
}
