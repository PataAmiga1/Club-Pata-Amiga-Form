"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { leerAjustesIA } from "@/lib/llm/gobierno";
import { CATEGORIAS, type Categoria } from "@/lib/costos";

/**
 * Captura de costos de la plataforma — TODO es exclusivo del super admin
 * (mismo criterio que el resto de Finanzas sensible, decisión del 3-ago).
 *
 * ⚠ Este archivo solo puede exportar funciones async: un `export const` pasa
 * el lint y el typecheck y tumba el build (trampa ya documentada).
 */
async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") throw new Error("Solo super admin");
  return { adminId: user.id, admin: createAdminClient() };
}

/** Tipo de cambio declarado en Ajustes de IA — no se duplica la configuración. */
async function tipoDeCambio(admin: ReturnType<typeof createAdminClient>) {
  const ajustes = await leerAjustesIA(admin);
  const tc = Number(ajustes.ia_tipo_cambio_mxn ?? "20");
  return Number.isFinite(tc) && tc > 0 ? tc : 20;
}

export async function guardarCosto(input: {
  id?: string;
  proveedor: string;
  concepto: string;
  categoria: string;
  /** "YYYY-MM" */
  mes: string;
  /** Lo que escribió la persona, en pesos o dólares (no centavos) */
  monto: string;
  moneda: string;
  recurrente: boolean;
  prorratearMeses?: string;
  nota?: string;
}) {
  const { adminId, admin } = await requireSuperAdmin();

  const concepto = input.concepto?.trim();
  if (!concepto) return { error: "Escribe el concepto (ej. «Plan Pro»)." };
  if (!/^\d{4}-\d{2}$/.test(input.mes)) return { error: "Elige el mes." };
  if (!(input.categoria in CATEGORIAS))
    return { error: "Elige una categoría válida." };

  // Se captura en pesos/dólares y se guarda en centavos enteros, como el
  // resto del sistema (nunca decimales flotando).
  const monto = Number(String(input.monto).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(monto) || monto <= 0)
    return { error: "El monto tiene que ser mayor a cero." };
  const montoCentavos = Math.round(monto * 100);

  const moneda = input.moneda === "USD" ? "USD" : "MXN";
  const tc = moneda === "USD" ? await tipoDeCambio(admin) : 1;
  // El tipo de cambio se CONGELA aquí: si el dólar se mueve, el costo de
  // marzo no puede cambiar tres meses después.
  const montoMxn = Math.round(montoCentavos * tc);

  const prorratear = input.prorratearMeses
    ? Number(input.prorratearMeses)
    : null;
  if (prorratear !== null && (!Number.isInteger(prorratear) || prorratear < 2))
    return { error: "El prorrateo debe ser de 2 meses o más." };

  const fila = {
    proveedor: input.proveedor,
    concepto,
    categoria: input.categoria,
    periodo: `${input.mes}-01`,
    monto_centavos: montoCentavos,
    moneda,
    monto_mxn_centavos: montoMxn,
    tipo_cambio: tc,
    origen: "manual" as const,
    recurrente: input.recurrente,
    prorratear_meses: prorratear,
    nota: input.nota?.trim() || null,
    capturado_por: adminId,
    updated_at: new Date().toISOString(),
  };

  const { error } = input.id
    ? await admin.from("platform_costs").update(fila).eq("id", input.id)
    : await admin.from("platform_costs").insert(fila);
  if (error) return { error: "No pudimos guardar el costo. Intenta de nuevo." };

  revalidatePath("/admin/costos");
  revalidatePath("/admin/finanzas");
  return { ok: true as const };
}

export async function borrarCosto(id: string) {
  const { admin } = await requireSuperAdmin();
  const { error } = await admin.from("platform_costs").delete().eq("id", id);
  if (error) return { error: "No pudimos borrar el renglón." };
  revalidatePath("/admin/costos");
  revalidatePath("/admin/finanzas");
  return { ok: true as const };
}

/**
 * Trae los costos recurrentes del mes anterior al mes pedido.
 *
 * Sin esto, capturar es volver a teclear los mismos ocho renglones cada mes y
 * la tabla se abandona al segundo mes. No pisa lo ya capturado.
 */
export async function copiarRecurrentes(mes: string) {
  const { adminId, admin } = await requireSuperAdmin();
  if (!/^\d{4}-\d{2}$/.test(mes)) return { error: "Mes inválido." };

  const [y, m] = mes.split("-").map(Number);
  const anteriorTotal = y * 12 + (m - 1) - 1;
  const anterior = `${Math.floor(anteriorTotal / 12)}-${String((anteriorTotal % 12) + 1).padStart(2, "0")}`;

  const [{ data: previos }, { data: actuales }] = await Promise.all([
    admin
      .from("platform_costs")
      .select("*")
      .eq("periodo", `${anterior}-01`)
      .eq("recurrente", true)
      .eq("origen", "manual"),
    admin
      .from("platform_costs")
      .select("proveedor, concepto")
      .eq("periodo", `${mes}-01`),
  ]);

  const yaEstan = new Set(
    (actuales ?? []).map((c) => `${c.proveedor}|${c.concepto}`),
  );
  const nuevos = (previos ?? [])
    .filter((c) => !yaEstan.has(`${c.proveedor}|${c.concepto}`))
    // Un anual prorrateado ya aporta a este mes por sí solo: copiarlo lo
    // contaría dos veces.
    .filter((c) => !c.prorratear_meses)
    .map((c) => ({
      proveedor: c.proveedor,
      concepto: c.concepto,
      categoria: c.categoria,
      periodo: `${mes}-01`,
      monto_centavos: c.monto_centavos,
      moneda: c.moneda,
      monto_mxn_centavos: c.monto_mxn_centavos,
      tipo_cambio: c.tipo_cambio,
      origen: "manual" as const,
      recurrente: true,
      prorratear_meses: null,
      nota: c.nota,
      capturado_por: adminId,
    }));

  if (nuevos.length === 0)
    return { ok: true as const, copiados: 0, desde: anterior };

  const { error } = await admin.from("platform_costs").insert(nuevos);
  if (error) return { error: "No pudimos copiar los recurrentes." };

  revalidatePath("/admin/costos");
  return { ok: true as const, copiados: nuevos.length, desde: anterior };
}

/**
 * Enchufes automáticos: los dos costos que YA sabemos sin que nadie capture.
 *
 *  · IA: `ai_usage.cost_cents` guarda el costo real de cada llamada.
 *  · Stripe: cada transacción de balance trae su comisión (`fee`).
 *
 * Se reescriben en cada corrida (llave única por proveedor+concepto+mes en
 * los automáticos), así que volver a pedirlo no duplica nada.
 */
export async function recalcularAutomaticos(mes: string) {
  const { admin } = await requireSuperAdmin();
  if (!/^\d{4}-\d{2}$/.test(mes)) return { error: "Mes inválido." };

  const desde = new Date(`${mes}-01T00:00:00-06:00`);
  const [y, m] = mes.split("-").map(Number);
  const siguienteTotal = y * 12 + (m - 1) + 1;
  const siguiente = `${Math.floor(siguienteTotal / 12)}-${String((siguienteTotal % 12) + 1).padStart(2, "0")}`;
  const hasta = new Date(`${siguiente}-01T00:00:00-06:00`);

  /**
   * Borra el renglón automático del mes y lo vuelve a insertar.
   *
   * NO se usa `upsert`: la llave única de los automáticos es PARCIAL
   * (`where origen = 'automatico'`) y Postgres no puede inferir un índice
   * parcial desde ON CONFLICT — devuelve 42P10 y no guarda nada. Como el
   * error no se revisaba, la pantalla anunciaba "IA: $0.08 · Comisiones:
   * $109.84 ✓" mientras la tabla seguía vacía.
   */
  const guardar = async (
    proveedor: string,
    concepto: string,
    categoria: Categoria,
    centavosMxn: number,
  ): Promise<string | null> => {
    await admin
      .from("platform_costs")
      .delete()
      .eq("proveedor", proveedor)
      .eq("concepto", concepto)
      .eq("periodo", `${mes}-01`)
      .eq("origen", "automatico");
    // Sin consumo no se deja un renglón en cero: el mes se lee mejor sin él
    if (centavosMxn <= 0) return null;

    const { error } = await admin.from("platform_costs").insert({
      proveedor,
      concepto,
      categoria,
      periodo: `${mes}-01`,
      monto_centavos: centavosMxn,
      moneda: "MXN",
      monto_mxn_centavos: centavosMxn,
      tipo_cambio: 1,
      origen: "automatico",
      recurrente: false,
      prorratear_meses: null,
      nota: "Calculado por la plataforma",
      updated_at: new Date().toISOString(),
    });
    return error ? `No se pudo guardar «${concepto}».` : null;
  };

  // --- IA: suma real de lo que costaron las llamadas del mes ---
  const { data: usos } = await admin
    .from("ai_usage")
    .select("cost_cents")
    .gte("created_at", desde.toISOString())
    .lt("created_at", hasta.toISOString());
  const iaCentavos = (usos ?? []).reduce(
    (acc, u) => acc + Number(u.cost_cents ?? 0),
    0,
  );
  const fallos: string[] = [];
  const falloIa = await guardar(
    "anthropic",
    "Consumo de agentes IA",
    "ia",
    iaCentavos,
  );
  if (falloIa) fallos.push(falloIa);

  // --- Stripe: comisiones cobradas en el mes ---
  let stripeCentavos = 0;
  let stripeError: string | null = null;
  try {
    const stripe = getStripe();
    let startingAfter: string | undefined;
    // Paginación: un mes con muchos cobros no cabe en una sola página
    for (let pagina = 0; pagina < 10; pagina++) {
      const lote = await stripe.balanceTransactions.list({
        limit: 100,
        created: {
          gte: Math.floor(desde.getTime() / 1000),
          lt: Math.floor(hasta.getTime() / 1000),
        },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const t of lote.data) stripeCentavos += t.fee ?? 0;
      if (!lote.has_more || lote.data.length === 0) break;
      startingAfter = lote.data[lote.data.length - 1]?.id;
    }
  } catch {
    // Que Stripe no responda no debe tumbar el recálculo de la IA
    stripeError = "No pudimos leer las comisiones de Stripe.";
  }
  if (!stripeError) {
    const falloStripe = await guardar(
      "stripe",
      "Comisiones por transacción",
      "comisiones",
      stripeCentavos,
    );
    if (falloStripe) fallos.push(falloStripe);
  }

  revalidatePath("/admin/costos");
  revalidatePath("/admin/finanzas");
  // Si algo no se guardó se dice: un "✓" con la tabla vacía es peor que un
  // error, porque nadie va a volver a revisar.
  if (fallos.length > 0) return { error: fallos.join(" ") };
  return {
    ok: true as const,
    iaCentavos,
    stripeCentavos,
    stripeError,
  };
}

/** Responsable de capturar y día del recordatorio (Ajustes → se guarda en site_settings). */
export async function guardarResponsableCostos(email: string, dia: string) {
  const { admin } = await requireSuperAdmin();
  const correo = email.trim().toLowerCase();
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
    return { error: "Revisa el correo del responsable." };
  const diaNum = Number(dia);
  if (!Number.isInteger(diaNum) || diaNum < 1 || diaNum > 28)
    return { error: "El día debe estar entre 1 y 28." };

  await admin.from("site_settings").upsert(
    [
      { key: "costos_responsable_email", value: correo },
      { key: "costos_dia_recordatorio", value: String(diaNum) },
    ],
    { onConflict: "key" },
  );
  revalidatePath("/admin/costos");
  return { ok: true as const };
}
