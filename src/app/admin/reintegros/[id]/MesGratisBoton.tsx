"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aplicarMesGratis } from "@/app/admin/actions";

/** Solicitud que pasó de 5 días hábiles: el equipo aplica el mes gratis (sección 6). */
export function MesGratisBoton({
  reimbursementId,
  aplicadoEl,
  montoCentavos,
}: {
  reimbursementId: string;
  aplicadoEl: string | null;
  montoCentavos: number | null;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  if (aplicadoEl)
    return (
      <div className="rounded-[12px] bg-success-bg px-4 py-3 text-[13px] font-semibold text-success-text">
        ✓ Mes gratis aplicado: ${((montoCentavos ?? 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
        de crédito en su siguiente cobro.
      </div>
    );

  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-error-bg px-4 py-3 text-[13px] text-error-text">
      <span className="font-semibold">
        Pasó el plazo de 5 días hábiles. La promesa es que el mes de este peludo es gratis.
      </span>
      {aviso && <span className="font-bold">{aviso}</span>}
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          startTransition(async () => {
            setAviso(null);
            const r = await aplicarMesGratis(reimbursementId);
            if ("error" in r && r.error) setAviso(r.error);
            else router.refresh();
          })
        }
        className="self-start rounded-full bg-error-text px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
      >
        {pendiente ? "Aplicando…" : "Aplicar mes gratis"}
      </button>
    </div>
  );
}
