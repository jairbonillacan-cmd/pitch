/**
 * Estadísticas y xG por partido de Liga MX vía API-Football.
 *
 * El endpoint `/fixtures/statistics?fixture=<id>` devuelve, entre otras cosas,
 * `expected_goals`, tiros, tiros a puerta, córners, posesión y tarjetas. El plan Free
 * impone 100 solicitudes/día, así que este descargador es **incremental y reanudable**:
 * cachea cada respuesta y gasta como máximo `maxRequests` por corrida.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  API_FOOTBALL_BASE_URL,
  API_FOOTBALL_DAILY_LIMIT,
} from "../adapters/api-football.js";
import {
  API_FOOTBALL_LIGA_MX_SLUGS,
  apiFootballGameId,
} from "./api-football-history.js";

export interface LigaMxStatsRecord {
  id: string;
  date: string;
  league: "liga-mx";
  season: string;
  homeXg: number | null;
  awayXg: number | null;
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
  source: "api-football";
}

export interface ApiFootballStatsItem {
  team: { id: number; name: string };
  statistics: Array<{ type: string; value: number | string | null }>;
}

function numeric(value: number | string | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim().replace("%", "");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function statValue(
  statistics: readonly { type: string; value: number | string | null }[],
  type: string,
): number | null {
  const found = statistics.find((entry) => entry.type.toLowerCase() === type.toLowerCase());
  return found ? numeric(found.value) : null;
}

/**
 * Convierte la respuesta de `/fixtures/statistics` en un registro comparable.
 * `homeTeamId`/`awayTeamId` vienen del fixture cacheado.
 */
export function parseStatistics(
  items: readonly ApiFootballStatsItem[],
  context: { id: string; date: string; season: string; homeTeamId: number; awayTeamId: number },
): LigaMxStatsRecord | null {
  const home = items.find((item) => item.team.id === context.homeTeamId);
  const away = items.find((item) => item.team.id === context.awayTeamId);
  if (!home || !away) return null;
  const homeXg = statValue(home.statistics, "expected_goals");
  const awayXg = statValue(away.statistics, "expected_goals");
  return {
    id: context.id,
    date: context.date,
    league: "liga-mx",
    season: context.season,
    homeXg,
    awayXg,
    shotsHome: statValue(home.statistics, "Total Shots"),
    shotsAway: statValue(away.statistics, "Total Shots"),
    shotsOnTargetHome: statValue(home.statistics, "Shots on Goal"),
    shotsOnTargetAway: statValue(away.statistics, "Shots on Goal"),
    cornersHome: statValue(home.statistics, "Corner Kicks"),
    cornersAway: statValue(away.statistics, "Corner Kicks"),
    possessionHome: statValue(home.statistics, "Ball Possession"),
    possessionAway: statValue(away.statistics, "Ball Possession"),
    yellowHome: statValue(home.statistics, "Yellow Cards"),
    yellowAway: statValue(away.statistics, "Yellow Cards"),
    redHome: statValue(home.statistics, "Red Cards"),
    redAway: statValue(away.statistics, "Red Cards"),
    source: "api-football",
  };
}

interface CachedFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { season: number; round: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
}

interface Budget {
  date: string;
  count: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function readBudget(path: string): Budget {
  if (!existsSync(path)) return { date: today(), count: 0 };
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Budget;
  return parsed.date === today() ? parsed : { date: today(), count: 0 };
}

function writeBudget(path: string, budget: Budget): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(budget, null, 2) + "\n", "utf8");
}

export interface FetchLigaMxStatsOptions {
  rootDir: string;
  apiKey: string;
  maxRequests?: number;
  seasons?: number[];
  log?: (message: string) => void;
}

export interface FetchLigaMxStatsResult {
  requested: number;
  fetched: number;
  skipped: number;
  available: number;
  errors: string[];
}

/** Descarga incremental de estadísticas: respeta caché y presupuesto diario. */
export async function fetchLigaMxStats(
  options: FetchLigaMxStatsOptions,
): Promise<FetchLigaMxStatsResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const maxRequests = options.maxRequests ?? 60;
  const seasons = options.seasons ?? [2024, 2023, 2022, 2021];
  const fixturesDir = join(options.rootDir, "data", "history", "raw", "api-football", "liga-mx");
  const statsDir = join(options.rootDir, "data", "history", "raw", "api-football", "stats");
  const budgetPath = join(options.rootDir, "services", "ingest", ".cache", "api-football-budget.json");

  const fixtures: CachedFixture[] = [];
  for (const season of seasons) {
    const path = join(fixturesDir, `${season}.json`);
    if (!existsSync(path)) continue;
    const payload = JSON.parse(readFileSync(path, "utf8")) as { response?: CachedFixture[] };
    for (const fixture of payload.response ?? []) fixtures.push(fixture);
  }

  const budget = readBudget(budgetPath);
  let fetched = 0;
  let skipped = 0;
  let available = 0;
  const errors: string[] = [];

  for (const fixture of fixtures) {
    if (!["FT", "AET", "PEN"].includes(fixture.fixture.status.short)) continue;
    available++;
    const cachePath = join(statsDir, `${fixture.fixture.id}.json`);
    if (existsSync(cachePath)) {
      skipped++;
      continue;
    }
    if (fetched >= maxRequests) continue;
    if (budget.count >= API_FOOTBALL_DAILY_LIMIT) {
      errors.push("presupuesto diario alcanzado");
      break;
    }
    const response = await fetch(
      `${API_FOOTBALL_BASE_URL}/fixtures/statistics?fixture=${fixture.fixture.id}`,
      { headers: { "x-apisports-key": options.apiKey.trim() } },
    );
    budget.count++;
    writeBudget(budgetPath, budget);
    if (!response.ok) {
      errors.push(`HTTP ${response.status} fixture ${fixture.fixture.id}`);
      continue;
    }
    const payload = (await response.json()) as {
      response?: ApiFootballStatsItem[];
      errors?: Record<string, string> | unknown[];
    };
    const errs = payload.errors
      ? Array.isArray(payload.errors)
        ? payload.errors.map(String)
        : Object.entries(payload.errors).map(([key, value]) => `${key}: ${value}`)
      : [];
    if (errs.length > 0) {
      errors.push(`${fixture.fixture.id}: ${errs.join("; ")}`);
      continue;
    }
    mkdirSync(statsDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf8");
    fetched++;
  }

  log(
    `[api-stats] fixtures=${available} nuevas=${fetched} cacheadas=${skipped} presupuesto=${budget.count}/${API_FOOTBALL_DAILY_LIMIT}`,
  );
  return { requested: maxRequests, fetched, skipped, available, errors };
}

/** Construye el dataset research de estadísticas de Liga MX desde la caché. */
export function buildLigaMxStatsDataset(options: {
  rootDir: string;
  log?: (message: string) => void;
}): {
  rows: LigaMxStatsRecord[];
  withXg: number;
  manifestPath: string;
  filePath: string;
} {
  const log = options.log ?? ((message: string) => console.log(message));
  const fixturesDir = join(options.rootDir, "data", "history", "raw", "api-football", "liga-mx");
  const statsDir = join(options.rootDir, "data", "history", "raw", "api-football", "stats");
  const outDir = join(options.rootDir, "data", "history", "research");
  const records: LigaMxStatsRecord[] = [];

  for (const fileName of existsSync(fixturesDir) ? readdirSync(fixturesDir) : []) {
    if (!/^\d{4}\.json$/.test(fileName)) continue;
    const payload = JSON.parse(readFileSync(join(fixturesDir, fileName), "utf8")) as {
      response?: CachedFixture[];
    };
    for (const fixture of payload.response ?? []) {
      const statsPath = join(statsDir, `${fixture.fixture.id}.json`);
      if (!existsSync(statsPath)) continue;
      const homeSlug = API_FOOTBALL_LIGA_MX_SLUGS[fixture.teams.home.name.trim()];
      const awaySlug = API_FOOTBALL_LIGA_MX_SLUGS[fixture.teams.away.name.trim()];
      if (!homeSlug || !awaySlug) continue;
      const id = apiFootballGameId({
        leagueId: "liga-mx",
        season: fixture.league.season,
        round: fixture.league.round,
        homeSlug,
        awaySlug,
      });
      if (!id) continue;
      const statsPayload = JSON.parse(readFileSync(statsPath, "utf8")) as {
        response?: ApiFootballStatsItem[];
      };
      const record = parseStatistics(statsPayload.response ?? [], {
        id,
        date: fixture.fixture.date.slice(0, 10),
        season: `${fixture.league.season}-${String((fixture.league.season + 1) % 100).padStart(2, "0")}`,
        homeTeamId: fixture.teams.home.id,
        awayTeamId: fixture.teams.away.id,
      });
      if (record) records.push(record);
    }
  }

  records.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const filePath = join(outDir, "liga-mx-stats.jsonl");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  const withXg = records.filter((record) => record.homeXg !== null && record.awayXg !== null).length;
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rows: records.length,
    withXg,
    seasons: [...new Set(records.map((record) => record.season))].sort(),
    source: "api-football",
    license: "research-only",
  };
  const manifestPath = join(outDir, "liga-mx-stats.manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  log(`[api-stats] dataset: ${records.length} partidos (${withXg} con xG)`);
  return { rows: records, withXg, manifestPath, filePath };
}
