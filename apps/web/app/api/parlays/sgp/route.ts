import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import type { SgpLegInput } from "@pitchlab/spacetime/v5";
import { withActivePaseMutation } from "../../../../src/server/api-guards";
import { evaluateSgpCopulaV5 } from "../../../../src/server/spacetime-v5";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const SgpRequestSchema = z.discriminatedUnion("sport", [
  z.object({
    sport: z.literal("soccer"),
    legs: z
      .array(z.object({ ...BaseSgpLegShape, factor: z.enum(SOCCER_FACTORS) }))
      .min(2)
      .max(8),
    offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
  }),
  z.object({
    sport: z.literal("nfl"),
    legs: z
      .array(z.object({ ...BaseSgpLegShape, factor: z.enum(NFL_FACTORS) }))
      .min(2)
      .max(8),
    offeredCombinedDecimalOdds: OfferedOddsSchema.nullable().optional(),
  }),
]);

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

    const parsed = SgpRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        createSanitizedErrorPayload("INVALID_SGP_REQUEST", "Parámetros de correlación SGP inválidos."),
        { status: 400 },
      );
    }

    const { sport, offeredCombinedDecimalOdds } = parsed.data;
    const legs: SgpLegInput[] = parsed.data.legs.map((leg, index) => ({
      legId: leg.legId && leg.legId.length > 0 ? leg.legId : `leg_${index + 1}`,
      factor: leg.factor,
      marginalProbability: leg.marginalProbability,
      direction: leg.direction,
    }));

    const audit = evaluateSgpCopulaV5({
      sport,
      legs,
      offeredCombinedDecimalOdds: offeredCombinedDecimalOdds ?? null,
    });

    return NextResponse.json({ audit });
  },
);
