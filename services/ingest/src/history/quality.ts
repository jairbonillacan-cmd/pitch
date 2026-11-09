/**
 * Auditoría del dataset histórico.
 *
 * Los errores bloquean la publicación del dataset (identidades duplicadas, dos partidos
 * del mismo equipo en la misma jornada, marcadores imposibles). Las advertencias señalan
 * cosas que requieren revisión humana pero no invalidan el corpus: variantes de nombre de
 * un equipo, temporadas incompletas o marcadores atípicos.
 */
import type { HistoricalGame, LeagueQuality, QualityIssue } from "./schema.js";
import type { HistoryLeagueConfig } from "./leagues.js";
import { teamKeyTokens } from "./teams.js";

const SOCCER_SCORE_CEILING = 15;
const NFL_SCORE_CEILING = 90;
const MAX_VARIANT_WARNINGS = 12;

interface TeamAccumulator {
  games: number;
  seasons: Set<string>;
}

export interface HistoryAuditInput {
  league: HistoryLeagueConfig;
  games: readonly HistoricalGame[];
}

export interface HistoryAuditResult {
  leagues: LeagueQuality[];
  issues: QualityIssue[];
  summary: { errors: number; warnings: number; checks: string[] };
}

function firstAndLastDates(games: readonly HistoricalGame[]): {
  firstDate: string | null;
  lastDate: string | null;
} {
  if (games.length === 0) return { firstDate: null, lastDate: null };
  let first = games[0]!.date;
  let last = games[0]!.date;
  for (const game of games) {
    if (game.date < first) first = game.date;
    if (game.date > last) last = game.date;
  }
  return { firstDate: first, lastDate: last };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Pares de claves donde una contiene todos los tokens de la otra y **nunca coinciden en
 * la misma temporada**: el síntoma de "Atlético de Madrid" y "Atlético Madrid" siendo el
 * mismo club con dos nombres. Dos clubes distintos (Barcelona y Espanyol Barcelona)
 * juegan la misma temporada y por eso no se marcan.
 */
function findVariantPairs(
  league: HistoryLeagueConfig,
  teamSeasons: ReadonlyMap<string, ReadonlySet<string>>,
): Array<{ a: string; b: string }> {
  const distinctPairs = (league.distinctTeamPairs ?? []).map(
    ([left, right]) => new Set([`${league.id}.${left}`, `${league.id}.${right}`]),
  );
  const isKnownDistinct = (a: string, b: string): boolean =>
    distinctPairs.some((pair) => pair.has(a) && pair.has(b));

  const tokenized = [...teamSeasons.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, seasons]) => ({ key, tokens: new Set(teamKeyTokens(key)), seasons }));

  const pairs: Array<{ a: string; b: string }> = [];
  for (let i = 0; i < tokenized.length; i++) {
    for (let j = i + 1; j < tokenized.length; j++) {
      const left = tokenized[i]!;
      const right = tokenized[j]!;
      if (left.tokens.size === 0 || right.tokens.size === 0) continue;
      if (isKnownDistinct(left.key, right.key)) continue;
      const [small, large] =
        left.tokens.size <= right.tokens.size
          ? [left.tokens, right.tokens]
          : [right.tokens, left.tokens];
      let subset = true;
      for (const token of small) {
        if (!large.has(token)) {
          subset = false;
          break;
        }
      }
      if (!subset) continue;

      let shareSeason = false;
      for (const season of left.seasons) {
        if (right.seasons.has(season)) {
          shareSeason = true;
          break;
        }
      }
      if (!shareSeason) pairs.push({ a: left.key, b: right.key });
    }
  }
  return pairs;
}

export function auditLeague(input: HistoryAuditInput): LeagueQuality {
  const { league, games } = input;
  const issues: QualityIssue[] = [];
  const scoreCeiling = league.sport === "soccer" ? SOCCER_SCORE_CEILING : NFL_SCORE_CEILING;

  // 1. Identificadores únicos.
  const byId = new Map<string, HistoricalGame>();
  const duplicateIds: string[] = [];
  for (const game of games) {
    if (byId.has(game.id)) {
      duplicateIds.push(game.id);
      continue;
    }
    byId.set(game.id, game);
  }
  if (duplicateIds.length > 0) {
    issues.push({
      severity: "error",
      code: "duplicate_game_id",
      league: league.id,
      message: `${duplicateIds.length} partidos comparten identificador.`,
      sample: duplicateIds.slice(0, 10),
    });
  }

  // 2. Un equipo no juega dos veces en la misma jornada de la misma temporada.
  const perPeriod = new Map<string, HistoricalGame[]>();
  for (const game of byId.values()) {
    const key = `${game.season}|${game.stage ?? ""}|${game.period}`;
    const list = perPeriod.get(key) ?? [];
    list.push(game);
    perPeriod.set(key, list);
  }
  const doubleBooked: string[] = [];
  for (const [key, list] of perPeriod) {
    const seen = new Set<string>();
    for (const game of list) {
      for (const team of [game.homeTeam, game.awayTeam]) {
        if (seen.has(team)) {
          doubleBooked.push(`${key}:${team}`);
        }
        seen.add(team);
      }
    }
  }
  if (doubleBooked.length > 0) {
    issues.push({
      severity: "error",
      code: "team_plays_twice_in_period",
      league: league.id,
      message: `${doubleBooked.length} equipos aparecen dos veces en la misma jornada.`,
      sample: doubleBooked.slice(0, 10),
    });
  }

  // 3. Marcadores imposibles o atípicos y equipos idénticos en un partido.
  const sameTeam: string[] = [];
  const extremeScores: string[] = [];
  for (const game of byId.values()) {
    if (game.homeTeam === game.awayTeam) sameTeam.push(game.id);
    if (game.homeScore > scoreCeiling || game.awayScore > scoreCeiling) {
      extremeScores.push(`${game.id} ${game.homeScore}-${game.awayScore}`);
    }
  }
  if (sameTeam.length > 0) {
    issues.push({
      severity: "error",
      code: "team_plays_itself",
      league: league.id,
      message: `${sameTeam.length} partidos tienen el mismo equipo como local y visitante.`,
      sample: sameTeam.slice(0, 10),
    });
  }
  if (extremeScores.length > 0) {
    issues.push({
      severity: "warning",
      code: "extreme_score",
      league: league.id,
      message: `${extremeScores.length} partidos superan ${scoreCeiling} en un marcador.`,
      sample: extremeScores.slice(0, 10),
    });
  }

  // 4. Cobertura por temporada.
  const seasonStats = new Map<string, { rows: number; first: string; last: string; teams: Set<string> }>();
  for (const game of byId.values()) {
    const stat = seasonStats.get(game.season) ?? {
      rows: 0,
      first: game.date,
      last: game.date,
      teams: new Set<string>(),
    };
    stat.rows++;
    stat.teams.add(game.homeTeam);
    stat.teams.add(game.awayTeam);
    if (game.date < stat.first) stat.first = game.date;
    if (game.date > stat.last) stat.last = game.date;
    seasonStats.set(game.season, stat);
  }

  const orderedSeasons = [...seasonStats.entries()].sort(([a], [b]) => a.localeCompare(b));
  const latestSeason = orderedSeasons.length > 0 ? orderedSeasons[orderedSeasons.length - 1]![0] : null;

  const seasons = orderedSeasons.map(([season, stat]) => {
    const expected = league.expectedGamesPerSeason;
    let status: "complete" | "partial" | "missing" = "complete";
    if (expected !== undefined) {
      status = stat.rows >= expected ? "complete" : stat.rows > 0 ? "partial" : "missing";
    }
    return {
      season,
      rows: stat.rows,
      firstDate: stat.first,
      lastDate: stat.last,
      status,
    };
  });

  const partialSeasons = seasons.filter((season) => season.status === "partial");
  if (partialSeasons.length > 0) {
    issues.push({
      severity: "info",
      code: "season_partial",
      league: league.id,
      message: `${partialSeasons.length} temporadas tienen menos partidos que la referencia (${league.expectedGamesPerSeason}); suele ser la temporada en curso.`,
      sample: partialSeasons.map((season) => `${season.season}: ${season.rows}`),
    });
  }

  // 5. Temporadas anómalas por número de equipos. Una liga cambia de 20 a 18 clubes
  //    (Ligue 1), así que la mediana se calcula dentro de cada tamaño de liga.
  const byTeamCount = new Map<number, Array<{ season: string; rows: number }>>();
  for (const [season, stat] of seasonStats) {
    const count = stat.teams.size;
    const list = byTeamCount.get(count) ?? [];
    list.push({ season, rows: stat.rows });
    byTeamCount.set(count, list);
  }

  const underMedian: string[] = [];
  const inProgress: string[] = [];
  for (const [, list] of byTeamCount) {
    const groupMedian = median(list.map((entry) => entry.rows));
    if (groupMedian <= 0) continue;
    for (const entry of list) {
      if (entry.rows >= groupMedian * 0.85) continue;
      if (entry.season === latestSeason) inProgress.push(`${entry.season}: ${entry.rows}`);
      else underMedian.push(`${entry.season}: ${entry.rows} de ~${Math.round(groupMedian)}`);
    }
  }
  if (underMedian.length > 0) {
    issues.push({
      severity: "warning",
      code: "season_under_median",
      league: league.id,
      message: `${underMedian.length} temporadas tienen menos del 85 % de la mediana de su grupo (posible cancelación o datos incompletos).`,
      sample: underMedian,
    });
  }
  if (inProgress.length > 0) {
    issues.push({
      severity: "info",
      code: "season_in_progress",
      league: league.id,
      message: `${inProgress.length} temporadas en curso tienen menos partidos jugados que una temporada cerrada.`,
      sample: inProgress,
    });
  }

  // 6. Equipos: partidos, temporadas y variantes de identidad.
  const teams = new Map<string, TeamAccumulator>();
  const seasonSetByTeam = new Map<string, Set<string>>();
  for (const game of byId.values()) {
    for (const team of [game.homeTeam, game.awayTeam]) {
      const acc = teams.get(team) ?? { games: 0, seasons: new Set<string>() };
      acc.games++;
      acc.seasons.add(game.season);
      teams.set(team, acc);

      const seasonSet = seasonSetByTeam.get(team) ?? new Set<string>();
      seasonSet.add(game.season);
      seasonSetByTeam.set(team, seasonSet);
    }
  }

  const variantPairs = findVariantPairs(league, seasonSetByTeam);
  if (variantPairs.length > 0) {
    issues.push({
      severity: "warning",
      code: "possible_team_duplicates",
      league: league.id,
      message: `${variantPairs.length} pares de equipos comparten tokens y no coinciden en ninguna temporada: podrían ser la misma identidad con dos nombres.`,
      sample: variantPairs
        .slice(0, MAX_VARIANT_WARNINGS)
        .map((pair) => `${pair.a} ↔ ${pair.b}`),
    });
  }

  const rareTeams = [...teams.entries()].filter(([, acc]) => acc.games < 3);
  if (rareTeams.length > 0) {
    issues.push({
      severity: "info",
      code: "teams_with_few_games",
      league: league.id,
      message: `${rareTeams.length} equipos tienen menos de 3 partidos en el histórico.`,
      sample: rareTeams.slice(0, 10).map(([key, acc]) => `${key}: ${acc.games}`),
    });
  }

  // 7. Tasas agregadas (control de cordura del corpus).
  let homeGoals = 0;
  let awayGoals = 0;
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  for (const game of byId.values()) {
    homeGoals += game.homeScore;
    awayGoals += game.awayScore;
    if (game.homeScore > game.awayScore) homeWins++;
    else if (game.homeScore === game.awayScore) draws++;
    else awayWins++;
  }
  const total = byId.size || 1;
  const { firstDate, lastDate } = firstAndLastDates([...byId.values()]);

  return {
    league: league.id,
    rows: byId.size,
    seasons,
    teams: teams.size,
    firstDate,
    lastDate,
    rates: {
      homeWin: homeWins / total,
      draw: draws / total,
      awayWin: awayWins / total,
      avgTotalScore: (homeGoals + awayGoals) / total,
      avgHomeScore: homeGoals / total,
      avgAwayScore: awayGoals / total,
    },
    issues,
  };
}

const QUALITY_CHECKS = [
  "identificadores únicos por temporada, torneo y jornada",
  "un equipo por jornada y temporada",
  "marcadores dentro de rango",
  "cobertura por temporada frente a la referencia",
  "temporadas anómalas respecto de su grupo de equipos",
  "posibles identidades duplicadas de equipos (sin coincidencia de temporada)",
  "tasas agregadas de localía y goles",
];

export function auditHistory(inputs: readonly HistoryAuditInput[]): HistoryAuditResult {
  const leagues = inputs.map((input) => auditLeague(input));
  const issues = leagues.flatMap((league) => league.issues);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return {
    leagues,
    issues,
    summary: { errors, warnings, checks: QUALITY_CHECKS },
  };
}
