/**
 * CLABE interbancaria (18 dígitos): validación con dígito de control y
 * detección de banco por los primeros 3 dígitos (catálogo ABM/Banxico,
 * bancos más comunes). Se usa para reintegros y comisiones de embajador.
 */

/** Código ABM (3 dígitos iniciales de la CLABE) → nombre del banco. */
export const BANK_CODES: Record<string, string> = {
  "002": "Citibanamex",
  "012": "BBVA",
  "014": "Santander",
  "019": "Banjercito",
  "021": "HSBC",
  "030": "Bajío",
  "036": "Inbursa",
  "042": "Mifel",
  "044": "Scotiabank",
  "058": "Banregio",
  "059": "Invex",
  "060": "Bansí",
  "062": "Afirme",
  "072": "Banorte",
  "106": "Bank of America",
  "127": "Banco Azteca",
  "128": "Autofin",
  "129": "Barclays",
  "137": "BanCoppel",
  "141": "Consubanco",
  "143": "CIBanco",
  "145": "BBase",
  "166": "Banco del Bienestar",
  "638": "Nu México",
  "646": "STP",
  "652": "Solución Asea",
  "659": "ASP Integra",
  "661": "Alternativos",
  "670": "Libertad",
  "677": "Caja Pop Mexica",
  "684": "Operadora de pagos (Transfer)",
  "685": "Fondo (FIRA)",
  "686": "Invercap",
  "689": "Fomped",
  "699": "Fondeadora",
  "703": "Tesored",
  "706": "Arcus",
  "710": "NVIO",
  "722": "Mercado Pago",
  "723": "Cuenca",
  "728": "Spin by OXXO",
  "846": "STP (cuentas)",
  "902": "Indeval",
  "903": "CoDi Valida",
};

/**
 * Última opción de la lista: al elegirla se abre un campo para ESCRIBIR el
 * banco (equipo, 13-ago). Antes se guardaba la palabra "Otro" tal cual y el
 * layout bancario salía sin saber a qué institución iba el dinero.
 */
export const BANCO_OTRO = "Otro";

/** Lista para dropdowns (como el paso bancario del sistema anterior). */
export const BANK_OPTIONS = [
  "BBVA",
  "Santander",
  "Banorte",
  "HSBC",
  "Citibanamex",
  "Scotiabank",
  "Inbursa",
  "Banco Azteca",
  "BanCoppel",
  "Banregio",
  "Nu México",
  "Hey Banco",
  "Mercado Pago",
  "Spin by OXXO",
  BANCO_OTRO,
] as const;

/**
 * Valida el dígito de control de una CLABE (algoritmo oficial: pesos
 * 3,7,1 sobre los primeros 17 dígitos, módulo 10).
 */
export function isValidClabe(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false;
  const weights = [3, 7, 1];
  const sum = clabe
    .slice(0, 17)
    .split("")
    .reduce((acc, d, i) => acc + ((Number(d) * weights[i % 3]) % 10), 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(clabe[17]);
}

/** Banco detectado a partir de la CLABE, o null si el código no está en catálogo. */
export function bankFromClabe(clabe: string): string | null {
  if (!/^\d{3,}/.test(clabe)) return null;
  return BANK_CODES[clabe.slice(0, 3)] ?? null;
}

/** Escapa un valor para el CSV del layout bancario. */
export function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
