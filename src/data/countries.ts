/**
 * Catálogo de países: código ISO 3166-1 alfa-2 + lada telefónica (E.164).
 *
 * Lo piden dos campos del 13-ago: la NACIONALIDAD del perfil (antes texto
 * libre, así que llegaban cosas como "Chil") y la LADA del teléfono (antes
 * +52 fijo, así que un extranjero no podía capturar el suyo).
 *
 * El NOMBRE en español va ESCRITO AQUÍ, no calculado con `Intl.DisplayNames`.
 * Se intentó lo segundo y rompió la hidratación: el ICU de Node y el de Chrome
 * no escriben igual algunos países (Node dice "RAE de Hong Kong (China)" donde
 * Chrome dice "Hong Kong"), la lista quedaba ordenada distinto en el servidor
 * y en el navegador, y React tiraba "Hydration failed" en cada pantalla con
 * teléfono (visto en el navegador, 13-ago). Un catálogo fijo da siempre el
 * mismo HTML de los dos lados.
 *
 * La BANDERA sí sale de las dos letras del ISO. México va primero en las
 * listas: es el país de casi todos los miembros.
 */

/** [ISO 3166-1 alfa-2, lada E.164 sin el "+", nombre en español] */
export const COUNTRY_DIAL_CODES: readonly (readonly [string, string, string])[] = [
  ["MX", "52", "México"],
  ["AD", "376", "Andorra"], ["AE", "971", "Emiratos Árabes Unidos"], ["AF", "93", "Afganistán"], ["AG", "1268", "Antigua y Barbuda"], ["AI", "1264", "Anguila"],
  ["AL", "355", "Albania"], ["AM", "374", "Armenia"], ["AO", "244", "Angola"], ["AR", "54", "Argentina"], ["AS", "1684", "Samoa Americana"],
  ["AT", "43", "Austria"], ["AU", "61", "Australia"], ["AW", "297", "Aruba"], ["AZ", "994", "Azerbaiyán"], ["BA", "387", "Bosnia y Herzegovina"],
  ["BB", "1246", "Barbados"], ["BD", "880", "Bangladés"], ["BE", "32", "Bélgica"], ["BF", "226", "Burkina Faso"], ["BG", "359", "Bulgaria"],
  ["BH", "973", "Baréin"], ["BI", "257", "Burundi"], ["BJ", "229", "Benín"], ["BM", "1441", "Bermudas"], ["BN", "673", "Brunéi"],
  ["BO", "591", "Bolivia"], ["BR", "55", "Brasil"], ["BS", "1242", "Bahamas"], ["BT", "975", "Bután"], ["BW", "267", "Botsuana"],
  ["BY", "375", "Bielorrusia"], ["BZ", "501", "Belice"], ["CA", "1", "Canadá"], ["CD", "243", "República Democrática del Congo"], ["CF", "236", "República Centroafricana"],
  ["CG", "242", "Congo"], ["CH", "41", "Suiza"], ["CI", "225", "Costa de Marfil"], ["CK", "682", "Islas Cook"], ["CL", "56", "Chile"],
  ["CM", "237", "Camerún"], ["CN", "86", "China"], ["CO", "57", "Colombia"], ["CR", "506", "Costa Rica"], ["CU", "53", "Cuba"],
  ["CV", "238", "Cabo Verde"], ["CW", "599", "Curazao"], ["CY", "357", "Chipre"], ["CZ", "420", "Chequia"], ["DE", "49", "Alemania"],
  ["DJ", "253", "Yibuti"], ["DK", "45", "Dinamarca"], ["DM", "1767", "Dominica"], ["DO", "1809", "República Dominicana"], ["DZ", "213", "Argelia"],
  ["EC", "593", "Ecuador"], ["EE", "372", "Estonia"], ["EG", "20", "Egipto"], ["ER", "291", "Eritrea"], ["ES", "34", "España"],
  ["ET", "251", "Etiopía"], ["FI", "358", "Finlandia"], ["FJ", "679", "Fiyi"], ["FM", "691", "Micronesia"], ["FO", "298", "Islas Feroe"],
  ["FR", "33", "Francia"], ["GA", "241", "Gabón"], ["GB", "44", "Reino Unido"], ["GD", "1473", "Granada"], ["GE", "995", "Georgia"],
  ["GH", "233", "Ghana"], ["GI", "350", "Gibraltar"], ["GL", "299", "Groenlandia"], ["GM", "220", "Gambia"], ["GN", "224", "Guinea"],
  ["GQ", "240", "Guinea Ecuatorial"], ["GR", "30", "Grecia"], ["GT", "502", "Guatemala"], ["GU", "1671", "Guam"], ["GW", "245", "Guinea-Bisáu"],
  ["GY", "592", "Guyana"], ["HK", "852", "Hong Kong"], ["HN", "504", "Honduras"], ["HR", "385", "Croacia"], ["HT", "509", "Haití"],
  ["HU", "36", "Hungría"], ["ID", "62", "Indonesia"], ["IE", "353", "Irlanda"], ["IL", "972", "Israel"], ["IN", "91", "India"],
  ["IQ", "964", "Irak"], ["IR", "98", "Irán"], ["IS", "354", "Islandia"], ["IT", "39", "Italia"], ["JM", "1876", "Jamaica"],
  ["JO", "962", "Jordania"], ["JP", "81", "Japón"], ["KE", "254", "Kenia"], ["KG", "996", "Kirguistán"], ["KH", "855", "Camboya"],
  ["KI", "686", "Kiribati"], ["KM", "269", "Comoras"], ["KN", "1869", "San Cristóbal y Nieves"], ["KP", "850", "Corea del Norte"], ["KR", "82", "Corea del Sur"],
  ["KW", "965", "Kuwait"], ["KY", "1345", "Islas Caimán"], ["KZ", "7", "Kazajistán"], ["LA", "856", "Laos"], ["LB", "961", "Líbano"],
  ["LC", "1758", "Santa Lucía"], ["LI", "423", "Liechtenstein"], ["LK", "94", "Sri Lanka"], ["LR", "231", "Liberia"], ["LS", "266", "Lesoto"],
  ["LT", "370", "Lituania"], ["LU", "352", "Luxemburgo"], ["LV", "371", "Letonia"], ["LY", "218", "Libia"], ["MA", "212", "Marruecos"],
  ["MC", "377", "Mónaco"], ["MD", "373", "Moldavia"], ["ME", "382", "Montenegro"], ["MG", "261", "Madagascar"], ["MH", "692", "Islas Marshall"],
  ["MK", "389", "Macedonia del Norte"], ["ML", "223", "Mali"], ["MM", "95", "Myanmar (Birmania)"], ["MN", "976", "Mongolia"], ["MO", "853", "Macao"],
  ["MP", "1670", "Islas Marianas del Norte"], ["MR", "222", "Mauritania"], ["MT", "356", "Malta"], ["MU", "230", "Mauricio"], ["MV", "960", "Maldivas"],
  ["MW", "265", "Malaui"], ["MY", "60", "Malasia"], ["MZ", "258", "Mozambique"], ["NA", "264", "Namibia"], ["NC", "687", "Nueva Caledonia"],
  ["NE", "227", "Níger"], ["NG", "234", "Nigeria"], ["NI", "505", "Nicaragua"], ["NL", "31", "Países Bajos"], ["NO", "47", "Noruega"],
  ["NP", "977", "Nepal"], ["NR", "674", "Nauru"], ["NZ", "64", "Nueva Zelanda"], ["OM", "968", "Omán"], ["PA", "507", "Panamá"],
  ["PE", "51", "Perú"], ["PF", "689", "Polinesia Francesa"], ["PG", "675", "Papúa Nueva Guinea"], ["PH", "63", "Filipinas"], ["PK", "92", "Pakistán"],
  ["PL", "48", "Polonia"], ["PR", "1787", "Puerto Rico"], ["PS", "970", "Palestina"], ["PT", "351", "Portugal"], ["PW", "680", "Palaos"],
  ["PY", "595", "Paraguay"], ["QA", "974", "Catar"], ["RO", "40", "Rumanía"], ["RS", "381", "Serbia"], ["RU", "7", "Rusia"],
  ["RW", "250", "Ruanda"], ["SA", "966", "Arabia Saudí"], ["SB", "677", "Islas Salomón"], ["SC", "248", "Seychelles"], ["SD", "249", "Sudán"],
  ["SE", "46", "Suecia"], ["SG", "65", "Singapur"], ["SI", "386", "Eslovenia"], ["SK", "421", "Eslovaquia"], ["SL", "232", "Sierra Leona"],
  ["SM", "378", "San Marino"], ["SN", "221", "Senegal"], ["SO", "252", "Somalia"], ["SR", "597", "Surinam"], ["SS", "211", "Sudán del Sur"],
  ["ST", "239", "Santo Tomé y Príncipe"], ["SV", "503", "El Salvador"], ["SY", "963", "Siria"], ["SZ", "268", "Esuatini"], ["TC", "1649", "Islas Turcas y Caicos"],
  ["TD", "235", "Chad"], ["TG", "228", "Togo"], ["TH", "66", "Tailandia"], ["TJ", "992", "Tayikistán"], ["TL", "670", "Timor-Leste"],
  ["TM", "993", "Turkmenistán"], ["TN", "216", "Túnez"], ["TO", "676", "Tonga"], ["TR", "90", "Turquía"], ["TT", "1868", "Trinidad y Tobago"],
  ["TV", "688", "Tuvalu"], ["TW", "886", "Taiwán"], ["TZ", "255", "Tanzania"], ["UA", "380", "Ucrania"], ["UG", "256", "Uganda"],
  ["US", "1", "Estados Unidos"], ["UY", "598", "Uruguay"], ["UZ", "998", "Uzbekistán"], ["VA", "39", "Ciudad del Vaticano"], ["VC", "1784", "San Vicente y las Granadinas"],
  ["VE", "58", "Venezuela"], ["VG", "1284", "Islas Vírgenes Británicas"], ["VI", "1340", "Islas Vírgenes de EE. UU."], ["VN", "84", "Vietnam"], ["VU", "678", "Vanuatu"],
  ["WS", "685", "Samoa"], ["YE", "967", "Yemen"], ["ZA", "27", "Sudáfrica"], ["ZM", "260", "Zambia"], ["ZW", "263", "Zimbabue"],
] as const;

/** Bandera a partir del ISO: las dos letras como indicadores regionales. */
export function banderaDe(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/[A-Z]/g, (c) =>
      String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65),
    );
}

/** Nombre en español del catálogo. Devuelve el ISO si no está. */
export function nombreDePais(iso: string): string {
  const code = iso.toUpperCase();
  return COUNTRY_DIAL_CODES.find(([c]) => c === code)?.[2] ?? code;
}

export type Pais = { iso: string; lada: string; nombre: string; bandera: string };

/**
 * Países listos para pintar: México primero y el resto alfabético en español.
 *
 * El orden se resuelve con una comparación de cadenas sin acentos, NO con
 * `localeCompare("es")`: la tabla de intercalación también viene del ICU del
 * entorno y, como con los nombres, servidor y navegador podrían no coincidir.
 * Se calcula una sola vez por proceso.
 */
const sinAcentos = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

let cache: Pais[] | null = null;
export function paises(): Pais[] {
  if (cache) return cache;
  const lista = COUNTRY_DIAL_CODES.map(([iso, lada, nombre]) => ({
    iso,
    lada,
    nombre,
    bandera: banderaDe(iso),
  }));
  const mexico = lista.filter((p) => p.iso === "MX");
  const resto = lista
    .filter((p) => p.iso !== "MX")
    .sort((a, b) => (sinAcentos(a.nombre) < sinAcentos(b.nombre) ? -1 : 1));
  cache = [...mexico, ...resto];
  return cache;
}

/** Lada de un país (sin "+"). "52" si el ISO no está en el catálogo. */
export function ladaDe(iso: string): string {
  return COUNTRY_DIAL_CODES.find(([code]) => code === iso)?.[1] ?? "52";
}
