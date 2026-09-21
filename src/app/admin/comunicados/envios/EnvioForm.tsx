"use client";

import { useState, useTransition } from "react";
import {
  sendExtraordinaryEmail,
  sendMissingDocsReminders,
  sendPendingPaymentReminders,
  sendRenewalReminders,
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
export function EnvioForm({
  isSuper,
  diasConfigurados,
  diasPerfil,
  diasPago,
}: {
  isSuper: boolean;
  /** Lo que hoy dice el ajuste de /admin/sitio, para no mandar a ciegas. */
  diasConfigurados: string;
  /** Días de la secuencia de perfil incompleto (21-sep). */
  diasPerfil: string;
  /** Días de la secuencia de registro sin pagar (21-sep). */
  diasPago: string;
}) {
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [audience, setAudience] = useState<EmailAudience>("miembros_activos");
  const [lista, setLista] = useState("");
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  const [pagoMsg, setPagoMsg] = useState<string | null>(null);
  const [renovMsg, setRenovMsg] = useState<string | null>(null);

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
                      : (() => {
                          const r = res as {
                            enviados: number;
                            total: number;
                            bloqueados?: number;
                          };
                          const base = `Enviado a ${r.enviados} de ${r.total} destinatarios ✓`;
                          // En pruebas la reja bloquea a los que no son del
                          // equipo: decirlo evita leer "salieron todos".
                          return r.bloqueados
                            ? `${base} · ${r.bloqueados} bloqueado${r.bloqueados === 1 ? "" : "s"} por la reja de pruebas`
                            : base;
                        })(),
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
          Comunicados) a los miembros activos con el perfil incompleto, con la
          lista exacta de lo que le falta a cada quien. <strong>Son tres avisos
          por persona y se acaban</strong>: los días se configuran en Sitio web
          → «Recordatorios de perfil incompleto» (hoy: {diasPerfil || "apagado"}).
          Sale solo todos los días a las 10:30 de la mañana; este botón sirve
          para adelantarlo y es seguro apretarlo de más — cada aviso queda
          registrado y no se manda dos veces.
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
                    : (() => {
                        const r = res as {
                          enviados: number;
                          candidatos: number;
                          bloqueados?: number;
                        };
                        const base = `Enviados ${r.enviados} recordatorios (de ${r.candidatos} perfiles incompletos) ✓`;
                        return r.bloqueados
                          ? `${base} · ${r.bloqueados} bloqueado${r.bloqueados === 1 ? "" : "s"} por la reja de pruebas`
                          : base;
                      })(),
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

      {/* REGISTRO SIN PAGAR (21-sep): el embudo más caro. Misma mecánica que
          el de perfil — tres avisos por persona, asentados en la base. */}
      <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
          REGISTRO SIN PAGAR
        </span>
        <p className="text-[13px] leading-normal text-ink-secondary">
          Envía el correo «Registro sin pagar» a quien creó su cuenta en los
          últimos 30 días y no terminó el pago. <strong>Son tres avisos por
          persona</strong>; los días se configuran en Sitio web →
          «Recordatorios de registro sin pagar» (hoy: {diasPago || "apagado"}).
          No lo recibe quien ya tiene una membresía viva.
        </p>
        {isSuper && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setPagoMsg(null);
                const res = await sendPendingPaymentReminders();
                const r = res as {
                  enviados: number;
                  candidatos: number;
                  bloqueados?: number;
                  yaAlDia?: number;
                  dias?: number[];
                };
                if (!r.dias?.length) {
                  setPagoMsg(
                    "No hay días configurados: revisa Sitio web → Recordatorios de registro sin pagar.",
                  );
                  return;
                }
                const partes = [
                  `Enviados ${r.enviados} avisos (de ${r.candidatos} registros sin pagar) ✓`,
                ];
                if (r.yaAlDia) partes.push(`${r.yaAlDia} ya estaban al día`);
                if (r.bloqueados)
                  partes.push(
                    `${r.bloqueados} bloqueado${r.bloqueados === 1 ? "" : "s"} por la reja de pruebas`,
                  );
                setPagoMsg(partes.join(" · "));
              })
            }
            className="self-start rounded-full bg-teal px-5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
          >
            {pending ? "Enviando…" : "Enviar avisos de registro sin pagar"}
          </button>
        )}
        {pagoMsg && (
          <span
            className={`text-xs font-semibold ${pagoMsg.includes("✓") ? "text-success-text" : "text-error-text"}`}
          >
            {pagoMsg}
          </span>
        )}
      </div>

      {/* RECORDATORIOS DE RENOVACIÓN (2-sep). Mientras el cron no esté
          agendado en el `vercel.json` de producción, este botón es el único
          camino — y es seguro apretarlo de más: cada aviso queda registrado
          con una restricción única y no se manda dos veces. */}
      <div className="flex flex-col gap-2.5 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
        <span className="text-[11px] font-extrabold tracking-[.06em] text-teal-deep">
          RECORDATORIOS DE RENOVACIÓN
        </span>
        <p className="text-[13px] leading-normal text-ink-secondary">
          Avisa al miembro que su membresía se renueva pronto, para que le dé
          tiempo de actualizar su tarjeta si cambió. <strong>Los días de
          anticipación se configuran en Sitio web → «Recordatorios de
          renovación»</strong> (hoy: {diasConfigurados || "apagado"}). No lo
          reciben quienes ya cancelaron ni quienes están en mora — a esos les
          llega otro correo que dice lo contrario.
        </p>
        <p className="text-[12.5px] leading-normal text-ink-tertiary">
          Puedes apretarlo las veces que quieras: cada aviso queda registrado y
          no se manda dos veces.
        </p>
        {isSuper && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setRenovMsg(null);
                const res = await sendRenewalReminders();
                const r = res as {
                  enviados: number;
                  candidatos: number;
                  bloqueados?: number;
                  yaEnviados?: number;
                  dias?: number[];
                };
                if (!r.dias?.length) {
                  setRenovMsg(
                    "No hay días configurados: revisa Sitio web → Recordatorios de renovación.",
                  );
                  return;
                }
                const partes = [
                  `Enviados ${r.enviados} avisos (de ${r.candidatos} que renuevan en ${r.dias.join(" y ")} día(s)) ✓`,
                ];
                if (r.yaEnviados)
                  partes.push(`${r.yaEnviados} ya lo habían recibido`);
                if (r.bloqueados)
                  partes.push(
                    `${r.bloqueados} bloqueado${r.bloqueados === 1 ? "" : "s"} por la reja de pruebas`,
                  );
                setRenovMsg(partes.join(" · "));
              })
            }
            className="self-start rounded-full bg-teal px-5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
          >
            {pending ? "Enviando…" : "Enviar recordatorios de renovación"}
          </button>
        )}
        {renovMsg && (
          <span
            className={`text-xs font-semibold ${renovMsg.includes("✓") ? "text-success-text" : "text-error-text"}`}
          >
            {renovMsg}
          </span>
        )}
      </div>
    </div>
  );
}
