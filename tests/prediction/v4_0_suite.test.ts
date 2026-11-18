/**
 * Suite Integral de Paridad IEEE-754 `< 1e-12` y Gobernanza Red-Team para `PitchLab v4.0 Candidate` (`EXP_V43`–`EXP_V49`).
 *
 * Verifica simultáneamente:
 *  1. `EXP_V43`: Solver 4-Param Diagonal-Inflado (`< 1e-12` paridad frente a `soccer_v4_0_core_snapshot.json`
 *     + error de coherencia `1X2 < 1e-14` universal, incluso en goleadas extremas `99%`).
 *  2. `EXP_V44`: Micro-Mercados Bivariados de Sarmanov `v4.0` (`< 1e-12` paridad en `80 x 5 = 400` mercados + `1X2` + `Handicaps`).
 *  3. `EXP_V45`: NFL `Minkowski v4.0` (`< 1e-12` paridad en PMF Discreta de Números Clave `±3/±7`, Totales y `45` PBP Player Props).
 *  4. `EXP_V46`: Player Props `v4.0` (`< 1e-12` paridad en `6` familias incl. `shots`, `shots_on_target`, `assists`,
 *     Isotónica `PAVA` monótona y `sub_cover` empírico).
 *  5. `EXP_V47`: `Multi-Sport v4.0` (`< 1e-12` paridad en `80` duelos reales de `MLB`, `NHL`, `NBA` y `NCAAF Horizon v4.0`).
 *  6. `EXP_V48`: Motor Institucional de Cópulas `SGP` (`< 1e-12` paridad Halton QMC + Acklam `Φ⁻¹` + Cholesky + Detector Impuesto SGP).
 *  7. `EXP_V49`: Hub `UnifiedMatchIntelligenceV4` (`242/242` `"ok"`, `0` claves prohibidas) y Guardrail Anti-Alucinaciones.
 */

import { describe, expect, it } from "vitest";

import gbmClubV40Json from "../../src/data/prediction/gbm_club_v4_0_candidate.json";
import goalsClubV40Json from "../../src/data/prediction/model_club_goals_v4_0_candidate.json";
import soccerCoreSnapJson from "../../src/data/prediction/soccer_v4_0_core_snapshot.json";

import microModelV40Json from "../../src/data/prediction/model_soccer_micro_v4_0_candidate.json";
import microSnapV40Json from "../../src/data/prediction/soccer_micro_v4_0_snapshot.json";

import nflKeyNumbersV40Json from "../../src/data/prediction/model_nfl_key_numbers_v4_0_candidate.json";
import nflPropsModelV40Json from "../../src/data/prediction/model_nfl_props_v4_0_candidate.json";
import nflSnapV40Json from "../../src/data/prediction/nfl_v4_0_snapshot.json";

import propsModelV40Json from "../../src/data/prediction/model_hierarchical_props_v4_0_candidate.json";
import propsSnapV40Json from "../../src/data/prediction/hierarchical_props_v4_0_snapshot.json";

import multisportStateV40Json from "../../src/data/prediction/multisport_v4_0_state_candidate.json";
import multisportSnapV40Json from "../../src/data/prediction/multisport_v4_0_snapshot.json";

import sgpPriorsV40Json from "../../src/data/prediction/sgp_copula_priors_v4_0_candidate.json";
import sgpSnapV40Json from "../../src/data/prediction/sgp_copula_v4_0_snapshot.json";

import liveMatchdayV4Json from "../../src/data/prediction/live_matchday_v4_candidate_snapshot.json";

import {
  solveDiagonalInflatedScoreMatrix4Param,
  summarizeSoccerMarketsFromMatrixV4,
} from "../../src/domain/prediction/diagonal_score_matrix.js";
import { evaluateCompactValidationRow, type GbmArtifact } from "../../src/domain/prediction/gbm.js";
import {
  evaluateIsotonicPiecewiseCalibration,
  projectSoccerPlayerPropOutlookV4,
  type HierarchicalPropsModelArtifactV4,
  type SoccerPlayerPropInputV4,
} from "../../src/domain/prediction/hierarchical_props.js";
import {
  predictLiveMultiSportV40Matchup,
  type MultiSportV40StateArtifact,
} from "../../src/domain/prediction/multisport_v3_6.js";
import {
  buildVerifiedMatchFactSheet,
  validateNarrativeAgainstFactSheet,
} from "../../src/domain/prediction/narrative_guardrail.js";
import {
  projectNflPlayerPropV4,
  projectNflSpreadFromMarginPmfExact,
  projectNflTotalsOutlookV4,
  solveNflKeyNumberMarginPmfExact,
  type NflKeyNumbersModelArtifactV4,
  type NflPlayerPropsModelArtifactV4,
} from "../../src/domain/prediction/nfl_v4_0.js";
import {
  evaluateSameGameParlayCopula,
  type SgpCopulaPriorsArtifactV4,
  type SgpLegInput,
} from "../../src/domain/prediction/sgp_copula.js";
import {
  buildSoccerMicroMatchOutlookV4,
  type SoccerMicroModelArtifactV4,
} from "../../src/domain/prediction/soccer_micro_markets.js";
import {
  buildUnifiedMultiSportMatchIntelligenceV4,
  buildUnifiedNflMatchIntelligenceV4,
  buildUnifiedSoccerMatchIntelligenceV4,
} from "../../src/domain/prediction/unified_outlook_v4.js";

describe("EXP_V43 · Tachyon v4.0 & 4-Param Diagonal-Inflated Score Matrix", () => {
  it("mantiene paridad IEEE-754 < 1e-12 frente a Python en 120 partidos y coherencia 1X2 < 1e-14", () => {
    const gbmArt = gbmClubV40Json as unknown as GbmArtifact;
    const goalsArt = goalsClubV40Json;
    expect(gbmArt.production_activated).toBe(false);
    expect(goalsArt.status).toBe("candidate");
    expect(soccerCoreSnapJson.rows.length).toBe(120);

    for (const row of soccerCoreSnapJson.rows) {
      const divIdx = gbmArt.div_levels.indexOf(row.div);
      const ev = evaluateCompactValidationRow(row.features, divIdx, gbmArt);
      expect(Math.abs(ev.ensemble[0] - row.python_ensemble_probs[0]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.ensemble[1] - row.python_ensemble_probs[1]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.ensemble[2] - row.python_ensemble_probs[2]!)).toBeLessThan(1e-12);

      const dOh = goalsArt.div_levels.map((lv) => (lv === row.div ? 1.0 : 0.0));
      const xgFull = [...row.goals_features, ...dOh];
      let eta = goalsArt.intercept;
      for (let i = 0; i < xgFull.length; i += 1) {
        const sc = goalsArt.scaler_scale[i] || 1.0;
        eta += goalsArt.coef[i]! * ((xgFull[i]! - goalsArt.scaler_mean[i]!) / sc);
      }
      eta = Math.min(Math.max(eta, Math.log(goalsArt.min_total_goals)), Math.log(goalsArt.max_total_goals));
      const tHat = Math.exp(eta);
      expect(Math.abs(tHat - row.python_t_hat)).toBeLessThan(1e-12);

      const rhoP =
        (goalsArt.div_rho_map as Record<string, number>)[row.div] ?? goalsArt.default_rho;
      const sol4 = solveDiagonalInflatedScoreMatrix4Param({
        pHome: ev.ensemble[0],
        pDraw: ev.ensemble[1],
        pAway: ev.ensemble[2],
        totalGoalsTarget: tHat,
        rhoPrior: rhoP,
        dispersionR: goalsArt.dispersion_r,
        maxGoals: goalsArt.max_goals_grid,
      });
      const mk4 = summarizeSoccerMarketsFromMatrixV4(sol4.matrix);

      expect(Math.abs(mk4.pHome - ev.ensemble[0])).toBeLessThan(1e-14);
      expect(Math.abs(mk4.pDraw - ev.ensemble[1])).toBeLessThan(1e-14);
      expect(Math.abs(mk4.pAway - ev.ensemble[2])).toBeLessThan(1e-14);

      expect(Math.abs(sol4.muHome - row.python_4param.mu_home)).toBeLessThan(1e-12);
      expect(Math.abs(sol4.muAway - row.python_4param.mu_away)).toBeLessThan(1e-12);
      expect(Math.abs(mk4.pOver25 - row.python_4param.p_over_2_5)).toBeLessThan(1e-12);
      expect(Math.abs(mk4.pBttsYes - row.python_4param.p_btts_yes)).toBeLessThan(1e-12);
    }
  });

  it("elimina por completo la frontera de cono incluso en goleadas extremas 98.5%", () => {
    const extreme = solveDiagonalInflatedScoreMatrix4Param({
      pHome: 0.985,
      pDraw: 0.01,
      pAway: 0.005,
      totalGoalsTarget: 4.35,
      rhoPrior: -0.11,
      dispersionR: 28.0,
    });
    const mk = summarizeSoccerMarketsFromMatrixV4(extreme.matrix);
    expect(Math.abs(mk.pHome - 0.985)).toBeLessThan(1e-14);
    expect(Math.abs(mk.pDraw - 0.01)).toBeLessThan(1e-14);
    expect(Math.abs(mk.pAway - 0.005)).toBeLessThan(1e-14);
  });
});

describe("EXP_V44 · Bivariate Sarmanov Micro-Markets v4.0", () => {
  it("reproduce con paridad < 1e-12 las 400 proyecciones bivariadas (totales, 1X2 y hándicaps)", () => {
    const art = microModelV40Json as unknown as SoccerMicroModelArtifactV4;
    expect(art.status).toBe("candidate");
    expect(art.production_activated).toBe(false);
    expect(microSnapV40Json.rows.length).toBe(80);

    for (const r of microSnapV40Json.rows) {
      const out = buildSoccerMicroMatchOutlookV4({
        matchId: r.match_id,
        div: r.div,
        homeTeam: r.home_team,
        awayTeam: r.away_team,
        lamHome: r.lam_home,
        lamAway: r.lam_away,
        featuresByMetric: r.features_by_metric,
        modelArtifact: art,
      });

      for (const q of ["corners", "yellow_cards", "fouls", "shots_on_target", "shots"] as const) {
        const m = out.metrics[q];
        const ex = r.expected[q];
        const canonLine = art.metrics[q].canonical_total_line;
        const canonProj = m.totalLines.find((l) => Math.abs(l.line - canonLine) < 1e-9)!;

        expect(Math.abs(m.muHome - ex.mu_home)).toBeLessThan(1e-12);
        expect(Math.abs(m.muAway - ex.mu_away)).toBeLessThan(1e-12);
        expect(Math.abs(canonProj.pOver - ex.p_over_canonical)).toBeLessThan(1e-12);
        expect(Math.abs(m.side1X2.pHomeMost - ex.p_home_most)).toBeLessThan(1e-12);
        expect(Math.abs(m.side1X2.pTie - ex.p_tie)).toBeLessThan(1e-12);
        expect(Math.abs(m.side1X2.pAwayMost - ex.p_away_most)).toBeLessThan(1e-12);
        expect(
          Math.abs(m.handicapLines[0]!.pHomeCoverNoPush - ex.p_hc_first_no_push),
        ).toBeLessThan(1e-12);
      }
    }
  });
});

describe("EXP_V45 · NFL Minkowski v4.0 Key Numbers & Real PBP Player Props", () => {
  it("verifica paridad < 1e-12 en PMF Discreta de Números Clave, Totales y 45 PBP Props", () => {
    const keyArt = nflKeyNumbersV40Json as unknown as NflKeyNumbersModelArtifactV4;
    const propArt = nflPropsModelV40Json as unknown as NflPlayerPropsModelArtifactV4;
    expect(keyArt.status).toBe("candidate");
    expect(propArt.production_activated).toBe(false);

    for (const gr of nflSnapV40Json.game_rows) {
      const sol = solveNflKeyNumberMarginPmfExact({
        pHome: gr.p_home,
        pTie: gr.p_tie,
        pAway: gr.p_away,
        artifact: keyArt,
      });
      const spM3 = projectNflSpreadFromMarginPmfExact(sol, -3.0);
      const spM35 = projectNflSpreadFromMarginPmfExact(sol, -3.5);
      const totOut = projectNflTotalsOutlookV4({
        modelExpectedTotal: gr.t_model,
        artifact: keyArt,
        objectiveLines: [44.5],
        marketTotalLine: gr.market_total_line,
      });

      expect(Math.abs(sol.theta - gr.expected.theta)).toBeLessThan(1e-12);
      expect(Math.abs(sol.expectedMargin - gr.expected.expected_margin)).toBeLessThan(1e-12);
      expect(Math.abs(spM3.pPush - gr.expected.spread_minus_3_0.pPush)).toBeLessThan(1e-12);
      expect(
        Math.abs(spM35.pHomeCoverNoPush - gr.expected.spread_minus_3_5.pHomeCoverNoPush),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(totOut.objectiveProjections[0]!.pOver - gr.expected.phys_44_5_over),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(totOut.marketPosteriorProjection!.pOver - gr.expected.mkt_post_over),
      ).toBeLessThan(1e-12);
    }

    for (const pr of nflSnapV40Json.prop_rows) {
      const outP = projectNflPlayerPropV4({
        market: pr.market as "pass_attempts" | "completions" | "rush_attempts",
        features4: pr.features4 as unknown as readonly [number, number, number, number],
        line: pr.line,
        artifact: propArt,
      });
      expect(Math.abs(outP.expectedMean - pr.expected_mu)).toBeLessThan(1e-12);
      expect(Math.abs(outP.pOver - pr.expected_p_over)).toBeLessThan(1e-12);
      expect(Math.abs(outP.pUnder - pr.expected_p_under)).toBeLessThan(1e-12);
    }
  });
});

describe("EXP_V46 · Hierarchical Props v4.0 (Shots/SoT/Assists + Empirical sub_cover + Isotonic PAVA)", () => {
  it("verifica paridad < 1e-12 en los 72 escenarios y monotonía estricta PAVA", () => {
    const art = propsModelV40Json as unknown as HierarchicalPropsModelArtifactV4;
    expect(art.status).toBe("candidate");
    expect(art.production_activated).toBe(false);

    for (const fam of [
      "goals",
      "assists",
      "goals_assists",
      "yellow_cards",
      "shots",
      "shots_on_target",
    ] as const) {
      let prev = 0.0;
      for (let step = 0; step <= 100; step += 1) {
        const y = evaluateIsotonicPiecewiseCalibration(step / 100.0, art.soccer.isotonic_calibration[fam]);
        expect(y).toBeGreaterThanOrEqual(prev - 1e-15);
        prev = y;
      }
    }

    for (const c of propsSnapV40Json.rows) {
      const out = projectSoccerPlayerPropOutlookV4(
        c.input as unknown as SoccerPlayerPropInputV4,
        art,
      );
      expect(Math.abs(out.lambdaEbPer90 - c.expected.lambda_eb_per90)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverRaw - c.expected.p_over_raw)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverCalibrated - c.expected.p_over_calibrated)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverSubCover - c.expected.p_over_sub_cover)).toBeLessThan(1e-12);
    }
  });
});

describe("EXP_V47 · Unified Multi-Sport v4.0 (MLB, NHL, NBA, NCAAF Horizon v4.0)", () => {
  it("verifica paridad < 1e-12 en los 80 duelos reales de las 4 ligas", () => {
    const st = multisportStateV40Json as unknown as MultiSportV40StateArtifact;
    expect(st.status).toBe("candidate");
    expect(st.production_activated).toBe(false);
    expect(multisportSnapV40Json.rows.length).toBe(80);

    for (const row of multisportSnapV40Json.rows) {
      const res = predictLiveMultiSportV40Matchup({
        sport: row.sport as "mlb" | "nhl" | "nba" | "ncaaf",
        homeKey: row.home_key,
        awayKey: row.away_key,
        stateArtifact: st,
        neutralSite: row.neutral_site,
      });

      expect(Math.abs(res.p_home - row.expected.p_home!)).toBeLessThan(1e-12);
      expect(Math.abs(res.p_away - row.expected.p_away!)).toBeLessThan(1e-12);
      if (res.sport === "ncaaf") {
        expect(Math.abs(res.expected_margin - row.expected.expected_margin!)).toBeLessThan(1e-12);
        expect(
          Math.abs(
            res.p_spread_home_cover_no_push - row.expected.p_spread_home_cover_no_push!,
          ),
        ).toBeLessThan(1e-12);
      } else if (res.sport === "nhl") {
        expect(res.ot_conservation_residual).toBeLessThan(1e-12);
      }
    }
  });
});

describe("EXP_V48 · Institutional SGP Copula Engine (Halton QMC + Hidden-Tax Audit)", () => {
  it("verifica paridad < 1e-12 en los 50 boletos SGP de 2, 3 y 4 patas en Fútbol y NFL", () => {
    const art = sgpPriorsV40Json as unknown as SgpCopulaPriorsArtifactV4;
    expect(art.status).toBe("candidate");
    expect(art.production_activated).toBe(false);

    for (const row of sgpSnapV40Json.rows) {
      const out = evaluateSameGameParlayCopula({
        sport: row.sport as "soccer" | "nfl",
        legs: row.legs as unknown as readonly SgpLegInput[],
        artifact: art,
        offeredCombinedDecimalOdds: row.offered_odds,
      });
      expect(Math.abs(out.independentProbability - row.expected.independent_probability)).toBeLessThan(
        1e-12,
      );
      expect(Math.abs(out.jointProbability - row.expected.joint_probability)).toBeLessThan(1e-12);
      expect(Math.abs(out.correlationMultiplier - row.expected.correlation_multiplier)).toBeLessThan(
        1e-12,
      );
      if (row.offered_odds !== null) {
        expect(
          Math.abs(out.bookQuoteAudit!.effectiveHoldPct - row.expected.effective_hold_pct!),
        ).toBeLessThan(1e-12);
        expect(out.bookQuoteAudit!.taxFlag).toBe(row.expected.tax_flag);
      }
    }
  });
});

describe("EXP_V49 · UnifiedMatchIntelligenceV4 Hub, 242/242 Coverage & Anti-Hallucination Guardrail", () => {
  it("verifica cobertura 100% 'ok' (242/242) y 0 campos prohibidos en live_matchday_v4_candidate_snapshot.json", () => {
    expect(liveMatchdayV4Json.status).toBe("candidate");
    expect(liveMatchdayV4Json.production_activated).toBe(false);
    expect(liveMatchdayV4Json.n_matchups).toBe(242);
    expect(liveMatchdayV4Json.n_coverage_ok).toBe(242);
    expect(liveMatchdayV4Json.n_low_coverage).toBe(0);

    const rawSerialized = JSON.stringify(liveMatchdayV4Json);
    expect(rawSerialized).not.toContain('"stake"');
    expect(rawSerialized).not.toContain('"recommendedStake"');
    expect(rawSerialized).not.toContain('"kelly"');
    expect(rawSerialized).not.toContain('"kellyFraction"');
    expect(rawSerialized).not.toContain('"ev"');
    expect(rawSerialized).not.toContain('"tier"');
  });

  it("orquesta UnifiedMatchIntelligenceV4 en vivo y bloquea inversiones de favorito tipo Astra AI", () => {
    const socUnified = buildUnifiedSoccerMatchIntelligenceV4({
      matchId: "mex_toluca_america",
      league: "liga-mx",
      div: "MEX",
      homeTeam: "Toluca",
      awayTeam: "Club America",
      pHome: 0.52,
      pDraw: 0.25,
      pAway: 0.23,
      totalGoalsTarget: 2.95,
      microArtifact: microModelV40Json as unknown as SoccerMicroModelArtifactV4,
      sgpArtifact: sgpPriorsV40Json as unknown as SgpCopulaPriorsArtifactV4,
    });
    expect(socUnified.guardrailAudit.passed).toBe(true);
    expect(socUnified.dataQuality.flag).toBe("ok");

    const nflUnified = buildUnifiedNflMatchIntelligenceV4({
      matchId: "nfl_kc_buf",
      homeTeam: "Kansas City Chiefs",
      awayTeam: "Buffalo Bills",
      pHome: 0.56,
      pTie: 0.004,
      pAway: 0.436,
      modelExpectedTotal: 47.8,
      marketTotalLine: 47.5,
      keyNumbersArtifact: nflKeyNumbersV40Json as unknown as NflKeyNumbersModelArtifactV4,
      sgpArtifact: sgpPriorsV40Json as unknown as SgpCopulaPriorsArtifactV4,
    });
    expect(nflUnified.guardrailAudit.passed).toBe(true);

    const msUnified = buildUnifiedMultiSportMatchIntelligenceV4({
      matchId: "mlb_lad_nyy",
      sport: "mlb",
      homeKey: "LAD",
      awayKey: "NYY",
      homeTeam: "Los Angeles Dodgers",
      awayTeam: "New York Yankees",
      stateArtifact: multisportStateV40Json as unknown as MultiSportV40StateArtifact,
    });
    expect(msUnified.guardrailAudit.passed).toBe(true);

    // Simular alucinaciones reales (inversión de favorito, certeza 100%, stake/kelly y porcentaje falso)
    const facts = buildVerifiedMatchFactSheet({
      matchId: "test_guard",
      sport: "soccer",
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      pHome: 0.68,
      pDraw: 0.2,
      pAway: 0.12,
      expectedTotal: 2.8,
      canonicalTotalLine: 2.5,
      pOverCanonical: 0.56,
    });

    const badInv = validateNarrativeAgainstFactSheet(
      "Everton parte como claro favorito en este partido.",
      facts,
    );
    expect(badInv.passed).toBe(false);
    expect(badInv.violations.some((v) => v.code === "favorite_inversion")).toBe(true);

    const badCert = validateNarrativeAgainstFactSheet(
      "Arsenal gana 100% seguro, métele 5 unidades con Kelly.",
      facts,
    );
    expect(badCert.passed).toBe(false);
    expect(badCert.violations.some((v) => v.code === "forbidden_certainty_claim")).toBe(true);
    expect(badCert.violations.some((v) => v.code === "forbidden_sizing_recommendation")).toBe(true);

    const badPct = validateNarrativeAgainstFactSheet(
      "Arsenal parte como favorito con 84.5% de probabilidad.",
      facts,
    );
    expect(badPct.passed).toBe(false);
    expect(badPct.violations.some((v) => v.code === "probability_hallucination")).toBe(true);
  });
});
