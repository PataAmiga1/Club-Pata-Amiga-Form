import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortal } from "@/lib/panel-guard";
import {
  EditorPlantillas,
  type PlantillaFila,
} from "@/components/panel/bandeja/EditorPlantillas";
import { SincronizarFlowly } from "@/components/panel/bandeja/SincronizarFlowly";

export const metadata = { title: "Plantillas · Portal de ventas" };

export default async function PlantillasPage() {
  const session = await requirePortal("ventas");
  const admin = createAdminClient();

  const [{ data: plantillas }, { data: whatsapp }] = await Promise.all([
    admin
      .from("message_templates")
      .select("id, name, category, channels, subject, body, usos, archived_at")
      .order("archived_at", { nullsFirst: true })
      .order("usos", { ascending: false }),
    admin
      .from("whatsapp_templates")
      .select("meta_name, category, body_preview, status, language, provider, supported")
      .order("meta_name"),
  ]);

  const filas: PlantillaFila[] = (plantillas ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    channels: (p.channels as string[]) ?? [],
    subject: p.subject,
    body: p.body,
    usos: p.usos,
    archivada: !!p.archived_at,
  }));

  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/ventas/conversaciones"
          className="text-[13px] font-semibold text-ink-tertiary hover:text-teal"
        >
          ← Conversaciones
        </Link>
        <h1 className="font-display text-[24px] text-ink-title">
          Plantillas de respuesta
        </h1>
      </div>

      <p className="text-[12.5px] leading-snug text-ink-secondary">
        Respuestas <strong>uno a uno</strong> para la bandeja, en cualquier canal.
        No son los correos automáticos de la plataforma (bienvenida, reintegro
        aprobado, cumpleaños): esos viven en{" "}
        <Link href="/admin/comunicados" className="underline">
          Comunicados
        </Link>{" "}
        y los edita administración. Separarlos evita que alguien cambie sin querer
        el correo que le llega a toda la base.
      </p>

      <EditorPlantillas
        plantillas={filas}
        puedeAdministrar={session.can["contactos.fusionar"]}
      />

      {/* Plantillas de Meta: catálogo de solo lectura */}
      <div className="flex flex-col gap-2.5 rounded-[16px] bg-white p-[18px] shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        <h2 className="text-[15px] font-bold text-ink-title">
          Plantillas de WhatsApp aprobadas por Meta
        </h2>
        <p className="text-[12px] leading-snug text-ink-secondary">
          Son las únicas con las que se puede reabrir una conversación de WhatsApp
          fuera de la ventana de 24 horas. Las aprueba Meta (1–3 semanas) y aquí
          solo se consultan: el compositor ofrece las que estén{" "}
          <strong>aprobadas</strong> y deja las demás apagadas.
        </p>
        {session.can["canales.administrar"] && <SincronizarFlowly />}
        {(whatsapp ?? []).map((p) => (
          <div
            key={p.meta_name}
            className="flex flex-wrap items-center gap-2 rounded-[10px] bg-cream px-3 py-2"
          >
            <span className="text-[12.5px] font-bold text-ink-title">
              {p.meta_name}
            </span>
            <span className="text-[10.5px] text-ink-tertiary">
              {p.language} · {p.category}
              {p.provider === "flowly" ? " · Flowly" : ""}
              {p.supported === false ? " · no se puede enviar desde la plataforma" : ""}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                p.status === "aprobada"
                  ? "bg-lime/30 text-ink-title"
                  : "bg-orange/20 text-ink-title"
              }`}
            >
              {p.status}
            </span>
            <span className="w-full text-[11.5px] text-ink-body">
              {p.body_preview}
            </span>
          </div>
        ))}
        {(whatsapp ?? []).length === 0 && (
          <span className="text-[12.5px] text-ink-tertiary">
            Sin plantillas registradas.
          </span>
        )}
      </div>
    </div>
  );
}
