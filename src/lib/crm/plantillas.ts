import type { createAdminClient } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/constants";
import { ALTAS_SON_599 } from "@/lib/plans/planes";
import { ofertaPublica599 } from "@/lib/plans/oferta";
import { pesosDeOferta } from "@/lib/plans/oferta-texto";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Plantillas de respuesta uno a uno de la bandeja.
 *
 * Las variables se resuelven con los datos REALES del contacto antes de
 * mostrarle el texto a la persona, para que nadie mande un "Hola {{nombre}}".
 */

export { VARIABLES } from "./plantillas-variables";

export type ValoresPlantilla = Record<string, string>;

/**
 * Junta los valores de las variables para un contacto.
 * Lo que no se pueda resolver queda como cadena vacía, nunca como "{{algo}}".
 */
export async function valoresDelContacto(
  admin: Admin,
  contactId: string | null,
  asesor: string,
): Promise<ValoresPlantilla> {
  const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pataamiga.mx";
  const oferta = ALTAS_SON_599 ? await ofertaPublica599(admin) : null;
  const base: ValoresPlantilla = {
    nombre: "",
    apellido: "",
    correo: "",
    telefono: "",
    etapa: "",
    plan_mensual: oferta
      ? `${pesosDeOferta(oferta.principal.mensualPesos)} MXN`
      : ALTAS_SON_599
        ? ""
        : `$${PLANS.monthly.amountMxn} MXN`,
    plan_anual: oferta
      ? `${pesosDeOferta(oferta.principal.anualPesos)} MXN`
      : ALTAS_SON_599
        ? ""
        : `$${PLANS.annual.amountMxn} MXN`,
    asesor,
    liga_registro: `${sitio}/registro`,
  };
  if (!contactId) return base;

  const { data } = await admin
    .from("contacts")
    .select(
      "first_name, last_name, contact_identities(kind, value), opportunities(pipeline_stages(name))",
    )
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return base;

  const idents = (data.contact_identities ?? []) as { kind: string; value: string }[];
  const oportunidad = (data.opportunities ?? [])[0] as
    | { pipeline_stages: { name: string }[] | { name: string } | null }
    | undefined;
  const etapa = Array.isArray(oportunidad?.pipeline_stages)
    ? oportunidad?.pipeline_stages[0]?.name
    : oportunidad?.pipeline_stages?.name;

  return {
    ...base,
    nombre: data.first_name ?? "",
    apellido: data.last_name ?? "",
    correo: idents.find((i) => i.kind === "email")?.value ?? "",
    telefono: idents.find((i) => i.kind === "phone")?.value ?? "",
    etapa: etapa ?? "",
  };
}

/** Sustituye {{variables}}. Las que no existan se quitan, no se dejan crudas. */
export function renderizar(texto: string, valores: ValoresPlantilla): string {
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, clave: string) => {
    const valor = valores[clave.toLowerCase()];
    return valor ?? "";
  });
}

/** Variables que la plantilla usa y el contacto no puede llenar. */
export function variablesVacias(
  texto: string,
  valores: ValoresPlantilla,
): string[] {
  const usadas = [...texto.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) =>
    m[1].toLowerCase(),
  );
  return [...new Set(usadas)].filter((v) => !valores[v]);
}

/** URL firmada de un adjunto (el bucket es privado). */
export async function urlAdjunto(
  admin: Admin,
  ruta: string,
  segundos = 60 * 60,
): Promise<string | null> {
  const { data } = await admin.storage
    .from("channel-attachments")
    .createSignedUrl(ruta, segundos);
  return data?.signedUrl ?? null;
}
