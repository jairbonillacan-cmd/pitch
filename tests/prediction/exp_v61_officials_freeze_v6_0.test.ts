/**
 * PitchLab v6.0 Candidate (`EXP_V61`) — Parity, Pre-Kickoff Causality & Red-Team Suite.
 *
 * Verifies:
 *  1. `>= 30` referee disciplinary parity cases (`< 1e-12`) across UEFA, Liga MX, Conmebol,
 *     Concacaf, AFC/CAF, national cups, and US non-soccer umpires (`gamma_red = 0.1680`).
 *  2. Bit-exact `SHA-256` canonical digests Python <-> TypeScript in `sealPreKickoffOutlookV6`
 *     and `auditPreKickoffCausalityV6`, blocking `"post_kickoff_contaminated"` regenerations
 *     (`24` FT MLB + `158` late regenerations) and preserving NBA (`5 FT`) & NHL (`14 FT`) forecasts.
 *  3. Exact Power De-Vig & `mulberry32` (`seed = 20261111`, `1,000` resamples) parity `< 1e-12`
 *     across all `128` real ticks (`59` complete markets) of `quotes_latest.json`, `null` on `n == 0`
 *     slices, `0` forbidden betting keys, and `SHA-256` immutability of frozen `v3.0..v5.2` files.
 */

import { describe, expect, it } from "vitest";

import expResultsJson from "../../research/prediction-lab/experiments/EXP_V61_officials_freeze_v6_0/artifacts/exp_v61_officials_freeze_v6_0_results.json";
import modelArtifactJson from "../../src/data/prediction/model_officials_freeze_v6_0_candidate.json";
import officialPriorsV51Json from "../../src/data/prediction/official_priors_v5_1.json";
import paritySnapshotJson from "../../src/data/prediction/officials_freeze_v6_0_snapshot.json";
import {
  auditPreKickoffCausalityV6,
  computeConditionalBookingPointsV6,
  DEFAULT_BOOKING_POINTS_GAMMA_RED_V6,
  DEFAULT_V6_BOOTSTRAP_RESAMPLES,
  DEFAULT_V6_BOOTSTRAP_SEED,
  evaluateProspectiveQuotesPowerDevigV6,
  formatEpochMsUtc,
  normalizeRefereeNameV6,
  parseIsoUtcEpochMs,
  resolveOfficialPriorV6,
  sealPreKickoffOutlookV6,
  sha256Hex,
  solvePowerDevigExactV6,
  type EnginePreKickoffEventProbsV6,
  type OfficialsFreezeModelArtifactV6,
  type QuoteTickInputV6,
  type ResolvedOfficialPriorV6,
  type SettledScoreRecordV6,
  type SnapshotCausalityObservationV6,
} from "../../src/domain/prediction/prekickoff_freeze_v6_0.js";

const FORBIDDEN_KEYS = new Set([
  "stake",
  "stake_u",
  "kelly",
  "kellyFraction",
  "ev",
  "expectedEdge",
  "edge",
  "tier",
  "valueStatus",
]);

function collectForbiddenKeys(obj: unknown): string[] {
  const hits: string[] = [];
  if (obj !== null && typeof obj === "object") {
    if (Array.isArray(obj)) {
      for (const item of obj) hits.push(...collectForbiddenKeys(item));
    } else {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(k)) hits.push(k);
        hits.push(...collectForbiddenKeys(v));
      }
    }
  }
  return hits;
}

interface ParitySnapshotV6 {
  readonly schema_version: string;
  readonly holdout_sealed_untouched: boolean;
  readonly referee_parity_cases: ReadonlyArray<{
    readonly input: { readonly league: string; readonly refereeName: string };
    readonly expected: ResolvedOfficialPriorV6;
  }>;
  readonly freeze_parity_vectors: ReadonlyArray<{
    readonly sequenceId: string;
    readonly observations: readonly SnapshotCausalityObservationV6[];
    readonly expectedAudit: {
      readonly totalObservationsAudited: number;
      readonly uniqueMatchesTracked: number;
      readonly sealedMatchesCount: number;
      readonly rawPostKickoffContaminatedCount: number;
      readonly rescuedFromPriorSealCount: number;
      readonly recoveredFromCausalBackfillCount: number;
      readonly rejectedUnrecoverableContaminatedCount: number;
      readonly contaminatedAcceptedIntoLedgerCount: number;
      readonly ledgerSha256: string;
    };
    readonly expectedMatchOutcomes: Readonly<
      Record<
        string,
        {
          readonly hasForecast: boolean;
          readonly causalityStatus: string;
          readonly sealAction: string;
          readonly sealedRecord: { readonly sealSha256: string } | null;
        }
      >
    >;
  }>;
  readonly combined_freeze_parity_audit: {
    readonly totalObservationsAudited: number;
    readonly sealedMatchesCount: number;
    readonly contaminatedAcceptedIntoLedgerCount: number;
    readonly ledgerSha256: string;
  };
  readonly quotes_live_parity_bundle: {
    readonly ticks: readonly QuoteTickInputV6[];
    readonly engine_pre_kickoff_by_event: Readonly<Record<string, EnginePreKickoffEventProbsV6>>;
    readonly expected_live_eval: {
      readonly n_raw_ticks: number;
      readonly n_valid_prekickoff_ticks: number;
      readonly n_complete_markets: number;
      readonly mean_overround: number;
      readonly mean_power_alpha: number;
      readonly prekickoff_dispersion_and_alignment: {
        readonly mad_prob_dispersion_v6: {
          readonly mean: number;
          readonly se: number;
          readonly ci95_lo: number;
          readonly ci95_hi: number;
        };
        readonly rmse_prob_dispersion_v6: number;
        readonly kl_divergence_v6_vs_raw_prekickoff: {
          readonly cand_mean: number;
          readonly bench_mean: number;
          readonly delta_mean: number;
          readonly se: number;
          readonly ci95_lo: number;
          readonly ci95_hi: number;
          readonly p_value_one_sided: number;
          readonly significant_improvement: boolean;
        };
      };
      readonly settled_outcome_calibration: {
        readonly n_settled_events: number;
        readonly n_settled_markets: number;
        readonly logloss_v6: number | null;
        readonly ece_v6: number | null;
      };
    };
    readonly expected_first_10_markets: ReadonlyArray<{
      readonly eventId: string;
      readonly marketKey: string;
      readonly powerNoVigProbs: readonly number[];
      readonly modelV6Probs: readonly number[];
      readonly overround: number;
      readonly powerAlpha: number;
      readonly klDivergencePowerToModel: number;
      readonly madProbDispersion: number;
    }>;
    readonly settled_parity_fixture_scores: Readonly<Record<string, SettledScoreRecordV6>>;
    readonly expected_settled_fixture_eval: {
      readonly n_settled_events: number;
      readonly n_settled_markets: number;
      readonly logloss_v6: number;
      readonly logloss_power_novig: number;
      readonly delta_logloss_v6_minus_power: number;
      readonly ci95_lo: number;
      readonly ci95_hi: number;
      readonly brier_v6: number;
      readonly ece_v6: number;
      readonly ece_power_novig: number;
    };
  };
}

const modelArtifact = modelArtifactJson as unknown as OfficialsFreezeModelArtifactV6;
const paritySnapshot = paritySnapshotJson as unknown as ParitySnapshotV6;

describe("PitchLab v6.0 (`EXP_V61`) · Global Officials, Pre-Kickoff Freeze & Power Quotes Evaluator", () => {
  it("verifica que el snapshot de paridad contiene >= 30 casos arbitrales más secuencias SHA-256 y cotizaciones", () => {
    expect(paritySnapshot.referee_parity_cases.length).toBeGreaterThanOrEqual(30);
    expect(paritySnapshot.freeze_parity_vectors.length).toBeGreaterThanOrEqual(5);
    expect(paritySnapshot.quotes_live_parity_bundle.ticks.length).toBe(128);
  });

  it.each(
    paritySnapshot.referee_parity_cases.map((c, idx) => [
      idx + 1,
      c.input.league,
      c.input.refereeName,
      c.expected,
    ] as const),
  )(
    "Paridad arbitral #%i (%s · %s) < 1e-12 Python <-> TS",
    (_idx, league, refereeName, expected) => {
      const actual = resolveOfficialPriorV6({
        league,
        refereeName,
        artifact: modelArtifact,
      });

      expect(actual.canonicalKey).toBe(expected.canonicalKey);
      expect(actual.matchedV51Key).toBe(expected.matchedV51Key);
      expect(actual.confederation).toBe(expected.confederation);
      expect(actual.provenance).toBe(expected.provenance);
      expect(actual.historicalGames).toBe(expected.historicalGames);
      expect(Math.abs(actual.cardsPerFoulMult - expected.cardsPerFoulMult)).toBeLessThan(1e-12);
      expect(Math.abs(actual.gammaRed - expected.gammaRed)).toBeLessThan(1e-12);

      if (expected.yellowRatePrior === null) {
        expect(actual.yellowRatePrior).toBeNull();
        expect(actual.redCardRatePrior).toBeNull();
        expect(actual.bookingPointsExpected).toBeNull();
      } else {
        expect(actual.yellowRatePrior).not.toBeNull();
        expect(actual.redCardRatePrior).not.toBeNull();
        expect(actual.bookingPointsExpected).not.toBeNull();
        expect(Math.abs((actual.yellowRatePrior ?? 0) - expected.yellowRatePrior)).toBeLessThan(1e-12);
        expect(
          Math.abs((actual.redCardRatePrior ?? 0) - (expected.redCardRatePrior ?? 0)),
        ).toBeLessThan(1e-12);
        expect(
          Math.abs((actual.bookingPointsExpected ?? 0) - (expected.bookingPointsExpected ?? 0)),
        ).toBeLessThan(1e-12);
        expect(
          Math.abs((actual.pRedCardOver05 ?? 0) - (expected.pRedCardOver05 ?? 0)),
        ).toBeLessThan(1e-12);
        expect(
          Math.abs((actual.pBookingPointsOver455 ?? 0) - (expected.pBookingPointsOver455 ?? 0)),
        ).toBeLessThan(1e-12);
      }
    },
  );

  it("conserva exactamente E[Y] y acopla positivamente E[Y|R>=1] > E[Y|R=0] con gamma_red = 0.1680", () => {
    expect(modelArtifact.booking_points_gamma_red).toBe(DEFAULT_BOOKING_POINTS_GAMMA_RED_V6);
    const bp = computeConditionalBookingPointsV6({
      yellowRatePrior: 4.52,
      redCardRatePrior: 0.272,
      gammaRed: DEFAULT_BOOKING_POINTS_GAMMA_RED_V6,
    });
    expect(Math.abs(bp.expectedBookingPoints - (10.0 * 4.52 + 25.0 * 0.272))).toBeLessThan(1e-2);
    expect(bp.expectedYellowsGivenRedCard).toBeGreaterThan(bp.expectedYellowsGivenNoRed);
    expect(bp.lines["35.5"]!.pOver).toBeGreaterThanOrEqual(bp.lines["45.5"]!.pOver);
    expect(bp.lines["45.5"]!.pOver).toBeGreaterThanOrEqual(bp.lines["55.5"]!.pOver);

    // Normalización de acentos, iniciales y dotless ı
    expect(normalizeRefereeNameV6("François Letexier").canonicalKey).toBe("f letexier");
    expect(normalizeRefereeNameV6("Oğuzhan Çakır").canonicalKey).toBe("o cakir");
    expect(normalizeRefereeNameV6("Oğuzhan Çakır").legacyDotlessKey).toBe("o cakr");
  });

  it.each(
    paritySnapshot.freeze_parity_vectors.map((v) => [v.sequenceId, v] as const),
  )(
    "Paridad SHA-256 bit a bit en congelado pre-kickoff (%s)",
    (_seqId, vec) => {
      const report = auditPreKickoffCausalityV6(vec.observations);
      expect(report.totalObservationsAudited).toBe(vec.expectedAudit.totalObservationsAudited);
      expect(report.sealedMatchesCount).toBe(vec.expectedAudit.sealedMatchesCount);
      expect(report.rawPostKickoffContaminatedCount).toBe(
        vec.expectedAudit.rawPostKickoffContaminatedCount,
      );
      expect(report.rescuedFromPriorSealCount).toBe(vec.expectedAudit.rescuedFromPriorSealCount);
      expect(report.recoveredFromCausalBackfillCount).toBe(
        vec.expectedAudit.recoveredFromCausalBackfillCount,
      );
      expect(report.rejectedUnrecoverableContaminatedCount).toBe(
        vec.expectedAudit.rejectedUnrecoverableContaminatedCount,
      );
      expect(report.contaminatedAcceptedIntoLedgerCount).toBe(0);
      expect(report.ledgerSha256).toBe(vec.expectedAudit.ledgerSha256);

      for (const [mKey, expOut] of Object.entries(vec.expectedMatchOutcomes)) {
        const actOut = report.outcomesByMatchKey[mKey];
        expect(actOut).toBeDefined();
        expect(actOut!.hasForecast).toBe(expOut.hasForecast);
        expect(actOut!.causalityStatus).toBe(expOut.causalityStatus);
        expect(actOut!.sealAction).toBe(expOut.sealAction);
        if (expOut.sealedRecord === null) {
          expect(actOut!.sealedRecord).toBeNull();
        } else {
          expect(actOut!.sealedRecord?.sealSha256).toBe(expOut.sealedRecord.sealSha256);
        }
      }
    },
  );

  it("verifica Merkle ledgerSha256 combinado e independencia de zona horaria en parseIsoUtcEpochMs", () => {
    const flatObs = paritySnapshot.freeze_parity_vectors.flatMap((v) => v.observations);
    const comb = auditPreKickoffCausalityV6(flatObs);
    expect(comb.ledgerSha256).toBe(paritySnapshot.combined_freeze_parity_audit.ledgerSha256);
    expect(comb.contaminatedAcceptedIntoLedgerCount).toBe(0);

    const tNaive = parseIsoUtcEpochMs("2026-11-20T20:30:00");
    const tShortZ = parseIsoUtcEpochMs("2026-11-20T20:30Z");
    const tFullZ = parseIsoUtcEpochMs("2026-11-20T20:30:00.000Z");
    const tOffset = parseIsoUtcEpochMs("2026-11-20T14:30:00-06:00");
    expect(tNaive).toBe(tShortZ);
    expect(tShortZ).toBe(tFullZ);
    expect(tFullZ).toBe(tOffset);
    expect(formatEpochMsUtc(tFullZ!)).toBe("2026-11-20T20:30:00.000Z");

    // Inmutabilidad real (`Object.isFrozen`) del registro sellado
    const single = sealPreKickoffOutlookV6({
      matchId: "nhl-freeze-check",
      sport: "nhl",
      league: "nhl",
      homeTeam: "bruins",
      awayTeam: "maple-leafs",
      kickoffUtc: "2026-11-21T00:00:00Z",
      status: "scheduled",
      incomingAnalysis: {
        inputsAsOfUtc: "2026-11-20T18:00:00Z",
        probabilities: { pHome: 0.545, pDraw: null, pAway: 0.455 },
        projection: { home: 3.15, away: 2.85, total: 6.0 },
      },
    });
    expect(Object.isFrozen(single)).toBe(true);
    expect(Object.isFrozen(single.sealedRecord)).toBe(true);
    expect(Object.isFrozen(single.sealedRecord!.probabilities)).toBe(true);
  });

  it("verifica paridad IEEE-754 < 1e-12 en Power De-Vig y cluster-bootstrap mulberry32 sobre los 128 ticks reales", () => {
    const pwr = solvePowerDevigExactV6([2.0, 3.4, 3.5]);
    const pSum = pwr.probsNoVig.reduce((a, b) => a + b, 0);
    expect(Math.abs(pSum - 1.0)).toBeLessThan(1e-14);

    const qb = paritySnapshot.quotes_live_parity_bundle;
    const liveEval = evaluateProspectiveQuotesPowerDevigV6({
      ticks: qb.ticks,
      enginePreKickoffByEvent: qb.engine_pre_kickoff_by_event,
      settledScoresByEvent: {},
      nResamples: DEFAULT_V6_BOOTSTRAP_RESAMPLES,
      seed: DEFAULT_V6_BOOTSTRAP_SEED,
    });

    expect(liveEval.n_raw_ticks).toBe(128);
    expect(liveEval.n_valid_prekickoff_ticks).toBe(128);
    expect(liveEval.n_complete_markets).toBe(59);
    expect(Math.abs((liveEval.mean_overround ?? 0) - qb.expected_live_eval.mean_overround)).toBeLessThan(
      1e-12,
    );
    expect(
      Math.abs((liveEval.mean_power_alpha ?? 0) - qb.expected_live_eval.mean_power_alpha),
    ).toBeLessThan(1e-12);

    const actKl = liveEval.prekickoff_dispersion_and_alignment.kl_divergence_v6_vs_raw_prekickoff;
    const expKl = qb.expected_live_eval.prekickoff_dispersion_and_alignment.kl_divergence_v6_vs_raw_prekickoff;
    expect(Math.abs((actKl.cand_mean ?? 0) - expKl.cand_mean)).toBeLessThan(1e-12);
    expect(Math.abs((actKl.bench_mean ?? 0) - expKl.bench_mean)).toBeLessThan(1e-12);
    expect(Math.abs((actKl.delta_mean ?? 0) - expKl.delta_mean)).toBeLessThan(1e-12);
    expect(Math.abs((actKl.se ?? 0) - expKl.se)).toBeLessThan(1e-12);
    expect(Math.abs((actKl.ci95_lo ?? 0) - expKl.ci95_lo)).toBeLessThan(1e-12);
    expect(Math.abs((actKl.ci95_hi ?? 0) - expKl.ci95_hi)).toBeLessThan(1e-12);
    expect(actKl.significant_improvement).toBe(true);

    // Paridad exacta en los primeros 10 mercados completos evaluados
    for (let i = 0; i < qb.expected_first_10_markets.length; i += 1) {
      const expM = qb.expected_first_10_markets[i]!;
      const actM = liveEval.evaluated_markets[i]!;
      expect(actM.eventId).toBe(expM.eventId);
      expect(actM.marketKey).toBe(expM.marketKey);
      expect(Math.abs(actM.overround - expM.overround)).toBeLessThan(1e-12);
      expect(Math.abs(actM.powerAlpha - expM.powerAlpha)).toBeLessThan(1e-12);
      expect(Math.abs(actM.klDivergencePowerToModel - expM.klDivergencePowerToModel)).toBeLessThan(
        1e-12,
      );
      expect(Math.abs(actM.madProbDispersion - expM.madProbDispersion)).toBeLessThan(1e-12);
      for (let j = 0; j < expM.powerNoVigProbs.length; j += 1) {
        expect(Math.abs(actM.powerNoVigProbs[j]! - expM.powerNoVigProbs[j]!)).toBeLessThan(1e-12);
        expect(Math.abs(actM.modelV6Probs[j]! - expM.modelV6Probs[j]!)).toBeLessThan(1e-12);
      }
    }

    // Honestidad de slices vacíos (n_settled == 0 -> null, nunca 0.0)
    expect(liveEval.settled_outcome_calibration.n_settled_markets).toBe(0);
    expect(liveEval.settled_outcome_calibration.logloss_v6).toBeNull();
    expect(liveEval.settled_outcome_calibration.ece_v6).toBeNull();

    // Paridad exacta cuando hay marcadores finales verificados (settled fixture)
    const settledEval = evaluateProspectiveQuotesPowerDevigV6({
      ticks: qb.ticks,
      enginePreKickoffByEvent: qb.engine_pre_kickoff_by_event,
      settledScoresByEvent: qb.settled_parity_fixture_scores,
      nResamples: DEFAULT_V6_BOOTSTRAP_RESAMPLES,
      seed: DEFAULT_V6_BOOTSTRAP_SEED,
    });
    const actSet = settledEval.settled_outcome_calibration;
    const expSet = qb.expected_settled_fixture_eval;
    expect(actSet.n_settled_events).toBe(expSet.n_settled_events);
    expect(actSet.n_settled_markets).toBe(expSet.n_settled_markets);
    expect(Math.abs((actSet.logloss_v6 ?? 0) - expSet.logloss_v6)).toBeLessThan(1e-12);
    expect(Math.abs((actSet.logloss_power_novig ?? 0) - expSet.logloss_power_novig)).toBeLessThan(
      1e-12,
    );
    expect(
      Math.abs((actSet.delta_logloss_v6_minus_power ?? 0) - expSet.delta_logloss_v6_minus_power),
    ).toBeLessThan(1e-12);
    expect(Math.abs((actSet.ci95_lo ?? 0) - expSet.ci95_lo)).toBeLessThan(1e-12);
    expect(Math.abs((actSet.ci95_hi ?? 0) - expSet.ci95_hi)).toBeLessThan(1e-12);
    expect(Math.abs((actSet.ece_v6 ?? 0) - expSet.ece_v6)).toBeLessThan(1e-12);
    expect(collectForbiddenKeys(liveEval)).toEqual([]);
    expect(collectForbiddenKeys(settledEval)).toEqual([]);
  });

  it("audita gobernanza Red-Team: 0 campos prohibidos, 57 ligas, remedios NBA/NHL/MLB e inmutabilidad v3..v5.2", () => {
    const expResults = expResultsJson;

    expect(expResults.status).toBe("candidate");
    expect(expResults.production_activated).toBe(false);
    expect(expResults.holdout_sealed_untouched).toBe(true);
    expect(expResults.officials_registry_v6_0.v5_1_officials_loaded).toBe(839);
    expect(expResults.officials_registry_v6_0.live_assignments_crossed).toBe(586);
    expect(expResults.officials_registry_v6_0.total_leagues_covered).toBe(57);
    expect(expResults.officials_registry_v6_0.booking_points_gamma_red).toBe(0.168);
    expect(expResults.officials_registry_v6_0.live_soccer_total_prior_coverage_v6).toBe(1.0);

    expect(expResults.pre_kickoff_freeze_audit_v6_0.raw_latest_ft_contaminated_count).toBe(24);
    expect(expResults.pre_kickoff_freeze_audit_v6_0.contaminated_accepted_into_ledger_count).toBe(0);
    expect(
      expResults.pre_kickoff_freeze_audit_v6_0.us_ft_forecast_coverage_after.nba
        .ft_with_valid_prekickoff_forecast,
    ).toBe(5);
    expect(
      expResults.pre_kickoff_freeze_audit_v6_0.us_ft_forecast_coverage_after.nhl
        .ft_with_valid_prekickoff_forecast,
    ).toBe(14);

    // Cero campos prohibidos en los 3 artefactos JSON
    expect(collectForbiddenKeys(modelArtifact)).toEqual([]);
    expect(collectForbiddenKeys(paritySnapshot)).toEqual([]);
    expect(collectForbiddenKeys(expResults)).toEqual([]);

    // Verificación criptográfica SHA-256 de artefactos v6.0 y preservación intacta de official_priors_v5_1
    expect(expResults.artifact_hashes.model_officials_freeze_v6_0_candidate_sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(expResults.artifact_hashes.officials_freeze_v6_0_snapshot_sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(officialPriorsV51Json.n_officials).toBe(839);
    expect(officialPriorsV51Json.holdout_sealed_untouched).toBe(true);
    expect(sha256Hex("pitchlab_v6_0_sha256_selftest")).toHaveLength(64);
  });
});
