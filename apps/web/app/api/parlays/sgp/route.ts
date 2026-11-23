import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  evaluateStudentTSameGameParlayV5,
  type SgpCopulaArtifactV5,
  type SgpLegInput,
  type SgpSportCorrelationSpecV5,
} from "@pitchlab/spacetime/v6";
import { withActivePaseMutation } from "../../../../src/server/api-guards";
import {
  evaluateGoalkeeperSavesSgpServerV6,
  evaluatePlayerLinkedSgpV6,
  evaluateSgpCopulaV6,
} from "../../../../src/server/spacetime-v6";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PARLAY_LEGS = 6;

const SOCCER_FACTORS = [
  "goal_diff",
  "total_goals",
  "ht_total_goals",
  "home_corners",
  "away_corners",
  "total_corners",
  "total_yellow_cards",
  "total_shots_on_target",
] as const;

const NFL_FACTORS = [
  "home_margin",
  "total_points",
  "home_pass_attempts",
  "home_rush_attempts",
  "away_pass_attempts",
  "away_rush_attempts",
] as const;

const BASKETBALL_FACTORS = [
  "home_margin",
  "total_points",
  "home_team_points",
  "away_team_points",
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
] as const;

const BASEBALL_FACTORS = [
  "home_margin",
  "total_runs",
  "total_points",
  "f5_margin",
  "f5_total_runs",
  "home_team_runs",
  "away_team_runs",
] as const;

const ICE_HOCKEY_FACTORS = [
  "goal_diff",
  "home_margin",
  "total_goals",
  "total_points",
  "period1_total_goals",
  "home_team_goals",
  "away_team_goals",
  "total_shots_on_target",
] as const;

const GK_MATCH_OUTCOMES = [
  "clean_sheet",
  "under_2_5",
  "team_win",
  "over_2_5",
  "team_win_or_draw",
] as const;

const BASKETBALL_SPEC: SgpSportCorrelationSpecV5 = {
  df_nu: 8.0,
  copula_family: "student_t",
  residualized: true,
  factors: [
    "home_margin",
    "total_points",
    "home_team_points",
    "away_team_points",
    "player_points",
    "player_rebounds",
    "player_assists",
    "player_threes",
  ],
  correlation_matrix: [
    [1.0, 0.03, 0.56, -0.56, 0.04, 0.02, 0.05, 0.03],
    [0.03, 1.0, 0.64, 0.62, 0.34, 0.14, 0.28, 0.24],
    [0.56, 0.64, 1.0, 0.08, 0.24, 0.1, 0.2, 0.18],
    [-0.56, 0.62, 0.08, 1.0, 0.22, 0.08, 0.18, 0.16],
    [0.04, 0.34, 0.24, 0.22, 1.0, 0.12, 0.18, 0.48],
    [0.02, 0.14, 0.1, 0.08, 0.12, 1.0, 0.1, 0.04],
    [0.05, 0.28, 0.2, 0.18, 0.18, 0.1, 1.0, 0.16],
    [0.03, 0.24, 0.18, 0.16, 0.48, 0.04, 0.16, 1.0],
  ],
};

const BASEBALL_SPEC: SgpSportCorrelationSpecV5 = {
  df_nu: 7.0,
  copula_family: "student_t",
  residualized: true,
  factors: [
    "home_margin",
    "total_runs",
    "f5_margin",
    "f5_total_runs",
    "home_team_runs",
    "away_team_runs",
  ],
  correlation_matrix: [
    [1.0, 0.05, 0.66, 0.03, 0.54, -0.52],
    [0.05, 1.0, 0.04, 0.68, 0.64, 0.62],
    [0.66, 0.04, 1.0, 0.04, 0.44, -0.42],
    [0.03, 0.68, 0.04, 1.0, 0.48, 0.46],
    [0.54, 0.64, 0.44, 0.48, 1.0, 0.06],
    [-0.52, 0.62, -0.42, 0.46, 0.06, 1.0],
  ],
};

const ICE_HOCKEY_SPEC: SgpSportCorrelationSpecV5 = {
  df_nu: 6.0,
  copula_family: "student_t",
  residualized: true,
  factors: [
    "goal_diff",
    "total_goals",
    "period1_total_goals",
    "home_team_goals",
    "away_team_goals",
    "total_shots_on_target",
  ],
  correlation_matrix: [
    [1.0, 0.06, 0.04, 0.54, -0.52, 0.05],
    [0.06, 1.0, 0.56, 0.62, 0.6, 0.42],
    [0.04, 0.56, 1.0, 0.36, 0.34, 0.26],
    [0.54, 0.62, 0.36, 1.0, 0.04, 0.28],
    [-0.52, 0.6, 0.34, 0.04, 1.0, 0.26],
    [0.05, 0.42, 0.26, 0.28, 0.26, 1.0],
  ],
};

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function buildExtendedSportArtifact(spec: SgpSportCorrelationSpecV5): SgpCopulaArtifactV5 {
  return {
    schema_version: "sgp_copula_v5.0.0",
    codename: "PitchLab Multi-Sport QMC Copula v6.0",
    version: "6.0.0",
    status: "production",
    production_activated: true,
    created_at: "2026-11-23T00:00:00Z",
    holdout_cut_utc: "2025-02-02T17:30:00Z",
    holdout_sealed_untouched: true,
    qmc_halton_points: 2048,
    qmc_smooth_bandwidth: 0.012,
    sports: {
      soccer: spec,
      nfl: spec,
    },
  };
}

function evaluateExtendedSportSgp(params: {
  readonly sport: "basketball" | "baseball" | "ice-hockey";
  readonly spec: SgpSportCorrelationSpecV5;
  readonly legs: readonly SgpLegInput[];
  readonly offeredCombinedDecimalOdds: number | null;
}) {
  const evaluated = evaluateStudentTSameGameParlayV5({
    sport: "nfl",
    legs: params.legs,
    artifact: buildExtendedSportArtifact(params.spec),
    offeredCombinedDecimalOdds: params.offeredCombinedDecimalOdds,
  });
  return {
    sport: params.sport,
    nLegs: evaluated.nLegs,
    independentProbability: round4(evaluated.independentProbability),
    jointProbability: round4(evaluated.jointProbability),
    correlationMultiplier: round4(evaluated.correlationMultiplier),
    correlationDirection: evaluated.correlationDirection,
    fairCombinedDecimal: round2(evaluated.fairCombinedOdds.decimal),
    fairCombinedAmerican: Math.round(evaluated.fairCombinedOdds.american),
    bookQuoteAudit: evaluated.bookQuoteAudit
      ? {
          offeredDecimal: round2(evaluated.bookQuoteAudit.offeredCombinedDecimalOdds),
          impliedBookProbability: round4(evaluated.bookQuoteAudit.impliedBookProbability),
          fairCombinedDecimal: round2(evaluated.bookQuoteAudit.fairCombinedDecimalOdds),
          effectiveHoldPct: round1(evaluated.bookQuoteAudit.effectiveHoldPct),
          taxFlag: evaluated.bookQuoteAudit.taxFlag,
        }
      : null,
  };
}

const BaseSgpLegShape = {
  legId: z.string().trim().max(80).optional(),
  marginalProbability: z.number().finite().gt(0.001).lt(0.999),
  direction: z.union([z.literal(1), z.literal(-1)]),
};

const OfferedOddsSchema = z
  .union([z.number(), z.string()])
  .refine((value) => {
    const parsed = parseStrictFiniteNumber(value);
    return parsed !== null && parsed > 1.01 && parsed <= 1000;
  })
  .transform((value) => parseStrictFiniteNumber(value)!);

const SgpCopulaRequestSchema = z.discriminatedUnion("sport", [
  z
    .object({
      mode: z.literal("copula").optional(),
      sport: z.literal("soccer"),
      legs: z
        .array(z.object({ ...BaseSgpLegShape, factor: z.enum(SOCCER_FACTORS) }).strict())
        .min(2)
        .max(MAX_PARLAY_LEGS),
      offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("copula").optional(),
      sport: z.literal("football"),
      legs: z
        .array(z.object({ ...BaseSgpLegShape, factor: z.enum(SOCCER_FACTORS) }).strict())
        .min(2)
        .max(MAX_PARLAY_LEGS),
      offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("copula").optional(),
      sport: z.literal("nfl"),
      legs: z
        .array(z.object({ ...BaseSgpLegShape, factor: z.enum(NFL_FACTORS) }).strict())
        .min(2)
        .max(MAX_PARLAY_LEGS),
      offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("copula").optional(),
      sport: z.literal("american-football"),
      legs: z
        .array(z.object({ ...BaseSgpLegShape, factor: z.enum(NFL_FACTORS) }).strict())
        .min(2)
        .max(MAX_PARLAY_LEGS),
      offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("copula").optional(),
      sport: z.literal("basketball"),
      legs: z
        .array(z.object({ ...BaseSgpLegShape, factor: z.enum(BASKETBALL_FACTORS) }).strict())
        .min(2)
        .max(MAX_PARLAY_LEGS),
      offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("copula").optional(),
      sport: z.literal("baseball"),
      legs: z
        .array(z.object({ ...BaseSgpLegShape, factor: z.enum(BASEBALL_FACTORS) }).strict())
        .min(2)
        .max(MAX_PARLAY_LEGS),
      offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("copula").optional(),
      sport: z.literal("ice-hockey"),
      legs: z
        .array(z.object({ ...BaseSgpLegShape, factor: z.enum(ICE_HOCKEY_FACTORS) }).strict())
        .min(2)
        .max(MAX_PARLAY_LEGS),
      offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
    })
    .strict(),
]);

const PlayerLinkedSgpRequestSchema = z
  .object({
    mode: z.literal("player_linked"),
    sport: z.union([z.literal("soccer"), z.literal("football")]).optional(),
    pPlayerAnytimeGoal: z.number().finite().gt(0.002).lt(0.95),
    teamExpectedGoals: z.number().finite().gt(0.1).lte(6.5),
    opponentExpectedGoals: z.number().finite().gt(0.1).lte(6.5),
    teamOutcome: z.enum(["team_win", "team_win_or_draw", "any"]),
    matchTotalOverLine: z.number().finite().gte(0.5).lte(8.5).nullable().optional(),
    dixonColesRho: z.number().finite().gte(-0.22).lte(0.16).optional(),
    offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (payload) =>
      payload.teamOutcome !== "any" ||
      (typeof payload.matchTotalOverLine === "number" &&
        Number.isFinite(payload.matchTotalOverLine)),
    { message: "Se requieren al menos 2 selecciones en el mismo partido." },
  );

const GoalkeeperSavesSgpRequestSchema = z
  .object({
    mode: z.literal("goalkeeper_saves"),
    sport: z.union([z.literal("soccer"), z.literal("football")]).optional(),
    savesLine: z.number().finite().gte(0.5).lte(9.5),
    ebSaveRate: z.number().finite().gte(0.45).lte(0.95),
    oppExpectedSoT: z.number().finite().gte(1.0).lte(12.0),
    teamExpectedGoals: z.number().finite().gt(0.08).lte(7.5),
    opponentExpectedGoals: z.number().finite().gt(0.08).lte(7.5),
    matchOutcome: z.enum(GK_MATCH_OUTCOMES),
    expectedMinutes: z.number().finite().gte(45).lte(95).nullable().optional(),
    offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
  })
  .strict();

function detectRequestMode(
  rawBody: unknown,
): "copula" | "player_linked" | "goalkeeper_saves" | "invalid" {
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return "invalid";
  }
  if (!("mode" in rawBody)) return "copula";
  const rawMode = rawBody.mode;
  if (rawMode === undefined || rawMode === "copula") return "copula";
  if (rawMode === "player_linked") return "player_linked";
  if (rawMode === "goalkeeper_saves") return "goalkeeper_saves";
  return "invalid";
}

function normalizeBaseballFactor(factor: (typeof BASEBALL_FACTORS)[number]): string {
  return factor === "total_points" ? "total_runs" : factor;
}

function normalizeIceHockeyFactor(factor: (typeof ICE_HOCKEY_FACTORS)[number]): string {
  if (factor === "home_margin") return "goal_diff";
  if (factor === "total_points") return "total_goals";
  return factor;
}

export const POST = withActivePaseMutation(
  {
    bucket: "parlays-sgp",
    allowBetaPin: true,
    limit: 90,
    windowMs: 60_000,
  },
  async ({ request }) => {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (err) {
      void err;
      return NextResponse.json(
        createSanitizedErrorPayload("INVALID_JSON", "Cuerpo JSON inválido."),
        { status: 400 },
      );
    }

    const mode = detectRequestMode(rawBody);
    if (mode === "invalid") {
      return NextResponse.json(
        createSanitizedErrorPayload("INVALID_SGP_REQUEST", "Parámetros de correlación SGP inválidos."),
        { status: 400 },
      );
    }

    if (mode === "player_linked") {
      const parsedPlayer = PlayerLinkedSgpRequestSchema.safeParse(rawBody);
      if (!parsedPlayer.success) {
        return NextResponse.json(
          createSanitizedErrorPayload(
            "INVALID_SGP_REQUEST",
            "Parámetros de correlación jugador-partido inválidos.",
          ),
          { status: 400 },
        );
      }
      const pData = parsedPlayer.data;
      const evaluated = evaluatePlayerLinkedSgpV6({
        pPlayerAnytimeGoal: pData.pPlayerAnytimeGoal,
        teamExpectedGoals: pData.teamExpectedGoals,
        opponentExpectedGoals: pData.opponentExpectedGoals,
        teamOutcome: pData.teamOutcome,
        matchTotalOverLine: pData.matchTotalOverLine ?? null,
        offeredCombinedDecimalOdds: pData.offeredCombinedDecimalOdds ?? null,
        ...(pData.dixonColesRho !== undefined ? { dixonColesRho: pData.dixonColesRho } : {}),
      });
      const nLegs =
        1 +
        (pData.teamOutcome !== "any" ? 1 : 0) +
        (evaluated.pTotalOutcomeMarginal !== null ? 1 : 0);
      return NextResponse.json({
        audit: {
          mode: "player_linked",
          sport: "soccer",
          nLegs,
          pPlayerScores: evaluated.pPlayerScores,
          pTeamOutcomeMarginal: evaluated.pTeamOutcomeMarginal,
          pTotalOutcomeMarginal: evaluated.pTotalOutcomeMarginal,
          independentProbability: evaluated.independentProbability,
          jointProbability: evaluated.jointProbability,
          correlationMultiplier: evaluated.structuralLiftMultiplier,
          structuralLiftMultiplier: evaluated.structuralLiftMultiplier,
          correlationDirection: evaluated.correlationDirection,
          fairCombinedDecimal: evaluated.fairCombinedDecimal,
          fairCombinedAmerican: evaluated.fairCombinedAmerican,
          bookQuoteAudit: evaluated.bookQuoteAudit,
        },
      });
    }

    if (mode === "goalkeeper_saves") {
      const parsedGk = GoalkeeperSavesSgpRequestSchema.safeParse(rawBody);
      if (!parsedGk.success) {
        return NextResponse.json(
          createSanitizedErrorPayload(
            "INVALID_SGP_REQUEST",
            "Parámetros de correlación de atajadas inválidos.",
          ),
          { status: 400 },
        );
      }
      const gkData = parsedGk.data;
      const evaluated = evaluateGoalkeeperSavesSgpServerV6({
        savesLine: gkData.savesLine,
        ebSaveRate: gkData.ebSaveRate,
        oppExpectedSoT: gkData.oppExpectedSoT,
        teamExpectedGoals: gkData.teamExpectedGoals,
        opponentExpectedGoals: gkData.opponentExpectedGoals,
        matchOutcome: gkData.matchOutcome,
        expectedMinutes: gkData.expectedMinutes ?? null,
        offeredCombinedDecimalOdds: gkData.offeredCombinedDecimalOdds ?? null,
      });
      return NextResponse.json({
        audit: {
          mode: "goalkeeper_saves",
          sport: "soccer",
          nLegs: 2,
          savesLine: evaluated.savesLine,
          matchOutcome: evaluated.matchOutcome,
          expectedSaves: evaluated.expectedSaves,
          effectiveRivalSoT: evaluated.effectiveRivalSoT,
          pSavesOverMarginal: evaluated.pSavesOverMarginal,
          pMatchOutcomeMarginal: evaluated.pMatchOutcomeMarginal,
          independentProbability: evaluated.independentProbability,
          jointProbability: evaluated.jointProbability,
          correlationMultiplier: evaluated.structuralMultiplier,
          structuralMultiplier: evaluated.structuralMultiplier,
          correlationDirection: evaluated.correlationDirection,
          fairCombinedDecimal: evaluated.fairCombinedDecimal,
          fairCombinedAmerican: evaluated.fairCombinedAmerican,
          bookQuoteAudit: evaluated.bookQuoteAudit,
        },
      });
    }

    const parsed = SgpCopulaRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        createSanitizedErrorPayload("INVALID_SGP_REQUEST", "Parámetros de correlación SGP inválidos."),
        { status: 400 },
      );
    }

    const data = parsed.data;
    const offeredOdds = data.offeredCombinedDecimalOdds ?? null;

    if (data.sport === "soccer" || data.sport === "football") {
      const legs: SgpLegInput[] = data.legs.map((leg, index) => ({
        legId: leg.legId && leg.legId.length > 0 ? leg.legId : `leg_${index + 1}`,
        factor: leg.factor,
        marginalProbability: leg.marginalProbability,
        direction: leg.direction,
      }));
      const audit = evaluateSgpCopulaV6({
        sport: "soccer",
        legs,
        offeredCombinedDecimalOdds: offeredOdds,
      });
      return NextResponse.json({ audit });
    }

    if (data.sport === "nfl" || data.sport === "american-football") {
      const legs: SgpLegInput[] = data.legs.map((leg, index) => ({
        legId: leg.legId && leg.legId.length > 0 ? leg.legId : `leg_${index + 1}`,
        factor: leg.factor,
        marginalProbability: leg.marginalProbability,
        direction: leg.direction,
      }));
      const audit = evaluateSgpCopulaV6({
        sport: "nfl",
        legs,
        offeredCombinedDecimalOdds: offeredOdds,
      });
      return NextResponse.json({ audit });
    }

    if (data.sport === "basketball") {
      const legs: SgpLegInput[] = data.legs.map((leg, index) => ({
        legId: leg.legId && leg.legId.length > 0 ? leg.legId : `leg_${index + 1}`,
        factor: leg.factor,
        marginalProbability: leg.marginalProbability,
        direction: leg.direction,
      }));
      const audit = evaluateExtendedSportSgp({
        sport: "basketball",
        spec: BASKETBALL_SPEC,
        legs,
        offeredCombinedDecimalOdds: offeredOdds,
      });
      return NextResponse.json({ audit });
    }

    if (data.sport === "baseball") {
      const legs: SgpLegInput[] = data.legs.map((leg, index) => ({
        legId: leg.legId && leg.legId.length > 0 ? leg.legId : `leg_${index + 1}`,
        factor: normalizeBaseballFactor(leg.factor),
        marginalProbability: leg.marginalProbability,
        direction: leg.direction,
      }));
      const audit = evaluateExtendedSportSgp({
        sport: "baseball",
        spec: BASEBALL_SPEC,
        legs,
        offeredCombinedDecimalOdds: offeredOdds,
      });
      return NextResponse.json({ audit });
    }

    const legs: SgpLegInput[] = data.legs.map((leg, index) => ({
      legId: leg.legId && leg.legId.length > 0 ? leg.legId : `leg_${index + 1}`,
      factor: normalizeIceHockeyFactor(leg.factor),
      marginalProbability: leg.marginalProbability,
      direction: leg.direction,
    }));
    const audit = evaluateExtendedSportSgp({
      sport: "ice-hockey",
      spec: ICE_HOCKEY_SPEC,
      legs,
      offeredCombinedDecimalOdds: offeredOdds,
    });
    return NextResponse.json({ audit });
  },
);
