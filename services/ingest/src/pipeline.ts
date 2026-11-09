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
  type LeagueSnapshot,
  type TeamSeasonRate,
} from "@pitchlab/contracts";
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
  fitNflRatings,
  type DixonColesModel,
  type FootballMatchRow,
  type NflMatchRow,
  type NflRatingsModel,
} from "@pitchlab/models";

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

  for (const game of games) {
    const prev = previousSnapshot?.analyses[game.id];
    if (shouldPreservePublishedAnalysis(prev, game)) {
      analyses[game.id] = GameAnalysisSchema.parse(prev);
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
        })
      : analyzeNflGame({
          game,
          teams: teamRateInputs,
          inputsAsOf: publishedAt,
          publishedAt,
          source: "nflverse",
        });

    analyses[game.id] = GameAnalysisSchema.parse(analysis);
  }

  const snapshot: LeagueSnapshot = {
    schemaVersion: 1,
    league: asLeagueId("nfl"),
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
  };

  return LeagueSnapshotSchema.parse(snapshot);
}

export function buildFootballSnapshot(params: {
  league: "premier-league" | "liga-mx" | "laliga" | "bundesliga" | "serie-a" | "ligue-1";
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
  } = params;

  const footballModel =
    modelVersion === "v2" && (seasonGames?.length ?? 0) > 0
      ? fitDixonColes(
          [...(priorMatches ?? []), ...toFootballMatchRows(seasonGames!)],
          {
            referenceDate: updatedAt.slice(0, 10),
          },
        )
      : null;

  const rates: Record<string, TeamSeasonRate> = footballModel
    ? footballTeamRatesFromModel(teamRateInputs, footballModel)
    : computeFootballTeamRates(league, teamRateInputs).rates;

  const analyses: Record<string, GameAnalysis> = {};

  for (const game of games) {
    const prev = previousSnapshot?.analyses[game.id];
    if (shouldPreservePublishedAnalysis(prev, game)) {
      analyses[game.id] = GameAnalysisSchema.parse(prev);
      continue;
    }

    const publishedAt = publishedAtFor(game, updatedAt);

    const analysis = footballModel
      ? analyzeFootballGameV2({
          league,
          leagueName,
          game,
          model: footballModel,
          teamRates: rates,
          inputsAsOf: publishedAt,
          publishedAt,
          source,
          recentResults: toFootballMatchRows(seasonGames!),
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

    analyses[game.id] = GameAnalysisSchema.parse(analysis);
  }

  const snapshot: LeagueSnapshot = {
    schemaVersion: 1,
    league: asLeagueId(league),
    season: asSeasonId(seasonId),
    seasonLabel,
    periodLabel,
    updatedAt,
    source,
    provenance: "derived",
    isDemo: false,
    teamRates: rates,
    games,
    analyses,
  };

  return LeagueSnapshotSchema.parse(snapshot);
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

export function writeSnapshotFiles(
  snapshotsRoot: string,
  snapshot: LeagueSnapshot,
  dateStr: string,
): { datedPath: string; latestPath: string } {
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
