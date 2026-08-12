"use client";

import { AmbassadorResolveButtons } from "./AmbassadorResolveButtons";

export function AmbassadorReviewRow({
  ambassador,
  detailSlot,
}: {
  detailSlot?: React.ReactNode;
  ambassador: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    curp: string | null;
    location: string;
    hasAccount: boolean;
    applied: string;
  };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-4 shadow-[0_2px_10px_rgba(30,83,80,.05)] sm:flex-row sm:items-center">
      <div className="grid size-14 flex-none place-items-center rounded-full bg-warning-bg text-lg font-extrabold text-warning-text">
        {ambassador.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-bold text-ink-title">
          {ambassador.name}
          {ambassador.location ? ` · ${ambassador.location}` : ""}
        </span>
        <span className="text-xs text-ink-tertiary">
          {ambassador.email}
          {ambassador.phone ? ` · ${ambassador.phone}` : ""} · solicitó el{" "}
          {ambassador.applied}
        </span>
        <span className="text-xs font-semibold">
          <span
            className={
              ambassador.curp ? "text-success-text" : "text-warning-text"
            }
          >
            CURP {ambassador.curp ? `${ambassador.curp} ✓` : "pendiente"}
          </span>
          {" · "}
          <span
            className={
              ambassador.hasAccount ? "text-success-text" : "text-ink-tertiary"
            }
          >
            {ambassador.hasAccount ? "con cuenta vinculada" : "sin cuenta aún"}
          </span>
        </span>
        {detailSlot && <div className="mt-1.5">{detailSlot}</div>}
      </div>
      <AmbassadorResolveButtons ambassadorId={ambassador.id} />
    </div>
  );
}
