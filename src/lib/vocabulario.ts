/**
 * Cómo le decimos a los animales (documento «Tono 2.0 Pág Web», equipo 16-ago).
 *
 *   peludo = perro o gato   ·   lomito = perro   ·   michi = gato
 *
 * El equipo pidió que las etiquetas cambien SEGÚN LA ESPECIE YA ELEGIDA: si
 * alguien marcó perro, el campo siguiente dice «¿Cómo se llama tu lomito?», no
 * «tu peludo». Eso significa que la palabra deja de ser una constante escrita a
 * mano en cada pantalla y pasa a ser una función de la especie — por eso vive
 * aquí y no repartida.
 *
 * Vale la pena tenerlo en un solo archivo por lo que ya pasó dos veces: el
 * equipo cambió «ficha» por «perfil» y «período» por «tiempo» de espera, y cada
 * cambio fue una cacería por todo `src/`. La próxima vez que muevan una palabra
 * de estas, es este archivo.
 *
 * OJO con lo que NO cambia: la llave sigue siendo `dog`/`cat` en la base
 * (`pets.species`). Aquí solo se decide la etiqueta que ve la persona.
 */

/** Lo que guarda `pets.species`. `null` = todavía no se elige. */
export type Especie = "dog" | "cat" | null | undefined;

type Forma = {
  /** Singular sin artículo: «lomito». */
  singular: string;
  /** Plural sin artículo: «lomitos». */
  plural: string;
  /** Artículo determinado que le toca: «el» / «la». */
  articulo: string;
  /** Posesivo de segunda persona: «tu». Mismo para los tres, pero se expone
   *  para que el llamador no tenga que saberlo. */
  posesivo: string;
};

const LOMITO: Forma = {
  singular: "lomito",
  plural: "lomitos",
  articulo: "el",
  posesivo: "tu",
};
const MICHI: Forma = {
  singular: "michi",
  plural: "michis",
  articulo: "el",
  posesivo: "tu",
};
const PELUDO: Forma = {
  singular: "peludo",
  plural: "peludos",
  articulo: "el",
  posesivo: "tu",
};

/**
 * La forma que le toca a una especie. Sin especie elegida cae en «peludo»,
 * que es justamente la palabra que cubre a los dos.
 */
export function formaDeEspecie(especie: Especie): Forma {
  if (especie === "dog") return LOMITO;
  if (especie === "cat") return MICHI;
  return PELUDO;
}

/**
 * La palabra sola: `terminoPeludo("dog")` → «lomito».
 *
 * Con `plural` devuelve «lomitos». Con `mayuscula` devuelve «Lomito», para
 * cuando abre una frase o es una etiqueta de campo.
 */
export function terminoPeludo(
  especie: Especie,
  opciones: { plural?: boolean; mayuscula?: boolean } = {},
): string {
  const forma = formaDeEspecie(especie);
  const palabra = opciones.plural ? forma.plural : forma.singular;
  return opciones.mayuscula
    ? palabra.charAt(0).toUpperCase() + palabra.slice(1)
    : palabra;
}

/** «tu lomito» / «tus michis» — lo más usado en las etiquetas del registro. */
export function tuPeludo(
  especie: Especie,
  opciones: { plural?: boolean } = {},
): string {
  const forma = formaDeEspecie(especie);
  return opciones.plural
    ? `tus ${forma.plural}`
    : `${forma.posesivo} ${forma.singular}`;
}

/**
 * Etiqueta del selector de especie: lo que se lee en los dos botones.
 *
 * Va aparte de `terminoPeludo` a propósito: aquí la palabra NO depende de lo
 * que la persona eligió —está eligiendo justo eso— y siempre va capitalizada.
 */
export const ETIQUETAS_ESPECIE = [
  { value: "dog" as const, label: "Lomito" },
  { value: "cat" as const, label: "Michi" },
];

/** «Lomito» / «Michi» para pintar la especie de un peludo ya registrado. */
export function etiquetaEspecie(especie: Especie): string {
  return terminoPeludo(especie, { mayuscula: true });
}
