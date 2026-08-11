"use client";

/* eslint-disable @next/next/no-img-element */
import { SENIOR_PET_AGE_YEARS } from "@/lib/constants";
import { PetResolveButtons } from "./PetResolveButtons";

export function PetReviewRow({
  pet,
  detailSlot,
}: {
  detailSlot?: React.ReactNode;
  pet: {
    id: string;
    name: string;
    species: "dog" | "cat";
    breed: string | null;
    ageLabel: string;
    isSenior: boolean;
    hasCertificate: boolean;
    photoUrl: string | null;
    owner: string;
    registered: string;
  };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-4 shadow-[0_2px_10px_rgba(30,83,80,.05)] sm:flex-row sm:items-center">
      <div className="relative grid size-14 flex-none place-items-center overflow-hidden rounded-[14px] bg-info-bg text-xl">
        {pet.photoUrl ? (
          // Absoluta: height 100% en fila auto de grid se resuelve como auto
          // y la miniatura muestra la franja superior en vez del centro
          <img src={pet.photoUrl} alt={pet.name} className="absolute inset-0 size-full object-cover" />
        ) : pet.species === "dog" ? (
          "🐕"
        ) : (
          "🐈"
        )}
      </div>
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-bold text-ink-title">
          {pet.name}
          {pet.breed ? ` · ${pet.breed}` : ""} · {pet.ageLabel}
        </span>
        <span className="text-xs text-ink-tertiary">
          {pet.owner} · registrada el {pet.registered}
        </span>
        {pet.isSenior && (
          <span
            className={`text-xs font-semibold ${pet.hasCertificate ? "text-success-text" : "text-warning-text"}`}
          >
            Senior ({SENIOR_PET_AGE_YEARS}+):{" "}
            {pet.hasCertificate
              ? "certificado veterinario recibido ✓"
              : "falta certificado veterinario"}
          </span>
        )}
        {detailSlot && <div className="mt-1.5">{detailSlot}</div>}
      </div>
      <PetResolveButtons petId={pet.id} />
    </div>
  );
}
