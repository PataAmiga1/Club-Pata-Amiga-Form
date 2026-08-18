/**
 * Documentos tipados por motivo de reintegro — etiquetas del sitio vivo
 * (solidarity-request-form.js). Cada motivo pide sus propios documentos y
 * cada archivo se guarda catalogado con su tipo.
 */

export type ReimbursementDocType =
  | "evidence_photo"
  | "prescription"
  | "receipt"
  | "senior_certificate";

export type DocSlot = {
  type: ReimbursementDocType;
  label: string;
};

export const DOCS_BY_CATEGORY: Record<string, DocSlot[]> = {
  vet_expenses: [
    { type: "evidence_photo", label: "Foto de tu peludo en la consulta" },
    { type: "prescription", label: "Informe de salud" },
    { type: "receipt", label: "Factura o recibo de pago" },
  ],
  vaccines: [
    {
      type: "evidence_photo",
      label: "Foto de tu peludo en el consultorio aplicándole la vacuna",
    },
    {
      type: "prescription",
      label: "Cartilla de vacunación con etiqueta correspondiente y firma",
    },
    { type: "receipt", label: "Factura o recibo del pago" },
  ],
  death: [
    { type: "evidence_photo", label: "Una foto hermosa de tu peludito" },
    { type: "prescription", label: "Certificado de defunción o informe médico" },
    { type: "receipt", label: "Comprobante de gastos funerarios" },
  ],
};

export const DOC_TYPE_LABELS: Record<ReimbursementDocType, string> = {
  evidence_photo: "📸 Evidencia",
  prescription: "📋 Informe / cartilla / certificado",
  receipt: "🧾 Factura / comprobante",
  senior_certificate: "🏥 Certificado senior",
};

/** Etiquetas de fecha por motivo (sitio vivo). */
export const DATE_LABEL_BY_CATEGORY: Record<string, string> = {
  vet_expenses: "¿Qué día asististe a la veterinaria?",
  vaccines: "¿Qué día le aplicaron la vacuna?",
  death: "¿En qué fecha nos dejó tu peludito?",
};

/** Etiquetas del monto solicitado por motivo (sitio vivo). */
export const AMOUNT_LABEL_BY_CATEGORY: Record<string, string> = {
  vet_expenses: "Monto que solicitas reembolsar",
  vaccines: "Monto solicitado a reembolsar por vacuna",
  death: "Monto del apoyo solicitado por fallecimiento",
};

/**
 * Aviso de seguridad del titular — texto EXACTO del sitio vivo
 * (solidarity-request-form.js).
 */
export const BANK_HOLDER_NOTICE =
  "Recuerda que el titular de la cuenta bancaria debe ser el mismo que registraste en tu membresía. Hacemos esto por tu seguridad: si los datos no coinciden, el movimiento no podrá procesarse y el depósito no se realizará, incluso si la solicitud ya fue aprobada por nuestro equipo. ¡Ayúdanos a cuidar tu cuenta!";
