import { describe, expect, it } from "vitest";

import nflV35SnapshotJson from "../data/nfl_v3_5_snapshot.json";
import {
  buildNflV35CandidateOutlook,
  computeNflTotalsOverUnderProbsV35,
  evaluateMinkowskiV35CompactRow,
} from "../src/nfl_v3_5";

describe("PitchLab Minkowski v3.5 NFL Ensemble & Totals Parity", () => {
  it("matches Python nfl_v3_5_snapshot.json to < 1e-12 for ensemble probs and expected total", () => {
    expect(nflV35SnapshotJson.holdout_sealed_untouched).toBe(true);
    expect(nflV35SnapshotJson.rows.length).toBeGreaterThanOrEqual(50);

    for (const row of nflV35SnapshotJson.rows) {
      const ev = evaluateMinkowskiV35CompactRow(row.features, row.totals_features);
      expect(Math.abs(ev.logitProbs[0] - row.python_logit_probs[0]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.logitProbs[1] - row.python_logit_probs[1]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.logitProbs[2] - row.python_logit_probs[2]!)).toBeLessThan(1e-12);

      expect(Math.abs(ev.gbmCalProbs[0] - row.python_gbm_cal_probs[0]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.gbmCalProbs[1] - row.python_gbm_cal_probs[1]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.gbmCalProbs[2] - row.python_gbm_cal_probs[2]!)).toBeLessThan(1e-12);

      expect(Math.abs(ev.ensembleProbs[0] - row.python_ensemble_probs[0]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.ensembleProbs[1] - row.python_ensemble_probs[1]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.ensembleProbs[2] - row.python_ensemble_probs[2]!)).toBeLessThan(1e-12);

      expect(Math.abs(ev.expectedTotal - row.python_expected_total)).toBeLessThan(1e-12);
    }
  });

  it("synthesizes live NFL MatchOutlook with high coverage and zero stake/kelly fields", () => {
    const res = buildNflV35CandidateOutlook({
      matchId: "NFL_TEST_KC_BUF",
      homeTeam: "BUF",
      awayTeam: "KC",
      tsDecisionUtc: "2026-11-18T15:00:00Z",
      kickoffUtc: "2026-11-22T21:25:00Z",
      spreadLine: -2.5,
      totalLine: 47.5,
      windMph: 12,
      tempF: 36,
    });

    expect(res.coverageRatio).toBeGreaterThan(0.8);
    expect(res.outlook.dataQuality.flag).toBe("ok");
    expect(res.outlook.markets.length).toBe(3);

    const rawJson = JSON.stringify(res.outlook);
    expect(rawJson).not.toMatch(/"(stake|kelly|kellyFraction|expectedEdge|tier)"/i);

    const ouInt = computeNflTotalsOverUnderProbsV35({
      totalLine: 47.0,
      expectedTotal: res.expectedTotal,
    });
    expect(ouInt.pPush).toBeGreaterThan(0);
    expect(Math.abs(ouInt.pOver + ouInt.pUnder - 1.0)).toBeLessThan(1e-12);
  });
});
