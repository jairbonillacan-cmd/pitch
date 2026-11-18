import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

import clubV35SnapshotJson from "../../src/data/prediction/club_v3_5_live_snapshot.json";
import gbmClubV35Json from "../../src/data/prediction/gbm_club_v3_5_live_candidate.json";
import gbmIntlV35Json from "../../src/data/prediction/gbm_intl_soccer_v3_5_candidate.json";
import gbmNflV35Json from "../../src/data/prediction/gbm_nfl_v3_5_candidate.json";
import intlV35SnapshotJson from "../../src/data/prediction/intl_soccer_v3_5_snapshot.json";
import clubGoalsV35Json from "../../src/data/prediction/model_club_goals_v3_5_candidate.json";
import intlGoalsV35Json from "../../src/data/prediction/model_intl_goals_v3_5_candidate.json";
import nflV35SnapshotJson from "../../src/data/prediction/nfl_v3_5_snapshot.json";
import { evaluateClubV35CompactRow } from "../../src/domain/prediction/club_v3_3.js";
import { predictLogitGbmEnsemble, validateGbmArtifact, type GbmArtifact } from "../../src/domain/prediction/gbm.js";
import {
  solveCoherentDixonColes3Param,
  solveDixonColes2ParamFrom1X2,
  type HorizonGoalsModelArtifact,
} from "../../src/domain/prediction/horizon_goals.js";
import { evaluateMeridianV35CompactRow } from "../../src/domain/prediction/intl_soccer.js";
import { buildDixonColesScoreMatrix } from "../../src/domain/prediction/markets_2way.js";

describe("PitchLab v3.5 Horizon-Goals 3-Param Solver & Club/Meridian/NFL v3.5 Parity", () => {
  it("preserves exact 1X2 probabilities while reproducing target total goals inside the physical DC cone", () => {
    const cases = [
      { pHome: 0.46, pDraw: 0.27, pAway: 0.27, totalGoalsTarget: 2.85, rhoPrior: -0.11 },
      { pHome: 0.68, pDraw: 0.19, pAway: 0.13, totalGoalsTarget: 3.3, rhoPrior: -0.1 },
      { pHome: 0.35, pDraw: 0.32, pAway: 0.33, totalGoalsTarget: 2.05, rhoPrior: -0.13 },
      { pHome: 0.21, pDraw: 0.24, pAway: 0.55, totalGoalsTarget: 2.65, rhoPrior: -0.09 },
    ] as const;

    for (const c of cases) {
      const res = solveCoherentDixonColes3Param(c);
      const mat = buildDixonColesScoreMatrix(res.lamHome, res.lamAway, res.rhoEff);
      let pH = 0.0;
      let pD = 0.0;
      let pA = 0.0;
      for (let h = 0; h < mat.length; h += 1) {
        const row = mat[h]!;
        for (let a = 0; a < row.length; a += 1) {
          const p = row[a]!;
          if (h > a) pH += p;
          else if (h === a) pD += p;
          else pA += p;
        }
      }
      expect(Math.abs(pH - c.pHome)).toBeLessThan(1e-7);
      expect(Math.abs(pD - c.pDraw)).toBeLessThan(1e-7);
      expect(Math.abs(pA - c.pAway)).toBeLessThan(1e-7);
      if (res.rhoEff > -0.319 && res.rhoEff < 0.219) {
        expect(Math.abs(res.totalGoalsImplied - c.totalGoalsTarget)).toBeLessThan(1e-9);
      }
    }
  });

  it("maintains < 1e-12 IEEE-754 parity between horizon_goals.ts and horizon_dc_solver.py", { timeout: 60_000 }, () => {
    const repoRoot = process.cwd();
    const pyExe = path.join(repoRoot, "research", "prediction-lab", ".venv", "Scripts", "python.exe");
    const script = [
      "import json, sys",
      "sys.path.insert(0, 'research/prediction-lab/experiments/EXP_V37_club_v3_5_engines')",
      "from horizon_dc_solver import solve_coherent_dc_3param, solve_dc_2param_from_1x2",
      "r3 = solve_coherent_dc_3param(0.51, 0.26, 0.23, 2.94, -0.105)",
      "r2 = solve_dc_2param_from_1x2(0.51, 0.26, 0.23, -0.10)",
      "print(json.dumps({'r3': r3, 'r2': r2}))",
    ].join("; ");

    const proc = spawnSync(pyExe, ["-B", "-c", script], {
      cwd: repoRoot,
      encoding: "utf-8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    expect(proc.status).toBe(0);
    const parsed = JSON.parse(proc.stdout.trim()) as {
      r3: [number, number, number];
      r2: [number, number];
    };

    const ts3 = solveCoherentDixonColes3Param({
      pHome: 0.51,
      pDraw: 0.26,
      pAway: 0.23,
      totalGoalsTarget: 2.94,
      rhoPrior: -0.105,
    });
    const ts2 = solveDixonColes2ParamFrom1X2({ pHome: 0.51, pDraw: 0.26, pAway: 0.23 }, -0.1);

    expect(Math.abs(ts3.lamHome - parsed.r3[0])).toBeLessThan(1e-12);
    expect(Math.abs(ts3.lamAway - parsed.r3[1])).toBeLessThan(1e-12);
    expect(Math.abs(ts3.rhoEff - parsed.r3[2])).toBeLessThan(1e-12);
    expect(Math.abs(ts2.lamHome - parsed.r2[0])).toBeLessThan(1e-12);
    expect(Math.abs(ts2.lamAway - parsed.r2[1])).toBeLessThan(1e-12);
  });

  it("validates gbm_nfl_v3_5_candidate.json and matches Python snapshot to < 1e-12", () => {
    const art = gbmNflV35Json as unknown as GbmArtifact;
    validateGbmArtifact(art);
    expect(art.production_activated).toBe(false);

    for (const row of nflV35SnapshotJson.rows) {
      const res = predictLogitGbmEnsemble(
        {
          features: row.features,
          div_onehot: [],
        },
        art,
      );
      expect(Math.abs(res.pHome - row.python_ensemble_probs[0]!)).toBeLessThan(1e-12);
      expect(Math.abs(res.pDraw - row.python_ensemble_probs[1]!)).toBeLessThan(1e-12);
      expect(Math.abs(res.pAway - row.python_ensemble_probs[2]!)).toBeLessThan(1e-12);
    }
  });

  it("validates Meridian v3.5 artifacts and matches 150-row Python snapshot (1X2 + 3-param DC) to < 1e-12", () => {
    const gbmArt = gbmIntlV35Json as unknown as GbmArtifact;
    const goalsArt = intlGoalsV35Json as unknown as HorizonGoalsModelArtifact;
    validateGbmArtifact(gbmArt);
    expect(gbmArt.production_activated).toBe(false);
    expect(goalsArt.production_activated).toBe(false);
    expect(intlV35SnapshotJson.rows.length).toBeGreaterThanOrEqual(150);

    for (const row of intlV35SnapshotJson.rows) {
      const res = evaluateMeridianV35CompactRow({
        features: row.features,
        goalsFeatures: row.goals_features,
        div: row.div,
        gbmArtifact: gbmArt,
        goalsArtifact: goalsArt,
      });
      expect(Math.abs(res.ensembleProbs[0] - row.python_ensemble_probs[0]!)).toBeLessThan(1e-12);
      expect(Math.abs(res.ensembleProbs[1] - row.python_ensemble_probs[1]!)).toBeLessThan(1e-12);
      expect(Math.abs(res.ensembleProbs[2] - row.python_ensemble_probs[2]!)).toBeLessThan(1e-12);
      expect(Math.abs(res.tPoisson - row.python_t_poisson)).toBeLessThan(1e-12);
      expect(Math.abs(res.dc3Param.lamHome - row.python_dc_3param.lam_home)).toBeLessThan(5e-10);
      expect(Math.abs(res.dc3Param.lamAway - row.python_dc_3param.lam_away)).toBeLessThan(5e-10);
      expect(Math.abs(res.dc3Param.rhoEff - row.python_dc_3param.rho_eff)).toBeLessThan(5e-10);

      const mat = buildDixonColesScoreMatrix(
        res.dc3Param.lamHome,
        res.dc3Param.lamAway,
        res.dc3Param.rhoEff,
        goalsArt.max_goals_grid,
      );
      let pOver25 = 0.0;
      let pBtts = 0.0;
      for (let h = 0; h < mat.length; h += 1) {
        for (let a = 0; a < mat[h]!.length; a += 1) {
          const p = mat[h]![a]!;
          if (h + a >= 3) pOver25 += p;
          if (h >= 1 && a >= 1) pBtts += p;
        }
      }
      expect(Math.abs(pOver25 - row.python_dc_3param.p_over_2_5)).toBeLessThan(1e-12);
      expect(Math.abs(pBtts - row.python_dc_3param.p_btts_yes)).toBeLessThan(1e-11);
    }
  });

  it("validates Club Tachyon v3.5 artifacts and matches 200-row Python snapshot (1X2 + 3-param DC) to < 1e-12", () => {
    const gbmArt = gbmClubV35Json as unknown as GbmArtifact;
    const goalsArt = clubGoalsV35Json as unknown as HorizonGoalsModelArtifact;
    validateGbmArtifact(gbmArt);
    expect(gbmArt.production_activated).toBe(false);
    expect(goalsArt.production_activated).toBe(false);
    expect(clubV35SnapshotJson.rows.length).toBeGreaterThanOrEqual(200);

    for (const row of clubV35SnapshotJson.rows) {
      const res = evaluateClubV35CompactRow({
        features: row.features,
        goalsFeatures: row.goals_features,
        div: row.div,
        gbmArtifact: gbmArt,
        goalsArtifact: goalsArt,
      });
      expect(Math.abs(res.ensembleProbs[0] - row.python_ensemble_probs[0]!)).toBeLessThan(1e-12);
      expect(Math.abs(res.ensembleProbs[1] - row.python_ensemble_probs[1]!)).toBeLessThan(1e-12);
      expect(Math.abs(res.ensembleProbs[2] - row.python_ensemble_probs[2]!)).toBeLessThan(1e-12);
      expect(Math.abs(res.tPoisson - row.python_t_poisson)).toBeLessThan(1e-12);
      expect(Math.abs(res.dc3Param.lamHome - row.python_dc_3param.lam_home)).toBeLessThan(5e-10);
      expect(Math.abs(res.dc3Param.lamAway - row.python_dc_3param.lam_away)).toBeLessThan(5e-10);
      expect(Math.abs(res.dc3Param.rhoEff - row.python_dc_3param.rho_eff)).toBeLessThan(5e-10);

      const mat = buildDixonColesScoreMatrix(
        res.dc3Param.lamHome,
        res.dc3Param.lamAway,
        res.dc3Param.rhoEff,
        goalsArt.max_goals_grid,
      );
      let pOver25 = 0.0;
      let pBtts = 0.0;
      for (let h = 0; h < mat.length; h += 1) {
        for (let a = 0; a < mat[h]!.length; a += 1) {
          const p = mat[h]![a]!;
          if (h + a >= 3) pOver25 += p;
          if (h >= 1 && a >= 1) pBtts += p;
        }
      }
      expect(Math.abs(pOver25 - row.python_dc_3param.p_over_2_5)).toBeLessThan(1e-12);
      expect(Math.abs(pBtts - row.python_dc_3param.p_btts_yes)).toBeLessThan(1e-12);
    }
  });
});
