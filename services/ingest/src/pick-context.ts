/**
 * Contexto previo al partido para el análisis publicado: historial entre ambos equipos,
 * días de descanso y picks para análisis que se publicaron antes de que existieran.
 *
 * Integridad: las probabilidades publicadas nunca cambian. A un análisis preservado solo
 * se le agregan picks (derivados de esas mismas probabilidades) si el partido no ha
 * empezado, con la hora en `picksAt`.
 */
import {
  asMarketKey,
  type GameAnalysis,
  type GameDTO,
  type HeadToHeadRow,
  type TeamSeasonRate,
} from "@pitchlab/contracts";
import {
  candidatesFromGroups,
  coherentScoreFromProjection,
  confidenceIndex,
  featuredPick,
  selectPicks,
  type Pick,
} from "@pitchlab/models";

export interface ContextRow {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
}

const DAY = 86_400_000;
const MAX_REST_DAYS = 30;

/**
 * Un pick solo vale si se calculó antes del inicio. Si el análisis se genera con el
 * partido ya empezado (la fuente no trae aún el resultado, o es una lectura retro), se
 * publica sin picks ni confianza: nunca se muestra un pick sobre un partido en curso o
 * terminado como si fuera previo.
 */
export function withPreKickoffPicksOnly(
  analysis: GameAnalysis,
  game: GameDTO,
  generatedAt: string,
): GameAnalysis {
  const start = Date.parse(game.startTime);
  const generated = Date.parse(generatedAt);
  const preKickoff =
    game.status === "scheduled" && Number.isFinite(start) && Number.isFinite(generated) && generated < start;
  if (preKickoff) return analysis.picks ? { ...analysis, picksAt: generatedAt } : analysis;
  return stripPicks(analysis);
}

function stripPicks(analysis: GameAnalysis): GameAnalysis {
  const { picks: _picks, confidence: _confidence, picksAt: _picksAt, ...rest } = analysis;
  void _picks;
  void _confidence;
  void _picksAt;
  return rest;
}

/**
 * Un análisis preservado conserva sus picks solo si consta que se calcularon antes del
 * inicio (`picksAt` < inicio). Sin esa constancia, se retiran.
 */
export function keepVerifiedPicks(analysis: GameAnalysis, game: GameDTO): GameAnalysis {
  if (!analysis.picks) return analysis;
  const start = Date.parse(game.startTime);
  const at = analysis.picksAt ? Date.parse(analysis.picksAt) : Number.NaN;
  return Number.isFinite(at) && Number.isFinite(start) && at < start ? analysis : stripPicks(analysis);
}

/** Últimos `limit` cruces entre ambos equipos antes de la fecha del partido. */
export function headToHead(
  rows: readonly ContextRow[],
  game: GameDTO,
  limit = 5,
): HeadToHeadRow[] {
  const date = game.startTime.slice(0, 10);
  const pair = new Set<string>([game.home.id, game.away.id]);
  return rows
    .filter((r) => r.date < date && pair.has(r.home) && pair.has(r.away) && r.home !== r.away)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((r) => ({
      date: r.date,
      homeTeamId: r.home,
      awayTeamId: r.away,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
    }));
}

/** Días desde el último partido de cada equipo (solo temporada en curso). */
export function restDays(
  seasonRows: readonly ContextRow[],
  game: GameDTO,
): { home?: number; away?: number } {
  const date = game.startTime.slice(0, 10);
  const gameMs = Date.parse(`${date}T00:00:00Z`);
  const last = (team: string): number | undefined => {
    const prev = seasonRows
      .filter((r) => r.date < date && (r.home === team || r.away === team))
      .map((r) => r.date)
      .sort()
      .pop();
    if (!prev) return undefined;
    const days = Math.round((gameMs - Date.parse(`${prev}T00:00:00Z`)) / DAY);
    // Más de 30 días casi siempre significa que faltan resultados en la fuente, no descanso real.
    return days <= MAX_REST_DAYS ? days : undefined;
  };
  const out: { home?: number; away?: number } = {};
  const h = last(game.home.id);
  const a = last(game.away.id);
  if (h !== undefined) out.home = h;
  if (a !== undefined) out.away = a;
  return out;
}

/** Agrega historial y descanso al análisis sin tocar cifras. */
export function addMatchContext(
  analysis: GameAnalysis,
  game: GameDTO,
  allRows: readonly ContextRow[],
  seasonRows: readonly ContextRow[],
): GameAnalysis {
  const h2h = headToHead(allRows, game);
  const rest = restDays(seasonRows, game);
  return {
    ...analysis,
    insights: {
      why: analysis.insights?.why ?? [],
      ...(h2h.length > 0 ? { headToHead: h2h } : {}),
      ...(rest.home !== undefined || rest.away !== undefined ? { restDays: rest } : {}),
    },
  };
}

function leadSentence(analysis: GameAnalysis, game: GameDTO, picks: readonly Pick[], football: boolean): string {
  const [home, draw, away] = analysis.x12;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const featured = featuredPick(picks);
  const { projection } = analysis;
  if (football && featured && ["totals", "btts", "team_totals"].includes(featured.market)) {
    return `Se esperan ${projection.total.toFixed(1)} goles: ${projection.home.toFixed(1)} de ${game.home.shortName} y ${projection.away.toFixed(1)} de ${game.away.shortName}.`;
  }
  const leader = home >= away ? game.home.shortName : game.away.shortName;
  if (!football) {
    return `${leader} gana en ${pct(Math.max(home, away))} de los escenarios, por ${Math.abs(projection.margin ?? projection.home - projection.away).toFixed(1)} puntos en promedio.`;
  }
  return `${leader} gana en ${pct(Math.max(home, away))} de los escenarios; el empate, en ${pct(draw)}.`;
}

/**
 * Picks para un análisis ya publicado que aún no los tenía. Solo antes del inicio.
 * Las cifras del pick salen de las probabilidades publicadas; la confianza se calcula
 * con lo que se puede medir sin recalcular el modelo (favorito y muestra).
 */
export function enrichPreservedAnalysis(params: {
  previous: GameAnalysis;
  game: GameDTO;
  updatedAt: string;
  teamRates: Record<string, TeamSeasonRate>;
  football: boolean;
  freshWhy?: readonly string[];
}): GameAnalysis {
  const { previous, game, updatedAt, teamRates, football } = params;
  if (previous.picks) return previous;
  const started =
    game.status !== "scheduled" || Date.parse(game.startTime) <= Date.parse(updatedAt);
  if (started) return previous;

  const picks = selectPicks(candidatesFromGroups(previous.marketGroups), {
    maxScore: football ? 10 : 70,
  });
  const [home, draw, away] = previous.x12;
  const confidence = confidenceIndex({
    favorite: football ? Math.max(home, draw, away) : Math.max(home, away),
    minGamesPlayed: Math.min(
      teamRates[game.home.id]?.gamesPlayed ?? 0,
      teamRates[game.away.id]?.gamesPlayed ?? 0,
    ),
    outcomes: football ? 3 : 2,
  });
  const drivers = football ? (params.freshWhy ?? []).filter((t) => /anota|concede/.test(t)) : [];
  const why = [leadSentence(previous, game, picks, football), ...drivers].slice(0, 3);
  if (!football) {
    why.push(
      `Se esperan ${previous.projection.total.toFixed(1)} puntos: ${previous.projection.home.toFixed(1)} de ${game.home.shortName} y ${previous.projection.away.toFixed(1)} de ${game.away.shortName}.`,
    );
  }

  return {
    ...previous,
    picks: picks.map((pk) => ({ ...pk, market: asMarketKey(pk.market) })),
    confidence,
    ...(football
      ? {
          projectedScore: coherentScoreFromProjection(
            previous.projection.home,
            previous.projection.away,
            previous.x12,
          ),
        }
      : {}),
    insights: { ...previous.insights, why },
    picksAt: updatedAt,
  };
}
