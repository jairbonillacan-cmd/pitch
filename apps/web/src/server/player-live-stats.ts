import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  isSafePublicLabel,
  parseStrictFiniteNumber,
  slugifyPlayerName,
} from "@pitchlab/contracts";
import {
  buildGuardedNbaPlayerPropSeeds,
  DEFAULT_NBA_PROP_MIN_MINUTES,
  parseBzzoiroNbaPlayerGames,
  type BzNbaPlayerGameRaw,
  type NbaPlayerPropSeed,
  type NormalizedNbaPregame,
} from "@pitchlab/ingest/providers/bzzoiro-nba-rich";
import propsV6ArtifactJson from "@pitchlab/spacetime/data/model_props_v6_0_candidate.json";
import {
  checkPlayerMinutesAndAvailabilityGuardV6,
  evaluateUsPlayerProfilePropsV6,
  isDoubtfulAvailabilityV6,
  isHardBlockedAvailabilityV6,
  normalizeUsPlayerGameLogColumnsV6,
  type NormalizablePropsSportV6,
  type NormalizedUsGameLogResultV6,
  type PlayerGuardEvaluationV6,
  type PropsV6ModelArtifact,
  type RawPlayerStatColumnV6,
  type UsPropMetricSpecV6,
  type UsPropsSportV6,
  type UsSportPropsConfigV6,
} from "@pitchlab/spacetime/v6";
import type {
  PlayerProfileData,
  TeamSquadPlayerRecentGame,
  TeamSquadPlayerSeasonMetric,
} from "@pitchlab/ui/team-profile";

interface RawUsMetricSpecJson {
  readonly family: string;
  readonly prior_mean: number;
  readonly prior_games: number;
  readonly canonical_line: number;
  readonly anchor_minutes?: number;
  readonly r_dispersion?: number;
  readonly min_sd?: number;
  readonly var_mean_ratio?: number;
  readonly cv_sd?: number;
}

function narrowUsMetricSpec(raw: RawUsMetricSpecJson): UsPropMetricSpecV6 {
  return {
    family: raw.family === "normal_overdispersed" ? "normal_overdispersed" : "negbin",
    prior_mean: raw.prior_mean,
    prior_games: raw.prior_games,
    canonical_line: raw.canonical_line,
    ...(raw.anchor_minutes !== undefined ? { anchor_minutes: raw.anchor_minutes } : {}),
    ...(raw.r_dispersion !== undefined ? { r_dispersion: raw.r_dispersion } : {}),
    ...(raw.min_sd !== undefined ? { min_sd: raw.min_sd } : {}),
    ...(raw.var_mean_ratio !== undefined ? { var_mean_ratio: raw.var_mean_ratio } : {}),
    ...(raw.cv_sd !== undefined ? { cv_sd: raw.cv_sd } : {}),
  };
}

function narrowUsSportConfig(raw: {
  readonly min_guard_minutes: number;
  readonly roles: Readonly<Record<string, Readonly<Record<string, RawUsMetricSpecJson>>>>;
}): UsSportPropsConfigV6 {
  const roles: Record<string, Record<string, UsPropMetricSpecV6>> = {};
  for (const [roleKey, roleMetrics] of Object.entries(raw.roles)) {
    const mapped: Record<string, UsPropMetricSpecV6> = {};
    for (const [metricKey, spec] of Object.entries(roleMetrics)) {
      mapped[metricKey] = narrowUsMetricSpec(spec);
    }
    roles[roleKey] = mapped;
  }
  return {
    min_guard_minutes: raw.min_guard_minutes,
    roles,
  };
}

const PROPS_V6_MODEL_ARTIFACT: PropsV6ModelArtifact = {
  schema_version: propsV6ArtifactJson.schema_version,
  codename: propsV6ArtifactJson.codename,
  version: propsV6ArtifactJson.version,
  status: propsV6ArtifactJson.status === "production" ? "production" : "candidate",
  production_activated: propsV6ArtifactJson.production_activated,
  holdout_cut_utc: propsV6ArtifactJson.holdout_cut_utc,
  holdout_sealed_untouched: propsV6ArtifactJson.holdout_sealed_untouched,
  coupled_shots_v6: propsV6ArtifactJson.coupled_shots_v6,
  goalkeeper_saves_v6: propsV6ArtifactJson.goalkeeper_saves_v6,
  us_props_v6: {
    nba: narrowUsSportConfig(propsV6ArtifactJson.us_props_v6.nba),
    mlb: narrowUsSportConfig(propsV6ArtifactJson.us_props_v6.mlb),
    nhl: narrowUsSportConfig(propsV6ArtifactJson.us_props_v6.nhl),
    nfl: narrowUsSportConfig(propsV6ArtifactJson.us_props_v6.nfl),
  },
};

export function getPropsV6ModelArtifact(): PropsV6ModelArtifact {
  return PROPS_V6_MODEL_ARTIFACT;
}

function canonicalGuardSport(rawSport: string): string {
  const clean = rawSport.trim().toLowerCase();
  if (clean === "basketball" || clean === "nba") return "nba";
  if (clean === "football" || clean === "soccer") return "football";
  if (clean === "baseball" || clean === "mlb") return "mlb";
  if (clean === "ice-hockey" || clean === "nhl") return "nhl";
  if (clean === "american-football" || clean === "nfl") return "nfl";
  return clean;
}

export function checkStrictPlayerMinutesAndAvailabilityGuardV6(params: {
  readonly sport: string;
  readonly avgMinutes: number | null | undefined;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
}): PlayerGuardEvaluationV6 {
  const sport = canonicalGuardSport(params.sport);
  const base = checkPlayerMinutesAndAvailabilityGuardV6({
    sport,
    prematchExpectedMinutes: params.avgMinutes,
    availability: params.availability,
    injuryStatus: params.injuryStatus,
  });
  if (!base.eligible) {
    return base;
  }
  if (
    base.minRequiredMinutes > 0 &&
    (typeof params.avgMinutes !== "number" ||
      !Number.isFinite(params.avgMinutes) ||
      params.avgMinutes < base.minRequiredMinutes)
  ) {
    return Object.freeze({
      eligible: false,
      blockedByInjury: false,
      blockedByMinutesGuard: true,
      minRequiredMinutes: base.minRequiredMinutes,
    });
  }
  return base;
}

export function normalizeUsPlayerGameLogRowV6(input: {
  readonly sport: NormalizablePropsSportV6 | "soccer" | "basketball" | "baseball" | "ice-hockey" | "american-football";
  readonly columns: readonly RawPlayerStatColumnV6[];
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly enforceMinutesGuard?: boolean;
}): NormalizedUsGameLogResultV6 {
  const mapped = canonicalGuardSport(input.sport);
  const v6Sport: NormalizablePropsSportV6 =
    mapped === "nba" || mapped === "mlb" || mapped === "nhl" || mapped === "nfl"
      ? mapped
      : "football";
  const enforceGuard = input.enforceMinutesGuard ?? true;
  const result = normalizeUsPlayerGameLogColumnsV6({
    sport: v6Sport,
    columns: input.columns,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
    enforceMinutesGuard: enforceGuard,
  });
  if (!result.eligibleForProjection) {
    return result;
  }
  if (enforceGuard && (v6Sport === "nba" || v6Sport === "football")) {
    const minReq = v6Sport === "nba" ? 18 : 45;
    const minVal = result.metrics["MIN"];
    if (minVal === undefined || !Number.isFinite(minVal) || minVal < minReq) {
      return Object.freeze({
        ...result,
        blockedByMinutesGuard: true,
        eligibleForProjection: false,
      });
    }
  }
  return result;
}

interface CachedOverviewResult {
  fetchedAtMs: number;
  appearances: number;
  seasonMetrics: TeamSquadPlayerSeasonMetric[];
  recentGames: TeamSquadPlayerRecentGame[];
}

const TTL_MS = 6 * 60 * 60 * 1000;
const overviewCache = new Map<string, CachedOverviewResult>();

const LEAGUE_ESPN_SPORT_PATH: Readonly<Record<string, string>> = {
  mlb: "baseball/mlb",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
  nfl: "football/nfl",
};

const STAT_LABEL_ES: Readonly<Record<string, string>> = {
  GP: "JJ",
  AB: "AB",
  R: "C",
  H: "H",
  HR: "HR",
  TB: "TB",
  RBI: "CI",
  BB: "BB",
  SO: "SO",
  ER: "ER",
  AVG: "AVG",
  OBP: "OBP",
  SLG: "SLG",
  OPS: "OPS",
  IP: "IP",
  ERA: "ERA",
  WHIP: "WHIP",
  W: "G",
  L: "P",
  SV: "SV",
  MIN: "MIN",
  PTS: "PTS",
  REB: "REB",
  AST: "AST",
  "3PM": "3PM",
  STL: "ROB",
  BLK: "TAP",
  TOV: "PER",
  "FG%": "%TC",
  "3P%": "%3P",
  "FT%": "%TL",
  SOG: "SOG",
  TOI: "TOI",
  G: "G",
  A: "A",
  "+/-": "+/-",
  PLUS_MINUS: "+/-",
  PIM: "PIM",
  GA: "GA",
  YDS: "YDS",
  TD: "TD",
  INT: "INT",
  CMP: "CMP",
  ATT: "ATT",
  "CMP%": "%CMP",
  REC: "REC",
  CAR: "CAR",
  TGTS: "TGTS",
};

const BASEBALL_IP_TEXT_RE = /^\d+(?:\.[012])?$/;

function labelEs(raw: string): string {
  const k = raw.trim().toUpperCase();
  return STAT_LABEL_ES[k] ?? raw.trim();
}

function formatNormalizedValue(metricKey: string, val: number, rawIpText?: string): string {
  if (metricKey === "IP" && rawIpText && BASEBALL_IP_TEXT_RE.test(rawIpText)) {
    return rawIpText;
  }
  if (Math.abs(val - Math.round(val)) < 1e-6) {
    return String(Math.round(val));
  }
  return String(Math.round(val * 10) / 10);
}

function isUsPropsSport(raw: string): raw is UsPropsSportV6 {
  return raw === "nba" || raw === "mlb" || raw === "nhl" || raw === "nfl";
}

export interface RawEspnOverview {
  statistics?: {
    labels?: string[];
    splits?: Array<{ displayName?: string; stats?: string[] }>;
  };
  gameLog?: {
    statistics?: Array<{
      labels?: string[];
      events?: Array<{ eventId?: string; stats?: string[] }>;
    }>;
    events?: Record<
      string,
      {
        gameDate?: string;
        atVs?: string;
        score?: string;
        gameResult?: string;
        opponent?: { displayName?: string; abbreviation?: string };
      }
    >;
  };
}

function detectMlbPitcherFromMetrics(
  rawByKey: ReadonlyMap<string, string>,
  normMetrics: Readonly<Record<string, number>>,
  gameMetricsSample: readonly Readonly<Record<string, number>>[],
): boolean {
  if (
    rawByKey.has("ERA") ||
    rawByKey.has("WHIP") ||
    rawByKey.has("IP") ||
    normMetrics["IP"] !== undefined ||
    normMetrics["ER"] !== undefined
  ) {
    return true;
  }
  return gameMetricsSample.some((m) => m["IP"] !== undefined || m["ER"] !== undefined);
}

function findRawIpString(columns: readonly RawPlayerStatColumnV6[]): string | undefined {
  for (const col of columns) {
    const key = String(col.key ?? "").trim().toUpperCase();
    const lbl = String(col.label ?? "").trim().toUpperCase();
    if (key === "IP" || lbl === "IP" || lbl === "EL" || lbl === "INNINGS") {
      const txt = String(col.value ?? "").trim();
      if (BASEBALL_IP_TEXT_RE.test(txt)) return txt;
    }
  }
  return undefined;
}

export function normalizeUsEspnOverviewV6(
  sport: UsPropsSportV6,
  data: RawEspnOverview,
): Omit<CachedOverviewResult, "fetchedAtMs"> {
  const labels = data.statistics?.labels ?? [];
  const split =
    data.statistics?.splits?.find((s) => (s.displayName ?? "").toLowerCase().includes("regular")) ??
    data.statistics?.splits?.[0];
  const vals = split?.stats ?? [];
  const rawByKey = new Map<string, string>();
  const seasonColumns: RawPlayerStatColumnV6[] = [];

  labels.forEach((lbl, idx) => {
    const cleanLbl = lbl.trim();
    const v = vals[idx]?.trim();
    if (!cleanLbl || !v || v === "--") return;
    rawByKey.set(cleanLbl.toUpperCase(), v);
    seasonColumns.push({
      key: cleanLbl.toLowerCase(),
      label: cleanLbl,
      value: v,
    });
  });

  const seasonNormalized = normalizeUsPlayerGameLogColumnsV6({
    sport,
    columns: seasonColumns,
    enforceMinutesGuard: false,
  });

  const glBlocks = data.gameLog?.statistics ?? [];
  const glEvents = data.gameLog?.events ?? {};
  const mergedEventCols = new Map<string, RawPlayerStatColumnV6[]>();
  const mergedEventSeenLabels = new Map<string, Set<string>>();
  const orderedEventIds: string[] = [];

  for (const block of glBlocks) {
    const glLabels = block.labels ?? [];
    for (const row of (block.events ?? []).slice(0, 10)) {
      const eventId = row.eventId;
      if (!eventId || !glEvents[eventId]?.gameDate) continue;
      let cols = mergedEventCols.get(eventId);
      let seenLbls = mergedEventSeenLabels.get(eventId);
      if (!cols || !seenLbls) {
        if (orderedEventIds.length >= 10) continue;
        cols = [];
        seenLbls = new Set<string>();
        mergedEventCols.set(eventId, cols);
        mergedEventSeenLabels.set(eventId, seenLbls);
        orderedEventIds.push(eventId);
      }
      glLabels.forEach((lbl, idx) => {
        const cleanLbl = lbl.trim();
        const v = row.stats?.[idx]?.trim();
        if (!cleanLbl || !v || v === "--") return;
        const up = cleanLbl.toUpperCase();
        if (seenLbls.has(up)) return;
        seenLbls.add(up);
        cols.push({
          key: cleanLbl.toLowerCase(),
          label: cleanLbl,
          value: v,
        });
      });
    }
  }

  const normalizedGames = orderedEventIds.map((eventId) => {
    const cols = mergedEventCols.get(eventId) ?? [];
    const norm = normalizeUsPlayerGameLogColumnsV6({
      sport,
      columns: cols,
      enforceMinutesGuard: false,
    });
    return {
      eventId,
      rawIpText: findRawIpString(cols),
      metrics: norm.metrics,
    };
  });

  const isMlbPitcher =
    sport === "mlb" &&
    detectMlbPitcherFromMetrics(
      rawByKey,
      seasonNormalized.metrics,
      normalizedGames.map((g) => g.metrics),
    );

  const gpFromNorm = seasonNormalized.metrics["GP"];
  const gpRaw = parseStrictFiniteNumber(
    (rawByKey.get("GP") ?? rawByKey.get("G") ?? "0").replace(/,/g, ""),
  );
  const appearances =
    gpFromNorm !== undefined && gpFromNorm > 0
      ? Math.round(gpFromNorm)
      : gpRaw !== null && gpRaw > 0
        ? Math.round(gpRaw)
        : normalizedGames.length;

  const seasonOrder: readonly string[] =
    sport === "nba"
      ? ["GP", "MIN", "PTS", "REB", "AST", "3PM", "FG%", "3P%", "STL", "BLK"]
      : sport === "mlb"
        ? isMlbPitcher
          ? ["GP", "IP", "SO", "H", "ER", "BB", "ERA", "WHIP", "W", "L", "SV"]
          : ["GP", "AVG", "H", "HR", "TB", "RBI", "BB", "SO", "AB", "R"]
        : sport === "nhl"
          ? ["GP", "SOG", "G", "A", "PTS", "TOI", "PLUS_MINUS"]
          : ["GP", "CMP", "ATT", "YDS", "TD", "CAR", "REC", "TGTS", "INT", "CMP%"];

  const seasonRawIp = findRawIpString(seasonColumns);
  const seasonMetrics: TeamSquadPlayerSeasonMetric[] = [];
  const addedSeasonKeys = new Set<string>();

  for (const key of seasonOrder) {
    const normVal = seasonNormalized.metrics[key];
    const rawVal = rawByKey.get(key);
    if (normVal !== undefined) {
      const slugKey = key === "PLUS_MINUS" ? "plus_minus" : key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      if (addedSeasonKeys.has(slugKey)) continue;
      addedSeasonKeys.add(slugKey);
      seasonMetrics.push({
        key: slugKey,
        label: labelEs(key),
        value: formatNormalizedValue(key, normVal, seasonRawIp),
      });
    } else if (rawVal) {
      const slugKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      if (addedSeasonKeys.has(slugKey)) continue;
      addedSeasonKeys.add(slugKey);
      seasonMetrics.push({
        key: slugKey,
        label: labelEs(key),
        value: rawVal,
      });
    }
  }

  if (
    sport === "mlb" &&
    !isMlbPitcher &&
    !addedSeasonKeys.has("avg") &&
    seasonNormalized.metrics["H"] !== undefined &&
    seasonNormalized.metrics["AB"] !== undefined &&
    seasonNormalized.metrics["AB"] > 0
  ) {
    const h = seasonNormalized.metrics["H"];
    const ab = seasonNormalized.metrics["AB"];
    seasonMetrics.splice(1, 0, {
      key: "avg",
      label: "AVG",
      value: (h / ab).toFixed(3).replace(/^0/, ""),
      detail: `${h} H en ${ab} AB`,
    });
  }

  const gameStatOrder: readonly string[] =
    sport === "nba"
      ? ["MIN", "PTS", "REB", "AST", "3PM", "STL", "BLK", "TOV"]
      : sport === "mlb"
        ? isMlbPitcher
          ? ["IP", "SO", "H", "ER", "BB", "HR", "R"]
          : ["H", "HR", "TB", "RBI", "BB", "SO", "AB", "R"]
        : sport === "nhl"
          ? ["SOG", "G", "A", "PTS", "TOI", "PLUS_MINUS", "PIM", "SV", "GA"]
          : ["CMP", "ATT", "YDS", "TD", "CAR", "REC", "TGTS", "INT"];

  const recentGames: TeamSquadPlayerRecentGame[] = [];
  for (const ng of normalizedGames) {
    const meta = glEvents[ng.eventId];
    if (!meta?.gameDate) continue;
    const res = (meta.gameResult ?? "").toUpperCase();
    const result: "W" | "D" | "L" | null =
      res === "W" ? "W" : res === "L" ? "L" : res === "D" || res === "T" ? "D" : null;
    const stats: Array<{ label: string; value: string }> = [];
    for (const mk of gameStatOrder) {
      const val = ng.metrics[mk];
      if (val === undefined) continue;
      stats.push({
        label: mk === "PLUS_MINUS" ? "+/-" : mk,
        value: formatNormalizedValue(mk, val, ng.rawIpText),
      });
    }
    const rawOppName = meta.opponent?.displayName?.trim() || meta.opponent?.abbreviation?.trim() || "";
    const safeOppName = rawOppName && isSafePublicLabel(rawOppName) ? rawOppName : "Rival";
    const rawOppAbbr = meta.opponent?.abbreviation?.trim() ?? null;
    const safeOppAbbr = rawOppAbbr && isSafePublicLabel(rawOppAbbr) ? rawOppAbbr : null;
    const rawScore = meta.score?.trim() ?? null;
    const safeScore = rawScore && isSafePublicLabel(rawScore) ? rawScore : null;
    recentGames.push({
      dateIso: meta.gameDate.slice(0, 10),
      opponent: safeOppName,
      opponentAbbr: safeOppAbbr,
      isHome: meta.atVs === "vs" ? true : meta.atVs === "@" ? false : null,
      score: safeScore,
      result,
      stats,
    });
  }

  return { appearances, seasonMetrics, recentGames };
}

function parseOverview(league: string, data: RawEspnOverview): Omit<CachedOverviewResult, "fetchedAtMs"> {
  const cleanLeague = league.trim().toLowerCase();
  if (isUsPropsSport(cleanLeague)) {
    return normalizeUsEspnOverviewV6(cleanLeague, data);
  }
  return { appearances: 0, seasonMetrics: [], recentGames: [] };
}

export async function hydratePlayerLivePerformance(
  profile: PlayerProfileData,
): Promise<PlayerProfileData> {
  if (
    process.env.PITCHLAB_OFFLINE === "1" ||
    process.env.PLAYWRIGHT_TEST === "1" ||
    profile.sport === "football"
  ) {
    return profile;
  }
  const hasMetrics = (profile.player.seasonMetrics?.length ?? 0) > 0;
  const hasGames = (profile.player.recentGames?.length ?? 0) > 0;
  if (hasMetrics && hasGames) return profile;

  const sportPath = LEAGUE_ESPN_SPORT_PATH[String(profile.league)];
  if (!sportPath || !/^\d{3,10}$/.test(profile.player.id)) return profile;

  const cacheKey = `${profile.league}:${profile.player.id}`;
  const now = Date.now();
  const cached = overviewCache.get(cacheKey);
  if (cached && now - cached.fetchedAtMs < TTL_MS) {
    if (cached.seasonMetrics.length === 0 && cached.recentGames.length === 0) return profile;
    return {
      ...profile,
      player: {
        ...profile.player,
        stats: {
          ...profile.player.stats,
          appearances: Math.max(profile.player.stats.appearances, cached.appearances),
        },
        seasonMetrics: hasMetrics ? profile.player.seasonMetrics : cached.seasonMetrics,
        recentGames: hasGames ? profile.player.recentGames : cached.recentGames,
      },
    };
  }

  try {
    const res = await fetch(
      `https://site.web.api.espn.com/apis/common/v3/sports/${sportPath}/athletes/${encodeURIComponent(profile.player.id)}/overview`,
      { signal: AbortSignal.timeout(2_200) },
    );
    if (!res.ok) return profile;
    const raw = (await res.json()) as RawEspnOverview;
    const parsed = parseOverview(String(profile.league), raw);
    overviewCache.set(cacheKey, { fetchedAtMs: now, ...parsed });
    if (parsed.seasonMetrics.length === 0 && parsed.recentGames.length === 0) return profile;
    return {
      ...profile,
      player: {
        ...profile.player,
        stats: {
          ...profile.player.stats,
          appearances: Math.max(profile.player.stats.appearances, parsed.appearances),
        },
        seasonMetrics: hasMetrics ? profile.player.seasonMetrics : parsed.seasonMetrics,
        recentGames: hasGames ? profile.player.recentGames : parsed.recentGames,
      },
    };
  } catch (err) {
    void err;
    return profile;
  }
}

export interface UsPropSpanishMeta {
  readonly labelEs: string;
  readonly unitEs: string;
}

const US_PROP_META_ES: Readonly<Record<UsPropsSportV6, Readonly<Record<string, UsPropSpanishMeta>>>> = {
  nba: {
    PTS: { labelEs: "Puntos (PTS)", unitEs: "puntos" },
    REB: { labelEs: "Rebotes (REB)", unitEs: "rebotes" },
    AST: { labelEs: "Asistencias (AST)", unitEs: "asistencias" },
    "3PM": { labelEs: "Triples (3PM)", unitEs: "triples" },
  },
  mlb: {
    SO: { labelEs: "Ponches (SO)", unitEs: "ponches" },
    IP: { labelEs: "Entradas lanzadas (IP)", unitEs: "entradas" },
    H: { labelEs: "Hits (H)", unitEs: "hits" },
    ER: { labelEs: "Carreras limpias (ER)", unitEs: "carreras" },
    BB: { labelEs: "Bases por bola (BB)", unitEs: "bases por bola" },
    HR: { labelEs: "Jonrones (HR)", unitEs: "jonrones" },
    TB: { labelEs: "Bases totales (TB)", unitEs: "bases" },
    RBI: { labelEs: "Carreras impulsadas (RBI)", unitEs: "carreras impulsadas" },
  },
  nhl: {
    SOG: { labelEs: "Tiros a portería (SOG)", unitEs: "tiros" },
    G: { labelEs: "Goles (G)", unitEs: "goles" },
    A: { labelEs: "Asistencias (A)", unitEs: "asistencias" },
    PTS: { labelEs: "Puntos (PTS)", unitEs: "puntos" },
  },
  nfl: {
    CMP: { labelEs: "Pases completos (CMP)", unitEs: "pases" },
    ATT: { labelEs: "Intentos de pase (ATT)", unitEs: "pases" },
    YDS: { labelEs: "Yardas (YDS)", unitEs: "yardas" },
    TD: { labelEs: "Touchdowns (TD)", unitEs: "touchdowns" },
    CAR: { labelEs: "Acarreos (CAR)", unitEs: "acarreos" },
    REC: { labelEs: "Recepciones (REC)", unitEs: "recepciones" },
    TGTS: { labelEs: "Targets (TGTS)", unitEs: "targets" },
  },
};

export function resolveUsPropMetaEs(
  sport: UsPropsSportV6,
  role: string,
  metric: string,
): UsPropSpanishMeta {
  if (sport === "mlb" && (role === "SP" || role === "RP") && metric === "H") {
    return { labelEs: "Hits permitidos (H)", unitEs: "hits" };
  }
  const hit = US_PROP_META_ES[sport][metric];
  if (hit) return hit;
  return { labelEs: metric, unitEs: metric.toLowerCase() };
}

function normalizeUsPositionForV6(
  sport: UsPropsSportV6,
  positionLabel: string | null | undefined,
  seasonNorm: Readonly<Record<string, number>>,
  recentMaps: readonly Readonly<Record<string, number>>[],
): string {
  const pos = (positionLabel ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  if (sport === "nba") {
    if (pos === "C" || pos.includes("CENTER") || pos.includes("PIVOT")) return "C";
    if (
      pos === "F" ||
      pos === "PF" ||
      pos === "SF" ||
      pos.includes("FORWARD") ||
      pos.includes("ALERO")
    ) {
      return "F";
    }
    return "G";
  }

  if (sport === "mlb") {
    if (pos === "SP" || pos.includes("STARTER") || pos.includes("ABRIDOR")) return "SP";
    if (
      pos === "RP" ||
      pos === "CP" ||
      pos.includes("RELIEV") ||
      pos.includes("CLOSER") ||
      pos.includes("RELEV") ||
      pos.includes("CERRAD")
    ) {
      return "RP";
    }
    const hasIpOrEr =
      seasonNorm["IP"] !== undefined ||
      seasonNorm["ER"] !== undefined ||
      recentMaps.some((m) => m["IP"] !== undefined || m["ER"] !== undefined);
    if (pos === "P" || pos.includes("PITCH") || pos.includes("LANZAD") || hasIpOrEr) {
      const ipVals = recentMaps
        .map((m) => m["IP"])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const avgIp =
        ipVals.length > 0
          ? ipVals.reduce((a, b) => a + b, 0) / ipVals.length
          : seasonNorm["IP"] !== undefined && (seasonNorm["GP"] ?? 0) > 0
            ? seasonNorm["IP"] / Math.max(1, seasonNorm["GP"] ?? 1)
            : 0;
      const gs = seasonNorm["GS"] ?? recentMaps.reduce((acc, m) => acc + (m["GS"] ?? 0), 0);
      return avgIp >= 3.5 || gs >= 1 ? "SP" : "RP";
    }
    return "BAT";
  }

  if (sport === "nhl") {
    if (pos === "G" || pos.includes("GOAL") || pos.includes("PORTERO")) return "G";
    if (pos === "D" || pos === "LD" || pos === "RD" || pos.includes("DEF")) return "D";
    return "FWD";
  }

  if (pos === "QB" || pos.includes("QUARTERBACK") || pos.includes("MARISCAL")) return "QB";
  if (pos === "RB" || pos === "FB" || pos.includes("RUNNING") || pos.includes("CORREDOR")) return "RB";
  if (pos === "TE" || pos.includes("TIGHT") || pos.includes("ALA CERRADA")) return "TE";
  return "WR";
}

export interface GuardedUsPlayerProfileInputV6 {
  readonly sport: UsPropsSportV6;
  readonly playerName: string;
  readonly playerSlug?: string | null;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly positionLabel?: string | null;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly injuryNote?: string | null;
  readonly seasonMetrics: readonly RawPlayerStatColumnV6[];
  readonly recentGames: readonly { readonly stats?: readonly RawPlayerStatColumnV6[] }[];
  readonly explicitAvgMinutes?: number | null;
  readonly oppFactor?: number;
}

export interface GuardedUsPlayerPropProjectionV6 {
  readonly sport: UsPropsSportV6;
  readonly playerName: string;
  readonly playerSlug: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly role: string;
  readonly metric: string;
  readonly metricLabelEs: string;
  readonly unitEs: string;
  readonly selectionLabelOver: string;
  readonly distributionFamily: "negbin" | "normal_overdispersed";
  readonly line: number;
  readonly muAdjusted: number;
  readonly sdEffective: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly pPush: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
  readonly avgMinutes: number | null;
  readonly sampleGames: number;
  readonly recentValues: readonly number[];
  readonly availabilityStatus: "available" | "doubtful";
  readonly injuryNote: string | null;
}

export function evaluateGuardedUsPlayerPropsV6(
  input: GuardedUsPlayerProfileInputV6,
): readonly GuardedUsPlayerPropProjectionV6[] {
  if (!isSafePublicLabel(input.playerName) || !isSafePublicLabel(input.teamName)) {
    return [];
  }
  if (isHardBlockedAvailabilityV6(input.availability, input.injuryStatus)) {
    return [];
  }

  const seasonNorm = normalizeUsPlayerGameLogColumnsV6({
    sport: input.sport,
    columns: input.seasonMetrics,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
    enforceMinutesGuard: false,
  }).metrics;

  const recentMaps: Readonly<Record<string, number>>[] = [];
  const recentByMetric = new Map<string, number[]>();
  for (const g of input.recentGames) {
    const gMap = normalizeUsPlayerGameLogColumnsV6({
      sport: input.sport,
      columns: g.stats ?? [],
      availability: input.availability,
      injuryStatus: input.injuryStatus,
      enforceMinutesGuard: false,
    }).metrics;
    recentMaps.push(gMap);
    for (const [mk, mv] of Object.entries(gMap)) {
      const arr = recentByMetric.get(mk) ?? [];
      arr.push(mv);
      recentByMetric.set(mk, arr);
    }
  }

  const seasonGp = seasonNorm["GP"] ?? input.recentGames.length;
  let avgMinutes: number | null = null;
  if (input.sport === "nba") {
    const minArr = recentByMetric.get("MIN") ?? [];
    if (minArr.length > 0) {
      avgMinutes = Math.round((minArr.reduce((a, b) => a + b, 0) / minArr.length) * 10) / 10;
    } else if (seasonNorm["MIN"] !== undefined) {
      const rawSeasonMin = seasonNorm["MIN"];
      const perGame =
        rawSeasonMin > 48 && seasonGp > 1 ? rawSeasonMin / seasonGp : rawSeasonMin;
      avgMinutes = Math.round(perGame * 10) / 10;
    } else if (
      typeof input.explicitAvgMinutes === "number" &&
      Number.isFinite(input.explicitAvgMinutes)
    ) {
      avgMinutes = Math.round(input.explicitAvgMinutes * 10) / 10;
    }
  } else if (input.sport === "nhl") {
    const toiArr = recentByMetric.get("TOI") ?? [];
    if (toiArr.length > 0) {
      avgMinutes = Math.round((toiArr.reduce((a, b) => a + b, 0) / toiArr.length) * 10) / 10;
    } else if (seasonNorm["TOI"] !== undefined) {
      avgMinutes = Math.round(seasonNorm["TOI"] * 10) / 10;
    }
  }

  const strictGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
    sport: input.sport,
    avgMinutes,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
  });
  if (!strictGuard.eligible) {
    return [];
  }

  const normalizedRole = normalizeUsPositionForV6(
    input.sport,
    input.positionLabel,
    seasonNorm,
    recentMaps,
  );

  const adjustedSeasonMetrics: RawPlayerStatColumnV6[] =
    input.sport === "nba" && avgMinutes !== null
      ? [
          ...input.seasonMetrics.filter((c) => {
            const k = String(c.key ?? "").trim().toLowerCase();
            const l = String(c.label ?? "").trim().toUpperCase();
            return k !== "min" && k !== "mp" && k !== "mins" && l !== "MIN" && l !== "MINS";
          }),
          { key: "min", label: "MIN", value: avgMinutes },
        ]
      : [...input.seasonMetrics];

  const outlooks = evaluateUsPlayerProfilePropsV6({
    sport: input.sport,
    positionLabel: normalizedRole,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
    seasonMetrics: adjustedSeasonMetrics,
    recentGames: input.recentGames,
    oppFactor: input.oppFactor,
    artifact: PROPS_V6_MODEL_ARTIFACT,
  });

  if (outlooks.length === 0) {
    return [];
  }

  const cleanSlug =
    input.playerSlug && input.playerSlug.trim().length > 0
      ? input.playerSlug.trim()
      : slugifyPlayerName(input.playerName);
  const cleanTeamSlug = normalizeTeamSlug(input.teamSlug);
  const availabilityStatus: "available" | "doubtful" = isDoubtfulAvailabilityV6(
    input.availability,
    input.injuryStatus,
  )
    ? "doubtful"
    : "available";
  const safeInjuryNote =
    input.injuryNote && isSafePublicLabel(input.injuryNote) ? input.injuryNote : null;
  const sampleGames = Math.max(
    Math.round(seasonGp),
    input.recentGames.length,
    1,
  );

  return outlooks.map((outlook) => {
    const meta = resolveUsPropMetaEs(outlook.sport, outlook.role, outlook.metric);
    const recentValues = (recentByMetric.get(outlook.metric) ?? []).slice(0, 10);
    return {
      sport: outlook.sport,
      playerName: input.playerName,
      playerSlug: cleanSlug,
      teamSlug: cleanTeamSlug,
      teamName: input.teamName,
      role: outlook.role,
      metric: outlook.metric,
      metricLabelEs: meta.labelEs,
      unitEs: meta.unitEs,
      selectionLabelOver: `Más de ${outlook.line.toFixed(1)} ${meta.unitEs}`,
      distributionFamily: outlook.distributionFamily,
      line: outlook.line,
      muAdjusted: outlook.muAdjusted,
      sdEffective: outlook.sdEffective,
      pOver: outlook.pOverCalibrated,
      pUnder: outlook.pUnderCalibrated,
      pPush: outlook.pPush,
      fairOverDecimal: outlook.fairOverDecimal,
      fairUnderDecimal: outlook.fairUnderDecimal,
      avgMinutes,
      sampleGames,
      recentValues,
      availabilityStatus,
      injuryNote: safeInjuryNote,
    };
  });
}

export interface NbaRealInjuryBridgeItem {
  readonly teamSlug: string;
  readonly player: string;
  readonly position?: string;
  readonly status: "Baja" | "Duda";
  readonly detail: string;
  readonly injuryType?: string;
  readonly returnDate?: string;
  readonly reportedAt?: string;
}

export interface NbaGuardedPlayerProp {
  readonly player: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly position: string;
  readonly statKey: NbaPlayerPropSeed["statKey"];
  readonly statLabel: string;
  readonly baseLine: number;
  readonly projectionMean: number;
  readonly projectionSd: number;
  readonly avgMinutes: number | null;
  readonly sampleGames: number;
  readonly last10: readonly number[];
  readonly pOver: number;
  readonly fairOverDecimal: number;
  readonly pUnder: number;
  readonly fairUnderDecimal: number;
  readonly availabilityStatus: "available" | "doubtful";
  readonly injuryNote?: string;
}

export interface NbaPlayerProfileBridge {
  readonly appearances: number;
  readonly avgMinutes: number | null;
  readonly seasonMetrics: readonly TeamSquadPlayerSeasonMetric[];
  readonly recentGames: readonly TeamSquadPlayerRecentGame[];
  readonly guardedProps: readonly NbaGuardedPlayerProp[];
}

function normNameKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clampProb(p: number): number {
  return Math.round(Math.min(0.92, Math.max(0.08, p)) * 1000) / 1000;
}

function evalOverProbability(mean: number, sd: number, line: number): number {
  const z = (line - mean) / Math.max(0.45, sd);
  const cdf = 1 / (1 + Math.exp(-1.702 * z));
  return clampProb(1 - cdf);
}

function toFairDecimal(p: number): number {
  return Math.max(1.05, Math.round((1 / clampProb(p)) * 100) / 100);
}

function resolveSnapshotsRootDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "data", "snapshots"),
    path.resolve(process.cwd(), "..", "..", "data", "snapshots"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

function normalizeTeamSlug(rawTeamIdOrSlug: string): string {
  const clean = rawTeamIdOrSlug.trim().toLowerCase();
  return clean.includes(".") ? clean.split(".").slice(1).join(".") : clean;
}

function extractPregameInjuries(
  pregame: NormalizedNbaPregame | null | undefined,
  homeTeamSlug: string,
  awayTeamSlug: string,
): NbaRealInjuryBridgeItem[] {
  if (!pregame) return [];
  const out: NbaRealInjuryBridgeItem[] = [];
  for (const item of pregame.injuries.home) {
    out.push({
      teamSlug: normalizeTeamSlug(homeTeamSlug),
      player: item.playerName,
      ...(item.position ? { position: item.position } : {}),
      status: item.status,
      detail: item.detail,
      ...(item.injuryType ? { injuryType: item.injuryType } : {}),
      ...(item.returnDate ? { returnDate: item.returnDate } : {}),
    });
  }
  for (const item of pregame.injuries.away) {
    out.push({
      teamSlug: normalizeTeamSlug(awayTeamSlug),
      player: item.playerName,
      ...(item.position ? { position: item.position } : {}),
      status: item.status,
      detail: item.detail,
      ...(item.injuryType ? { injuryType: item.injuryType } : {}),
      ...(item.returnDate ? { returnDate: item.returnDate } : {}),
    });
  }
  return out;
}

function mapSeedToGuardedProp(
  seed: NbaPlayerPropSeed,
  injury?: NbaRealInjuryBridgeItem,
  explicitAvailability?: string | null,
): NbaGuardedPlayerProp {
  const pOver = evalOverProbability(seed.projectionMean, seed.projectionSd, seed.baseLine);
  const pUnder = clampProb(1 - pOver);
  const isDoubt = isDoubtfulAvailabilityV6(explicitAvailability, injury?.status);
  const safeInjuryNote =
    isDoubt && injury?.detail && isSafePublicLabel(injury.detail) ? injury.detail : undefined;
  return {
    player: seed.player,
    teamSlug: normalizeTeamSlug(seed.teamSlug),
    teamName: seed.teamName,
    position: seed.position,
    statKey: seed.statKey,
    statLabel: seed.statLabel,
    baseLine: seed.baseLine,
    projectionMean: seed.projectionMean,
    projectionSd: seed.projectionSd,
    avgMinutes: seed.avgMinutes ?? null,
    sampleGames: seed.sampleGames ?? seed.last10.length,
    last10: seed.last10.slice(0, 10),
    pOver,
    fairOverDecimal: toFairDecimal(pOver),
    pUnder,
    fairUnderDecimal: toFairDecimal(pUnder),
    availabilityStatus: isDoubt ? "doubtful" : "available",
    ...(safeInjuryNote ? { injuryNote: safeInjuryNote } : {}),
  };
}

export function buildNbaPropsBridgeFromPlayerGames(params: {
  player: string;
  teamSlug: string;
  teamName: string;
  position?: string;
  games: readonly BzNbaPlayerGameRaw[];
  minMinutes?: number;
  minSampleGames?: number;
  availability?: string | null;
  injuryStatus?: string | null;
  injuries?: readonly NbaRealInjuryBridgeItem[];
  pregame?: NormalizedNbaPregame | null;
  homeTeamSlug?: string;
  awayTeamSlug?: string;
}): NbaGuardedPlayerProp[] {
  const teamSlug = normalizeTeamSlug(params.teamSlug);
  const combinedInjuries: NbaRealInjuryBridgeItem[] = [
    ...(params.injuries ?? []),
    ...(params.pregame && params.homeTeamSlug && params.awayTeamSlug
      ? extractPregameInjuries(params.pregame, params.homeTeamSlug, params.awayTeamSlug)
      : []),
  ];

  const playerKey = normNameKey(params.player);
  const matchingInjury = combinedInjuries.find(
    (inj) =>
      normNameKey(inj.player) === playerKey &&
      (!inj.teamSlug || normalizeTeamSlug(inj.teamSlug) === teamSlug),
  );

  if (
    isHardBlockedAvailabilityV6(params.availability, params.injuryStatus) ||
    isHardBlockedAvailabilityV6(null, matchingInjury?.status)
  ) {
    return [];
  }

  const minMinutes = params.minMinutes ?? DEFAULT_NBA_PROP_MIN_MINUTES;
  const normalizedGames = parseBzzoiroNbaPlayerGames(params.games);
  const validMins = normalizedGames
    .map((g) => g.minutes)
    .filter((m): m is number => typeof m === "number" && Number.isFinite(m));
  const avgMinutes =
    validMins.length > 0
      ? validMins.reduce((acc, v) => acc + v, 0) / validMins.length
      : null;

  if (minMinutes > 0 && (avgMinutes === null || avgMinutes < minMinutes)) {
    return [];
  }

  const isDoubtful = isDoubtfulAvailabilityV6(
    params.availability,
    params.injuryStatus ?? matchingInjury?.status,
  );

  const seeds = buildGuardedNbaPlayerPropSeeds({
    player: params.player,
    teamSlug,
    teamName: params.teamName,
    position: params.position,
    games: params.games,
    minMinutes,
    minSampleGames: params.minSampleGames ?? 3,
    availabilityStatus: isDoubtful ? "doubtful" : "available",
  });

  return seeds
    .filter(
      (seed) =>
        minMinutes <= 0 ||
        (typeof seed.avgMinutes === "number" &&
          Number.isFinite(seed.avgMinutes) &&
          seed.avgMinutes >= minMinutes),
    )
    .map((seed) => mapSeedToGuardedProp(seed, matchingInjury, params.availability));
}

export function buildNbaPlayerProfileBridgeFromBzzoiro(params: {
  player: string;
  teamSlug: string;
  teamName: string;
  position?: string;
  games: readonly BzNbaPlayerGameRaw[];
  minMinutes?: number;
  availability?: string | null;
  injuryStatus?: string | null;
  injuries?: readonly NbaRealInjuryBridgeItem[];
}): NbaPlayerProfileBridge {
  const normalized = parseBzzoiroNbaPlayerGames(params.games);
  const appearances = normalized.length;
  const avgOf = (vals: readonly (number | null)[]): number | null => {
    const valid = vals.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return Math.round((valid.reduce((acc, v) => acc + v, 0) / valid.length) * 10) / 10;
  };

  const avgMinutes = avgOf(normalized.map((g) => g.minutes));
  const avgPts = avgOf(normalized.map((g) => g.points));
  const avgReb = avgOf(normalized.map((g) => g.rebounds));
  const avgAst = avgOf(normalized.map((g) => g.assists));
  const avgTpm = avgOf(normalized.map((g) => g.threePointersMade));

  const seasonMetrics: TeamSquadPlayerSeasonMetric[] = [];
  if (appearances > 0) seasonMetrics.push({ key: "gp", label: "JJ", value: String(appearances) });
  if (avgMinutes !== null) seasonMetrics.push({ key: "min", label: "MIN", value: avgMinutes.toFixed(1) });
  if (avgPts !== null) seasonMetrics.push({ key: "pts", label: "PTS", value: avgPts.toFixed(1) });
  if (avgReb !== null) seasonMetrics.push({ key: "reb", label: "REB", value: avgReb.toFixed(1) });
  if (avgAst !== null) seasonMetrics.push({ key: "ast", label: "AST", value: avgAst.toFixed(1) });
  if (avgTpm !== null) seasonMetrics.push({ key: "3pm", label: "3PM", value: avgTpm.toFixed(1) });

  const recentGames: TeamSquadPlayerRecentGame[] = normalized
    .filter((g) => g.dateIso !== null)
    .slice(0, 10)
    .map((g) => {
      const stats: Array<{ label: string; value: string }> = [];
      if (g.minutes !== null) stats.push({ label: "MIN", value: String(Math.round(g.minutes)) });
      if (g.points !== null) stats.push({ label: "PTS", value: String(g.points) });
      if (g.rebounds !== null) stats.push({ label: "REB", value: String(g.rebounds) });
      if (g.assists !== null) stats.push({ label: "AST", value: String(g.assists) });
      if (g.threePointersMade !== null) stats.push({ label: "3PM", value: String(g.threePointersMade) });
      return {
        dateIso: g.dateIso!,
        opponent: g.opponent,
        opponentAbbr: g.opponentAbbr,
        isHome: g.isHome,
        score: g.score,
        result: g.result,
        stats,
      };
    });

  const guardedProps = buildNbaPropsBridgeFromPlayerGames({
    player: params.player,
    teamSlug: params.teamSlug,
    teamName: params.teamName,
    position: params.position,
    games: params.games,
    minMinutes: params.minMinutes,
    availability: params.availability,
    injuryStatus: params.injuryStatus,
    injuries: params.injuries,
  });

  return {
    appearances,
    avgMinutes,
    seasonMetrics,
    recentGames,
    guardedProps,
  };
}

let nbaInjuriesCache: { mtimeMs: number; entries: NbaRealInjuryBridgeItem[] } | null = null;
let nbaSeedsCache: { mtimeMs: number; seeds: NbaPlayerPropSeed[] } | null = null;

export function loadNbaInjuriesBridge(options?: {
  pregame?: NormalizedNbaPregame | null;
  homeTeamSlug?: string;
  awayTeamSlug?: string;
  teamSlug?: string;
}): NbaRealInjuryBridgeItem[] {
  const fromDisk: NbaRealInjuryBridgeItem[] = [];
  const root = resolveSnapshotsRootDir();
  if (root) {
    const file = path.join(root, "nba", "injuries.json");
    if (existsSync(file)) {
      try {
        const mtimeMs = statSync(file).mtimeMs;
        if (nbaInjuriesCache && nbaInjuriesCache.mtimeMs === mtimeMs) {
          fromDisk.push(...nbaInjuriesCache.entries);
        } else {
          const raw = JSON.parse(readFileSync(file, "utf8")) as {
            entries?: Array<{
              teamId?: string;
              player?: string;
              position?: string;
              status?: string;
              detail?: string;
              injuryType?: string;
              returnDate?: string;
              reportedAt?: string;
            }>;
          };
          const parsed: NbaRealInjuryBridgeItem[] = [];
          for (const e of raw.entries ?? []) {
            if (!e?.player?.trim() || !e.teamId?.trim()) continue;
            const rawDetail = (e.detail ?? "Reporte oficial NBA").trim().slice(0, 200);
            const safeDetail = isSafePublicLabel(rawDetail) ? rawDetail : "Reporte oficial NBA";
            parsed.push({
              teamSlug: normalizeTeamSlug(e.teamId),
              player: e.player.trim().slice(0, 120),
              ...(e.position?.trim() ? { position: e.position.trim().slice(0, 24) } : {}),
              status: isHardBlockedAvailabilityV6(null, e.status)
                ? "Baja"
                : e.status === "Duda" || isDoubtfulAvailabilityV6(null, e.status)
                  ? "Duda"
                  : "Baja",
              detail: safeDetail,
              ...(e.injuryType?.trim() ? { injuryType: e.injuryType.trim().slice(0, 120) } : {}),
              ...(e.returnDate?.trim() ? { returnDate: e.returnDate.trim().slice(0, 60) } : {}),
              ...(e.reportedAt?.trim() ? { reportedAt: e.reportedAt.trim() } : {}),
            });
          }
          nbaInjuriesCache = { mtimeMs, entries: parsed };
          fromDisk.push(...parsed);
        }
      } catch (err) {
        void err;
      }
    }
  }

  const fromPregame =
    options?.pregame && options.homeTeamSlug && options.awayTeamSlug
      ? extractPregameInjuries(options.pregame, options.homeTeamSlug, options.awayTeamSlug)
      : [];

  const dedup = new Map<string, NbaRealInjuryBridgeItem>();
  for (const item of [...fromPregame, ...fromDisk]) {
    const k = `${item.teamSlug}|${normNameKey(item.player)}`;
    if (!dedup.has(k)) dedup.set(k, item);
  }

  const all = [...dedup.values()];
  if (options?.teamSlug) {
    const target = normalizeTeamSlug(options.teamSlug);
    return all.filter((i) => i.teamSlug === target);
  }
  return all;
}

export function loadNbaGuardedPropsBridge(options: {
  seeds?: readonly NbaPlayerPropSeed[];
  injuries?: readonly NbaRealInjuryBridgeItem[];
  minMinutes?: number;
  teamSlug?: string;
} = {}): NbaGuardedPlayerProp[] {
  const minMinutes = options.minMinutes ?? DEFAULT_NBA_PROP_MIN_MINUTES;
  let seeds: readonly NbaPlayerPropSeed[] = options.seeds ?? [];

  if (!options.seeds) {
    const root = resolveSnapshotsRootDir();
    if (root) {
      const file = path.join(root, "nba", "player-props.json");
      if (existsSync(file)) {
        try {
          const mtimeMs = statSync(file).mtimeMs;
          if (nbaSeedsCache && nbaSeedsCache.mtimeMs === mtimeMs) {
            seeds = nbaSeedsCache.seeds;
          } else {
            const raw = JSON.parse(readFileSync(file, "utf8")) as
              | NbaPlayerPropSeed[]
              | { seeds?: NbaPlayerPropSeed[] };
            const parsed = Array.isArray(raw) ? raw : Array.isArray(raw.seeds) ? raw.seeds : [];
            nbaSeedsCache = { mtimeMs, seeds: parsed };
            seeds = parsed;
          }
        } catch (err) {
          void err;
        }
      }
    }
  }

  const injuries = options.injuries ?? loadNbaInjuriesBridge();
  const injuryByKey = new Map<string, NbaRealInjuryBridgeItem>();
  for (const inj of injuries) {
    injuryByKey.set(`${inj.teamSlug}|${normNameKey(inj.player)}`, inj);
  }

  const targetTeam = options.teamSlug ? normalizeTeamSlug(options.teamSlug) : null;
  const out: NbaGuardedPlayerProp[] = [];

  for (const seed of seeds) {
    if (!seed || typeof seed.player !== "string" || !Number.isFinite(seed.projectionMean)) continue;
    const slug = normalizeTeamSlug(seed.teamSlug);
    if (targetTeam && slug !== targetTeam) continue;
    if (
      minMinutes > 0 &&
      (typeof seed.avgMinutes !== "number" ||
        !Number.isFinite(seed.avgMinutes) ||
        seed.avgMinutes < minMinutes)
    ) {
      continue;
    }

    const inj = injuryByKey.get(`${slug}|${normNameKey(seed.player)}`);
    if (isHardBlockedAvailabilityV6(null, inj?.status)) continue;
    out.push(mapSeedToGuardedProp(seed, inj));
  }

  return out;
}
