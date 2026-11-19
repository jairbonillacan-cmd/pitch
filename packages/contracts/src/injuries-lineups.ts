import { z } from "zod";
import { GameIdSchema, LeagueIdSchema, TeamIdSchema, type GameId, type LeagueId, type TeamId } from "./ids";

/**
 * La recolección automática de alineaciones permanece estrictamente APAGADA
 * hasta contar con una fuente oficial verificada y auditada legalmente.
 */
export const LINEUPS_COLLECTION_ENABLED = false as const;

export const InjuryStatusSchema = z.enum(["Baja", "Duda"]);
export type InjuryStatus = z.infer<typeof InjuryStatusSchema>;

export const TeamInjuryEntrySchema = z.object({
  teamId: TeamIdSchema,
  player: z.string().min(1).max(120),
  position: z.string().max(40).optional(),
  status: InjuryStatusSchema,
  detail: z.string().min(1).max(240),
  injuryType: z.string().max(120).optional(),
  returnDate: z.string().max(80).optional(),
  reportedAt: z.string().min(10),
  gameId: GameIdSchema.optional(),
});

export type TeamInjuryEntry = z.infer<typeof TeamInjuryEntrySchema>;

export const InjuriesCoverageStatusSchema = z.enum([
  "ok",
  "partial",
  "no_public_feed",
]);
export type InjuriesCoverageStatus = z.infer<typeof InjuriesCoverageStatusSchema>;

export const LeagueInjuriesFileSchema = z.object({
  schemaVersion: z.literal(1),
  league: LeagueIdSchema,
  observedAt: z.string().min(10),
  source: z.string().min(1),
  coverageStatus: InjuriesCoverageStatusSchema,
  entries: z.array(TeamInjuryEntrySchema),
});

export type LeagueInjuriesFile = z.infer<typeof LeagueInjuriesFileSchema>;

export const ConfirmedLineupStarterSchema = z.object({
  name: z.string().min(1).max(120),
  number: z.number().int().positive().max(99).optional(),
  position: z.string().max(24).optional(),
});

export type ConfirmedLineupStarter = z.infer<typeof ConfirmedLineupStarterSchema>;

export const VerifiedGameLineupEntrySchema = z.object({
  gameId: GameIdSchema,
  sourceLabel: z.string().min(1).max(80),
  verifiedAtUtc: z.string().min(10),
  homeFormation: z.string().max(24).optional(),
  awayFormation: z.string().max(24).optional(),
  homeStarters: z.array(ConfirmedLineupStarterSchema).min(11).max(11),
  awayStarters: z.array(ConfirmedLineupStarterSchema).min(11).max(11),
});

export type VerifiedGameLineupEntry = z.infer<typeof VerifiedGameLineupEntrySchema>;

export const LeagueLineupsFileSchema = z.object({
  schemaVersion: z.literal(1),
  league: LeagueIdSchema,
  enabled: z.boolean(),
  observedAt: z.string().min(10),
  source: z.string().min(1),
  disabledReason: z.string().optional(),
  entries: z.array(VerifiedGameLineupEntrySchema),
});

export type LeagueLineupsFile = z.infer<typeof LeagueLineupsFileSchema>;

export interface MatchTeamInjuries {
  readonly gameId?: GameId;
  readonly league: LeagueId;
  readonly teamId: TeamId;
  readonly entries: readonly TeamInjuryEntry[];
}

export const MatchLineupPlayerSchema = z.object({
  name: z.string().min(1).max(120),
  number: z.number().int().positive().max(99).optional(),
  position: z.string().max(24).optional(),
});
export type MatchLineupPlayer = z.infer<typeof MatchLineupPlayerSchema>;

export const MatchLineupSideSchema = z.object({
  formation: z.string().max(24).optional(),
  starters: z.array(MatchLineupPlayerSchema),
});

export const MatchLineupsProjectionSchema = z.object({
  status: z.enum(["confirmed", "predicted"]),
  sourceLabel: z.string().min(1).max(80),
  updatedAtUtc: z.string().min(10),
  confidence: z.number().min(0).max(1).optional(),
  home: MatchLineupSideSchema,
  away: MatchLineupSideSchema,
});
export type MatchLineupsProjection = z.infer<typeof MatchLineupsProjectionSchema>;

export const RefereeStatsSchema = z.object({
  country: z.string().max(80).optional(),
  matches: z.number().int().nonnegative().optional(),
  avgYellow: z.number().nonnegative().optional(),
  avgRed: z.number().nonnegative().optional(),
  avgFouls: z.number().nonnegative().optional(),
  avgGoals: z.number().nonnegative().optional(),
});
export type RefereeStats = z.infer<typeof RefereeStatsSchema>;

export const ProbablePitcherSchema = z.object({
  name: z.string().min(1).max(120),
  throwingHand: z.enum(["R", "L", "S"]).optional(),
  era: z.number().nonnegative().max(99).optional(),
  whip: z.number().nonnegative().max(25).optional(),
  strikeoutsPer9: z.number().nonnegative().max(30).optional(),
  record: z.string().max(32).optional(),
  photoKey: z.string().max(240).optional(),
});
export type ProbablePitcher = z.infer<typeof ProbablePitcherSchema>;

export const MatchPreGameContextSchema = z.object({
  referee: z.string().max(120).optional(),
  refereeStats: RefereeStatsSchema.optional(),
  probablePitchers: z
    .object({
      home: ProbablePitcherSchema.optional(),
      away: ProbablePitcherSchema.optional(),
    })
    .optional(),
  weather: z
    .object({
      description: z.string().max(120).optional(),
      temperatureC: z.number().optional(),
      windSpeedKmh: z.number().optional(),
    })
    .optional(),
  pitchCondition: z.string().max(80).optional(),
  travelDistanceKm: z.number().nonnegative().optional(),
  isLocalDerby: z.boolean().optional(),
  broadcastsMx: z.array(z.string().min(1).max(80)).max(12).optional(),
  halfTimeScore: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }).optional(),
  extraTimeScore: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }).optional(),
  penaltyShootout: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }).optional(),
  previousLegGameId: z.string().max(120).optional(),
  groupName: z.string().max(80).optional(),
  stageName: z.string().max(100).optional(),
  venueCity: z.string().max(80).optional(),
  venueCountry: z.string().max(80).optional(),
  venueCapacity: z.number().int().positive().optional(),
  attendance: z.number().int().nonnegative().optional(),
});
export type MatchPreGameContext = z.infer<typeof MatchPreGameContextSchema>;
