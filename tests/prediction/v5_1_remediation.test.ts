/**
 * PitchLab v5.1 Red-Team Remediation Test Suite (`REM_08`) —
 * Protege de forma permanente los **12 axiomas inviolables** definidos en la auditoría `v5.1`,
 * además de la paridad IEEE-754 `< 1e-12` de `Inductive Venn-Abers` y del guardrail ampliado.
 */

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildVerifiedMatchFactSheet,
  computeConformalEpistemicBandV5,
  evaluatePlayerLinkedSgpV5,
  evaluateSoccerEarlyPayoutAndInPlay,
  projectMlbV36Outlook,
  projectNflMarketSpreadPosteriorV5,
  solveNflKeyNumberMarginPmfExact,
  studentTQuantileExact,
  validateMatchMathematicalInvariants,
  validateNarrativeAgainstFactSheet,
  type EpistemicConformalArtifactV51,
  type InPlayEarlyPayoutArtifactV5,
  type MultiSportV36ConfigArtifact,
  type NflModelArtifactV5,
  type SoccerMicroModelArtifactV5,
} from "../../src/domain/prediction/v5_index.js";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

function readJson<T = Record<string, unknown>>(relPath: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relPath), "utf8")) as T;
}

function sha256File(relPath: string): string {
  return createHash("sha256").update(readFileSync(resolve(REPO_ROOT, relPath))).digest("hex");
}

describe("PitchLab v5.1 · Batería Red-Team Permanente de 12 Axiomas Inviolables", () => {
  it("Axioma 1: 0 / 84 violaciones de pEarlyPayout >= corePHome y pAwayEarlyPayout >= corePAway en snapshot vivo", () => {
    const snap = readJson<{
      outlooks: Array<{
        matchId: string;
        sport: string;
        coreProbabilities: { pHome: number; pDraw: number | null; pAway: number };
        earlyPayout2Goals?: { pHomeEarlyPayoutWin: number; pAwayEarlyPayoutWin: number };
        epistemicUncertainty90: {
          home: { pPoint: number; pLower90: number; pUpper90: number };
          away: { pPoint: number; pLower90: number; pUpper90: number };
        };
      }>;
    }>("src/data/prediction/live_matchday_v5_candidate_snapshot.json");

    const soccer = snap.outlooks.filter((o) => o.sport === "soccer");
    expect(soccer.length).toBe(84);
    for (const o of soccer) {
      expect(o.earlyPayout2Goals).toBeDefined();
      expect(o.earlyPayout2Goals!.pHomeEarlyPayoutWin).toBeGreaterThanOrEqual(
        o.coreProbabilities.pHome - 1e-6,
      );
      expect(o.earlyPayout2Goals!.pAwayEarlyPayoutWin).toBeGreaterThanOrEqual(
        o.coreProbabilities.pAway - 1e-6,
      );
      const inv = validateMatchMathematicalInvariants({
        pHome: o.coreProbabilities.pHome,
        pDraw: o.coreProbabilities.pDraw,
        pAway: o.coreProbabilities.pAway,
        pHomeEarlyPayoutWin: o.earlyPayout2Goals!.pHomeEarlyPayoutWin,
        pAwayEarlyPayoutWin: o.earlyPayout2Goals!.pAwayEarlyPayoutWin,
        epistemicBands: [
          { label: "home", ...o.epistemicUncertainty90.home },
          { label: "away", ...o.epistemicUncertainty90.away },
        ],
      });
      expect(inv.passed).toBe(true);
    }

    // Verificar también el ancla directa en `evaluateSoccerEarlyPayoutAndInPlay` en TS
    const inplayArt = readJson<InPlayEarlyPayoutArtifactV5>(
      "src/data/prediction/model_inplay_early_payout_v5_0_candidate.json",
    );
    const anchored = evaluateSoccerEarlyPayoutAndInPlay({
      pregameMuHome: 1.55,
      pregameMuAway: 1.15,
      corePHome: 0.56,
      corePDraw: 0.24,
      corePAway: 0.20,
      artifact: inplayArt,
    });
    expect(anchored.earlyPayout2Goals.pHomeEarlyPayoutWin).toBeGreaterThan(0.56);
    expect(anchored.earlyPayout2Goals.pAwayEarlyPayoutWin).toBeGreaterThan(0.20);
  });

  it("Axioma 2: 0 / 130 copias directas de v3 en Fútbol y NFL (inferencia real Tachyon v5.1 y Minkowski EPA)", () => {
    const v3 = readJson<{
      expected_predictions: Array<{
        matchupId: string;
        sport: string;
        finalProbs: { pHome: number; pAway: number };
      }>;
    }>("src/data/prediction/live_matchday_v3_snapshot.json");
    const v5 = readJson<{
      live_inference_audit: {
        exact_v3_copy_bypass_count: number;
        nfl_real_minkowski_inference: number;
        soccer_both_clubs_resolved: number;
      };
      outlooks: Array<{
        matchId: string;
        sport: string;
        coreProbabilities: { pHome: number; pAway: number; pLogitHome?: number; pGbmHome?: number };
        dataQuality: { sourceEngine: string };
      }>;
    }>("src/data/prediction/live_matchday_v5_candidate_snapshot.json");

    expect(v5.live_inference_audit.exact_v3_copy_bypass_count).toBe(0);
    expect(v5.live_inference_audit.nfl_real_minkowski_inference).toBe(46);
    expect(v5.live_inference_audit.soccer_both_clubs_resolved).toBeGreaterThanOrEqual(75);

    const v3Map = new Map(v3.expected_predictions.map((r) => [r.matchupId, r]));
    let exactCopies = 0;
    for (const o of v5.outlooks) {
      if (o.sport !== "soccer" && o.sport !== "nfl") continue;
      expect(typeof o.coreProbabilities.pLogitHome).toBe("number");
      expect(typeof o.coreProbabilities.pGbmHome).toBe("number");
      const r3 = v3Map.get(o.matchId);
      if (r3) {
        const ph3 = o.sport === "nfl"
          ? r3.finalProbs.pHome / (r3.finalProbs.pHome + r3.finalProbs.pAway)
          : r3.finalProbs.pHome;
        if (Math.abs(o.coreProbabilities.pHome - ph3) < 1e-6) {
          exactCopies += 1;
        }
      }
    }
    expect(exactCopies).toBe(0);
  });

  it("Axioma 3: 0 árboles HGB serializados cuando w_hgb == 0.0 y tamaño micro JSON < 150 KB", () => {
    const microPath = resolve(REPO_ROOT, "src/data/prediction/model_soccer_micro_v5_0_candidate.json");
    const sizeKb = statSync(microPath).size / 1024.0;
    expect(sizeKb).toBeLessThan(150.0);

    const micro = readJson<SoccerMicroModelArtifactV5>(
      "src/data/prediction/model_soccer_micro_v5_0_candidate.json",
    );
    for (const q of ["corners", "yellow_cards", "fouls", "shots_on_target", "shots"] as const) {
      const sp = micro.metrics[q];
      if (sp.w_hgb_home === 0.0) {
        expect(sp.home_hgb).toBeNull();
      }
      if (sp.w_hgb_away === 0.0) {
        expect(sp.away_hgb).toBeNull();
      }
    }
  });

  it("Axioma 4: 0 reportes falsos promoted_ece_ge_50pct === 0.0 cuando promoted_n_ge_50pct === 0", () => {
    const res = readJson<{
      oos_line_0_5_metrics: Record<
        string,
        {
          vs_v4_0_nearest_knot_pava: {
            promoted_n_ge_50pct: number;
            promoted_ece_ge_50pct: number | null;
          };
        }
      >;
      oos_multi_line_1_5_brace_metrics: Record<
        string,
        { promoted_n_ge_50pct: number; promoted_ece_ge_50pct: number | null }
      >;
    }>("research/prediction-lab/experiments/EXP_V53_props_v5_0/artifacts/exp_v53_props_v5_0_results.json");

    for (const fam of Object.values(res.oos_line_0_5_metrics)) {
      const m = fam.vs_v4_0_nearest_knot_pava;
      if (m.promoted_n_ge_50pct === 0) {
        expect(m.promoted_ece_ge_50pct).toBeNull();
      }
    }
    for (const fam of Object.values(res.oos_multi_line_1_5_brace_metrics)) {
      if (fam.promoted_n_ge_50pct === 0) {
        expect(fam.promoted_ece_ge_50pct).toBeNull();
      }
    }
  });

  it("Axioma 5: NFL Real ATS posterior LL <= ln(2) + 0.002, ECE < 2.5% y Std(M | spread) condicional en [13.0, 13.8]", () => {
    const nflArt = readJson<NflModelArtifactV5>("src/data/prediction/model_nfl_v5_0_candidate.json");
    const nflRes = readJson<{
      margin_deconvolution: {
        pmf_std_after_v5_1: number;
      };
      real_spread_line_ats_posterior_vs_coin_oos: { log_loss: number; ece: number };
    }>("research/prediction-lab/experiments/EXP_V52_nfl_v5_0_complete/artifacts/exp_v52_nfl_v5_0_results.json");

    expect(nflRes.margin_deconvolution.pmf_std_after_v5_1).toBeGreaterThanOrEqual(13.0);
    expect(nflRes.margin_deconvolution.pmf_std_after_v5_1).toBeLessThanOrEqual(13.8);
    expect(nflRes.real_spread_line_ats_posterior_vs_coin_oos.log_loss).toBeLessThanOrEqual(
      Math.log(2) + 0.002,
    );
    expect(nflRes.real_spread_line_ats_posterior_vs_coin_oos.ece).toBeLessThan(0.025);

    // Verificar en TS que la PMF 50/50 de `nfl_v4_0.ts` produce exactamente Std en [13.0, 13.8]
    const sol50 = solveNflKeyNumberMarginPmfExact({
      pHome: 0.498,
      pTie: 0.004,
      pAway: 0.498,
      artifact: {
        ...nflArt,
        totals_calibration: {
          sigma_game_physical: 13.4,
          market_posterior_w_model: nflArt.discrete_totals_v5.market_posterior_w_model,
          sigma_market_posterior: 13.4,
        },
      },
    });
    let varM = 0.0;
    for (let i = 0; i < sol50.pmf.length; i += 1) {
      const m = i - 45;
      varM += sol50.pmf[i]! * (m - sol50.expectedMargin) ** 2;
    }
    const std50 = Math.sqrt(varM);
    expect(std50).toBeGreaterThanOrEqual(13.0);
    expect(std50).toBeLessThanOrEqual(13.8);

    const postAts = projectNflMarketSpreadPosteriorV5({
      modelExpectedMargin: 5.2,
      marketSpreadHome: -3.0,
      artifact: nflArt,
    });
    expect(postAts.pHomeCoverNoPush).toBeGreaterThan(0.45);
    expect(postAts.pHomeCoverNoPush).toBeLessThan(0.60);
  });

  it("Axioma 6: Matriz 4-Param sin doble inflación (w_rho_blend == 0.0, |bias O2.5| < 0.7 pp, 0 inflación extra BTTS y mejora significativa)", () => {
    const res = readJson<{
      selected_4param_matrix: { rho_draw_blend_weight: number };
      club_totals_2_5_4param_oos_vs_v3_5: { bias_pp: number; benchmark_bias_pp: number };
      club_btts_4param_oos_vs_v3_5: {
        bias_pp: number;
        benchmark_bias_pp: number;
        delta_ll_vs_benchmark: number;
        significant_improvement: boolean;
      };
      club_max_1x2_cone_error_v5_0: number;
    }>("research/prediction-lab/experiments/EXP_V50_soccer_v5_0_global/artifacts/exp_v50_soccer_v5_0_results.json");

    expect(res.selected_4param_matrix.rho_draw_blend_weight).toBe(0.0);
    expect(Math.abs(res.club_totals_2_5_4param_oos_vs_v3_5.bias_pp)).toBeLessThan(0.7);
    expect(
      Math.abs(
        res.club_btts_4param_oos_vs_v3_5.bias_pp -
          res.club_btts_4param_oos_vs_v3_5.benchmark_bias_pp,
      ),
    ).toBeLessThan(0.15);
    expect(res.club_btts_4param_oos_vs_v3_5.delta_ll_vs_benchmark).toBeLessThan(0.0);
    expect(res.club_btts_4param_oos_vs_v3_5.significant_improvement).toBe(true);
    expect(res.club_max_1x2_cone_error_v5_0).toBeLessThan(1e-12);
  });

  it("Axioma 7: Knockout 90' limpio de tandas de penales (first_leg_multiplier < 1.0 y max_goals_val <= 10)", () => {
    const art = readJson<{
      knockout_stage_config: {
        first_leg_multiplier: number;
        max_goals_val: number;
        shootouts_purged: number;
      };
    }>("src/data/prediction/model_hierarchical_props_v5_0_candidate.json");

    expect(art.knockout_stage_config.first_leg_multiplier).toBeLessThan(1.0);
    expect(art.knockout_stage_config.max_goals_val).toBeLessThanOrEqual(10.0);
    expect(art.knockout_stage_config.shootouts_purged).toBeGreaterThan(0);
  });

  it("Axioma 8: Física MLB remediada (ratio ofensivo .345 vs .285 wOBA >= 1.38x y Total Runs promedio en [8.65, 8.95])", () => {
    const msState = readJson<{ v36_physics_config: MultiSportV36ConfigArtifact }>(
      "src/data/prediction/multisport_v4_0_state_candidate.json",
    );
    const cfg = msState.v36_physics_config;
    const eliteVsWeak = projectMlbV36Outlook(
      { home_woba: 0.345, away_woba: 0.285, neutral_site: true },
      cfg,
    );
    const ratio = eliteVsWeak.full_game.mu_9inn_home / eliteVsWeak.full_game.mu_9inn_away;
    expect(ratio).toBeGreaterThanOrEqual(1.38);

    const avgGame = projectMlbV36Outlook(
      {
        home_woba: 0.312,
        away_woba: 0.312,
        home_sp_fip: 4.08,
        away_sp_fip: 4.08,
        home_bp_fip: 4.08,
        away_bp_fip: 4.08,
        neutral_site: false,
      },
      cfg,
    );
    expect(avgGame.full_game.expected_total_runs).toBeGreaterThanOrEqual(8.65);
    expect(avgGame.full_game.expected_total_runs).toBeLessThanOrEqual(8.95);
  });

  it("Axioma 9: SGP QMC sesgo < 0.10 pp vs MVN exacto, Student-t quantile error < 1e-6 y Raikov+DC coherente", () => {
    const res = readJson<{
      numerical_precision_audit: {
        max_student_t_quantile_error_vs_scipy: number;
        max_qmc_bivariate_bias_vs_scipy_mvn: number;
      };
    }>("research/prediction-lab/experiments/EXP_V55_sgp_student_t_player_v5_0/artifacts/exp_v55_sgp_v5_0_results.json");

    expect(res.numerical_precision_audit.max_student_t_quantile_error_vs_scipy).toBeLessThan(1e-6);
    expect(res.numerical_precision_audit.max_qmc_bivariate_bias_vs_scipy_mvn).toBeLessThan(0.001);

    // Verificar en TS `studentTQuantileExact` en cola extrema `(p=0.99, nu=5)` (valor exacto = 3.364930)
    expect(Math.abs(studentTQuantileExact(0.99, 5.0) - 3.364929998907275)).toBeLessThan(1e-6);

    // Verificar que Raikov con Dixon-Coles respeta cotas de Fréchet
    const pl = evaluatePlayerLinkedSgpV5({
      pPlayerAnytimeGoal: 0.42,
      teamExpectedGoals: 1.75,
      opponentExpectedGoals: 1.05,
      teamOutcome: "team_win",
      matchTotalOverLine: 2.5,
      dixonColesRho: -0.08,
    });
    expect(pl.jointProbability).toBeLessThanOrEqual(pl.pPlayerScores);
    expect(pl.jointProbability).toBeGreaterThan(pl.independentProbability);
  });

  it("Axioma 10: Booking Points gamma_red > 0 con conservación exacta de E[Y] y cobertura arbitral Big-7 > 90%", () => {
    const micro = readJson<SoccerMicroModelArtifactV5>(
      "src/data/prediction/model_soccer_micro_v5_0_candidate.json",
    );
    const res = readJson<{
      referee_enrichment: { big7_coverage_after: number };
      selected_booking_points_gamma_red: number;
    }>("research/prediction-lab/experiments/EXP_V51_micro_markets_v5_0/artifacts/exp_v51_micro_markets_v5_0_results.json");

    expect(micro.red_cards_model.booking_points_gamma_red).toBeGreaterThan(0.0);
    expect(res.selected_booking_points_gamma_red).toBeGreaterThan(0.0);
    expect(res.referee_enrichment.big7_coverage_after).toBeGreaterThan(0.9);
  });

  it("Axioma 11: Venn-Abers / Epistemic cobertura OOS >= 88%, paridad < 1e-12 y guardrail detecta comas 62,5% y no-favorito", () => {
    const epArt = readJson<EpistemicConformalArtifactV51>(
      "src/data/prediction/model_epistemic_conformal_v5_1_candidate.json",
    );
    const epSnap = readJson<{
      rows: Array<{
        input: {
          pPoint: number;
          effectiveSampleGames: number;
          pSubModelA: number;
          pSubModelB: number;
          seasonProgress: number;
          hasRecentCoachOrQbChange: boolean;
          missingKeyStarters: number;
          sport: string;
        };
        expected: { pLower90: number; pUpper90: number; halfWidth90: number };
      }>;
    }>("src/data/prediction/epistemic_conformal_v5_1_snapshot.json");

    expect(epArt.sports.soccer!.oos_empirical_coverage_90).toBeGreaterThanOrEqual(0.88);
    expect(epArt.sports.nfl!.oos_empirical_coverage_90).toBeGreaterThanOrEqual(0.88);

    for (const r of epSnap.rows) {
      const out = computeConformalEpistemicBandV5({
        ...r.input,
        calibrationArtifact: epArt,
      });
      expect(Math.abs(out.pLower90 - r.expected.pLower90)).toBeLessThan(1e-12);
      expect(Math.abs(out.pUpper90 - r.expected.pUpper90)).toBeLessThan(1e-12);
      expect(Math.abs(out.halfWidth90 - r.expected.halfWidth90)).toBeLessThan(1e-12);
    }

    // Guardrail ampliado debe atrapar comas españolas (`62,5%`), porcentajes de no-favorito alucinados y `100%`
    const facts = buildVerifiedMatchFactSheet({
      matchId: "rm_getafe",
      sport: "soccer",
      homeTeam: "Real Madrid",
      awayTeam: "Getafe",
      pHome: 0.625,
      pDraw: 0.225,
      pAway: 0.15,
      expectedTotal: 2.7,
      canonicalTotalLine: 2.5,
      pOverCanonical: 0.54,
    });
    const badComma = validateNarrativeAgainstFactSheet(
      "Real Madrid parte como favorito con 62,5% frente a Getafe con 12,0%.",
      facts,
    );
    expect(badComma.passed).toBe(false); // 12,0% vs 15.0% real (error 3.0 pp > 1.0 pp!)

    const badExtreme = validateNarrativeAgainstFactSheet(
      "Real Madrid ganará con 100% de seguridad frente a Getafe.",
      facts,
    );
    expect(badExtreme.passed).toBe(false);
  });

  it("Axioma 12: SHA-256 intacto (0 bytes modificados) en los 11 artefactos congelados v3.0 / v3.1 / v3.2 y registro v5.1 consistente", () => {
    const expectedFrozenPrefixes: Record<string, string> = {
      "src/domain/prediction/engine.ts": "77dc721430ff17b1",
      "src/domain/prediction/outlook.ts": "26933d21438d5298",
      "src/domain/prediction/service.ts": "53fbf32117ab6a64",
      "src/data/prediction/live_matchday_v3_snapshot.json": "1dace760d68442e7",
      "src/data/prediction/production_segments_v3_1.json": "0bc03bbff96a5d82",
      "src/data/prediction/blend_weights_v3_1.json": "b29d7a451f601112",
      "src/data/prediction/pick_policy_v3_1.json": "2359c8f8822ea394",
      "src/data/prediction/stale_lines_config.json": "8bcb9c7be93270cd",
      "src/data/prediction/model_motor_a.json": "3c72967eddc79bb7",
      "src/data/prediction/model_nfl.json": "e74ae241875739d2",
      "services/models/artifacts/sealed_holdout_v3_1_eval.json": "5c9e550bfd7889e4",
    };

    for (const [relPath, prefix] of Object.entries(expectedFrozenPrefixes)) {
      const actual = sha256File(relPath);
      expect(actual.startsWith(prefix), `Frozen file modified: ${relPath} (${actual})`).toBe(true);
    }

    const reg = readJson<{
      status: string;
      production_activated: boolean;
      holdout_sealed_untouched: boolean;
      active_artifacts: Array<{ artifact_path: string; sha256: string }>;
    }>("src/data/prediction/candidate_registry_v5_1.json");
    expect(reg.status).toBe("candidate");
    expect(reg.production_activated).toBe(false);
    expect(reg.holdout_sealed_untouched).toBe(true);
    expect(reg.active_artifacts.length).toBeGreaterThanOrEqual(11);
    for (const ent of reg.active_artifacts) {
      expect(sha256File(ent.artifact_path)).toBe(ent.sha256);
    }
  });
});
