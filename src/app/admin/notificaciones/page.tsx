import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ZONA_MX } from "@/lib/zona-horaria";
import { fetchEventosAdmin } from "@/lib/admin/eventos";

/**
 * Notificaciones: la misma actividad que alimenta la campanita del
 * encabezado, pero como página completa del menú (equipo, 5-ago) — más
 * historial por fuente y con hora exacta. Los eventos se arman en
 * src/lib/admin/eventos.ts: UNA sola fuente para las dos superficies, así
 * los enlaces "al detalle" no se desalinean entre campanita y página.
 */
export default async function AdminNotificacionesPage() {
  const admin = createAdminClient();
  const events = await fetchEventosAdmin(admin, 20);

  const cuando = (iso: string) =>
    new Intl.DateTimeFormat("es-MX", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: ZONA_MX,
    }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] text-ink-title">
          Notificaciones
        </h1>
        <p className="text-sm text-ink-secondary">
          Toda la actividad reciente: reintegros, apelaciones, solicitudes,
          landings y errores del sistema.
        </p>
      </div>
      <div className="flex flex-col rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        {events.map((e) => (
          <Link
            key={e.id}
            href={e.href}
            className="flex items-center gap-3 border-b border-[#F2EEE4] px-1 py-3 text-[13px] text-ink-body transition-colors last:border-0 hover:bg-cream"
          >
            <span aria-hidden className="text-[16px]">
              {e.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{e.text}</span>
            <span className="flex-none text-[11.5px] text-ink-tertiary">
              {cuando(e.created_at)}
            </span>
          </Link>
        ))}
        {events.length === 0 && (
          <span className="py-3 text-sm text-ink-secondary">
            Sin actividad todavía.
          </span>
        )}
      </div>
    </div>
  );
}
