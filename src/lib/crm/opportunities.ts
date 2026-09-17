import type { createAdminClient } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/constants";
import { emitEvent } from "@/lib/crm/events";
import { ALTAS_SON_599, PLAN_599 } from "@/lib/plans/planes";
import { versionVigente } from "@/lib/plans/versiones";

type Admin = ReturnType<typeof createAdminClient>;

/** Llaves estables de las etapas del pipeline por omisión. */
export type StageKey =
  | "nuevo_prospecto"
  | "solicitud_llamada"
  | "registro_iniciado"
  | "carrito_abandonado"
  | "pago_procesado"
  | "miembro_activo"
  | "miembro_inactivo"
  | "perdido";

/**
 * Valor de la oportunidad. El tablero de LynSales tiene 989 tarjetas en
 * MX$0.00 porque nadie captura el monto a mano; aquí se calcula del plan al que
 * apunta la oportunidad.
 *
 * En la fase 3 esto pasa a leer `plan_versions`; mientras, sale de las
 * constantes, que son la misma fuente de verdad que usa el checkout.
 */
/**
 * Valor de una oportunidad: el precio del plan que se vende hoy. Con altas del
 * $599 (sección 8) es el del primer peludo, leído de la versión publicada; si
 * no hay versión, se cae a las constantes del $159 como antes.
 */
export async function valorDelPlanCents(
  admin: Admin,
  interval?: "month" | "year" | null,
): Promise<{ valueCents: number; isEstimate: boolean }> {
  if (ALTAS_SON_599) {
    const v = await versionVigente(admin, interval ?? "year", PLAN_599);
    if (v) return { valueCents: v.price_cents, isEstimate: !interval };
  }
  return planValueCents(interval);
}

export function planValueCents(interval?: "month" | "year" | null): {
  valueCents: number;
  isEstimate: boolean;
} {
  if (interval === "month")
    return { valueCents: PLANS.monthly.amountMxn * 100, isEstimate: false };
  if (interval === "year")
    return { valueCents: PLANS.annual.amountMxn * 100, isEstimate: false };
  // Sin plan elegido todavía: se estima con el plan que promovemos.
  return { valueCents: PLANS.annual.amountMxn * 100, isEstimate: true };
}

/** Pipeline por omisión con sus etapas, en una sola consulta. */
export async function getDefaultPipeline(admin: Admin) {
  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id, name, pipeline_stages(id, key, name, color, position, auto_event, stale_days, is_won, is_lost)")
    .eq("is_default", true)
    .is("archived_at", null)
    .single();
  if (!pipeline) throw new Error("No hay pipeline por omisión");

  const stages = [...(pipeline.pipeline_stages ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  return { id: pipeline.id, name: pipeline.name, stages };
}

export type EnsureOpportunityInput = {
  contactId: string;
  stageKey: StageKey;
  /** Título legible. Si se omite se arma con la plantilla de la etapa. */
  title?: string;
  interval?: "month" | "year" | null;
  source?: string | null;
  ownerId?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  /**
   * Cuándo nació la tarjeta, si no es ahora. El embudo del tablero cuenta
   * `opportunities.created_at`, así que el histórico importado tiene que
   * traerla o las tendencias de los meses anteriores salen vacías y todo el
   * volumen aparece el día de la importación.
   *
   * Mueve también `stage_entered_at`, que es de donde salen "días en etapa" y
   * el aviso de estancada: sin eso, 169 carritos abandonados en mayo entrarían
   * al tablero como recién llegados y tardarían 14 días en levantar la mano.
   */
  createdAt?: string | null;
};

/** Plantillas de título por etapa — el equipo lee así el tablero hoy en LynSales. */
const TITLE_TEMPLATES: Record<StageKey, string> = {
  nuevo_prospecto: "NUEVO PROSPECTO",
  solicitud_llamada: "Solicitó llamada",
  registro_iniciado: "Registro iniciado",
  carrito_abandonado: "Carrito abandonado",
  pago_procesado: "En revisión",
  miembro_activo: "Miembro activo",
  miembro_inactivo: "Miembro inactivo",
  perdido: "Perdido",
};

export function opportunityTitle(
  stageKey: StageKey,
  contactLabel: string | null,
): string {
  const prefix = TITLE_TEMPLATES[stageKey];
  return contactLabel ? `${prefix}: ${contactLabel}` : prefix;
}

/**
 * Crea la oportunidad del contacto si no tiene una abierta en el pipeline por
 * omisión. NO mueve la etapa de una existente: eso lo hace `moveStage` en la
 * fase 1d, que respeta el bloqueo por acción humana.
 */
export async function ensureOpportunity(
  admin: Admin,
  input: EnsureOpportunityInput,
): Promise<{ opportunityId: string; created: boolean }> {
  const pipeline = await getDefaultPipeline(admin);
  const stage = pipeline.stages.find((s) => s.key === input.stageKey);
  if (!stage) throw new Error(`Etapa desconocida: ${input.stageKey}`);

  // Cualquier oportunidad del contacto en este pipeline cuenta, sin importar su
  // estado. Si se filtrara solo por 'abierta', un miembro activo (cuya tarjeta
  // queda 'ganada') recibiría una tarjeta nueva en cada corrida del relleno.
  // "Ensure" significa "que tenga su tarjeta"; crear tarjetas adicionales es un
  // acto deliberado y tiene su propia acción.
  const { data: existente } = await admin
    .from("opportunities")
    .select("id")
    .eq("contact_id", input.contactId)
    .eq("pipeline_id", pipeline.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existente) return { opportunityId: existente.id, created: false };

  let title = input.title;
  if (!title) {
    const { data: contact } = await admin
      .from("contacts")
      .select("first_name, last_name")
      .eq("id", input.contactId)
      .single();
    const label = [contact?.first_name, contact?.last_name]
      .filter(Boolean)
      .join(" ");
    title = opportunityTitle(input.stageKey, label || null);
  }

  const { valueCents, isEstimate } = await valorDelPlanCents(admin, input.interval);
  const status = stage.is_won ? "ganada" : stage.is_lost ? "perdida" : "abierta";

  const { data: created, error } = await admin
    .from("opportunities")
    .insert({
      contact_id: input.contactId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      title,
      value_cents: valueCents,
      value_is_estimate: isEstimate,
      owner_id: input.ownerId ?? null,
      source: input.source ?? null,
      status,
      ...(input.createdAt
        ? {
            created_at: input.createdAt,
            stage_entered_at: input.createdAt,
            updated_at: input.createdAt,
          }
        : {}),
    })
    .select("id")
    .single();
  if (error || !created)
    throw new Error(`No se pudo crear la oportunidad: ${error?.message}`);

  await emitEvent(admin, {
    contactId: input.contactId,
    kind: "etapa_movida",
    summary: `Oportunidad creada en "${stage.name}"`,
    payload: { opportunityId: created.id, stageKey: input.stageKey },
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? "Sistema",
  });

  return { opportunityId: created.id, created: true };
}

export type MoveStageResult =
  | { moved: true; stageName: string }
  | { moved: false; reason: "bloqueada" | "no_existe" | "misma_etapa" };

/**
 * Mueve una oportunidad de etapa.
 *
 * REGLA DE ORO (sección 1, punto 5.2): una automatización NUNCA revierte lo que
 * hizo una persona. Si alguien movió la tarjeta a mano queda `stage_locked_by`,
 * y desde entonces los eventos de plataforma solo dejan rastro en la línea de
 * tiempo sin cambiar la etapa. Sin esto la herramienta pelea con el equipo y el
 * equipo la abandona.
 *
 * `actorId` null significa "lo hizo la plataforma"; con persona, se mueve y se
 * marca el bloqueo.
 */
export async function moveStage(
  admin: Admin,
  input: {
    opportunityId: string;
    stageKey: StageKey;
    actorId?: string | null;
    actorLabel?: string | null;
    lostReasonId?: string | null;
  },
): Promise<MoveStageResult> {
  const { data: opp } = await admin
    .from("opportunities")
    .select("id, contact_id, pipeline_id, stage_id, stage_locked_by, title")
    .eq("id", input.opportunityId)
    .maybeSingle();
  if (!opp) return { moved: false, reason: "no_existe" };

  const pipeline = await getDefaultPipeline(admin);
  const destino = pipeline.stages.find((s) => s.key === input.stageKey);
  if (!destino) return { moved: false, reason: "no_existe" };
  const origen = pipeline.stages.find((s) => s.id === opp.stage_id);

  const esAutomatizacion = !input.actorId;
  if (esAutomatizacion && opp.stage_locked_by) {
    // Se respeta la decisión humana, pero queda constancia de que el evento pasó.
    await emitEvent(admin, {
      contactId: opp.contact_id,
      kind: "etapa_movida",
      summary: `La plataforma habría movido la tarjeta a "${destino.name}", pero alguien del equipo la fijó en "${origen?.name ?? "su etapa"}"`,
      payload: { opportunityId: opp.id, stageKey: input.stageKey, respetado: true },
      actorLabel: input.actorLabel ?? "Sistema",
    });
    return { moved: false, reason: "bloqueada" };
  }

  if (opp.stage_id === destino.id) return { moved: false, reason: "misma_etapa" };

  await admin
    .from("opportunities")
    .update({
      stage_id: destino.id,
      status: destino.is_won ? "ganada" : destino.is_lost ? "perdida" : "abierta",
      lost_reason_id: destino.is_lost ? (input.lostReasonId ?? null) : null,
      stage_entered_at: new Date().toISOString(),
      ...(input.actorId
        ? { stage_locked_by: input.actorId, stage_locked_at: new Date().toISOString() }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opp.id);

  await emitEvent(admin, {
    contactId: opp.contact_id,
    kind: "etapa_movida",
    summary: `${origen?.name ?? "Sin etapa"} → ${destino.name}`,
    payload: { opportunityId: opp.id, stageKey: input.stageKey },
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? "Sistema",
  });

  return { moved: true, stageName: destino.name };
}

/** ¿Lleva demasiado tiempo en su etapa? (umbral por etapa, null = no se vigila) */
export function estancada(
  stageEnteredAt: string,
  staleDays: number | null,
): boolean {
  if (!staleDays) return false;
  const dias = (Date.now() - new Date(stageEnteredAt).getTime()) / 86_400_000;
  return dias > staleDays;
}
