import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortal } from "@/lib/panel-guard";
import { leerAjustesIA } from "@/lib/llm/gobierno";
import { enPesos } from "@/lib/newsletter/costos";
import type { MaterialInvestigado } from "@/lib/newsletter/agentes";
import {
  Newsletter,
  type EdicionFila,
  type PlantillaFila,
  type ProgramacionFila,
  type TemaFila,
} from "@/components/panel/newsletter/Newsletter";

export const metadata = { title: "Boletín · Portal de ventas" };

export default async function NewsletterPage() {
  const session = await requirePortal("ventas");
  const admin = createAdminClient();

  const [
    { data: programaciones },
    { data: temas },
    { data: ediciones },
    { data: plantillas },
    { data: corridas },
    { data: suscriptores },
    ajustes,
  ] = await Promise.all([
    admin
      .from("newsletter_schedule")
      .select("id, name, cadence, weekday, month_day, starts_on, ends_on, is_active")
      .order("created_at", { ascending: false }),
    admin
      .from("newsletter_topics")
      .select(
        "id, schedule_id, planned_for, title, brief, must_include, must_avoid, sources, is_health, status",
      )
      .order("planned_for"),
    admin
      .from("newsletter_editions")
      .select(
        "id, topic_id, subject, preheader, blocks, html, template_id, status, topic_is_health, vet_reviewed_at, approved_by, approved_at, review_note, test_sent_at, scheduled_for",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("newsletter_templates")
      .select("id, name, description, layout, sample, is_default")
      .order("name"),
    admin
      .from("newsletter_runs")
      .select("id, edition_id, kind, model, output, cost_cents, error, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("newsletter_subscribers").select("status"),
    leerAjustesIA(admin),
  ]);

  const activos = (suscriptores ?? []).filter((s) => s.status === "activo").length;

  // El material que se enseña es el de la ÚLTIMA investigación de cada edición.
  const materialPorEdicion = new Map<string, MaterialInvestigado>();
  const costoPorEdicion = new Map<string, number>();
  const corridasPorEdicion = new Map<
    string,
    { kind: string; model: string; costo: number; error: string | null; cuando: string }[]
  >();

  for (const c of corridas ?? []) {
    costoPorEdicion.set(c.edition_id, (costoPorEdicion.get(c.edition_id) ?? 0) + (c.cost_cents ?? 0));
    corridasPorEdicion.set(c.edition_id, [
      ...(corridasPorEdicion.get(c.edition_id) ?? []),
      {
        kind: c.kind,
        model: c.model,
        costo: c.cost_cents ?? 0,
        error: c.error,
        cuando: c.created_at,
      },
    ]);
    if (c.kind === "investigacion" && !c.error && !materialPorEdicion.has(c.edition_id))
      materialPorEdicion.set(c.edition_id, c.output as MaterialInvestigado);
  }

  const edicionPorTema = new Map<string, EdicionFila>();
  for (const e of ediciones ?? []) {
    if (edicionPorTema.has(e.topic_id)) continue; // la más reciente manda
    edicionPorTema.set(e.topic_id, {
      id: e.id,
      temaId: e.topic_id,
      asunto: e.subject,
      preencabezado: e.preheader,
      bloques: (e.blocks as EdicionFila["bloques"]) ?? [],
      html: e.html,
      plantillaId: e.template_id,
      estado: e.status,
      esDeSalud: e.topic_is_health,
      revisionVet: !!e.vet_reviewed_at,
      aprobada: !!e.approved_by,
      notaDeRevision: e.review_note,
      pruebaEnviada: !!e.test_sent_at,
      programadaPara: e.scheduled_for,
      material: materialPorEdicion.get(e.id) ?? null,
      costoTexto: enPesos(costoPorEdicion.get(e.id) ?? 0),
      corridas: (corridasPorEdicion.get(e.id) ?? []).map((c) => ({
        tipo: c.kind,
        modelo: c.model,
        costoTexto: enPesos(c.costo),
        error: c.error,
        cuando: c.cuando,
      })),
    });
  }

  const filasTemas: TemaFila[] = (temas ?? []).map((t) => ({
    id: t.id,
    fecha: t.planned_for,
    titulo: t.title,
    brief: t.brief,
    incluir: t.must_include,
    evitar: t.must_avoid,
    fuentes: Array.isArray(t.sources) ? (t.sources as string[]) : [],
    esSalud: t.is_health,
    estado: t.status,
    edicion: edicionPorTema.get(t.id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-4 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-[24px] text-ink-title">Boletín</h1>
        <Link
          href="/ventas/newsletter/audiencia"
          className="rounded-full border border-teal px-4 py-1.5 text-[12.5px] font-bold text-teal"
        >
          Audiencia y bajas de correo →
        </Link>
      </div>

      <p className="text-[12.5px] leading-snug text-ink-secondary">
        Un tema <strong>sin brief no se puede investigar</strong>: tener a una
        persona al final es corrección, tenerla al principio es dirección. Y
        antes de programar un envío hacen falta tres cosas —{" "}
        <strong>aprobación</strong>, <strong>prueba enviada</strong> y{" "}
        <strong>revisión veterinaria si el tema toca salud</strong> — que la
        base de datos exige aunque esta pantalla se equivoque.
      </p>

      <Newsletter
        programaciones={(programaciones ?? []) as ProgramacionFila[]}
        temas={filasTemas}
        plantillas={(plantillas ?? []) as PlantillaFila[]}
        suscriptoresActivos={activos}
        hayCorreosDePrueba={Boolean((ajustes.boletin_correos_prueba ?? "").trim())}
        topeEdicion={ajustes.boletin_tope_edicion_mxn ?? "0"}
        puedeRedactar={session.can["boletin.redactar"]}
        puedeAprobar={session.can["boletin.aprobar"]}
        puedeProgramar={session.can["boletin.programar"]}
        puedeRevisionVet={session.can["boletin.revision_vet"]}
        puedePlantillas={session.can["boletin.plantillas"]}
      />
    </div>
  );
}
