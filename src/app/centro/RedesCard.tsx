"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCenterSocial } from "./actions";

const REDES = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/tucentro" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/tucentro" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@tucentro" },
] as const;

/** Redes sociales del centro, una línea por red (equipo, 5-ago). */
export function RedesCard({
  initial,
}: {
  initial: Record<string, string> | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [links, setLinks] = useState<Record<string, string>>({
    instagram: initial?.instagram ?? "",
    facebook: initial?.facebook ?? "",
    tiktok: initial?.tiktok ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
      <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
        TUS REDES SOCIALES
      </span>
      {REDES.map((r) => (
        <label key={r.key} className="flex flex-col gap-1 text-[12px] font-bold text-ink-secondary">
          {r.label}
          <input
            value={links[r.key]}
            onChange={(e) => {
              setLinks({ ...links, [r.key]: e.target.value });
              setMsg(null);
            }}
            placeholder={r.placeholder}
            className="h-10 rounded-[10px] border-[1.5px] border-border-input px-3 text-[13px] font-normal text-ink-title outline-none focus:border-teal"
          />
        </label>
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await updateCenterSocial(links);
            setMsg(
              "error" in res && res.error
                ? res.error
                : "Redes guardadas ✓",
            );
            router.refresh();
          })
        }
        className="self-start rounded-full bg-teal px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar redes"}
      </button>
      {msg && (
        <span
          className={`text-xs font-semibold ${msg.includes("✓") ? "text-success-text" : "text-error-text"}`}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
