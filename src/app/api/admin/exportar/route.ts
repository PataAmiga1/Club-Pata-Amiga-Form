import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRoute } from "@/lib/admin-guard";
import type { createAdminClient } from "@/lib/supabase/admin";
import { csvCell } from "@/lib/banks";
import { getStripe } from "@/lib/stripe";
import { sexoDeMiembro } from "@/lib/sexo";
import { cargarBajas, ETIQUETA_ORIGEN_BAJA } from "@/lib/bajas";
import { edadEnAnios } from "@/lib/edad";
import { diaEnMexico } from "@/lib/zona-horaria";
import { reportePorGrano, type GranoDeReporte } from "@/lib/exportacion";

/**
 * Exportación a CSV de Finanzas (equipo, 26-ago): el admin elige qué es un
 * renglón y qué columnas se lleva, y aquí se arma el archivo.
 *
 * TRES GRANOS, TRES CONSULTAS DISTINTAS. Ver `src/lib/exportacion.ts` para el
 * porqué. Las columnas se resuelven por su clave contra un diccionario por
 * grano: agregar una columna nueva es agregarla al catálogo y aquí, y nada más.
 *
 * LAS FECHAS SON DÍAS MEXICANOS. Se pintan con `diaEnMexico` y no con
 * `toISOString().slice(0,10)`: en Vercel el proceso corre en UTC y a partir de
 * las 6 de la tarde hora de México un alta se reportaría con la fecha del día
 * siguiente. Un padrón que corre el día no es un padrón.
 */

export const dynamic = "force-dynamic";
/** El histórico de Stripe se pagina y puede tardar. */
export const maxDuration = 60;

type Fila = Record<string, string | number>;

const dia = (v: string | null | undefined) =>
  v ? diaEnMexico(new Date(v)) : "";

/** Tope de facturas que se traen de Stripe, por si el histórico crece. */
const TOPE_FACTURAS = 5000;

export async function GET(request: NextRequest) {
  const ctx = await requireAdminRoute();
  if (!ctx) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const grano = (params.get("grano") ?? "padron") as GranoDeReporte;
  const reporte = reportePorGrano(grano);
  if (!reporte)
    return NextResponse.json({ error: "Reporte desconocido" }, { status: 400 });

  // Solo se aceptan claves del catálogo: así una clave inventada en la URL no
  // se convierte en una columna vacía sin nombre.
  const pedidas = (params.get("columnas") ?? "").split(",").filter(Boolean);
  const columnas = reporte.columnas.filter((c) => pedidas.includes(c.key));
  if (columnas.length === 0)
    return NextResponse.json(
      { error: "Elige al menos una columna." },
      { status: 400 },
    );

  const desde = params.get("desde") || null;
  const hasta = params.get("hasta") || null;

  let filas: Fila[];
  try {
    filas =
      grano === "pagos"
        ? await filasDePagos(ctx.admin, desde, hasta)
        : grano === "padron"
          ? await filasDePadron(ctx.admin, desde, hasta)
          : await filasMensuales(ctx.admin, desde, hasta);
  } catch (e) {
    console.error("exportación fallida", e);
    return NextResponse.json(
      {
        error:
          grano === "pagos"
            ? "No pudimos leer los cobros de Stripe. Intenta de nuevo en un momento."
            : "No pudimos armar la exportación.",
      },
      { status: 502 },
    );
  }

  const encabezado = columnas.map((c) => csvCell(c.label)).join(",");
  const cuerpo = filas
    .map((f) => columnas.map((c) => csvCell(f[c.key] ?? "")).join(","))
    .join("\n");

  // BOM al frente: sin él, Excel en Windows abre los acentos rotos y el equipo
  // reporta el CSV como "viene con caracteres raros".
  const csv = `﻿${encabezado}\n${cuerpo}`;
  const nombre = `pata-amiga-${grano}-${diaEnMexico(new Date())}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}

/* ==================== Datos del miembro, compartidos ==================== */

type ClienteAdmin = ReturnType<typeof createAdminClient>;
type PerfilExport = Awaited<ReturnType<typeof cargarPerfiles>>;

async function cargarPerfiles(admin: ClienteAdmin) {
  const [{ data: perfiles }, { data: subs }, bajas, { data: peludos }] =
    await Promise.all([
      admin
        .from("profiles")
        .select(
          "id, email, first_name, last_name, mother_last_name, phone, curp, gender, birth_date, nationality, postal_code, state, city, colony, membership_status, member_since, created_at, ambassador_code_used, cfdi_requested, rfc, utm_source, utm_medium, utm_campaign",
        )
        .eq("role", "member"),
      admin
        .from("subscriptions")
        .select("user_id, plan, plan_name, amount, status, stripe_customer_id"),
      // Las bajas se resuelven juntando las tres señales fechadas — ver
      // `src/lib/bajas.ts`. Contarlas solo desde `cancellations` desaparecía a
      // quien se fue por un cobro fallido.
      cargarBajas(admin),
      admin.from("pets").select("user_id").eq("is_active", true),
    ]);

  const bajaDe = bajas.porUsuario;

  const listaSubs = subs ?? [];
  const subDe = new Map<string, (typeof listaSubs)[number]>();
  for (const s of listaSubs) if (!subDe.has(s.user_id)) subDe.set(s.user_id, s);

  const peludosDe = new Map<string, number>();
  for (const p of peludos ?? [])
    peludosDe.set(p.user_id, (peludosDe.get(p.user_id) ?? 0) + 1);

  return { perfiles: perfiles ?? [], bajaDe, subDe, peludosDe, bajas };
}

/** Todas las columnas posibles de UN miembro, ya resueltas. */
function filaDeMiembro(p: PerfilExport["perfiles"][number], ctx: PerfilExport): Fila {
  const baja = ctx.bajaDe.get(p.id);
  const sub = ctx.subDe.get(p.id);
  const { sexo, origen } = sexoDeMiembro(p.gender, p.curp);
  return {
    nombre: p.first_name ?? "",
    apellido_paterno: p.last_name ?? "",
    apellido_materno: p.mother_last_name ?? "",
    apellidos: [p.last_name, p.mother_last_name].filter(Boolean).join(" "),
    correo: p.email ?? "",
    telefono: p.phone ?? "",
    sexo,
    sexo_origen: origen,
    fecha_nacimiento: p.birth_date ?? "",
    edad: edadEnAnios(p.birth_date) ?? "",
    curp: p.curp ?? "",
    nacionalidad: p.nationality ?? "",
    estatus_membresia: p.membership_status ?? "",
    plan: sub?.plan_name ?? sub?.plan ?? "",
    monto_plan: sub?.amount ?? "",
    registro: dia(p.created_at),
    alta: dia(p.member_since),
    baja: baja?.fecha ?? "",
    motivo_baja: baja?.motivo ?? "",
    origen_baja: baja ? ETIQUETA_ORIGEN_BAJA[baja.origen] : "",
    encuesta_baja: baja?.survey ? JSON.stringify(baja.survey) : "",
    fin_cobertura: baja?.finCobertura ?? "",
    regreso: baja?.regresoEl ?? "",
    peludos: ctx.peludosDe.get(p.id) ?? 0,
    codigo_embajador: p.ambassador_code_used ?? "",
    utm_source: p.utm_source ?? "",
    utm_medium: p.utm_medium ?? "",
    utm_campaign: p.utm_campaign ?? "",
    estado: p.state ?? "",
    ciudad: p.city ?? "",
    colonia: p.colony ?? "",
    cp: p.postal_code ?? "",
    cfdi: p.cfdi_requested ? "Sí" : "No",
    rfc: p.rfc ?? "",
  };
}

/* ============================== Padrón ============================== */

async function filasDePadron(
  admin: ClienteAdmin,
  desde: string | null,
  hasta: string | null,
): Promise<Fila[]> {
  const ctx = await cargarPerfiles(admin);
  return ctx.perfiles
    .filter((p) => {
      // El rango se aplica al ALTA: es lo que se está exportando, el padrón de
      // quienes entraron en ese periodo.
      const alta = p.member_since ? diaEnMexico(new Date(p.member_since)) : null;
      if (desde && (!alta || alta < desde)) return false;
      if (hasta && (!alta || alta > hasta)) return false;
      return true;
    })
    .map((p) => filaDeMiembro(p, ctx))
    .sort((a, b) => String(b.alta).localeCompare(String(a.alta)));
}

/* ============================== Pagos ============================== */

async function filasDePagos(
  admin: ClienteAdmin,
  desde: string | null,
  hasta: string | null,
): Promise<Fila[]> {
  const ctx = await cargarPerfiles(admin);

  // El miembro se encuentra por su cliente de Stripe; el correo es el respaldo
  // para los cobros viejos que no tienen suscripción registrada aquí.
  const porCliente = new Map<string, string>();
  for (const [userId, s] of ctx.subDe)
    if (s.stripe_customer_id) porCliente.set(s.stripe_customer_id, userId);
  const porCorreo = new Map<string, string>();
  for (const p of ctx.perfiles)
    if (p.email) porCorreo.set(p.email.toLowerCase(), p.id);

  const stripe = getStripe();
  const facturas: {
    number: string | null;
    created: number;
    total: number;
    currency: string;
    status: string | null;
    customer: string | null;
    customer_email: string | null;
  }[] = [];

  let startingAfter: string | undefined;
  while (facturas.length < TOPE_FACTURAS) {
    const pagina = await stripe.invoices.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      ...(desde ? { created: { gte: Math.floor(new Date(`${desde}T00:00:00-06:00`).getTime() / 1000) } } : {}),
    });
    for (const f of pagina.data)
      facturas.push({
        number: f.number,
        created: f.created,
        total: f.total,
        currency: f.currency,
        status: f.status,
        customer: typeof f.customer === "string" ? f.customer : null,
        customer_email: f.customer_email,
      });
    if (!pagina.has_more || pagina.data.length === 0) break;
    startingAfter = pagina.data[pagina.data.length - 1].id;
  }

  const perfilPorId = new Map(ctx.perfiles.map((p) => [p.id, p]));

  return facturas
    .map((f) => {
      const fecha = diaEnMexico(new Date(f.created * 1000));
      const userId =
        (f.customer ? porCliente.get(f.customer) : undefined) ??
        (f.customer_email ? porCorreo.get(f.customer_email.toLowerCase()) : undefined);
      const perfil = userId ? perfilPorId.get(userId) : undefined;
      const base: Fila = perfil
        ? filaDeMiembro(perfil, ctx)
        : { correo: f.customer_email ?? "", sexo: "Sin dato", sexo_origen: "sin dato" };
      return {
        ...base,
        comprobante: f.number ?? "",
        fecha,
        // Stripe guarda centavos.
        monto: (f.total / 100).toFixed(2),
        moneda: f.currency.toUpperCase(),
        estado_cobro: f.status ?? "",
      };
    })
    .filter((f) => {
      if (desde && String(f.fecha) < desde) return false;
      if (hasta && String(f.fecha) > hasta) return false;
      return true;
    })
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

/* ============================== Mensual ============================== */

async function filasMensuales(
  admin: ClienteAdmin,
  desde: string | null,
  hasta: string | null,
): Promise<Fila[]> {
  const ctx = await cargarPerfiles(admin);

  type Celda = {
    altas: number;
    bajas: number;
    conMotivo: number;
    regresos: number;
    motivos: Map<string, number>;
    hombre: number;
    mujer: number;
    sinSexo: number;
  };
  const meses = new Map<string, Celda>();
  const celda = (mes: string) => {
    if (!meses.has(mes))
      meses.set(mes, {
        altas: 0,
        bajas: 0,
        conMotivo: 0,
        regresos: 0,
        motivos: new Map(),
        hombre: 0,
        mujer: 0,
        sinSexo: 0,
      });
    return meses.get(mes)!;
  };

  for (const p of ctx.perfiles) {
    if (!p.member_since) continue;
    const c = celda(diaEnMexico(new Date(p.member_since)).slice(0, 7));
    c.altas++;
    const { sexo } = sexoDeMiembro(p.gender, p.curp);
    if (sexo === "Hombre") c.hombre++;
    else if (sexo === "Mujer") c.mujer++;
    else c.sinSexo++;
  }

  for (const [, b] of ctx.bajaDe) {
    const c = celda(b.fecha.slice(0, 7));
    c.bajas++;
    if (b.motivo) {
      c.conMotivo++;
      c.motivos.set(b.motivo, (c.motivos.get(b.motivo) ?? 0) + 1);
    }
    if (b.regresoEl) celda(b.regresoEl.slice(0, 7)).regresos++;
  }

  return [...meses.entries()]
    .filter(([mes]) => {
      if (desde && mes < desde.slice(0, 7)) return false;
      if (hasta && mes > hasta.slice(0, 7)) return false;
      return true;
    })
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mes, c]) => ({
      mes,
      altas: c.altas,
      bajas: c.bajas,
      neto: c.altas - c.bajas,
      bajas_con_motivo: c.conMotivo,
      bajas_sin_motivo: c.bajas - c.conMotivo,
      regresos: c.regresos,
      motivos: [...c.motivos.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `${m} (${n})`)
        .join(" · "),
      altas_hombre: c.hombre,
      altas_mujer: c.mujer,
      altas_sin_sexo: c.sinSexo,
    }));
}
