import type { createAdminClient } from "@/lib/supabase/admin";
import {
  beneficiosPorOmision,
  diferencias,
  type Beneficios,
  type LlaveBeneficio,
} from "@/lib/plans/benefits";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * EL RESOLVEDOR: una sola puerta para saber qué beneficios rigen a un miembro.
 *
 * Orden: catálogo (valores por omisión) ← snapshot de la suscripción.
 *
 * Los huecos SIEMPRE los llena el catálogo. Eso es lo que permite agregar un
 * beneficio nuevo mañana sin que las versiones viejas queden con un valor
 * indefinido — heredan el por omisión en lugar de romperse.
 *
 * Si la suscripción no trae snapshot (datos anteriores a esta sección),
 * devuelve los valores por omisión, que son exactamente las reglas de hoy.
 */
export function beneficiosDe(
  snapshot: Record<string, unknown> | null | undefined,
): Beneficios {
  const base = beneficiosPorOmision();
  if (!snapshot) return base;

  const salida = { ...base };
  for (const llave of Object.keys(base) as LlaveBeneficio[]) {
    const valor = snapshot[llave];
    if (typeof valor === "number" || typeof valor === "boolean")
      salida[llave] = valor;
  }
  return salida;
}

/**
 * Beneficios que rigen a un usuario, leyendo su suscripción.
 *
 * Nunca lanza: ante cualquier problema devuelve los valores por omisión. Que
 * una consulta falle no debe cambiarle las reglas a un miembro.
 */
export async function beneficiosDeUsuario(
  admin: Admin,
  userId: string,
): Promise<Beneficios> {
  try {
    const { data } = await admin
      .from("subscriptions")
      .select("benefits_snapshot, status")
      .eq("user_id", userId)
      .in("status", ["active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return beneficiosDe(data?.benefits_snapshot as Record<string, unknown> | null);
  } catch {
    return beneficiosPorOmision();
  }
}

/** Beneficios de una versión de plan (para el checkout, antes de que exista snapshot). */
export async function beneficiosDeVersion(
  admin: Admin,
  planVersionId: string | null | undefined,
): Promise<Beneficios> {
  if (!planVersionId) return beneficiosPorOmision();
  try {
    const { data } = await admin
      .from("plan_versions")
      .select("benefits")
      .eq("id", planVersionId)
      .maybeSingle();
    return beneficiosDe(data?.benefits as Record<string, unknown> | null);
  } catch {
    return beneficiosPorOmision();
  }
}

/**
 * Toma la foto de los beneficios al momento de contratar.
 *
 * Es lo que hace real el grandfathering: a partir de aquí ese miembro se rige
 * por SU copia, no por lo que diga el plan después. La persona aceptó un
 * reglamento concreto.
 */
export async function tomarSnapshot(
  admin: Admin,
  input: { subscriptionId: string; planVersionId?: string | null },
): Promise<boolean> {
  try {
    let beneficios: Beneficios = beneficiosPorOmision();

    if (input.planVersionId) {
      const { data: version } = await admin
        .from("plan_versions")
        .select("benefits")
        .eq("id", input.planVersionId)
        .maybeSingle();
      // La versión guarda SOLO las diferencias contra el catálogo.
      beneficios = beneficiosDe(
        version?.benefits as Record<string, unknown> | null,
      );
    }

    const { error } = await admin
      .from("subscriptions")
      .update({
        ...(input.planVersionId ? { plan_version_id: input.planVersionId } : {}),
        benefits_snapshot: beneficios,
        benefits_snapshot_at: new Date().toISOString(),
      })
      .eq("id", input.subscriptionId);
    return !error;
  } catch (err) {
    console.error("[planes] no se pudo tomar el snapshot de beneficios", err);
    return false;
  }
}

/**
 * Cambia el snapshot de un miembro que YA tiene uno, dejando escrito el antes
 * y el después.
 *
 * Es la única forma de tocar la foto de alguien después de contratar, y son
 * dos los casos que lo justifican: que el propio miembro cambie de plan
 * (sección 3, punto 6.3) o que un super admin migre su cohorte (punto 4.1).
 * En los dos hay que poder responder después "¿qué tenía antes esta persona?",
 * así que el registro no es opcional: si no se puede escribir la actividad, el
 * cambio igual queda, pero se avisa en el log.
 *
 * Devuelve el antes y el después para que quien llame pueda mostrarlo o
 * mandarlo por correo.
 */
export async function reemplazarSnapshot(
  admin: Admin,
  input: {
    subscriptionId: string;
    userId: string;
    planVersionId: string;
    /** Por qué cambió, en una frase, para la línea de tiempo del contacto. */
    motivo: string;
    kind: "plan_cambiado" | "beneficios_migrados";
    /** Quién lo hizo. Vacío = el propio miembro. */
    actorId?: string | null;
  },
): Promise<{ antes: Beneficios; despues: Beneficios } | null> {
  try {
    const [{ data: sub }, { data: version }] = await Promise.all([
      admin
        .from("subscriptions")
        .select("benefits_snapshot")
        .eq("id", input.subscriptionId)
        .maybeSingle(),
      admin
        .from("plan_versions")
        .select("benefits, version, interval")
        .eq("id", input.planVersionId)
        .maybeSingle(),
    ]);
    if (!version) return null;

    const antes = beneficiosDe(
      sub?.benefits_snapshot as Record<string, unknown> | null,
    );
    const despues = beneficiosDe(version.benefits as Record<string, unknown>);

    const { error } = await admin
      .from("subscriptions")
      .update({
        plan_version_id: input.planVersionId,
        benefits_snapshot: despues,
        benefits_snapshot_at: new Date().toISOString(),
      })
      .eq("id", input.subscriptionId);
    if (error) return null;

    // El rastro. Va por el mismo sumidero que todo lo demás para que aparezca
    // en la ficha del contacto sin pantallas nuevas.
    const cambios = diferencias(antes, despues);
    const { crmEventoDeUsuario } = await import("@/lib/crm/sync");
    await crmEventoDeUsuario(admin, {
      userId: input.userId,
      kind: input.kind,
      summary: input.motivo,
      payload: {
        plan_version_id: input.planVersionId,
        version: version.version,
        interval: version.interval,
        actor_id: input.actorId ?? null,
        // El antes y el después completos, no solo lo que cambió: dentro de un
        // año nadie va a poder reconstruir el catálogo de hoy.
        antes,
        despues,
        cambios: cambios.map((c) => ({
          beneficio: c.label,
          antes: c.antes,
          despues: c.despues,
          vinculante: c.vinculante,
        })),
      },
    });

    return { antes, despues };
  } catch (err) {
    console.error("[planes] no se pudo reemplazar el snapshot", err);
    return null;
  }
}

/** Períodos de espera con la forma que espera petWaitingPeriodDays. */
export function esperasDe(beneficios: Beneficios) {
  return {
    espera_mascota_estandar_dias: Number(beneficios.espera_mascota_estandar_dias),
    espera_mascota_adoptada_raza_dias: Number(
      beneficios.espera_mascota_adoptada_raza_dias,
    ),
    espera_mascota_adoptada_mestizo_dias: Number(
      beneficios.espera_mascota_adoptada_mestizo_dias,
    ),
    espera_mascota_con_embajador_dias: Number(
      beneficios.espera_mascota_con_embajador_dias,
    ),
    // Sin `espera_mascota_reemplazo_dias`: el reemplazo dejó de tener días
    // propios el 11-ago (se evalúa con las condiciones normales, sin el
    // beneficio del embajador).
  };
}

/** Topes de reintegro con la forma que espera calculateBalances. */
export function topesDe(beneficios: Beneficios) {
  return {
    vet_expenses: Number(beneficios.tope_gastos_veterinarios_mxn),
    death: Number(beneficios.tope_fallecimiento_mxn),
    vaccines: Number(beneficios.tope_vacunas_mxn),
  };
}
