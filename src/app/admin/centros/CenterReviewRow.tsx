"use client";

import { CenterResolveButtons } from "./CenterResolveButtons";

export function CenterReviewRow({
  center,
  detailSlot,
}: {
  detailSlot?: React.ReactNode;
  center: {
    id: string;
    name: string;
    services: string;
    benefit: string | null;
    contact: string;
    locations: string[];
    applied: string;
  };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-4 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink-title">
            {center.name}
          </span>
          <span className="rounded-full bg-info-bg px-2.5 py-[3px] text-[10.5px] font-extrabold text-info-text">
            {center.services}
          </span>
        </div>
        {center.benefit && (
          <span className="text-xs font-semibold text-warning-text">
            🎁 {center.benefit}
          </span>
        )}
        <span className="text-xs text-ink-tertiary">
          {center.contact} · solicitó el {center.applied}
        </span>
        {center.locations.map((loc, i) => (
          <span key={i} className="text-xs text-ink-secondary">
            📍 {loc}
          </span>
        ))}
        {detailSlot && <div className="mt-1.5">{detailSlot}</div>}
      </div>
      <CenterResolveButtons centerId={center.id} />
    </div>
  );
}
