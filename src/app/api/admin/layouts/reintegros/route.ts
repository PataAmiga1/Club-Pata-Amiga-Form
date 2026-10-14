import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-guard";
import { bankFromClabe, csvCell } from "@/lib/banks";
import { inicioDelMes } from "@/lib/zona-horaria";
import { reintegrosPorDispersar } from "@/lib/reintegros-pago";

/**
 * Layout bancario (CSV) para dispersar los reintegros aprobados del mes:
 * una fila por solicitud aprobada/parcial SIN PAGAR, con CLABE del miembro. Se sube al
 * portal del banco para transferencias masivas (SPEI) dentro de las 72 hrs.
 */
export async function GET() {
  const ctx = await requireAdminRoute();
  if (!ctx) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  // El corte del mes es el mexicano (lo aplica `reintegrosPorDispersar`); aquí
  // solo nombra el archivo.
  const monthStart = inicioDelMes();

  // Misma consulta que el panel «Marcar lote como pagado»: lo que se marca
  // como pagado es exactamente lo que trae este archivo. Los ya pagados
  // (`status = 'paid'`) quedan fuera, así que no se vuelven a dispersar.
  const data = await reintegrosPorDispersar(ctx.admin);

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const header = "CLABE,BENEFICIARIO,BANCO,MONTO,CONCEPTO,CORREO";
  const lines = data.map((r) => {
    const p = one(r.profiles) as {
      first_name?: string;
      last_name?: string;
      email?: string;
    } | null;
    return [
      csvCell(r.clabe ?? "SIN CLABE — solicitar al miembro"),
      csvCell(
        `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim().toUpperCase() ||
          "MIEMBRO",
      ),
      csvCell(r.clabe ? (bankFromClabe(r.clabe) ?? "") : ""),
      Number(r.amount_approved ?? 0).toFixed(2),
      csvCell(`REINTEGRO ${r.folio}`),
      csvCell(p?.email ?? ""),
    ].join(",");
  });

  const period = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(monthStart);

  return new NextResponse("﻿" + [header, ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="layout-reintegros-${period.replace(/\s/g, "-")}.csv"`,
    },
  });
}
