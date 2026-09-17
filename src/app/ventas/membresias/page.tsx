import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortal } from "@/lib/panel-guard";
import { CATALOGO_BENEFICIOS } from "@/lib/plans/benefits";
import {
  Planes,
  type BeneficioEditable,
  type VersionFila,
} from "@/components/panel/membresias/Planes";
import {
  Cupones,
  type CuponFila,
} from "@/components/panel/membresias/Cupones";
import {
  MigrarCohorte,
  type VersionOpcion,
} from "@/components/panel/membresias/MigrarCohorte";
import { usosDeCupones } from "@/lib/plans/cupones";
import { CAMPAIGNS, campaignCouponKey } from "@/lib/landings";

export const metadata = { title: "Membresías · Portal de ventas" };

export default async function MembresiasPage() {
  const session = await requirePortal("ventas");
  const admin = createAdminClient();

  const [
    { data: planes },
    { data: versiones },
    { data: legales },
    { data: subs },
    { data: cupones },
    { data: ajustes },
    usosStripe,
  ] = await Promise.all([
      admin
        .from("membership_plans")
        .select("id, slug, name, description, is_public")
        .is("archived_at", null)
        .order("position"),
      admin
        .from("plan_versions")
        .select(
          "id, plan_id, version, interval, price_cents, additional_price_cents, benefits, status, stripe_price_id, legal_confirmed_at, notes",
        )
        .order("version", { ascending: false }),
      admin
        .from("legal_documents")
        .select("id, title, slug")
        .order("title"),
      admin.from("subscriptions").select("plan_version_id"),
      admin
        .from("promo_coupons")
        .select(
          "id, code, nombre, tipo, porcentaje, monto_cents, duracion, duracion_meses, vence_el, usos_max, plan_id, stripe_promotion_code_id, activo, notas",
        )
        .order("created_at", { ascending: false }),
      admin
        .from("site_settings")
        .select("key, value")
        .in("key", CAMPAIGNS.map((c) => campaignCouponKey(c.slug))),
      // Los usos viven en Stripe, no en nuestra base: una copia se
      // desincronizaría con el primer canje hecho fuera del portal.
      usosDeCupones(),
    ]);

  const miembrosPorVersion = new Map<string, number>();
  for (const s of subs ?? [])
    if (s.plan_version_id)
      miembrosPorVersion.set(
        s.plan_version_id,
        (miembrosPorVersion.get(s.plan_version_id) ?? 0) + 1,
      );

  const ORDEN_CATALOGO = Object.keys(CATALOGO_BENEFICIOS);
  const beneficios: BeneficioEditable[] = Object.entries(CATALOGO_BENEFICIOS).map(
    ([llave, def]) => ({
      llave,
      label: def.label,
      tipo: def.tipo,
      unidad: "unidad" in def ? def.unidad : undefined,
      porOmision: def.porOmision,
      vinculante: def.vinculante,
      consumidoPor: [...def.consumidoPor],
    }),
  );

  const filasDe = (planId: string): VersionFila[] =>
    (versiones ?? [])
      .filter((v) => v.plan_id === planId)
      .map((v) => {
        const dif = (v.benefits as Record<string, unknown>) ?? {};
        return {
          id: v.id,
          version: v.version,
          interval: v.interval as "month" | "year",
          precioPesos: v.price_cents / 100,
          precioAdicionalPesos:
            v.additional_price_cents == null ? null : v.additional_price_cents / 100,
          estado: v.status,
          // En el orden del catálogo (el jsonb no guarda orden) y legibles.
          diferencias: Object.entries(dif)
            .sort(
              ([a], [b]) =>
                ORDEN_CATALOGO.indexOf(a) - ORDEN_CATALOGO.indexOf(b),
            )
            .map(([llave, valor]) => {
              const def = CATALOGO_BENEFICIOS[llave as keyof typeof CATALOGO_BENEFICIOS];
              return {
                label: def?.label ?? llave,
                valor:
                  typeof valor === "boolean"
                    ? valor
                      ? "sí"
                      : "no"
                    : `${Number(valor).toLocaleString("es-MX")}${def && "unidad" in def && def.unidad ? ` ${def.unidad}` : ""}`,
                vinculante: def?.vinculante ?? false,
              };
            }),
          tienePrecioStripe: !!v.stripe_price_id,
          legalConfirmado: !!v.legal_confirmed_at,
          miembros: miembrosPorVersion.get(v.id) ?? 0,
          notas: v.notes,
        };
      });

  const esSuper = session.role === "super_admin";
  const puedeAdministrar = session.can["membresias.administrar"];

  const nombrePlan = new Map((planes ?? []).map((p) => [p.id, p.name]));
  const DURACION: Record<string, string> = {
    once: "solo el primer cobro",
    repeating: "los primeros meses",
    forever: "siempre",
  };

  const filasCupones: CuponFila[] = (cupones ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    nombre: c.nombre,
    descuento:
      c.tipo === "porcentaje"
        ? `${Number(c.porcentaje)}% de descuento`
        : `$${((c.monto_cents ?? 0) / 100).toLocaleString("es-MX")} MXN de descuento`,
    duracion:
      c.duracion === "repeating"
        ? `los primeros ${c.duracion_meses} mes(es)`
        : (DURACION[c.duracion] ?? c.duracion),
    venceEl: c.vence_el
      ? new Date(c.vence_el).toLocaleDateString("es-MX", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null,
    // null = Stripe no respondió. Se distingue de 0 usos a propósito.
    usos: c.stripe_promotion_code_id
      ? (usosStripe.get(c.stripe_promotion_code_id) ?? null)
      : null,
    usosMax: c.usos_max,
    planNombre: c.plan_id ? (nombrePlan.get(c.plan_id) ?? null) : null,
    activo: c.activo,
    notas: c.notas,
  }));

  const opcionesDeVersion: VersionOpcion[] = (versiones ?? []).map((v) => ({
    id: v.id,
    etiqueta: `${nombrePlan.get(v.plan_id) ?? "Plan"} · v${v.version} ${
      v.interval === "year" ? "anual" : "mensual"
    } · $${(v.price_cents / 100).toLocaleString("es-MX")} · ${v.status}`,
    publicada: v.status === "publicada",
  }));

  const palabraDeCampana = new Map(
    (ajustes ?? []).map((a) => [a.key, a.value as string]),
  );
  const campanas = CAMPAIGNS.filter((c) => c.active).map((c) => ({
    slug: c.slug,
    nombre: c.name,
    palabraActual: palabraDeCampana.get(campaignCouponKey(c.slug)) ?? "",
  }));

  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:px-[30px] md:py-[26px]">
      <h1 className="font-display text-[24px] text-ink-title">Membresías</h1>

      <p className="text-[12.5px] leading-snug text-ink-secondary">
        Cada versión es una foto de precio y beneficios. Publicar una versión
        nueva <strong>no toca a los miembros actuales</strong>: cada quien se
        rige por lo que contrató. Los beneficios marcados{" "}
        <span className="rounded-full bg-orange/15 px-1.5 py-0.5 text-[11px] font-bold text-orange">
          reglamento
        </span>{" "}
        están escritos en el documento legal que la persona aceptó, así que solo
        los cambia un super admin y publicarlos exige señalar el reglamento que
        ya los refleja.
      </p>

      {(planes ?? []).map((p) => (
        <Planes
          key={p.id}
          planId={p.id}
          planNombre={p.name}
          versiones={filasDe(p.id)}
          beneficios={beneficios}
          documentosLegales={(legales ?? []).map((l) => ({
            id: l.id,
            titulo: l.title,
          }))}
          esSuper={esSuper}
          puedeAdministrar={puedeAdministrar}
        />
      ))}

      {(planes ?? []).length === 0 && (
        <p className="rounded-[16px] bg-white px-5 py-10 text-center text-[13px] text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          No hay planes todavía.
        </p>
      )}

      {esSuper && (
        <>
          <hr className="my-2 border-border-input/60" />
          <MigrarCohorte
            versiones={opcionesDeVersion}
            documentosLegales={(legales ?? []).map((l) => ({
              id: l.id,
              titulo: l.title,
            }))}
          />
        </>
      )}

      <hr className="my-2 border-border-input/60" />

      <Cupones
        cupones={filasCupones}
        planes={(planes ?? []).map((p) => ({ id: p.id, nombre: p.name }))}
        campanas={campanas}
        puedeAdministrar={puedeAdministrar}
      />
    </div>
  );
}
