/**
 * Reglas del código de embajador (documento "LINEAMIENTOS PARA CÓDIGO DE
 * EMBAJADOR", equipo 16-ago).
 *
 * El código ES lo que la persona escribe: de 3 a 8 caracteres, solo A-Z y 0-9.
 * Ya no lleva el prefijo `PATAMIGA-` (decisión del 16-ago). Los ~40 códigos
 * que se emitieron con prefijo SIGUEN VALIENDO tal cual: la búsqueda es por
 * coincidencia exacta, así que nada se rompe; la regla nueva solo aplica a lo
 * que se elige de aquí en adelante.
 *
 * Vive aparte y sin dependencias para que lo usen por igual el portal del
 * embajador, el panel del comité y cualquier validación futura.
 */

export const CODIGO_MIN = 3;
export const CODIGO_MAX = 8;

/**
 * Palabras que no puede CONTENER un código, por protección de marca: sugieren
 * que quien lo comparte es Pata Amiga, o prometen algo que no existe.
 * Se buscan como subcadena, no como palabra exacta: "SUPERGRATIS" también cae.
 */
const PALABRAS_BLOQUEADAS = [
  // Suplantación de la marca o del equipo
  "OFICIAL", "ADMIN", "SOPORTE", "STAFF", "OWNER", "CEO", "TEAM",
  "FUNDADOR", "GERENTE", "AYUDA", "DIRECTOR", "MARCA",
  // Promesas comerciales
  "DESCUENTO", "GRATIS", "FREE", "PROMO", "SALE", "CUPON", "OFERTA",
  "BONO", "REGALO", "GARANTIA", "CASH", "DINERO", "REEMBOLSO", "DEAL",
  // Producto regulado que esto NO es (regla de terminología del proyecto)
  "SEGURO",
  // Fraude
  "HACK", "FAKE", "SCAM", "FRAUDE",
  // Pruebas
  "TEST",
];

/**
 * Códigos apartados para la marca. Van completos y exactos: son los que el
 * equipo quiere poder usar en campañas, tiendas o eventos sin que alguien se
 * los gane por llegar antes.
 */
const RESERVADOS = [
  "PATAVIP", "PATASTORE", "PATAPROMO", "PATAGLOBAL", "PATAADMIN",
  "PATASTAFF", "PATAHELP", "PATATEAM", "PATAHQ", "PATAMARCA",
  "PATASHOP", "PATACLUB", "CLUBPATA", "PATAPATITA", "PATADRAPATI",
  "PATAPRINCIPAL", "PATASALE", "PATADEAL", "PATACUPON", "PATAXMAS",
  "PATASPRING", "PATA2026", "PATAEVENTO", "PATANEWYEAR", "PATACEO",
  "PATADIRECTOR", "PATAGERENTE", "PATAAYUDA", "PATAFUNDADOR",
  "PATAEMBAJADOR",
];

/**
 * Deja el texto como debe guardarse: mayúsculas, sin acentos y sin nada que no
 * sea A-Z o 0-9.
 *
 * Es la "corrección automática" que pide el documento: quien escribe
 * "Lucero Ñ-2026 ✨" ve aparecer LUCERONO2026 mientras teclea, en vez de
 * toparse con un error después. Los acentos se convierten (Á→A), no se borran,
 * para no mutilar un nombre.
 */
export function normalizarCodigo(entrada: string): string {
  return (entrada ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODIGO_MAX);
}

export type RevisionCodigo = { ok: true } | { ok: false; error: string };

/**
 * Revisa un código YA NORMALIZADO contra todas las reglas menos la de
 * duplicados, que necesita la base de datos.
 */
export function revisarCodigo(codigo: string): RevisionCodigo {
  if (codigo.length < CODIGO_MIN)
    return {
      ok: false,
      error: `Tu código necesita al menos ${CODIGO_MIN} caracteres.`,
    };
  if (codigo.length > CODIGO_MAX)
    return {
      ok: false,
      error: `Tu código no puede pasar de ${CODIGO_MAX} caracteres.`,
    };
  if (!/^[A-Z0-9]+$/.test(codigo))
    return { ok: false, error: "Usa solo letras (A-Z) y números (0-9)." };

  if (RESERVADOS.includes(codigo))
    return {
      ok: false,
      error: "Ese código está apartado por Pata Amiga. Elige otro.",
    };

  const bloqueada = PALABRAS_BLOQUEADAS.find((p) => codigo.includes(p));
  if (bloqueada)
    return {
      ok: false,
      error: `Tu código no puede incluir "${bloqueada}". Elige uno con tu nombre o tu marca.`,
    };

  return { ok: true };
}

/**
 * Alternativas para cuando el código elegido ya está tomado — como hacen las
 * redes sociales cuando el usuario existe.
 *
 * Primero prueba sufijos cortos y después números, siempre respetando el tope
 * de caracteres: si el código ya mide 8, se recorta para que quepa el sufijo
 * en lugar de devolver algo inválido.
 */
export function sugerenciasDeCodigo(codigo: string): string[] {
  const sufijos = ["MX", "01", "02", "23", "7", "PA", "99"];
  const fuera = new Set<string>();
  const salida: string[] = [];

  for (const sufijo of sufijos) {
    const base = codigo.slice(0, Math.max(CODIGO_MIN, CODIGO_MAX - sufijo.length));
    const propuesta = `${base}${sufijo}`.slice(0, CODIGO_MAX);
    if (
      propuesta !== codigo &&
      !fuera.has(propuesta) &&
      revisarCodigo(propuesta).ok
    ) {
      fuera.add(propuesta);
      salida.push(propuesta);
    }
    if (salida.length === 3) break;
  }
  return salida;
}
