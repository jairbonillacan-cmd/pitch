/**
 * Estadísticas de partido de Liga MX desde ESPN (sin API key ni cuota diaria).
 *
 * Flujo:
 *  1. Se listan los equipos de `soccer/mex.1` y su calendario por temporada.
 *  2. Se deduplican los eventos y se descarga el `summary` de cada partido terminado.
 *  3. Se extraen tiros, tiros a puerta, córners, posesión y tarjetas del boxscore.
 *  4. Se empareja con el corpus por equipos y fecha (±2 días) para obtener el `id` canónico.
 *
 * Licencia: ESPN no declara una licencia de reutilización para estos datos; el dataset es
 * **research-only** (igual que xG y cuotas).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ESPN_LIGA_MX_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1";
export const ESPN_LIGA_MX_SEASONS = [2024, 2023, 2022] as const;

/** ESPN display name → slug del corpus. */
export const ESPN_TEAM_SLUGS: Readonly<Record<string, string>> = {
  América: "america",
  America: "america",
  Atlas: "atlas-guadalajara",
  "Atlético de San Luis": "atletico-san-luis",
  "Atletico de San Luis": "atletico-san-luis",
  "Cruz Azul": "cruz-azul",
  "FC Juárez": "juarez",
  "FC Juarez": "juarez",
  Guadalajara: "deportivo-guadalajara",
  León: "leon",
  Leon: "leon",
  Monterrey: "monterrey",
  Necaxa: "necaxa",
  Pachuca: "pachuca",
  Puebla: "puebla",
  "Pumas UNAM": "pumas-unam",
  "Querétaro": "gallos-blancos",
  "Queretaro": "gallos-blancos",
  Santos: "santos-laguna",
  "Santos Laguna": "santos-laguna",
  "Tigres UANL": "uanl-tigres",
  Tijuana: "tijuana",
  Toluca: "deportivo-toluca",
};

export interface EspnStatsGame {
  id: string;
  date: string;
  league: "liga-mx";
  season: string;
  shotsHome: number | null;
  shotsAway: number | null;
  shotsOnTargetHome: number | null;
  shotsOnTargetAway: number | null;
  cornersHome: number | null;
  cornersAway: number | null;
  possessionHome: number | null;
  possessionAway: number | null;
  yellowHome: number | null;
  yellowAway: number | null;
  redHome: number | null;
  redAway: number | null;
  source: "espn";
}

interface EspnTeamStat {
  name?: string;
  displayValue?: string;
  value?: number;
}

interface EspnBoxTeam {
  team?: { id?: string; displayName?: string };
  statistics?: EspnTeamStat[];
}

function statNumber(team: EspnBoxTeam | undefined, name: string): number | null {
  const found = team?.statistics?.find((stat) => stat.name === name);
  if (!found) return null;
  if (typeof found.value === "number") return Number.isFinite(found.value) ? found.value : null;
  const parsed = Number((found.displayValue ?? "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Extrae estadísticas por id de equipo desde el `summary` de ESPN. */
export function parseEspnSummary(payload: unknown): Map<string, {
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  possession: number | null;
  yellow: number | null;
  red: number | null;
}> {
  const json = payload as { boxscore?: { teams?: EspnBoxTeam[] } };
  const map = new Map<string, {
    shots: number | null;
    shotsOnTarget: number | null;
    corners: number | null;
    possession: number | null;
    yellow: number | null;
    red: number | null;
  }>();
  for (const team of json.boxscore?.teams ?? []) {
    const id = team.team?.id;
    if (!id) continue;
    map.set(id, {
      shots: statNumber(team, "totalShots"),
      shotsOnTarget: statNumber(team, "shotsOnTarget"),
      corners: statNumber(team, "wonCorners"),
      possession: statNumber(team, "possessionPct"),
      yellow: statNumber(team, "yellowCards"),
      red: statNumber(team, "redCards"),
    });
  }
  return map;
}

function seasonLabel(year: number): string {
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

function dateDiff(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function fetchJsonCached(
  url: string,
  cachePath: string,
  options: { offline?: boolean; retries?: number } = {},
): Promise<unknown | null> {
  if (existsSync(cachePath)) return readJson(cachePath);
  if (options.offline) return null;
  const retries = options.retries ?? 2;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PitchLab-Research/0.1)" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf8");
      return payload;
    } catch (error) {
      if (attempt === retries) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  return null;
}

interface EspnEvent {
  id: string;
  date: string;
  season: number;
  homeName: string;
  awayName: string;
  completed: boolean;
}

function readScheduleEvents(payload: unknown): EspnEvent[] {
  const json = payload as {
    events?: Array<{
      id: string;
      date?: string;
      season?: { year?: number };
      competitions?: Array<{
        date?: string;
        status?: { type?: { completed?: boolean } };
        competitors?: Array<{ homeAway?: string; team?: { displayName?: string } }>;
      }>;
    }>;
  };
  const events: EspnEvent[] = [];
  for (const event of json.events ?? []) {
    const competition = event.competitions?.[0];
    const home = competition?.competitors?.find((team) => team.homeAway === "home")?.team?.displayName;
    const away = competition?.competitors?.find((team) => team.homeAway === "away")?.team?.displayName;
    if (!event.id || !home || !away) continue;
    events.push({
      id: event.id,
      date: (competition?.date ?? event.date ?? "").slice(0, 10),
      season: event.season?.year ?? 0,
      homeName: home,
      awayName: away,
      completed: competition?.status?.type?.completed === true,
    });
  }
  return events;
}

export interface BuildEspnOptions {
  rootDir: string;
  seasons?: readonly number[];
  offline?: boolean;
  maxSummaries?: number;
  concurrency?: number;
  log?: (message: string) => void;
}

/** Recolecta eventos, descarga summaries y escribe el dataset research. */
export async function buildEspnLigaMxStats(options: BuildEspnOptions): Promise<{
  rows: EspnStatsGame[];
  matched: number;
  total: number;
  filePath: string;
  manifestPath: string;
}> {
  const log = options.log ?? ((message: string) => console.log(message));
  const seasons = options.seasons ?? ESPN_LIGA_MX_SEASONS;
  const rawDir = join(options.rootDir, "data", "history", "raw", "espn", "liga-mx");
  const maxSummaries = options.maxSummaries ?? 400;
  const concurrency = options.concurrency ?? 4;

  const teamsPayload = (await fetchJsonCached(`${ESPN_LIGA_MX_BASE}/teams`, join(rawDir, "teams.json"), {
    ...(options.offline ? { offline: true } : {}),
  })) as { sports?: Array<{ leagues?: Array<{ teams?: Array<{ team?: { id: string; displayName: string } }> }> }> } | null;
  const teams = teamsPayload?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const mappedTeams = teams
    .map((entry) => entry.team)
    .filter((team): team is { id: string; displayName: string } => Boolean(team && ESPN_TEAM_SLUGS[team.displayName]));

  const eventsById = new Map<string, EspnEvent>();
  for (const season of seasons) {
    for (const team of mappedTeams) {
      const payload = await fetchJsonCached(
        `${ESPN_LIGA_MX_BASE}/teams/${team.id}/schedule?season=${season}`,
        join(rawDir, `schedule-${team.id}-${season}.json`),
        { ...(options.offline ? { offline: true } : {}) },
      );
      if (!payload) continue;
      for (const event of readScheduleEvents(payload)) {
        if (!event.completed) continue;
        if (event.season !== season) continue;
        eventsById.set(event.id, event);
      }
    }
  }
  const events = [...eventsById.values()].sort((a, b) => a.date.localeCompare(b.date));
  log(`[espn] eventos terminados: ${events.length} (${seasons.join(", ")})`);

  const corpusFile = join(options.rootDir, "data", "history", "liga-mx.jsonl");
  const researchFile = join(options.rootDir, "data", "history", "research", "liga-mx.jsonl");
  const corpusGames: Array<{ id: string; date: string; home: string; away: string; season: string }> = [];
  const pushCorpus = (file: string): void => {
    if (!existsSync(file)) return;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const game = JSON.parse(line) as { id: string; date: string; homeTeam: string; awayTeam: string; season: string };
      corpusGames.push({
        id: game.id,
        date: game.date,
        home: game.homeTeam.slice("liga-mx.".length),
        away: game.awayTeam.slice("liga-mx.".length),
        season: game.season,
      });
    }
  };
  // El corpus canónico no tiene 2021-22…2023-24: esos ids viven en el dataset research.
  pushCorpus(corpusFile);
  pushCorpus(researchFile);

  const summaries = new Map<string, unknown>();
  let fetched = 0;
  for (const event of events) {
    if (fetched >= maxSummaries) break;
    const cachePath = join(rawDir, "summaries", `${event.id}.json`);
    if (existsSync(cachePath)) {
      summaries.set(event.id, readJson(cachePath));
      continue;
    }
    if (options.offline) continue;
    const payload = await fetchJsonCached(
      `${ESPN_LIGA_MX_BASE}/summary?event=${event.id}`,
      cachePath,
      { retries: 2 },
    );
    if (payload) {
      summaries.set(event.id, payload);
      fetched++;
    }
    if (fetched % 50 === 0 && fetched > 0) log(`[espn] summaries: ${fetched}`);
  }

  const rows: EspnStatsGame[] = [];
  let matched = 0;
  const pending = events.filter((event) => summaries.has(event.id));
  for (const event of pending) {
    const homeSlug = ESPN_TEAM_SLUGS[event.homeName];
    const awaySlug = ESPN_TEAM_SLUGS[event.awayName];
    if (!homeSlug || !awaySlug) continue;
    const candidate = corpusGames
      .filter((game) => game.home === homeSlug && game.away === awaySlug)
      .map((game) => ({ game, diff: dateDiff(game.date, event.date) }))
      .sort((a, b) => a.diff - b.diff)[0];
    if (!candidate || candidate.diff > 2) continue;
    const summary = summaries.get(event.id);
    const stats = parseEspnSummary(summary);
    const teamIds = [...stats.keys()];
    if (teamIds.length < 2) continue;
    // El orden de los equipos en el boxscore no está garantizado: se usa el nombre.
    const box = (summary as { boxscore?: { teams?: EspnBoxTeam[] } }).boxscore?.teams ?? [];
    const homeTeam = box.find((team) => team.team?.displayName === event.homeName);
    const awayTeam = box.find((team) => team.team?.displayName === event.awayName);
    if (!homeTeam?.team?.id || !awayTeam?.team?.id) continue;
    const homeStats = stats.get(homeTeam.team.id);
    const awayStats = stats.get(awayTeam.team.id);
    if (!homeStats || !awayStats) continue;

    rows.push({
      id: candidate.game.id,
      date: candidate.game.date,
      league: "liga-mx",
      season: candidate.game.season,
      shotsHome: homeStats.shots,
      shotsAway: awayStats.shots,
      shotsOnTargetHome: homeStats.shotsOnTarget,
      shotsOnTargetAway: awayStats.shotsOnTarget,
      cornersHome: homeStats.corners,
      cornersAway: awayStats.corners,
      possessionHome: homeStats.possession,
      possessionAway: awayStats.possession,
      yellowHome: homeStats.yellow,
      yellowAway: awayStats.yellow,
      redHome: homeStats.red,
      redAway: awayStats.red,
      source: "espn",
    });
    matched++;
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const outDir = join(options.rootDir, "data", "history", "research");
  mkdirSync(outDir, { recursive: true });
  const filePath = join(outDir, "liga-mx-espn-stats.jsonl");
  // Se conservan las temporadas de corridas anteriores: este constructor es incremental.
  const merged = new Map<string, EspnStatsGame>();
  if (existsSync(filePath)) {
    for (const line of readFileSync(filePath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as EspnStatsGame;
      merged.set(row.id, row);
    }
  }
  for (const row of rows) merged.set(row.id, row);
  const allRows = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  writeFileSync(filePath, allRows.map((row) => JSON.stringify(row)).join("\n") + (allRows.length > 0 ? "\n" : ""), "utf8");
  const manifestPath = join(outDir, "liga-mx-espn-stats.manifest.json");
  const bySeason: Record<string, number> = {};
  for (const row of allRows) bySeason[row.season] = (bySeason[row.season] ?? 0) + 1;
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        rows: allRows.length,
        bySeason,
        events: events.length,
        matched: matched,
        seasons,
        source: "espn",
        license: "research-only",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  log(`[espn] dataset: ${allRows.length} partidos (${rows.length} de esta corrida, ${events.length} eventos)`);
  return { rows: allRows, matched, total: events.length, filePath, manifestPath };
}
