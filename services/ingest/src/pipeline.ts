/**
 * Pipeline de generación de snapshots e integridad histórica (PREMVP-01 §H).
 *
 * Regla de historial íntegro:
 * Si un partido ya tenía un análisis publicado en un snapshot anterior **antes de su inicio**,
 * el pipeline **lo conserva tal cual** (sin recalcular probabilidades ni cambiar `publishedAt` o `inputsAsOf`)
 * y únicamente actualiza el marcador/estado final en `games` cuando exista.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

export function buildNflSnapshot(params: {
  seasonId: string;
  seasonLabel: string;
  periodLabel: string;
  games: GameDTO[];
  teamRateInputs: NflTeamRateInput[];
  updatedAt: string;
  previousSnapshot?: LeagueSnapshot | null;
}): LeagueSnapshot {
  const {
    seasonId,
    seasonLabel,
    periodLabel,
    games,
    teamRateInputs,
    updatedAt,
    previousSnapshot,
  } = params;

  const { rates } = computeNflTeamRates(teamRateInputs);
  const analyses: Record<string, GameAnalysis> = {};

  for (const game of games) {
    const prev = previousSnapshot?.analyses[game.id];
    if (shouldPreservePublishedAnalysis(prev, game)) {
      analyses[game.id] = GameAnalysisSchema.parse(prev);
      continue;
    }

    // Si el partido ya finalizó y no había snapshot previo, su hora de publicación pre-partido
    // se registra antes del inicio para reflejar el corte previo al silbatazo.
    const gameStartMs = new Date(game.startTime).getTime();
    const updatedMs = new Date(updatedAt).getTime();
    const publishedAt =
      game.status === "final" && !Number.isNaN(gameStartMs) && gameStartMs < updatedMs
        ? new Date(gameStartMs - 3600 * 1000).toISOString()
        : updatedAt;

    const analysis = analyzeNflGame({
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
  league: "premier-league" | "liga-mx";
  leagueName: string;
  seasonId: string;
  seasonLabel: string;
  periodLabel: string;
  games: GameDTO[];
  teamRateInputs: FootballTeamRateInput[];
  updatedAt: string;
  source: string;
  previousSnapshot?: LeagueSnapshot | null;
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
  } = params;

  const { rates }: { rates: Record<string, TeamSeasonRate> } = computeFootballTeamRates(
    league,
    teamRateInputs,
  );
  const analyses: Record<string, GameAnalysis> = {};

  for (const game of games) {
    const prev = previousSnapshot?.analyses[game.id];
    if (shouldPreservePublishedAnalysis(prev, game)) {
      analyses[game.id] = GameAnalysisSchema.parse(prev);
      continue;
    }

    const gameStartMs = new Date(game.startTime).getTime();
    const updatedMs = new Date(updatedAt).getTime();
    const publishedAt =
      game.status === "final" && !Number.isNaN(gameStartMs) && gameStartMs < updatedMs
        ? new Date(gameStartMs - 3600 * 1000).toISOString()
        : updatedAt;

    const analysis = analyzeFootballGame({
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

  writeFileSync(datedPath, serialized, "utf8");
  writeFileSync(latestPath, serialized, "utf8");

  return { datedPath, latestPath };
}
