"use client";

import { useState, useTransition } from "react";
import {
  sendExtraordinaryEmail,
  sendMissingDocsReminders,
  type EmailAudience,
} from "@/app/admin/actions";

const AUDIENCES: { value: EmailAudience; label: string }[] = [
  { value: "miembros_activos", label: "Miembros activos" },
  { value: "miembros_inactivos", label: "Miembros inactivos" },
  { value: "perfil_incompleto", label: "Activos con perfil incompleto" },
  { value: "con_factura", label: "Activos que solicitan factura" },
  { value: "embajadores", label: "Embajadores aprobados" },
  { value: "centros", label: "Centros aliados aprobados" },
  { value: "lista", label: "Lista de correos (pegar abajo)" },
];

/**
 * Envíos dirigidos (equipo, 5-ago): correo extraordinario con HTML libre a
 * una audiencia elegida + recordatorios de datos faltantes. Solo el super
 * admin puede disparar los envíos (el botón lo valida el servidor).
 */
export function EnvioForm({ isSuper }: { isSuper: boolean }) {
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [audience, setAudience] = useState<EmailAudience>("miembros_activos");
  const [lista, setLista] = useState("");
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);

  const field =
    "rounded-[10px] border-[1.5px] border-border-input bg-white px-3 text-[13px] text-ink-title outline-none focus:border-teal";

  return (
    <div className="flex flex-col gap-5">
      {!isSuper && (
        <div className="rounded-[12px] bg-warning-bg px-4 py-3 text-[12.5px] text-warning-text">
          Puedes preparar el envío, pero el botón de enviar es exclusivo del
          super admin (decisión del cliente, 5-ago).
        </div>
      )}

      {/* Envío extraordinario */}
      <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
          ENVÍO EXTRAORDINARIO (HTML LIBRE)
        </span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Asunto del correo"
          className={`h-10 ${field}`}
        />
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value as EmailAudience)}
          className={`h-10 ${field}`}
        >
          {AUDIENCES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        {audience === "lista" && (
          <textarea
            value={lista}
            onChange={(e) => setLista(e.target.value)}
            rows={3}
            placeholder="correo1@ejemplo.com, correo2@ejemplo.com…"
            className={`py-2 ${field}`}
          />
        )}
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={10}
          placeholder="Pega aquí el HTML del correo…"
          className={`py-2 font-mono text-[12px] ${field}`}
        />
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="rounded-full border-[1.5px] border-teal px-4 py-2 text-[12.5px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            {preview ? "Ocultar vista previa" : "Vista previa"}
          </button>
          {isSuper && (
            <button
              type="button"
              disabled={pending || !subject.trim() || html.trim().length < 20}
              onClick={() =>
                startTransition(async () => {
                  setMsg(null);
                  const res = await sendExtraordinaryEmail({
                    subject,
                    html,
                    audience,
                    lista,
                  });
                  setMsg(
                    "error" in res && res.error
                      ? res.error
                      : `Enviado a ${(res as { enviados: number; total: number }).enviados} de ${(res as { total: number }).total} destinatarios ✓`,
                  );
                })
              }
              className="rounded-full bg-teal px-5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
            >
              {pending ? "Enviando…" : "Enviar ahora"}
            </button>
          )}
        </div>
        {msg && (
          <span
            className={`text-xs font-semibold ${msg.includes("✓") ? "text-success-text" : "text-error-text"}`}
          >
            {msg}
          </span>
        )}
        {preview && (
          <div className="rounded-[12px] border-[1.5px] border-border-input p-4">
            <span className="mb-2 block text-[11px] font-extrabold text-ink-tertiary">
              VISTA PREVIA
            </span>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
      </div>

      {/* Recordatorios de datos faltantes */}
      <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
          RECORDATORIOS DE DATOS FALTANTES
        </span>
        <p className="text-[13px] leading-normal text-ink-secondary">
          Envía el correo «Recordatorio de datos faltantes» (editable en
          Comunicados) a todos los miembros activos con el perfil incompleto,
          con la lista exacta de lo que le falta a cada quien. El envío
          automático semanal se activa con el cron{" "}
          <code className="rounded bg-cream px-1.5 py-0.5 text-[11.5px]">
            /api/cron/documentos
          </code>{" "}
          cuando la cuenta de Vercel sea Pro.
        </p>
        {isSuper && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setReminderMsg(null);
                const res = await sendMissingDocsReminders();
                setReminderMsg(
                  "error" in res && (res as { error?: string }).error
                    ? ((res as { error?: string }).error ?? "Error")
                    : `Enviados ${(res as { enviados: number }).enviados} recordatorios (de ${(res as { candidatos: number }).candidatos} perfiles incompletos) ✓`,
                );
              })
            }
            className="self-start rounded-full bg-teal px-5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
          >
            {pending ? "Enviando…" : "Enviar recordatorios ahora"}
          </button>
        )}
        {reminderMsg && (
          <span
            className={`text-xs font-semibold ${reminderMsg.includes("✓") ? "text-success-text" : "text-error-text"}`}
          >
            {reminderMsg}
          </span>
        )}
      </div>
    </div>
  );
}
