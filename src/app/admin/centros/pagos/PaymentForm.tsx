"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerCenterPayment } from "@/app/admin/actions";
import { CONCEPT_LABELS } from "./concepts";

/** Captura manual de un pago a centro (equipo, 5-ago). */
export function PaymentForm({
  centers,
}: {
  centers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [concept, setConcept] = useState("vacunas");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const field =
    "h-10 rounded-[10px] border-[1.5px] border-border-input bg-white px-3 text-[13px] text-ink-title outline-none focus:border-teal";

  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
      <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
        REGISTRAR PAGO (SPEI HECHO FUERA DE LA PLATAFORMA)
      </span>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <select
          value={centerId}
          onChange={(e) => setCenterId(e.target.value)}
          className={field}
        >
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          className={field}
        >
          {Object.entries(CONCEPT_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Monto MXN"
          inputMode="decimal"
          className={field}
        />
        <input
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          className={field}
        />
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas (folio SPEI, miembro atendido, etc.) — opcional"
        className={field}
      />
      <button
        type="button"
        disabled={pending || !centerId || !amount}
        onClick={() =>
          startTransition(async () => {
            setMsg(null);
            const res = await registerCenterPayment({
              centerId,
              concept,
              amount,
              paidAt,
              notes,
            });
            if ("error" in res && res.error) setMsg(res.error);
            else {
              setMsg("Pago registrado ✓ — el centro ya lo ve en su portal.");
              setAmount("");
              setNotes("");
              router.refresh();
            }
          })
        }
        className="self-start rounded-full bg-teal px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
      >
        {pending ? "Registrando…" : "Registrar pago"}
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
