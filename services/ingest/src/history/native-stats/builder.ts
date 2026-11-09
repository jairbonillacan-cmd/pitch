/**
 * Constructor del dataset de enriquecimiento desde native-stats.org.
 *
 * Escribe en `data/history/research/native-stats/`:
 *
 *   competitions.jsonl          posiciones y calendario visible por competición
 *   teams.jsonl                 agregados de carrera, rachas y contexto por equipo
 *   matches.jsonl               detalle de partido (incluye marcador al descanso)
 *   half-time-corpus.jsonl      emparejamiento con el corpus: qué partido gana descanso
 *   form/<fecha>.jsonl          forma avanzada (percentiles) del día
 *   streak-boards.jsonl         rankings históricos de rachas
 *   manifest.json               procedencia, cobertura y resultado del cotejo
 *
 * Es un dataset **de investigación**: la fuente no publica licencia, así que no se
 * redistribuye ni alimenta el producto. Ver `docs/data/football/18-native-stats.md`.
 *
 * Ética de captura: se lee `robots.txt` antes de empezar y se aborta si prohíbe el
 * rastreo; se hacen peticiones secuenciales con pausa configurable y se cachean los bytes
 * originales para poder reprocesar sin volver a molestar al sitio.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fetchTextCached, sha256, sleep, type FetchedText } from "../http.js";
import { getHistoryLeague, isHistoryLeagueId, type HistoryLeagueId } from "../leagues.js";
import {
  parseAlltimeStreaksPage,
  parseCompetitionPage,
  parseFormPage,
  parseMatchPage,
  parseTeamPage,
  type ParsedCompetition,
  type ParsedFormRow,
  type ParsedMatch,
  type ParsedTeam,
} from "./parse.js";
import {
  findFixture,
  loadCorpus,
  seasonIdFromLabel,
  teamMatches,
  teamSeasonMatches,
  trailingStreak,
  type CorpusIndex,
} from "./join.js";
import {
  NATIVE_STATS_COMPETITIONS,
  buildTeamIndex,
  leagueForCompetition,
  resolveTeam,
  type TeamIndex,
} from "./resolve.js";
import {
  NATIVE_STATS_SCHEMA_VERSION,
  NATIVE_STATS_SOURCE,
  NativeStatsCompetitionSchema,
  NativeStatsFormRowSchema,
  NativeStatsManifestSchema,
  NativeStatsMatchSchema,
  NativeStatsStreakBoardSchema,
  NativeStatsTeamSchema,
  type NativeStatsCompetition,
  type NativeStatsFormRow,
  type NativeStatsLeagueReport,
  type NativeStatsManifest,
  type NativeStatsMatch,
  type NativeStatsStreakBoard,
  type NativeStatsStreakCheck,
  type NativeStatsTeam,
  type NativeStatsTeamRef,
} from "./schema.js";
import { renderNativeStatsReport } from "./report.js";

export interface BuildNativeStatsOptions {
  rootDir: string;
  /** Ligas del producto a cubrir; por defecto las seis de fútbol con competición. */
  leagues?: readonly string[];
  offline?: boolean;
  reportDir?: string;
  now?: () => Date;
  log?: (message: string) => void;
  /** Pausa entre peticiones reales (ms). La fuente es un sitio pequeño y comunitario. */
  requestDelayMs?: number;
  maxTeamsPerLeague?: number;
  maxMatchesPerLeague?: number;
  /** Captura la forma avanzada del día (`/betting`). */
  includeForm?: boolean;
  /** Lee las páginas de partido (marcador al descanso, goleadores, tarjetas). */
  includeMatches?: boolean;
  /** Lee el ranking histórico de rachas. */
  includeStreakBoards?: boolean;
}

export interface BuildNativeStatsResult {
  manifest: NativeStatsManifest;
  datasetPath: string;
  manifestPath: string;
  reportPath: string;
  files: Array<{ name: string; rows: number }>;
}

const SOCCER_LEAGUES: readonly HistoryLeagueId[] = [
  "premier-league",
  "la-liga",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "liga-mx",
];

const BASE_URL = NATIVE_STATS_SOURCE;
const USER_AGENT = "PitchLab-Research/0.1 (+https://pitchlab.mx; dataset de investigación)";

function sortBy<T>(items: readonly T[], ...keys: Array<(item: T) => string | number>): T[] {
  return [...items].sort((a, b) => {
    for (const key of keys) {
      const left = key(a);
      const right = key(b);
      if (left === right) continue;
      if (typeof left === "number" && typeof right === "number") return left - right;
      return String(left).localeCompare(String(right));
    }
    return 0;
  });
}

function writeJsonl(path: string, rows: readonly unknown[]): { sha256: string; rows: number } {
  mkdirSync(join(path, ".."), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
  writeFileSync(path, body, "utf8");
  return { sha256: sha256(body), rows: rows.length };
}

interface CapturedPage {
  text: string;
  sha256: string;
  bytes: number;
  status: "fetched" | "cached";
  /** Fecha de la captura original: se conserva en caché para que `--offline` sea idéntico. */
  retrievedAt: string;
}

interface PageFetcher {
  get(path: string, label: string): Promise<CapturedPage | null>;
  stats(): { retrieved: number; cached: number; bytes: number };
}

function createFetcher(options: {
  cacheDir: string;
  offline: boolean;
  delayMs: number;
  log: (message: string) => void;
}): PageFetcher {
  let retrieved = 0;
  let cached = 0;
  let bytes = 0;

  return {
    async get(path: string, label: string): Promise<CapturedPage | null> {
      const url = `${BASE_URL}${path}`;
      const cachePath = join(options.cacheDir, `${label}.html`);
      const metaPath = `${cachePath}.meta.json`;
      const unavailablePath = `${cachePath}.unavailable`;

      // Una página que el sitio responde con 5xx deja constancia de su ausencia para que
      // `--offline` reproduzca la misma corrida en vez de abortar por un hueco que no se
      // puede llenar.
      if (existsSync(unavailablePath) && !existsSync(cachePath)) {
        options.log(`[native-stats] página marcada como no disponible: ${url}`);
        return null;
      }

      let result: FetchedText | null;
      try {
        result = await fetchTextCached(url, cachePath, {
          offline: options.offline,
          retries: 2,
          userAgent: USER_AGENT,
        });
      } catch (error) {
        // En offline un hueco de caché es un error de configuración y se propaga; en
        // línea, una página que responde 5xx se declara ausente y la corrida sigue.
        if (options.offline) throw error;
        const message = error instanceof Error ? error.message : String(error);
        mkdirSync(options.cacheDir, { recursive: true });
        writeFileSync(
          unavailablePath,
          `${new Date().toISOString()} ${message.split("\n")[0]} ${url}\n`,
          "utf8",
        );
        options.log(`[native-stats] página no disponible (${message.split("\n")[0]}): ${url}`);
        return null;
      }
      if (!result) {
        options.log(`[native-stats] sin datos: ${url}`);
        return null;
      }

      let retrievedAt: string;
      if (result.status === "fetched") {
        retrievedAt = result.retrievedAt ?? new Date().toISOString();
        mkdirSync(options.cacheDir, { recursive: true });
        writeFileSync(metaPath, JSON.stringify({ url, retrievedAt }) + "\n", "utf8");
        retrieved += 1;
        await sleep(options.delayMs);
      } else {
        retrievedAt = readCaptureTime(metaPath, cachePath);
        cached += 1;
      }
      bytes += result.bytes;
      return { ...result, retrievedAt };
    },
    stats() {
      return { retrieved, cached, bytes };
    },
  };
}

/** Fecha de captura guardada junto a la caché; si falta, la del archivo. */
function readCaptureTime(metaPath: string, cachePath: string): string {
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { retrievedAt?: string };
      if (meta.retrievedAt) return meta.retrievedAt;
    } catch {
      // Metadato ilegible: se cae a la fecha del archivo, que sigue siendo prueba de captura.
    }
  }
  try {
    return statSync(cachePath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Comprueba `robots.txt` antes de rastrear. Devuelve `false` solo si el grupo `*`
 * prohíbe explícitamente la raíz; cualquier otra cosa se considera permitida.
 */
export function robotsAllowsCrawling(robotsText: string): boolean {
  let inStarGroup = false;
  for (const rawLine of robotsText.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      inStarGroup = value === "*";
      continue;
    }
    if (inStarGroup && field === "disallow" && (value === "/" || value === "/*")) {
      return false;
    }
  }
  return true;
}

function toTeamRef(team: { teamId: number; name: string; code: string } | null): NativeStatsTeamRef | null {
  if (!team) return null;
  return {
    nativeId: team.teamId,
    name: team.name,
    code: team.code || team.name.slice(0, 3).toUpperCase(),
  };
}

function sourceOf(fetched: CapturedPage, path: string) {
  return {
    url: `${BASE_URL}${path}`,
    retrievedAt: fetched.retrievedAt,
    sha256: fetched.sha256,
  };
}

interface LeagueWork {
  league: HistoryLeagueId;
  competitionCode: string;
  competition: ParsedCompetition;
  competitionSource: ReturnType<typeof sourceOf>;
  teamIds: number[];
  matchIds: number[];
}

export async function buildNativeStatsDataset(
  options: BuildNativeStatsOptions,
): Promise<BuildNativeStatsResult> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((message: string) => console.log(message));
  const offline = options.offline ?? false;
  const delayMs = options.requestDelayMs ?? 400;
  const maxTeams = options.maxTeamsPerLeague ?? 24;
  const maxMatches = options.maxMatchesPerLeague ?? 20;
  const includeForm = options.includeForm ?? true;
  const includeMatches = options.includeMatches ?? true;
  const includeStreakBoards = options.includeStreakBoards ?? true;

  const requested = options.leagues ?? SOCCER_LEAGUES;
  const leagueIds = requested.map((id) => {
    if (!isHistoryLeagueId(id) || !SOCCER_LEAGUES.includes(id)) {
      throw new Error(
        `Liga sin competición en native-stats: '${id}'. Válidas: ${SOCCER_LEAGUES.join(", ")}.`,
      );
    }
    return id;
  });

  const datasetDir = join(options.rootDir, "data", "history", "research", "native-stats");
  const cacheDir = join(options.rootDir, "data", "history", "raw", "native-stats");
  const reportDir = options.reportDir ?? join(options.rootDir, "Reportes", "datos");
  mkdirSync(datasetDir, { recursive: true });

  const fetcher = createFetcher({ cacheDir, offline, delayMs, log });

  const robots = await fetcher.get("/robots.txt", "robots");
  if (robots && !robotsAllowsCrawling(robots.text)) {
    throw new Error(
      "native-stats.org prohíbe el rastreo en robots.txt; no se descarga nada. " +
        "El dataset se puede regenerar con --offline si ya hay caché.",
    );
  }

  const corpus = loadCorpus(options.rootDir, leagueIds);
  log(`[native-stats] corpus: ${corpus.rows} partidos, ${corpus.teams.size} equipos`);

  const competitions: NativeStatsCompetition[] = [];
  const work: LeagueWork[] = [];
  const codeByLeague = new Map<HistoryLeagueId, string>();
  for (const [code, league] of Object.entries(NATIVE_STATS_COMPETITIONS)) {
    codeByLeague.set(league, code);
  }

  for (const league of leagueIds) {
    const code = codeByLeague.get(league);
    if (!code) continue;
    const fetched = await fetcher.get(`/competition/${code}`, `competition-${code}`);
    if (!fetched) continue;
    const competition = parseCompetitionPage(fetched.text, code);
    log(
      `[native-stats] ${league} (${code}): ${competition.standings.length} equipos en tabla, ` +
        `${competition.matches.length} partidos visibles`,
    );
    work.push({
      league,
      competitionCode: code,
      competition,
      competitionSource: sourceOf(fetched, `/competition/${code}`),
      teamIds: [],
      matchIds: [],
    });
  }

  // Índice de equipos canónicos para resolver nombres de la fuente.
  const teamIndex: TeamIndex = buildTeamIndex(corpus.teams);

  const teams: NativeStatsTeam[] = [];
  const teamSources = new Map<number, { team: ParsedTeam; source: ReturnType<typeof sourceOf> }>();
  const unresolvedNames = new Map<HistoryLeagueId, Set<string>>();

  for (const item of work) {
    const { league, competitionCode, competition } = item;
    const seen = new Set<number>();
    const ordered: number[] = [];
    for (const standing of competition.standings) seen.add(standing.team.teamId);
    for (const match of competition.matches) {
      if (match.home) seen.add(match.home.teamId);
      if (match.away) seen.add(match.away.teamId);
      if (match.matchId) item.matchIds.push(match.matchId);
    }
    for (const standing of competition.standings) ordered.push(standing.team.teamId);
    for (const id of seen) if (!ordered.includes(id)) ordered.push(id);
    item.teamIds = ordered.slice(0, maxTeams);

    competitions.push(
      NativeStatsCompetitionSchema.parse({
        league,
        competitionCode,
        name: competition.name,
        seasonLabel: competition.seasonLabel,
        seasons: competition.seasons,
        standings: competition.standings.map((standing) => {
          const resolution = resolveTeam(teamIndex, competitionCode, standing.team.name);
          return {
            position: standing.position,
            teamId: resolution.teamId,
            nativeId: standing.team.teamId,
            name: standing.team.name,
            code: standing.team.code,
            played: standing.played,
            points: standing.points,
            goalDiff: standing.goalDiff,
            goalsFor: standing.goalsFor,
            goalsAgainst: standing.goalsAgainst,
          };
        }),
        source: item.competitionSource,
      }),
    );
  }

  for (const item of work) {
    for (const teamId of item.teamIds) {
      const fetched = await fetcher.get(`/team/${teamId}`, `team-${teamId}`);
      if (!fetched) continue;
      const parsed = parseTeamPage(fetched.text, teamId);
      teamSources.set(teamId, {
        team: parsed,
        source: sourceOf(fetched, `/team/${teamId}`),
      });
    }
    log(`[native-stats] ${item.league}: ${item.teamIds.length} páginas de equipo`);
  }

  for (const item of work) {
    const unresolved = unresolvedNames.get(item.league) ?? new Set<string>();
    for (const teamId of item.teamIds) {
      const entry = teamSources.get(teamId);
      if (!entry) continue;
      const { team, source } = entry;
      const name = team.name ?? `Equipo ${teamId}`;
      const resolution = resolveTeam(teamIndex, item.competitionCode, name);
      if (!resolution.teamId) unresolved.add(name);
      teams.push(
        NativeStatsTeamSchema.parse({
          teamId: resolution.teamId,
          nativeId: teamId,
          name,
          code:
            item.competition.standings.find((standing) => standing.team.teamId === teamId)?.team
              .code ?? name.slice(0, 3).toUpperCase(),
          league: item.league,
          competitionCode: item.competitionCode,
          scopeCode: team.scopeCode,
          crest: team.crest,
          overview: team.overview,
          aggregates: team.aggregates,
          streaks: team.streaks,
          source,
        }),
      );
    }
    unresolvedNames.set(item.league, unresolved);
  }

  // Partidos: los que la fuente enlaza desde la competición y los ya jugados del día.
  const matchRows: NativeStatsMatch[] = [];
  const halfTimePatches: Array<{
    corpusGameId: string;
    league: string;
    date: string;
    halfTimeHomeScore: number;
    halfTimeAwayScore: number;
    nativeMatchId: number;
    sourceUrl: string;
  }> = [];
  const seenMatches = new Set<number>();

  const captureMatch = async (
    matchId: number,
    leagueHint: string,
    competitionCode: string,
  ): Promise<NativeStatsMatch | null> => {
    if (seenMatches.has(matchId)) return null;
    seenMatches.add(matchId);
    const fetched = await fetcher.get(`/match/${matchId}`, `match-${matchId}`);
    if (!fetched) return null;
    const parsed = parseMatchPage(fetched.text, matchId);
    const source = sourceOf(fetched, `/match/${matchId}`);
    const matchLeague = parsed.competitionCode
      ? leagueForCompetition(parsed.competitionCode) ?? leagueHint
      : leagueHint;
    const row = buildMatchRow(parsed, matchLeague, source, corpus, (name) => {
      const resolution = resolveTeam(teamIndex, competitionCode, name);
      return resolution.teamId;
    });
    matchRows.push(row);
    if (row.addsHalfTime && row.corpusGameId && row.halfTime && row.date) {
      halfTimePatches.push({
        corpusGameId: row.corpusGameId,
        league: matchLeague,
        date: row.date,
        halfTimeHomeScore: row.halfTime.home,
        halfTimeAwayScore: row.halfTime.away,
        nativeMatchId: matchId,
        sourceUrl: source.url,
      });
    }
    return row;
  };

  if (includeMatches) {
    for (const item of work) {
      const ids = item.matchIds.slice(0, maxMatches);
      let withHalfTime = 0;
      for (const matchId of ids) {
        const row = await captureMatch(matchId, item.league, item.competitionCode);
        if (row?.halfTime) withHalfTime += 1;
      }
      log(`[native-stats] ${item.league}: ${ids.length} partidos, ${withHalfTime} con descanso`);
    }
  }

  // Forma avanzada del día.
  const formRows: NativeStatsFormRow[] = [];
  let formDate: string | null = null;
  if (includeForm) {
    const fetched = await fetcher.get("/betting", "betting");
    if (fetched) {
      const page = parseFormPage(fetched.text);
      formDate = page.pageDate ?? now().toISOString().slice(0, 10);
      const source = sourceOf(fetched, "/betting");
      for (const row of page.rows) {
        if (!row.home || !row.away) continue;
        const league = leagueForCompetition(row.competitionCode);
        if (!league || !leagueIds.includes(league)) continue;
        const homeResolution = resolveTeam(teamIndex, row.competitionCode, row.home.name);
        const awayResolution = resolveTeam(teamIndex, row.competitionCode, row.away.name);
        const date = row.date ?? formDate;
        const corpusMatch =
          homeResolution.teamId && awayResolution.teamId
            ? findFixture(corpus, league, date, homeResolution.teamId, awayResolution.teamId)
            : null;
        formRows.push(
          NativeStatsFormRowSchema.parse({
            date,
            league,
            competitionCode: row.competitionCode,
            nativeMatchId: row.matchId,
            status: row.status,
            kickoff: row.time,
            home: toTeamRef(row.home),
            away: toTeamRef(row.away),
            score: row.score,
            odds: row.odds && row.odds.home && row.odds.draw && row.odds.away
              ? { home: row.odds.home, draw: row.odds.draw, away: row.odds.away }
              : null,
            metrics: row.metrics,
            corpusGameId: corpusMatch?.id ?? null,
            source,
            usage: "research-only",
          }),
        );
      }
      log(`[native-stats] forma ${formDate}: ${formRows.length} partidos de las ligas cubiertas`);
    }
  }

  // Los partidos de hoy ya jugados son la única vía para capturar su marcador al
  // descanso: así se construye hacia adelante el histórico de descansos que el corpus
  // no tiene cuando ese partido entre en él.
  if (includeMatches) {
    const finished = formRows.filter(
      (row): row is NativeStatsFormRow & { nativeMatchId: number } =>
        row.status === "finished" && row.nativeMatchId !== null,
    );
    let captured = 0;
    for (const row of finished.slice(0, maxMatches)) {
      const result = await captureMatch(row.nativeMatchId, row.league, row.competitionCode);
      if (result?.halfTime) captured += 1;
    }
    if (finished.length > 0) {
      log(`[native-stats] partidos jugados del día: ${captured}/${finished.length} con descanso`);
    }
  }

  // Ranking histórico de rachas (un tablero global del sitio).
  const streakBoards: NativeStatsStreakBoard[] = [];
  if (includeStreakBoards) {
    const fetched = await fetcher.get("/alltime-streaks", "alltime-streaks");
    if (fetched) {
      const source = sourceOf(fetched, "/alltime-streaks");
      for (const board of parseAlltimeStreaksPage(fetched.text)) {
        streakBoards.push(
          NativeStatsStreakBoardSchema.parse({
            league: "all",
            competitionCode: null,
            entries: board.entries.map((entry) => ({
              rank: entry.rank,
              nativeId: entry.team?.teamId ?? null,
              name: entry.team?.name ?? null,
              code: entry.team?.code ?? null,
              days: entry.days,
              matches: entry.matches,
              periodStart: entry.periodStart,
              periodEnd: entry.periodEnd,
            })),
            source,
          }),
        );
      }
      log(
        `[native-stats] rachas históricas: ${streakBoards.reduce((total, board) => total + board.entries.length, 0)} entradas`,
      );
    }
  }

  // Cotejo de rachas contra el corpus.
  const leagueReports: NativeStatsLeagueReport[] = [];
  for (const item of work) {
    const leagueTeams = teams.filter((team) => team.league === item.league);
    const leagueMatches = matchRows.filter((match) => match.league === item.league);
    const checks: NativeStatsStreakCheck[] = [];
    const seasonLabel = item.competition.seasonLabel;
    const seasonId = seasonIdFromLabel(seasonLabel);

    // Auditoría de completitud: cuántos partidos declara jugados la fuente en la
    // temporada frente a los que el corpus tiene para ese equipo.
    const playedByNative = new Map<number, number>();
    for (const standing of item.competition.standings) {
      if (standing.played !== null) playedByNative.set(standing.team.teamId, standing.played);
    }
    const measured = new Map<string, number>();
    const behind = new Map<string, { nativePlayed: number; corpusPlayed: number; missing: number }>();
    for (const team of leagueTeams) {
      if (!team.teamId || !seasonId) continue;
      const nativePlayed = playedByNative.get(team.nativeId);
      if (nativePlayed === undefined) continue;
      const corpusPlayed = teamSeasonMatches(corpus, item.league, team.teamId, seasonId).length;
      measured.set(team.teamId, nativePlayed);
      const missingForTeam = nativePlayed - corpusPlayed;
      if (missingForTeam > 0) {
        behind.set(team.teamId, { nativePlayed, corpusPlayed, missing: missingForTeam });
      }
    }

    for (const team of leagueTeams) {
      if (!team.teamId) continue;
      const scopeLeague = team.scopeCode ? leagueForCompetition(team.scopeCode) : null;
      const matches = teamMatches(corpus, item.league, team.teamId);
      const lastCorpusDate = matches.length > 0 ? matches[matches.length - 1]!.date : null;
      const gapForTeam = behind.get(team.teamId) ?? null;
      const corpusPlayed = seasonId
        ? teamSeasonMatches(corpus, item.league, team.teamId, seasonId).length
        : null;
      const sourcePlayed = playedByNative.get(team.nativeId) ?? null;
      const missing = gapForTeam?.missing ?? 0;
      for (const streak of team.streaks) {
        if (scopeLeague !== item.league) {
          checks.push({
            teamId: team.teamId,
            key: streak.key,
            native: streak.current.total,
            corpus: null,
            agrees: null,
            reason: `la fuente agrega sobre ${team.scopeCode ?? "otra competición"}, no sobre ${item.competitionCode}`,
          });
          continue;
        }
        if (missing > 0) {
          checks.push({
            teamId: team.teamId,
            key: streak.key,
            native: streak.current.total,
            corpus: null,
            agrees: null,
            reason: `el corpus tiene ${corpusPlayed} de ${sourcePlayed} partidos de ${seasonLabel ?? "la temporada"}`,
          });
          continue;
        }
        if (/ht_lead|ht_trail/.test(streak.key)) {
          checks.push({
            teamId: team.teamId,
            key: streak.key,
            native: streak.current.total,
            corpus: null,
            agrees: null,
            reason: "necesita marcador al descanso; el corpus no lo tiene para toda la serie",
          });
          continue;
        }
        const computed = trailingStreak(matches, team.teamId, streak.key);
        if (computed === null) {
          checks.push({
            teamId: team.teamId,
            key: streak.key,
            native: streak.current.total,
            corpus: null,
            agrees: null,
            reason: "definición no implementada",
          });
          continue;
        }
        checks.push({
          teamId: team.teamId,
          key: streak.key,
          native: streak.current.total,
          corpus: computed,
          agrees: streak.current.total === computed,
          reason: streak.current.total === computed
            ? null
            : `no coincide; último partido del corpus: ${lastCorpusDate ?? "sin partidos"}`,
        });
      }
    }

    const compared = checks.filter((check) => check.agrees !== null);
    const disagreements = checkedDisagreements(checks);
    leagueReports.push({
      id: item.league,
      competitionCode: item.competitionCode,
      teams: leagueTeams.length,
      matchedTeams: leagueTeams.filter((team) => team.teamId !== null).length,
      unmatchedNames: [...(unresolvedNames.get(item.league) ?? [])].sort(),
      matches: leagueMatches.length,
      joinedMatches: leagueMatches.filter((match) => match.corpusGameId !== null).length,
      scoreConfirmed: leagueMatches.filter((match) => match.corpusScoreMatches === true).length,
      halfTimeAdded: halfTimePatches.filter((patch) => patch.league === item.league).length,
      halfTimeCaptured: leagueMatches.filter((match) => match.halfTime !== null).length,
      halfTimeConflicts: leagueMatches.filter(
        (match) =>
          match.halfTime !== null &&
          match.score !== null &&
          (match.halfTime.home > match.score.home || match.halfTime.away > match.score.away),
      ).length,
      formRows: formRows.filter((row) => row.league === item.league).length,
      corpusCoverage: {
        seasonLabel: item.competition.seasonLabel,
        seasonId: seasonIdFromLabel(item.competition.seasonLabel),
        teamsMeasured: measured.size,
        teamsBehind: behind.size,
        missingTeamAppearances: [...behind.values()].reduce((total, gap) => total + gap.missing, 0),
        approximateMissingMatches: Math.round(
          [...behind.values()].reduce((total, gap) => total + gap.missing, 0) / 2,
        ),
        gaps: [...behind.entries()]
          .map(([teamId, gap]) => ({ teamId, ...gap }))
          .sort((a, b) => b.missing - a.missing || a.teamId.localeCompare(b.teamId))
          .slice(0, 20),
      },
      streakChecks: {
        compared: compared.length,
        agree: compared.filter((check) => check.agrees === true).length,
        disagree: compared.filter((check) => check.agrees === false).length,
        notComparable: checks.filter((check) => check.agrees === null).length,
        disagreements,
      },
    });
  }

  // Escritura.
  const files: Array<{ name: string; rows: number; sha256: string }> = [];
  const competitionsFile = writeJsonl(
    join(datasetDir, "competitions.jsonl"),
    sortBy(competitions, (row) => row.league),
  );
  files.push({ name: "competitions.jsonl", rows: competitionsFile.rows, sha256: competitionsFile.sha256 });

  const teamsFile = writeJsonl(
    join(datasetDir, "teams.jsonl"),
    sortBy(teams, (row) => row.league, (row) => row.name),
  );
  files.push({ name: "teams.jsonl", rows: teamsFile.rows, sha256: teamsFile.sha256 });

  const matchesFile = writeJsonl(
    join(datasetDir, "matches.jsonl"),
    sortBy(matchRows, (row) => row.league, (row) => row.date ?? ""),
  );
  files.push({ name: "matches.jsonl", rows: matchesFile.rows, sha256: matchesFile.sha256 });

  const halfTimeFile = writeJsonl(
    join(datasetDir, "half-time-corpus.jsonl"),
    sortBy(halfTimePatches, (row) => row.league, (row) => row.date),
  );
  files.push({ name: "half-time-corpus.jsonl", rows: halfTimeFile.rows, sha256: halfTimeFile.sha256 });

  const formFile = writeJsonl(
    join(datasetDir, "form", `${formDate ?? now().toISOString().slice(0, 10)}.jsonl`),
    sortBy(formRows, (row) => row.league, (row) => row.home?.name ?? ""),
  );
  files.push({
    name: `form/${formDate ?? now().toISOString().slice(0, 10)}.jsonl`,
    rows: formFile.rows,
    sha256: formFile.sha256,
  });

  const boardsFile = writeJsonl(
    join(datasetDir, "streak-boards.jsonl"),
    sortBy(streakBoards, (row) => row.league),
  );
  files.push({ name: "streak-boards.jsonl", rows: boardsFile.rows, sha256: boardsFile.sha256 });

  const pageStats = fetcher.stats();
  const datasetId = sha256(
    JSON.stringify({
      schemaVersion: NATIVE_STATS_SCHEMA_VERSION,
      corpusDatasetId: corpus.datasetId,
      files: files.map((file) => ({ name: file.name, rows: file.rows, sha256: file.sha256 })),
    }),
  );

  const totals = leagueReports.reduce(
    (acc, league) => ({
      teams: acc.teams + league.teams,
      matchedTeams: acc.matchedTeams + league.matchedTeams,
      matches: acc.matches + league.matches,
      halfTimeAdded: acc.halfTimeAdded + league.halfTimeAdded,
      halfTimeCaptured: acc.halfTimeCaptured + league.halfTimeCaptured,
      formRows: acc.formRows + league.formRows,
      compared: acc.compared + league.streakChecks.compared,
      disagreed: acc.disagreed + league.streakChecks.disagree,
      missingTeamAppearances: acc.missingTeamAppearances + league.corpusCoverage.missingTeamAppearances,
      approximateMissingMatches:
        acc.approximateMissingMatches + league.corpusCoverage.approximateMissingMatches,
      teamsBehind: acc.teamsBehind + league.corpusCoverage.teamsBehind,
    }),
    {
      teams: 0,
      matchedTeams: 0,
      matches: 0,
      halfTimeAdded: 0,
      halfTimeCaptured: 0,
      formRows: 0,
      compared: 0,
      disagreed: 0,
      missingTeamAppearances: 0,
      approximateMissingMatches: 0,
      teamsBehind: 0,
    },
  );

  const manifest: NativeStatsManifest = NativeStatsManifestSchema.parse({
    schemaVersion: NATIVE_STATS_SCHEMA_VERSION,
    datasetId,
    generatedAt: now().toISOString(),
    generatedBy: "services/ingest/history/native-stats",
    source: {
      site: NATIVE_STATS_SOURCE,
      underlyingProvider: "football-data.org",
      license: "research-only",
      robotsAllowsCrawl: robots === null || robotsAllowsCrawling(robots.text),
      pagesRetrieved: pageStats.retrieved,
      pagesCached: pageStats.cached,
      bytes: pageStats.bytes,
    },
    corpus: {
      datasetId: corpus.datasetId,
      rows: corpus.rows,
      rowsWithHalfTime: loadCorpusHalfTimeCount(options.rootDir, leagueIds),
    },
    totals: {
      leagues: leagueReports.length,
      teams: totals.teams,
      matchedTeams: totals.matchedTeams,
      matches: totals.matches,
      halfTimeAdded: totals.halfTimeAdded,
      halfTimeCaptured: totals.halfTimeCaptured,
      formRows: totals.formRows,
      teamsBehind: totals.teamsBehind,
      missingTeamAppearances: totals.missingTeamAppearances,
      approximateMissingMatches: totals.approximateMissingMatches,
      streakChecksCompared: totals.compared,
      streakChecksDisagreed: totals.disagreed,
    },
    files: {
      competitions: "competitions.jsonl",
      teams: "teams.jsonl",
      matches: "matches.jsonl",
      form: `form/${formDate ?? now().toISOString().slice(0, 10)}.jsonl`,
      streakBoards: "streak-boards.jsonl",
    },
    leagues: leagueReports,
    notes: [
      "Dataset de investigación: native-stats.org no publica licencia y sus datos derivan de football-data.org. No se publica ni se redistribuye.",
      "Los bytes originales de cada página quedan en data/history/raw/native-stats/ para reprocesar con --offline sin volver a pedirlos.",
      "El marcador al descanso es el único campo que el corpus no puede derivar por sí solo: half-time-corpus.jsonl lo entrega emparejado por id de partido.",
      "Las rachas se comparan con la misma definición sobre el corpus; una discrepancia señala un hueco de datos o una definición distinta, no se corrige sola.",
      "La forma avanzada es una foto del día de captura: sirve como referencia as-of, nunca como dato previo al partido de días anteriores.",
    ],
  });

  const manifestPath = join(datasetDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const reportPath = join(reportDir, "NATIVE-STATS.md");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, renderNativeStatsReport(manifest), "utf8");

  return {
    manifest,
    datasetPath: datasetDir,
    manifestPath,
    reportPath,
    files: files.map((file) => ({ name: file.name, rows: file.rows })),
  };
}

function buildMatchRow(
  parsed: ParsedMatch,
  league: string,
  source: ReturnType<typeof sourceOf>,
  corpus: CorpusIndex,
  resolveName: (name: string) => string | null,
): NativeStatsMatch {
  const homeRef = toTeamRef(parsed.home);
  const awayRef = toTeamRef(parsed.away);
  const homeTeamId = homeRef ? resolveName(homeRef.name) : null;
  const awayTeamId = awayRef ? resolveName(awayRef.name) : null;
  const corpusMatch =
    homeTeamId && awayTeamId && parsed.date
      ? findFixture(corpus, league, parsed.date, homeTeamId, awayTeamId)
      : null;

  const sameScore =
    corpusMatch && parsed.score
      ? corpusMatch.homeScore === parsed.score.home && corpusMatch.awayScore === parsed.score.away
      : null;

  return NativeStatsMatchSchema.parse({
    nativeMatchId: parsed.matchId,
    league,
    competitionCode: parsed.competitionCode ?? "",
    date: parsed.date,
    kickoff: parsed.time,
    home: homeRef,
    away: awayRef,
    score: parsed.score,
    halfTime: parsed.halfTime,
    status: parsed.score ? "finished" : "scheduled",
    goals: parsed.goals.map((goal) => ({
      minute: goal.minute,
      team: goal.team,
      scorer: goal.scorer,
      assist: goal.assist,
      score: goal.score,
    })),
    bookings: parsed.bookings,
    substitutions: parsed.substitutions,
    corpusGameId: corpusMatch?.id ?? null,
    corpusScoreMatches: sameScore,
    addsHalfTime: parsed.halfTime !== null && sameScore === true,
    source,
  });
}

function checkedDisagreements(checks: readonly NativeStatsStreakCheck[]): NativeStatsStreakCheck[] {
  return checks
    .filter((check) => check.agrees === false)
    .sort((a, b) => a.teamId.localeCompare(b.teamId) || a.key.localeCompare(b.key))
    .slice(0, 25);
}

function loadCorpusHalfTimeCount(rootDir: string, leagues: readonly string[]): number {
  let count = 0;
  for (const league of leagues) {
    const file = join(rootDir, "data", "history", `${league}.jsonl`);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const row = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof row.halfTimeHomeScore === "number" && typeof row.halfTimeAwayScore === "number") {
        count += 1;
      }
    }
  }
  return count;
}

/** Nombre legible de liga para CLI y reportes. */
export function leagueLabel(league: string): string {
  return isHistoryLeagueId(league) ? getHistoryLeague(league).name : league;
}
