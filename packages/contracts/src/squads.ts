import { z } from "zod";
import { LeagueIdSchema, TeamIdSchema, type LeagueId, type TeamId } from "./ids";

export const PlayerPositionGroupSchema = z.enum(["GK", "DEF", "MID", "FWD"]);
export type PlayerPositionGroup = z.infer<typeof PlayerPositionGroupSchema>;

export const PlayerMarketKeySchema = z.enum([
  "player_shots",
  "player_sot",
  "player_goal",
  "player_goal_or_assist",
  "player_saves",
]);
export type PlayerMarketKey = z.infer<typeof PlayerMarketKeySchema>;

export const SquadPlayerStatsSchema = z.object({
  appearances: z.number().int().nonnegative(),
  subIns: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  shots: z.number().int().nonnegative(),
  shotsOnTarget: z.number().int().nonnegative(),
  foulsCommitted: z.number().int().nonnegative(),
  foulsSuffered: z.number().int().nonnegative(),
  yellowCards: z.number().int().nonnegative(),
  redCards: z.number().int().nonnegative(),
  offsides: z.number().int().nonnegative(),
  saves: z.number().int().nonnegative(),
  shotsFaced: z.number().int().nonnegative(),
  goalsConceded: z.number().int().nonnegative(),
});
export type SquadPlayerStats = z.infer<typeof SquadPlayerStatsSchema>;

export const PlayerApplicablePickSchema = z.object({
  id: z.string().min(1),
  marketKey: PlayerMarketKeySchema,
  marketLabel: z.string().min(1),
  selectionLabel: z.string().min(1),
  line: z.number().nullable(),
  projectionMean: z.number().nonnegative(),
  projectionSd: z.number().positive(),
  p: z.number().min(0.05).max(0.95),
  fairDecimal: z.number().min(1.01),
  fairAmerican: z.number().int(),
  rationale: z.string().min(1),
});
export type PlayerApplicablePick = z.infer<typeof PlayerApplicablePickSchema>;

export const SquadCoachProfileSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().nullable().optional(),
  photoKey: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  nationalityCode: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  preferredFormation: z.string().nullable().optional(),
  styleLabel: z.string().nullable().optional(),
  careerRecord: z
    .object({
      matches: z.number().int().nonnegative(),
      wins: z.number().int().nonnegative(),
      draws: z.number().int().nonnegative(),
      losses: z.number().int().nonnegative(),
      winPct: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type SquadCoachProfile = z.infer<typeof SquadCoachProfileSchema>;

export const SquadPlayerEntrySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  jersey: z.string().nullable(),
  positionGroup: PlayerPositionGroupSchema,
  positionLabel: z.string().min(1),
  age: z.number().int().positive().nullable(),
  birthDate: z.string().nullable().optional(),
  heightCm: z.number().int().positive().nullable(),
  weightKg: z.number().int().positive().nullable(),
  preferredFoot: z.enum(["R", "L", "B"]).nullable().optional(),
  nationality: z.string().nullable(),
  nationalityCode: z.string().nullable(),
  photoKey: z.string().nullable().optional(),
  fallbackPhotoKey: z.string().nullable().optional(),
  availability: z.enum(["available", "injured", "doubtful", "suspended"]).nullable().optional(),
  injuryDetail: z.string().nullable().optional(),
  expectedReturn: z.string().nullable().optional(),
  stats: SquadPlayerStatsSchema,
  candidatePicks: z.array(PlayerApplicablePickSchema),
});
export type SquadPlayerEntry = z.infer<typeof SquadPlayerEntrySchema>;

export const TeamSquadEntrySchema = z.object({
  teamId: TeamIdSchema,
  teamSlug: z.string().min(1),
  teamName: z.string().min(1),
  coachName: z.string().nullable(),
  coach: SquadCoachProfileSchema.nullable().optional(),
  updatedAt: z.string().min(10),
  players: z.array(SquadPlayerEntrySchema),
});
export type TeamSquadEntry = z.infer<typeof TeamSquadEntrySchema>;

export const LeagueSquadsFileSchema = z.object({
  schemaVersion: z.literal(1),
  league: LeagueIdSchema,
  seasonLabel: z.string().min(1),
  observedAt: z.string().min(10),
  teams: z.array(TeamSquadEntrySchema),
});
export type LeagueSquadsFile = z.infer<typeof LeagueSquadsFileSchema>;

export type { LeagueId, TeamId };

export function slugifyPlayerName(rawName: string): string {
  const clean = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "jugador";
}

function clampProb(p: number, min = 0.12, max = 0.88): number {
  return Math.min(max, Math.max(min, Math.round(p * 1000) / 1000));
}

function fairDecFromProb(p: number): number {
  return Math.max(1.05, Math.round((1 / clampProb(p, 0.05, 0.95)) * 100) / 100);
}

function americanFromDecimal(dec: number): number {
  const safe = Math.max(1.01, dec);
  if (safe >= 2.0) return Math.round((safe - 1) * 100);
  return -Math.round(100 / (safe - 1));
}

function evalThresholdProb(mean: number, sd: number, line: number): number {
  const z = (line - mean) / Math.max(0.25, sd);
  const cdf = 1 / (1 + Math.exp(-1.702 * z));
  return clampProb(1 - cdf, 0.12, 0.86);
}

export function computePlayerApplicablePicks(
  player: Pick<SquadPlayerEntry, "slug" | "name" | "positionGroup" | "stats">,
  options: {
    attackMultiplier?: number;
    opponentShotMultiplier?: number;
  } = {},
): PlayerApplicablePick[] {
  const stats = player.stats;
  const app = stats.appearances;
  if (app < 3) return [];

  const starts = Math.max(0, app - stats.subIns);
  const starterRatio = app > 0 ? starts / app : 0.7;
  // Suaviza jugadores con muchas entradas de cambio para evitar sobreproyectar volumen por juego.
  const roleFactor = 0.62 + 0.38 * starterRatio;
  const attackMult = Math.min(1.25, Math.max(0.78, options.attackMultiplier ?? 1));
  const shotOppMult = Math.min(1.25, Math.max(0.78, options.opponentShotMultiplier ?? 1));

  const picks: PlayerApplicablePick[] = [];

  if (player.positionGroup === "GK") {
    const rawSavesAvg = stats.saves / app;
    if (rawSavesAvg >= 1.15) {
      const mean = Math.round(rawSavesAvg * shotOppMult * 100) / 100;
      const line = mean >= 3.3 ? 3.5 : mean >= 2.3 ? 2.5 : 1.5;
      const sd = Math.max(0.85, Math.sqrt(Math.max(mean, 0.5)) * 0.96);
      const p = evalThresholdProb(mean, sd, line);
      const fairDecimal = fairDecFromProb(p);
      picks.push({
        id: `${player.slug}-saves-${line}`,
        marketKey: "player_saves",
        marketLabel: "Atajadas",
        selectionLabel: `Más de ${line.toFixed(1)} atajadas`,
        line,
        projectionMean: mean,
        projectionSd: Math.round(sd * 100) / 100,
        p,
        fairDecimal,
        fairAmerican: americanFromDecimal(fairDecimal),
        rationale: `${stats.saves} atajadas registradas en ${app} partidos (${rawSavesAvg.toFixed(2)} por encuentro).`,
      });
    }
    return picks;
  }

  const shotsPerApp = stats.shots / app;
  const sotPerApp = stats.shotsOnTarget / app;
  const goalsPerApp = stats.goals / app;
  const gaPerApp = (stats.goals + stats.assists) / app;

  if (sotPerApp >= 0.25) {
    const mean = Math.round(sotPerApp * roleFactor * attackMult * 100) / 100;
    const line = mean >= 1.45 ? 1.5 : 0.5;
    const sd = Math.max(0.45, Math.sqrt(Math.max(mean, 0.3)) * 0.88);
    const p = evalThresholdProb(mean, sd, line);
    const fairDecimal = fairDecFromProb(p);
    picks.push({
      id: `${player.slug}-sot-${line}`,
      marketKey: "player_sot",
      marketLabel: "Tiros a puerta",
      selectionLabel: `Más de ${line.toFixed(1)} tiros a puerta`,
      line,
      projectionMean: mean,
      projectionSd: Math.round(sd * 100) / 100,
      p,
      fairDecimal,
      fairAmerican: americanFromDecimal(fairDecimal),
      rationale: `${stats.shotsOnTarget} tiros a puerta en ${app} partidos (${sotPerApp.toFixed(2)} p/p).`,
    });
  }

  if (shotsPerApp >= 0.55) {
    const mean = Math.round(shotsPerApp * roleFactor * attackMult * 100) / 100;
    const line = mean >= 2.4 ? 2.5 : mean >= 1.35 ? 1.5 : 0.5;
    const sd = Math.max(0.55, Math.sqrt(Math.max(mean, 0.4)) * 0.92);
    const p = evalThresholdProb(mean, sd, line);
    const fairDecimal = fairDecFromProb(p);
    picks.push({
      id: `${player.slug}-shots-${line}`,
      marketKey: "player_shots",
      marketLabel: "Tiros totales",
      selectionLabel: `Más de ${line.toFixed(1)} tiros`,
      line,
      projectionMean: mean,
      projectionSd: Math.round(sd * 100) / 100,
      p,
      fairDecimal,
      fairAmerican: americanFromDecimal(fairDecimal),
      rationale: `${stats.shots} remates totales en ${app} partidos (${shotsPerApp.toFixed(2)} p/p).`,
    });
  }

  if (app >= 4 && gaPerApp >= 0.24) {
    const rate = gaPerApp * roleFactor * attackMult;
    const rawProb = 1 - Math.exp(-Math.min(1.35, rate));
    const shrunk = clampProb(rawProb * 0.88 + 0.04, 0.16, 0.76);
    const fairDecimal = fairDecFromProb(shrunk);
    picks.push({
      id: `${player.slug}-ga-05`,
      marketKey: "player_goal_or_assist",
      marketLabel: "Anota o asiste",
      selectionLabel: "Anota o asiste: Sí",
      line: 0.5,
      projectionMean: Math.round(rate * 100) / 100,
      projectionSd: 0.65,
      p: shrunk,
      fairDecimal,
      fairAmerican: americanFromDecimal(fairDecimal),
      rationale: `${stats.goals} goles y ${stats.assists} asistencias en ${app} apariciones (${(gaPerApp * 100).toFixed(0)} % de producción por partido).`,
    });
  }

  if (app >= 4 && goalsPerApp >= 0.18) {
    const rate = goalsPerApp * roleFactor * attackMult;
    const rawProb = 1 - Math.exp(-Math.min(1.1, rate));
    const shrunk = clampProb(rawProb * 0.85 + 0.03, 0.14, 0.68);
    const fairDecimal = fairDecFromProb(shrunk);
    picks.push({
      id: `${player.slug}-goal-05`,
      marketKey: "player_goal",
      marketLabel: "Anotador",
      selectionLabel: "Anota en cualquier momento: Sí",
      line: 0.5,
      projectionMean: Math.round(rate * 100) / 100,
      projectionSd: 0.55,
      p: shrunk,
      fairDecimal,
      fairAmerican: americanFromDecimal(fairDecimal),
      rationale: `${stats.goals} goles en ${app} apariciones (${goalsPerApp.toFixed(2)} por partido).`,
    });
  }

  return picks;
}
