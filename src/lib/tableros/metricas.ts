import type { createAdminClient } from "@/lib/supabase/admin";
import { resumenDeIngresos } from "@/lib/plans/ingresos";
import {
  diaEnMexico,
  diasDelRango,
  finDelDia,
  inicioDelDia,
  mediana,
  porcentaje,
  variacion,
  type Rango,
} from "@/lib/tableros/rango";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * MÉTRICAS DEL TABLERO — sección 7, punto 2.
 *
 * Dos reglas que atraviesan todo el archivo:
 *
 *  1. **Los permisos se aplican en la CONSULTA, no ocultando columnas.** Un
 *     `ventas` no recibe los números de sus compañeros; no es que no se
 *     pinten, es que no vienen.
 *  2. **Ningún número sale sin su referencia.** Cada tarjeta trae el valor del
 *     período anterior y su variación, y la variación es `null` cuando no hay
 *     con qué comparar en lugar de un "+100%" inventado.
 *
 * Y una advertencia: con la base vacía todo esto devuelve ceros y `null`, no
 * errores ni divisiones entre cero. Es el punto 10 de la verificación.
 */

export type Tarjeta = {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Cómo se muestra: número, dinero o porcentaje. */
  formato: "numero" | "dinero" | "porcentaje" | "texto";
  /** Texto ya armado, cuando el valor no es numérico (mediana, por ejemplo). */
  texto?: string;
  anterior: number | null;
  variacion: number | null;
  detalle?: string;
};

export type EtapaDelEmbudo = {
  clave: string;
  nombre: string;
  posicion: number;
  cuantas: number;
  pesos: number;
  /**
   * Qué parte del total de oportunidades del período llegó a esta etapa.
   *
   * ANTES era "% desde la etapa anterior", y con el histórico de LynSales dentro
   * quedó claro que eso no se puede leer: decía **786%** en Registro iniciado,
   * porque las etapas NO son subconjuntos —casi nadie pasa por "Solicitud de
   * llamada" (19) y muchísimos entran directo a registro (143)—. El número era
   * correcto según su fórmula y no significaba nada.
   *
   * Contra el total siempre significa lo mismo, no depende del orden de las
   * etapas y no se rompe si mañana el equipo agrega una.
   */
  porcentajeDelTotal: number | null;
};

const ISO = (d: Date) => d.toISOString();

/* ------------------------------------------------------------- embudo ----- */

/**
 * El embudo con conteo y suma en pesos por etapa, y la tasa de paso.
 *
 * Es la pieza principal del tablero: con los números de hoy enseña de entrada
 * dónde está la fuga (los carritos abandonados que nadie trabaja).
 */
export async function embudo(admin: Admin, rango: Rango): Promise<EtapaDelEmbudo[]> {
  const [{ data: etapas }, { data: oportunidades }] = await Promise.all([
    admin
      .from("pipeline_stages")
      .select("id, key, name, position")
      .order("position"),
    admin
      .from("opportunities")
      .select("stage_id, value_cents")
      .gte("created_at", ISO(rango.desde))
      .lte("created_at", ISO(rango.hasta)),
  ]);

  const porEtapa = new Map<string, { cuantas: number; centavos: number }>();
  for (const o of oportunidades ?? []) {
    const actual = porEtapa.get(o.stage_id) ?? { cuantas: 0, centavos: 0 };
    actual.cuantas++;
    actual.centavos += o.value_cents ?? 0;
    porEtapa.set(o.stage_id, actual);
  }

  const total = (oportunidades ?? []).length;

  return (etapas ?? []).map((e) => {
    const d = porEtapa.get(e.id) ?? { cuantas: 0, centavos: 0 };
    return {
      clave: e.key,
      nombre: e.name,
      posicion: e.position,
      cuantas: d.cuantas,
      pesos: d.centavos / 100,
      // Sin oportunidades en el período no hay porcentaje que dar: null se pinta
      // como "—" en lugar de un 0% que parece un dato.
      porcentajeDelTotal: total > 0 ? porcentaje(d.cuantas, total) : null,
    };
  });
}

/* ------------------------------------------- tiempo de primera respuesta -- */

export type RespuestaPorCanal = {
  canal: string;
  medianaMinutos: number | null;
  conversaciones: number;
};

/**
 * Mediana del tiempo entre el primer mensaje entrante y la primera respuesta
 * de una persona, por canal.
 *
 * Se excluyen a propósito las respuestas de la IA: lo que el equipo quiere
 * saber es cuánto tarda una PERSONA, y contar los segundos del bot lo taparía
 * todo con ceros.
 */
export async function primeraRespuesta(
  admin: Admin,
  rango: Rango,
): Promise<RespuestaPorCanal[]> {
  const { data: convs } = await admin
    .from("channel_conversations")
    .select("id, channel")
    .gte("created_at", ISO(rango.desde))
    .lte("created_at", ISO(rango.hasta))
    .limit(2000);
  if (!convs?.length) return [];

  // `sender` es 'contact' | 'ai' | 'admin'. La respuesta que cuenta es la de
  // 'admin': una persona. Contar los segundos del bot taparía todo con ceros.
  const { data: mensajes } = await admin
    .from("channel_messages")
    .select("conversation_id, direction, created_at, sender")
    .in("conversation_id", convs.map((c) => c.id))
    .order("created_at", { ascending: true });

  const porConversacion = new Map<
    string,
    { entrante?: number; respuesta?: number }
  >();
  for (const m of mensajes ?? []) {
    const t = new Date(m.created_at).getTime();
    const actual = porConversacion.get(m.conversation_id) ?? {};
    if (m.direction === "in" && actual.entrante === undefined) actual.entrante = t;
    if (
      m.direction === "out" &&
      m.sender === "admin" &&
      actual.entrante !== undefined &&
      actual.respuesta === undefined
    )
      actual.respuesta = t;
    porConversacion.set(m.conversation_id, actual);
  }

  const porCanal = new Map<string, number[]>();
  for (const c of convs) {
    const t = porConversacion.get(c.id);
    if (!t?.entrante || !t.respuesta) continue;
    const minutos = (t.respuesta - t.entrante) / 60000;
    porCanal.set(c.channel, [...(porCanal.get(c.channel) ?? []), minutos]);
  }

  return [...porCanal.entries()].map(([canal, valores]) => ({
    canal,
    medianaMinutos: mediana(valores),
    conversaciones: valores.length,
  }));
}

/* ----------------------------------------------------------- tarjetas ----- */

/** Los números de un período, sin comparar. Se usa dos veces: actual y anterior. */
async function crudosDelPeriodo(admin: Admin, rango: Rango) {
  const desde = ISO(rango.desde);
  const hasta = ISO(rango.hasta);

  const [
    { count: prospectos },
    { data: oportunidades },
    { count: sinAtender },
    { data: suscripciones },
    { data: contenido },
    { data: envios },
    { data: demo },
    { data: usos },
  ] = await Promise.all([
    admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", desde)
      .lte("created_at", hasta),
    admin
      .from("opportunities")
      .select("status, value_cents, stage_id, pipeline_stages!stage_id(key)")
      .gte("created_at", desde)
      .lte("created_at", hasta),
    admin
      .from("channel_conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .is("assigned_to", null),
    admin
      .from("subscriptions")
      .select("amount, plan, created_at")
      .eq("status", "active")
      .gte("created_at", desde)
      .lte("created_at", hasta),
    admin
      .from("content_posts")
      .select("status")
      .gte("created_at", desde)
      .lte("created_at", hasta),
    admin
      .from("newsletter_sends")
      .select("status")
      .gte("updated_at", desde)
      .lte("updated_at", hasta),
    admin
      .from("assistant_conversations")
      .select("id, wants_human")
      .eq("mode", "demo")
      .gte("created_at", desde)
      .lte("created_at", hasta),
    admin
      .from("ai_usage")
      .select("agent, error")
      .gte("created_at", desde)
      .lte("created_at", hasta),
  ]);

  const ops = oportunidades ?? [];
  const clave = (o: (typeof ops)[number]) => {
    const s = Array.isArray(o.pipeline_stages) ? o.pipeline_stages[0] : o.pipeline_stages;
    return s?.key ?? "";
  };

  const carritos = ops.filter((o) => clave(o) === "carrito_abandonado");
  const ganadas = ops.filter((o) => o.status === "ganada");
  const miembros = ops.filter((o) => clave(o) === "miembro_activo");

  // MRR nuevo: lo mensual cuenta tal cual, lo anual dividido entre 12. Sumar
  // $1,699 de un plan anual como si fuera recurrencia mensual infla el número
  // por doce.
  // (Sección 8 del $599: el mismo cálculo que Finanzas; cada peludo es un cobro.)
  const mrr = resumenDeIngresos(suscripciones ?? []).mrr;

  const posts = contenido ?? [];
  const correos = envios ?? [];
  const demos = demo ?? [];
  const conIA = (usos ?? []).filter((u) => !u.error).length;

  return {
    prospectos: prospectos ?? 0,
    miembrosNuevos: miembros.length,
    carritos: carritos.length,
    carritosRecuperadosMxn:
      ganadas
        .filter((o) => clave(o) === "carrito_abandonado")
        .reduce((s, o) => s + (o.value_cents ?? 0), 0) / 100,
    mrr,
    sinAtender: sinAtender ?? 0,
    respuestasIA: conIA,
    contenidoPublicado: posts.filter((p) => p.status === "publicado").length,
    contenidoPendiente: posts.filter((p) => p.status === "revision").length,
    contenidoFallido: posts.filter((p) => p.status === "fallido").length,
    boletinEnviados: correos.filter((c) => c.status !== "encolado" && c.status !== "fallido").length,
    boletinEntregados: correos.filter((c) => ["entregado", "abierto"].includes(c.status)).length,
    boletinAperturas: correos.filter((c) => c.status === "abierto").length,
    boletinBajas: correos.filter((c) => c.status === "baja").length,
    demoConversaciones: demos.length,
    demoPidenPersona: demos.filter((d) => d.wants_human).length,
  };
}

export async function tarjetas(
  admin: Admin,
  rango: Rango,
  anterior: Rango,
): Promise<Tarjeta[]> {
  const [hoy, antes, respuestas] = await Promise.all([
    crudosDelPeriodo(admin, rango),
    crudosDelPeriodo(admin, anterior),
    primeraRespuesta(admin, rango),
  ]);

  const arma = (
    clave: string,
    etiqueta: string,
    valor: number,
    valorAnterior: number,
    formato: Tarjeta["formato"] = "numero",
    detalle?: string,
  ): Tarjeta => ({
    clave,
    etiqueta,
    valor,
    formato,
    anterior: valorAnterior,
    variacion: variacion(valor, valorAnterior),
    detalle,
  });

  const conversion = porcentaje(hoy.miembrosNuevos, hoy.prospectos);
  const conversionAntes = porcentaje(antes.miembrosNuevos, antes.prospectos);

  // La mediana global de primera respuesta: se juntan todos los canales.
  const todasLasMedianas = respuestas
    .map((r) => r.medianaMinutos)
    .filter((m): m is number => m !== null);
  const medianaGlobal = mediana(todasLasMedianas);

  return [
    arma("prospectos", "PROSPECTOS DEL PERÍODO", hoy.prospectos, antes.prospectos),
    arma("conversion", "CONVERSIÓN A MIEMBRO", conversion, conversionAntes, "porcentaje",
      `${hoy.miembrosNuevos} de ${hoy.prospectos}`),
    arma("carritos", "CARRITOS ABANDONADOS", hoy.carritos, antes.carritos, "numero",
      hoy.carritosRecuperadosMxn > 0
        ? `$${hoy.carritosRecuperadosMxn.toLocaleString("es-MX")} recuperados`
        : "sin recuperados todavía"),
    arma("mrr", "MRR NUEVO", hoy.mrr, antes.mrr, "dinero"),
    {
      clave: "primera_respuesta",
      etiqueta: "PRIMERA RESPUESTA (MEDIANA)",
      valor: medianaGlobal ?? 0,
      formato: "texto",
      texto:
        medianaGlobal === null
          ? "sin datos"
          : medianaGlobal < 60
            ? `${Math.round(medianaGlobal)} min`
            : `${(medianaGlobal / 60).toFixed(1)} h`,
      anterior: null,
      variacion: null,
      detalle: respuestas.length
        ? respuestas.map((r) => `${r.canal}: ${r.conversaciones}`).join(" · ")
        : "sin conversaciones en el período",
    },
    arma("sin_atender", "SIN ATENDER AHORA", hoy.sinAtender, antes.sinAtender, "numero",
      "abiertas y sin asignar"),
    arma("ia", "RESPUESTAS DE LA IA", hoy.respuestasIA, antes.respuestasIA),
    arma("contenido", "CONTENIDO PUBLICADO", hoy.contenidoPublicado, antes.contenidoPublicado,
      "numero",
      `${hoy.contenidoPendiente} por aprobar · ${hoy.contenidoFallido} fallidos`),
    arma("boletin", "BOLETÍN ENVIADO", hoy.boletinEnviados, antes.boletinEnviados, "numero",
      `${hoy.boletinAperturas} aperturas · ${hoy.boletinBajas} bajas`),
    arma("demo", "AGENTE DEMO", hoy.demoConversaciones, antes.demoConversaciones, "numero",
      hoy.demoConversaciones
        ? `${Math.round(porcentaje(hoy.demoPidenPersona, hoy.demoConversaciones))}% pide persona`
        : "sin conversaciones"),
  ];
}

/* ---------------------------------------------------------- por persona --- */

export type FilaPorPersona = {
  userId: string;
  nombre: string;
  conversaciones: number;
  ganadas: number;
  perdidas: number;
  pesosGanados: number;
  tareasVencidas: number;
};

/**
 * La tabla por ejecutivo.
 *
 * `soloEste` viene del rol: un `ventas` solo recibe SU renglón. Se filtra en la
 * consulta, no ocultando columnas — ocultar no es controlar el acceso.
 */
export async function porPersona(
  admin: Admin,
  rango: Rango,
  soloEste: string | null,
): Promise<FilaPorPersona[]> {
  const desde = ISO(rango.desde);
  const hasta = ISO(rango.hasta);

  let consultaOps = admin
    .from("opportunities")
    .select("owner_id, status, value_cents")
    .gte("created_at", desde)
    .lte("created_at", hasta)
    .not("owner_id", "is", null);
  if (soloEste) consultaOps = consultaOps.eq("owner_id", soloEste);

  let consultaConvs = admin
    .from("channel_conversations")
    .select("assigned_to")
    .gte("created_at", desde)
    .lte("created_at", hasta)
    .not("assigned_to", "is", null);
  if (soloEste) consultaConvs = consultaConvs.eq("assigned_to", soloEste);

  // "Vencida" = con fecha pasada y sin completar. La tabla no tiene un
  // booleano `done`: lleva `completed_at`.
  let consultaTareas = admin
    .from("tasks")
    .select("assigned_to")
    .is("completed_at", null)
    .lt("due_at", ISO(new Date()))
    .not("assigned_to", "is", null);
  if (soloEste) consultaTareas = consultaTareas.eq("assigned_to", soloEste);

  const [{ data: ops }, { data: convs }, { data: tareas }, { data: gente }] =
    await Promise.all([
      consultaOps,
      consultaConvs,
      consultaTareas,
      admin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("role", ["ventas", "gerente_ventas", "admin", "super_admin"]),
    ]);

  const nombre = new Map(
    (gente ?? []).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Equipo",
    ]),
  );

  const filas = new Map<string, FilaPorPersona>();
  const dame = (id: string) => {
    if (!filas.has(id))
      filas.set(id, {
        userId: id,
        nombre: nombre.get(id) ?? "Equipo",
        conversaciones: 0,
        ganadas: 0,
        perdidas: 0,
        pesosGanados: 0,
        tareasVencidas: 0,
      });
    return filas.get(id)!;
  };

  for (const o of ops ?? []) {
    const f = dame(o.owner_id as string);
    if (o.status === "ganada") {
      f.ganadas++;
      f.pesosGanados += (o.value_cents ?? 0) / 100;
    }
    if (o.status === "perdida") f.perdidas++;
  }
  for (const c of convs ?? []) dame(c.assigned_to as string).conversaciones++;
  for (const t of tareas ?? []) dame(t.assigned_to as string).tareasVencidas++;

  return [...filas.values()].sort((a, b) => b.pesosGanados - a.pesosGanados);
}

/* ------------------------------------------------- motivos de pérdida ----- */

export async function motivosDePerdida(
  admin: Admin,
  rango: Rango,
): Promise<{ motivo: string; cuantas: number }[]> {
  const { data } = await admin
    .from("opportunities")
    .select("lost_reason_id, lost_reasons!lost_reason_id(name)")
    .eq("status", "perdida")
    .gte("created_at", ISO(rango.desde))
    .lte("created_at", ISO(rango.hasta));

  const conteo = new Map<string, number>();
  for (const o of data ?? []) {
    const r = Array.isArray(o.lost_reasons) ? o.lost_reasons[0] : o.lost_reasons;
    const etiqueta = r?.name ?? "Sin motivo capturado";
    conteo.set(etiqueta, (conteo.get(etiqueta) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([motivo, cuantas]) => ({ motivo, cuantas }))
    .sort((a, b) => b.cuantas - a.cuantas);
}

/* ------------------------------------------------------- tendencias ------- */

export type Tendencia = {
  metrica: string;
  puntos: { label: string; value: number }[];
  /** Días del rango que el agregado nocturno no calculó. */
  diasFaltantes: string[];
};

/**
 * Una tendencia leída del agregado diario.
 *
 * Si faltan días se DICEN. Un hueco silencioso en una gráfica se lee como "no
 * pasó nada", que es justo lo contrario de lo que significa.
 */
export async function tendencia(
  admin: Admin,
  metrica: string,
  rango: Rango,
): Promise<Tendencia> {
  const dias = diasDelRango(rango);
  const { data } = await admin
    .from("sales_daily_metrics")
    .select("fecha, valor")
    .eq("metrica", metrica)
    .eq("dimension", "")
    .gte("fecha", dias[0])
    .lte("fecha", dias[dias.length - 1])
    .order("fecha");

  const porDia = new Map((data ?? []).map((d) => [d.fecha as string, Number(d.valor)]));
  const faltantes = dias.filter((d) => !porDia.has(d));

  return {
    metrica,
    puntos: dias.map((d) => ({ label: d.slice(5), value: porDia.get(d) ?? 0 })),
    diasFaltantes: faltantes,
  };
}

/* ------------------------------------------- agregado nocturno ------------ */

/**
 * Calcula y guarda los agregados de un día. Idempotente: correrlo dos veces
 * deja el mismo resultado (la llave primaria es fecha+métrica+dimensión).
 */
export async function calcularAgregadosDelDia(
  admin: Admin,
  fecha: Date | string,
): Promise<number> {
  // El día es el DÍA MEXICANO, no el del reloj del proceso. Ver el comentario
  // de rango.ts: con la hora local, el mismo código daba números distintos en
  // esta máquina y en Vercel.
  const dia = typeof fecha === "string" ? fecha : diaEnMexico(fecha);
  const desde = inicioDelDia(dia);
  const hasta = finDelDia(dia);

  const crudos = await crudosDelPeriodo(admin, { desde, hasta, etiqueta: dia });

  const filas = [
    { metrica: "prospectos", valor: crudos.prospectos },
    { metrica: "miembros_nuevos", valor: crudos.miembrosNuevos },
    { metrica: "mrr_nuevo", valor: Number(crudos.mrr.toFixed(2)) },
    { metrica: "carritos", valor: crudos.carritos },
    { metrica: "respuestas_ia", valor: crudos.respuestasIA },
    { metrica: "contenido_publicado", valor: crudos.contenidoPublicado },
    { metrica: "boletin_enviados", valor: crudos.boletinEnviados },
    { metrica: "demo_conversaciones", valor: crudos.demoConversaciones },
  ].map((f) => ({
    fecha: dia,
    metrica: f.metrica,
    dimension: "",
    valor: f.valor,
    calculado_en: new Date().toISOString(),
  }));

  const { error } = await admin
    .from("sales_daily_metrics")
    .upsert(filas, { onConflict: "fecha,metrica,dimension" });
  if (error) throw new Error(error.message);
  return filas.length;
}
