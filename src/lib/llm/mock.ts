import type {
  AgentParams,
  ChatMessage,
  JsonParams,
  JsonResult,
  LLMProvider,
  VetContext,
} from "./types";
import { REIMBURSEMENT_CAPS_MXN } from "@/lib/constants";

/**
 * Deterministic dev provider — keeps the product buildable and demoable
 * before the client's real LLM API arrives. Follows the same guardrails as
 * the system prompt: guidance only, urgency → trusted vet + reintegro.
 */
export class MockProvider implements LLMProvider {
  async complete(messages: ChatMessage[], context: VetContext): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content ?? "";
    const pet = context.pets[0];
    const petName = pet?.name ?? "tu peludo";
    const petIntro = pet
      ? `Como ${petName} ${pet.species === "dog" ? "es un perro" : "es un gato"}${pet.breed ? ` ${pet.breed}` : ""} de ${pet.ageLabel}, `
      : "";

    if (context.urgent) {
      return (
        `Entiendo tu preocupación y me alegra que me escribas. ${petIntro}te comparto algunas señales a observar:\n\n` +
        `• ¿Ha vomitado o tiene diarrea?\n• ¿Toma agua con normalidad?\n• ¿Está más decaído de lo habitual?\n\n` +
        `Por lo que describes, te recomiendo acudir hoy mismo con tu veterinario de confianza para que lo revise. ` +
        `Recuerda que tu membresía reintegra hasta $${REIMBURSEMENT_CAPS_MXN.vet_expenses.toLocaleString("es-MX")} MXN en gastos veterinarios.`
      );
    }

    if (/vacun/i.test(text)) {
      return (
        `¡Qué bien que estés al pendiente del esquema de vacunación de ${petName}! 🐾 Tu veterinario de confianza es quien mejor puede indicarte qué vacunas tocan según su edad y estilo de vida. ` +
        `Y no olvides: tu membresía reintegra hasta $${REIMBURSEMENT_CAPS_MXN.vaccines} MXN en vacunas.`
      );
    }

    if (/aliment|comida|croqueta|dieta/i.test(text)) {
      return (
        `${petIntro}lo ideal es una alimentación adecuada a su etapa de vida y tamaño. Te sugiero ofrecer porciones regulares, agua fresca siempre disponible y evitar darle comida de mesa. ` +
        `Si notas cambios de peso o de apetito, coméntalo con tu veterinario de confianza en su próxima visita.`
      );
    }

    if (messages.filter((m) => m.role === "user").length <= 1 && text.length < 40) {
      return `¡Hola${context.memberName ? `, ${context.memberName}` : ""}! 🐾 Soy tu guía veterinaria, disponible 24/7. Cuéntame, ¿cómo ${context.pets.length > 1 ? "están tus peludos" : `está ${petName}`} hoy?`;
    }

    return (
      `Gracias por contarme. ${petIntro}me ayudaría saber un poco más:\n\n` +
      `• ¿Desde cuándo lo notas así?\n• ¿Ha cambiado su apetito o su ánimo?\n\n` +
      `Mientras tanto, mantenlo cómodo e hidratado. Si algo empeora o te preocupa, tu veterinario de confianza es siempre la mejor opción — y tu membresía te respalda con reintegros de gastos veterinarios.`
    );
  }

  /**
   * Versión demo del agente con herramientas: detecta por palabras clave qué
   * herramienta consultar, la ejecuta de verdad (datos reales vía RLS) y
   * presenta el resultado. Así todo el flujo — BD incluida — se prueba sin
   * API key; solo la redacción final es la que mejora con la IA conectada.
   */
  async completeWithTools({ messages, tools, executeTool }: AgentParams): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content ?? "";

    const has = (name: string) => tools.some((t) => t.name === name);

    // Demo del pipeline de ventas: clasificar por palabras clave, como lo
    // haría la IA real con su herramienta
    if (has("clasificar_conversacion")) {
      const etapa = /ya me registr|ya pagu|ya soy miembro/i.test(text)
        ? "convertido"
        : /no me interesa|no gracias/i.test(text)
          ? "descartado"
          : /mi cuenta|mi reintegro|mi membres/i.test(text)
            ? "soporte"
            : /precio|cu[aá]nto cuesta|plan|unir|registrar/i.test(text)
              ? "interesado"
              : null;
      if (etapa) {
        try {
          await executeTool("clasificar_conversacion", { etapa });
        } catch {
          /* demo: ignorar */
        }
      }
    }
    const toolName =
      /mascota|peludo|perro|gato|espera/i.test(text) && has("mis_mascotas")
        ? "mis_mascotas"
        : /reintegro|reembolso|factura|pago/i.test(text) && has("mis_reintegros")
          ? "mis_reintegros"
          : /plan|membres|suscrip|precio|renovar/i.test(text) && has("mi_membresia")
            ? "mi_membresia"
            : null;

    if (toolName) {
      let data: string;
      try {
        data = await executeTool(toolName, {});
      } catch {
        data = "(no se pudo consultar)";
      }
      return (
        `🛠️ [Modo demo — sin IA conectada] Consulté "${toolName}" y esto es lo que veo en tu cuenta:\n\n` +
        `${data}\n\n` +
        `Con la IA conectada (LLM_PROVIDER=anthropic) te lo explicaría en lenguaje natural. 🐾`
      );
    }

    return (
      `🛠️ [Modo demo — sin IA conectada] Recibí tu mensaje. Con la IA conectada ` +
      `(LLM_PROVIDER=anthropic) respondería cualquier duda sobre Club Pata Amiga — ` +
      `planes, reintegros, tiempos de espera y más. 🐾`
    );
  }

  /**
   * En modo demostración devuelve el ejemplo que trae la petición, con cero
   * tokens. Así el circuito del boletín (investigar → redactar → revisar →
   * aprobar → enviar) se puede recorrer entero sin ANTHROPIC_API_KEY, que es
   * justo lo que la spec pide mientras el cliente entrega su llave.
   *
   * Marca `demo: true` para que la pantalla lo diga en lugar de hacer pasar un
   * ejemplo por trabajo del modelo.
   */
  async completeJson<T>(params: JsonParams): Promise<JsonResult<T>> {
    return {
      data: params.demo as T,
      model: "demo",
      tokensIn: 0,
      tokensOut: 0,
      demo: true,
    };
  }
}
