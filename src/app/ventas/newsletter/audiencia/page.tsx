import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortal } from "@/lib/panel-guard";
import { ETIQUETA_ORIGEN, type OrigenBaja } from "@/lib/correo/bajas";
import { BajasCorreo, CargarAudiencia, type FilaBajaVista } from "./Audiencia";

export const metadata = { title: "Audiencia y bajas · Portal de ventas" };

const fmt = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AudienciaPage() {
  const session = await requirePortal("ventas");
  const admin = createAdminClient();

  const [{ data: suscriptores }, { data: bajas }] = await Promise.all([
    admin.from("newsletter_subscribers").select("status, source"),
    session.can["bajas.ver"]
      ? admin
          .from("correo_bajas")
          .select("email, baja_at, origen, contact_id")
          .not("baja_at", "is", null)
          .order("baja_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const porOrigen = new Map<string, number>();
  let activos = 0;
  for (const s of suscriptores ?? []) {
    if (s.status !== "activo") continue;
    activos++;
    porOrigen.set(s.source ?? "—", (porOrigen.get(s.source ?? "—") ?? 0) + 1);
  }

  const filas: FilaBajaVista[] = (bajas ?? []).map((b) => ({
    email: b.email as string,
    cuando: b.baja_at ? fmt.format(new Date(b.baja_at as string)) : "",
    origen: ETIQUETA_ORIGEN[(b.origen as OrigenBaja) ?? "equipo"] ?? String(b.origen ?? ""),
    contactId: (b.contact_id as string | null) ?? null,
  }));

  return (
    <div className="flex flex-col gap-5 px-4 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-col gap-1">
        <Link href="/ventas/newsletter" className="text-[12px] font-semibold text-ink-tertiary underline">
          ← Boletín
        </Link>
        <h1 className="font-display text-[24px] text-ink-title">Audiencia y bajas de correo</h1>
        <p className="text-[12.5px] leading-snug text-ink-secondary">
          A quién le llega el boletín y quién pidió que ya no le escribamos. Quien
          está en las <strong>bajas</strong> no recibe el boletín ni ningún correo
          masivo o de campaña; los correos de su cuenta (cobros, reintegros,
          avisos legales) sí le siguen llegando.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-[16px] bg-white p-4 shadow-[0_1px_8px_rgba(30,83,80,.06)] md:p-5">
        <h2 className="font-display text-[18px] text-ink-title">
          Suscriptores activos del boletín: {activos}
        </h2>
        <div className="flex flex-wrap gap-2">
          {[...porOrigen.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([origen, n]) => (
              <span
                key={origen}
                className="rounded-full bg-cream px-3 py-1 text-[12px] font-semibold text-ink-secondary"
              >
                {etiquetaFuente(origen)}: {n}
              </span>
            ))}
        </div>
        {session.can["boletin.audiencia"] ? (
          <CargarAudiencia />
        ) : (
          <p className="text-[12px] text-ink-tertiary">
            Cargar la audiencia lo hace administración.
          </p>
        )}
      </section>

      {session.can["bajas.ver"] && (
        <BajasCorreo filas={filas} puedeAdministrar={session.can["bajas.administrar"]} />
      )}
    </div>
  );
}

function etiquetaFuente(source: string) {
  if (source === "landing") return "Pie de página del sitio";
  if (source === "sitio_anterior") return "Sitio anterior";
  if (source === "miembro") return "Miembros";
  if (source.startsWith("landing:")) return `Landing ${source.slice(8)}`;
  return source;
}
