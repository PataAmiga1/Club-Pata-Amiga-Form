import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-guard";
import { csvCell } from "@/lib/banks";
import { getCampaign } from "@/lib/landings";

/** Exporta los leads de campaña a CSV (todas o filtrada con ?c=<slug>). */
export async function GET(request: Request) {
  const ctx = await requireAdminRoute();
  if (!ctx) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const campaign = new URL(request.url).searchParams.get("c");
  // En una encuesta, cada pregunta es una columna más del CSV: así se abre en
  // Excel y se lee de corrido, sin pelearse con el JSON.
  const preguntas = campaign ? (getCampaign(campaign)?.preguntas ?? []) : [];
  let query = ctx.admin
    .from("campaign_leads")
    .select(
      "campaign, first_name, last_name, age, email, phone, utm_source, utm_medium, utm_campaign, gift_email_status, created_at, ambassador_code, respuestas",
    )
    .order("created_at", { ascending: false })
    .limit(5000);
  if (campaign) query = query.eq("campaign", campaign);
  const { data } = await query;

  const header = [
    "CAMPAÑA,NOMBRE,APELLIDOS,EDAD,CORREO,TELÉFONO,UTM_SOURCE,UTM_MEDIUM,UTM_CAMPAIGN,CORREO_REGALO,FECHA,CÓDIGO_EMBAJADOR",
    ...preguntas.map((q) => csvCell(q.texto)),
  ].join(",");
  const lines = (data ?? []).map((l) =>
    [
      csvCell(l.campaign),
      csvCell(l.first_name),
      csvCell(l.last_name),
      csvCell(l.age == null ? "" : String(l.age)),
      csvCell(l.email),
      csvCell(l.phone),
      csvCell(l.utm_source ?? ""),
      csvCell(l.utm_medium ?? ""),
      csvCell(l.utm_campaign ?? ""),
      csvCell(l.gift_email_status),
      csvCell(new Date(l.created_at).toISOString()),
      csvCell(l.ambassador_code ?? ""),
      ...preguntas.map((q) =>
        csvCell(String((l.respuestas as Record<string, string> | null)?.[q.id] ?? "")),
      ),
    ].join(","),
  );

  return new NextResponse("﻿" + [header, ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${campaign ?? "todas"}.csv"`,
    },
  });
}
