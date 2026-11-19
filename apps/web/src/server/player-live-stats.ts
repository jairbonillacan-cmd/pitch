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

  const gp = Number((byKey.get("GP") ?? byKey.get("G") ?? "0").replace(/,/g, ""));
  const appearances = Number.isFinite(gp) && gp > 0 ? Math.round(gp) : 0;

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
    const h = Number(byKey.get("H"));
    const ab = Number(byKey.get("AB"));
    if (Number.isFinite(h) && Number.isFinite(ab) && ab > 0) {
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
