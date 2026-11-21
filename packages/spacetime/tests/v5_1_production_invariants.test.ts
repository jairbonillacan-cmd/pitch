import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildSoccerMicroMatchOutlookV5,
  buildVerifiedMatchFactSheet,
  computeConformalEpistemicBandV5,
  evaluatePlayerLinkedSgpV5,
  evaluateSoccerEarlyPayoutAndInPlay,
  evaluateStudentTSameGameParlayV5,
  projectMlbV36Outlook,
  projectNflDiscreteKeyTotalPmfV5,
  projectNflMarketSpreadPosteriorV5,
  projectNflOvertimeProbabilityV5,
  projectSoccerPlayerPropOutlookV5,
  solveDiagonalInflatedScoreMatrix4Param,
  solveNflDiscreteKeyTotalPmfExactV5,
  solveNflKeyNumberMarginPmfExact,
  studentTQuantileExact,
  summarizeSoccerMarketsFromMatrixV4,
  validateMatchMathematicalInvariants,
  validateNarrativeAgainstFactSheet,
  type EpistemicConformalArtifactV51,
  type HierarchicalPropsModelArtifactV5,
  type InPlayEarlyPayoutArtifactV5,
  type MicroFeatureVectorInputV4,
  type MultiSportV36ConfigArtifact,
  type NflModelArtifactV5,
  type SgpCopulaArtifactV5,
  type SgpLegInput,
  type SoccerMicroMetricKey,
  type SoccerMicroModelArtifactV5,
  type SoccerPlayerPropInputV4,
} from "../src/v5_index";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");

function readJson<T>(relPath: string): T {
  const parsed: T = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, relPath), "utf8"));
  return parsed;
}

function sha256File(relPath: string): { raw: string; lf: string; crlf: string } {
  const bytes = readFileSync(resolve(PACKAGE_ROOT, relPath));
  const raw = createHash("sha256").update(bytes).digest("hex");
  const normalizedLf = bytes.toString("utf8").replace(/\r\n/g, "\n");
  const lf = createHash("sha256").update(normalizedLf, "utf8").digest("hex");
  const crlf = createHash("sha256").update(normalizedLf.replace(/\n/g, "\r\n"), "utf8").digest("hex");
  return { raw, lf, crlf };
}

function resolveRegistryLocalDataPath(artifactPath: string): string {
  return artifactPath.replace(/^src\/data\/prediction\//, "data/");
}

describe("PitchLab v5.1 · Invariantes Locales de Producción (10/12 Axiomas Red-Team + SHA-256)", () => {
  it("Axioma 1: 0/84 violaciones de dominancia Early-Payout en snapshot vivo y ancla TS", () => {
    const snap = readJson<{
      readonly outlooks: ReadonlyArray<{
        readonly matchId: string;
        readonly sport: string;
        readonly coreProbabilities: {
          readonly pHome: number;
          readonly pDraw: number | null;
          readonly pAway: number;
        };
        readonly earlyPayout2Goals?: {
          readonly pHomeEarlyPayoutWin: number;
          readonly pAwayEarlyPayoutWin: number;
        };
        readonly epistemicUncertainty90: {
          readonly home: { readonly pPoint: number; readonly pLower90: number; readonly pUpper90: number };
          readonly away: { readonly pPoint: number; readonly pLower90: number; readonly pUpper90: number };
        };
      }>;
    }>("data/live_matchday_v5_candidate_snapshot.json");

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

    const inplayArt = readJson<InPlayEarlyPayoutArtifactV5>(
      "data/model_inplay_early_payout_v5_0_candidate.json",
    );
    const anchored = evaluateSoccerEarlyPayoutAndInPlay({
      pregameMuHome: 1.55,
      pregameMuAway: 1.15,
      corePHome: 0.56,
      corePDraw: 0.24,
      corePAway: 0.2,
      artifact: inplayArt,
    });
    expect(anchored.earlyPayout2Goals.pHomeEarlyPayoutWin).toBeGreaterThan(0.56);
    expect(anchored.earlyPayout2Goals.pAwayEarlyPayoutWin).toBeGreaterThan(0.2);
  });

  it("Axioma 3: 0 árboles HGB serializados cuando w_hgb == 0.0 y micro JSON < 150 KB", () => {
    const microPath = resolve(PACKAGE_ROOT, "data/model_soccer_micro_v5_0_candidate.json");
    const sizeKb = statSync(microPath).size / 1024.0;
    expect(sizeKb).toBeLessThan(150.0);

    const micro = readJson<SoccerMicroModelArtifactV5>(
      "data/model_soccer_micro_v5_0_candidate.json",
    );
    const keys: readonly SoccerMicroMetricKey[] = [
      "corners",
      "yellow_cards",
      "fouls",
      "shots_on_target",
      "shots",
    ];
    for (const q of keys) {
      const sp = micro.metrics[q];
      if (sp.w_hgb_home === 0.0) {
        expect(sp.home_hgb).toBeNull();
      }
      if (sp.w_hgb_away === 0.0) {
        expect(sp.away_hgb).toBeNull();
      }
    }
  });

  it("Axioma 5: NFL Std(M|50/50) en [13.0, 13.8], projectNflMarketSpreadPosteriorV5 y paridad de totales/OT", () => {
    const nflArt = readJson<NflModelArtifactV5>("data/model_nfl_v5_0_candidate.json");
    expect(nflArt.margin_quad_concentration).toBeGreaterThan(0);
    expect(nflArt.spread_market_posterior_w_model).toBeCloseTo(0.16, 6);

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
    let sumPmf = 0.0;
    let varM = 0.0;
    for (let i = 0; i < sol50.pmf.length; i += 1) {
      const p = sol50.pmf[i]!;
      const m = i - sol50.maxAbsMargin;
      sumPmf += p;
      varM += p * (m - sol50.expectedMargin) ** 2;
    }
    const std50 = Math.sqrt(varM);
    expect(Math.abs(sumPmf - 1.0)).toBeLessThan(1e-12);
    expect(std50).toBeGreaterThanOrEqual(13.0);
    expect(std50).toBeLessThanOrEqual(13.8);

    const postAts = projectNflMarketSpreadPosteriorV5({
      modelExpectedMargin: 5.2,
      marketSpreadHome: -3.0,
      artifact: nflArt,
    });
    expect(postAts.pHomeCoverNoPush).toBeGreaterThan(0.45);
    expect(postAts.pHomeCoverNoPush).toBeLessThan(0.6);
    expect(Math.abs(postAts.pHomeCover + postAts.pAwayCover + postAts.pPush - 1.0)).toBeLessThan(
      1e-12,
    );

    const nflSnap = readJson<{
      readonly game_rows: ReadonlyArray<{
        readonly p_home: number;
        readonly p_tie: number;
        readonly p_away: number;
        readonly t_model: number;
        readonly market_total_line: number;
        readonly is_indoor: boolean;
        readonly is_turf: boolean;
        readonly expected: {
          readonly expected_margin: number;
          readonly tot_implied: number;
          readonly p_mkt_post_over_no_push: number;
          readonly p_overtime: number;
        };
      }>;
    }>("data/nfl_v5_0_snapshot.json");

    expect(nflSnap.game_rows.length).toBeGreaterThan(0);
    for (const gr of nflSnap.game_rows) {
      const solM = solveNflKeyNumberMarginPmfExact({
        pHome: gr.p_home,
        pTie: gr.p_tie,
        pAway: gr.p_away,
        artifact: {
          ...nflArt,
          totals_calibration: {
            sigma_game_physical: 13.4,
            market_posterior_w_model: nflArt.discrete_totals_v5.market_posterior_w_model,
            sigma_market_posterior: 13.4,
          },
        },
      });
      const solT = solveNflDiscreteKeyTotalPmfExactV5({
        expectedTotal: gr.t_model,
        artifact: nflArt,
      });
      const totOut = projectNflDiscreteKeyTotalPmfV5({
        modelExpectedTotal: gr.t_model,
        artifact: nflArt,
        objectiveLines: [41.0, 44.5],
        marketTotalLine: gr.market_total_line,
      });
      const otOut = projectNflOvertimeProbabilityV5({
        expectedMargin: solM.expectedMargin,
        expectedTotal: solT.expectedTotalImplied,
        isIndoor: gr.is_indoor,
        isTurf: gr.is_turf,
        artifact: nflArt,
      });
      expect(Math.abs(solM.expectedMargin - gr.expected.expected_margin)).toBeLessThan(1e-11);
      expect(Math.abs(solT.expectedTotalImplied - gr.expected.tot_implied)).toBeLessThan(1e-11);
      expect(
        Math.abs(totOut.marketPosteriorProjection!.pOverNoPush - gr.expected.p_mkt_post_over_no_push),
      ).toBeLessThan(1e-12);
      expect(Math.abs(otOut.pOvertime - gr.expected.p_overtime)).toBeLessThan(1e-12);
    }
  });

  it("Axioma 6: Matriz 4-Param sin doble inflación (rho_draw_blend_weight === 0) y error de cono 1X2 < 1e-12", () => {
    const clubGoals = readJson<{
      readonly default_rho: number;
      readonly dispersion_r: number;
      readonly rho_draw_blend_weight: number;
    }>("data/model_club_goals_v5_0_candidate.json");
    const intlGoals = readJson<{
      readonly default_rho: number;
      readonly dispersion_r: number;
      readonly rho_draw_blend_weight: number;
    }>("data/model_intl_goals_v5_0_candidate.json");

    expect(clubGoals.rho_draw_blend_weight).toBe(0.0);
    expect(clubGoals.default_rho).toBeCloseTo(-0.105, 6);
    expect(clubGoals.dispersion_r).toBeCloseTo(500.0, 6);

    expect(intlGoals.rho_draw_blend_weight).toBe(0.0);
    expect(intlGoals.default_rho).toBeCloseTo(-0.1, 6);
    expect(intlGoals.dispersion_r).toBeCloseTo(24.0, 6);

    const soccerSnap = readJson<{
      readonly rows: ReadonlyArray<{
        readonly python_ensemble_probs: readonly [number, number, number];
        readonly python_t_hat: number;
        readonly python_p_over_2_5: number;
        readonly python_p_btts_yes: number;
      }>;
    }>("data/soccer_v5_0_global_snapshot.json");

    expect(soccerSnap.rows.length).toBe(80);
    let maxConeError = 0.0;
    for (const row of soccerSnap.rows) {
      const [pH, pD, pA] = row.python_ensemble_probs;
      const sol4 = solveDiagonalInflatedScoreMatrix4Param({
        pHome: pH,
        pDraw: pD,
        pAway: pA,
        totalGoalsTarget: row.python_t_hat,
        rhoPrior: clubGoals.default_rho,
        dispersionR: clubGoals.dispersion_r,
        rhoDrawBlendWeight: clubGoals.rho_draw_blend_weight,
      });
      const mk = summarizeSoccerMarketsFromMatrixV4(sol4.matrix);
      const coneErr = Math.max(
        Math.abs(mk.pHome - pH),
        Math.abs(mk.pDraw - pD),
        Math.abs(mk.pAway - pA),
      );
      if (coneErr > maxConeError) maxConeError = coneErr;
      expect(Math.abs(mk.pOver25 - row.python_p_over_2_5)).toBeLessThan(1e-12);
      expect(Math.abs(mk.pBttsYes - row.python_p_btts_yes)).toBeLessThan(1e-12);
    }
    expect(maxConeError).toBeLessThan(1e-12);
  });

  it("Axioma 7: Knockout 90' limpio de penales (first_leg < 1.0, max_goals_val <= 10) y paridad props v5.1", () => {
    const art = readJson<
      HierarchicalPropsModelArtifactV5 & {
        readonly knockout_stage_config: {
          readonly first_leg_multiplier: number;
          readonly second_leg_multiplier: number;
          readonly single_final_multiplier: number;
          readonly max_goals_val: number;
          readonly shootouts_purged: number;
        };
      }
    >("data/model_hierarchical_props_v5_0_candidate.json");

    expect(art.knockout_stage_config.first_leg_multiplier).toBeLessThan(1.0);
    expect(art.knockout_stage_config.second_leg_multiplier).toBeGreaterThan(1.0);
    expect(art.knockout_stage_config.single_final_multiplier).toBeGreaterThan(1.0);
    expect(art.knockout_stage_config.max_goals_val).toBeLessThanOrEqual(10.0);
    expect(art.knockout_stage_config.shootouts_purged).toBeGreaterThan(0);

    const baseProp: SoccerPlayerPropInputV4 = {
      propFamily: "goals",
      posCluster: "FW_CF",
      weightedSumY: 8.0,
      weightedExposure90: 12.0,
      lineupStatus: "confirmed_starter",
      line: 0.5,
    };
    const firstLeg = projectSoccerPlayerPropOutlookV5(
      { ...baseProp, knockoutLegType: "first_leg" },
      art,
    );
    const regular = projectSoccerPlayerPropOutlookV5(
      { ...baseProp, knockoutLegType: "none" },
      art,
    );
    const singleFinal = projectSoccerPlayerPropOutlookV5(
      { ...baseProp, knockoutLegType: "single_final" },
      art,
    );
    const secondLeg = projectSoccerPlayerPropOutlookV5(
      { ...baseProp, knockoutLegType: "second_leg" },
      art,
    );
    expect(firstLeg.pOverRaw).toBeLessThan(regular.pOverRaw);
    expect(regular.pOverRaw).toBeLessThan(singleFinal.pOverRaw);
    expect(singleFinal.pOverRaw).toBeLessThan(secondLeg.pOverRaw);
    expect(firstLeg.pOverCalibrated).toBeLessThan(secondLeg.pOverCalibrated);

    const propsSnap = readJson<{
      readonly rows: ReadonlyArray<{
        readonly input: SoccerPlayerPropInputV4;
        readonly expected: {
          readonly p_over_calibrated: number;
          readonly p_over_sub_cover: number;
        };
      }>;
    }>("data/hierarchical_props_v5_0_snapshot.json");
    expect(propsSnap.rows.length).toBe(72);
    for (const r of propsSnap.rows) {
      const out = projectSoccerPlayerPropOutlookV5(r.input, art);
      expect(Math.abs(out.pOverCalibrated - r.expected.p_over_calibrated)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverSubCover - r.expected.p_over_sub_cover)).toBeLessThan(1e-12);
    }
  });

  it("Axioma 8: Física MLB remediada (ratio ofensivo .345 vs .285 >= 1.38x y total en [8.65, 8.95])", () => {
    const msState = readJson<{ readonly v36_physics_config: MultiSportV36ConfigArtifact }>(
      "data/multisport_v4_0_state_candidate.json",
    );
    const cfg = msState.v36_physics_config;
    expect(cfg.mlb.woba_zero_floor).toBeCloseTo(0.195, 6);
    expect(cfg.mlb.unearned_runs_mult).toBeCloseTo(1.032, 6);

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

  it("Axioma 9: studentTQuantileExact < 1e-6, artefacto SGP residualizado y Raikov+DC en cotas Fréchet", () => {
    expect(Math.abs(studentTQuantileExact(0.99, 5.0) - 3.364929998907275)).toBeLessThan(1e-6);
    expect(Math.abs(studentTQuantileExact(0.975, 10.0) - 2.2281388519649385)).toBeLessThan(1e-6);
    expect(
      Math.abs(studentTQuantileExact(0.15, 5.0) + studentTQuantileExact(0.85, 5.0)),
    ).toBeLessThan(1e-12);

    const sgpArt = readJson<SgpCopulaArtifactV5 & { readonly default_player_linked_dc_rho: number }>(
      "data/sgp_copula_v5_0_candidate.json",
    );
    expect(sgpArt.qmc_smooth_bandwidth).toBeLessThanOrEqual(0.015);
    expect(sgpArt.sports.soccer.residualized).toBe(true);
    expect(sgpArt.sports.nfl.residualized).toBe(true);
    expect(sgpArt.default_player_linked_dc_rho).toBeCloseTo(-0.08, 6);

    const pl = evaluatePlayerLinkedSgpV5({
      pPlayerAnytimeGoal: 0.42,
      teamExpectedGoals: 1.75,
      opponentExpectedGoals: 1.05,
      teamOutcome: "team_win",
      matchTotalOverLine: 2.5,
      dixonColesRho: sgpArt.default_player_linked_dc_rho,
    });
    const upperBound = Math.min(
      pl.pPlayerScores,
      pl.pTeamOutcomeMarginal,
      pl.pTotalOutcomeMarginal ?? 1.0,
    );
    const lowerBound = Math.max(
      0.0,
      pl.pPlayerScores + pl.pTeamOutcomeMarginal + (pl.pTotalOutcomeMarginal ?? 1.0) - 2.0,
    );
    expect(pl.jointProbability).toBeGreaterThanOrEqual(lowerBound - 1e-9);
    expect(pl.jointProbability).toBeLessThanOrEqual(upperBound + 1e-9);
    expect(pl.jointProbability).toBeGreaterThan(pl.independentProbability);
  });

  it("Axioma 10: Booking Points gamma_red > 0 con conservación de E[BP] y cobertura arbitral Big-7 > 90%", () => {
    const micro = readJson<SoccerMicroModelArtifactV5>(
      "data/model_soccer_micro_v5_0_candidate.json",
    );
    const officials = readJson<{
      readonly n_officials: number;
      readonly big7_coverage_after: number;
    }>("data/official_priors_v5_1.json");

    expect(micro.red_cards_model.booking_points_gamma_red).toBeGreaterThan(0.0);
    expect(officials.big7_coverage_after).toBeGreaterThan(0.9);
    expect(officials.n_officials).toBeGreaterThanOrEqual(800);

    const dp = micro.div_priors["E0"];
    const makeFeat = (q: SoccerMicroMetricKey): MicroFeatureVectorInputV4 => {
      const sp = micro.metrics[q];
      const bh = dp?.metrics[q]?.home_mean ?? sp.default_home_rate;
      const ba = dp?.metrics[q]?.away_mean ?? sp.default_away_rate;
      return {
        homeFeatures8: [Math.log(Math.max(bh, 0.12)), 0.3, 0.18, 0.05, 0.19, 0, 0, 0],
        awayFeatures8: [Math.log(Math.max(ba, 0.12)), -0.3, -0.11, 0.05, 0.19, 0, 0, 0],
      };
    };
    const out = buildSoccerMicroMatchOutlookV5({
      matchId: "axiom10-bp-check",
      div: "E0",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      lamHome: 1.5,
      lamAway: 1.2,
      featuresByMetric: {
        corners: makeFeat("corners"),
        yellow_cards: makeFeat("yellow_cards"),
        fouls: makeFeat("fouls"),
        shots_on_target: makeFeat("shots_on_target"),
        shots: makeFeat("shots"),
      },
      modelArtifact: micro,
    });
    expect(out.bookingPoints.conditionalGammaRed).toBeGreaterThan(0.0);
    const theoreticalBp = 10.0 * out.metrics.yellow_cards.muTotal + 25.0 * out.redCards.muTotal;
    expect(Math.abs(out.bookingPoints.expectedBookingPoints - theoreticalBp)).toBeLessThan(0.05);
  });

  it("Axioma 11: Venn-Abers cobertura OOS >= 88%, paridad < 1e-12 y guardrail detecta comas y 100%", () => {
    const epArt = readJson<EpistemicConformalArtifactV51>(
      "data/model_epistemic_conformal_v5_1_candidate.json",
    );
    const epSnap = readJson<{
      readonly rows: ReadonlyArray<{
        readonly input: {
          readonly pPoint: number;
          readonly effectiveSampleGames: number;
          readonly pSubModelA: number;
          readonly pSubModelB: number;
          readonly seasonProgress: number;
          readonly hasRecentCoachOrQbChange: boolean;
          readonly missingKeyStarters: number;
          readonly sport: string;
        };
        readonly expected: {
          readonly pLower90: number;
          readonly pUpper90: number;
          readonly halfWidth90: number;
        };
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
      expect(Math.abs(out.halfWidth90 - r.expected.halfWidth90)).toBeLessThan(1e-12);
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

  it("Axioma 12: SHA-256 intacto en los 11 artefactos activos de candidate_registry_v5_1.json sin tocar holdout sellado", () => {
    const reg = readJson<{
      readonly status: string;
      readonly production_activated: boolean;
      readonly holdout_sealed_untouched: boolean;
      readonly n_active_candidate_artifacts: number;
      readonly active_artifacts: ReadonlyArray<{
        readonly id: string;
        readonly artifact_path: string;
        readonly sha256: string;
      }>;
    }>("data/candidate_registry_v5_1.json");

    expect(reg.status).toBe("candidate");
    expect(reg.production_activated).toBe(false);
    expect(reg.holdout_sealed_untouched).toBe(true);
    expect(reg.n_active_candidate_artifacts).toBe(11);
    expect(reg.active_artifacts.length).toBe(11);

    for (const ent of reg.active_artifacts) {
      expect(ent.artifact_path.toLowerCase()).not.toContain("sealed_holdout");
      const localRel = resolveRegistryLocalDataPath(ent.artifact_path);
      const hashes = sha256File(localRel);
      expect([hashes.raw, hashes.lf, hashes.crlf]).toContain(ent.sha256);
    }
  });
});

describe("PitchLab v5.1 · Propiedades fast-check (Matriz 4-Param, Early-Payout y Cópulas SGP)", () => {
  const clubGoals = readJson<{
    readonly default_rho: number;
    readonly dispersion_r: number;
    readonly rho_draw_blend_weight: number;
  }>("data/model_club_goals_v5_0_candidate.json");
  const inplayArt = readJson<InPlayEarlyPayoutArtifactV5>(
    "data/model_inplay_early_payout_v5_0_candidate.json",
  );
  const sgpArt = readJson<SgpCopulaArtifactV5 & { readonly default_player_linked_dc_rho: number }>(
    "data/sgp_copula_v5_0_candidate.json",
  );

  it("solveDiagonalInflatedScoreMatrix4Param conserva el cono 1X2 < 1e-12 y suma de matriz === 1 sin NaN", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 0.85, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.05, max: 0.55, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.05, max: 0.85, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1.0, max: 5.5, noNaN: true, noDefaultInfinity: true }),
        (wH, wD, wA, totTarget) => {
          const sum = wH + wD + wA;
          const pH = wH / sum;
          const pD = wD / sum;
          const pA = wA / sum;
          const sol = solveDiagonalInflatedScoreMatrix4Param({
            pHome: pH,
            pDraw: pD,
            pAway: pA,
            totalGoalsTarget: totTarget,
            rhoPrior: clubGoals.default_rho,
            dispersionR: clubGoals.dispersion_r,
            rhoDrawBlendWeight: clubGoals.rho_draw_blend_weight,
          });
          const mk = summarizeSoccerMarketsFromMatrixV4(sol.matrix);
          let cellSum = 0.0;
          for (const row of sol.matrix) {
            for (const p of row) {
              expect(Number.isFinite(p)).toBe(true);
              expect(p).toBeGreaterThanOrEqual(0.0);
              cellSum += p;
            }
          }
          expect(Math.abs(cellSum - 1.0)).toBeLessThan(1e-12);
          expect(Math.abs(mk.pHome - pH)).toBeLessThan(1e-12);
          expect(Math.abs(mk.pDraw - pD)).toBeLessThan(1e-12);
          expect(Math.abs(mk.pAway - pA)).toBeLessThan(1e-12);
          expect(Number.isFinite(mk.pOver25)).toBe(true);
          expect(Number.isFinite(mk.pBttsYes)).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("evaluateSoccerEarlyPayoutAndInPlay cumple P_EP >= P_win en pre-partido y simplex en vivo", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.35, max: 3.6, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.35, max: 3.6, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.08, max: 0.78, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.08, max: 0.45, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.08, max: 0.78, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 1, max: 89 }),
        (muH, muA, wH, wD, wA, minute) => {
          const sum = wH + wD + wA;
          const pH = wH / sum;
          const pD = wD / sum;
          const pA = wA / sum;

          const pre = evaluateSoccerEarlyPayoutAndInPlay({
            pregameMuHome: muH,
            pregameMuAway: muA,
            currentMinute: 0,
            corePHome: pH,
            corePDraw: pD,
            corePAway: pA,
            artifact: inplayArt,
          });
          expect(pre.earlyPayout2Goals.pHomeEarlyPayoutWin).toBeGreaterThanOrEqual(pH - 1e-12);
          expect(pre.earlyPayout2Goals.pAwayEarlyPayoutWin).toBeGreaterThanOrEqual(pA - 1e-12);
          expect(pre.earlyPayout2Goals.homeEarlyPayoutLift).toBeGreaterThanOrEqual(0.0);
          expect(pre.earlyPayout2Goals.awayEarlyPayoutLift).toBeGreaterThanOrEqual(0.0);

          const live = evaluateSoccerEarlyPayoutAndInPlay({
            pregameMuHome: muH,
            pregameMuAway: muA,
            currentMinute: minute,
            currentHomeGoals: 1,
            currentAwayGoals: 0,
            artifact: inplayArt,
          });
          const live1x2Sum =
            live.regularFullTime.pHome + live.regularFullTime.pDraw + live.regularFullTime.pAway;
          const nextGoalSum =
            live.liveTotalsAndNextGoal.pNextGoalHome +
            live.liveTotalsAndNextGoal.pNextGoalAway +
            live.liveTotalsAndNextGoal.pNoMoreGoals;
          expect(Math.abs(live1x2Sum - 1.0)).toBeLessThan(1e-9);
          expect(Math.abs(nextGoalSum - 1.0)).toBeLessThan(1e-9);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("evaluateStudentTSameGameParlayV5 y evaluatePlayerLinkedSgpV5 respetan cotas Fréchet-Hoeffding", () => {
    const arbProb = fc.double({ min: 0.08, max: 0.92, noNaN: true, noDefaultInfinity: true });
    const arbDir = fc.constantFrom<1 | -1>(1, -1);

    fc.assert(
      fc.property(
        fc.constantFrom<"soccer" | "nfl">("soccer", "nfl"),
        arbProb,
        arbProb,
        arbDir,
        arbDir,
        (sport, p1, p2, d1, d2) => {
          const legs: readonly SgpLegInput[] =
            sport === "soccer"
              ? [
                  { legId: "l1", factor: "total_goals", marginalProbability: p1, direction: d1 },
                  {
                    legId: "l2",
                    factor: "total_shots_on_target",
                    marginalProbability: p2,
                    direction: d2,
                  },
                ]
              : [
                  { legId: "l1", factor: "home_margin", marginalProbability: p1, direction: d1 },
                  { legId: "l2", factor: "total_points", marginalProbability: p2, direction: d2 },
                ];

          const res = evaluateStudentTSameGameParlayV5({
            sport,
            legs,
            artifact: sgpArt,
          });
          const frechetLo = Math.max(0.0, p1 + p2 - 1.0);
          const frechetHi = Math.min(p1, p2);
          expect(Number.isFinite(res.jointProbability)).toBe(true);
          expect(res.jointProbability).toBeGreaterThanOrEqual(frechetLo - 1e-6);
          expect(res.jointProbability).toBeLessThanOrEqual(frechetHi + 1e-6);
          expect(res.fairCombinedOdds.decimal).toBeGreaterThan(1.0);
        },
      ),
      { numRuns: 40 },
    );

    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.7, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.65, max: 3.4, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.65, max: 3.4, noNaN: true, noDefaultInfinity: true }),
        fc.constantFrom<"team_win" | "team_win_or_draw" | "any">(
          "team_win",
          "team_win_or_draw",
          "any",
        ),
        fc.constantFrom<number | null>(null, 1.5, 2.5),
        (playerShare, lamTeam, lamOpp, teamOutcome, totalLine) => {
          const pPlayer = Math.min(0.85, Math.max(0.05, 1.0 - Math.exp(-playerShare * lamTeam)));
          const res = evaluatePlayerLinkedSgpV5({
            pPlayerAnytimeGoal: pPlayer,
            teamExpectedGoals: lamTeam,
            opponentExpectedGoals: lamOpp,
            teamOutcome,
            matchTotalOverLine: totalLine,
            dixonColesRho: sgpArt.default_player_linked_dc_rho,
          });
          const legProbs: number[] = [res.pPlayerScores];
          if (teamOutcome !== "any") legProbs.push(res.pTeamOutcomeMarginal);
          if (res.pTotalOutcomeMarginal !== null) legProbs.push(res.pTotalOutcomeMarginal);

          const inv = validateMatchMathematicalInvariants({
            pHome: 0.5,
            pDraw: null,
            pAway: 0.5,
            sgpChecks:
              legProbs.length >= 2
                ? [{ label: "player_linked", legProbs, jointProbability: res.jointProbability }]
                : [],
          });
          expect(inv.passed).toBe(true);
          expect(Number.isFinite(res.jointProbability)).toBe(true);
          expect(res.fairCombinedOdds.decimal).toBeGreaterThan(1.0);
        },
      ),
      { numRuns: 80 },
    );
  });
});
