import { createAdminClient } from "@/lib/supabase/admin";

/**
 * El expediente de una solicitud de embajador o de centro aliado
 * (equipo, 19-ago — decisiones 1.1 a 1.5).
 *
 * QUÉ CAMBIÓ. Antes aprobar era UNA decisión sobre toda la solicitud, y los
 * únicos documentos que se pedían eran las dos caras de la INE del embajador,
 * guardadas en dos columnas suyas. A los centros no se les pedía ni un papel:
 * se validaba a quien comparte un código y no al negocio al que se manda a los
 * miembros. Ahora cada documento es un renglón de `documents` con su propio
 * estado, porque el comité tiene que poder dar por bueno el RFC y dejar
 * pendiente la INE del representante (decisión 1.5).
 *
 * DE QUÉ BUCKET SALE CADA UNO. Se deriva del tipo, no de una columna: las
 * identificaciones viven en `ine-documents` —también las de un representante
 * legal, que al final es una INE como cualquier otra— y lo fiscal en
 * `documentos-solicitud`.
 */

export type TipoPersona = "fisica" | "moral";

export type EstadoDocumento = "pendiente" | "aprobado" | "denegado";

export type TipoDocumentoSolicitud =
  | "ine_front"
  | "ine_back"
  | "rfc_constancia"
  | "comprobante_domicilio";

const BUCKET_INE = "ine-documents";
const BUCKET_SOLICITUD = "documentos-solicitud";

/** En qué bucket vive un documento, según su tipo. */
export function bucketDe(tipo: string): string {
  return tipo === "ine_front" || tipo === "ine_back"
    ? BUCKET_INE
    : BUCKET_SOLICITUD;
}

/** Cómo se llama cada documento en el panel y en el portal. */
export const ETIQUETA_DOCUMENTO: Record<string, string> = {
  ine_front: "INE (frente)",
  ine_back: "INE (reverso)",
  rfc_constancia: "Constancia de situación fiscal (RFC)",
  comprobante_domicilio: "Comprobante de domicilio",
  passport: "Pasaporte",
  proof_of_address: "Comprobante de domicilio",
  vet_certificate: "Certificado veterinario",
};

export const ETIQUETA_ESTADO: Record<EstadoDocumento, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  denegado: "Denegado",
};

export type DocumentoDeSolicitud = {
  id: string;
  document_type: string;
  file_path: string;
  file_name: string | null;
  status: EstadoDocumento;
  review_notes: string | null;
  reviewed_at: string | null;
  uploaded_at: string;
};

export type DocumentoFirmado = DocumentoDeSolicitud & {
  etiqueta: string;
  url: string | null;
};

/**
 * Qué documentos exige una solicitud, según de quién sea y de qué tipo.
 *
 * La persona MORAL entrega su constancia fiscal Y la identificación de su
 * representante legal: el RFC prueba que la entidad existe y está registrada
 * ante el SAT, y la INE dice quién responde por ella. Con esas dos y la
 * revisión de la CLABE contra la razón social que hace el comité, el riesgo
 * queda cubierto sin pedir el acta constitutiva (decisión 1.1).
 */
export function documentosRequeridos(
  tipo: TipoPersona,
): TipoDocumentoSolicitud[] {
  return tipo === "moral"
    ? ["rfc_constancia", "ine_front", "ine_back"]
    : ["ine_front", "ine_back"];
}

/** Lee los documentos de una solicitud y les firma la liga (1 hora). */
export async function documentosDeSolicitud(
  sujeto: { ambassadorId: string } | { centerId: string },
): Promise<DocumentoFirmado[]> {
  const admin = createAdminClient();
  const consulta = admin
    .from("documents")
    .select(
      "id, document_type, file_path, file_name, status, review_notes, reviewed_at, uploaded_at",
    )
    .order("uploaded_at", { ascending: true });

  const { data } =
    "ambassadorId" in sujeto
      ? await consulta.eq("ambassador_id", sujeto.ambassadorId)
      : await consulta.eq("center_id", sujeto.centerId);

  return Promise.all(
    ((data ?? []) as DocumentoDeSolicitud[]).map(async (d) => {
      const { data: firmada } = await admin.storage
        .from(bucketDe(d.document_type))
        .createSignedUrl(d.file_path, 3600);
      return {
        ...d,
        etiqueta: ETIQUETA_DOCUMENTO[d.document_type] ?? d.document_type,
        url: firmada?.signedUrl ?? null,
      };
    }),
  );
}

/**
 * Guarda un documento de la solicitud: lo sube al bucket que le toca y deja su
 * renglón en `documents`, en estado pendiente.
 *
 * Recibe un data URL porque el alta pública comprime el archivo en el navegador
 * y lo manda dentro de la Server Action — a diferencia de los adjuntos de una
 * conversación, aquí la sesión puede estar naciendo en esta misma llamada y no
 * hay carpeta a la que subir desde el navegador.
 *
 * Nunca lanza: un fallo al guardar un papel no debe tumbar el alta completa. Se
 * devuelve `null` y quien llama decide (el alta avisa al equipo y sigue).
 */
const FORMATOS = /^data:(image\/(jpeg|jpg|png|webp)|application\/pdf);base64,/;
const PESO_MAX = 8 * 1024 * 1024;

export function esDocumentoValido(dataUrl: string | null | undefined): boolean {
  return Boolean(dataUrl && FORMATOS.test(dataUrl));
}

export async function guardarDocumentoDeSolicitud(input: {
  userId: string;
  tipo: TipoDocumentoSolicitud;
  dataUrl: string;
  ambassadorId?: string;
  centerId?: string;
}): Promise<string | null> {
  if (!esDocumentoValido(input.dataUrl)) return null;
  const [cabecera, base64] = input.dataUrl.split(",", 2);
  if (!base64) return null;
  const mime = cabecera.slice(5, cabecera.indexOf(";"));
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > PESO_MAX) return null;

  const extension = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const ruta = `${input.userId}/${input.tipo}-${Date.now()}.${extension}`;
  const admin = createAdminClient();

  const { error } = await admin.storage
    .from(bucketDe(input.tipo))
    .upload(ruta, bytes, { contentType: mime, upsert: false });
  if (error) {
    console.error(`documento ${input.tipo} no se pudo guardar`, error);
    return null;
  }

  const { error: filaError } = await admin.from("documents").insert({
    user_id: input.userId,
    ambassador_id: input.ambassadorId ?? null,
    center_id: input.centerId ?? null,
    document_type: input.tipo,
    file_path: ruta,
    file_name: ETIQUETA_DOCUMENTO[input.tipo] ?? input.tipo,
    file_size: bytes.length,
    mime_type: mime,
    status: "pendiente",
  });
  if (filaError) {
    console.error(`renglón de ${input.tipo} no se pudo guardar`, filaError);
    return null;
  }
  return ruta;
}
