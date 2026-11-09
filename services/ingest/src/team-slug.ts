/**
 * Slug canónico de equipo a partir del nombre de la fuente.
 *
 * Vive fuera de `history/` para que el pipeline de la temporada en curso y el corpus
 * histórico generen **exactamente el mismo id** (`<liga>.<slug>`). Si el algoritmo cambia,
 * cambia para ambos: el histórico dejaría de emparejar equipos y el modelo perdería la
 * temporada anterior.
 */

/** Conectores y sufijos de club que no distinguen equipos. */
const NAME_STOPWORDS = new Set([
  "and",
  "de",
  "del",
  "der",
  "des",
  "du",
  "do",
  "da",
  "dos",
  "das",
  "van",
  "von",
  "fc",
  "afc",
  "cf",
  "sc",
  "ac",
  "as",
  "ssc",
  "ss",
  "us",
  "ud",
  "cd",
  "ca",
  "rc",
  "rcd",
  "sv",
  "vfl",
  "vfb",
  "tsg",
  "spvgg",
  "fsv",
  "sk",
  "fk",
  "calcio",
  "losc",
  "acf",
  "club",
  "futbol",
  "football",
]);

const NUMERIC_TOKEN = /^\d+$/;

/** Convierte un nombre de la fuente en un slug estable. */
export function slugifyTeamName(rawName: string): string {
  const tokens = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);

  const kept = tokens.filter(
    (token) => !NAME_STOPWORDS.has(token) && !NUMERIC_TOKEN.test(token),
  );

  // Si el nombre era solo sufijos ("FC"), se conserva el original antes que quedarse vacío.
  const effective = kept.length > 0 ? kept : tokens;
  const slug = effective.join("-");
  if (!slug) {
    throw new Error(`No se pudo derivar un slug de equipo a partir de '${rawName}'.`);
  }
  return slug;
}

/** Código corto (3 letras) para equipos sin emblema registrado. */
export function teamCodeFromSlug(slug: string): string {
  const letters = slug.replace(/[^a-z0-9]/g, "");
  return (letters.slice(0, 3) || "TEA").toUpperCase();
}
