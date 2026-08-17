import type { createAdminClient } from "@/lib/supabase/admin";
import type { AgentTool } from "./types";
import { beneficiosDe } from "@/lib/plans/resolve";
import { CATALOGO_BENEFICIOS, type LlaveBeneficio } from "@/lib/plans/benefits";
import { hoyEnMexico } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * HERRAMIENTAS DEL AGENTE DEMO — sección 6, punto 4.
 *
 * Esto es un juego COMPLETAMENTE APARTE del de `support-tools.ts`. No es el
 * asistente de miembros con permisos recortados: son dos conjuntos distintos,
 * y esa separación ES el control. Un conjunto de herramientas que no existe no
 * se puede filtrar por error, ni por un cambio futuro, ni por un prompt
 * ingenioso del usuario.
 *
 * Todo lo de aquí es de SOLO LECTURA y sobre datos PÚBLICOS: planes, períodos
 * de espera, reglas de reintegro, promociones vigentes y un resumen de centros
 * sin datos de contacto. Nada del usuario: ni sus peludos, ni sus
 * reintegros, ni su saldo, ni su perfil.
 */

export const DEMO_TOOLS: AgentTool[] = [
  {
    name: "planes_vigentes",
    description:
      "Los planes de membresía publicados hoy, con su precio y lo que incluyen. Úsala siempre que pregunten cuánto cuesta o qué incluye.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "periodos_de_espera",
    description:
      "Los tiempos de espera vigentes por tipo de alta (estándar, adoptado, con código de embajador, reemplazo) y el del contratante.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "reglas_de_reintegro",
    description:
      "Categorías de reintegro, sus topes anuales y qué se necesita para solicitar uno.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "promos_vigentes",
    description: "Promociones y avisos vigentes hoy, si los hay.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "centros_aliados_resumen",
    description:
      "Cuántos centros aliados hay y en qué ciudades. NO devuelve nombres ni datos de contacto.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "ejemplo_de_respuesta",
    description:
      "Ejemplos REVISADOS por el equipo de lo que respondería el asistente de miembros. Úsalos tal cual, presentándolos como ejemplo. Nunca inventes uno.",
    input_schema: {
      type: "object",
      properties: {
        tema: {
          type: "string",
          description: "Sobre qué quiere el ejemplo (reintegros, peludos, espera…).",
        },
      },
    },
  },
];

/** Nombres, para poder afirmar en las pruebas que no se llamó otra cosa. */
export const DEMO_TOOL_NAMES = DEMO_TOOLS.map((t) => t.name);

function pesos(n: number) {
  return `$${Number(n).toLocaleString("es-MX")} MXN`;
}

/**
 * Ejecuta una herramienta del demo. Devuelve texto plano: es lo que el modelo
 * lee, y así queda legible también en el registro de la conversación.
 *
 * Si llega un nombre que no está en la lista, se dice y ya. No hay ruta hacia
 * las herramientas de miembro porque ni siquiera se importan aquí.
 */
export async function executeDemoTool(
  admin: Admin,
  name: string,
  input: Record<string, unknown> = {},
): Promise<string> {
  switch (name) {
    case "planes_vigentes": {
      const { data } = await admin
        .from("plan_versions")
        .select("version, interval, price_cents, benefits, membership_plans!plan_id(name, is_public)")
        .eq("status", "publicada");

      const filas = (data ?? []).filter((v) => {
        const plan = Array.isArray(v.membership_plans) ? v.membership_plans[0] : v.membership_plans;
        return plan?.is_public !== false;
      });
      if (filas.length === 0) return "No hay planes publicados en este momento.";

      // Los beneficios salen del resolvedor: un demo que cotiza precios o
      // topes viejos cuesta ventas.
      return filas
        .map((v) => {
          const plan = Array.isArray(v.membership_plans) ? v.membership_plans[0] : v.membership_plans;
          const b = beneficiosDe(v.benefits as Record<string, unknown>);
          return [
            `${plan?.name ?? "Membresía"} — ${v.interval === "year" ? "anual" : "mensual"}: ${pesos(v.price_cents / 100)}`,
            `  hasta ${b.mascotas_activas_max} peludos`,
            `  reintegro de gastos veterinarios hasta ${pesos(Number(b.tope_gastos_veterinarios_mxn))} al año`,
            `  orientación veterinaria 24/7: ${b.orientacion_vet_24_7 ? "incluida" : "no incluida"}`,
          ].join("\n");
        })
        .join("\n\n");
    }

    case "periodos_de_espera": {
      const b = beneficiosDe(null); // los valores vigentes del catálogo
      return [
        `Contratante: sin tiempo de espera — la membresía queda activa al pagar.`,
        `La espera es por peludo y empieza cuando el comité aprueba su perfil:`,
        `Peludo estándar: ${b.espera_mascota_estandar_dias} días.`,
        `Peludo adoptado de raza: ${b.espera_mascota_adoptada_raza_dias} días.`,
        `Peludo adoptado mestizo: ${b.espera_mascota_adoptada_mestizo_dias} días.`,
        `Con código de embajador: ${b.espera_mascota_con_embajador_dias} días (beneficio de la membresía).`,
        `Peludo de reemplazo tras una baja: condiciones normales, sin el beneficio del embajador.`,
      ].join("\n");
    }

    case "reglas_de_reintegro": {
      const b = beneficiosDe(null);
      const tope = (llave: LlaveBeneficio) =>
        `${CATALOGO_BENEFICIOS[llave].label}: ${pesos(Number(b[llave]))} al año`;
      return [
        tope("tope_gastos_veterinarios_mxn"),
        tope("tope_fallecimiento_mxn"),
        tope("tope_vacunas_mxn"),
        `Compromiso de transferencia: ${b.horas_compromiso_reintegro} horas desde la aprobación.`,
        `Apelaciones por caso: ${b.apelaciones_max}.`,
        "Para solicitar se sube la factura o el recibo del veterinario y los datos bancarios del titular.",
        "El reintegro aplica cuando ya pasó el tiempo de espera de ese peludo.",
      ].join("\n");
    }

    case "promos_vigentes": {
      // Hoy en México, igual que en promos.ts: las dos puertas al mismo dato
      // tienen que coincidir en qué día es.
      const hoy = hoyEnMexico();
      const { data } = await admin
        .from("agent_promos")
        .select("title, content")
        .eq("active", true)
        .in("audience", ["both", "sales"])
        .lte("starts_on", hoy)
        .or(`ends_on.is.null,ends_on.gte.${hoy}`)
        .limit(5);
      if (!data?.length) return "No hay promociones vigentes en este momento.";
      return data.map((p) => `${p.title}: ${p.content}`).join("\n");
    }

    case "centros_aliados_resumen": {
      // Solo el resumen: nombres y contactos son de los centros, no del demo.
      const { data } = await admin
        .from("wellness_centers")
        .select("city")
        .eq("status", "approved");
      if (!data?.length) return "La red de centros aliados está creciendo.";
      const ciudades = [...new Set(data.map((c) => c.city).filter(Boolean))];
      return `${data.length} centro(s) de bienestar aliados${
        ciudades.length ? ` en ${ciudades.slice(0, 8).join(", ")}` : ""
      }. Puedes seguir con tu veterinario de siempre: la membresía no te obliga a cambiarlo.`;
    }

    case "ejemplo_de_respuesta": {
      const { data } = await admin
        .from("site_settings")
        .select("value")
        .eq("key", "demo_agent_ejemplos")
        .maybeSingle();

      const crudos: string[] = String(data?.value ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.includes("::"));
      if (crudos.length === 0)
        return "No hay ejemplos cargados todavía. NO inventes uno: dile que al hacerse miembro el asistente responde con sus datos reales.";

      const tema = String(input.tema ?? "").toLowerCase();
      const elegidos = tema
        ? crudos.filter((l) => l.toLowerCase().includes(tema))
        : [];
      const lista = (elegidos.length ? elegidos : crudos).slice(0, 3);

      return lista
        .map((l) => {
          const [pregunta, respuesta] = l.split("::");
          return `Pregunta: ${pregunta.trim()}\nRespuesta de ejemplo: ${respuesta?.trim() ?? ""}`;
        })
        .join("\n\n");
    }

    default:
      return `La herramienta "${name}" no existe en la versión de demostración.`;
  }
}
