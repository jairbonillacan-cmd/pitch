import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  buildGuardedNbaPlayerPropSeeds,
  DEFAULT_NBA_PROP_MIN_MINUTES,
  parseBzzoiroNbaPlayerGames,
  type BzNbaPlayerGameRaw,
  type NbaPlayerPropSeed,
  type NormalizedNbaPregame,
} from "@pitchlab/ingest/providers/bzzoiro-nba-rich";
import type {
  PlayerProfileData,
  TeamSquadPlayerRecentGame,
  TeamSquadPlayerSeasonMetric,
} from "@pitchlab/ui/team-profile";

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
  RBI: "CI",
  BB: "BB",
  SO: "K",
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
  STL: "ROB",
  BLK: "TAP",
  "FG%": "%TC",
  "3P%": "%3P",
  "FT%": "%TL",
  G: "G",
  A: "A",
  "+/-": "+/-",
  S: "Tiros",
  YDS: "YDS",
  TD: "TD",
  INT: "INT",
  CMP: "CMP",
  ATT: "INT.",
  "CMP%": "%CMP",
  REC: "REC",
  CAR: "ACAR",
};

function labelEs(raw: string): string {
  const k = raw.trim().toUpperCase();
  return STAT_LABEL_ES[k] ?? raw.trim();
}

interface RawOverview {
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

function parseOverview(league: string, data: RawOverview): Omit<CachedOverviewResult, "fetchedAtMs"> {
  const labels = data.statistics?.labels ?? [];
  const split =
    data.statistics?.splits?.find((s) => (s.displayName ?? "").toLowerCase().includes("regular")) ??
    data.statistics?.splits?.[0];
  const vals = split?.stats ?? [];
  const byKey = new Map<string, string>();
  labels.forEach((lbl, idx) => {
    const v = vals[idx]?.trim();
    if (v && v !== "--") byKey.set(lbl.trim().toUpperCase(), v);
  });

  const gp = parseStrictFiniteNumber((byKey.get("GP") ?? byKey.get("G") ?? "0").replace(/,/g, ""));
  const appearances = gp !== null && gp > 0 ? Math.round(gp) : 0;

  const order =
    league === "mlb"
      ? byKey.has("ERA") || byKey.has("IP")
        ? ["GP", "W", "L", "ERA", "IP", "SO", "WHIP", "SV"]
        : ["GP", "AB", "H", "HR", "RBI", "R", "BB", "SO"]
      : league === "nba"
        ? ["GP", "MIN", "PTS", "REB", "AST", "FG%", "3P%", "STL"]
        : league === "nhl"
          ? ["GP", "G", "A", "PTS", "+/-", "S"]
          : ["CMP", "ATT", "CMP%", "YDS", "TD", "INT", "REC", "CAR"];

  const seasonMetrics: TeamSquadPlayerSeasonMetric[] = [];
  for (const key of order) {
    const value = byKey.get(key);
    if (!value) continue;
    seasonMetrics.push({
      key: key.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: labelEs(key),
      value,
    });
    if (seasonMetrics.length >= 6) break;
  }

  if (league === "mlb" && !byKey.has("ERA") && byKey.has("H") && byKey.has("AB")) {
    const h = parseStrictFiniteNumber(byKey.get("H"));
    const ab = parseStrictFiniteNumber(byKey.get("AB"));
    if (h !== null && ab !== null && ab > 0) {
      seasonMetrics.splice(1, 0, {
        key: "avg",
        label: "AVG",
        value: (h / ab).toFixed(3).replace(/^0/, ""),
        detail: `${h} H en ${ab} AB`,
      });
      if (seasonMetrics.length > 6) seasonMetrics.pop();
    }
  }

  const glBlock = data.gameLog?.statistics?.[0];
  const glLabels = glBlock?.labels ?? [];
  const glEvents = data.gameLog?.events ?? {};
  const recentGames: TeamSquadPlayerRecentGame[] = [];
  for (const row of (glBlock?.events ?? []).slice(0, 5)) {
    const meta = row.eventId ? glEvents[row.eventId] : undefined;
    if (!meta?.gameDate) continue;
    const res = (meta.gameResult ?? "").toUpperCase();
    const result: "W" | "D" | "L" | null =
      res === "W" ? "W" : res === "L" ? "L" : res === "D" || res === "T" ? "D" : null;
    const stats: Array<{ label: string; value: string }> = [];
    glLabels.forEach((lbl, idx) => {
      const v = row.stats?.[idx]?.trim();
      if (!v || stats.length >= 5) return;
      stats.push({ label: labelEs(lbl), value: v });
    });
    recentGames.push({
      dateIso: meta.gameDate.slice(0, 10),
      opponent: meta.opponent?.displayName?.trim() || meta.opponent?.abbreviation?.trim() || "Rival",
      opponentAbbr: meta.opponent?.abbreviation?.trim() ?? null,
      isHome: meta.atVs === "vs" ? true : meta.atVs === "@" ? false : null,
      score: meta.score?.trim() ?? null,
      result,
      stats,
    });
  }

  return { appearances, seasonMetrics, recentGames };
}

/**
 * Completa bajo demanda métricas de temporada y últimos 5 juegos para jugadores US (MLB/NBA/NHL/NFL)
 * cuando no estaban pre-hidratados en `squads.json`. Usa caché en memoria (6 h) y fallo silencioso.
 */
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
    const raw = (await res.json()) as RawOverview;
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

// ---------- Puente limpio Bzzoiro NBA (`/basketball/api/v2/`) para props NBA y bajas reales con guardia `minMinutes` ----------

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
  /** Probabilidades y momios justos (`1 / p`) calibrados; cero cuotas sueltas sin análisis propio. */
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
): NbaGuardedPlayerProp {
  const pOver = evalOverProbability(seed.projectionMean, seed.projectionSd, seed.baseLine);
  const pUnder = clampProb(1 - pOver);
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
    availabilityStatus: injury?.status === "Duda" ? "doubtful" : "available",
    ...(injury?.status === "Duda" ? { injuryNote: injury.detail } : {}),
  };
}

/**
 * Construye props NBA protegidos con guardia `minMinutes` (por defecto `>= 18` min) y filtro de bajas reales
 * a partir de bitácoras `/basketball/api/v2/players/{id}/games/` y reportes de disponibilidad.
 */
export function buildNbaPropsBridgeFromPlayerGames(params: {
  player: string;
  teamSlug: string;
  teamName: string;
  position?: string;
  games: readonly BzNbaPlayerGameRaw[];
  minMinutes?: number;
  minSampleGames?: number;
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

  // Baja real confirmada: nunca emitir prop para jugador descartado (`Out` / `Baja`).
  if (matchingInjury?.status === "Baja") return [];

  const seeds = buildGuardedNbaPlayerPropSeeds({
    player: params.player,
    teamSlug,
    teamName: params.teamName,
    position: params.position,
    games: params.games,
    minMinutes: params.minMinutes ?? DEFAULT_NBA_PROP_MIN_MINUTES,
    minSampleGames: params.minSampleGames ?? 3,
    availabilityStatus: matchingInjury?.status === "Duda" ? "doubtful" : "available",
  });

  return seeds.map((seed) => mapSeedToGuardedProp(seed, matchingInjury));
}

/**
 * Traduce `/basketball/api/v2/players/{id}/games/` al perfil de rendimiento NBA (`seasonMetrics`,
 * `recentGames`, `avgMinutes` y `guardedProps`) sin filtrar IDs crudos ni URLs (`FD-16`).
 */
export function buildNbaPlayerProfileBridgeFromBzzoiro(params: {
  player: string;
  teamSlug: string;
  teamName: string;
  position?: string;
  games: readonly BzNbaPlayerGameRaw[];
  minMinutes?: number;
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
  if (avgTpm !== null) seasonMetrics.push({ key: "tpm", label: "3PM", value: avgTpm.toFixed(1) });

  const recentGames: TeamSquadPlayerRecentGame[] = normalized
    .filter((g) => g.dateIso !== null)
    .slice(0, 5)
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
    injuries: params.injuries,
  });

  return {
    appearances,
    avgMinutes,
    seasonMetrics: seasonMetrics.slice(0, 6),
    recentGames,
    guardedProps,
  };
}

let nbaInjuriesCache: { mtimeMs: number; entries: NbaRealInjuryBridgeItem[] } | null = null;
let nbaSeedsCache: { mtimeMs: number; seeds: NbaPlayerPropSeed[] } | null = null;

/** Carga bajas reales NBA desde `data/snapshots/nba/injuries.json` y fusiona `pregame` si se provee. */
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
            parsed.push({
              teamSlug: normalizeTeamSlug(e.teamId),
              player: e.player.trim().slice(0, 120),
              ...(e.position?.trim() ? { position: e.position.trim().slice(0, 24) } : {}),
              status: e.status === "Duda" ? "Duda" : "Baja",
              detail: (e.detail ?? "Reporte oficial NBA").trim().slice(0, 200),
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

/**
 * Carga props NBA desde snapshot `data/snapshots/nba/player-props.json` (o `seeds` inyectados),
 * aplicando guardia `minMinutes` y exclusión de jugadores con baja real (`Baja`/`Out`).
 */
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
    if (inj?.status === "Baja") continue;
    out.push(mapSeedToGuardedProp(seed, inj));
  }

  return out;
}
