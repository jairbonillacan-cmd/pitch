/**
 * Constructor del dataset histórico.
 *
 * Descarga (o reutiliza de caché) las fuentes, normaliza, audita y escribe:
 *   data/history/<liga>.jsonl       filas deterministas, un partido por línea
 *   data/history/manifest.json      procedencia, digests, cobertura y calidad
 *   Reportes/datos/HISTORICO-QUALITY.md   reporte legible
 *
 * El `datasetId` es el digest de los archivos normalizados más la configuración: dos
 * corridas con los mismos bytes de origen producen el mismo dataset.
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  getHistoryLeague,
  isHistoryLeagueId,
  DEFAULT_HISTORY_LEAGUES,
  HISTORY_LEAGUES,
  OPENFOOTBALL_SEASONS,
  type HistoryLeagueId,
} from "./leagues.js";
import { fetchTextCached, mapLimit, sha256 } from "./http.js";
import { normalizeNflverseHistory } from "./normalize-nflverse.js";
import { normalizeOpenFootballHistory } from "./normalize-openfootball.js";
import { auditHistory } from "./quality.js";
import { renderHistoryReport } from "./report.js";
import {
  HISTORY_SCHEMA_VERSION,
  HistoricalGameSchema,
  HistoryManifestSchema,
  type HistoricalGame,
  type HistoryManifest,
  type HistorySourceRecord,
} from "./schema.js";

export const NFLVERSE_HISTORY_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";
export const OPENFOOTBALL_HISTORY_BASE =
  "https://raw.githubusercontent.com/openfootball/football.json/master";

const SOURCE_META = {
  nflverse: {
    license: "CC-BY-4.0",
    attribution: "Datos: nflverse (nflverse-data, CC-BY 4.0)",
  },
  openfootball: {
    license: "CC0-1.0",
    attribution: "Datos: openfootball/football.json (CC0 1.0)",
  },
} as const;

export interface BuildHistoryOptions {
  rootDir: string;
  leagues?: readonly string[];
  soccerSeasons?: readonly string[];
  nflSeasons?: readonly number[];
  includePostseason?: boolean;
  offline?: boolean;
  concurrency?: number;
  reportDir?: string;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface BuildHistoryResult {
  manifest: HistoryManifest;
  datasetPath: string;
  manifestPath: string;
  reportPath: string;
  files: Array<{ league: string; path: string; rows: number }>;
}

function sortGames(games: readonly HistoricalGame[]): HistoricalGame[] {
  return [...games].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });
}

function writeJsonl(path: string, games: readonly HistoricalGame[]): { sha256: string; rows: number } {
  mkdirSync(join(path, ".."), { recursive: true });
  const body = games.map((game) => JSON.stringify(game)).join("\n") + "\n";
  writeFileSync(path, body, "utf8");
  return { sha256: sha256(body), rows: games.length };
}

function pruneStaleLeagueFiles(directory: string, keep: ReadonlySet<string>): string[] {
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

export async function buildHistoryDataset(options: BuildHistoryOptions): Promise<BuildHistoryResult> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((message: string) => console.log(message));
  const offline = options.offline ?? false;
  const includePostseason = options.includePostseason ?? true;
  const concurrency = options.concurrency ?? 4;

  const requestedLeagues = options.leagues ?? DEFAULT_HISTORY_LEAGUES;
  const leagueIds: HistoryLeagueId[] = requestedLeagues.map((id) => {
    if (!isHistoryLeagueId(id)) {
      throw new Error(
        `Liga desconocida '${id}'. Válidas: ${Object.keys(HISTORY_LEAGUES).join(", ")}.`,
      );
    }
    return id;
  });

  const soccerSeasons = options.soccerSeasons ?? OPENFOOTBALL_SEASONS;
  for (const season of soccerSeasons) {
    if (!(OPENFOOTBALL_SEASONS as readonly string[]).includes(season)) {
      throw new Error(
        `Temporada de fútbol desconocida '${season}'. Válidas: ${OPENFOOTBALL_SEASONS.join(", ")}.`,
      );
    }
  }

  const datasetDir = join(options.rootDir, "data", "history");
  const rawDir = join(datasetDir, "raw");
  const reportDir = options.reportDir ?? join(options.rootDir, "Reportes", "datos");
  mkdirSync(datasetDir, { recursive: true });

  const sources: HistorySourceRecord[] = [];
  const leagueGames = new Map<HistoryLeagueId, HistoricalGame[]>();
  const soccerLeagues = leagueIds.filter((id) => getHistoryLeague(id).source === "openfootball");
  const wantsNfl = leagueIds.includes("nfl");

  // 1. NFL (una sola descarga).
  if (wantsNfl) {
    log("[history] NFL: descargando nflverse games.csv…");
    const fetched = await fetchTextCached(
      NFLVERSE_HISTORY_URL,
      join(rawDir, "nflverse", "games.csv"),
      { offline, retries: 2 },
    );
    if (!fetched) throw new Error("nflverse games.csv no está disponible (HTTP 404).");

    sources.push({
      id: "nflverse-schedules",
      provider: "nflverse",
      url: NFLVERSE_HISTORY_URL,
      license: SOURCE_META.nflverse.license,
      attribution: SOURCE_META.nflverse.attribution,
      sha256: fetched.sha256,
      bytes: fetched.bytes,
      status: fetched.status,
      retrievedAt: fetched.retrievedAt,
    });

    const normalized = normalizeNflverseHistory(fetched.text, {
      includePostseason,
      ...(options.nflSeasons && options.nflSeasons.length > 0
        ? {
            fromSeason: Math.min(...options.nflSeasons),
            toSeason: Math.max(...options.nflSeasons),
          }
        : {}),
    });
    leagueGames.set("nfl", sortGames(normalized.games));
    log(
      `[history] NFL: ${normalized.games.length} partidos (${normalized.seasons[0]}–${normalized.seasons[normalized.seasons.length - 1]}), descartados ${normalized.skipped.withoutScore} sin marcador.`,
    );
  }

  // 2. Fútbol: una descarga por liga y temporada (los 404 son temporadas no publicadas).
  const tasks: Array<{ leagueId: HistoryLeagueId; season: string }> = [];
  for (const leagueId of soccerLeagues) {
    for (const season of soccerSeasons) tasks.push({ leagueId, season });
  }

  const results = await mapLimit(tasks, concurrency, async ({ leagueId, season }) => {
    const league = getHistoryLeague(leagueId);
    const code = league.openFootballCode!;
    const url = `${OPENFOOTBALL_HISTORY_BASE}/${season}/${code}.json`;
    const fetched = await fetchTextCached(url, join(rawDir, "openfootball", season, `${code}.json`), {
      offline,
      retries: 2,
    });
    return { leagueId, season, code, url, fetched };
  });

  for (const result of results) {
    const { leagueId, season, code, url, fetched } = result;
    if (!fetched) {
      sources.push({
        id: `openfootball-${code}-${season}`,
        provider: "openfootball",
        url,
        license: SOURCE_META.openfootball.license,
        attribution: SOURCE_META.openfootball.attribution,
        sha256: null,
        bytes: 0,
        status: "unavailable",
        retrievedAt: null,
      });
      continue;
    }

    sources.push({
      id: `openfootball-${code}-${season}`,
      provider: "openfootball",
      url,
      license: SOURCE_META.openfootball.license,
      attribution: SOURCE_META.openfootball.attribution,
      sha256: fetched.sha256,
      bytes: fetched.bytes,
      status: fetched.status,
      retrievedAt: fetched.retrievedAt,
    });

    const normalized = normalizeOpenFootballHistory(JSON.parse(fetched.text), {
      league: getHistoryLeague(leagueId),
      season,
    });
    const current = leagueGames.get(leagueId) ?? [];
    current.push(...normalized.games);
    leagueGames.set(leagueId, current);
  }

  // 3. Validación final por fila y orden determinista.
  for (const [leagueId, games] of leagueGames) {
    for (const game of games) {
      const parsed = HistoricalGameSchema.safeParse(game);
      if (!parsed.success) {
        throw new Error(
          `Fila inválida en '${leagueId}' (${game.id ?? "sin id"}): ${parsed.error.issues[0]?.message ?? "error de esquema"}.`,
        );
      }
    }
    leagueGames.set(leagueId, sortGames(games));
  }

  // 4. Auditoría de calidad.
  const auditInputs = [...leagueGames.entries()].map(([leagueId, games]) => ({
    league: getHistoryLeague(leagueId),
    games,
  }));
  const audit = auditHistory(auditInputs);
  const qualityByLeague = new Map(audit.leagues.map((quality) => [quality.league, quality]));

  // 5. Archivos por liga.
  const files: Array<{ league: string; path: string; rows: number; sha256: string }> = [];
  for (const [leagueId, games] of [...leagueGames.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const fileName = `${leagueId}.jsonl`;
    const path = join(datasetDir, fileName);
    const written = writeJsonl(path, games);
    files.push({ league: leagueId, path, rows: written.rows, sha256: written.sha256 });
  }
  const pruned = pruneStaleLeagueFiles(
    datasetDir,
    new Set(files.map((file) => `${file.league}.jsonl`)),
  );
  if (pruned.length > 0) log(`[history] Archivos obsoletos eliminados: ${pruned.join(", ")}`);

  // 6. Manifiesto.
  const seasons: Array<{ league: string; season: string }> = [];
  for (const quality of audit.leagues) {
    for (const season of quality.seasons) seasons.push({ league: quality.league, season: season.season });
  }

  const datasetId = sha256(
    JSON.stringify({
      schemaVersion: HISTORY_SCHEMA_VERSION,
      leagues: files.map((file) => ({
        league: file.league,
        rows: file.rows,
        sha256: file.sha256,
      })),
      config: {
        leagues: leagueIds,
        soccerSeasons,
        nflSeasons: options.nflSeasons ?? "all",
        includePostseason,
      },
    }),
  );

  const soccerSeasonsInData = [
    ...new Set(
      audit.leagues
        .filter((quality) => getHistoryLeague(quality.league).source === "openfootball")
        .flatMap((quality) => quality.seasons.map((season) => season.season)),
    ),
  ].sort();

  const nflSeasonsInData = (
    audit.leagues.find((quality) => quality.league === "nfl")?.seasons.map((season) => season.season) ?? []
  ).sort();

  const manifest: HistoryManifest = HistoryManifestSchema.parse({
    schemaVersion: HISTORY_SCHEMA_VERSION,
    datasetId,
    generatedAt: now().toISOString(),
    generatedBy: "services/ingest/history",
    window: { soccerSeasons: soccerSeasonsInData, nflSeasons: nflSeasonsInData },
    totals: {
      rows: audit.leagues.reduce((sum, quality) => sum + quality.rows, 0),
      leagues: audit.leagues.length,
      seasons: seasons.length,
      teams: audit.leagues.reduce((sum, quality) => sum + quality.teams, 0),
      sources: sources.length,
    },
    quality: audit.summary,
    leagues: files.map((file) => {
      const league = getHistoryLeague(file.league);
      const quality = qualityByLeague.get(file.league);
      if (!quality) throw new Error(`Falta la auditoría de '${file.league}'.`);
      return {
        id: league.id,
        name: league.name,
        sport: league.sport,
        productLeague: league.productLeague,
        file: `${file.league}.jsonl`,
        fileSha256: file.sha256,
        rows: file.rows,
        quality,
      };
    }),
    sources,
  });

  const manifestPath = join(datasetDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const reportPath = join(reportDir, "HISTORICO-QUALITY.md");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, renderHistoryReport(manifest), "utf8");

  return {
    manifest,
    datasetPath: datasetDir,
    manifestPath,
    reportPath,
    files: files.map((file) => ({ league: file.league, path: file.path, rows: file.rows })),
  };
}
