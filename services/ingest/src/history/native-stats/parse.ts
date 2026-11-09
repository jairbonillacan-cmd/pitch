/**
 * Parsers de las páginas de native-stats.org.
 *
 * Cada parser devuelve datos ya tipados y **solo** lo que la página publica: los campos
 * ausentes quedan en `null` y se registran como tales en el manifiesto. No se rellenan
 * huecos con ceros ni con medias.
 */
import {
  extractTeamRefs,
  firstDecimal,
  firstInteger,
  innerOfTag,
  matchIdsIn,
  numbersInCell,
  parseScorePair,
  parseTriple,
  rowCells,
  sliceFrom,
  tableRows,
  textOf,
  type HtmlTeamRef,
} from "./html.js";

export interface ScorePair {
  home: number;
  away: number;
}

export interface ParsedStanding {
  position: number;
  team: HtmlTeamRef;
  played: number | null;
  points: number | null;
  goalDiff: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export interface ParsedCompetitionMatch {
  matchId: number;
  status: "finished" | "scheduled";
  /** Texto original de la fecha/hora, p. ej. `2026/11/21, 16h00`. */
  kickoffText: string | null;
  home: HtmlTeamRef | null;
  away: HtmlTeamRef | null;
  score: ScorePair | null;
}

export interface ParsedSeasonOption {
  id: string;
  label: string;
  selected: boolean;
}

export interface ParsedCompetition {
  code: string;
  name: string | null;
  seasonLabel: string | null;
  seasons: ParsedSeasonOption[];
  standings: ParsedStanding[];
  matches: ParsedCompetitionMatch[];
}

/** `"2026/11/21, 16h00"` → fecha civil y hora local de la fuente. */
export function parseKickoff(text: string): { date: string | null; time: string | null } {
  const dateMatch = text.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  const timeMatch = text.match(/(\d{1,2})h(\d{2})/);
  return {
    date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null,
    time: timeMatch
      ? `${String(Number.parseInt(timeMatch[1]!, 10)).padStart(2, "0")}:${timeMatch[2]}`
      : null,
  };
}

function tablesOf(html: string): string[] {
  const tables: string[] = [];
  const pattern = /<table\b[\s\S]*?<\/table>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) tables.push(match[0]);
  return tables;
}

/** Tabla de posiciones: filas cuya primera celda es `1.`, `2.`, … */
function parseStandingsTable(tableHtml: string): ParsedStanding[] {
  const standings: ParsedStanding[] = [];
  for (const row of tableRows(tableHtml)) {
    const cells = rowCells(row);
    if (cells.length < 5) continue;
    const position = firstInteger(textOf(cells[0]!));
    if (position === null || !/^\s*\d+\.\s*$/.test(textOf(cells[0]!))) continue;
    const team = extractTeamRefs(cells[1]!)[0];
    if (!team) continue;

    const goalsText = textOf(cells[cells.length - 1]!);
    const goals = goalsText.match(/(\d+)\s*:\s*(\d+)/);
    standings.push({
      position,
      team,
      played: firstInteger(textOf(cells[2]!)),
      points: firstInteger(textOf(cells[3]!)),
      goalDiff: firstInteger(textOf(cells[4]!)),
      goalsFor: goals ? Number.parseInt(goals[1]!, 10) : null,
      goalsAgainst: goals ? Number.parseInt(goals[2]!, 10) : null,
    });
  }
  return standings;
}

/** Tabla de partidos: filas con dos referencias de equipo y un enlace `/match/<id>`. */
function parseMatchesTable(tableHtml: string): ParsedCompetitionMatch[] {
  const matches: ParsedCompetitionMatch[] = [];
  for (const row of tableRows(tableHtml)) {
    const matchId = matchIdsIn(row)[0];
    if (matchId === undefined) continue;
    const teams = extractTeamRefs(row);
    if (teams.length < 2) continue;
    const cells = rowCells(row);
    const kickoffText = textOf(cells[0] ?? "");
    // El marcador vive entre los dos equipos (`<div class="mx-2">3:1</div>`) o en la
    // celda de resultado. La fecha (`2026/11/21, 16h00`) no contiene `:` de marcador.
    const scoreMatch = textOf(row).match(/(\d{1,3})\s*:\s*(\d{1,3})/);
    const score = scoreMatch
      ? { home: Number.parseInt(scoreMatch[1]!, 10), away: Number.parseInt(scoreMatch[2]!, 10) }
      : null;
    matches.push({
      matchId,
      status: score ? "finished" : "scheduled",
      kickoffText: kickoffText || null,
      home: teams[0] ?? null,
      away: teams[1] ?? null,
      score,
    });
  }
  return matches;
}

export function parseCompetitionPage(html: string, code: string): ParsedCompetition {
  const name = html.match(/<h4 class="text-lg font-bold">\s*([^<]+?)\s*<\/h4>/)?.[1] ?? null;
  const seasonLabel = html.match(/Season\s+(\d{4}\/\d{2})/)?.[1] ?? null;

  const seasons: ParsedSeasonOption[] = [];
  const optionPattern = /<option\b([^>]*)>([^<]*)<\/option>/gi;
  let option: RegExpExecArray | null;
  while ((option = optionPattern.exec(html)) !== null) {
    const attrs = option[1] ?? "";
    const value = attrs.match(/value="([^"]*)"/)?.[1];
    if (!value) continue;
    seasons.push({
      id: value,
      label: textOf(option[2] ?? ""),
      selected: /\bselected\b/.test(attrs),
    });
  }

  let standings: ParsedStanding[] = [];
  let matches: ParsedCompetitionMatch[] = [];
  for (const table of tablesOf(html)) {
    const parsedStandings = parseStandingsTable(table);
    if (parsedStandings.length > 0) {
      standings = parsedStandings;
      continue;
    }
    const parsedMatches = parseMatchesTable(table);
    if (parsedMatches.length > 0) matches.push(...parsedMatches);
  }

  return { code, name, seasonLabel, seasons, standings, matches };
}

export interface ParsedAggregate {
  key: string;
  total: number | null;
  home: number | null;
  away: number | null;
  leagueMax: number | null;
  leagueMin: number | null;
}

export interface ParsedStreakRecord {
  nativeId: number | null;
  value: number | null;
}

export interface ParsedStreak {
  key: string;
  current: { total: number | null; home: number | null; away: number | null };
  record: { total: number | null; home: number | null; away: number | null };
  /** Récord histórico de la competición: tres poseedores (total / local / visitante). */
  leagueHistory: ParsedStreakRecord[];
}

export interface ParsedTeamOverview {
  leaguePosition: number | null;
  marketValueMillionEur: number | null;
  /** Chips de los últimos 10 partidos, p. ej. `LLWWD`. */
  last10: string | null;
  lastWin: string | null;
  lastLoss: string | null;
  lastLossOfPoints: string | null;
  lastGainOfPoints: string | null;
}

export interface ParsedTeam {
  teamId: number;
  name: string | null;
  competitionCode: string | null;
  /** Competición sobre la que la página agrega ("Showing records for SB only"). */
  scopeCode: string | null;
  crest: string | null;
  overview: ParsedTeamOverview;
  aggregates: ParsedAggregate[];
  streaks: ParsedStreak[];
}

function parseOverview(html: string): ParsedTeamOverview {
  const values = new Map<string, string>();
  const pattern = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const label = textOf(match[1] ?? "");
    if (!label) continue;
    values.set(label.toLowerCase(), match[2] ?? "");
  }

  const read = (label: string): string | null => {
    const raw = values.get(label.toLowerCase());
    if (raw === undefined) return null;
    const text = textOf(raw);
    return text.length === 0 || text === "-" ? null : text;
  };

  const positionText = read("League table position");
  const marketText = read("Est squad market value");
  const last10Html = values.get("last 10") ?? "";
  const chips = [...last10Html.matchAll(/>\s*([WDL])\s*</g)].map((chip) => chip[1]).join("");

  return {
    leaguePosition: positionText ? firstInteger(positionText) : null,
    marketValueMillionEur: marketText ? firstDecimal(marketText) : null,
    last10: chips.length > 0 ? chips : null,
    lastWin: read("Last win"),
    lastLoss: read("Last loss"),
    lastLossOfPoints: read("Last loss of points"),
    lastGainOfPoints: read("Last gain of points"),
  };
}

function parseAggregates(sectionHtml: string): ParsedAggregate[] {
  const aggregates: ParsedAggregate[] = [];
  for (const row of tableRows(sectionHtml)) {
    const cells = rowCells(row);
    if (cells.length < 4) continue;
    const key = textOf(cells[0]!);
    if (!key || key === "Category") continue;
    if (!/^[a-z][a-z0-9_]*$/i.test(key)) continue;
    const splitValues = numbersInCell(cells[2]!);
    const rangeText = textOf(cells[3]!);
    const range = rangeText.match(/(\d+)\s*\/\s*(\d+)/);
    aggregates.push({
      key,
      total: firstInteger(textOf(cells[1]!)),
      home: splitValues[0] ?? null,
      away: splitValues[1] ?? null,
      leagueMax: range ? Number.parseInt(range[1]!, 10) : null,
      leagueMin: range ? Number.parseInt(range[2]!, 10) : null,
    });
  }
  return aggregates;
}

function parseStreaks(sectionHtml: string): ParsedStreak[] {
  const streaks: ParsedStreak[] = [];
  for (const row of tableRows(sectionHtml)) {
    const cells = rowCells(row);
    if (cells.length < 4) continue;
    const key = textOf(cells[0]!);
    if (!key || key === "Category") continue;
    if (!/^[a-z][a-z0-9_]*$/i.test(key)) continue;

    const historyCell = cells[3]!;
    const leagueHistory: ParsedStreakRecord[] = [];
    const recordPattern =
      /crests\.football-data\.org\/(\d+)\.(?:png|svg)[\s\S]*?>\s*(\d+)\s*</g;
    let record: RegExpExecArray | null;
    while ((record = recordPattern.exec(historyCell)) !== null) {
      leagueHistory.push({
        nativeId: Number.parseInt(record[1]!, 10),
        value: Number.parseInt(record[2]!, 10),
      });
    }

    streaks.push({
      key,
      current: parseTriple(cells[1]!),
      record: parseTriple(cells[2]!),
      leagueHistory,
    });
  }
  return streaks;
}

export function parseTeamPage(html: string, teamId: number): ParsedTeam {
  const rawName = html.match(/<h2\b[^>]*>\s*([^<]+?)\s*<\/h2>/)?.[1];
  const name = rawName ? textOf(rawName) : null;
  const competitionCode = html.match(/<a href="\/competition\/([A-Z0-9]+)"/)?.[1] ?? null;
  const scopeCode = html.match(/Showing records for\s+([A-Z0-9]+)\s+only/)?.[1] ?? null;
  const crest = html.match(/crests\.football-data\.org\/(\d+)\.png/)?.[1] ?? null;

  const overviewSection = sliceFrom(html, 'id="overview"', ['id="aggs"', 'id="streaks"']) ?? "";
  const aggregatesSection = sliceFrom(html, 'id="aggs"', ['id="streaks"']) ?? "";
  const streaksSection = sliceFrom(html, 'id="streaks"', ['id="goal_stats"']) ?? "";

  return {
    teamId,
    name,
    competitionCode,
    scopeCode,
    crest,
    overview: parseOverview(overviewSection),
    aggregates: parseAggregates(aggregatesSection),
    streaks: parseStreaks(streaksSection),
  };
}

export interface ParsedGoalEvent {
  minute: number | null;
  team: string | null;
  scorer: string | null;
  assist: string | null;
  score: ScorePair | null;
}

export interface ParsedRawEvent {
  minute: number | null;
  team: string | null;
  text: string;
}

export interface ParsedMatch {
  matchId: number;
  competitionCode: string | null;
  kickoffText: string | null;
  date: string | null;
  time: string | null;
  home: HtmlTeamRef | null;
  away: HtmlTeamRef | null;
  score: ScorePair | null;
  halfTime: ScorePair | null;
  goals: ParsedGoalEvent[];
  bookings: ParsedRawEvent[];
  substitutions: ParsedRawEvent[];
}

function tableAfterHeading(html: string, heading: string): string | null {
  const start = html.indexOf(`>${heading}<`);
  if (start < 0) return null;
  const table = html.indexOf("<table", start);
  if (table < 0) return null;
  const end = html.indexOf("</table>", table);
  return end < 0 ? null : html.slice(table, end + "</table>".length);
}

function parseGoalTable(tableHtml: string): ParsedGoalEvent[] {
  const goals: ParsedGoalEvent[] = [];
  for (const row of tableRows(tableHtml)) {
    const cells = rowCells(row);
    if (cells.length < 5) continue;
    const minute = firstInteger(textOf(cells[0]!));
    if (minute === null) continue;
    const assist = textOf(cells[3]!);
    goals.push({
      minute,
      team: textOf(cells[1]!) || null,
      scorer: textOf(cells[2]!) || null,
      assist: assist === "-" || assist.length === 0 ? null : assist,
      score: parseScorePair(textOf(cells[4]!)),
    });
  }
  return goals;
}

function parseRawEventTable(tableHtml: string): ParsedRawEvent[] {
  const events: ParsedRawEvent[] = [];
  for (const row of tableRows(tableHtml)) {
    const cells = rowCells(row);
    if (cells.length < 2) continue;
    const texts = cells.map((cell) => textOf(cell));
    const minute = firstInteger(texts[0] ?? "");
    if (minute === null) continue;
    events.push({
      minute,
      team: texts[1] || null,
      text: texts.slice(2).filter((text) => text.length > 0).join(" · "),
    });
  }
  return events;
}

export function parseMatchPage(html: string, matchId: number): ParsedMatch {
  // El código sale del breadcrumb (`<a href="/competition/PL">`), no del menú superior:
  // el menú enlaza las nueve competiciones del sitio y siempre empieza por PL.
  const competitionCode = html.match(/<a href="\/competition\/([A-Z0-9]+)"/)?.[1] ?? null;
  const kickoffText = html.match(/<div class="status text-gray-100">\s*([^<]+?)\s*<\/div>/)?.[1] ?? null;
  const { date, time } = parseKickoff(kickoffText ?? "");

  const scoreBlock = html.match(/<div id="score"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  const scoreText = textOf(scoreBlock);
  const score = parseScorePair(scoreText);
  const halfTimeMatch = scoreText.match(/\((\d{1,3})\s*:\s*(\d{1,3})\)/);
  const halfTime = halfTimeMatch
    ? { home: Number.parseInt(halfTimeMatch[1]!, 10), away: Number.parseInt(halfTimeMatch[2]!, 10) }
    : null;

  // Los dos equipos del encabezado: el local aparece antes del marcador y el visitante
  // después, así que se buscan en toda la cabecera (hasta la tabla de goles), no solo en
  // el bloque previo a `#score`.
  const headerEnd = html.indexOf(">Goals<");
  const header = headerEnd > 0 ? html.slice(0, headerEnd) : html;
  const teams = extractTeamRefs(header);

  const goalsTable = tableAfterHeading(html, "Goals");
  const bookingsTable = tableAfterHeading(html, "Bookings");
  const substitutionsTable = tableAfterHeading(html, "Substitutions");

  return {
    matchId,
    competitionCode,
    kickoffText,
    date,
    time,
    home: teams[0] ?? null,
    away: teams[1] ?? null,
    score,
    halfTime,
    goals: goalsTable ? parseGoalTable(goalsTable) : [],
    bookings: bookingsTable ? parseRawEventTable(bookingsTable) : [],
    substitutions: substitutionsTable ? parseRawEventTable(substitutionsTable) : [],
  };
}

export interface ParsedFormMetrics {
  avgPoints: { home: number | null; away: number | null };
  avgGoals: { home: number | null; away: number | null };
  combinedGoals: number | null;
  avgScoredGoals: { home: number | null; away: number | null };
  combinedScoredGoals: number | null;
  avgConcededGoals: { home: number | null; away: number | null };
  /** Percentil combinado de goles en el primer tiempo (`cFHG`). */
  combinedFirstHalfGoalsPercentile: number | null;
  /** Percentil combinado de goles en el segundo tiempo (`cSHG`). */
  combinedSecondHalfGoalsPercentile: number | null;
  bothTeamsScored: { home: number | null; away: number | null };
  failedToScore: { home: number | null; away: number | null };
  over15: { home: number | null; away: number | null };
  over25: { home: number | null; away: number | null };
  over35: { home: number | null; away: number | null };
}

export interface ParsedFormRow {
  competitionCode: string;
  matchId: number | null;
  status: "finished" | "scheduled";
  kickoffText: string | null;
  date: string | null;
  time: string | null;
  home: HtmlTeamRef | null;
  away: HtmlTeamRef | null;
  score: ScorePair | null;
  odds: { home: number | null; draw: number | null; away: number | null } | null;
  metrics: ParsedFormMetrics;
}

/**
 * Cabeceras de la tabla de forma, en orden de columna.
 *
 * Se leen del `thead` que precede a `<tbody id="match-list">`: la última fila de esa
 * cabecera trae `<abbr title="…">clave</abbr>` por columna, y así el mapa de columnas
 * sobrevive a que la fuente agregue o quite métricas.
 */
function formHeaderKeys(html: string): string[] {
  const bodyStart = html.indexOf('id="match-list"');
  const header = bodyStart < 0 ? html : html.slice(0, bodyStart);
  const headerRows = tableRows(header);
  const last = headerRows[headerRows.length - 1] ?? "";
  return rowCells(last).map((cell) => {
    const abbreviation = innerOfTag(cell, "abbr");
    const key = textOf(abbreviation ?? cell);
    return key.replace(/\s*▿\s*$/, "");
  });
}

function pairOf(cellHtml: string | undefined): { home: number | null; away: number | null } {
  if (cellHtml === undefined) return { home: null, away: null };
  const values = numbersInCell(cellHtml);
  return { home: values[0] ?? null, away: values[1] ?? null };
}

function single(cellHtml: string | undefined): number | null {
  if (cellHtml === undefined) return null;
  return numbersInCell(cellHtml)[0] ?? null;
}

export interface ParsedFormPage {
  /** Fecha que la página está mostrando (`2026-11-09`), leída del selector de fecha. */
  pageDate: string | null;
  rows: ParsedFormRow[];
}

export function parseFormPage(html: string): ParsedFormPage {
  const pageDate =
    html.match(/id="pick_date"[^>]*value="(\d{4}-\d{2}-\d{2})"/)?.[1] ?? null;
  const bodyStart = html.indexOf('id="match-list"');
  if (bodyStart < 0) return { pageDate, rows: [] };
  const body = html.slice(bodyStart);
  const keys = formHeaderKeys(html);
  const rows: ParsedFormRow[] = [];

  for (const row of tableRows(body)) {
    const cells = rowCells(row);
    if (cells.length < 5) continue;
    const competitionCode = cells[0]!.match(/\/competition\/([A-Z0-9]+)/)?.[1];
    if (!competitionCode) continue;
    const teams = extractTeamRefs(cells[0]!);
    const matchId = matchIdsIn(cells[1]!)[0] ?? matchIdsIn(row)[0] ?? null;

    // La columna 1 trae el marcador si el partido ya se jugó; si no, la fecha/hora.
    const statusCell = textOf(cells[1]!);
    const score = /^\d{1,3}\s*:\s*\d{1,3}$/.test(statusCell) ? parseScorePair(statusCell) : null;
    const { date, time } = parseKickoff(statusCell);

    // Las métricas son un bloque contiguo al final de la fila; si una fila trae una celda
    // menos (por ejemplo sin cuota), alinear por la derecha evita correr todas las columnas.
    const metricStart = Math.max(0, keys.findIndex((key) => key === "avgP"));
    const metricKeys = keys.slice(metricStart);
    const offset = Math.max(0, cells.length - metricKeys.length);
    const byKey = new Map<string, string>();
    metricKeys.forEach((key, index) => {
      const cell = cells[offset + index];
      if (cell !== undefined) byKey.set(key, cell);
    });

    const oddsValues = numbersInCell(cells[3] ?? "");
    rows.push({
      competitionCode,
      matchId,
      status: score ? "finished" : "scheduled",
      kickoffText: statusCell || null,
      date,
      time,
      home: teams[0] ?? null,
      away: teams[1] ?? null,
      score,
      odds:
        oddsValues.length >= 3
          ? { home: oddsValues[0]!, draw: oddsValues[1]!, away: oddsValues[2]! }
          : null,
      metrics: {
        avgPoints: pairOf(byKey.get("avgP")),
        avgGoals: pairOf(byKey.get("avgG")),
        combinedGoals: single(byKey.get("cG")),
        avgScoredGoals: pairOf(byKey.get("avgSG")),
        combinedScoredGoals: single(byKey.get("cSG")),
        avgConcededGoals: pairOf(byKey.get("avgCG")),
        combinedFirstHalfGoalsPercentile: single(byKey.get("cFHG")),
        combinedSecondHalfGoalsPercentile: single(byKey.get("cSHG")),
        bothTeamsScored: pairOf(byKey.get("BTS")),
        failedToScore: pairOf(byKey.get("FTS")),
        over15: pairOf(byKey.get("c>1,5")),
        over25: pairOf(byKey.get("c>2,5")),
        over35: pairOf(byKey.get("c>3,5")),
      },
    });
  }

  return { pageDate, rows };
}

export interface ParsedLeaderboardEntry {
  rank: number | null;
  team: HtmlTeamRef | null;
  days: number | null;
  matches: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface ParsedLeaderboard {
  entries: ParsedLeaderboardEntry[];
}

/**
 * Ranking histórico de rachas.
 *
 * La página es **un** tablero global (las mejores rachas de todas las competiciones que
 * cubre el sitio), no una tabla por competición: los escudos de `/competition/…` que
 * aparecen arriba son el filtro de la interfaz, no la competición de cada fila. Por eso no
 * se etiqueta ninguna fila con una liga que la página no declara.
 */
export function parseAlltimeStreaksPage(html: string): ParsedLeaderboard[] {
  const table = html.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];

  const entries: ParsedLeaderboardEntry[] = [];
  for (const row of tableRows(table)) {
    const cells = rowCells(row);
    if (cells.length < 1) continue;
    const rank = firstInteger(textOf(cells[0]!));
    const team = extractTeamRefs(cells[0]!)[0] ?? null;
    if (!team) continue;

    // Escritorio: días, partidos y periodo en celdas; móvil: lista de definiciones.
    const desktop = cells.slice(1).map((cell) => textOf(cell));
    const mobilePeriod = textOf(cells[0]!).match(
      /(\d{4})[-/](\d{2})[-/](\d{2})\s*-\s*(\d{4})[-/](\d{2})[-/](\d{2})/,
    );
    const periodText =
      desktop.find((text) => /\d{4}[-/]\d{2}[-/]\d{2}\s*-\s*\d{4}[-/]\d{2}[-/]\d{2}/.test(text)) ??
      (mobilePeriod ? mobilePeriod[0] : null);
    const days = desktop[0] ? firstInteger(desktop[0]) : null;
    const matches = desktop[1] ? firstInteger(desktop[1]) : null;

    const period = periodText?.match(
      /(\d{4})[-/](\d{2})[-/](\d{2})\s*-\s*(\d{4})[-/](\d{2})[-/](\d{2})/,
    );
    entries.push({
      rank,
      team,
      days: days ?? null,
      matches: matches ?? null,
      periodStart: period ? `${period[1]}-${period[2]}-${period[3]}` : null,
      periodEnd: period ? `${period[4]}-${period[5]}-${period[6]}` : null,
    });
  }

  return entries.length > 0 ? [{ entries }] : [];
}
