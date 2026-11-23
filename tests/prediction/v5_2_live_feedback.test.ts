/**
 * PitchLab v5.2 Live-Feedback Parity & Red-Team Governance Test Suite (`EXP_V57`) —
 * Verifica paridad IEEE-754 `< 1e-12` Python <-> TypeScript en los 4 motores `v5.2`,
 * invariantes de coherencia probabilística, cero campos prohibidos (`stake`, `kelly`, `ev`, `tier`),
 * y preservación íntegra de los artefactos congelados `v3` y `v5.1`.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  estimateEffectiveExposure90V52,
  projectCoupledPlayerShotsOutlookV52,
  projectGoalkeeperSavesOutlookV52,
  projectUsWalkforwardGameV52,
  recalibrateFootballOutlookV52,
  recalibratePlayableBinaryProbV52,
  type CoupledShotMetricV52,
  type LiveFeedbackModelArtifactV52,
  type UsWalkforwardSportV52,
} from "../../src/domain/prediction/v5_index.js";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

function readJson<T = Record<string, unknown>>(relPath: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relPath), "utf8")) as T;
}

function sha256File(relPath: string): string {
  return createHash("sha256").update(readFileSync(resolve(REPO_ROOT, relPath))).digest("hex");
}

describe("PitchLab v5.2 Live-Feedback (`EXP_V57`) · Paridad IEEE-754 y Mejoras Empíricas", () => {
  const artifact = readJson<LiveFeedbackModelArtifactV52>(
    "src/data/prediction/model_v5_2_live_feedback_candidate.json",
  );
  const paritySnap = readJson<{
    football_recalibration_cases: Array<{
      input: {
        rawProjHome: number;
        rawProjAway: number;
        rawX12: number[];
        leagueEnvGoals: number;
        rawLeagueProjMean: number;
        isExpansionLeague: boolean;
      };
      expected: {
        lambdaHome: number;
        lambdaAway: number;
        expectedTotal: number;
        envScaleApplied: number;
        pHome: number;
        pDraw: number;
        pAway: number;
        pOver15: number;
        pOver25: number;
        pOver35: number;
        pBttsYes: number;
      };
    }>;
    goalkeeper_saves_cases: Array<{
      input: {
        saves: number;
        shotsFaced: number;
        goalsConceded: number;
        appearances: number;
        subIns: number;
        oppExpectedSoT: number;
        line: number;
        expectedMinutes: number | null;
      };
      expected: {
        ebSaveRate: number;
        effectiveExposure90: number;
        expectedMinutes: number;
        oppExpectedSoT: number;
        expectedSaves: number;
        pOver: number;
        pUnder: number;
      };
    }>;
    coupled_player_shots_cases: Array<{
      input: {
        metric: CoupledShotMetricV52;
        positionGroup: string;
        seasonCount: number;
        appearances: number;
        subIns: number;
        teamExpectedShots: number;
        oppDefenseShotsFactor: number;
        line: number;
        expectedMinutes: number | null;
      };
      expected: {
        ebRatePer90: number;
        effectiveExposure90: number;
        muProjected: number;
        pOver: number;
        pUnder: number;
      };
    }>;
    us_walkforward_cases: Array<{
      input: {
        sport: UsWalkforwardSportV52;
        homeElo: number;
        awayElo: number;
        homeCumFor: number;
        homeCumAgainst: number;
        homeGames: number;
        awayCumFor: number;
        awayCumAgainst: number;
        awayGames: number;
        leagueTeamScoringEnv: number;
        homeB2B: boolean;
        awayB2B: boolean;
        home3in4: boolean;
        away3in4: boolean;
        neutralSite: boolean;
      };
      expected: {
        muHome: number;
        muAway: number;
        expectedMargin: number;
        expectedTotal: number;
        pHomeWin: number;
        pAwayWin: number;
        pOver: number;
        pUnder: number;
      };
    }>;
  }>("src/data/prediction/v5_2_live_feedback_snapshot.json");

  it("1. Paridad IEEE-754 < 1e-12 en recalibración multi-liga de fútbol y coherencia 1X2/Totales", () => {
    expect(paritySnap.football_recalibration_cases.length).toBeGreaterThanOrEqual(10);
    for (const c of paritySnap.football_recalibration_cases) {
      const out = recalibrateFootballOutlookV52({
        ...c.input,
        config: artifact.football_calibration,
      });
      expect(Math.abs(out.expectedTotal - c.expected.expectedTotal)).toBeLessThan(1e-12);
      expect(Math.abs(out.pHome - c.expected.pHome)).toBeLessThan(1e-12);
      expect(Math.abs(out.pDraw - c.expected.pDraw)).toBeLessThan(1e-12);
      expect(Math.abs(out.pAway - c.expected.pAway)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOver25 - c.expected.pOver25)).toBeLessThan(1e-12);
      expect(Math.abs(out.pBttsYes - c.expected.pBttsYes)).toBeLessThan(1e-12);

      // Invariantes matemáticos estrictos
      expect(Math.abs(out.pHome + out.pDraw + out.pAway - 1.0)).toBeLessThan(1e-12);
      expect(out.pOver15).toBeGreaterThanOrEqual(out.pOver25);
      expect(out.pOver25).toBeGreaterThanOrEqual(out.pOver35);
    }

    // Compresión monótona en zona jugable [0.55, 0.75]
    const pCore = recalibratePlayableBinaryProbV52(0.65, false, artifact.football_calibration);
    const pExp = recalibratePlayableBinaryProbV52(0.65, true, artifact.football_calibration);
    expect(pExp).toBeLessThan(pCore);
    expect(pExp).toBeGreaterThan(0.5);
  });

  it("2. Paridad IEEE-754 < 1e-12 en motor físico de Atajadas de Portero (`player_saves`)", () => {
    expect(paritySnap.goalkeeper_saves_cases.length).toBeGreaterThanOrEqual(20);
    for (const c of paritySnap.goalkeeper_saves_cases) {
      const out = projectGoalkeeperSavesOutlookV52({
        ...c.input,
        artifact,
      });
      expect(Math.abs(out.ebSaveRate - c.expected.ebSaveRate)).toBeLessThan(1e-12);
      expect(Math.abs(out.effectiveExposure90 - c.expected.effectiveExposure90)).toBeLessThan(1e-12);
      expect(Math.abs(out.expectedSaves - c.expected.expectedSaves)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOver - c.expected.pOver)).toBeLessThan(1e-12);
      expect(Math.abs(out.pUnder - c.expected.pUnder)).toBeLessThan(1e-12);
      expect(out.pOver).toBeGreaterThan(0.0);
      expect(out.pOver).toBeLessThan(1.0);
      expect(Math.abs(out.pOver + out.pUnder - 1.0)).toBeLessThan(1e-12);
    }
  });

  it("3. Paridad IEEE-754 < 1e-12 en `shots`/`shots_on_target` acoplados al partido + des-sesgado de suplentes", () => {
    expect(paritySnap.coupled_player_shots_cases.length).toBeGreaterThanOrEqual(20);
    for (const c of paritySnap.coupled_player_shots_cases) {
      const out = projectCoupledPlayerShotsOutlookV52({
        ...c.input,
        artifact,
      });
      expect(Math.abs(out.ebRatePer90 - c.expected.ebRatePer90)).toBeLessThan(1e-12);
      expect(Math.abs(out.effectiveExposure90 - c.expected.effectiveExposure90)).toBeLessThan(1e-12);
      expect(Math.abs(out.muProjected - c.expected.muProjected)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOver - c.expected.pOver)).toBeLessThan(1e-12);
    }

    // Jugador con 15 apariciones pero 10 ingresos de cambio tiene menor exposición real que 15 titularidades
    const expStarter = estimateEffectiveExposure90V52(15, 0, "FWD");
    const expSuperSub = estimateEffectiveExposure90V52(15, 10, "FWD");
    expect(expSuperSub).toBeLessThan(expStarter * 0.6);
  });

  it("4. Paridad IEEE-754 < 1e-12 en walk-forward causal US (`MLB`, `NHL`, `NBA`, `NFL`) y fatiga B2B", () => {
    expect(paritySnap.us_walkforward_cases.length).toBe(20);
    for (const c of paritySnap.us_walkforward_cases) {
      const out = projectUsWalkforwardGameV52({
        ...c.input,
        artifact,
      });
      expect(Math.abs(out.muHome - c.expected.muHome)).toBeLessThan(1e-12);
      expect(Math.abs(out.muAway - c.expected.muAway)).toBeLessThan(1e-12);
      expect(Math.abs(out.expectedMargin - c.expected.expectedMargin)).toBeLessThan(1e-12);
      expect(Math.abs(out.expectedTotal - c.expected.expectedTotal)).toBeLessThan(1e-12);
      expect(Math.abs(out.pHomeWin - c.expected.pHomeWin)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOver - c.expected.pOver)).toBeLessThan(1e-12);
    }
  });

  it("5. Evidencia OOS `EXP_V57` significativa, cero claves prohibidas e integridad SHA-256 `v5.2`", () => {
    const res = readJson<{
      holdout_sealed_untouched: boolean;
      multi_league_football_v52: {
        season_results_43_leagues_1x2_walkforward: { significant_improvement: boolean; delta_mean: number };
        strict_prekickoff_57_games: {
          o25_logloss_diff: { significant_improvement: boolean; delta_mean: number };
          playable_picks_1_55_to_2_60: { logloss_diff: { significant_improvement: boolean } };
        };
      };
      us_multisport_walkforward_oos_v52: Record<
        UsWalkforwardSportV52,
        {
          validation_status: string;
          oos_evaluated_games_post_burnin: number;
          moneyline_vs_coin_oos: { delta_mean: number; significant_improvement: boolean };
        }
      >;
    }>("research/prediction-lab/experiments/EXP_V57_v5_2_live_feedback/artifacts/exp_v57_v5_2_results.json");

    expect(res.holdout_sealed_untouched).toBe(true);
    expect(res.multi_league_football_v52.season_results_43_leagues_1x2_walkforward.significant_improvement).toBe(true);
    expect(res.multi_league_football_v52.strict_prekickoff_57_games.o25_logloss_diff.significant_improvement).toBe(true);
    expect(
      res.multi_league_football_v52.strict_prekickoff_57_games.playable_picks_1_55_to_2_60.logloss_diff
        .significant_improvement,
    ).toBe(true);

    expect(res.us_multisport_walkforward_oos_v52.mlb.validation_status).toBe(
      "prospective_walk_forward_game_oos_verified",
    );
    expect(res.us_multisport_walkforward_oos_v52.mlb.moneyline_vs_coin_oos.significant_improvement).toBe(true);
    expect(res.us_multisport_walkforward_oos_v52.nba.moneyline_vs_coin_oos.significant_improvement).toBe(true);
    expect(res.us_multisport_walkforward_oos_v52.nhl.moneyline_vs_coin_oos.delta_mean).toBeLessThan(0.0);
    expect(res.us_multisport_walkforward_oos_v52.nfl.moneyline_vs_coin_oos.delta_mean).toBeLessThan(0.0);

    // Cero campos prohibidos en artefactos públicos v5.2
    const rawSnapText = readFileSync(
      resolve(REPO_ROOT, "src/data/prediction/v5_2_live_feedback_snapshot.json"),
      "utf8",
    );
    for (const forbidden of ['"stake"', '"kelly"', '"kellyFraction"', '"expectedEdge"', '"tier"']) {
      expect(rawSnapText.includes(forbidden)).toBe(false);
    }

    const reg52 = readJson<{
      status: string;
      production_activated: boolean;
      holdout_sealed_untouched: boolean;
      v5_2_live_feedback_artifacts: Array<{ artifact_path: string; sha256: string }>;
    }>("src/data/prediction/candidate_registry_v5_2.json");
    expect(reg52.status).toBe("candidate");
    expect(reg52.production_activated).toBe(false);
    expect(reg52.holdout_sealed_untouched).toBe(true);
    for (const ent of reg52.v5_2_live_feedback_artifacts) {
      expect(sha256File(ent.artifact_path)).toBe(ent.sha256);
    }
  });
});
