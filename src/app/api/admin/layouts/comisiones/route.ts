import { NextResponse } from "next/server";
import { corteDeComisiones } from "@/lib/comisiones";
import { requireAdminRoute } from "@/lib/admin-guard";
import { bankFromClabe, csvCell } from "@/lib/banks";
import { inicioDelMes } from "@/lib/zona-horaria";

/**
 * Layout bancario (CSV) para la dispersión del corte mensual de comisiones:
 * suma por embajador de los referidos pendientes generados antes del mes en
 * curso. Se sube al portal del banco para transferencias masivas (SPEI).
 * Los embajadores sin CLABE registrada aparecen marcados para seguimiento.
 *
 * INCLUYE A LOS DADOS DE BAJA (14-ago). Antes filtraba `status = approved`, y
 * eso dejaba fuera del archivo del banco a quien se dio de baja con comisiones
 * ya ganadas — justo lo contrario de lo que su portal le promete al confirmar
 * la baja ("las comisiones ya ganadas se pagan con normalidad en el siguiente
 * corte"). El filtro que importa no es el estatus sino el saldo: aquí entra
 * quien tenga dinero pendiente de un mes ya cerrado, sin importar si sigue
 * activo. En el concepto se marca la baja para que quien revisa el archivo
 * sepa que es el último pago de esa persona.
 *
 * HASTA LA FECHA DE LA BAJA, NI UN DÍA MÁS (Pablo, 16-ago). "Ya ganada" es la
 * comisión de una membresía que ENTRÓ POR LA PASARELA antes de que la persona
 * se diera de baja: quien cancela el 15 cobra lo que se pagó hasta el 15. Los
 * pagos que caen después no se le abonan, porque la operación no puede
 * garantizar que esas membresías lleguen a cobrarse —la factura y el cargo
 * pueden separarse diez días o más—. En la práctica el webhook ya no crea
 * referidos de un embajador dado de baja (filtra por `approved`), así que este
 * filtro es el cinturón sobre los tirantes: deja el corte a prueba de filas
 * cargadas a mano o de una baja que se registra tarde.
 */
export async function GET() {
  const ctx = await requireAdminRoute();
  if (!ctx) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  // El corte del mes es el mexicano: este CSV se sube al banco y define a quién
  // se le paga, así que no puede depender de dónde corrió el proceso.
  const monthStart = inicioDelMes();

  const { data } = await ctx.admin
    .from("ambassadors")
    .select(
      "id, first_name, last_name, email, bank_name, clabe, referral_code, status, deactivated_at",
    )
    .in("status", ["approved", "canceled"]);

  // Las dos fuentes (comisión única del $159 y mensual del $599), con la regla
  // del corte y de la baja en un solo lugar: src/lib/comisiones.
  const { porEmbajador } = await corteDeComisiones(ctx.admin, monthStart);
  const rows = (data ?? [])
    .map((a) => ({
      a,
      total:
        Math.round(
          (porEmbajador.get(a.id) ?? []).reduce((s, i) => s + i.monto, 0) * 100,
        ) / 100,
    }))
    .filter(({ total }) => total > 0);

  const header = "CLABE,BENEFICIARIO,BANCO,MONTO,CONCEPTO,CORREO";
  const lines = rows.map(({ a, total }) =>
    [
      csvCell(a.clabe ?? "SIN CLABE — solicitar al embajador"),
      csvCell(`${a.first_name} ${a.last_name ?? ""}`.trim().toUpperCase()),
      csvCell(a.bank_name ?? (a.clabe ? (bankFromClabe(a.clabe) ?? "") : "")),
      total.toFixed(2),
      csvCell(
        `COMISION PATA AMIGA ${a.referral_code ?? ""}${a.status === "canceled" ? " (BAJA - ULTIMO PAGO)" : ""}`.trim(),
      ),
      csvCell(a.email),
    ].join(","),
  );

  const period = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(monthStart);

  // BOM para que Excel abra el CSV con acentos correctos
  return new NextResponse("﻿" + [header, ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="layout-comisiones-${period.replace(/\s/g, "-")}.csv"`,
    },
  });
}
