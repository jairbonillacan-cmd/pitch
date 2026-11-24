import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPermittedMarketQuoteBook,
  parseStrictFiniteNumber,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import {
  buildTeamMasterIndex,
  predictLiveMatchup,
  type LiveInferenceArtifacts,
  type LiveMatchupEdgeRecord,
  type LiveMatchupPrediction,
  type TeamMasterFeatureRecord,
  type TeamMasterIndex,
} from "@pitchlab/spacetime";
import type { SpacetimeSignal } from "@pitchlab/ui/types";
import { logSecurityEvent } from "./safe-logger";

interface LiveSnapshot {
  generated_at: string;
  edge_matrix_records: readonly LiveMatchupEdgeRecord[];
  team_master_records: readonly TeamMasterFeatureRecord[];
}

const LIVE_SNAPSHOT_FILE = "live_matchday_v3_snapshot.json";
let cachedSpacetimeDataDir: string | null = null;
const spacetimeJsonMemo = new Map<string, unknown>();
let liveSnapshotMemo: LiveSnapshot | null = null;
let artifactsMemo: LiveInferenceArtifacts | null = null;
let cachedLiveGeneratedAt: string | null | undefined;

function readModuleDir(): string | null {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return typeof __dirname === "string" ? __dirname : null;
  }
}

function probeSpacetimeDataDirFrom(startDir: string): string | null {
  let cursor = path.resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    const pkgPath = path.join(cursor, "node_modules", "@pitchlab", "spacetime", "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const realPkgDir = path.dirname(fs.realpathSync(pkgPath));
        const pkgDataDir = path.join(realPkgDir, "data");
        if (fs.existsSync(path.join(pkgDataDir, LIVE_SNAPSHOT_FILE))) {
          return pkgDataDir;
        }
      } catch (err) {
        logSecurityEvent("warn", "spacetime_realpath_failed", {
          pkgPath,
          error: err,
        });
      }
    }
    const workspaceDataDir = path.join(cursor, "packages", "spacetime", "data");
    if (fs.existsSync(path.join(workspaceDataDir, LIVE_SNAPSHOT_FILE))) {
      return workspaceDataDir;
    }
    const directDataDir = path.join(cursor, "data");
    if (fs.existsSync(path.join(directDataDir, LIVE_SNAPSHOT_FILE))) {
      return directDataDir;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

export function resolveSpacetimeDataDir(): string {
  if (cachedSpacetimeDataDir) return cachedSpacetimeDataDir;
  const roots = [process.cwd(), path.join(process.cwd(), "apps", "web"), readModuleDir()];
  for (const root of roots) {
    if (!root) continue;
    const found = probeSpacetimeDataDirFrom(root);
    if (found) {
      cachedSpacetimeDataDir = found;
      return found;
    }
  }
  throw new Error(`Unable to locate @pitchlab/spacetime/data (${LIVE_SNAPSHOT_FILE})`);
}

export function readSpacetimeDataJson<T>(fileName: string): T {
  if (spacetimeJsonMemo.has(fileName)) {
    return spacetimeJsonMemo.get(fileName) as T;
  }
  const filePath = path.join(resolveSpacetimeDataDir(), fileName);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  spacetimeJsonMemo.set(fileName, parsed);
  return parsed;
}

export function readLiveSnapshotGeneratedAtFast(): string | null {
  if (cachedLiveGeneratedAt !== undefined) return cachedLiveGeneratedAt;
  const filePath = path.join(resolveSpacetimeDataDir(), LIVE_SNAPSHOT_FILE);
  const buffer = Buffer.allocUnsafe(4096);
  let bytesRead = 0;
  const fd = fs.openSync(filePath, "r");
  try {
    bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const head = buffer.toString("utf8", 0, bytesRead);
  const match = /"generated_at"\s*:\s*"([^"]+)"/.exec(head);
  if (match?.[1]) {
    cachedLiveGeneratedAt = match[1];
    return cachedLiveGeneratedAt;
  }
  const fallback = readSpacetimeDataJson<{
    generated_at?: unknown;
    outlooks_meta?: { generated_at_utc?: unknown };
  }>(LIVE_SNAPSHOT_FILE);
  if (typeof fallback.generated_at === "string") {
    cachedLiveGeneratedAt = fallback.generated_at;
  } else if (typeof fallback.outlooks_meta?.generated_at_utc === "string") {
    cachedLiveGeneratedAt = fallback.outlooks_meta.generated_at_utc;
  } else {
    cachedLiveGeneratedAt = null;
  }
  return cachedLiveGeneratedAt;
}

function getLiveSnapshot(): LiveSnapshot {
  if (!liveSnapshotMemo) {
    liveSnapshotMemo = readSpacetimeDataJson<LiveSnapshot>(LIVE_SNAPSHOT_FILE);
  }
  return liveSnapshotMemo;
}

function getArtifacts(): LiveInferenceArtifacts {
  if (!artifactsMemo) {
    const footballModel = readSpacetimeDataJson<LiveInferenceArtifacts["footballModel"]>(
      "model_motor_a.json",
    );
    const nflModelJson = readSpacetimeDataJson<LiveInferenceArtifacts["nflModel"]>(
      "model_nfl.json",
    );
    const multisportModelJson = readSpacetimeDataJson<LiveInferenceArtifacts["multisportModel"]>(
      "model_multisport.json",
    );
    artifactsMemo = {
      footballModel,
      nflModel: {
        ...nflModelJson,
        sport: "nfl",
      },
      multisportModel: {
        ...multisportModelJson,
        sports: {
          nhl: { ...multisportModelJson.sports.nhl, sport: "nhl" },
          mlb: { ...multisportModelJson.sports.mlb, sport: "mlb" },
          nba: { ...multisportModelJson.sports.nba, sport: "nba" },
          ncaaf: { ...multisportModelJson.sports.ncaaf, sport: "ncaaf" },
        },
      },
    };
  }
  return artifactsMemo;
}

export const LEAGUE_TO_V3: Readonly<Record<string, string>> = {
  "premier-league": "epl",
};

const TEAM_ALIASES: Record<string, string> = {
  "chivas guadalajara": "guadalajara",
  chivas: "guadalajara",
  "xolos tijuana": "tijuana",
  "racing santander": "real racing",
};

const TOKEN_ALIASES: Record<string, string> = {
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

const GENERIC_TOKENS = new Set([
  "fc", "cf", "cd", "ac", "as", "afc", "sv", "vfl", "vfb", "rc", "rcd", "ssc", "us", "club",
  "de", "del", "la", "calcio", "sc", "ca", "ud", "sd", "ogc", "tsg", "bv", "bsc", "fsv", "1",
  "1899", "1900", "1904", "1907", "1909", "1913", "1846", "1848", "04", "05", "07", "09", "29",
  "and", "es", "estac", "osc", "losc", "bc", "alsace",
]);

const DRIVER_LABELS: Record<string, string> = {
  clubelo_and_xg_elo: "Fuerza estructural y xG",
  lineup_availability_delta: "Disponibilidad de la plantilla",
  stadium_altitude_physics: "Altitud del estadio",
  sumersports_epa_success: "Eficiencia por jugada",
  injuries_qb_depth: "Lesiones (QB y titulares)",
  referee_penalties: "Disciplina y arbitraje",
  weather_stadium_physics: "Clima y estadio",
};

const BOOK_LABELS: Record<string, string> = {
  pinnacle: "Pinnacle",
  smarkets: "Smarkets",
  matchbook: "Matchbook",
  bet365: "Bet365",
  bwin: "Bwin",
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  betonline: "BetOnline",
  betonlineag: "BetOnline",
  betcris: "Betcris",
  codere: "Codere",
  williamhill: "William Hill",
  william_hill: "William Hill",
  unibet: "Unibet",
  betrivers: "BetRivers",
  novibet: "Novibet",
  betway: "Betway",
  playdoit: "Playdoit",
};

export function formatBookLabel(book: string): string {
  const clean = book.trim().toLowerCase();
  if (BOOK_LABELS[clean]) return BOOK_LABELS[clean]!;
  if (!clean) return "Casa";
  return clean
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function tokens(raw: string): string[] {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0 && !GENERIC_TOKENS.has(t))
    .map((t) => TOKEN_ALIASES[t] ?? t);
}

function aliasTokens(raw: string): string[] {
  const t = tokens(raw);
  const alias = TEAM_ALIASES[t.join(" ")];
  return alias ? tokens(alias) : t;
}

export function teamScore(a: string, b: string): number {
  const ta = aliasTokens(a);
  const tb = aliasTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(long);
  return short.every((t) => longSet.has(t)) ? short.length / long.length : 0;
}

function best<T>(items: readonly T[], score: (item: T) => number): T | null {
  let top: T | null = null;
  let topScore = 0;
  for (const item of items) {
    const s = score(item);
    if (s > topScore) {
      top = item;
      topScore = s;
    }
  }
  return top;
}

interface LeagueIndex {
  teams: TeamMasterFeatureRecord[];
  records: LiveMatchupEdgeRecord[];
}

let cache: {
  teamIndex: TeamMasterIndex;
  byLeague: Map<string, LeagueIndex>;
  signals: Map<string, SpacetimeSignal | null>;
  hourBucket: number;
} | null = null;

function getCache() {
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  if (cache && cache.hourBucket !== hourBucket) cache.signals.clear();
  if (cache) {
    cache.hourBucket = hourBucket;
    return cache;
  }
  const liveSnapshot = getLiveSnapshot();
  const inferenceArtifacts = getArtifacts();
  const byLeague = new Map<string, LeagueIndex>();
  for (const team of liveSnapshot.team_master_records) {
    const entry = byLeague.get(team.league) ?? { teams: [], records: [] };
    entry.teams.push(team);
    byLeague.set(team.league, entry);
  }
  for (const rec of liveSnapshot.edge_matrix_records) {
    const entry = byLeague.get(rec.league) ?? { teams: [], records: [] };
    entry.records.push(rec);
    byLeague.set(rec.league, entry);
  }
  cache = {
    teamIndex: buildTeamMasterIndex(liveSnapshot.team_master_records, inferenceArtifacts.nflModel),
    byLeague,
    signals: new Map(),
    hourBucket,
  };
  return cache;
}

function findTeam(index: LeagueIndex, name: string): TeamMasterFeatureRecord | null {
  return best(index.teams, (t) => teamScore(t.team_name, name));
}

function recordFor(game: MatchAnalysis, v3League: string, index: LeagueIndex): LiveMatchupEdgeRecord | null {
  const live = best(index.records, (r) => {
    const home = teamScore(r.home_team, game.home.name);
    const away = teamScore(r.away_team, game.away.name);
    return home > 0 && away > 0 ? home + away : 0;
  });
  if (live) return live;

  const home = findTeam(index, game.home.name);
  const away = findTeam(index, game.away.name);
  if (!home || !away) return null;
  const elevHome = home.stadium_elevation_m ?? null;
  const elevAway = away.stadium_elevation_m ?? null;
  return {
    matchup_id: game.id,
    sport: v3League === "nfl" ? "nfl" : "soccer",
    league: v3League,
    kickoff_utc: game.kickoffUtc,
    home_team: home.team_name,
    away_team: away.team_name,
    market_sources: [],
    altitude_diff_m: elevHome !== null && elevAway !== null ? elevHome - elevAway : null,
    home_stadium_name: home.stadium_name ?? null,
    home_stadium_elevation_m: elevHome,
    as_of_utc: home.as_of_utc ?? null,
  } as LiveMatchupEdgeRecord;
}

export function maxOddsAgeHours(): number {
  const raw = parseStrictFiniteNumber(process.env.PITCHLAB_MAX_ODDS_AGE_HOURS);
  return raw !== null && raw > 0 ? raw : 72;
}

const MAX_FUTURE_SKEW_MS = 6 * 3_600_000;

export function isMarketFresh(asOfUtc: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!asOfUtc) return false;
  const t = Date.parse(asOfUtc);
  if (!Number.isFinite(t)) return false;
  const ageMs = nowMs - t;
  return ageMs >= -MAX_FUTURE_SKEW_MS && ageMs <= maxOddsAgeHours() * 3_600_000;
}

const OD_DATE = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: "America/Mexico_City",
});

export function bookLabelWithDate(book: string, asOfUtc: string | null | undefined): string {
  if (!asOfUtc || !Number.isFinite(Date.parse(asOfUtc))) return book;
  return `${book} · ${OD_DATE.format(new Date(asOfUtc)).replace(".", "")}`;
}

function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function toSignal(
  rec: LiveMatchupEdgeRecord,
  pred: LiveMatchupPrediction,
  homeTeam: TeamMasterFeatureRecord | null,
  awayTeam: TeamMasterFeatureRecord | null,
): SpacetimeSignal {
  const source = (rec.market_sources ?? []).find((s) => {
    const label = BOOK_LABELS[s];
    return Boolean(label) && isPermittedMarketQuoteBook(s, label);
  });
  const gate = pred.geodesicV2;
  const oddsBySide = new Map((gate?.outcomes ?? []).map((o) => [o.side, o.decimalOdds]));
  const homeOdds = oddsBySide.get("home");
  const awayOdds = oddsBySide.get("away");
  const hasMarket = Boolean(
    pred.marketProbsAdaptive && source && homeOdds && awayOdds && isMarketFresh(rec.as_of_utc),
  );
  const probs = hasMarket ? pred.finalProbs : pred.sportsProbs;

  const missingPct = (t: TeamMasterFeatureRecord | null) =>
    t?.missing_market_value_ratio === null || t?.missing_market_value_ratio === undefined
      ? null
      : round(t.missing_market_value_ratio * 100, 1);

  return {
    engineName: hasMarket ? pred.activeModelName : pred.sportsModelName,
    sportsEngineName: pred.sportsModelName,
    probs: {
      home: probs.pHome,
      draw: probs.pDraw,
      away: probs.pAway,
    },
    market:
      hasMarket && pred.marketProbsAdaptive && source && homeOdds && awayOdds
        ? {
            bookLabel: bookLabelWithDate(BOOK_LABELS[source]!, rec.as_of_utc),
            asOfUtc: rec.as_of_utc ?? null,
            overround: pred.marketProbsAdaptive.overround,
            noVig: {
              home: pred.marketProbsAdaptive.pHome,
              draw: pred.marketProbsAdaptive.pDraw,
              away: pred.marketProbsAdaptive.pAway,
            },
            odds: {
              home: round(homeOdds, 2),
              draw: oddsBySide.has("draw") ? round(oddsBySide.get("draw")!, 2) : null,
              away: round(awayOdds, 2),
            },
          }
        : null,
    value: hasMarket
      ? (gate?.outcomes ?? []).map((o) => ({
          side: o.side as "home" | "draw" | "away",
          prob: o.prob,
          decimalOdds: o.decimalOdds,
          edge: o.edge,
          ev: o.ev,
          stake: o.recommendedStake,
          vetoed: o.vetoedByRlm,
          institutionalConfirmation: o.institutionalConfirmation,
        }))
      : [],
    expectedTotal: pred.expectedTotal,
    expectedMargin: pred.expectedMargin,
    drivers: pred.drivers
      .filter((d) => DRIVER_LABELS[d.factor])
      .map((d) => ({ label: DRIVER_LABELS[d.factor]!, impactLogit: d.impactLogit })),
    availability: {
      homeInjured: homeTeam?.injured_players_count ?? null,
      awayInjured: awayTeam?.injured_players_count ?? null,
      homeMissingValuePct: missingPct(homeTeam),
      awayMissingValuePct: missingPct(awayTeam),
    },
    stadium: {
      name: rec.home_stadium_name ?? homeTeam?.stadium_name ?? null,
      elevationM: rec.home_stadium_elevation_m ?? homeTeam?.stadium_elevation_m ?? null,
    },
  };
}

export function spacetimeSignalFor(game: MatchAnalysis): SpacetimeSignal | null {
  if (game.sport !== "football" && game.sport !== "american-football") {
    return null;
  }
  const { teamIndex, byLeague, signals } = getCache();
  const key = `${game.league}:${game.id}`;
  if (signals.has(key)) return signals.get(key) ?? null;

  let signal: SpacetimeSignal | null = null;
  const v3League = LEAGUE_TO_V3[game.league] ?? game.league;
  const index = byLeague.get(v3League);
  if (index && game.status !== "FT") {
    const rec = recordFor(game, v3League, index);
    if (rec) {
      try {
        const pred = predictLiveMatchup(rec, teamIndex, getArtifacts());
        const sum = pred.finalProbs.pHome + pred.finalProbs.pDraw + pred.finalProbs.pAway;
        if (Number.isFinite(sum) && Math.abs(sum - 1) < 1e-6) {
          signal = toSignal(rec, pred, findTeam(index, rec.home_team), findTeam(index, rec.away_team));
        }
      } catch (err) {
        logSecurityEvent("warn", "spacetime_signal_failed", {
          gameId: game.id,
          league: game.league,
          error: err,
        });
      }
    }
  }
  signals.set(key, signal);
  return signal;
}

export function buildSpacetimeSignals(
  games: readonly MatchAnalysis[],
): Record<string, SpacetimeSignal> {
  const out: Record<string, SpacetimeSignal> = {};
  for (const game of games) {
    const signal = spacetimeSignalFor(game);
    if (signal) out[game.id] = signal;
  }
  return out;
}

export const SPACETIME_SNAPSHOT_GENERATED_AT: string =
  readLiveSnapshotGeneratedAtFast() ?? getLiveSnapshot().generated_at;

export function findSpacetimeTeamRecord(
  league: string,
  teamName: string,
  teamSlug?: string,
): TeamMasterFeatureRecord | null {
  const v3League = LEAGUE_TO_V3[league] ?? league;
  const index = getCache().byLeague.get(v3League);
  if (!index) return null;
  const byName = findTeam(index, teamName);
  if (byName) return byName;
  if (teamSlug) {
    const cleanedSlug = teamSlug.replace(/^[a-z0-9-]+\./, "").replace(/-/g, " ");
    return findTeam(index, cleanedSlug) ?? null;
  }
  return null;
}
