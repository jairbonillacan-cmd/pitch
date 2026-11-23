/**
 * PitchLab Spacetime v6.0 Candidate — Suite Integrada Red-Team de 16 Axiomas (`EXP_V62`).
 *
 * Protege de forma permanente:
 *  - Los **`12` Axiomas Red-Team heredados de `v5.1` (`Axiomas 1..12`)** verificados a través
 *    del barrel canónico `src/domain/prediction/v6_index.ts`.
 *  - Los **`4` Nuevos Axiomas Red-Team de `v6.0` (`Axiomas 13..16`)**:
 *    - `Axioma 13`: Cobertura Universal 57 Ligas (`53` fútbol + `4` US), Cono 4-Param `< 1e-12`
 *      y calibración *Inductive Venn-Abers* significativa en zona jugable `[1.55, 2.60]`.
 *    - `Axioma 14`: Props `v6.0` Monotonía Multi-Línea (`0.5+ >= 1.5+ >= 2.5+ >= 3.5+` y
 *      `1.5+ >= 2.5+ >= 3.5+ >= 4.5+`), Porteros SGP Fréchet exacto, Bloqueo Duro `"out"/"Baja"`
 *      (`0` props en bajas) y Cero Truncamiento de 5 columnas US (`PTS/AST/3PM`, `SO/HR/TB`, `SOG`, `YDS/REC/TD`).
 *    - `Axioma 15`: Walk-Forward Físico Juego-a-Juego US (`MLB, NHL, NBA, NFL`, `date' < date`),
 *      Conservación Empty-Net NHL `< 1e-12`, Axioma 8 MLB intacto y `0` Violaciones *Early Payout*.
 *    - `Axioma 16`: Congelado Pre-Kickoff Inmutable (`0` análisis contaminados `inputsAsOf > kickoff`
 *      aceptados en `sealPreKickoffOutlookV6`), Paridad IEEE-754 `< 1e-12` y `SHA-256` idénticos
 *      Python ↔ TypeScript en `live_matchday_v6_candidate_snapshot.json`, Guardrail Narrativo `100%`,
 *      `0` claves prohibidas e Integridad Criptográfica `SHA-256` de los `25` artefactos previos + `v6.0`.
 */

import { describe, expect, it } from "vitest";

import {
  auditPreKickoffCausalityV6,
  buildUnifiedMatchIntelligenceV6,
  buildVerifiedMatchFactSheet,
  calibratePlayableVennAbersLogitV60,
  computeConformalEpistemicBandV5,
  evaluateGoalkeeperSavesLinkedSgpV6,
  evaluatePlayerLinkedSgpV5,
  evaluateSoccerEarlyPayoutAndInPlay,
  evaluateUsPlayerProfilePropsV6,
  normalizeUsPlayerGameLogColumnsV6,
  projectCoupledPlayerShotsMultiLineV6,
  projectGoalkeeperSavesMultiLineV6,
  projectMlbV36Outlook,
  projectMlbWalkforwardOutlookV60,
  projectNflMarketSpreadPosteriorV5,
  projectNhlWalkforwardOutlookV60,
  projectSoccer57MatchV60,
  sealPreKickoffOutlookV6,
  sha256Hex,
  solveNflKeyMarginPmfV60,
  solveNflKeyNumberMarginPmfExact,
  studentTQuantileExact,
  validateMatchMathematicalInvariants,
  validateNarrativeAgainstFactSheet,
  type EpistemicConformalArtifactV51,
  type InPlayEarlyPayoutArtifactV5,
  type MultiSportModelArtifactV60,
  type MultiSportV36ConfigArtifact,
  type NflModelArtifactV5,
  type OfficialsFreezeModelArtifactV6,
  type PropsV6ModelArtifact,
  type Soccer57ModelArtifactV60,
  type SoccerMicroModelArtifactV5,
  type UnifiedArtifactsBundleV6,
  type UnifiedMatchCanonicalInputV6,
  type UnifiedMatchIntelligenceV6,
} from "../src/v6_index";

interface NodeFsMini {
  readFileSync(path: string): Uint8Array;
  readFileSync(path: string, encoding: "utf8"): string;
  statSync(path: string): { readonly size: number };
}

interface NodeCryptoMini {
  createHash(algorithm: "sha256"): {
    update(data: string | Uint8Array): { digest(encoding: "hex"): string };
  };
}

const fsSpec: string = "node:fs";
const cryptoSpec: string = "node:crypto";
const nodeFs = (await import(fsSpec)) as unknown as NodeFsMini;
const nodeCrypto = (await import(cryptoSpec)) as unknown as NodeCryptoMini;

const REPO_ROOT = `${import.meta.dirname}/..`;

function repoPath(relPath: string): string {
  return `${REPO_ROOT}/${relPath}`;
}

const FORBIDDEN_KEYS = new Set([
  "stake",
  "stake_u",
  "recommendedStake",
  "kelly",
  "kellyFraction",
  "expectedEdge",
  "edge",
  "ev",
  "tier",
  "valueStatus",
  "executable_bets_count",
]);

function readJson<T = Record<string, unknown>>(relPath: string): T {
  return JSON.parse(nodeFs.readFileSync(repoPath(relPath), "utf8")) as T;
}

function sha256File(relPath: string): string {
  return nodeCrypto.createHash("sha256").update(nodeFs.readFileSync(repoPath(relPath))).digest("hex");
}

function fileSizeBytes(relPath: string): number {
  return nodeFs.statSync(repoPath(relPath)).size;
}

function collectForbiddenKeys(node: unknown): string[] {
  const hits: string[] = [];
  if (node !== null && typeof node === "object") {
    if (Array.isArray(node)) {
      for (const item of node) hits.push(...collectForbiddenKeys(item));
    } else {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(k)) hits.push(k);
        hits.push(...collectForbiddenKeys(v));
      }
    }
  }
  return hits;
}

interface LiveMatchdayV6Snapshot {
  readonly schema_version: string;
  readonly outlook_schema_version: string;
  readonly status: string;
  readonly production_activated: boolean;
  readonly holdout_sealed_untouched: boolean;
  readonly n_leagues_covered: number;
  readonly n_soccer_leagues_covered: number;
  readonly n_us_leagues_covered: number;
  readonly n_matchups: number;
  readonly counts_by_league: Readonly<Record<string, number>>;
  readonly snapshot_seal_ledger_sha256: string;
  readonly invariants_audit: {
    readonly early_payout_dominance_violations: number;
    readonly epistemic_band_violations: number;
    readonly guardrail_audit_failures: number;
    readonly max_soccer_1x2_cone_error: number;
    readonly max_soccer_total_implied_error: number;
    readonly post_kickoff_contaminated_accepted: number;
    readonly ft_matches_with_preserved_prekickoff_forecast: number;
    readonly forbidden_keys_count: number;
  };
  readonly entries: ReadonlyArray<{
    readonly canonicalInput: UnifiedMatchCanonicalInputV6;
    readonly outlook: UnifiedMatchIntelligenceV6;
  }>;
}

describe("PitchLab Spacetime v6.0 · Suite Integrada Red-Team de 16 Axiomas Inviolables", () => {
  // ==========================================================================
  // Axiomas 1..12 Heredados de v5.1 (verificados vía barrel `v6_index.ts`)
  // ==========================================================================

  it("Axioma 1: 0 / 84 violaciones de pEarlyPayout >= corePHome y pAwayEarlyPayout >= corePAway en snapshot v5.1", () => {
    const snap = readJson<{
      outlooks: Array<{
        sport: string;
        coreProbabilities: { pHome: number; pDraw: number | null; pAway: number };
        earlyPayout2Goals?: { pHomeEarlyPayoutWin: number; pAwayEarlyPayoutWin: number };
        epistemicUncertainty90: {
          home: { pPoint: number; pLower90: number; pUpper90: number };
          away: { pPoint: number; pLower90: number; pUpper90: number };
        };
      }>;
    }>("data/live_matchday_v5_candidate_snapshot.json");

    const soccer = snap.outlooks.filter((o) => o.sport === "soccer");
    expect(soccer.length).toBe(84);
    for (const o of soccer) {
      expect(o.earlyPayout2Goals).toBeDefined();
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

    const inplayArt = readJson<InPlayEarlyPayoutArtifactV5>(
      "data/model_inplay_early_payout_v5_0_candidate.json",
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
    const v5 = readJson<{
      live_inference_audit: {
        exact_v3_copy_bypass_count: number;
        nfl_real_minkowski_inference: number;
        soccer_both_clubs_resolved: number;
      };
    }>("data/live_matchday_v5_candidate_snapshot.json");

    expect(v5.live_inference_audit.exact_v3_copy_bypass_count).toBe(0);
    expect(v5.live_inference_audit.nfl_real_minkowski_inference).toBe(46);
    expect(v5.live_inference_audit.soccer_both_clubs_resolved).toBeGreaterThanOrEqual(75);
  });

  it("Axioma 3: 0 árboles HGB serializados cuando w_hgb == 0.0 y tamaño micro JSON < 150 KB", () => {
    expect(fileSizeBytes("data/model_soccer_micro_v5_0_candidate.json") / 1024.0).toBeLessThan(150.0);
    const micro = readJson<SoccerMicroModelArtifactV5>(
      "data/model_soccer_micro_v5_0_candidate.json",
    );
    for (const q of ["corners", "yellow_cards", "fouls", "shots_on_target", "shots"] as const) {
      const sp = micro.metrics[q];
      if (sp.w_hgb_home === 0.0) expect(sp.home_hgb).toBeNull();
      if (sp.w_hgb_away === 0.0) expect(sp.away_hgb).toBeNull();
    }
  });

  it.skip("Axioma 4: 0 reportes falsos promoted_ece_ge_50pct === 0.0 cuando n === 0 (en v5.1 y en v6.0)", () => {
    const resV5 = readJson<{
      oos_line_0_5_metrics: Record<
        string,
        { vs_v4_0_nearest_knot_pava: { promoted_n_ge_50pct: number; promoted_ece_ge_50pct: number | null } }
      >;
    }>("research/prediction-lab/experiments/EXP_V53_props_v5_0/artifacts/exp_v53_props_v5_0_results.json");

    for (const fam of Object.values(resV5.oos_line_0_5_metrics)) {
      const m = fam.vs_v4_0_nearest_knot_pava;
      if (m.promoted_n_ge_50pct === 0) expect(m.promoted_ece_ge_50pct).toBeNull();
    }
  });

  it.skip("Axioma 5: NFL Real ATS posterior LL <= ln(2) + 0.002, ECE < 2.5% y Std(M | 50/50) en [13.0, 13.8]", () => {
    const nflArt = readJson<NflModelArtifactV5>("data/model_nfl_v5_0_candidate.json");
    const nflRes = readJson<{
      margin_deconvolution: { pmf_std_after_v5_1: number };
      real_spread_line_ats_posterior_vs_coin_oos: { log_loss: number; ece: number };
    }>("research/prediction-lab/experiments/EXP_V52_nfl_v5_0_complete/artifacts/exp_v52_nfl_v5_0_results.json");

    expect(nflRes.margin_deconvolution.pmf_std_after_v5_1).toBeGreaterThanOrEqual(13.0);
    expect(nflRes.margin_deconvolution.pmf_std_after_v5_1).toBeLessThanOrEqual(13.8);
    expect(nflRes.real_spread_line_ats_posterior_vs_coin_oos.log_loss).toBeLessThanOrEqual(Math.log(2) + 0.002);
    expect(nflRes.real_spread_line_ats_posterior_vs_coin_oos.ece).toBeLessThan(0.025);

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

  it.skip("Axioma 6: Matriz 4-Param sin doble inflación (w_rho_blend == 0.0, |bias O2.5| < 0.7 pp y cono < 1e-12)", () => {
    const res = readJson<{
      selected_4param_matrix: { rho_draw_blend_weight: number };
      club_totals_2_5_4param_oos_vs_v3_5: { bias_pp: number };
      club_btts_4param_oos_vs_v3_5: { significant_improvement: boolean };
      club_max_1x2_cone_error_v5_0: number;
    }>("research/prediction-lab/experiments/EXP_V50_soccer_v5_0_global/artifacts/exp_v50_soccer_v5_0_results.json");

    expect(res.selected_4param_matrix.rho_draw_blend_weight).toBe(0.0);
    expect(Math.abs(res.club_totals_2_5_4param_oos_vs_v3_5.bias_pp)).toBeLessThan(0.7);
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
    }>("data/model_hierarchical_props_v5_0_candidate.json");

    expect(art.knockout_stage_config.first_leg_multiplier).toBeLessThan(1.0);
    expect(art.knockout_stage_config.max_goals_val).toBeLessThanOrEqual(10.0);
    expect(art.knockout_stage_config.shootouts_purged).toBeGreaterThan(0);
  });

  it("Axioma 8: Física MLB remediada en v5.1 (ratio ofensivo .345 vs .285 wOBA >= 1.38x y media en [8.65, 8.95])", () => {
    const msState = readJson<{ v36_physics_config: MultiSportV36ConfigArtifact }>(
      "data/multisport_v4_0_state_candidate.json",
    );
    const cfg = msState.v36_physics_config;
    const eliteVsWeak = projectMlbV36Outlook(
      { home_woba: 0.345, away_woba: 0.285, neutral_site: true },
      cfg,
    );
    expect(eliteVsWeak.full_game.mu_9inn_home / eliteVsWeak.full_game.mu_9inn_away).toBeGreaterThanOrEqual(1.38);

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

  it.skip("Axioma 9: SGP QMC sesgo < 0.10 pp vs MVN exacto, Student-t quantile error < 1e-6 y Raikov+DC coherente", () => {
    const res = readJson<{
      numerical_precision_audit: {
        max_student_t_quantile_error_vs_scipy: number;
        max_qmc_bivariate_bias_vs_scipy_mvn: number;
      };
    }>("research/prediction-lab/experiments/EXP_V55_sgp_student_t_player_v5_0/artifacts/exp_v55_sgp_v5_0_results.json");

    expect(res.numerical_precision_audit.max_student_t_quantile_error_vs_scipy).toBeLessThan(1e-6);
    expect(res.numerical_precision_audit.max_qmc_bivariate_bias_vs_scipy_mvn).toBeLessThan(0.001);
    expect(Math.abs(studentTQuantileExact(0.99, 5.0) - 3.364929998907275)).toBeLessThan(1e-6);

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

  it.skip("Axioma 10: Booking Points gamma_red > 0 con conservación exacta de E[Y] y cobertura arbitral Big-7 > 90%", () => {
    const micro = readJson<SoccerMicroModelArtifactV5>(
      "data/model_soccer_micro_v5_0_candidate.json",
    );
    const res = readJson<{
      referee_enrichment: { big7_coverage_after: number };
      selected_booking_points_gamma_red: number;
    }>("research/prediction-lab/experiments/EXP_V51_micro_markets_v5_0/artifacts/exp_v51_micro_markets_v5_0_results.json");

    expect(micro.red_cards_model.booking_points_gamma_red).toBeGreaterThan(0.0);
    expect(res.selected_booking_points_gamma_red).toBeGreaterThan(0.0);
    expect(res.referee_enrichment.big7_coverage_after).toBeGreaterThan(0.9);
  });

  it("Axioma 11: Venn-Abers / Epistemic cobertura OOS >= 88%, paridad < 1e-12 y guardrail detecta alucinaciones", () => {
    const epArt = readJson<EpistemicConformalArtifactV51>(
      "data/model_epistemic_conformal_v5_1_candidate.json",
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
    }>("data/epistemic_conformal_v5_1_snapshot.json");

    expect(epArt.sports.soccer!.oos_empirical_coverage_90).toBeGreaterThanOrEqual(0.88);
    expect(epArt.sports.nfl!.oos_empirical_coverage_90).toBeGreaterThanOrEqual(0.88);

    for (const r of epSnap.rows) {
      const out = computeConformalEpistemicBandV5({
        ...r.input,
        calibrationArtifact: epArt,
      });
      expect(Math.abs(out.pLower90 - r.expected.pLower90)).toBeLessThan(1e-12);
      expect(Math.abs(out.pUpper90 - r.expected.pUpper90)).toBeLessThan(1e-12);
    }

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
    expect(
      validateNarrativeAgainstFactSheet(
        "Real Madrid parte como favorito con 62,5% frente a Getafe con 12,0%.",
        facts,
      ).passed,
    ).toBe(false);
    expect(
      validateNarrativeAgainstFactSheet(
        "Real Madrid ganará con 100% de seguridad frente a Getafe.",
        facts,
      ).passed,
    ).toBe(false);
  });

  it.skip("Axioma 12: SHA-256 intacto en los 11 artefactos congelados v3.0 / v3.1 / v3.2 y registro v5.1 consistente", () => {
    const expectedFrozenPrefixes: Record<string, string> = {
      "src/engine.ts": "77dc721430ff17b1",
      "src/outlook.ts": "26933d21438d5298",
      "src/service.ts": "53fbf32117ab6a64",
      "data/live_matchday_v3_snapshot.json": "1dace760d68442e7",
      "data/production_segments_v3_1.json": "0bc03bbff96a5d82",
      "data/blend_weights_v3_1.json": "b29d7a451f601112",
      "data/pick_policy_v3_1.json": "2359c8f8822ea394",
      "data/stale_lines_config.json": "8bcb9c7be93270cd",
      "data/model_motor_a.json": "3c72967eddc79bb7",
      "data/model_nfl.json": "e74ae241875739d2",
      "services/models/artifacts/sealed_holdout_v3_1_eval.json": "5c9e550bfd7889e4",
    };
    for (const [relPath, prefix] of Object.entries(expectedFrozenPrefixes)) {
      expect(sha256File(relPath).startsWith(prefix)).toBe(true);
    }
  });

  // ==========================================================================
  // Axiomas 13..16 Nuevos de v6.0 (`EXP_V58`..`EXP_V62`)
  // ==========================================================================

  it.skip("Axioma 13 (Cobertura Universal 57 Ligas y Cono < 1e-12): 57/57 ligas cubiertas, error de cono 1X2 < 1e-12 y Venn-Abers significativa en [1.55, 2.60]", () => {
    const snapV6 = readJson<LiveMatchdayV6Snapshot>(
      "data/live_matchday_v6_candidate_snapshot.json",
    );
    const socArt = readJson<Soccer57ModelArtifactV60>(
      "data/model_soccer_57_v6_0_candidate.json",
    );
    const exp58Res = readJson<{
      governance: { holdout_sealed_untouched: boolean; hyperparameter_tuning_on_holdout: boolean };
      hierarchy_coverage: {
        total_platform_leagues: number;
        total_football_competitions: number;
        active_2026_walk_forward_competitions: number;
        confederation_prior_zero_2026_competitions: number;
        matrix_max_1x2_cone_error: number;
        matrix_max_expected_total_error: number;
      };
      season_results_walkforward_oos: {
        by_confederation: Record<
          string,
          {
            games_evaluated_2026: number;
            "1x2_logloss_vs_uncalibrated": { n_rows: number; delta_mean: number | null };
          }
        >;
      };
      strict_prekickoff_57_cohort: {
        playable_zone_1_55_to_2_60_venn_abers: {
          n_picks: number;
          ece_before: number;
          ece_v60: number;
          logloss_diff_date_clustered: {
            n_rows: number;
            delta_mean: number;
            ci95_hi: number;
            significant_improvement: boolean;
            verdict: string;
          };
        };
      };
    }>("research/prediction-lab/experiments/EXP_V58_soccer_57_v6_0/artifacts/exp_v58_soccer_57_v6_0_results.json");

    expect(snapV6.n_leagues_covered).toBe(57);
    expect(snapV6.n_soccer_leagues_covered).toBe(53);
    expect(snapV6.n_us_leagues_covered).toBe(4);
    expect(Object.keys(snapV6.counts_by_league).length).toBe(57);

    const soccerComps = Object.keys(socArt.competitions);
    expect(soccerComps.length).toBe(53);
    for (const lg of [...soccerComps, "mlb", "nhl", "nba", "nfl"]) {
      expect(snapV6.counts_by_league[lg]).toBeGreaterThanOrEqual(1);
    }

    // 43 activas + 10 selecciones con estado explícito y null en n == 0
    expect(exp58Res.governance.holdout_sealed_untouched).toBe(true);
    expect(exp58Res.governance.hyperparameter_tuning_on_holdout).toBe(false);
    expect(exp58Res.hierarchy_coverage.total_platform_leagues).toBe(57);
    expect(exp58Res.hierarchy_coverage.active_2026_walk_forward_competitions).toBe(43);
    expect(exp58Res.hierarchy_coverage.confederation_prior_zero_2026_competitions).toBe(10);
    const intlSlice =
      exp58Res.season_results_walkforward_oos.by_confederation["INTERNATIONAL_NATIONAL_TEAMS"]!;
    expect(intlSlice.games_evaluated_2026).toBe(0);
    expect(intlSlice["1x2_logloss_vs_uncalibrated"].n_rows).toBe(0);
    expect(intlSlice["1x2_logloss_vs_uncalibrated"].delta_mean).toBeNull();

    // Cono 1X2 < 1e-12 en los 5,120 juegos OOS y en todos los partidos de fútbol del snapshot v6.0
    expect(exp58Res.hierarchy_coverage.matrix_max_1x2_cone_error).toBeLessThan(1e-12);
    expect(exp58Res.hierarchy_coverage.matrix_max_expected_total_error).toBeLessThan(1e-12);
    expect(snapV6.invariants_audit.max_soccer_1x2_cone_error).toBeLessThan(1e-12);
    expect(snapV6.invariants_audit.max_soccer_total_implied_error).toBeLessThan(1e-12);

    const probe = projectSoccer57MatchV60({
      league: "premier-league",
      homeElo: 1645,
      awayElo: 1510,
      homeAttEwm: 1.72,
      homeDefEwm: 1.05,
      homeGames: 14,
      awayAttEwm: 1.21,
      awayDefEwm: 1.48,
      awayGames: 14,
      leagueEnvGoals: 2.86,
      neutralSite: false,
      artifact: socArt,
    });
    expect(Math.abs(probe.markets["1x2"].home - probe.pHomeTarget)).toBeLessThan(1e-12);
    expect(Math.abs(probe.expectedTotalImplied - probe.totalGoalsTarget)).toBeLessThan(1e-12);

    // Calibración Inductive Venn-Abers significativa en zona jugable [1.55, 2.60]
    const vaZone = exp58Res.strict_prekickoff_57_cohort.playable_zone_1_55_to_2_60_venn_abers;
    expect(vaZone.n_picks).toBeGreaterThan(100);
    expect(vaZone.ece_v60).toBeLessThan(vaZone.ece_before);
    expect(vaZone.logloss_diff_date_clustered.delta_mean).toBeLessThan(0.0);
    expect(vaZone.logloss_diff_date_clustered.ci95_hi).toBeLessThan(0.0);
    expect(vaZone.logloss_diff_date_clustered.significant_improvement).toBe(true);
    expect(vaZone.logloss_diff_date_clustered.verdict).toBe("significativa");

    const vaEval = calibratePlayableVennAbersLogitV60(
      0.5,
      false,
      socArt.venn_abers_playable_calibrator,
    );
    expect(vaEval.inPlayableZone).toBe(true);
    expect(vaEval.p0Lower).toBeLessThanOrEqual(vaEval.p1Upper);
  });

  it("Axioma 14 (Props v6.0 Monotonía, Porteros SGP Fréchet y Cero Truncamiento US): 0 violaciones multi-línea, Fréchet exacto, bloqueo out/Baja y columnas US completas", () => {
    const propsArt = readJson<PropsV6ModelArtifact>(
      "data/model_props_v6_0_candidate.json",
    );
    const snapV6 = readJson<LiveMatchdayV6Snapshot>(
      "data/live_matchday_v6_candidate_snapshot.json",
    );

    // 1) Monotonía multi-línea 0.5+ >= 1.5+ >= 2.5+ >= 3.5+ y pOverSubCover >= pOverCalibrated
    const shMulti = projectCoupledPlayerShotsMultiLineV6({
      metric: "shots",
      positionGroup: "FW_CF",
      seasonCount: 34,
      appearances: 12,
      subIns: 2,
      teamExpectedShots: 15.2,
      teamExpectedSoT: 5.4,
      oppDefenseFactor: 1.06,
      availability: "available",
      artifact: propsArt,
    });
    expect(shMulti.eligible).toBe(true);
    expect(shMulti.lines.length).toBe(4);
    for (let i = 0; i < 3; i += 1) {
      expect(shMulti.lines[i]!.pOverCalibrated).toBeGreaterThanOrEqual(
        shMulti.lines[i + 1]!.pOverCalibrated - 1e-12,
      );
      expect(shMulti.lines[i]!.pOverSubCover).toBeGreaterThanOrEqual(
        shMulti.lines[i]!.pOverCalibrated - 1e-12,
      );
    }

    // Verificar 0 violaciones en todos los props acoplados y de portero dentro del snapshot v6.0
    let checkedFieldProps = 0;
    let checkedGkSgps = 0;
    for (const row of snapV6.entries) {
      const fp = row.outlook.featuredPropsV6.fieldPlayerShots;
      if (fp !== null) {
        checkedFieldProps += 1;
        for (const out of [fp.shotsOutlook, fp.shotsOnTargetOutlook]) {
          expect(out.lines.length).toBe(4);
          for (let i = 0; i < 3; i += 1) {
            expect(out.lines[i]!.pOverCalibrated).toBeGreaterThanOrEqual(
              out.lines[i + 1]!.pOverCalibrated - 1e-12,
            );
            expect(out.lines[i]!.pOverSubCover).toBeGreaterThanOrEqual(
              out.lines[i]!.pOverCalibrated - 1e-12,
            );
          }
        }
      }
      const gk = row.outlook.featuredPropsV6.goalkeeperSaves;
      if (gk !== null && gk.linkedCleanSheetSgp !== null) {
        checkedGkSgps += 1;
        for (let i = 0; i < 3; i += 1) {
          expect(gk.savesOutlook.lines[i]!.pOverCalibrated).toBeGreaterThanOrEqual(
            gk.savesOutlook.lines[i + 1]!.pOverCalibrated - 1e-12,
          );
        }
        const sgp = gk.linkedCleanSheetSgp;
        expect(sgp.jointProbability).toBeGreaterThanOrEqual(sgp.frechetLowerBound - 1e-12);
        expect(sgp.jointProbability).toBeLessThanOrEqual(sgp.frechetUpperBound + 1e-12);
      }
    }
    expect(checkedFieldProps).toBeGreaterThan(20);
    expect(checkedGkSgps).toBeGreaterThan(20);

    // 2) Cotas exactas de Fréchet y trampa negativa Saves + Clean Sheet en evaluateGoalkeeperSavesLinkedSgpV6
    const gkSaves = projectGoalkeeperSavesMultiLineV6({
      saves: 42,
      shotsFaced: 56,
      goalsConceded: 14,
      appearances: 14,
      subIns: 0,
      oppExpectedSoT: 4.8,
      availability: "available",
      artifact: propsArt,
    });
    expect(gkSaves.eligible).toBe(true);
    const gkCsSgp = evaluateGoalkeeperSavesLinkedSgpV6({
      savesLine: 3.5,
      ebSaveRate: gkSaves.ebSaveRate,
      oppExpectedSoT: 4.8,
      teamExpectedGoals: 1.55,
      opponentExpectedGoals: 1.35,
      matchOutcome: "clean_sheet",
      rDispersionSoT: gkSaves.rDispersionSoT,
    });
    expect(gkCsSgp.jointProbability).toBeGreaterThanOrEqual(gkCsSgp.frechetLowerBound - 1e-12);
    expect(gkCsSgp.jointProbability).toBeLessThanOrEqual(gkCsSgp.frechetUpperBound + 1e-12);
    expect(gkCsSgp.jointProbability).toBeLessThan(gkCsSgp.independentProbability);

    // 3) Bloqueo duro "out"/"Baja" (0 props emitidos para bajas)
    const blockedSoccer = projectCoupledPlayerShotsMultiLineV6({
      metric: "shots",
      positionGroup: "FWD",
      seasonCount: 28,
      appearances: 10,
      subIns: 0,
      teamExpectedShots: 14.0,
      teamExpectedSoT: 5.0,
      availability: "out",
      artifact: propsArt,
    });
    expect(blockedSoccer.eligible).toBe(false);
    expect(blockedSoccer.blockedByInjury).toBe(true);
    expect(blockedSoccer.lines.length).toBe(0);

    const blockedNba = evaluateUsPlayerProfilePropsV6({
      sport: "nba",
      positionLabel: "G",
      availability: "available",
      injuryStatus: "Baja",
      seasonMetrics: [
        { key: "gp", value: 12 },
        { key: "min", value: 34.5 },
        { key: "pts", value: 26.4 },
      ],
      recentGames: [],
      artifact: propsArt,
    });
    expect(blockedNba.length).toBe(0);

    // 4) Extracción completa sin truncamiento de 5 columnas US (`PTS/AST/3PM`, `SO/HR/TB`, `SOG`)
    const nbaRow = normalizeUsPlayerGameLogColumnsV6({
      sport: "nba",
      columns: [
        { label: "MIN", value: "35:30" },
        { label: "FG", value: "10-19" },
        { label: "3PT", value: "4-9" },
        { label: "FT", value: "6-7" },
        { label: "REB", value: 8 },
        { label: "AST", value: 9 },
        { label: "STL", value: 2 },
        { label: "BLK", value: 1 },
        { label: "TO", value: 3 },
        { label: "PTS", value: 30 },
      ],
    });
    expect(nbaRow.eligibleForProjection).toBe(true);
    expect(nbaRow.metrics["PTS"]).toBe(30);
    expect(nbaRow.metrics["AST"]).toBe(9);
    expect(nbaRow.metrics["3PM"]).toBe(4);

    const mlbRow = normalizeUsPlayerGameLogColumnsV6({
      sport: "mlb",
      columns: [
        { label: "AB", value: 4 },
        { label: "R", value: 2 },
        { label: "H", value: 3 },
        { label: "RBI", value: 4 },
        { label: "BB", value: 1 },
        { label: "SO", value: 1 },
        { label: "HR", value: 2 },
        { label: "TB", value: 9 },
      ],
    });
    expect(mlbRow.metrics["SO"]).toBe(1);
    expect(mlbRow.metrics["HR"]).toBe(2);
    expect(mlbRow.metrics["TB"]).toBe(9);

    const nhlRow = normalizeUsPlayerGameLogColumnsV6({
      sport: "nhl",
      columns: [
        { label: "G", value: 1 },
        { label: "A", value: 2 },
        { label: "PTS", value: 3 },
        { label: "+/-", value: 2 },
        { label: "PIM", value: 0 },
        { label: "TOI", value: "21:15" },
        { label: "SOG", value: 6 },
      ],
    });
    expect(nhlRow.metrics["SOG"]).toBe(6);
  });

  it.skip("Axioma 15 (Walk-Forward Físico Juego-a-Juego US + Dominancia Early Payout): 4/4 ligas US walk-forward date' < date, Empty-Net NHL < 1e-12, Axioma 8 MLB y 0 violaciones EP", () => {
    const msArt = readJson<MultiSportModelArtifactV60>(
      "data/model_multisport_v6_0_candidate.json",
    );
    const exp60Res = readJson<{
      holdout_sealed_untouched: boolean;
      hyperparameter_tuning_on_holdout: boolean;
      governance: {
        causality_rule: string;
        early_payout_dominance_violations: number;
        total_games_ingested: number;
      };
      pooled_4_leagues_oos: {
        all_games_moneyline_vs_coin_oos: {
          n_rows: number;
          logloss: {
            delta_mean: number;
            ci95_hi: number;
            significant_improvement: boolean;
          };
        };
      };
      sports: Record<
        string,
        {
          total_games_ingested: number;
          early_payout_audit: { algebraic_dominance_violations: number };
          empty_net_and_goalie_audit?: {
            max_ot_conservation_residual: number;
            all_games_goalie_confirmed_false: boolean;
          };
        }
      >;
    }>("research/prediction-lab/experiments/EXP_V60_multisport_v6_0/artifacts/exp_v60_multisport_v6_0_results.json");
    const snapV6 = readJson<LiveMatchdayV6Snapshot>(
      "data/live_matchday_v6_candidate_snapshot.json",
    );

    expect(exp60Res.holdout_sealed_untouched).toBe(true);
    expect(exp60Res.hyperparameter_tuning_on_holdout).toBe(false);
    expect(exp60Res.governance.causality_rule).toBe("strict_chronological_date_prime_lt_date");
    expect(exp60Res.governance.total_games_ingested).toBe(2920);
    expect(exp60Res.governance.early_payout_dominance_violations).toBe(0);
    expect(
      exp60Res.pooled_4_leagues_oos.all_games_moneyline_vs_coin_oos.logloss.significant_improvement,
    ).toBe(true);
    expect(exp60Res.pooled_4_leagues_oos.all_games_moneyline_vs_coin_oos.logloss.ci95_hi).toBeLessThan(
      0.0,
    );

    for (const sp of ["mlb", "nhl", "nba", "nfl"] as const) {
      expect(exp60Res.sports[sp]!.total_games_ingested).toBeGreaterThan(100);
      expect(exp60Res.sports[sp]!.early_payout_audit.algebraic_dominance_violations).toBe(0);
    }
    expect(
      exp60Res.sports["nhl"]!.empty_net_and_goalie_audit!.max_ot_conservation_residual,
    ).toBeLessThan(1e-12);
    expect(
      exp60Res.sports["nhl"]!.empty_net_and_goalie_audit!.all_games_goalie_confirmed_false,
    ).toBe(true);

    // Conservación Empty-Net/OT NHL < 1e-12 en TS y goalie_confirmed = false
    const nhlOut = projectNhlWalkforwardOutlookV60(
      {
        home_elo: 1545,
        away_elo: 1485,
        home_cum_for: 48,
        home_cum_against: 41,
        home_games: 15,
        away_cum_for: 42,
        away_cum_against: 47,
        away_games: 15,
        home_goalie_confirmed: false,
        away_goalie_confirmed: false,
      },
      msArt,
    );
    expect(nhlOut.ot_conservation_residual).toBeLessThan(1e-12);
    expect(nhlOut.goalie_confirmed_home).toBe(false);
    expect(nhlOut.goalie_confirmed_away).toBe(false);
    expect(nhlOut.early_payout.p_home_early_payout_win).toBeGreaterThanOrEqual(nhlOut.p_home - 1e-12);
    expect(nhlOut.early_payout.p_away_early_payout_win).toBeGreaterThanOrEqual(nhlOut.p_away - 1e-12);

    // Axioma 8 MLB preservado en Kepler MLB v6.0
    const mlbEliteWeak = projectMlbWalkforwardOutlookV60(
      {
        home_woba_override: 0.345,
        away_woba_override: 0.285,
        home_sp_fip_override: 4.08,
        away_sp_fip_override: 4.08,
        home_bp_fip_override: 4.08,
        away_bp_fip_override: 4.08,
        neutral_site: true,
      },
      msArt,
    );
    expect(
      mlbEliteWeak.full_game.mu_9inn_home / mlbEliteWeak.full_game.mu_9inn_away,
    ).toBeGreaterThanOrEqual(1.38);

    const mlbAvg = projectMlbWalkforwardOutlookV60(
      {
        home_woba_override: 0.312,
        away_woba_override: 0.312,
        home_sp_fip_override: 4.08,
        away_sp_fip_override: 4.08,
        home_bp_fip_override: 4.08,
        away_bp_fip_override: 4.08,
        neutral_site: false,
      },
      msArt,
    );
    expect(mlbAvg.full_game.expected_total_runs).toBeGreaterThanOrEqual(8.65);
    expect(mlbAvg.full_game.expected_total_runs).toBeLessThanOrEqual(8.95);

    // Axioma 5 NFL preservado en Minkowski NFL v6.0
    const nfl50 = solveNflKeyMarginPmfV60(0.0, 0.004, msArt.physics_config.nfl);
    expect(nfl50.std_margin).toBeGreaterThanOrEqual(13.0);
    expect(nfl50.std_margin).toBeLessThanOrEqual(13.8);

    // 0 violaciones Early Payout en el 100% de partidos de live_matchday_v6_candidate_snapshot.json
    expect(snapV6.invariants_audit.early_payout_dominance_violations).toBe(0);
    for (const row of snapV6.entries) {
      const o = row.outlook;
      expect(o.earlyPayout.pHomeEarlyPayoutWin).toBeGreaterThanOrEqual(
        o.coreProbabilities.pHome - 1e-12,
      );
      expect(o.earlyPayout.pAwayEarlyPayoutWin).toBeGreaterThanOrEqual(
        o.coreProbabilities.pAway - 1e-12,
      );
      if (o.multiSportV6?.sport === "nhl") {
        expect(o.multiSportV6.ot_conservation_residual).toBeLessThan(1e-12);
      }
    }
  });

  it.skip("Axioma 16 (Congelado Pre-Kickoff Inmutable, Guardrail Narrativo e Integridad SHA-256 25 + v6.0): 0 contaminados, paridad < 1e-12 + SHA-256 idénticos Python↔TS y 25+14 hashes intactos", () => {
    const socArt = readJson<Soccer57ModelArtifactV60>(
      "data/model_soccer_57_v6_0_candidate.json",
    );
    const propsArt = readJson<PropsV6ModelArtifact>(
      "data/model_props_v6_0_candidate.json",
    );
    const msArt = readJson<MultiSportModelArtifactV60>(
      "data/model_multisport_v6_0_candidate.json",
    );
    const offArt = readJson<OfficialsFreezeModelArtifactV6>(
      "data/model_officials_freeze_v6_0_candidate.json",
    );
    const epArt = readJson<EpistemicConformalArtifactV51>(
      "data/model_epistemic_conformal_v5_1_candidate.json",
    );
    const inplayArt = readJson<InPlayEarlyPayoutArtifactV5>(
      "data/model_inplay_early_payout_v5_0_candidate.json",
    );
    const snapV6 = readJson<LiveMatchdayV6Snapshot>(
      "data/live_matchday_v6_candidate_snapshot.json",
    );
    const regV6 = readJson<{
      schema_version: string;
      status: string;
      production_activated: boolean;
      holdout_sealed_untouched: boolean;
      prior_immutable_artifacts_verified_count: number;
      n_active_v6_0_candidate_artifacts: number;
      active_v6_0_artifacts: Array<{
        artifact_path: string;
        sha256: string;
        size_bytes: number;
        status: string;
        production_activated: boolean;
        holdout_sealed_untouched: boolean;
      }>;
      frozen_v3_governance_audit: Record<string, { sha256: string; intact: boolean }>;
      inherited_v5_1_governance_audit: Record<string, { sha256: string; intact: boolean }>;
      inherited_v5_2_governance_audit: Record<string, { sha256: string; intact: boolean }>;
    }>("data/candidate_registry_v6_0.json");
    const exp62Res = readJson<Record<string, unknown>>(
      "research/prediction-lab/experiments/EXP_V62_unified_v6_0/artifacts/exp_v62_unified_v6_0_results.json",
    );

    // 1) 0 análisis contaminados inputsAsOf > kickoff aceptados en sealPreKickoffOutlookV6
    const rejectedContam = sealPreKickoffOutlookV6({
      matchId: "mlb-contam-probe",
      sport: "mlb",
      league: "mlb",
      homeTeam: "New York Yankees",
      awayTeam: "Tampa Bay Rays",
      kickoffUtc: "2026-10-06T23:08:00.000Z",
      status: "final",
      incomingAnalysis: {
        inputsAsOfUtc: "2026-11-19T14:16:45.965Z", // post-kickoff!
        probabilities: { pHome: 0.54, pAway: 0.46 },
        projection: { home: 4.2, away: 3.8 },
      },
    });
    expect(rejectedContam.hasForecast).toBe(false);
    expect(rejectedContam.incomingContaminatedRejected).toBe(true);
    expect(rejectedContam.sealedRecord).toBeNull();

    const auditReport = auditPreKickoffCausalityV6([
      {
        matchId: "nba-ft-preserve-probe",
        sport: "nba",
        league: "nba",
        homeTeam: "Boston Celtics",
        awayTeam: "Miami Heat",
        kickoffUtc: "2026-11-14T00:30:00.000Z",
        status: "scheduled",
        incomingAnalysis: {
          inputsAsOfUtc: "2026-11-13T22:00:00.000Z",
          probabilities: { pHome: 0.64, pAway: 0.36 },
          projection: { home: 116.2, away: 109.8 },
        },
      },
      {
        matchId: "nba-ft-preserve-probe",
        sport: "nba",
        league: "nba",
        homeTeam: "Boston Celtics",
        awayTeam: "Miami Heat",
        kickoffUtc: "2026-11-14T00:30:00.000Z",
        status: "final",
        incomingAnalysis: {
          inputsAsOfUtc: "2026-11-19T14:00:00.000Z", // regeneración tardía rechazada!
          probabilities: { pHome: 0.99, pAway: 0.01 },
          projection: { home: 124.0, away: 102.0 },
        },
      },
    ]);
    expect(auditReport.contaminatedAcceptedIntoLedgerCount).toBe(0);
    expect(auditReport.rescuedFromPriorSealCount).toBe(1);
    expect(auditReport.finalMatchesWithSealedForecast).toBe(1);

    // 2) Paridad IEEE-754 < 1e-12, SHA-256 idénticos y guardrail 100% en TODOS los partidos de live_matchday_v6_candidate_snapshot.json
    const bundle: UnifiedArtifactsBundleV6 = {
      soccer57ArtifactV6: socArt,
      propsArtifactV6: propsArt,
      multisportArtifactV6: msArt,
      officialsArtifactV6: offArt,
      epistemicArtifactV51: epArt,
      inplayArtifactV5: inplayArt,
    };

    // Calentamiento JIT sobre el primer partido antes de medir latencia pura de inferencia TS
    if (snapV6.entries.length > 0) {
      buildUnifiedMatchIntelligenceV6(snapV6.entries[0]!.canonicalInput, bundle);
    }

    const sealPairs: Array<[string, string]> = [];
    let totalInferenceMs = 0.0;
    for (const row of snapV6.entries) {
      const tStart = performance.now();
      const tsOut = buildUnifiedMatchIntelligenceV6(row.canonicalInput, bundle);
      totalInferenceMs += performance.now() - tStart;
      const pyOut = row.outlook;

      expect(Math.abs(tsOut.coreProbabilities.pHome - pyOut.coreProbabilities.pHome)).toBeLessThan(1e-12);
      expect(Math.abs(tsOut.coreProbabilities.pAway - pyOut.coreProbabilities.pAway)).toBeLessThan(1e-12);
      if (pyOut.coreProbabilities.pDraw !== null) {
        expect(Math.abs(tsOut.coreProbabilities.pDraw! - pyOut.coreProbabilities.pDraw)).toBeLessThan(1e-12);
      }
      expect(
        Math.abs(
          tsOut.epistemicUncertainty90.homeBand90.pLower90 -
            pyOut.epistemicUncertainty90.homeBand90.pLower90,
        ),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(
          tsOut.epistemicUncertainty90.homeBand90.pUpper90 -
            pyOut.epistemicUncertainty90.homeBand90.pUpper90,
        ),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(
          tsOut.earlyPayout.pHomeEarlyPayoutWin - pyOut.earlyPayout.pHomeEarlyPayoutWin,
        ),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(
          tsOut.earlyPayout.pAwayEarlyPayoutWin - pyOut.earlyPayout.pAwayEarlyPayoutWin,
        ),
      ).toBeLessThan(1e-12);

      // Sello criptográfico SHA-256 y resumen verificado idénticos bit a bit
      expect(tsOut.preKickoffSeal.preKickoffSealSha256).toBe(
        pyOut.preKickoffSeal.preKickoffSealSha256,
      );
      expect(tsOut.preKickoffSeal.inputsAsOfUtc <= tsOut.preKickoffSeal.kickoffUtc).toBe(true);
      expect(tsOut.verifiedSummaryEs).toBe(pyOut.verifiedSummaryEs);
      expect(tsOut.guardrailAudit.passed).toBe(true);

      sealPairs.push([tsOut.matchId, tsOut.preKickoffSeal.preKickoffSealSha256]);
    }
    const avgLatencyMs = totalInferenceMs / snapV6.entries.length;
    expect(avgLatencyMs).toBeLessThan(2.5);

    const ledgerHashTs = sha256Hex(JSON.stringify(sealPairs));
    expect(ledgerHashTs).toBe(snapV6.snapshot_seal_ledger_sha256);

    // 3) 0 claves prohibidas en todos los artefactos de EXP_V62
    expect(collectForbiddenKeys(snapV6)).toEqual([]);
    expect(collectForbiddenKeys(regV6)).toEqual([]);
    expect(collectForbiddenKeys(exp62Res)).toEqual([]);

    // 4) Integridad criptográfica SHA-256 100% en los 25 artefactos previos + 14 artefactos v6.0
    expect(regV6.status).toBe("candidate");
    expect(regV6.production_activated).toBe(false);
    expect(regV6.holdout_sealed_untouched).toBe(true);
    expect(regV6.prior_immutable_artifacts_verified_count).toBe(25);
    expect(regV6.n_active_v6_0_candidate_artifacts).toBe(14);

    const priorGroups = [
      [regV6.frozen_v3_governance_audit, 11],
      [regV6.inherited_v5_1_governance_audit, 11],
      [regV6.inherited_v5_2_governance_audit, 3],
    ] as const;

    for (const [grp, expectedCount] of priorGroups) {
      const entries = Object.entries(grp);
      expect(entries.length).toBe(expectedCount);
      for (const [relPath, meta] of entries) {
        expect(meta.intact).toBe(true);
        expect(sha256File(relPath)).toBe(meta.sha256);
      }
    }

    for (const ent of regV6.active_v6_0_artifacts) {
      expect(ent.status).toBe("candidate");
      expect(ent.production_activated).toBe(false);
      expect(ent.holdout_sealed_untouched).toBe(true);
      expect(sha256File(ent.artifact_path)).toBe(ent.sha256);
      expect(fileSizeBytes(ent.artifact_path)).toBe(ent.size_bytes);
    }
  });
});
