import type { createAdminClient } from "@/lib/supabase/admin";
import { costoEnCentavos, preciosDe } from "@/lib/newsletter/costos";
import { inicioDelDia } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Gobierno humano de los agentes IA (sección 2, punto 6).
 *
 * Los guardarraíles de CONTENIDO viven en el prompt y en brand-voice.ts, que no
 * son editables desde el panel a propósito. Esto es lo otro: quién puede
 * responder, cuánto se puede gastar y a quién le toca cuando hay que escalar.
 */

/** Ajustes editables. Viven en site_settings, como el resto de lo configurable. */
export const AJUSTES_IA = [
  {
    key: "ia_canales_apagados",
    label: "Canales con la IA apagada",
    hint: "Lista separada por comas: instagram, facebook, whatsapp, email. Vacío = la IA responde en todos.",
    default: "",
    soloSuper: true,
  },
  {
    key: "ia_tope_diario_mxn",
    label: "Tope de gasto diario de la IA (MXN)",
    hint: "Al pasarlo, la IA deja de responder y las conversaciones pasan a una persona. 0 = sin tope.",
    default: "150",
    soloSuper: true,
  },
  {
    key: "ia_max_por_conversacion_hora",
    label: "Máximo de respuestas por conversación por hora",
    hint: "Freno contra bucles y abuso. 0 = sin límite.",
    default: "12",
    soloSuper: true,
  },
  {
    key: "ia_guardia_user_id",
    label: "Persona de guardia para escalaciones",
    hint: "A quién se le asignan las conversaciones marcadas para atención humana.",
    default: "",
    soloSuper: false,
  },
  {
    key: "ia_recordatorio_minutos",
    label: "Recordatorio si nadie toma una escalación (minutos)",
    hint: "Escalar sin que nadie llegue solo mueve el problema. 0 = sin recordatorio.",
    default: "30",
    soloSuper: false,
  },
  // --- Costos y topes del boletín (sección 5) -------------------------------
  {
    key: "ia_precio_entrada_usd_millon",
    label: "Precio del modelo — entrada (USD por millón de tokens)",
    hint: "Con esto se calcula el costo de cada corrida. Es el precio DECLARADO aquí, no lo que factura el proveedor: si cambia la lista de precios o el modelo, actualízalo.",
    // La plataforma corre claude-sonnet-5 (LLM_MODEL en ambos ambientes):
    // 3/15 USD por millón, cotejado contra la consola de Anthropic el 2-ago.
    // Los valores anteriores (5/25) eran de nivel Opus e inflaban los costos.
    default: "3",
    soloSuper: true,
  },
  {
    key: "ia_precio_salida_usd_millon",
    label: "Precio del modelo — salida (USD por millón de tokens)",
    hint: "Igual que el anterior, para los tokens que genera el modelo.",
    default: "15",
    soloSuper: true,
  },
  {
    key: "ia_tipo_cambio_mxn",
    label: "Tipo de cambio USD → MXN",
    hint: "Para mostrar los costos de la IA en pesos.",
    default: "20",
    soloSuper: true,
  },
  {
    key: "boletin_tope_edicion_mxn",
    label: "Tope de gasto por edición del boletín (MXN)",
    hint: "Al pasarlo, los agentes se detienen y avisan en lugar de seguir gastando. 0 = sin tope.",
    default: "40",
    soloSuper: true,
  },
  {
    key: "boletin_tope_mensual_mxn",
    label: "Tope de gasto mensual del boletín (MXN)",
    hint: "Suma de todas las corridas del mes. 0 = sin tope.",
    default: "600",
    soloSuper: true,
  },
  // --- Agente demo para registrados sin membresía (sección 6) --------------
  {
    key: "demo_agent_enabled",
    label: "Agente demo para cuentas sin membresía",
    hint: "APAGADO por omisión. Enciéndelo cuando la demostración esté calibrada: le habla a todos los prospectos a la vez. Escribe 1 para encender.",
    default: "0",
    soloSuper: true,
  },
  {
    key: "demo_agent_max_messages",
    label: "Tope de mensajes por conversación demo",
    hint: "Al llegar, cierra amablemente con la invitación a unirse.",
    default: "12",
    soloSuper: true,
  },
  {
    key: "demo_agent_cta_every",
    label: "Cada cuántos mensajes se ofrece unirse",
    hint: "La invitación aparece cada N respuestas del agente demo.",
    default: "4",
    soloSuper: true,
  },
  {
    key: "demo_agent_daily_cost_cap_mxn",
    label: "Tope de gasto diario del agente demo (MXN)",
    hint: "Al pasarlo, el widget se apaga solo y avisa al equipo. 0 = sin tope. Una superficie con IA sin tope es una factura sorpresa.",
    default: "50",
    soloSuper: true,
  },
  {
    key: "demo_agent_handoff",
    label: "Ofrecer hablar con una persona al agotar el tope",
    hint: "1 para ofrecerlo. Cuando alguien lo pide, su conversación deja de ser de solo lectura y se avisa al equipo.",
    default: "1",
    soloSuper: false,
  },
  {
    key: "demo_agent_ejemplos",
    label: "Ejemplos revisados que muestra el agente demo",
    hint: "Uno por línea, con el formato «pregunta :: respuesta de ejemplo». El agente los cita marcados como ejemplo; NUNCA inventa uno, porque un ejemplo que parezca real es una promesa falsa.",
    default: "",
    soloSuper: false,
  },
  {
    key: "boletin_correos_prueba",
    label: "Correos para la prueba del boletín",
    hint: "Separados por coma. Ahí llega el envío de prueba obligatorio antes de poder programar una edición.",
    default: "",
    soloSuper: false,
  },
] as const;

export type AjustesIA = Record<string, string>;

export async function leerAjustesIA(admin: Admin): Promise<AjustesIA> {
  const { data } = await admin
    .from("site_settings")
    .select("key, value")
    .in(
      "key",
      AJUSTES_IA.map((a) => a.key),
    );
  const overrides = Object.fromEntries(
    (data ?? []).filter((s) => s.value).map((s) => [s.key, s.value]),
  );
  return Object.fromEntries(
    AJUSTES_IA.map((a) => [a.key, overrides[a.key] ?? a.default]),
  );
}

export type Veredicto =
  | { puede: true }
  | { puede: false; motivo: string; avisar: boolean };

/**
 * ¿Puede la IA responder en este momento?
 *
 * Orden de precedencia: la persona manda sobre el hilo, el hilo manda sobre el
 * canal. Cuando NO puede, se dice por qué — y si toca avisar al equipo, porque
 * quedarse callado con un cliente es peor que gastar unos centavos de más.
 */
export async function puedeResponderIA(
  admin: Admin,
  input: { canal: string; conversationId: string; humanTakeover: boolean },
): Promise<Veredicto> {
  // 1. Una persona tomó el hilo
  if (input.humanTakeover)
    return {
      puede: false,
      motivo: "Alguien del equipo tomó esta conversación",
      avisar: false,
    };

  const ajustes = await leerAjustesIA(admin);

  // 2. Interruptor por canal
  const apagados = (ajustes.ia_canales_apagados ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (apagados.includes(input.canal.toLowerCase()))
    return {
      puede: false,
      motivo: `La IA está apagada para ${input.canal}`,
      avisar: true,
    };

  // 3. Freno por conversación: contra bucles y abuso
  const maxHora = Number(ajustes.ia_max_por_conversacion_hora ?? 0);
  if (maxHora > 0) {
    const desde = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", input.conversationId)
      .gte("created_at", desde);
    if ((count ?? 0) >= maxHora)
      return {
        puede: false,
        motivo: `Esta conversación llegó al límite de ${maxHora} respuestas por hora`,
        avisar: true,
      };
  }

  // 4. Tope de gasto diario. El día es el mexicano: con la medianoche del
  // proceso, en Vercel (UTC) el tope se reiniciaba a las 6 de la tarde.
  const topeMxn = Number(ajustes.ia_tope_diario_mxn ?? 0);
  if (topeMxn > 0) {
    const { data: gasto } = await admin
      .from("ai_usage")
      .select("cost_cents")
      .gte("created_at", inicioDelDia(new Date()).toISOString());
    const totalCentavos = (gasto ?? []).reduce(
      (s, u) => s + (u.cost_cents ?? 0),
      0,
    );
    if (totalCentavos >= topeMxn * 100)
      return {
        puede: false,
        motivo: `Se alcanzó el tope de gasto del día ($${topeMxn} MXN)`,
        avisar: true,
      };
  }

  return { puede: true };
}

/** Deja constancia de una respuesta de la IA con su costo. Nunca lanza. */
export async function registrarUso(
  admin: Admin,
  uso: {
    agent: string;
    channel?: string | null;
    /** Conversación de CANAL (redes, correo). */
    conversationId?: string | null;
    /**
     * Conversación del ASISTENTE (portal, agente demo). Son tablas distintas y
     * mandar una por la otra hace que la llave foránea rechace la fila — y
     * como esta función nunca lanza, el consumo se perdería en silencio.
     */
    assistantConversationId?: string | null;
    messageId?: string | null;
    model: string;
    tokensIn?: number;
    tokensOut?: number;
    costCents?: number;
    tools?: unknown[];
    error?: string | null;
  },
): Promise<void> {
  try {
    // Si nadie calculó el costo, se calcula aquí con los precios DECLARADOS en
    // Ajustes de IA: el tope diario suma cost_cents, y una fila en cero es una
    // corrida invisible para la compuerta.
    let costCents = uso.costCents;
    if (costCents == null) {
      const ajustes = await leerAjustesIA(admin);
      costCents = costoEnCentavos(
        uso.tokensIn ?? 0,
        uso.tokensOut ?? 0,
        preciosDe(ajustes),
      );
    }
    await admin.from("ai_usage").insert({
      agent: uso.agent,
      channel: uso.channel ?? null,
      conversation_id: uso.conversationId ?? null,
      assistant_conversation_id: uso.assistantConversationId ?? null,
      message_id: uso.messageId ?? null,
      model: uso.model,
      tokens_in: uso.tokensIn ?? 0,
      tokens_out: uso.tokensOut ?? 0,
      cost_cents: costCents,
      tools: uso.tools ?? [],
      error: uso.error ?? null,
    });
  } catch (err) {
    console.error("[ia] no se pudo registrar el consumo", err);
  }
}

/**
 * Gasto del día en pesos, para el tablero de la IA. El día es el mexicano, el
 * mismo con el que se compara el tope: si no, la pantalla mostraría una cifra y
 * la compuerta usaría otra.
 */
export async function gastoDelDia(admin: Admin): Promise<number> {
  const { data } = await admin
    .from("ai_usage")
    .select("cost_cents")
    .gte("created_at", inicioDelDia(new Date()).toISOString());
  return (data ?? []).reduce((s, u) => s + (u.cost_cents ?? 0), 0) / 100;
}

/**
 * Escala una conversación: deja el motivo a la vista y se la asigna a quien
 * está de guardia. Antes se marcaba y se avisaba a todos, que es la forma más
 * segura de que no la tome nadie.
 */
export async function escalarConversacion(
  admin: Admin,
  input: { conversationId: string; motivo: string },
): Promise<{ asignadaA: string | null }> {
  const ajustes = await leerAjustesIA(admin);
  const guardia = ajustes.ia_guardia_user_id || null;

  await admin
    .from("channel_conversations")
    .update({
      needs_attention: true,
      attention_reason: input.motivo,
      attention_at: new Date().toISOString(),
      attention_notified_at: null,
      // La IA deja de responder: el traspaso es de verdad, no un aviso.
      human_takeover: true,
      ...(guardia ? { assigned_to: guardia } : {}),
    })
    .eq("id", input.conversationId);

  return { asignadaA: guardia };
}
