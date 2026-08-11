/**
 * Situación de cobro de un miembro. Existe porque hay TRES casos y hasta el
 * 11-ago la plataforma solo conocía dos, con consecuencias feas para el
 * tercero (auditoría de la migración):
 *
 *  - `stripe`   — se suscribió en esta plataforma. Su cobro vive en Stripe y se
 *                 puede cambiar de plan y cancelar desde el portal.
 *  - `heredado` — viene de la migración de Memberstack: está ACTIVO y tiene
 *                 acceso, pero su cobro NO vive aquí y no sabemos su plan ni
 *                 su fecha de renovación (esa información nunca se migró).
 *                 Son 60 de los 63 activos.
 *  - `ninguna`  — no tiene membresía.
 *
 * Antes de esta distinción, un miembro heredado veía tres cosas contradictorias:
 * en /app "Plan mensual" (inventado) con una fecha de renovación ya pasada, en
 * /app/cuenta "No tienes una membresía activa" con un botón para volver a
 * pagar, y en el admin "sin suscripción activa". Ninguna era cierta.
 */

export type SuscripcionCruda = {
  plan: string | null;
  amount?: number | string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
} | null;

export type SituacionCobro =
  | {
      tipo: "stripe";
      plan: "monthly" | "annual";
      cancelaAlCorte: boolean;
      finDePeriodo: string | null;
    }
  | { tipo: "heredado" }
  | { tipo: "ninguna" };

export function situacionDeCobro(
  membershipStatus: string | null | undefined,
  sub: SuscripcionCruda,
): SituacionCobro {
  if (sub) {
    return {
      tipo: "stripe",
      plan: sub.plan === "annual" ? "annual" : "monthly",
      cancelaAlCorte: Boolean(sub.cancel_at_period_end),
      finDePeriodo: sub.current_period_end ?? null,
    };
  }
  // Activo sin suscripción = migrado. NO inventar plan ni fecha.
  if (membershipStatus === "active") return { tipo: "heredado" };
  return { tipo: "ninguna" };
}

/** Etiqueta corta y honesta para mostrar en cualquier superficie. */
export function etiquetaDeCobro(s: SituacionCobro): string {
  if (s.tipo === "stripe")
    return s.plan === "annual" ? "Plan anual" : "Plan mensual";
  if (s.tipo === "heredado") return "Membresía activa";
  return "Sin membresía";
}

/**
 * Texto para el admin. Es el que evita que el comité crea que un miembro
 * migrado no tiene membresía.
 */
export const NOTA_HEREDADO_ADMIN =
  "Migrada de Memberstack: activa, pero su cobro no vive en esta plataforma " +
  "(no hay plan ni fecha de renovación registrados).";

export const NOTA_HEREDADO_MIEMBRO =
  "Tu membresía viene de nuestra plataforma anterior, así que tu plan y tu " +
  "próxima fecha de cobro no se muestran aquí todavía. Tu protección está " +
  "activa con normalidad.";
