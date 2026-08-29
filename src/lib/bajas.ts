import type { createAdminClient } from "@/lib/supabase/admin";
import { diaEnMexico } from "@/lib/zona-horaria";

/**
 * Cuándo y por qué se fue cada miembro (equipo, 26-ago).
 *
 * POR QUÉ NO BASTA UNA TABLA. «Cuántos han abandonado por mes» parecía una
 * consulta a `cancellations`, y no lo es: esa tabla solo se escribe cuando el
 * miembro cancela desde SU PROPIA PANTALLA. Cuando la tarjeta rebota o la
 * suscripción se cancela en Stripe, el webhook marca la baja en `profiles` y en
 * `subscriptions` y deja un evento en el CRM — pero NO escribe en
 * `cancellations`. Contar solo de ahí desaparece a todo el que se fue por un
 * cobro fallido, que es de las formas más comunes de irse.
 *
 * En la base de pruebas: 10 perfiles cancelados, 2 eventos de CRM, 1 fila en
 * `cancellations`. Ninguna fuente sola dice la verdad.
 *
 * QUÉ HACE ESTO. Junta las tres señales fechadas y se queda con la más
 * temprana de cada persona, porque la fecha en que se fue es la primera vez
 * que el sistema se dio cuenta, no la última. El motivo solo puede venir de
 * `cancellations`: una tarjeta rechazada no da motivos, y eso no es un hueco
 * que se pueda tapar — es que no existe.
 *
 * Y CUENTA LO QUE NO PUDO FECHAR. `profiles.membership_status = 'canceled'`
 * es la única fuente COMPLETA de quién está dado de baja, pero no guarda
 * cuándo. La diferencia entre ese total y los que sí tienen fecha se devuelve
 * como `sinFecha` para que la pantalla la enseñe en vez de esconderla: un
 * tablero que subcuenta sin avisar es peor que uno que dice cuánto no sabe.
 */

type ClienteAdmin = ReturnType<typeof createAdminClient>;

export type OrigenDeLaBaja = "voluntaria" | "pasarela" | "suscripcion";

export type BajaDeMiembro = {
  userId: string;
  /** Día mexicano, yyyy-mm-dd. */
  fecha: string;
  motivo: string | null;
  survey: unknown | null;
  finCobertura: string | null;
  regresoEl: string | null;
  origen: OrigenDeLaBaja;
};

export type Bajas = {
  /** Una baja por persona, la más temprana que se pudo fechar. */
  porUsuario: Map<string, BajaDeMiembro>;
  /** Miembros dados de baja en `profiles` que ninguna fuente pudo fechar. */
  sinFecha: number;
  /** Total de miembros dados de baja según `profiles` — la cifra completa. */
  totalCancelados: number;
};

export async function cargarBajas(admin: ClienteAdmin): Promise<Bajas> {
  const [
    { data: cancelaciones },
    { data: contactos },
    { data: subsCanceladas },
    { data: perfilesCancelados },
  ] = await Promise.all([
    admin
      .from("cancellations")
      .select("user_id, reason, survey, coverage_end_date, rejoined_at, created_at"),
    // El evento del CRM cuelga de un contacto, no de un usuario: se liga por
    // `contacts.profile_id`. Si alguien nunca tuvo contacto en el CRM, su
    // evento no existe — por eso esta fuente tampoco alcanza sola.
    admin
      .from("contacts")
      .select("profile_id, contact_activities(kind, created_at)")
      .not("profile_id", "is", null),
    admin
      .from("subscriptions")
      .select("user_id, updated_at")
      .eq("status", "canceled"),
    admin
      .from("profiles")
      .select("id")
      .eq("role", "member")
      .eq("membership_status", "canceled"),
  ]);

  const porUsuario = new Map<string, BajaDeMiembro>();

  /** Se queda la fecha MÁS TEMPRANA; el motivo, en cuanto aparezca uno. */
  const anotar = (b: BajaDeMiembro) => {
    const previa = porUsuario.get(b.userId);
    if (!previa) {
      porUsuario.set(b.userId, b);
      return;
    }
    porUsuario.set(b.userId, {
      ...previa,
      fecha: b.fecha < previa.fecha ? b.fecha : previa.fecha,
      origen: b.fecha < previa.fecha ? b.origen : previa.origen,
      motivo: previa.motivo ?? b.motivo,
      survey: previa.survey ?? b.survey,
      finCobertura: previa.finCobertura ?? b.finCobertura,
      regresoEl: previa.regresoEl ?? b.regresoEl,
    });
  };

  for (const c of cancelaciones ?? [])
    anotar({
      userId: c.user_id,
      fecha: diaEnMexico(new Date(c.created_at)),
      motivo: (c.reason ?? "").trim() || null,
      survey: c.survey ?? null,
      finCobertura: c.coverage_end_date ?? null,
      regresoEl: c.rejoined_at ? diaEnMexico(new Date(c.rejoined_at)) : null,
      origen: "voluntaria",
    });

  type ContactoConEventos = {
    profile_id: string | null;
    contact_activities: { kind: string; created_at: string }[] | null;
  };
  for (const c of (contactos ?? []) as ContactoConEventos[]) {
    if (!c.profile_id) continue;
    for (const ev of c.contact_activities ?? []) {
      if (ev.kind !== "membresia_inactiva") continue;
      anotar({
        userId: c.profile_id,
        fecha: diaEnMexico(new Date(ev.created_at)),
        motivo: null,
        survey: null,
        finCobertura: null,
        regresoEl: null,
        origen: "pasarela",
      });
    }
  }

  for (const s of subsCanceladas ?? [])
    anotar({
      userId: s.user_id,
      fecha: diaEnMexico(new Date(s.updated_at)),
      motivo: null,
      survey: null,
      finCobertura: null,
      regresoEl: null,
      origen: "suscripcion",
    });

  const cancelados = (perfilesCancelados ?? []).map((p) => p.id);
  const sinFecha = cancelados.filter((id) => !porUsuario.has(id)).length;

  return { porUsuario, sinFecha, totalCancelados: cancelados.length };
}

/** Cómo se explica cada origen en pantalla. */
export const ETIQUETA_ORIGEN_BAJA: Record<OrigenDeLaBaja, string> = {
  voluntaria: "Canceló en la plataforma",
  pasarela: "Baja detectada en la pasarela",
  suscripcion: "Suscripción cancelada",
};
