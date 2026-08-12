/**
 * Validación completa de CURP — portada del sitio vivo (curp-validator.ts):
 * formato oficial + fecha + sexo + estado + dígito verificador.
 */

const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;

const FORBIDDEN_WORDS = new Set([
  "BUEI", "BUEY", "CACA", "CACO", "CAGA", "CAGO", "CAKA", "CAKO",
  "COGE", "COGI", "COJA", "COJE", "COJI", "COJO", "COLA", "CULO",
  "FALO", "FETO", "GETA", "GUEI", "GUEY", "JETA", "JOTO", "KACA",
  "KACO", "KAGA", "KAGO", "KAKA", "KAKO", "KOGE", "KOGI", "KOJA",
  "KOJE", "KOJI", "KOJO", "KOLA", "KULO", "LILO", "LOCA", "LOCO",
  "LOKA", "LOKO", "MAME", "MAMO", "MEAR", "MEAS", "MEON", "MIAR",
  "MION", "MOCO", "MOKO", "MULA", "MULO", "NACA", "NACO", "PEDA",
  "PEDO", "PENE", "PIPI", "PITO", "POPO", "PUTA", "PUTO", "QULO",
  "RATA", "ROBA", "ROBE", "ROBO", "RUIN", "SENO", "TETA", "VACA",
  "VAGA", "VAGO", "VAKA", "VUEI", "VUEY", "WUEI", "WUEY",
]);

// NE = nacido en el extranjero
const VALID_STATES = new Set([
  "AS", "BC", "BS", "CC", "CL", "CM", "CS", "CH", "DF", "DG",
  "GT", "GR", "HG", "JC", "MC", "MN", "MS", "NT", "NL", "OC",
  "PL", "QT", "QR", "SP", "SL", "SR", "TC", "TS", "TL", "VZ",
  "YN", "ZS", "NE",
]);

export function formatCurp(curp: string): string {
  return curp.toUpperCase().trim().replace(/\s/g, "");
}

function validateFormat(curp: string): boolean {
  if (curp.length !== 18) return false;
  if (!CURP_REGEX.test(curp)) return false;
  if (FORBIDDEN_WORDS.has(curp.substring(0, 4))) return false;

  const month = parseInt(curp.substring(6, 8), 10);
  const day = parseInt(curp.substring(8, 10), 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  if (!VALID_STATES.has(curp.substring(11, 13))) return false;
  return true;
}

function checkDigit(curp17: string): string {
  const dictionary = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += dictionary.indexOf(curp17.charAt(i)) * (18 - i);
  }
  return String((10 - (sum % 10)) % 10);
}

const quitarAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();

/** Nombres "de dientes para afuera" que la CURP salta (regla RENAPO). */
const NOMBRES_COMUNES = new Set(["MARIA", "MA", "MA.", "JOSE", "J", "J."]);

/**
 * Cruce CURP ↔ datos del perfil (equipo, 5-ago). SOLO MARCA, NO BLOQUEA
 * (decisión de Pablo): los nombres compuestos y las reglas de RENAPO dan
 * falsos negativos, así que las discrepancias se muestran como aviso al
 * miembro y como bandera en el admin.
 */
export function curpCoincide(
  curpRaw: string,
  datos: {
    nombres?: string | null;
    apellidoPaterno?: string | null;
    apellidoMaterno?: string | null;
    /** yyyy-mm-dd */
    birthDate?: string | null;
  },
): { coincide: boolean; discrepancias: string[] } | null {
  const curp = formatCurp(curpRaw ?? "");
  if (!validateCurp(curp).isValid) return null;

  const discrepancias: string[] = [];

  if (datos.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(datos.birthDate)) {
    const esperado =
      datos.birthDate.slice(2, 4) +
      datos.birthDate.slice(5, 7) +
      datos.birthDate.slice(8, 10);
    if (curp.slice(4, 10) !== esperado)
      discrepancias.push("la fecha de nacimiento");
  }

  const paterno = datos.apellidoPaterno
    ? quitarAcentos(datos.apellidoPaterno)
    : "";
  if (paterno) {
    const inicial = paterno.charAt(0) === "Ñ" ? "X" : paterno.charAt(0);
    if (curp.charAt(0) !== inicial)
      discrepancias.push("el apellido paterno");
  }

  const materno = datos.apellidoMaterno
    ? quitarAcentos(datos.apellidoMaterno)
    : "";
  if (materno) {
    const inicial = materno.charAt(0) === "Ñ" ? "X" : materno.charAt(0);
    if (curp.charAt(2) !== inicial)
      discrepancias.push("el apellido materno");
  }

  const nombres = datos.nombres ? quitarAcentos(datos.nombres) : "";
  if (nombres) {
    const tokens = nombres.split(/\s+/);
    // MARIA/JOSE con segundo nombre: la CURP usa el segundo (regla RENAPO)
    const efectivo =
      tokens.length > 1 && NOMBRES_COMUNES.has(tokens[0])
        ? tokens[1]
        : tokens[0];
    const inicial = efectivo.charAt(0) === "Ñ" ? "X" : efectivo.charAt(0);
    const alternativa = tokens[0]?.charAt(0);
    if (curp.charAt(3) !== inicial && curp.charAt(3) !== alternativa)
      discrepancias.push("el nombre");
  }

  return { coincide: discrepancias.length === 0, discrepancias };
}

export function validateCurp(curpRaw: string): {
  isValid: boolean;
  error?: string;
} {
  const curp = formatCurp(curpRaw ?? "");
  if (!validateFormat(curp)) {
    return {
      isValid: false,
      error:
        "El formato de la CURP no es válido. Debe tener 18 caracteres y seguir el formato oficial.",
    };
  }
  if (curp.charAt(17) !== checkDigit(curp.substring(0, 17))) {
    return {
      isValid: false,
      error:
        "El dígito verificador de la CURP no es correcto. Verifica que esté escrita correctamente.",
    };
  }
  return { isValid: true };
}
