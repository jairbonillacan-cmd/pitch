/**
 * Pipeline de generación de snapshots e integridad histórica (PREMVP-01 §H).
 *
 * Regla de historial íntegro:
 * Si un partido ya tenía un análisis publicado en un snapshot anterior **antes de su inicio**,
 * el pipeline **lo conserva tal cual** (sin recalcular probabilidades ni cambiar `publishedAt` o `inputsAsOf`)
 * y únicamente actualiza el marcador/estado final en `games` cuando exista.
 *
 * Versiones de modelo:
 *  - `v2` (por defecto): Dixon-Coles estimado (fútbol) y ratings ajustados por rival (NFL),
 *    con incertidumbre. Es un candidato: no ha pasado el gate de publicación.
 *  - `v1`: Baseline 0 de `@pitchlab/engines-reference` (paridad con el motor de referencia).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  GameAnalysisSchema,
  LeagueSnapshotSchema,
  asLeagueId,
  asSeasonId,
  type GameAnalysis,
  type GameDTO,
  type LeagueId,
  type StandingRow,
  type LeagueSnapshot,
  type Team,
  type TeamSeasonRate,
} from "@pitchlab/contracts";
import {
  getOfficialEspnLeagueLogoUrl,
  getOfficialEspnTeamLogoUrl,
} from "@pitchlab/sports-assets";
import {
  analyzeFootballGame,
  analyzeNflGame,
  computeFootballTeamRates,
  computeNflTeamRates,
  type FootballTeamRateInput,
  type NflTeamRateInput,
} from "@pitchlab/engines-reference";
import {
  analyzeFootballGameV2,
  analyzeNflGameV2,
  fitDixonColes,
  createEloTracker,
  type EloMatch,
  type EloTracker,
  fitNflRatings,
  type DixonColesModel,
  type FootballMatchRow,
  type NflMatchRow,
  type NflRatingsModel,
} from "@pitchlab/models";
import type { XgLookup } from "./xg-feed.js";
import { withCountProjections, type CountFeed } from "./counts-feed.js";
import { mapBzzoiroLeagueLogoUrl, mapBzzoiroTeamLogoUrl } from "./providers/bzzoiro.js";
import { computeNflStandings } from "./us-divisions.js";
import {
  addMatchContext,
  enrichPreservedAnalysis,
  keepVerifiedPicks,
  withPreKickoffPicksOnly,
  type ContextRow,
} from "./pick-context.js";

export type ModelVersion = "v1" | "v2";

export function shouldPreservePublishedAnalysis(
  previousAnalysis: GameAnalysis | undefined,
  game: GameDTO,
): boolean {
  if (!previousAnalysis) return false;
  const pubMs = new Date(previousAnalysis.publishedAt).getTime();
  const startMs = new Date(game.startTime).getTime();
  if (Number.isNaN(pubMs) || Number.isNaN(startMs)) return false;
  return pubMs <= startMs;
}

function publishedAtFor(game: GameDTO, updatedAt: string): string {
  const gameStartMs = new Date(game.startTime).getTime();
  const updatedMs = new Date(updatedAt).getTime();
  return game.status === "final" && !Number.isNaN(gameStartMs) && gameStartMs < updatedMs
    ? new Date(gameStartMs - 3600 * 1000).toISOString()
    : updatedAt;
}

/** Filas de partido terminado para estimar el modelo de fútbol. */
export function toFootballMatchRows(seasonGames: readonly GameDTO[]): FootballMatchRow[] {
  const rows: FootballMatchRow[] = [];
  for (const game of seasonGames) {
    if (game.status !== "final" || !game.result) continue;
    rows.push({
      date: game.startTime.slice(0, 10),
      home: game.home.id,
      away: game.away.id,
      homeGoals: game.result.home,
      awayGoals: game.result.away,
    });
  }
  return rows;
}

/** Filas de partido terminado para estimar los ratings NFL. */
export function toNflMatchRows(seasonGames: readonly GameDTO[]): NflMatchRow[] {
  const rows: NflMatchRow[] = [];
  for (const game of seasonGames) {
    if (game.status !== "final" || !game.result) continue;
    rows.push({
      week: game.week,
      date: game.startTime.slice(0, 10),
      home: game.home.id,
      away: game.away.id,
      homeScore: game.result.home,
      awayScore: game.result.away,
    });
  }
  return rows;
}

function footballTeamRatesFromModel(
  inputs: readonly FootballTeamRateInput[],
  model: DixonColesModel,
): Record<string, TeamSeasonRate> {
  const rates: Record<string, TeamSeasonRate> = {};
  for (const t of inputs) {
    const attack = model.attack[t.teamId] ?? 1;
    const defense = model.defense[t.teamId] ?? 1;
    rates[t.teamId] = {
      teamId: t.teamId,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      forPerGame: t.gamesPlayed > 0 ? t.goalsFor / t.gamesPlayed : model.baseRate,
      againstPerGame: t.gamesPlayed > 0 ? t.goalsAgainst / t.gamesPlayed : model.baseRate,
      gamesPlayed: t.gamesPlayed,
      adjustedFor: model.baseRate * attack,
      adjustedAgainst: model.baseRate * defense,
    };
  }
  return rates;
}

function nflTeamRatesFromModel(
  inputs: readonly NflTeamRateInput[],
  model: NflRatingsModel,
): Record<string, TeamSeasonRate> {
  const rates: Record<string, TeamSeasonRate> = {};
  for (const t of inputs) {
    rates[t.teamId] = {
      teamId: t.teamId,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      forPerGame: t.gamesPlayed > 0 ? t.pointsFor / t.gamesPlayed : model.intercept,
      againstPerGame: t.gamesPlayed > 0 ? t.pointsAgainst / t.gamesPlayed : model.intercept,
      gamesPlayed: t.gamesPlayed,
      adjustedFor: model.intercept + (model.offense[t.teamId] ?? 0),
      adjustedAgainst: model.intercept - (model.defense[t.teamId] ?? 0),
    };
  }
  return rates;
}

export function buildNflSnapshot(params: {
  seasonId: string;
  seasonLabel: string;
  periodLabel: string;
  games: GameDTO[];
  teamRateInputs: NflTeamRateInput[];
  updatedAt: string;
  previousSnapshot?: LeagueSnapshot | null;
  seasonGames?: readonly GameDTO[];
  modelVersion?: ModelVersion;
  /** Partidos de la temporada anterior con peso reducido (opcional). */
  priorRows?: readonly NflMatchRow[];
  /** Historial de la liga para el cara a cara (opcional). */
  history?: readonly EloMatch[];
}): LeagueSnapshot {
  const {
    seasonId,
    seasonLabel,
    periodLabel,
    games,
    teamRateInputs,
    updatedAt,
    previousSnapshot,
    seasonGames,
    modelVersion = "v2",
    priorRows,
  } = params;

  const nflModel =
    modelVersion === "v2" && (seasonGames?.length ?? 0) > 0
      ? fitNflRatings(toNflMatchRows(seasonGames!), {
          priorRows,
          priorWeight: 0.35,
        })
      : null;

  const rates: Record<string, TeamSeasonRate> = nflModel
    ? nflTeamRatesFromModel(teamRateInputs, nflModel)
    : computeNflTeamRates(teamRateInputs).rates;

  const analyses: Record<string, GameAnalysis> = {};

  const nflSeasonRows: ContextRow[] = (seasonGames ? toNflMatchRows(seasonGames) : [])
    .filter((r): r is NflMatchRow & { date: string } => typeof r.date === "string")
    .map((r) => ({ date: r.date, home: r.home, away: r.away, homeGoals: r.homeScore, awayGoals: r.awayScore }));
  const nflSeasonStart = nflSeasonRows.map((r) => r.date).sort()[0] ?? updatedAt.slice(0, 10);
  const nflContextRows: ContextRow[] = [
    ...(params.history ?? [])
      .filter((m) => m.date < nflSeasonStart)
      .map((m) => ({ date: m.date, home: m.home, away: m.away, homeGoals: m.homeGoals, awayGoals: m.awayGoals })),
    ...nflSeasonRows,
  ];

  for (const game of games) {
    const prev = previousSnapshot?.analyses[game.id];
    if (shouldPreservePublishedAnalysis(prev, game)) {
      let kept = keepVerifiedPicks(GameAnalysisSchema.parse(prev), game);
      if (!kept.picks && nflModel) {
        kept = enrichPreservedAnalysis({ previous: kept, game, updatedAt, teamRates: rates, football: false });
        if (kept.picksAt) kept = addMatchContext(kept, game, nflContextRows, nflSeasonRows);
      }
      analyses[game.id] = GameAnalysisSchema.parse(kept);
      continue;
    }

    const publishedAt = publishedAtFor(game, updatedAt);

    const analysis = nflModel
      ? analyzeNflGameV2({
          game,
          model: nflModel,
          teamRates: rates,
          inputsAsOf: publishedAt,
          publishedAt,
          source: "nflverse",
          recentResults: toNflMatchRows(seasonGames!),
        })
      : analyzeNflGame({
          game,
          teams: teamRateInputs,
          inputsAsOf: publishedAt,
          publishedAt,
          source: "nflverse",
        });

    analyses[game.id] = GameAnalysisSchema.parse(
      nflModel
        ? withPreKickoffPicksOnly(addMatchContext(analysis, game, nflContextRows, nflSeasonRows), game, updatedAt)
        : analysis,
    );
  }

  const nflStandings = seasonGames
    ? computeNflStandings(
        seasonGames,
        teamRateInputs,
        (teamId) => getOfficialEspnTeamLogoUrl("nfl", teamId) ?? undefined,
      )
    : [];

  const leagueLogoUrl = getOfficialEspnLeagueLogoUrl("nfl") ?? undefined;
  const snapshot: LeagueSnapshot = {
    schemaVersion: 1,
    league: asLeagueId("nfl"),
    ...(leagueLogoUrl ? { logoUrl: leagueLogoUrl } : {}),
    season: asSeasonId(seasonId),
    seasonLabel,
    periodLabel,
    updatedAt,
    source: "nflverse",
    provenance: "derived",
    isDemo: false,
    teamRates: rates,
    games,
    analyses,
    ...(nflStandings.length > 0 ? { standings: nflStandings } : {}),
  };

  return LeagueSnapshotSchema.parse(snapshot);
}

export function buildFootballSnapshot(params: {
  league: LeagueId | string;
  leagueName: string;
  seasonId: string;
  seasonLabel: string;
  periodLabel: string;
  games: GameDTO[];
  teamRateInputs: FootballTeamRateInput[];
  updatedAt: string;
  source: string;
  previousSnapshot?: LeagueSnapshot | null;
  seasonGames?: readonly GameDTO[];
  modelVersion?: ModelVersion;
  /** Partidos de la temporada anterior con peso reducido (opcional). */
  priorMatches?: readonly FootballMatchRow[];
  /** Historial completo de la liga para las ratings de largo plazo (opcional). */
  history?: readonly EloMatch[];
  /** Peso de esas ratings en el 1X2 (validado en `backtest:blend`). */
  historyBlendWeight?: number;
  /**
   * xG medido por partido (`xg-feed.ts`). Si existe, las ratings de largo plazo se alimentan
   * con xG en lugar de goles donde lo haya (Elo de xG, validado en la Premier).
   */
  xgLookup?: XgLookup | null;
  /** Córners, faltas y amarillas esperados (`counts-feed.ts`); sin feed no se publican. */
  countFeed?: CountFeed | null;
}): LeagueSnapshot {
  const {
    league,
    leagueName,
    seasonId,
    seasonLabel,
    periodLabel,
    games,
    teamRateInputs,
    updatedAt,
    source,
    previousSnapshot,
    seasonGames,
    modelVersion = "v2",
    priorMatches,
    history,
    historyBlendWeight = HISTORY_BLEND_WEIGHT,
    xgLookup = null,
    countFeed = null,
  } = params;

  const seasonRows = seasonGames ? toFootballMatchRows(seasonGames) : [];
  // El corpus histórico ya trae partidos de la temporada en curso: se corta en su
  // arranque para no contarlos dos veces (a peso reducido y como temporada actual).
  const seasonStart = seasonGames?.length
    ? seasonGames.map((g) => g.startTime.slice(0, 10)).sort()[0]!
    : updatedAt.slice(0, 10);
  const priorBeforeSeason = (priorMatches ?? []).filter((row) => row.date < seasonStart);

  const ratings = history?.length
    ? buildHistoryRatings(history, seasonRows, seasonStart, seasonId, xgLookup)
    : null;

  const footballModel =
    modelVersion === "v2" && (seasonGames?.length ?? 0) > 0
      ? fitDixonColes(
          [...priorBeforeSeason, ...seasonRows],
          {
            referenceDate: updatedAt.slice(0, 10),
          },
        )
      : null;

  const rates: Record<string, TeamSeasonRate> = footballModel
    ? footballTeamRatesFromModel(teamRateInputs, footballModel)
    : computeFootballTeamRates(league, teamRateInputs).rates;

  const resolveLogo = (teamId: string): string | null =>
    mapBzzoiroTeamLogoUrl(league, teamId) ?? getOfficialEspnTeamLogoUrl(league, teamId);

  for (const rate of Object.values(rates)) {
    const logoUrl = rate.logoUrl ?? resolveLogo(rate.teamId);
    if (logoUrl) rate.logoUrl = logoUrl;
  }

  const withTeamLogo = (team: Team): Team => {
    if (team.logoUrl) return team;
    const logoUrl = resolveLogo(team.id);
    return logoUrl ? { ...team, logoUrl } : team;
  };
  const resolvedGames: GameDTO[] = games.map((g) => ({
    ...g,
    home: withTeamLogo(g.home),
    away: withTeamLogo(g.away),
  }));

  const standings = seasonGames
    ? computeStandings(toFootballMatchRows(seasonGames), teamRateInputs).map((row) => {
        const logoUrl = row.logoUrl ?? resolveLogo(row.teamId);
        return logoUrl ? { ...row, logoUrl } : row;
      })
    : [];

  const analyses: Record<string, GameAnalysis> = {};
  const contextSeen = new Set<string>();
  const contextRows: ContextRow[] = [];
  for (const row of [
    ...(history ?? [])
      .filter((m) => m.date < seasonStart)
      .map((m) => ({ date: m.date, home: m.home, away: m.away, homeGoals: m.homeGoals, awayGoals: m.awayGoals })),
    ...seasonRows,
  ]) {
    const k = `${row.date}|${row.home}|${row.away}`;
    if (!contextSeen.has(k)) {
      contextSeen.add(k);
      contextRows.push(row);
    }
  }

  const analyze = (game: GameDTO, publishedAt: string): GameAnalysis =>
    footballModel
      ? analyzeFootballGameV2({
          league,
          leagueName,
          game,
          model: footballModel,
          teamRates: rates,
          inputsAsOf: publishedAt,
          publishedAt,
          source,
          recentResults: seasonRows,
          standings,
          outcomeBlend: ratings
            ? {
                ...ratings.predict(game.home.id, game.away.id, {
                  neutralSite: game.neutralSite,
                }),
                weight: historyBlendWeight,
              }
            : undefined,
        })
      : analyzeFootballGame({
          league,
          leagueName,
          game,
          teams: teamRateInputs,
          inputsAsOf: publishedAt,
          publishedAt,
          source,
        });

  for (const game of resolvedGames) {
    const prev = previousSnapshot?.analyses[game.id];
    if (shouldPreservePublishedAnalysis(prev, game)) {
      let kept = keepVerifiedPicks(GameAnalysisSchema.parse(prev), game);
      if (!kept.picks && footballModel) {
        const fresh = analyze(game, updatedAt);
        kept = enrichPreservedAnalysis({
          previous: kept,
          game,
          updatedAt,
          teamRates: rates,
          football: true,
          freshWhy: fresh.insights?.why,
        });
        if (kept.picksAt) kept = addMatchContext(kept, game, contextRows, seasonRows);
      }
      const preKickoff =
        game.status === "scheduled" && Date.parse(game.startTime) > Date.parse(updatedAt);
      if (!kept.counts && countFeed && preKickoff) {
        kept = withCountProjections(kept, game, countFeed);
      }
      analyses[game.id] = GameAnalysisSchema.parse(kept);
      continue;
    }

    const analysis = withCountProjections(analyze(game, publishedAtFor(game, updatedAt)), game, countFeed);
    analyses[game.id] = GameAnalysisSchema.parse(
      footballModel
        ? withPreKickoffPicksOnly(addMatchContext(analysis, game, contextRows, seasonRows), game, updatedAt)
        : analysis,
    );
  }

  const leagueLogoUrl =
    mapBzzoiroLeagueLogoUrl(league) ?? getOfficialEspnLeagueLogoUrl(league);

  const snapshot: LeagueSnapshot = {
    schemaVersion: 1,
    league: asLeagueId(league as LeagueId),
    ...(leagueLogoUrl ? { logoUrl: leagueLogoUrl } : {}),
    season: asSeasonId(seasonId),
    seasonLabel,
    periodLabel,
    updatedAt,
    source,
    provenance: "derived",
    isDemo: false,
    teamRates: rates,
    games: resolvedGames,
    analyses,
    standings: standings.length > 0 ? standings : undefined,
  };

  return LeagueSnapshotSchema.parse(snapshot);
}

/**
 * Peso de las ratings de largo plazo en el 1X2 de fútbol. Se fijó en 0.5 con validación
 * temporal en el benchmark histórico y se confirmó con `pnpm backtest:blend`.
 */
export const HISTORY_BLEND_WEIGHT = 0.5;

/**
 * Ratings incrementales con todo el historial anterior a la temporada y los partidos ya
 * jugados de la temporada en curso, en orden cronológico.
 *
 * Con `xgLookup`, cada partido con xG medido actualiza las ratings con su xG en lugar de los
 * goles (Elo de xG); los partidos sin xG siguen con goles.
 */
export function buildHistoryRatings(
  history: readonly EloMatch[],
  seasonRows: readonly FootballMatchRow[],
  seasonStart: string,
  seasonId: string,
  xgLookup: XgLookup | null = null,
): EloTracker {
  const tracker = createEloTracker();
  const withXg = <T extends { date: string; home: string; away: string; homeGoals: number; awayGoals: number }>(
    match: T,
  ): T => {
    const xg = xgLookup?.get(match.date, match.home, match.away);
    return xg ? { ...match, homeGoals: xg.homeXg, awayGoals: xg.awayXg } : match;
  };
  for (const match of history) {
    if (match.date >= seasonStart) break;
    tracker.beginSeason(match.season);
    tracker.update(withXg(match));
  }
  tracker.beginSeason(seasonId);
  const played = [...seasonRows].sort((a, b) => a.date.localeCompare(b.date));
  for (const row of played) {
    tracker.update(withXg({ ...row, season: seasonId }));
  }
  return tracker;
}

/**
 * Tabla de posiciones con los partidos ya jugados de la temporada.
 * Se ordena por puntos, diferencia de goles y goles a favor.
 */
export function computeStandings(
  matches: readonly FootballMatchRow[],
  teamInputs: readonly FootballTeamRateInput[],
): StandingRow[] {
  const table = new Map<string, StandingRow>();
  const formByTeam = new Map<string, Array<"W" | "D" | "L">>();
  for (const team of teamInputs) {
    table.set(team.teamId, {
      teamId: team.teamId,
      name: team.name,
      shortName: team.shortName,
      code: team.code,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    });
    formByTeam.set(team.teamId, []);
  }

  const chronological = [...matches].sort((a, b) => a.date.localeCompare(b.date));

  for (const match of chronological) {
    const home = table.get(match.home);
    const away = table.get(match.away);
    if (!home || !away) continue;
    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;
    if (match.homeGoals > match.awayGoals) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
      formByTeam.get(match.home)?.push("W");
      formByTeam.get(match.away)?.push("L");
    } else if (match.homeGoals < match.awayGoals) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
      formByTeam.get(match.home)?.push("L");
      formByTeam.get(match.away)?.push("W");
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
      formByTeam.get(match.home)?.push("D");
      formByTeam.get(match.away)?.push("D");
    }
  }

  return [...table.values()]
    .filter((row) => row.played > 0)
    .map((row) => {
      const form = (formByTeam.get(row.teamId) ?? []).slice(-5);
      return form.length > 0 ? { ...row, form } : row;
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor ||
        a.name.localeCompare(b.name),
    );
}

export function loadPreviousSnapshot(snapshotsRoot: string, league: string): LeagueSnapshot | null {
  const latestPath = join(snapshotsRoot, league, "latest.json");
  if (!existsSync(latestPath)) return null;
  const raw = JSON.parse(readFileSync(latestPath, "utf8"));
  return LeagueSnapshotSchema.parse(raw);
}

/**
 * Escritura atómica con reintentos: en Windows un lector concurrente (el servidor de
 * desarrollo leyendo `latest.json`) puede bloquear el archivo un instante.
 */
function writeFileAtomic(path: string, contents: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, contents, "utf8");
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (err) {
      lastError = err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60 * (attempt + 1));
    }
  }
  // Último recurso: escritura directa (deja constancia del error si también falla).
  writeFileSync(path, contents, "utf8");
  void lastError;
}

export interface SeasonResultEntry {
  id: string;
  date: string;
  startTime: string;
  round: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
}

export interface SeasonResultsFile {
  schemaVersion: 1;
  league: string;
  season: string;
  updatedAt: string;
  matches: SeasonResultEntry[];
}

export function writeSeasonResultsFile(
  snapshotsRoot: string,
  params: {
    league: string;
    season: string;
    updatedAt: string;
    games: readonly GameDTO[];
  },
): string {
  const dir = join(snapshotsRoot, params.league);
  mkdirSync(dir, { recursive: true });
  const deduped = new Map<string, SeasonResultEntry>();
  for (const g of params.games) {
    if (g.status !== "final" || !g.result) continue;
    const date = g.startTime.slice(0, 10);
    const key = `${date}|${g.home.id}|${g.away.id}`;
    deduped.set(key, {
      id: String(g.id),
      date,
      startTime: g.startTime,
      round: g.round ?? (g.week ? `Jornada ${g.week}` : null),
      homeTeam: String(g.home.id),
      awayTeam: String(g.away.id),
      homeScore: g.result.home,
      awayScore: g.result.away,
      neutralSite: Boolean(g.neutralSite),
    });
  }
  const matches = [...deduped.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const payload: SeasonResultsFile = {
    schemaVersion: 1,
    league: params.league,
    season: params.season,
    updatedAt: params.updatedAt,
    matches,
  };
  const outPath = join(dir, "season-results.json");
  writeFileAtomic(outPath, JSON.stringify(payload, null, 2) + "\n");
  return outPath;
}

export function writeSnapshotFiles(
  snapshotsRoot: string,
  snapshot: LeagueSnapshot,
  dateStr: string,
): { datedPath: string; latestPath: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Fecha de snapshot inválida: ${dateStr}`);
  }
  const validated = LeagueSnapshotSchema.parse(snapshot);
  const dir = join(snapshotsRoot, validated.league);
  mkdirSync(dir, { recursive: true });

  const datedPath = join(dir, `${dateStr}.json`);
  const latestPath = join(dir, "latest.json");
  const serialized = JSON.stringify(validated, null, 2) + "\n";

  writeFileAtomic(datedPath, serialized);
  writeFileAtomic(latestPath, serialized);

  return { datedPath, latestPath };
}
