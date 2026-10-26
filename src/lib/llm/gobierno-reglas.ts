/**
 * Las reglas de gobierno de la IA, sin base de datos: quién manda, qué canal
 * está apagado, cuánto se puede responder y gastar. `puedeResponderIA`
 * (gobierno.ts) junta los datos y las aplica en este orden; aquí se prueban
 * sueltas con node --test.
 *
 * Orden de precedencia: la persona manda sobre el hilo, el hilo sobre el canal,
 * y encima están los topes de ritmo y de gasto.
 */

export type Veredicto =
  | { puede: true }
  | { puede: false; motivo: string; avisar: boolean };

const PUEDE: Veredicto = { puede: true };

/**
 * Red de seguridad independiente de la IA: si el texto entrante trae señales
 * de molestia, petición de humano o amenaza legal, se marca la conversación
 * aunque el modelo no use su herramienta (o estemos en modo demo).
 */
export const ESCALATION_SIGNALS =
  /\b(humano|persona real|asesor|alguien real|queja|molest\w*|enoja\w*|p[eé]simo|fraude|estafa|abogad\w*|demanda\w*|profeco|condusef)\b/i;

/** ¿Hay que escalar por lo que dice el mensaje? (Solo si no estaba ya marcada.) */
export function debeEscalarPorTexto(texto: string, yaMarcada: boolean): boolean {
  return !yaMarcada && ESCALATION_SIGNALS.test(texto);
}

/** 1. Una persona tomó el hilo. */
export function reglaPersona(humanTakeover: boolean): Veredicto {
  return humanTakeover
    ? { puede: false, motivo: "Alguien del equipo tomó esta conversación", avisar: false }
    : PUEDE;
}

/** 2. Interruptor por canal (`ia_canales_apagados`). */
export function reglaCanal(canal: string, canalesApagados: string): Veredicto {
  const apagados = (canalesApagados ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return apagados.includes(canal.toLowerCase())
    ? { puede: false, motivo: `La IA está apagada para ${canal}`, avisar: true }
    : PUEDE;
}

/** 3. Freno por conversación: contra bucles y abuso. maxPorHora 0 = sin límite. */
export function reglaRitmo(maxPorHora: number, respuestasUltimaHora: number): Veredicto {
  if (!(maxPorHora > 0)) return PUEDE;
  return respuestasUltimaHora >= maxPorHora
    ? {
        puede: false,
        motivo: `Esta conversación llegó al límite de ${maxPorHora} respuestas por hora`,
        avisar: true,
      }
    : PUEDE;
}

/** 4. Tope de gasto diario en MXN. topeMxn 0 = sin tope. */
export function reglaGasto(topeMxn: number, gastoCentavosHoy: number): Veredicto {
  if (!(topeMxn > 0)) return PUEDE;
  return gastoCentavosHoy >= topeMxn * 100
    ? {
        puede: false,
        motivo: `Se alcanzó el tope de gasto del día ($${topeMxn} MXN)`,
        avisar: true,
      }
    : PUEDE;
}

/**
 * 5. Solo para conversaciones de Flowly: lo que dice Flowly en ese momento
 * (contrato §8.2). Flowly ve a todos los que escriben —incluido alguien
 * contestando desde la app del teléfono—, así que su interruptor manda.
 *
 * `reflejarToma`: Flowly dice que una persona tomó el hilo; hay que apagar
 * también nuestro interruptor para que la bandeja lo muestre.
 */
export function reglaFlowly(estado: {
  agentEnabled: boolean;
  agentCanSend: boolean;
  takenOverBy: string | null;
  razon: string | null;
}): Veredicto & { reflejarToma?: boolean } {
  if (!estado.agentEnabled)
    return {
      puede: false,
      motivo: estado.takenOverBy
        ? "Una persona tomó la conversación (Flowly apagó el agente)"
        : "El agente está apagado en Flowly para esta cuenta",
      avisar: false,
      reflejarToma: Boolean(estado.takenOverBy),
    };
  if (!estado.agentCanSend)
    return {
      puede: false,
      motivo:
        estado.razon === "open"
          ? "Solo una persona puede responder en este momento"
          : "La ventana de 24 horas está cerrada para la IA",
      avisar: false,
    };
  return PUEDE;
}
