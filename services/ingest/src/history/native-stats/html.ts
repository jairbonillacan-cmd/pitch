/**
 * Utilidades mínimas de HTML para leer native-stats.org.
 *
 * La fuente es una app Phoenix LiveView: el HTML inicial llega renderizado en el
 * servidor, así que se puede leer sin ejecutar JavaScript. No se usa un parser de DOM
 * completo a propósito — el proyecto no agrega dependencias por un scraper de
 * investigación y las tablas tienen una forma estable que aquí se documenta.
 *
 * Regla: estas funciones nunca "adivinan" datos. Si un valor no aparece, devuelven `null`.
 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  euro: "€",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  laquo: "«",
  raquo: "»",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
  ccedil: "ç",
};

/** Decodifica entidades HTML con y sin punto y coma (`&#39;`, `&#x1f499;`, `&amp;`). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);?/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Elimina etiquetas respetando comillas dentro de los atributos.
 *
 * Hace falta de verdad: en la cabecera de forma el `title` de un `<abbr>` contiene `>`
 * (`title="combined percentile matches > 1.5 goals"`), y un `[^>]*` ingenuo corta la
 * etiqueta a la mitad y deja basura en el texto.
 */
export function stripTags(html: string): string {
  let out = "";
  let index = 0;
  while (index < html.length) {
    if (html[index] !== "<") {
      out += html[index];
      index += 1;
      continue;
    }
    let cursor = index + 1;
    let quote: string | null = null;
    while (cursor < html.length) {
      const character = html[cursor]!;
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
      cursor += 1;
    }
    out += " ";
    index = cursor + 1;
  }
  return out;
}

/** Texto plano de un fragmento HTML, con espacios colapsados. */
export function textOf(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  // Doble decodificación a propósito: LiveView vuelve a escapar el texto dentro de los
  // atributos `phx-*`, así que un `&` llega como `&amp;amp;` al HTML servido.
  const text = decodeEntities(decodeEntities(stripTags(withoutScripts)));
  return text.replace(/[\s\u00a0]+/g, " ").trim();
}

/** Contenido de la primera etiqueta con ese nombre, con apertura tolerante a `>` en atributos. */
export function innerOfTag(html: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}\\b(?:"[^"]*"|'[^']*'|[^>"'])*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return html.match(pattern)?.[1] ?? null;
}

/**
 * Recorta desde la primera aparición de `startMarker` hasta el primer `endMarker`
 * posterior. Si no hay marcador final, llega al final del documento.
 */
export function sliceFrom(
  html: string,
  startMarker: string,
  endMarkers: readonly string[] = [],
): string | null {
  const start = html.indexOf(startMarker);
  if (start < 0) return null;
  let end = html.length;
  for (const marker of endMarkers) {
    const index = html.indexOf(marker, start + startMarker.length);
    if (index >= 0 && index < end) end = index;
  }
  return html.slice(start, end);
}

/** Bloques `<tr>…</tr>` de un fragmento, en orden de aparición. */
export function tableRows(html: string): string[] {
  const rows: string[] = [];
  const pattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    rows.push(match[1] ?? "");
  }
  return rows;
}

/** Celdas `<td>`/`<th>` de una fila, en orden. */
export function rowCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const pattern = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rowHtml)) !== null) {
    cells.push(match[2] ?? "");
  }
  return cells;
}

/** Extrae el primer entero de un texto (`"10"`, `"#3"`, `"n/a"` → `null`). */
export function firstInteger(text: string): number | null {
  const match = text.match(/-?\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

/**
 * Extrae el primer decimal de un texto, admitiendo coma decimal y separador de miles
 * con espacio o coma (`"1 240.5 Mio. €"` → `1240.5`).
 */
export function firstDecimal(text: string): number | null {
  const match = text.match(/-?\d{1,3}(?:[ .]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const normalized = match[0].replace(/[ ](?=\d{3}\b)/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Todos los números de una celda, en orden. `"0.60 0.40"` → `[0.6, 0.4]`.
 * Los `%` se conservan como número (40) y se documentan por columna, no se convierten.
 */
export function numbersInCell(cellHtml: string): number[] {
  const text = textOf(cellHtml);
  const values: number[] = [];
  const pattern = /-?\d+(?:[.,]\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value = Number.parseFloat(match[0].replace(",", "."));
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

/** Los tres números de una celda `total / local / visitante`. */
export function parseTriple(cellHtml: string): {
  total: number | null;
  home: number | null;
  away: number | null;
} {
  const values = numbersInCell(cellHtml);
  return {
    total: values[0] ?? null,
    home: values[1] ?? null,
    away: values[2] ?? null,
  };
}

/** `"3:0"` / `"0:2"` → marcador. Devuelve `null` si la celda no es un marcador. */
export function parseScorePair(text: string): { home: number; away: number } | null {
  const match = text.match(/(\d{1,3})\s*:\s*(\d{1,3})/);
  if (!match) return null;
  return { home: Number.parseInt(match[1]!, 10), away: Number.parseInt(match[2]!, 10) };
}

/**
 * Los encabezados de partido agregan la posición de la tabla entre paréntesis
 * (`"VfB Stuttgart (12)"`). Se descarta ese sufijo para que el nombre sea el del equipo.
 */
export function cleanTeamName(text: string): string {
  return text.replace(/\s*\(\d+\)\s*$/, "").trim();
}

export interface HtmlTeamRef {
  /** Identificador de equipo de football-data.org que usa native-stats. */
  teamId: number;
  /** Nombre completo tal como lo publica la fuente. */
  name: string;
  /** Código corto de tres letras. */
  code: string;
  /** Ruta del emblema, útil para trazabilidad del emparejamiento. */
  crest: string | null;
}

const CREST_PATTERN = /crests\.football-data\.org\/([A-Za-z0-9._-]+)\.(?:png|svg)/i;

/**
 * Referencias de equipo contenidas en un fragmento, en orden de aparición.
 *
 * Cada bloque de equipo enlaza a `/team/<id>` y repite el nombre en dos `span` (uno
 * visible en escritorio con la clase `md:inline-block` y otro móvil con `md:hidden`).
 * Se toma el de escritorio y se descarta el móvil para no duplicar.
 */
export function extractTeamRefs(html: string): HtmlTeamRef[] {
  const refs: HtmlTeamRef[] = [];
  const link = /\/team\/(\d+)/g;
  let match: RegExpExecArray | null;
  let consumedUntil = -1;
  while ((match = link.exec(html)) !== null) {
    if (match.index < consumedUntil) continue;
    const start = match.index;
    const nextLink = html.indexOf("/team/", start + 1);
    const end = nextLink > start ? Math.min(nextLink, start + 2400) : Math.min(html.length, start + 2400);
    const block = html.slice(start, end);
    consumedUntil = start + match[0].length;

    const teamId = Number.parseInt(match[1]!, 10);
    let name = "";
    let code = "";

    const spanPattern = /<span\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi;
    let span: RegExpExecArray | null;
    while ((span = spanPattern.exec(block)) !== null) {
      const className = span[1] ?? "";
      const text = textOf(span[2] ?? "");
      if (!text) continue;
      const desktopName = className.includes("md:inline-block") && !className.includes("md:hidden");
      const shortCode = className.includes("sm:hidden") && !className.includes("md:inline-block");
      if (desktopName && !name) name = cleanTeamName(text);
      else if (shortCode && !code) code = cleanTeamName(text);
    }

    if (!name && !code) continue;
    refs.push({
      teamId,
      name: name || code,
      code,
      crest: CREST_PATTERN.exec(block)?.[1] ?? null,
    });
  }
  return refs;
}

/** Identificadores de partido enlazados en un fragmento, en orden. */
export function matchIdsIn(html: string): number[] {
  const ids: number[] = [];
  const pattern = /\/match\/(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const id = Number.parseInt(match[1]!, 10);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
