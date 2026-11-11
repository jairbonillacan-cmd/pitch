import type { MatchAnalysis } from "@pitchlab/contracts";
import {
  buildTeamMasterIndex,
  predictLiveMatchup,
  type LiveInferenceArtifacts,
  type LiveMatchupEdgeRecord,
  type LiveMatchupPrediction,
  type TeamMasterFeatureRecord,
  type TeamMasterIndex,
} from "@pitchlab/spacetime";
import footballModelJson from "@pitchlab/spacetime/data/model_motor_a.json";
import multisportModelJson from "@pitchlab/spacetime/data/model_multisport.json";
import nflModelJson from "@pitchlab/spacetime/data/model_nfl.json";
import liveSnapshotJson from "@pitchlab/spacetime/data/live_matchday_v3_snapshot.json";
import type { SpacetimeSignal } from "@pitchlab/ui";

/**
 * Corre PitchLab Spacetime Suite v3.0 sobre los partidos de los snapshots de la app.
 *
 * - Si el partido está en la matriz en vivo de v3.0 (con momios reales), se usa ese registro:
 *   probabilidad final con mercado, momios de casa y evaluación de valor de Geodesic v2.0.
 * - Si no, se construye el registro desde las fichas de equipo y se obtiene solo la
 *   probabilidad deportiva (sin momios ni valor).
 * - Si algún equipo no tiene ficha en v3.0, el partido se queda sin señal y la UI usa el
 *   modelo del snapshot.
 */

interface LiveSnapshot {
  generated_at: string;
  edge_matrix_records: LiveMatchupEdgeRecord[];
  team_master_records: TeamMasterFeatureRecord[];
}

const snapshot = liveSnapshotJson as unknown as LiveSnapshot;
const artifacts = {
  footballModel: footballModelJson,
  nflModel: nflModelJson,
  multisportModel: multisportModelJson,
} as unknown as LiveInferenceArtifacts;

/** Liga de la app → liga en la matriz de v3.0. */
const LEAGUE_TO_V3: Readonly<Record<string, string>> = {
  "premier-league": "epl",
};

/** Nombres completos de la app que no se parecen al de la ficha de v3.0. */
const TEAM_ALIASES: Record<string, string> = {
  "chivas guadalajara": "guadalajara",
  chivas: "guadalajara",
  "xolos tijuana": "tijuana",
  "racing santander": "real racing",
};

/** v3.0 usa nombres en español: palabra de la app → palabra de la ficha. */
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

/** Palabras genéricas que no distinguen equipos. */
const GENERIC_TOKENS = new Set([
  "fc", "cf", "cd", "ac", "as", "afc", "sv", "vfl", "vfb", "rc", "rcd", "ssc", "us", "club",
  "de", "del", "la", "calcio", "sc", "ca", "ud", "sd", "ogc", "tsg", "bv", "bsc", "fsv", "1",
  "1899", "1900", "1904", "1907", "1909", "1913", "1846", "1848", "04", "05", "07", "09", "29",
  "and", "es", "estac", "osc", "losc", "bc", "alsace",
]);

/** Factores del motor → etiqueta propia (regla FD-16: sin nombres de proveedores ni jerga). */
const DRIVER_LABELS: Record<string, string> = {
  clubelo_and_xg_elo: "Fuerza estructural y xG",
  lineup_availability_delta: "Disponibilidad de la plantilla",
  stadium_altitude_physics: "Altitud del estadio",
  sumersports_epa_success: "Eficiencia por jugada",
  injuries_qb_depth: "Lesiones (QB y titulares)",
  referee_penalties: "Disciplina y arbitraje",
  weather_stadium_physics: "Clima y estadio",
};

/** Fuente de momios → nombre de casa visible. Las fuentes de señales no son casas. */
const BOOK_LABELS: Record<string, string> = {
  caliente_mx: "Caliente",
  pinnacle: "Pinnacle",
};

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

/**
 * Parecido entre dos nombres: 0 si las palabras distintivas del más corto no están todas en
 * el otro; si lo están, la fracción del más largo que cubren (1 = mismos nombres).
 */
function teamScore(a: string, b: string): number {
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
  /** Hora en que se llenó el caché: la vigencia de los momios depende del reloj. */
  hourBucket: number;
} | null = null;

function getCache() {
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  if (cache && cache.hourBucket !== hourBucket) cache.signals.clear();
  if (cache) {
    cache.hourBucket = hourBucket;
    return cache;
  }
  const byLeague = new Map<string, LeagueIndex>();
  for (const team of snapshot.team_master_records) {
    const entry = byLeague.get(team.league) ?? { teams: [], records: [] };
    entry.teams.push(team);
    byLeague.set(team.league, entry);
  }
  for (const rec of snapshot.edge_matrix_records) {
    const entry = byLeague.get(rec.league) ?? { teams: [], records: [] };
    entry.records.push(rec);
    byLeague.set(rec.league, entry);
  }
  cache = {
    teamIndex: buildTeamMasterIndex(snapshot.team_master_records, artifacts.nflModel),
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

/**
 * Antigüedad máxima de un momio para mostrarlo como vigente (horas). Pasado ese plazo el
 * partido se muestra sin momios y con la probabilidad deportiva pura, no la mezclada con
 * un mercado viejo. Configurable con PITCHLAB_MAX_ODDS_AGE_HOURS.
 */
export function maxOddsAgeHours(): number {
  const raw = Number(process.env.PITCHLAB_MAX_ODDS_AGE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 72;
}

export function isMarketFresh(asOfUtc: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!asOfUtc) return false;
  const t = Date.parse(asOfUtc);
  return Number.isFinite(t) && nowMs - t <= maxOddsAgeHours() * 3_600_000;
}

const OD_DATE = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: "America/Mexico_City",
});

/** "Caliente · 9 nov": la casa y el día del corte de momios. */
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
  const source = (rec.market_sources ?? []).find((s) => BOOK_LABELS[s]);
  const gate = pred.geodesicV2;
  const oddsBySide = new Map((gate?.outcomes ?? []).map((o) => [o.side, o.decimalOdds]));
  const homeOdds = oddsBySide.get("home");
  const awayOdds = oddsBySide.get("away");
  const hasMarket = Boolean(
    pred.marketProbsAdaptive && source && homeOdds && awayOdds && isMarketFresh(rec.as_of_utc),
  );
  // Sin mercado vigente, la probabilidad es la deportiva (no la mezclada con momios viejos).
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

/** Señal de Spacetime v3.0 para un partido, o `null` si v3.0 no cubre a ambos equipos. */
export function spacetimeSignalFor(game: MatchAnalysis): SpacetimeSignal | null {
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
        const pred = predictLiveMatchup(rec, teamIndex, artifacts);
        const sum = pred.finalProbs.pHome + pred.finalProbs.pDraw + pred.finalProbs.pAway;
        if (Number.isFinite(sum) && Math.abs(sum - 1) < 1e-6) {
          signal = toSignal(rec, pred, findTeam(index, rec.home_team), findTeam(index, rec.away_team));
        }
      } catch (err) {
        console.warn(`[spacetime] sin señal para ${game.id}:`, err);
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

export const SPACETIME_SNAPSHOT_GENERATED_AT = snapshot.generated_at;
