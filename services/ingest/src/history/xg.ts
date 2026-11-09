/**
 * Constructor del dataset de xG (Understat, research-only).
 *
 * Escribe:
 *   data/history/research/xg/<liga>.jsonl   xG por partido emparejado por id con el corpus
 *   data/history/research/xg/manifest.json  snapshots usados, cobertura y empatados
 *   Reportes/datos/XG-QUALITY.md            reporte legible
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getHistoryLeague, isHistoryLeagueId } from "./leagues.js";
import { FD_DIVISION_BY_LEAGUE, fdSeasonUrl, normalizeFdXg } from "./football-data-co-uk.js";
import { estimateXgFromShots } from "./xg-estimate.js";
import { sha256 } from "./http.js";
import {
  UNDERSTAT_LEAGUE_CODES,
  UNDERSTAT_SEASONS,
  fetchUnderstatSeason,
  normalizeUnderstatMatches,
  parseUnderstatLeagueHtml,
  understatSeasonLabel,
  type XgGame,
} from "./understat.js";

export interface BuildXgOptions {
  rootDir: string;
  leagues?: readonly string[];
  seasons?: readonly number[];
  offline?: boolean;
  reportDir?: string;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface XgManifest {
  schemaVersion: 1;
  datasetId: string;
  generatedAt: string;
  generatedBy: "services/ingest/history/xg";
  corpus: { datasetId: string | null; rows: number };
  leagues: Array<{
    id: string;
    rows: number;
    matchedCorpus: number;
    corpusRows: number;
    coverage: number;
    unmatchedNames: string[];
    seasons: Array<{ season: string; rows: number; snapshot: string | null; status: string }>;
  }>;
  sources: Array<{ id: string; url: string; snapshot: string | null; status: string; rows: number }>;
  notes: string[];
}

const XG_LEAGUES = [...Object.keys(UNDERSTAT_LEAGUE_CODES), "liga-mx"];

function sortGames(games: readonly XgGame[]): XgGame[] {
  return [...games].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export async function buildXgDataset(options: BuildXgOptions): Promise<{
  manifest: XgManifest;
  manifestPath: string;
  reportPath: string;
  files: Array<{ league: string; path: string; rows: number }>;
}> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((message: string) => console.log(message));
  const requested = options.leagues ?? XG_LEAGUES;
  const leagues = requested.map((id) => {
    if (!isHistoryLeagueId(id) || !XG_LEAGUES.includes(id)) {
      throw new Error(`Liga sin xG disponible: '${id}'. Válidas: ${XG_LEAGUES.join(", ")}.`);
    }
    return id;
  });
  const seasons = options.seasons ?? UNDERSTAT_SEASONS;

  const datasetDir = join(options.rootDir, "data", "history", "research", "xg");
  const cacheDir = join(options.rootDir, "data", "history", "raw", "understat");
  const reportDir = options.reportDir ?? join(options.rootDir, "Reportes", "datos");
  mkdirSync(datasetDir, { recursive: true });

  const corpusRows = new Map<string, Set<string>>();
  let corpusDatasetId: string | null = null;
  const corpusManifest = join(options.rootDir, "data", "history", "manifest.json");
  if (existsSync(corpusManifest)) {
    corpusDatasetId =
      (JSON.parse(readFileSync(corpusManifest, "utf8")) as { datasetId?: string }).datasetId ?? null;
  }
  for (const league of leagues) {
    const file = join(options.rootDir, "data", "history", `${league}.jsonl`);
    const ids = new Set<string>();
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        ids.add((JSON.parse(line) as { id: string }).id);
      }
    }
    corpusRows.set(league, ids);
  }

  const gamesByLeague = new Map<string, XgGame[]>();
  const unmatchedByLeague = new Map<string, Set<string>>();
  const seasonReports = new Map<string, XgManifest["leagues"][number]["seasons"]>();
  const sources: XgManifest["sources"] = [];

  for (const leagueId of leagues) {
    if (!(leagueId in UNDERSTAT_LEAGUE_CODES)) continue;
    const league = getHistoryLeague(leagueId);
    for (const year of seasons) {
      const season = understatSeasonLabel(year);
      try {
        const fetched = await fetchUnderstatSeason({
          league,
          year,
          cacheDir,
          ...(options.offline ? { offline: true } : {}),
        });
        const seasonReport = seasonReports.get(leagueId) ?? [];
        if (!fetched) {
          seasonReport.push({ season, rows: 0, snapshot: null, status: "unavailable" });
          seasonReports.set(leagueId, seasonReport);
          sources.push({
            id: `understat-${leagueId}-${year}`,
            url: `https://understat.com/league/${UNDERSTAT_LEAGUE_CODES[leagueId]}/${year}`,
            snapshot: null,
            status: "unavailable",
            rows: 0,
          });
          continue;
        }
        const matches = parseUnderstatLeagueHtml(fetched.html);
        if (!matches) {
          seasonReport.push({ season, rows: 0, snapshot: fetched.snapshot, status: "unparseable" });
          seasonReports.set(leagueId, seasonReport);
          continue;
        }
        const normalized = normalizeUnderstatMatches(matches, {
          league,
          year,
          snapshot: fetched.snapshot,
        });
        const leagueGames = gamesByLeague.get(leagueId) ?? [];
        leagueGames.push(...normalized.games);
        gamesByLeague.set(leagueId, leagueGames);
        const unmatched = unmatchedByLeague.get(leagueId) ?? new Set<string>();
        for (const name of normalized.unmatchedNames) unmatched.add(name);
        unmatchedByLeague.set(leagueId, unmatched);
        seasonReport.push({
          season,
          rows: normalized.games.length,
          snapshot: fetched.snapshot,
          status: fetched.status === "cached" ? "cached" : "fetched",
        });
        seasonReports.set(leagueId, seasonReport);
        sources.push({
          id: `understat-${leagueId}-${year}`,
          url: fetched.url,
          snapshot: fetched.snapshot,
          status: fetched.status,
          rows: normalized.games.length,
        });
        log(`[xg] ${leagueId} ${season}: ${normalized.games.length} partidos (${fetched.status})`);
      } catch (error) {
        log(`[xg] ${leagueId} ${season}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // football-data.co.uk publica HxG/AxG en 2026-27: completa la temporada en curso.
  const fdXgSeason = "2026-27";
  for (const leagueId of leagues) {
    const division = FD_DIVISION_BY_LEAGUE[leagueId];
    if (!division) continue;
    const csvPath = join(options.rootDir, "data", "history", "raw", "football-data.co.uk", fdXgSeason, `${division}.csv`);
    if (!existsSync(csvPath)) continue;
    const fdGames = normalizeFdXg(readFileSync(csvPath, "utf8"), {
      league: getHistoryLeague(leagueId),
      season: fdXgSeason,
    });
    if (fdGames.length === 0) continue;
    const leagueGames = gamesByLeague.get(leagueId) ?? [];
    const existing = new Set(leagueGames.map((game) => game.id));
    let added = 0;
    for (const game of fdGames) {
      if (existing.has(game.id)) continue;
      leagueGames.push({ ...game, source: "football-data.co.uk", snapshot: null });
      existing.add(game.id);
      added++;
    }
    gamesByLeague.set(leagueId, leagueGames);
    sources.push({
      id: `football-data-xg-${leagueId}-${fdXgSeason}`,
      url: fdSeasonUrl(fdXgSeason, division),
      snapshot: null,
      status: "cached",
      rows: added,
    });
    log(`[xg] ${leagueId} ${fdXgSeason}: +${added} partidos xG de football-data.co.uk`);
  }

  // Relleno: xG estimado por tiros donde no hay xG real (Liga MX, temporadas sin Understat).
  for (const leagueId of leagues) {
    const existingGames = gamesByLeague.get(leagueId) ?? [];
    const knownIds = new Set(existingGames.map((game) => game.id));
    const candidates: Array<{
      id: string;
      date: string;
      season: string;
      homeTeam: string;
      awayTeam: string;
      stats: {
        shotsHome: number | null;
        shotsAway: number | null;
        shotsOnTargetHome: number | null;
        shotsOnTargetAway: number | null;
      };
    }> = [];

    if (leagueId === "liga-mx") {
      const path = join(options.rootDir, "data", "history", "research", "liga-mx-espn-stats.jsonl");
      if (existsSync(path)) {
        for (const line of readFileSync(path, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const row = JSON.parse(line) as {
            id: string;
            date: string;
            season: string;
            shotsHome: number | null;
            shotsAway: number | null;
            shotsOnTargetHome: number | null;
            shotsOnTargetAway: number | null;
          };
          const parts = row.id.split(":");
          if (parts.length !== 5) continue;
          candidates.push({
            id: row.id,
            date: row.date,
            season: row.season,
            homeTeam: `liga-mx.${parts[3]}`,
            awayTeam: `liga-mx.${parts[4]}`,
            stats: row,
          });
        }
      }
    } else {
      const path = join(options.rootDir, "data", "history", "research", `${leagueId}.jsonl`);
      if (existsSync(path)) {
        for (const line of readFileSync(path, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const row = JSON.parse(line) as {
            id: string;
            date: string;
            season: string;
            homeTeam: string;
            awayTeam: string;
            stats?: {
              shotsHome: number | null;
              shotsAway: number | null;
              shotsOnTargetHome: number | null;
              shotsOnTargetAway: number | null;
            };
          };
          if (!row.stats) continue;
          candidates.push({
            id: row.id,
            date: row.date,
            season: row.season,
            homeTeam: row.homeTeam,
            awayTeam: row.awayTeam,
            stats: row.stats,
          });
        }
      }
    }

    let estimated = 0;
    for (const candidate of candidates) {
      if (knownIds.has(candidate.id)) continue;
      const xg = estimateXgFromShots(candidate.stats);
      if (!xg) continue;
      existingGames.push({
        id: candidate.id,
        league: leagueId,
        season: candidate.season,
        date: candidate.date,
        homeTeam: candidate.homeTeam,
        awayTeam: candidate.awayTeam,
        homeXg: xg.home,
        awayXg: xg.away,
        source: "estimated-from-shots",
        snapshot: null,
      });
      knownIds.add(candidate.id);
      estimated++;
    }
    gamesByLeague.set(leagueId, existingGames);
    if (estimated > 0) log(`[xg] ${leagueId}: +${estimated} xG estimados por tiros`);
  }

  const files: Array<{ league: string; rows: number; sha256: string }> = [];
  for (const leagueId of leagues) {
    const games = sortGames(gamesByLeague.get(leagueId) ?? []);
    if (games.length === 0) continue;
    const file = join(datasetDir, `${leagueId}.jsonl`);
    const body = games.map((game) => JSON.stringify(game)).join("\n") + "\n";
    writeFileSync(file, body, "utf8");
    files.push({ league: leagueId, rows: games.length, sha256: sha256(body) });
  }
  // Limpieza de ligas que ya no se construyen.
  for (const entry of existsSync(datasetDir) ? readdirSync(datasetDir) : []) {
    if (!/^[a-z0-9-]+\.jsonl$/.test(entry)) continue;
    if (files.some((file) => `${file.league}.jsonl` === entry)) continue;
    unlinkSync(join(datasetDir, entry));
  }

  const leagueReports = files.map((file) => {
    const games = gamesByLeague.get(file.league) ?? [];
    const corpus = corpusRows.get(file.league) ?? new Set<string>();
    const matched = games.filter((game) => corpus.has(game.id)).length;
    return {
      id: file.league,
      rows: file.rows,
      matchedCorpus: matched,
      corpusRows: corpus.size,
      coverage: corpus.size > 0 ? Math.min(1, matched / corpus.size) : 0,
      unmatchedNames: [...(unmatchedByLeague.get(file.league) ?? [])].sort(),
      seasons: (seasonReports.get(file.league) ?? []).sort((a, b) => a.season.localeCompare(b.season)),
    };
  });

  const datasetId = sha256(
    JSON.stringify({
      schemaVersion: 1,
      corpus: corpusDatasetId,
      files: files.map((file) => ({ league: file.league, rows: file.rows, sha256: file.sha256 })),
    }),
  );

  const manifest: XgManifest = {
    schemaVersion: 1,
    datasetId,
    generatedAt: now().toISOString(),
    generatedBy: "services/ingest/history/xg",
    corpus: { datasetId: corpusDatasetId, rows: [...corpusRows.values()].reduce((sum, set) => sum + set.size, 0) },
    leagues: leagueReports,
    sources,
    notes: [
      "xG de Understat obtenido vía snapshots de Wayback Machine (el sitio en vivo estaba en mantenimiento el 2026-11-09).",
      "Research-only: Understat no declara licencia de reutilización; no se publica ni se redistribuye.",
      "Cada temporada usa el snapshot más reciente con al menos el 90 % de los partidos.",
      "Donde no hay xG real se estima desde tiros y tiros a puerta con una regresión ajustada en 18,692 partidos de las cinco grandes (R² ≈ 0.51); se marca como `estimated-from-shots`.",
    ],
  };
  const manifestPath = join(datasetDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const lines: string[] = [
    "# Dataset de xG (Understat, research-only)",
    "",
    `Generado: ${manifest.generatedAt}`,
    "",
    `- datasetId: \`${manifest.datasetId}\``,
    `- Corpus emparejado: \`${manifest.corpus.datasetId ?? "sin corpus"}\` (${manifest.corpus.rows} partidos)`,
    "",
    "| Liga | Filas | Emparejadas | Corpus | Cobertura | Nombres sin alias |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const league of leagueReports) {
    lines.push(
      `| ${league.id} | ${league.rows} | ${league.matchedCorpus} | ${league.corpusRows} | ${(league.coverage * 100).toFixed(1)}% | ${league.unmatchedNames.length} |`,
    );
    if (league.unmatchedNames.length > 0) {
      lines.push("", `> Nombres sin alias en ${league.id}: ${league.unmatchedNames.join(", ")}`);
    }
    lines.push("", "| Temporada | Filas | Snapshot | Estado |", "|---|---:|---|---|");
    for (const season of league.seasons) {
      lines.push(`| ${season.season} | ${season.rows} | ${season.snapshot ?? "—"} | ${season.status} |`);
    }
    lines.push("");
  }
  const reportPath = join(reportDir, "XG-QUALITY.md");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, lines.join("\n"), "utf8");

  return {
    manifest,
    manifestPath,
    reportPath,
    files: files.map((file) => ({ league: file.league, path: join(datasetDir, `${file.league}.jsonl`), rows: file.rows })),
  };
}
