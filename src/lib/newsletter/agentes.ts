import type { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider } from "@/lib/llm";
import { SHARED_GUARDRAILS } from "@/lib/llm/brand-voice";
import { leerAjustesIA } from "@/lib/llm/gobierno";
import { fetchActivePromosText } from "@/lib/llm/promos";
import { revisarTerminologia } from "@/lib/content/terminologia";
import { costoEnCentavos, preciosDe } from "@/lib/newsletter/costos";
import { inicioDelMes } from "@/lib/zona-horaria";
import {
  ESQUEMA_BLOQUES,
  LAYOUT_POR_OMISION,
  normalizarBloques,
  renderCorreo,
  type Bloque,
} from "@/lib/newsletter/bloques";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * LOS DOS AGENTES DEL BOLETÍN — sección 5, punto 3.
 *
 *   investigador → devuelve MATERIAL con fuentes, no prosa terminada
 *   marca        → toma ese material y llena bloques tipados
 *
 * Separarlos no es un capricho: distingue "qué sabemos" de "cómo lo decimos".
 * Se puede rehacer la redacción sin volver a investigar, comparar dos
 * versiones, y auditar de dónde salió cada frase.
 *
 * Las dos corridas quedan guardadas en `newsletter_runs` con su costo. Un
 * agente de investigación sin cuenta clara es una factura sorpresa.
 */

export type Veredicto = { puede: true } | { puede: false; razon: string };

/**
 * ¿Alcanza el presupuesto para otra corrida?
 *
 * Se revisa ANTES de llamar al modelo. Detenerse y avisar es el
 * comportamiento pedido; seguir gastando y avisar después no sirve de nada.
 */
export async function alcanzaElPresupuesto(
  admin: Admin,
  editionId: string,
  ajustes: Record<string, string>,
): Promise<Veredicto> {
  const topeEdicion = Number(ajustes.boletin_tope_edicion_mxn ?? 0);
  const topeMes = Number(ajustes.boletin_tope_mensual_mxn ?? 0);

  if (topeEdicion > 0) {
    const { data } = await admin
      .from("newsletter_runs")
      .select("cost_cents")
      .eq("edition_id", editionId);
    const gastado = (data ?? []).reduce((s, r) => s + (r.cost_cents ?? 0), 0) / 100;
    if (gastado >= topeEdicion)
      return {
        puede: false,
        razon: `Esta edición ya lleva $${gastado.toFixed(2)} MXN y el tope por edición es $${topeEdicion}. Súbelo en Ajustes de IA o trabaja con lo que hay.`,
      };
  }

  if (topeMes > 0) {
    // El mes del tope de gasto es el mexicano, igual que el tope diario de la IA.
    const desde = inicioDelMes();
    const { data } = await admin
      .from("newsletter_runs")
      .select("cost_cents")
      .gte("created_at", desde.toISOString());
    const gastado = (data ?? []).reduce((s, r) => s + (r.cost_cents ?? 0), 0) / 100;
    if (gastado >= topeMes)
      return {
        puede: false,
        razon: `El boletín lleva $${gastado.toFixed(2)} MXN este mes y el tope mensual es $${topeMes}.`,
      };
  }

  return { puede: true };
}

/* ------------------------------------------------------ investigador ------ */

export type Hallazgo = {
  afirmacion: string;
  detalle: string;
  fuente: string | null;
  /** Sin fuente no puede entrar al correo. */
  verificado: boolean;
};

export type MaterialInvestigado = {
  hallazgos: Hallazgo[];
  ideasDeSeccion: string[];
  datosFaltantes: string[];
  dejadoFuera: string[];
};

const ESQUEMA_INVESTIGACION = {
  type: "object",
  properties: {
    hallazgos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          afirmacion: { type: "string" },
          detalle: { type: "string" },
          fuente: {
            type: "string",
            description: "URL o referencia concreta. Vacío si no la tienes.",
          },
        },
        required: ["afirmacion", "detalle"],
      },
    },
    ideasDeSeccion: { type: "array", items: { type: "string" } },
    datosFaltantes: {
      type: "array",
      items: { type: "string" },
      description: "Datos que el brief pedía y NO encontraste. No los inventes.",
    },
    dejadoFuera: { type: "array", items: { type: "string" } },
  },
  required: ["hallazgos", "ideasDeSeccion", "datosFaltantes", "dejadoFuera"],
} as const;

const INSTRUCCION_INVESTIGADOR = `${SHARED_GUARDRAILS}

TU PAPEL
Eres el investigador del boletín de Club Pata Amiga. Devuelves MATERIAL, no el
correo terminado: hallazgos con su fuente, ideas de sección y lo que decidiste
dejar fuera. Otro agente escribirá el texto final.

REGLAS QUE NO SE NEGOCIAN
1. Toda afirmación va con su fuente concreta. Si no tienes fuente, deja el
   campo vacío: se marcará como sin verificar y NO podrá entrar al correo.
2. No inventes cifras, fechas ni estudios. Si el brief pedía un dato y no lo
   tienes, ponlo en datosFaltantes. Es mucho mejor un hueco declarado que un
   número inventado en un boletín de salud de mascotas.
3. Nada de consejo clínico. Puedes decir "muchos veterinarios recomiendan una
   revisión anual, según <fuente>"; no puedes decir qué hacer con un animal
   enfermo, ni sugerir tratamientos, dosis o diagnósticos.
4. Terminología vinculante desde el primer borrador: nunca seguro, póliza,
   cobertura ni carencia. Se dice membresía, beneficios y tiempo de espera.`;

export type ResultadoCorrida<T> =
  | { ok: true; datos: T; costoCentavos: number; demo: boolean; runId: string }
  | { ok: false; error: string };

/** Guarda la corrida (salga bien o mal) y devuelve su id. */
async function anotarCorrida(
  admin: Admin,
  fila: Record<string, unknown>,
): Promise<string> {
  const { data } = await admin
    .from("newsletter_runs")
    .insert(fila)
    .select("id")
    .single();
  return data?.id ?? "";
}

export async function investigar(
  admin: Admin,
  input: {
    editionId: string;
    tema: {
      title: string;
      brief: string;
      must_include: string | null;
      must_avoid: string | null;
      sources: unknown;
      is_health: boolean;
    };
    userId: string;
  },
): Promise<ResultadoCorrida<MaterialInvestigado>> {
  const ajustes = await leerAjustesIA(admin);
  const presupuesto = await alcanzaElPresupuesto(admin, input.editionId, ajustes);
  if (!presupuesto.puede) return { ok: false, error: presupuesto.razon };

  const fuentesSugeridas = Array.isArray(input.tema.sources)
    ? (input.tema.sources as string[]).join("\n")
    : "";

  const prompt = `TEMA: ${input.tema.title}

BRIEF DEL EQUIPO (es la dirección, síguela):
${input.tema.brief}

${input.tema.must_include ? `DEBE INCLUIR:\n${input.tema.must_include}\n` : ""}
${input.tema.must_avoid ? `DEBE EVITAR:\n${input.tema.must_avoid}\n` : ""}
${fuentesSugeridas ? `FUENTES SUGERIDAS POR EL EQUIPO:\n${fuentesSugeridas}\n` : ""}
${input.tema.is_health ? "ESTE TEMA TOCA SALUD ANIMAL: extrema el cuidado, nada que se pueda leer como diagnóstico o tratamiento.\n" : ""}
Devuelve el material para que otro agente escriba el correo.`;

  const inicio = Date.now();
  try {
    const proveedor = getLLMProvider();
    const r = await proveedor.completeJson<MaterialInvestigado>({
      system: INSTRUCCION_INVESTIGADOR,
      prompt,
      schema: ESQUEMA_INVESTIGACION as unknown as Record<string, unknown>,
      maxTokens: 4096,
      demo: MATERIAL_DEMO(input.tema.title),
    });

    // Un hallazgo sin fuente se marca; la interfaz no lo deja insertar.
    const hallazgos: Hallazgo[] = (r.data.hallazgos ?? []).map((h) => ({
      afirmacion: String(h.afirmacion ?? ""),
      detalle: String(h.detalle ?? ""),
      fuente: h.fuente && String(h.fuente).trim() ? String(h.fuente).trim() : null,
      verificado: Boolean(h.fuente && String(h.fuente).trim()),
    }));

    const datos: MaterialInvestigado = {
      hallazgos,
      ideasDeSeccion: r.data.ideasDeSeccion ?? [],
      datosFaltantes: r.data.datosFaltantes ?? [],
      dejadoFuera: r.data.dejadoFuera ?? [],
    };

    const costo = costoEnCentavos(r.tokensIn, r.tokensOut, preciosDe(ajustes));
    const runId = await anotarCorrida(admin, {
      edition_id: input.editionId,
      kind: "investigacion",
      model: r.model,
      input: { tema: input.tema.title, brief: input.tema.brief },
      output: datos,
      sources: hallazgos.map((h) => h.fuente).filter(Boolean),
      tokens_in: r.tokensIn,
      tokens_out: r.tokensOut,
      cost_cents: costo,
      duration_ms: Date.now() - inicio,
      created_by: input.userId,
    });

    return { ok: true, datos, costoCentavos: costo, demo: r.demo, runId };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "El agente falló";
    await anotarCorrida(admin, {
      edition_id: input.editionId,
      kind: "investigacion",
      model: process.env.LLM_MODEL ?? "desconocido",
      input: { tema: input.tema.title },
      error: mensaje,
      duration_ms: Date.now() - inicio,
      created_by: input.userId,
    });
    return { ok: false, error: mensaje };
  }
}

/* ---------------------------------------------------- agente de marca ----- */

export type CorreoRedactado = {
  asunto: string;
  preencabezado: string;
  bloques: Bloque[];
};

export async function redactar(
  admin: Admin,
  input: {
    editionId: string;
    tema: { title: string; brief: string; must_avoid: string | null };
    material: MaterialInvestigado;
    /** Instrucción extra del gerente al pedir que se rehaga. */
    ajuste?: string;
    plantilla: { name: string; layout: string; sample: string | null } | null;
    userId: string;
  },
): Promise<ResultadoCorrida<CorreoRedactado & { html: string }>> {
  const ajustes = await leerAjustesIA(admin);
  const presupuesto = await alcanzaElPresupuesto(admin, input.editionId, ajustes);
  if (!presupuesto.puede) return { ok: false, error: presupuesto.razon };

  // Solo entra al correo lo que tiene fuente. Es la regla del punto 9 de la
  // spec: un boletín de salud de mascotas que inventa datos es un problema.
  const usables = input.material.hallazgos.filter((h) => h.verificado);
  if (usables.length === 0)
    return {
      ok: false,
      error:
        "Ningún hallazgo tiene fuente, así que no hay nada que se pueda publicar. Corre la investigación de nuevo o agrega fuentes a mano.",
    };

  // Las promociones que menciona el boletín son las que están al aire, no las
  // que recuerde el modelo. Se usan las de "ventas": el boletín vende.
  const promos = (await fetchActivePromosText("sales").catch(() => undefined)) ?? "";

  const instruccion = `${SHARED_GUARDRAILS}

TU PAPEL
Eres el agente de marca del boletín de Club Pata Amiga. Recibes material ya
investigado y armas el correo llenando BLOQUES. No escribes HTML: la
plataforma lo renderiza con la plantilla${input.plantilla ? ` "${input.plantilla.name}"` : ""}.

REGLAS
1. Solo puedes usar los hallazgos que te paso. No agregues datos, cifras ni
   afirmaciones que no estén ahí.
2. Terminología vinculante: nunca seguro, póliza, cobertura ni carencia.
3. Nada de consejo clínico ni promesas de resultados.
4. El asunto, máximo 60 caracteres. El preencabezado, máximo 100.
5. Empieza con un bloque de encabezado y termina con uno de cierre.
${promos ? `\nPROMOCIONES VIGENTES (usa solo estas si mencionas alguna):\n${promos}` : ""}
${input.plantilla?.sample ? `\nEJEMPLO DE REFERENCIA DE LA MARCA:\n${input.plantilla.sample}` : ""}`;

  const prompt = `TEMA: ${input.tema.title}
BRIEF: ${input.tema.brief}
${input.tema.must_avoid ? `EVITAR: ${input.tema.must_avoid}` : ""}

MATERIAL CON FUENTE (lo único que puedes usar):
${usables.map((h, i) => `${i + 1}. ${h.afirmacion}\n   ${h.detalle}\n   Fuente: ${h.fuente}`).join("\n")}

IDEAS DE SECCIÓN: ${input.material.ideasDeSeccion.join(" · ") || "(ninguna)"}
${input.ajuste ? `\nAJUSTE PEDIDO POR EL GERENTE:\n${input.ajuste}` : ""}

Arma el correo.`;

  const inicio = Date.now();
  try {
    const proveedor = getLLMProvider();
    const r = await proveedor.completeJson<{
      asunto: string;
      preencabezado: string;
      bloques: unknown;
    }>({
      system: instruccion,
      prompt,
      schema: ESQUEMA_BLOQUES as unknown as Record<string, unknown>,
      maxTokens: 4096,
      demo: CORREO_DEMO(input.tema.title, usables),
    });

    const bloques = normalizarBloques(r.data.bloques);
    const asunto = String(r.data.asunto ?? "").slice(0, 120);
    const preencabezado = String(r.data.preencabezado ?? "").slice(0, 160);

    // La terminología se revisa AQUÍ también, no solo al aprobar: si el agente
    // se resbala, se ve en la corrida y no doce pasos después.
    const problemas = revisarTerminologia(
      `${asunto} ${preencabezado} ${bloques.map((b) => JSON.stringify(b)).join(" ")}`,
    );

    const html = renderCorreo({
      layout: input.plantilla?.layout ?? LAYOUT_POR_OMISION,
      asunto,
      preencabezado,
      bloques,
      enlaceBaja: "{{ENLACE_BAJA}}",
    });

    const costo = costoEnCentavos(r.tokensIn, r.tokensOut, preciosDe(ajustes));
    const runId = await anotarCorrida(admin, {
      edition_id: input.editionId,
      kind: "redaccion",
      model: r.model,
      input: { tema: input.tema.title, ajuste: input.ajuste ?? null },
      output: { asunto, preencabezado, bloques, problemas },
      sources: usables.map((h) => h.fuente),
      tokens_in: r.tokensIn,
      tokens_out: r.tokensOut,
      cost_cents: costo,
      duration_ms: Date.now() - inicio,
      created_by: input.userId,
    });

    return {
      ok: true,
      datos: { asunto, preencabezado, bloques, html },
      costoCentavos: costo,
      demo: r.demo,
      runId,
    };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "El agente falló";
    await anotarCorrida(admin, {
      edition_id: input.editionId,
      kind: "redaccion",
      model: process.env.LLM_MODEL ?? "desconocido",
      input: { tema: input.tema.title },
      error: mensaje,
      duration_ms: Date.now() - inicio,
      created_by: input.userId,
    });
    return { ok: false, error: mensaje };
  }
}

/* --------------------------------------------------- modo demostración ---- */
/* Sin ANTHROPIC_API_KEY el circuito completo se puede recorrer igual. Los
   textos dicen que son de demostración: hacer pasar un ejemplo por trabajo del
   modelo sería peor que no tenerlo. */

function MATERIAL_DEMO(tema: string): MaterialInvestigado {
  return {
    hallazgos: [
      {
        afirmacion: `[Demostración] Dato de ejemplo sobre "${tema}".`,
        detalle:
          "Con la IA conectada (LLM_PROVIDER=anthropic) aquí llegaría material real con su fuente.",
        fuente: "https://ejemplo.mx/fuente-de-demostracion",
        verificado: true,
      },
      {
        afirmacion: "[Demostración] Afirmación SIN fuente, para ver la regla en acción.",
        detalle: "Este hallazgo no se puede usar en el correo justamente por eso.",
        fuente: null,
        verificado: false,
      },
    ],
    ideasDeSeccion: ["Apertura", "Consejo del mes", "Cierre con llamada a la acción"],
    datosFaltantes: ["[Demostración] Un dato que el brief pedía y no se encontró."],
    dejadoFuera: ["[Demostración] Material descartado por no venir al caso."],
  };
}

function CORREO_DEMO(tema: string, usables: Hallazgo[]) {
  return {
    asunto: `[Demo] ${tema}`.slice(0, 60),
    preencabezado: "Boletín de demostración — sin IA conectada",
    bloques: [
      { tipo: "encabezado", texto: tema },
      {
        tipo: "texto",
        texto:
          "Este correo se armó en modo demostración, sin llamar al modelo. Con la IA conectada aquí iría el texto de marca.",
      },
      ...usables.slice(0, 2).map((h) => ({
        tipo: "consejo",
        titulo: "Del material investigado",
        texto: `${h.afirmacion} (${h.fuente})`,
      })),
      {
        tipo: "cta",
        texto: "Cuida a tu manada con Club Pata Amiga.",
        etiquetaBoton: "Conocer la membresía",
        url: "https://www.pataamiga.mx",
      },
      { tipo: "cierre", texto: "Con cariño, el equipo de Pata Amiga 🐾" },
    ],
  };
}
