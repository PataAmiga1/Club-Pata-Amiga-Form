import type { createAdminClient } from "@/lib/supabase/admin";
import {
  CATALOGO_BENEFICIOS,
  comparaParaElMiembro,
  diferencias,
  type LlaveBeneficio,
} from "@/lib/plans/benefits";
import { beneficiosDe, reemplazarSnapshot } from "@/lib/plans/resolve";
import { sendTemplatedEmail } from "@/lib/email/send";
import { PLAN_159 } from "@/lib/plans/planes";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * MIGRAR UNA COHORTE — spec sección 3, punto 4.1.
 *
 * Publicar una versión nueva NO mueve a nadie: cada quien se rige por lo que
 * contrató. Esto es la excepción deliberada, para cuando sí se quiere mover
 * gente (típicamente para mejorarles algo).
 *
 * Dos reglas que no se negocian:
 *
 *   1. Nunca hay migración silenciosa. Se ve el antes y el después beneficio
 *      por beneficio ANTES de ejecutar, y cada miembro queda con su registro y
 *      su correo.
 *   2. Nunca hay migración a peor sin papel. Si alguien queda peor en un
 *      beneficio del reglamento, la acción se bloquea hasta que se señale el
 *      documento legal que ya refleja el cambio.
 *
 * La segunda es la razón de ser de todo esto: esas reglas están escritas en el
 * reglamento de reintegros que la persona aceptó.
 */

export type FiltroCohorte = {
  /** Solo los que hoy están en esta versión. Vacío = cualquiera. */
  versionOrigenId?: string;
  /** Estados de suscripción que entran. Por omisión, solo las activas. */
  estados?: string[];
  /** Solo los que llevan al menos N meses. */
  antiguedadMinMeses?: number;
};

export type CambioDeBeneficio = {
  llave: string;
  label: string;
  antes: number | boolean;
  despues: number | boolean;
  vinculante: boolean;
  /** 1 mejora · 0 igual · -1 empeora, desde el punto de vista del miembro. */
  direccion: 1 | 0 | -1;
};

export type MiembroDeLaCohorte = {
  subscriptionId: string;
  userId: string;
  nombre: string;
  email: string | null;
  versionOrigen: string;
  cambios: CambioDeBeneficio[];
  /** El peor de sus cambios: así se resume su situación en una palabra. */
  saldo: "mejora" | "igual" | "empeora";
};

export type Previsualizacion = {
  destino: { id: string; version: number; interval: string; nombrePlan: string };
  miembros: MiembroDeLaCohorte[];
  resumen: { total: number; mejoran: number; empeoran: number; sinCambio: number };
  /** Beneficios del reglamento en los que alguien queda peor. */
  empeoranVinculante: { label: string; personas: number }[];
  /** Si es true, ejecutar exige documento legal + confirmación explícita. */
  exigePapel: boolean;
  /**
   * Suscripciones que cumplían el filtro pero son de OTRO plan, y por eso
   * quedaron fuera. Una migración nunca cruza de plan (sección 0 del $599).
   */
  fueraPorOtroPlan: number;
};

/** Los estados que cuentan como "miembro vigente" si no se pide otra cosa. */
const ESTADOS_POR_OMISION = ["active", "past_due"];

function saldoDe(cambios: CambioDeBeneficio[]): "mejora" | "igual" | "empeora" {
  if (cambios.some((c) => c.direccion === -1)) return "empeora";
  if (cambios.some((c) => c.direccion === 1)) return "mejora";
  return "igual";
}

/**
 * Arma el antes y el después sin tocar nada. Es lo que se enseña en pantalla.
 */
export async function previsualizarMigracion(
  admin: Admin,
  input: { versionDestinoId: string; filtro: FiltroCohorte },
): Promise<Previsualizacion | { error: string }> {
  const { data: destino } = await admin
    .from("plan_versions")
    .select("id, version, interval, status, benefits, membership_plans(name, slug)")
    .eq("id", input.versionDestinoId)
    .maybeSingle();
  if (!destino) return { error: "La versión destino no existe." };
  if (destino.status !== "publicada")
    return {
      error:
        "Solo se migra a una versión publicada. Una versión en borrador todavía puede cambiar debajo de la gente.",
    };

  const plan = Array.isArray(destino.membership_plans)
    ? destino.membership_plans[0]
    : destino.membership_plans;

  const beneficiosDestino = beneficiosDe(
    destino.benefits as Record<string, unknown>,
  );

  // --- La cohorte ----------------------------------------------------------
  let consulta = admin
    .from("subscriptions")
    .select(
      "id, user_id, status, created_at, plan_version_id, benefits_snapshot, profiles!user_id(first_name, last_name, email)",
    )
    .in("status", input.filtro.estados?.length ? input.filtro.estados : ESTADOS_POR_OMISION);

  if (input.filtro.versionOrigenId)
    consulta = consulta.eq("plan_version_id", input.filtro.versionOrigenId);

  if (input.filtro.antiguedadMinMeses && input.filtro.antiguedadMinMeses > 0) {
    const corte = new Date();
    corte.setMonth(corte.getMonth() - input.filtro.antiguedadMinMeses);
    consulta = consulta.lte("created_at", corte.toISOString());
  }

  const { data: subs, error } = await consulta;
  if (error) return { error: "No se pudo leer la cohorte." };

  // Los nombres de las versiones de origen, para que la tabla se lea, y el
  // plan de cada una.
  const { data: versiones } = await admin
    .from("plan_versions")
    .select("id, version, interval, membership_plans(slug)");
  const nombreVersion = new Map(
    (versiones ?? []).map((v) => [v.id, `v${v.version} ${v.interval === "year" ? "anual" : "mensual"}`]),
  );
  const slugDe = (x: unknown) =>
    ((Array.isArray(x) ? x[0] : x) as { slug?: string } | null)?.slug;
  const planDeVersion = new Map(
    (versiones ?? []).map((v) => [v.id, slugDe(v.membership_plans)]),
  );
  const planDestino = slugDe(destino.membership_plans);

  const miembros: MiembroDeLaCohorte[] = [];
  let fueraPorOtroPlan = 0;
  for (const s of subs ?? []) {
    // La suscripción destino ya es esta: no hay nada que migrar.
    if (s.plan_version_id === input.versionDestinoId) continue;

    // NUNCA SE CRUZA DE PLAN. Migrar mueve la foto de beneficios, no el precio
    // en Stripe: un miembro de $159 movido a una versión del $599 seguiría
    // pagando $159 con las reglas del $599. Sin versión = plan de $159. Si no
    // se sabe el plan de algo, se deja fuera.
    const planDelMiembro = s.plan_version_id
      ? planDeVersion.get(s.plan_version_id)
      : PLAN_159;
    if (!planDestino || planDelMiembro !== planDestino) {
      fueraPorOtroPlan++;
      continue;
    }

    const antes = beneficiosDe(
      s.benefits_snapshot as Record<string, unknown> | null,
    );
    const cambios: CambioDeBeneficio[] = diferencias(antes, beneficiosDestino).map(
      (d) => ({
        llave: d.llave,
        label: d.label,
        antes: antes[d.llave as LlaveBeneficio],
        despues: beneficiosDestino[d.llave as LlaveBeneficio],
        vinculante: d.vinculante,
        direccion: comparaParaElMiembro(
          d.llave,
          antes[d.llave as LlaveBeneficio],
          beneficiosDestino[d.llave as LlaveBeneficio],
        ),
      }),
    );

    const perfil = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    miembros.push({
      subscriptionId: s.id,
      userId: s.user_id,
      nombre:
        [perfil?.first_name, perfil?.last_name].filter(Boolean).join(" ") ||
        "Sin nombre",
      email: perfil?.email ?? null,
      versionOrigen: s.plan_version_id
        ? (nombreVersion.get(s.plan_version_id) ?? "otra versión")
        : "sin versión",
      cambios,
      saldo: saldoDe(cambios),
    });
  }

  // --- ¿Alguien queda peor en algo del reglamento? -------------------------
  const cuentaPorBeneficio = new Map<string, number>();
  for (const m of miembros)
    for (const c of m.cambios)
      if (c.direccion === -1 && c.vinculante)
        cuentaPorBeneficio.set(c.label, (cuentaPorBeneficio.get(c.label) ?? 0) + 1);

  const empeoranVinculante = [...cuentaPorBeneficio.entries()].map(
    ([label, personas]) => ({ label, personas }),
  );

  return {
    destino: {
      id: destino.id,
      version: destino.version,
      interval: destino.interval,
      nombrePlan: plan?.name ?? "Plan",
    },
    miembros,
    resumen: {
      total: miembros.length,
      mejoran: miembros.filter((m) => m.saldo === "mejora").length,
      empeoran: miembros.filter((m) => m.saldo === "empeora").length,
      sinCambio: miembros.filter((m) => m.saldo === "igual").length,
    },
    empeoranVinculante,
    exigePapel: empeoranVinculante.length > 0,
    fueraPorOtroPlan,
  };
}

export type ResultadoMigracion = {
  migrados: number;
  fallidos: number;
  correosEnviados: number;
};

/**
 * Ejecuta la migración: snapshot nuevo, registro por miembro y correo.
 *
 * Se vuelve a calcular la previsualización aquí dentro a propósito. Entre que
 * alguien miró la pantalla y le dio al botón pudo entrar gente a la cohorte o
 * cambiar una versión; confiar en lo que mandó el navegador sería confiar en
 * una foto vieja para una acción que no se deshace.
 */
export async function ejecutarMigracion(
  admin: Admin,
  input: {
    versionDestinoId: string;
    filtro: FiltroCohorte;
    /** Reglamento que ya refleja el cambio. Obligatorio si alguien queda peor. */
    legalDocumentId?: string | null;
    confirmadoPor: string;
  },
): Promise<ResultadoMigracion | { error: string }> {
  const previa = await previsualizarMigracion(admin, {
    versionDestinoId: input.versionDestinoId,
    filtro: input.filtro,
  });
  if ("error" in previa) return previa;

  if (previa.exigePapel && !input.legalDocumentId)
    return {
      error: `Esta migración deja a alguien peor en ${previa.empeoranVinculante
        .map((e) => e.label)
        .join(", ")}, que está en el reglamento. Señala el documento legal que ya refleja el cambio para poder ejecutarla.`,
    };

  if (previa.miembros.length === 0)
    return { error: "Ningún miembro entra en esa cohorte." };

  let migrados = 0;
  let fallidos = 0;
  let correosEnviados = 0;

  for (const m of previa.miembros) {
    const res = await reemplazarSnapshot(admin, {
      subscriptionId: m.subscriptionId,
      userId: m.userId,
      planVersionId: input.versionDestinoId,
      kind: "beneficios_migrados",
      motivo: `Migrado de ${m.versionOrigen} a v${previa.destino.version} por decisión del equipo`,
      actorId: input.confirmadoPor,
    });
    if (!res) {
      fallidos++;
      continue;
    }
    migrados++;

    // El aviso. Solo a quien de verdad le cambió algo: un correo que dice
    // "cambiaron tus beneficios" y adentro no cambió nada quema confianza.
    if (m.email && m.cambios.length > 0) {
      const lista = m.cambios
        .map(
          (c) =>
            `<li><strong>${c.label}</strong>: ${formatearValor(c.llave, c.antes)} → ${formatearValor(c.llave, c.despues)}</li>`,
        )
        .join("");
      const ok = await sendTemplatedEmail("plan_migrado", m.email, {
        firstName: m.nombre.split(" ")[0] ?? "",
        cambiosHtml: `<ul>${lista}</ul>`,
      });
      if (ok) correosEnviados++;
    }
  }

  return { migrados, fallidos, correosEnviados };
}

/** Un valor de beneficio como lo leería una persona. */
export function formatearValor(llave: string, valor: number | boolean): string {
  const def = CATALOGO_BENEFICIOS[llave as LlaveBeneficio];
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  if (def?.tipo === "dinero") return `$${valor.toLocaleString("es-MX")} MXN`;
  // No todos los beneficios llevan unidad (p. ej. "Apelaciones por caso").
  const unidad = def && "unidad" in def ? def.unidad : undefined;
  return `${valor}${unidad ? ` ${unidad}` : ""}`;
}
