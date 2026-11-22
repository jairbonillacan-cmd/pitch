/**
 * Parte 1 + Parte 3 · Ensamblador y regenerador seguro de:
 *   - `data/odds_timeseries/quotes_latest.json` (serie viva `< 72 h` de cuotas auditadas)
 *   - `packages/spacetime/data/live_matchday_v3_snapshot.json` (`MatchOutlook[]` consumido por la app)
 *
 * Regla innegociable: si la validación común (Parte 3) rechaza el candidato o un lote falla,
 * se conserva intacto el archivo anterior en disco.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getTeamAsset } from "@pitchlab/sports-assets";
import {
  OUTLOOK_SCHEMA_VERSION,
  SERVICE_CONSTANTS_V3_2,
  SHARP_SCRAPED_FALLBACK_ORDER,
  buildMatchOutlook,
  buildTeamMasterIndex,
  synthesizeFootballSnapshotRowFromMaster,
  synthesizeNflSnapshotRowFromMaster,
  type LiveMatchupEdgeRecord,
  type MatchOutlook,
  type ModelArtifact,
  type NFLLiveArtifactConfig,
  type NFLModelArtifact,
  type OddsSnapshotRow,
  type TeamMasterFeatureRecord,
} from "@pitchlab/spacetime";
import type { CanonicalLeague } from "../mappings.js";
import {
  parseStrictIsoMs,
  validateLiveOddsSnapshotCandidate,
  validateOddsTickBatch,
  type LiveMatchdaySnapshotPayload,
  type ValidationIssue,
} from "../validation/snapshot-validator.js";
import { loadUpcomingMatchesFromSnapshots, type UpcomingLeagueMatchInfo } from "./cadence-scheduler.js";

export const QUOTES_LATEST_SCHEMA_VERSION = "quotes_latest_v1.0.0";
export const DEFAULT_MAX_QUOTE_AGE_HOURS = 72;

export interface QuotesTimeseriesLedger {
  readonly schema_version: typeof QUOTES_LATEST_SCHEMA_VERSION;
  readonly updated_at_utc: string;
  readonly max_quote_age_hours: number;
  readonly active_sources: readonly string[];
  readonly ticks: readonly OddsSnapshotRow[];
}

export const APP_LEAGUE_TO_V3: Readonly<Record<string, string>> = {
  nfl: "nfl",
  "premier-league": "epl",
  laliga: "laliga",
  bundesliga: "bundesliga",
  "serie-a": "serie-a",
  "ligue-1": "ligue-1",
  "liga-mx": "liga-mx",
  "champions-league": "champions",
  mls: "mls",
  segunda: "segunda",
  championship: "championship",
};

const V3_LEAGUE_TO_APP: Readonly<Record<string, CanonicalLeague>> = {
  nfl: "nfl",
  epl: "premier-league",
  "premier-league": "premier-league",
  laliga: "laliga",
  bundesliga: "bundesliga",
  "serie-a": "serie-a",
  "ligue-1": "ligue-1",
  "liga-mx": "liga-mx",
  MEX: "liga-mx",
  E0: "premier-league",
  SP1: "laliga",
  D1: "bundesliga",
  I1: "serie-a",
  F1: "ligue-1",
  NFL: "nfl",
};

const SOCCER_V3_TO_DIV: Readonly<Record<string, string>> = {
  bundesliga: "D1",
  epl: "E0",
  laliga: "SP1",
  "liga-mx": "MEX",
  "ligue-1": "F1",
  "serie-a": "I1",
};

const SHARP_BOOKS_SET = new Set<string>(SHARP_SCRAPED_FALLBACK_ORDER);

const TEAM_ALIASES: Readonly<Record<string, string>> = {
  "chivas guadalajara": "guadalajara",
  chivas: "guadalajara",
  "xolos tijuana": "tijuana",
  "racing santander": "real racing",
};

const TOKEN_ALIASES: Readonly<Record<string, string>> = {
  munchen: "munich",
  koln: "colonia",
  frankfurt: "francfort",
  freiburg: "friburgo",
  augsburg: "augsburgo",
  hamburger: "hamburgo",
  strasbourg: "estrasburgo",
  lyonnais: "lyon",
  marseille: "marsella",
  nice: "niza",
  monaco: "monaco",
  napoli: "napoles",
  internazionale: "inter",
  milano: "milan",
  bologna: "bolonia",
  juventus: "juventus",
};

const GENERIC_TEAM_TOKENS = new Set([
  "fc",
  "cf",
  "cd",
  "ac",
  "as",
  "afc",
  "sv",
  "vfl",
  "vfb",
  "rc",
  "rcd",
  "ssc",
  "us",
  "club",
  "de",
  "del",
  "la",
  "calcio",
  "sc",
  "ca",
  "ud",
  "sd",
  "ogc",
  "tsg",
  "bv",
  "bsc",
  "fsv",
  "1",
  "1899",
  "1900",
  "1904",
  "1907",
  "1909",
  "1913",
  "1846",
  "1848",
  "04",
  "05",
  "07",
  "09",
  "29",
  "and",
  "es",
  "estac",
  "osc",
  "losc",
  "bc",
  "alsace",
]);

function normalizeTokens(raw: string): string[] {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0 && !GENERIC_TEAM_TOKENS.has(t))
    .map((t) => TOKEN_ALIASES[t] ?? t);
}

function aliasTokens(raw: string): string[] {
  const base = normalizeTokens(raw);
  const alias = TEAM_ALIASES[base.join(" ")];
  return alias ? normalizeTokens(alias) : base;
}

/**
 * Similitud determinista de nombres entre los catálogos en español de `edge_matrix_records`
 * y los nombres canónicos de `mappings.ts`.
 */
export function teamSimilarityScore(a: string, b: string): number {
  const ta = aliasTokens(a);
  const tb = aliasTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(longer);
  return shorter.every((tok) => longSet.has(tok)) ? shorter.length / longer.length : 0;
}

function slugToken(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractRowMatchMeta(row: OddsSnapshotRow): {
  appLeague: CanonicalLeague;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
} | null {
  const appLeague = V3_LEAGUE_TO_APP[row.league];
  if (!appLeague) return null;
  const parts = String(row.event_id ?? "").split(":");
  if (parts.length !== 6 || parts[0] !== "ws") return null;
  const homeSlug = parts[4]!.replace(/_/g, "-");
  const awaySlug = parts[5]!.replace(/_/g, "-");
  if (!homeSlug || !awaySlug) return null;
  const homeTeamId = `${appLeague}.${homeSlug}`;
  const awayTeamId = `${appLeague}.${awaySlug}`;
  const homeAsset = getTeamAsset(homeTeamId);
  const awayAsset = getTeamAsset(awayTeamId);
  return {
    appLeague,
    homeTeamId,
    awayTeamId,
    homeTeamName: homeAsset?.name ?? homeSlug.replace(/-/g, " "),
    awayTeamName: awayAsset?.name ?? awaySlug.replace(/-/g, " "),
  };
}

function writeJsonAtomicPreservingEol(filePath: string, payload: unknown): void {
  let eol = "\n";
  if (existsSync(filePath)) {
    try {
      const sample = readFileSync(filePath, "utf8").slice(0, 4096);
      if (sample.includes("\r\n")) eol = "\r\n";
    } catch (err) {
      void err;
    }
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const serialized = `${JSON.stringify(payload, null, 2)}\n`.replace(/\r?\n/g, eol);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, serialized, "utf8");
  renameSync(tmpPath, filePath);
}

export function loadQuotesLatestLedger(quotesFilePath: string): QuotesTimeseriesLedger | null {
  if (!existsSync(quotesFilePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(quotesFilePath, "utf8")) as QuotesTimeseriesLedger;
    if (!Array.isArray(raw.ticks)) return null;
    return raw;
  } catch (err) {
    void err;
    return null;
  }
}

/**
 * Filtra, valida (Parte 3) y fusiona ticks nuevos con los ticks vigentes (`< maxQuoteAgeHours`)
 * conservando únicamente la captura más reciente por clave natural.
 */
export function mergeAndValidateOddsTicks(params: {
  readonly incomingTicks: readonly OddsSnapshotRow[];
  readonly existingTicks: readonly OddsSnapshotRow[];
  readonly nowMs?: number;
  readonly maxQuoteAgeHours?: number;
}): {
  readonly validTicks: OddsSnapshotRow[];
  readonly rejectedIssues: ValidationIssue[];
  readonly changed: boolean;
} {
  const nowMs = params.nowMs ?? Date.now();
  const maxAgeMs = (params.maxQuoteAgeHours ?? DEFAULT_MAX_QUOTE_AGE_HOURS) * 3_600_000;

  // 1. Revalidar y filtrar ticks existentes que sigan dentro de la ventana de 72 h y pre-kickoff
  const unexpiredExistingRaw = params.existingTicks.filter((t) => {
    const capMs = parseStrictIsoMs(t.ts_captured, { requireTimezone: true });
    const startMs = parseStrictIsoMs(t.ts_event_start, { requireTimezone: true });
    if (capMs === null || startMs === null) return false;
    if (nowMs - capMs > maxAgeMs || capMs > nowMs + 10 * 60_000) return false;
    if (capMs > startMs) return false;
    return true;
  });
  const unexpiredExisting = validateOddsTickBatch(unexpiredExistingRaw, { nowMs }).acceptedRows;

  // 2. Validar ticks entrantes con el validador común de Parte 3
  const batchValidation = validateOddsTickBatch(params.incomingTicks, { nowMs });
  const acceptedIncoming = batchValidation.acceptedRows.filter((row) => {
    const capMs = parseStrictIsoMs(row.ts_captured, { requireTimezone: true });
    return capMs !== null && nowMs - capMs <= maxAgeMs;
  });

  // 3. Deduplicar por partido + mercado + línea + selección + casa quedándonos con la captura más nueva
  const mergedMap = new Map<string, OddsSnapshotRow>();
  for (const tick of [...unexpiredExisting, ...acceptedIncoming]) {
    const meta = extractRowMatchMeta(tick);
    if (!meta) continue;
    const dedupKey = [
      meta.appLeague,
      meta.homeTeamId,
      meta.awayTeamId,
      tick.market.toLowerCase(),
      tick.line === null || tick.line === undefined ? "null" : String(tick.line),
      tick.selection.toLowerCase(),
      tick.book.toLowerCase(),
    ].join("|");
    const prev = mergedMap.get(dedupKey);
    if (!prev) {
      mergedMap.set(dedupKey, tick);
      continue;
    }
    const prevMs = parseStrictIsoMs(prev.ts_captured, { requireTimezone: true }) ?? 0;
    const nextMs = parseStrictIsoMs(tick.ts_captured, { requireTimezone: true }) ?? 0;
    if (nextMs >= prevMs) {
      mergedMap.set(dedupKey, tick);
    }
  }

  const validTicks = [...mergedMap.values()].sort((a, b) => {
    if (a.league !== b.league) return a.league.localeCompare(b.league);
    if (a.ts_event_start !== b.ts_event_start) return a.ts_event_start.localeCompare(b.ts_event_start);
    if (a.event_id !== b.event_id) return a.event_id.localeCompare(b.event_id);
    if (a.market !== b.market) return a.market.localeCompare(b.market);
    if (a.book !== b.book) return a.book.localeCompare(b.book);
    return a.selection.localeCompare(b.selection);
  });

  const serializeSignature = (list: readonly OddsSnapshotRow[]) =>
    list
      .map(
        (t) =>
          `${t.event_id}|${t.market}|${t.line ?? "null"}|${t.selection}|${t.book}|${t.price_decimal}|${t.ts_captured}`,
      )
      .sort()
      .join("\n");

  const changed = serializeSignature(params.existingTicks) !== serializeSignature(validTicks);

  return {
    validTicks,
    rejectedIssues: batchValidation.rejectedIssues,
    changed,
  };
}

function groupTicksIntoOddsSnapshots(
  ticks: readonly OddsSnapshotRow[],
  matchupId: string,
): OddsSnapshotRow[] {
  return ticks.map((t) => ({
    ...t,
    event_id: matchupId,
  }));
}

function findMatchingUpcomingFixture(
  rec: LiveMatchupEdgeRecord,
  upcomingByAppLeague: ReadonlyMap<CanonicalLeague, readonly UpcomingLeagueMatchInfo[]>,
): UpcomingLeagueMatchInfo | null {
  const appLeague = V3_LEAGUE_TO_APP[String(rec.league ?? "").trim().toLowerCase()];
  if (!appLeague) return null;
  const list = upcomingByAppLeague.get(appLeague) ?? [];
  let best: UpcomingLeagueMatchInfo | null = null;
  let bestScore = 0;
  for (const item of list) {
    const h = teamSimilarityScore(rec.home_team, item.homeTeam);
    const a = teamSimilarityScore(rec.away_team, item.awayTeam);
    const score = h > 0 && a > 0 ? h + a : 0;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

interface EnrichedTick {
  readonly row: OddsSnapshotRow;
  readonly homeTeamName: string;
  readonly awayTeamName: string;
}

function findMatchingTicksForRecord(
  rec: LiveMatchupEdgeRecord,
  ticksByAppLeague: ReadonlyMap<CanonicalLeague, readonly EnrichedTick[]>,
  kickoffMs: number | null,
  decisionMs: number,
): OddsSnapshotRow[] {
  const appLeague = V3_LEAGUE_TO_APP[String(rec.league ?? "").trim().toLowerCase()];
  if (!appLeague) return [];
  const candidates = ticksByAppLeague.get(appLeague) ?? [];
  return candidates
    .filter((entry) => {
      const h = teamSimilarityScore(rec.home_team, entry.homeTeamName);
      const a = teamSimilarityScore(rec.away_team, entry.awayTeamName);
      if (h <= 0 || a <= 0) return false;
      const capMs = parseStrictIsoMs(entry.row.ts_captured, { requireTimezone: true });
      if (capMs === null || capMs > decisionMs) return false;
      if (kickoffMs !== null && capMs > kickoffMs) return false;
      return true;
    })
    .map((entry) => entry.row);
}

export interface RegenerateLiveOddsResult {
  readonly ok: boolean;
  readonly wroteLiveSnapshot: boolean;
  readonly wroteQuotesLedger: boolean;
  readonly generatedAtUtc: string;
  readonly validTicksCount: number;
  readonly rejectedIssues: readonly ValidationIssue[];
  readonly nOutlooksTotal: number;
  readonly nWithFreshQuotesLt72h: number;
  readonly nWithFreshSharpQuotesLt72h: number;
}

/**
 * Regenera `quotes_latest.json` y `live_matchday_v3_snapshot.json` validando extremo a extremo
 * con Parte 3. Si el candidato falla validación, deja intacto el snapshot previo en disco.
 */
export function regenerateLiveMatchdaySnapshot(params: {
  readonly rootDir: string;
  readonly incomingTicks: readonly OddsSnapshotRow[];
  readonly activeSources: readonly string[];
  readonly nowIso?: string;
  readonly maxQuoteAgeHours?: number;
  readonly dryRun?: boolean;
  readonly forceSnapshotWrite?: boolean;
}): RegenerateLiveOddsResult {
  const startedAt = performance.now();
  const nowIso = (params.nowIso ?? new Date().toISOString()).replace(/\.\d{3}Z$/, "Z");
  const nowMs = parseStrictIsoMs(nowIso, { requireTimezone: true }) ?? Date.now();
  const maxQuoteAgeHours = params.maxQuoteAgeHours ?? DEFAULT_MAX_QUOTE_AGE_HOURS;

  const spacetimeDataDir = resolve(params.rootDir, "packages", "spacetime", "data");
  const liveSnapshotPath = resolve(spacetimeDataDir, "live_matchday_v3_snapshot.json");
  const footballModelPath = resolve(spacetimeDataDir, "model_motor_a.json");
  const nflModelPath = resolve(spacetimeDataDir, "model_nfl.json");
  const quotesLatestPath = resolve(params.rootDir, "data", "odds_timeseries", "quotes_latest.json");
  const snapshotsRoot = resolve(params.rootDir, "data", "snapshots");

  const existingLedger = loadQuotesLatestLedger(quotesLatestPath);
  const merged = mergeAndValidateOddsTicks({
    incomingTicks: params.incomingTicks,
    existingTicks: existingLedger?.ticks ?? [],
    nowMs,
    maxQuoteAgeHours,
  });

  const previousLive = JSON.parse(
    readFileSync(liveSnapshotPath, "utf8"),
  ) as LiveMatchdaySnapshotPayload;
  const footballModel = JSON.parse(readFileSync(footballModelPath, "utf8")) as ModelArtifact;
  const nflModel = JSON.parse(readFileSync(nflModelPath, "utf8")) as NFLModelArtifact &
    NFLLiveArtifactConfig;

  const teamMasterRecords = previousLive.team_master_records as TeamMasterFeatureRecord[];
  const edgeMatrixRecords = previousLive.edge_matrix_records as LiveMatchupEdgeRecord[];
  const previousOutlooksById = new Map(
    (previousLive.outlooks ?? []).map((o) => [o.matchId, o]),
  );

  const teamIndex = buildTeamMasterIndex(teamMasterRecords, nflModel);

  const upcomingMatches = loadUpcomingMatchesFromSnapshots(snapshotsRoot, nowMs);
  const upcomingByLeague = new Map<CanonicalLeague, UpcomingLeagueMatchInfo[]>();
  for (const m of upcomingMatches) {
    const list = upcomingByLeague.get(m.league) ?? [];
    list.push(m);
    upcomingByLeague.set(m.league, list);
  }

  const ticksByLeague = new Map<CanonicalLeague, EnrichedTick[]>();
  for (const row of merged.validTicks) {
    const meta = extractRowMatchMeta(row);
    if (!meta) continue;
    const list = ticksByLeague.get(meta.appLeague) ?? [];
    list.push({
      row,
      homeTeamName: meta.homeTeamName,
      awayTeamName: meta.awayTeamName,
    });
    ticksByLeague.set(meta.appLeague, list);
  }

  const outlooks: MatchOutlook[] = [];
  const countsByLeague: Record<string, number> = {};
  let nFootball = 0;
  let nNfl = 0;
  let nWithFreshSharp = 0;
  let nWithAnyFresh = 0;

  for (const rec of edgeMatrixRecords) {
    const leagueRaw = String(rec.league ?? "").trim().toLowerCase();
    const sportRaw = String(rec.sport ?? "").trim().toLowerCase();
    const isNfl = leagueRaw === "nfl";
    const soccerDiv = SOCCER_V3_TO_DIV[leagueRaw];
    if (!isNfl && !soccerDiv) continue;

    const prevOutlook = previousOutlooksById.get(rec.matchup_id);
    const matchedUpcoming = findMatchingUpcomingFixture(rec, upcomingByLeague);
    const kickoffUtc = matchedUpcoming?.kickoffUtc ?? prevOutlook?.kickoffUtc ?? rec.kickoff_utc ?? null;
    const kickoffMs = kickoffUtc ? parseStrictIsoMs(kickoffUtc, { requireTimezone: true }) : null;

    const matchedTicks = findMatchingTicksForRecord(rec, ticksByLeague, kickoffMs, nowMs);
    const oddsSnapshots = groupTicksIntoOddsSnapshots(matchedTicks, rec.matchup_id);

    const sHome = slugToken(rec.home_team);
    const sAway = slugToken(rec.away_team);
    const homeMaster =
      teamIndex.byLeagueSlug.get(`${leagueRaw}::${sHome}`) ??
      teamIndex.bySportSlug.get(`${sportRaw}::${sHome}`) ??
      null;
    const awayMaster =
      teamIndex.byLeagueSlug.get(`${leagueRaw}::${sAway}`) ??
      teamIndex.bySportSlug.get(`${sportRaw}::${sAway}`) ??
      null;

    const outlook = isNfl
      ? (() => {
          const homeAbbr = teamIndex.nflSlugToAbbr.get(sHome) ?? "";
          const awayAbbr = teamIndex.nflSlugToAbbr.get(sAway) ?? "";
          const synthNfl = synthesizeNflSnapshotRowFromMaster(
            homeAbbr,
            awayAbbr,
            homeMaster,
            awayMaster,
            rec,
            nflModel,
            SERVICE_CONSTANTS_V3_2,
          );
          return buildMatchOutlook({
            matchId: rec.matchup_id,
            sport: "nfl",
            league: rec.league,
            homeTeam: rec.home_team,
            awayTeam: rec.away_team,
            tsDecision: nowIso,
            kickoffUtc,
            nfl: {
              nflRow: synthNfl.row,
              nflModel,
              liveContext: synthNfl.liveContext,
              liveConfig: nflModel,
            },
            oddsSnapshots,
            maxQuoteAgeMinutes: maxQuoteAgeHours * 60,
          });
        })()
      : (() => {
          const synth = synthesizeFootballSnapshotRowFromMaster(
            soccerDiv!,
            homeMaster,
            awayMaster,
            rec,
            footballModel,
            SERVICE_CONSTANTS_V3_2,
          );
          return buildMatchOutlook({
            matchId: rec.matchup_id,
            sport: "football",
            league: rec.league,
            homeTeam: rec.home_team,
            awayTeam: rec.away_team,
            tsDecision: nowIso,
            kickoffUtc,
            football: {
              footballRow: synth.row,
              footballModel,
            },
            oddsSnapshots,
            maxQuoteAgeMinutes: maxQuoteAgeHours * 60,
          });
        })();

    outlooks.push(outlook);
    countsByLeague[leagueRaw] = (countsByLeague[leagueRaw] ?? 0) + 1;
    if (outlook.sport === "football") nFootball += 1;
    else nNfl += 1;

    if (outlook.dataQuality.sharpMarketAvailable) {
      nWithFreshSharp += 1;
    }
    if (outlook.markets.some((m) => m.market !== null)) {
      nWithAnyFresh += 1;
    }
  }

  const orderedCounts: Record<string, number> = {};
  for (const key of Object.keys(countsByLeague).sort()) {
    orderedCounts[key] = countsByLeague[key]!;
  }

  const elapsedMs = Number.parseFloat((performance.now() - startedAt).toFixed(4));
  const candidateSnapshot: LiveMatchdaySnapshotPayload = {
    ...previousLive,
    generated_at: nowIso,
    outlooks_meta: {
      schema_version: OUTLOOK_SCHEMA_VERSION,
      generated_at_utc: nowIso,
      max_quote_age_hours: maxQuoteAgeHours,
      n_outlooks_total: outlooks.length,
      n_football: nFootball,
      n_nfl: nNfl,
      counts_by_league: orderedCounts,
      n_with_fresh_sharp_quotes_lt_72h: nWithFreshSharp,
      n_with_any_fresh_quotes_lt_72h: nWithAnyFresh,
      timeseries_files_scanned: existingLedger ? 1 : 0,
      timeseries_rows_validated: merged.validTicks.length,
      timeseries_rows_fresh_lt_72h: merged.validTicks.length,
      capture_status:
        nWithAnyFresh > 0
          ? "active_permitted_capture"
          : params.activeSources.length > 0
            ? "active_no_matching_events"
            : "prospective_capture_pending",
      health_generated_at_utc: nowIso,
      regeneration_latency_ms: elapsedMs,
      active_sources: [...params.activeSources],
    },
    outlooks,
  };

  const validation = validateLiveOddsSnapshotCandidate(candidateSnapshot, previousLive, {
    nowMs,
  });

  if (!validation.ok) {
    return {
      ok: false,
      wroteLiveSnapshot: false,
      wroteQuotesLedger: false,
      generatedAtUtc: previousLive.generated_at,
      validTicksCount: merged.validTicks.length,
      rejectedIssues: [...merged.rejectedIssues, ...validation.issues],
      nOutlooksTotal: previousLive.outlooks.length,
      nWithFreshQuotesLt72h: previousLive.outlooks_meta?.n_with_any_fresh_quotes_lt_72h ?? 0,
      nWithFreshSharpQuotesLt72h:
        previousLive.outlooks_meta?.n_with_fresh_sharp_quotes_lt_72h ?? 0,
    };
  }

  const prevFreshCount = previousLive.outlooks_meta?.n_with_any_fresh_quotes_lt_72h ?? 0;
  const shouldWriteQuotes =
    !params.dryRun && (merged.changed || (!existingLedger && merged.validTicks.length > 0));
  const shouldWriteSnapshot =
    !params.dryRun &&
    (Boolean(params.forceSnapshotWrite) ||
      merged.changed ||
      prevFreshCount !== nWithAnyFresh);

  if (shouldWriteQuotes) {
    const ledgerPayload: QuotesTimeseriesLedger = {
      schema_version: QUOTES_LATEST_SCHEMA_VERSION,
      updated_at_utc: nowIso,
      max_quote_age_hours: maxQuoteAgeHours,
      active_sources: [...params.activeSources],
      ticks: merged.validTicks,
    };
    writeJsonAtomicPreservingEol(quotesLatestPath, ledgerPayload);
  }

  if (shouldWriteSnapshot) {
    writeJsonAtomicPreservingEol(liveSnapshotPath, candidateSnapshot);
  }

  return {
    ok: true,
    wroteLiveSnapshot: shouldWriteSnapshot,
    wroteQuotesLedger: shouldWriteQuotes,
    generatedAtUtc: shouldWriteSnapshot ? nowIso : previousLive.generated_at,
    validTicksCount: merged.validTicks.length,
    rejectedIssues: merged.rejectedIssues,
    nOutlooksTotal: outlooks.length,
    nWithFreshQuotesLt72h: nWithAnyFresh,
    nWithFreshSharpQuotesLt72h: nWithFreshSharp,
  };
}
