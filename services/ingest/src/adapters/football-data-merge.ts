/**
 * Completa un calendario de openfootball con resultados, estado y hora real de
 * football-data.org.
 *
 * openfootball se conserva como esqueleto (ids de partido y de equipo, que enlazan con el
 * historial y con los análisis ya publicados). De football-data.org se toma solo lo que
 * openfootball no tiene al día: marcador final, estado y hora UTC. Los partidos se emparejan
 * por jornada y por parecido de nombres; lo que no empareja se queda como estaba.
 */
import type { FootballTeamRateInput } from "@pitchlab/engines-reference";
import type { GameDTO } from "@pitchlab/contracts";
import { FootballDataResponseSchema } from "./football-data.js";
import type { NormalizedOpenFootballSeason } from "./openfootball.js";

const STOP_WORDS = new Set([
  "fc", "cf", "ac", "as", "sc", "ss", "ssc", "sv", "afc", "cd", "ud", "rc", "rcd", "ca", "sd",
  "club", "de", "del", "la", "le", "les", "calcio", "football", "futbol", "1", "tsg", "vfb", "vfl",
  "fsv", "bsc", "sport", "sporting", "olympique", "stade", "ogc", "losc", "us", "ef", "hellas",
  "balompie", "racing", "deportivo", "and", "1899", "1846", "1848", "1904", "1907", "1909", "1910",
  "1913", "04", "05", "96",
]);

/** Tokens comparables de un nombre de club («FC Bayern München» → bayern, munchen). */
export function nameTokens(name: string): Set<string> {
  const norm = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = norm.split(" ").filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  return new Set(tokens.length > 0 ? tokens : norm.split(" "));
}

/** Parecido entre nombres (0-1): solapamiento de tokens, con prefijos de 4+ letras. */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  let hits = 0;
  for (const x of ta) {
    for (const y of tb) {
      if (x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)))) {
        hits++;
        break;
      }
    }
  }
  return hits / Math.max(1, Math.min(ta.size, tb.size));
}

type FdMatch = ReturnType<typeof FootballDataResponseSchema.parse>["matches"][number];

function fdNames(team: FdMatch["homeTeam"]): string[] {
  return [team.name, team.shortName ?? ""].filter(Boolean);
}

function teamScore(game: GameDTO["home"], fdTeam: FdMatch["homeTeam"]): number {
  const ours = [game.name, game.shortName].filter(Boolean);
  let best = 0;
  for (const o of ours) for (const f of fdNames(fdTeam)) best = Math.max(best, nameSimilarity(o, f));
  return best;
}

function mapStatus(match: FdMatch): GameDTO["status"] {
  const ft = match.score?.fullTime;
  const hasScore = ft?.home !== null && ft?.home !== undefined && ft?.away !== null && ft?.away !== undefined;
  switch (match.status) {
    case "FINISHED":
    case "AWARDED":
      return hasScore ? "final" : "scheduled";
    case "IN_PLAY":
    case "PAUSED":
    case "LIVE":
      return "in_progress";
    case "POSTPONED":
    case "SUSPENDED":
      return "postponed";
    case "CANCELLED":
      return "canceled";
    default:
      return "scheduled";
  }
}

export interface MergeReport {
  matched: number;
  unmatched: number;
  updatedResults: number;
}

/**
 * Devuelve la temporada con resultados, estados y horas de football-data.org, la jornada
 * activa recalculada y las tasas por equipo recalculadas con los resultados nuevos.
 */
export function mergeFootballDataIntoSeason(
  season: NormalizedOpenFootballSeason,
  rawJson: unknown,
  options: { referenceDate: string; now?: number },
): { season: NormalizedOpenFootballSeason; report: MergeReport } {
  const parsed = FootballDataResponseSchema.parse(rawJson);
  const observedAt = new Date(options.now ?? Date.now()).toISOString();
  const byMatchday = new Map<number, FdMatch[]>();
  for (const m of parsed.matches) {
    if (typeof m.matchday !== "number") continue;
    const list = byMatchday.get(m.matchday) ?? [];
    list.push(m);
    byMatchday.set(m.matchday, list);
  }

  let matched = 0;
  let updatedResults = 0;
  const used = new Set<number>();
  const allGames: GameDTO[] = season.allGames.map((game) => {
    const candidates = byMatchday.get(game.week ?? -1) ?? [];
    let best: { m: FdMatch; score: number } | null = null;
    for (const m of candidates) {
      if (used.has(m.id)) continue;
      const h = teamScore(game.home, m.homeTeam);
      const a = teamScore(game.away, m.awayTeam);
      if (h === 0 || a === 0) continue;
      const score = h + a;
      if (!best || score > best.score) best = { m, score };
    }
    if (!best || best.score < 1) return game;
    used.add(best.m.id);
    matched++;

    const status = mapStatus(best.m);
    const ft = best.m.score?.fullTime;
    const next: GameDTO = { ...game, startTime: best.m.utcDate, status };
    if (status === "final" && ft && ft.home !== null && ft.away !== null) {
      if (!game.result || game.result.home !== ft.home || game.result.away !== ft.away) updatedResults++;
      next.result = { home: ft.home, away: ft.away, observedAt, source: "football-data" };
    } else if (status !== "final") {
      delete next.result;
    }
    return next;
  });

  // Jornada activa: la primera con partidos sin terminar y no atrasados más de 3 días.
  const refMs = Date.parse(`${options.referenceDate}T12:00:00Z`);
  const matchdays = [...new Set(allGames.map((g) => g.week ?? 0))].sort((a, b) => a - b);
  const open = matchdays.filter((md) =>
    allGames.some(
      (g) => g.week === md && g.status !== "final" && g.status !== "canceled" && Date.parse(g.startTime) >= refMs - 3 * 86_400_000,
    ),
  );
  const activeMatchday = open[0] ?? matchdays[matchdays.length - 1] ?? season.activeMatchday;
  const activeRoundGames = allGames
    .filter((g) => g.week === activeMatchday)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Tasas por equipo con los partidos terminados de jornadas anteriores (sin fuga).
  const stats = new Map<string, { gf: number; ga: number; gp: number }>();
  for (const t of season.teamRateInputs) stats.set(t.teamId, { gf: 0, ga: 0, gp: 0 });
  for (const g of allGames) {
    if (g.status !== "final" || !g.result || (g.week ?? 0) >= activeMatchday) continue;
    const h = stats.get(g.home.id);
    const a = stats.get(g.away.id);
    if (h) {
      h.gf += g.result.home;
      h.ga += g.result.away;
      h.gp += 1;
    }
    if (a) {
      a.gf += g.result.away;
      a.ga += g.result.home;
      a.gp += 1;
    }
  }
  const teamRateInputs: FootballTeamRateInput[] = season.teamRateInputs.map((t) => {
    const st = stats.get(t.teamId) ?? { gf: 0, ga: 0, gp: 0 };
    return { ...t, goalsFor: st.gf, goalsAgainst: st.ga, gamesPlayed: st.gp };
  });

  return {
    season: {
      ...season,
      allGames,
      activeMatchday,
      periodLabel: `Jornada ${activeMatchday}`,
      activeRoundGames,
      teamRateInputs,
    },
    report: { matched, unmatched: season.allGames.length - matched, updatedResults },
  };
}
