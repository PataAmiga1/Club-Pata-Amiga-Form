/**
 * Normalización de identidades del CRM.
 *
 * Todo valor que entra a `contact_identities` pasa por aquí ANTES de guardarse.
 * El `unique (kind, value)` de la tabla solo sirve si el valor está normalizado:
 * `Juan@Gmail.com ` y `juan@gmail.com` tienen que ser la misma llave, y
 * `55 3050 5766` tiene que ser el mismo teléfono que `+525530505766`.
 */

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  // Validación deliberadamente laxa: la usan importaciones de CSV y webhooks,
  // y es mejor guardar un correo raro pero real que descartarlo.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/**
 * Teléfono a E.164 con lada de México cuando vienen 10 dígitos.
 * Devuelve null si no alcanza para ser un teléfono.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;

  // 10 dígitos → número nacional mexicano
  if (digits.length === 10) return `+52${digits}`;
  // 52 + 10 dígitos
  if (digits.length === 12 && digits.startsWith("52")) return `+${digits}`;
  // 521 + 10 dígitos: formato viejo de móvil mexicano (el 1 ya no se usa)
  if (digits.length === 13 && digits.startsWith("521"))
    return `+52${digits.slice(3)}`;
  // 1 + 10 dígitos → Norteamérica (EE. UU. / Canadá)
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Cualquier otro largo: se respeta tal cual, ya en formato internacional
  if (digits.length > 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Id de canal (Instagram, Messenger, WhatsApp): se respeta, solo se limpia. */
export function normalizeChannelId(value: string | null | undefined): string | null {
  if (!value) return null;
  const id = value.trim();
  return id.length > 0 ? id : null;
}

/** Nombre para mostrar: recorta espacios y quita dobles. */
export function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length > 0 ? name : null;
}

/**
 * Parte un nombre completo en nombre y apellido. Los canales de Meta entregan
 * "Avner Resendiz" en un solo campo; el CRM los guarda separados porque así los
 * ve el equipo en el perfil.
 */
export function splitFullName(full: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const name = normalizeName(full);
  if (!name) return { firstName: null, lastName: null };
  const parts = name.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/** Para comparar nombres sin acentos ni mayúsculas (posibles duplicados). */
export function nameKey(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return `${firstName ?? ""} ${lastName ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
