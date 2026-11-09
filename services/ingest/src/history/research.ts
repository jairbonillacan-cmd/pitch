/**
 * Constructor del dataset de investigación: cuotas de cierre y estadísticas de partido.
 *
 * Escribe:
 *   data/history/research/<liga>.jsonl        una fila por partido con odds/stats
 *   data/history/research/manifest.json       procedencia, cobertura y emparejamiento
 *   Reportes/datos/ODDS-QUALITY.md            reporte legible
 *
 * Es un dataset **separado** del corpus canónico por licencia: no se publica.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getHistoryLeague, isHistoryLeagueId, type HistoryLeagueId } from "./leagues.js";
import {
  FD_DIVISION_BY_LEAGUE,
  FD_SEASONS,
  fdSeasonUrl,
  normalizeFdSeason,
} from "./football-data-co-uk.js";
import {
  API_FOOTBALL_HISTORY_SEASONS,
  apiFootballSeasonLabel,
  fetchApiFootballSeason,
  normalizeApiFootballHistory,
} from "./api-football-history.js";
import { fetchTextCached, mapLimit, sha256 } from "./http.js";
import {
  RESEARCH_SCHEMA_VERSION,
  ResearchGameSchema,
  ResearchManifestSchema,
  type ResearchGame,
  type ResearchManifest,
  type ResearchSourceRecord,
} from "./research-schema.js";
import { renderOddsReport } from "./odds-report.js";

export interface BuildResearchOptions {
  rootDir: string;
  leagues?: readonly string[];
  seasons?: readonly string[];
  offline?: boolean;
  concurrency?: number;
  reportDir?: string;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface BuildResearchResult {
  manifest: ResearchManifest;
  datasetPath: string;
  manifestPath: string;
  reportPath: string;
  files: Array<{ league: string; path: string; rows: number }>;
}

const FD_LEAGUES = Object.keys(FD_DIVISION_BY_LEAGUE) as HistoryLeagueId[];
const RESEARCH_LEAGUES: HistoryLeagueId[] = [...FD_LEAGUES, "liga-mx"];

interface CorpusSummary {
  datasetId: string | null;
  gamesById: Map<string, { league: string }>;
  rowsByLeague: Map<string, number>;
}

function loadCorpus(rootDir: string): CorpusSummary {
  const summary: CorpusSummary = {
    datasetId: null,
    gamesById: new Map(),
    rowsByLeague: new Map(),
  };

  const manifestPath = join(rootDir, "data", "history", "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { datasetId?: string };
    summary.datasetId = manifest.datasetId ?? null;
  }

  for (const leagueId of RESEARCH_LEAGUES) {
    const file = join(rootDir, "data", "history", `${leagueId}.jsonl`);
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    summary.rowsByLeague.set(leagueId, lines.length);
    for (const line of lines) {
      const row = JSON.parse(line) as { id: string };
      summary.gamesById.set(row.id, { league: leagueId });
    }
  }

  return summary;
}

function sortGames(games: readonly ResearchGame[]): ResearchGame[] {
  return [...games].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });
}

function pruneStaleFiles(directory: string, keep: ReadonlySet<string>): string[] {
  if (!existsSync(directory)) return [];
  const removed: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (!/^[a-z0-9-]+\.jsonl$/.test(entry)) continue;
    if (keep.has(entry)) continue;
    unlinkSync(join(directory, entry));
    removed.push(entry);
  }
  return removed;
}

function writeJsonl(path: string, games: readonly ResearchGame[]): { sha256: string; rows: number } {
  mkdirSync(join(path, ".."), { recursive: true });
  const body = games.map((game) => JSON.stringify(game)).join("\n") + "\n";
  writeFileSync(path, body, "utf8");
  return { sha256: sha256(body), rows: games.length };
}

export async function buildResearchDataset(
  options: BuildResearchOptions,
): Promise<BuildResearchResult> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((message: string) => console.log(message));
  const offline = options.offline ?? false;
  const concurrency = options.concurrency ?? 3;

  const requested = options.leagues ?? RESEARCH_LEAGUES;
  const leagueIds = requested.map((id) => {
    if (!isHistoryLeagueId(id) || !RESEARCH_LEAGUES.includes(id)) {
      throw new Error(`Liga sin fuente research: '${id}'. Válidas: ${RESEARCH_LEAGUES.join(", ")}.`);
    }
    return id;
  });

  const fdSeasons = options.seasons ?? FD_SEASONS;
  for (const season of fdSeasons) {
    if (!(FD_SEASONS as readonly string[]).includes(season)) {
      throw new Error(
        `Temporada fuera de football-data.co.uk: '${season}'. Válidas: ${FD_SEASONS.join(", ")}.`,
      );
    }
  }
  const apiSeasons = options.seasons
    ? API_FOOTBALL_HISTORY_SEASONS.filter((season) =>
        (options.seasons as readonly string[]).includes(apiFootballSeasonLabel(season)),
      )
    : [...API_FOOTBALL_HISTORY_SEASONS];

  const datasetDir = join(options.rootDir, "data", "history", "research");
  const rawDir = join(options.rootDir, "data", "history", "raw", "football-data.co.uk");
  const apiRawDir = join(options.rootDir, "data", "history", "raw", "api-football");
  const reportDir = options.reportDir ?? join(options.rootDir, "Reportes", "datos");
  mkdirSync(datasetDir, { recursive: true });

  const apiKey = process.env.API_FOOTBALL_KEY?.trim() ?? "";
  const apiBudgetFile = join(options.rootDir, "services", "ingest", ".cache", "api-football-budget.json");

  const corpus = loadCorpus(options.rootDir);
  const sources: ResearchSourceRecord[] = [];
  const gamesByLeague = new Map<string, ResearchGame[]>();
  const unmatchedByLeague = new Map<string, Set<string>>();
  const fallbackByLeague = new Map<string, Set<string>>();
  const seasonRows = new Map<string, Map<string, number>>();

  const fdLeagueIds = leagueIds.filter((leagueId) => leagueId in FD_DIVISION_BY_LEAGUE);
  const wantsLigaMx = leagueIds.includes("liga-mx");

  const tasks: Array<{ leagueId: HistoryLeagueId; season: string }> = [];
  for (const leagueId of fdLeagueIds) {
    for (const season of fdSeasons) tasks.push({ leagueId, season });
  }

  const fetched = await mapLimit(tasks, concurrency, async ({ leagueId, season }) => {
    const division = FD_DIVISION_BY_LEAGUE[leagueId]!;
    const url = fdSeasonUrl(season, division);
    const result = await fetchTextCached(url, join(rawDir, season, `${division}.csv`), {
      offline,
      retries: 2,
      userAgent: "Mozilla/5.0 (compatible; PitchLab-Research/0.1; +https://pitchlab.mx)",
    });
    return { leagueId, season, division, url, result };
  });

  for (const { leagueId, season, url, result } of fetched) {
    if (!result) {
      sources.push({
        id: `football-data-${FD_DIVISION_BY_LEAGUE[leagueId]}-${season}`,
        provider: "football-data.co.uk",
        url,
        license: "research-only",
        sha256: null,
        bytes: 0,
        status: "unavailable",
        retrievedAt: null,
      });
      continue;
    }

    sources.push({
      id: `football-data-${FD_DIVISION_BY_LEAGUE[leagueId]}-${season}`,
      provider: "football-data.co.uk",
      url,
      license: "research-only",
      sha256: result.sha256,
      bytes: result.bytes,
      status: result.status,
      retrievedAt: result.retrievedAt,
    });

    const normalized = normalizeFdSeason(result.text, {
      league: getHistoryLeague(leagueId),
      season,
      slugifyUnmapped: true,
    });

    const leagueGames = gamesByLeague.get(leagueId) ?? [];
    leagueGames.push(...normalized.games);
    gamesByLeague.set(leagueId, leagueGames);

    const unmatched = unmatchedByLeague.get(leagueId) ?? new Set<string>();
    for (const name of normalized.unmatchedNames) unmatched.add(name);
    unmatchedByLeague.set(leagueId, unmatched);

    const fallback = fallbackByLeague.get(leagueId) ?? new Set<string>();
    for (const name of normalized.fallbackNames) fallback.add(name);
    fallbackByLeague.set(leagueId, fallback);

    const perSeason = seasonRows.get(leagueId) ?? new Map<string, number>();
    perSeason.set(season, normalized.games.length);
    seasonRows.set(leagueId, perSeason);

    log(
      `[research] ${leagueId} ${season}: ${normalized.games.length} partidos (${normalized.unmatchedNames.length} nombres sin mapear)`,
    );
  }

  if (wantsLigaMx) {
    if (!apiKey) {
      log("[research] liga-mx omitida: falta API_FOOTBALL_KEY.");
    } else {
      for (const season of apiSeasons) {
        const label = apiFootballSeasonLabel(season);
        try {
          const fetchedSeason = await fetchApiFootballSeason({
            apiKey,
            season,
            cacheFilePath: join(apiRawDir, "liga-mx", `${season}.json`),
            budgetFilePath: apiBudgetFile,
            ...(offline ? { offline: true } : {}),
          });
          sources.push({
            id: `api-football-liga-mx-${season}`,
            provider: "api-football",
            url: `https://v3.football.api-sports.io/fixtures?league=262&season=${season}`,
            license: "research-only",
            sha256: sha256(JSON.stringify(fetchedSeason.payload)),
            bytes: Buffer.byteLength(JSON.stringify(fetchedSeason.payload), "utf8"),
            status: fetchedSeason.status === "error" ? "unavailable" : fetchedSeason.status,
            retrievedAt: null,
          });
          if (fetchedSeason.status === "error") {
            log(`[research] liga-mx ${label}: API-Football respondió ${fetchedSeason.errors.join("; ")}`);
            continue;
          }
          const normalized = normalizeApiFootballHistory(fetchedSeason.payload, {
            league: getHistoryLeague("liga-mx"),
            season,
          });
          const leagueGames = gamesByLeague.get("liga-mx") ?? [];
          leagueGames.push(...normalized.games);
          gamesByLeague.set("liga-mx", leagueGames);

          const unmatched = unmatchedByLeague.get("liga-mx") ?? new Set<string>();
          for (const name of normalized.unmatchedNames) unmatched.add(name);
          unmatchedByLeague.set("liga-mx", unmatched);

          const perSeason = seasonRows.get("liga-mx") ?? new Map<string, number>();
          perSeason.set(label, normalized.games.length);
          seasonRows.set("liga-mx", perSeason);

          log(
            `[research] liga-mx ${label}: ${normalized.games.length} partidos (${normalized.unmatchedNames.length} nombres sin mapear)`,
          );
        } catch (error) {
          log(
            `[research] liga-mx ${label}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  const files: Array<{ league: string; rows: number; sha256: string }> = [];
  for (const leagueId of leagueIds) {
    const games = sortGames(gamesByLeague.get(leagueId) ?? []);
    if (games.length === 0) continue;
    for (const game of games) ResearchGameSchema.parse(game);
    const written = writeJsonl(join(datasetDir, `${leagueId}.jsonl`), games);
    files.push({ league: leagueId, rows: written.rows, sha256: written.sha256 });
  }

  pruneStaleFiles(datasetDir, new Set(files.map((file) => `${file.league}.jsonl`)));

  const leagues = files.map((file) => {
    const games = gamesByLeague.get(file.league) ?? [];
    const withOdds = games.filter((game) => game.odds !== null).length;
    const withClosingOdds = games.filter((game) => game.odds?.timing === "closing").length;
    const withStats = games.filter((game) => game.stats !== undefined).length;
    const matchedCorpus = games.filter((game) => corpus.gamesById.has(game.id)).length;
    const corpusRows = corpus.rowsByLeague.get(file.league) ?? 0;
    const corpusMatchedWithOdds = games.filter(
      (game) => game.odds !== null && corpus.gamesById.has(game.id),
    ).length;

    const perSeason = seasonRows.get(file.league) ?? new Map<string, number>();
    return {
      id: file.league,
      file: `${file.league}.jsonl`,
      fileSha256: file.sha256,
      rows: file.rows,
      withOdds,
      withClosingOdds,
      withStats,
      matchedCorpus,
      corpusRows,
      oddsCoverage: corpusRows > 0 ? Math.min(1, corpusMatchedWithOdds / corpusRows) : 0,
      seasons: [...perSeason.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([season, rows]) => ({
          season,
          rows,
          withOdds: games.filter((game) => game.season === season && game.odds !== null).length,
          matchedCorpus: games.filter(
            (game) => game.season === season && corpus.gamesById.has(game.id),
          ).length,
        })),
      unmatchedNames: [...(unmatchedByLeague.get(file.league) ?? [])].sort(),
      fallbackNames: [...(fallbackByLeague.get(file.league) ?? [])].sort(),
      corpusMatchedWithOdds,
    };
  });

  const totals = leagues.reduce(
    (acc, league) => ({
      rows: acc.rows + league.rows,
      withOdds: acc.withOdds + league.withOdds,
      withClosingOdds: acc.withClosingOdds + league.withClosingOdds,
      withStats: acc.withStats + league.withStats,
      matchedCorpus: acc.matchedCorpus + league.matchedCorpus,
      matchedWithOdds: acc.matchedWithOdds + league.corpusMatchedWithOdds,
      corpusRows: acc.corpusRows + league.corpusRows,
      // La cobertura global se mide sobre las ligas que sí tienen mercado (las cinco
      // grandes); Liga MX no tiene cuotas y no debe diluir el indicador.
      oddsCorpusRows: acc.oddsCorpusRows + (league.withOdds > 0 ? league.corpusRows : 0),
    }),
    {
      rows: 0,
      withOdds: 0,
      withClosingOdds: 0,
      withStats: 0,
      matchedCorpus: 0,
      matchedWithOdds: 0,
      corpusRows: 0,
      oddsCorpusRows: 0,
    },
  );

  const datasetId = sha256(
    JSON.stringify({
      schemaVersion: RESEARCH_SCHEMA_VERSION,
      corpusDatasetId: corpus.datasetId,
      files: files.map((file) => ({ league: file.league, rows: file.rows, sha256: file.sha256 })),
      config: { leagues: leagueIds, fdSeasons, apiSeasons },
    }),
  );

  const manifest: ResearchManifest = ResearchManifestSchema.parse({
    schemaVersion: RESEARCH_SCHEMA_VERSION,
    datasetId,
    generatedAt: now().toISOString(),
    generatedBy: "services/ingest/history/research",
    corpus: { datasetId: corpus.datasetId, rows: corpus.gamesById.size },
    totals: {
      rows: totals.rows,
      leagues: leagues.length,
      withOdds: totals.withOdds,
      withClosingOdds: totals.withClosingOdds,
      withStats: totals.withStats,
      matchedCorpus: totals.matchedCorpus,
      corpusRows: totals.corpusRows,
      oddsCoverage:
        totals.oddsCorpusRows > 0
          ? Math.min(1, totals.matchedWithOdds / totals.oddsCorpusRows)
          : 0,
    },
    leagues,
    sources,
    notes: [
      "Dataset research-only: no se publica ni se redistribuye (términos de football-data.co.uk no localizados).",
      "Las cuotas de cierre existen desde 2020-21; antes se guardan cuotas pre-partido y se marca timing.",
      "Pinnacle tiene prioridad sobre B365 y el promedio; si no hay cuotas, la fila queda con odds=null.",
      "Las estadísticas de partido (tiros, córners, tarjetas) sirven como features, no como dato publicable.",
    ],
  });

  const manifestPath = join(datasetDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const reportPath = join(reportDir, "ODDS-QUALITY.md");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, renderOddsReport(manifest), "utf8");

  return {
    manifest,
    datasetPath: datasetDir,
    manifestPath,
    reportPath,
    files: files.map((file) => ({ league: file.league, path: join(datasetDir, `${file.league}.jsonl`), rows: file.rows })),
  };
}
