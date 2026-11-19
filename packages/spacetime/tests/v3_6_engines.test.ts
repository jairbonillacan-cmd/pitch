import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertStrictUnitProbability,
  comparePropAgainstBookQuote,
  projectNflPlayerPropOutlook,
  projectSoccerPlayerPropOutlook,
  type HierarchicalPropsModelArtifact,
  type LineupStatusV36,
  type SoccerPositionCluster,
  type SoccerPropFamily,
} from "../src/hierarchical_props";
import {
  projectMlbV36Outlook,
  projectNbaV36Outlook,
  projectNhlV36Outlook,
  type MLBV36Input,
  type MultiSportV36ConfigArtifact,
  type NBAV36Input,
  type NHLV36Input,
} from "../src/multisport_v3_6";
import {
  buildSoccerMicroMatchOutlook,
  type OfficialPriorsArtifact,
  type SoccerMicroMetricKey,
  type SoccerMicroModelArtifact,
} from "../src/soccer_micro_markets";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf-8")) as T;
}

describe("PitchLab v3.6 Candidate Engines (EXP_V40 Micro-Markets, EXP_V41 Props, EXP_V42 Multi-Sport)", () => {
  it("EXP_V40: maintains < 1e-12 parity on 150 soccer micro-market & 1H/2H snapshot rows", () => {
    const modelArt = readJson<SoccerMicroModelArtifact>("model_soccer_micro_v3_6_candidate.json");
    const offArt = readJson<OfficialPriorsArtifact>("official_priors_v3_6.json");
    const snap = readJson<{
      holdout_sealed_untouched: boolean;
      rows: Array<{
        match_id: string;
        div: string;
        lam_home: number;
        lam_away: number;
        ref_cards_mult: number;
        ref_fouls_mult: number;
        base_inputs: Record<SoccerMicroMetricKey, { base_home: number; base_away: number }>;
        python_metrics: Record<
          SoccerMicroMetricKey,
          {
            mu_home: number;
            mu_away: number;
            p_over_canonical: number;
            p_under_canonical: number;
            int_line: number;
            p_over_int: number;
            p_under_int: number;
            p_push_int: number;
          }
        >;
        python_halves: {
          lam_1h_home: number;
          lam_1h_away: number;
          lam_2h_home: number;
          lam_2h_away: number;
          p_1h_home: number;
          p_1h_draw: number;
          p_1h_away: number;
          p_1h_over_0_5: number;
          p_2h_over_0_5: number;
        };
      }>;
    }>("soccer_micro_v3_6_snapshot.json");

    expect(modelArt.production_activated).toBe(false);
    expect(snap.holdout_sealed_untouched).toBe(true);
    expect(offArt.n_officials).toBeGreaterThan(50);

    for (const row of snap.rows) {
      const baseRates: Partial<
        Record<SoccerMicroMetricKey, { baseHome: number; baseAway: number }>
      > = {};
      for (const k of Object.keys(row.base_inputs) as SoccerMicroMetricKey[]) {
        baseRates[k] = {
          baseHome: row.base_inputs[k].base_home,
          baseAway: row.base_inputs[k].base_away,
        };
      }

      const tsOut = buildSoccerMicroMatchOutlook({
        matchId: row.match_id,
        div: row.div,
        homeTeam: "HOME",
        awayTeam: "AWAY",
        lamHome: row.lam_home,
        lamAway: row.lam_away,
        explicitRefCardsMultiplier: row.ref_cards_mult,
        explicitRefFoulsMultiplier: row.ref_fouls_mult,
        baseRatesByMetric: baseRates,
        modelArtifact: modelArt,
        officialPriors: offArt,
      });

      for (const q of [
        "corners",
        "yellow_cards",
        "fouls",
        "shots_on_target",
        "shots",
      ] as const) {
        const pyM = row.python_metrics[q];
        const tsM = tsOut.metrics[q];
        expect(Math.abs(tsM.muHome - pyM.mu_home)).toBeLessThan(1e-12);
        expect(Math.abs(tsM.muAway - pyM.mu_away)).toBeLessThan(1e-12);

        const canonLine = modelArt.metrics[q].canonical_total_line;
        const tsCanon = tsM.totalLines.find((l) => Math.abs(l.line - canonLine) < 1e-9)!;
        expect(Math.abs(tsCanon.pOver - pyM.p_over_canonical)).toBeLessThan(1e-12);
        expect(Math.abs(tsCanon.pUnder - pyM.p_under_canonical)).toBeLessThan(1e-12);

        const tsInt = tsM.totalLines.find((l) => Math.abs(l.line - pyM.int_line) < 1e-9);
        if (tsInt) {
          expect(Math.abs(tsInt.pOver - pyM.p_over_int)).toBeLessThan(1e-12);
          expect(Math.abs(tsInt.pUnder - pyM.p_under_int)).toBeLessThan(1e-12);
          expect(Math.abs(tsInt.pPush - pyM.p_push_int)).toBeLessThan(1e-12);
          expect(Math.abs(tsInt.pOver + tsInt.pUnder + tsInt.pPush - 1.0)).toBeLessThan(1e-12);
        }
      }

      expect(Math.abs(tsOut.firstHalf.lamHome - row.python_halves.lam_1h_home)).toBeLessThan(1e-12);
      expect(Math.abs(tsOut.firstHalf.lamAway - row.python_halves.lam_1h_away)).toBeLessThan(1e-12);
      expect(
        Math.abs(tsOut.firstHalf.probs1X2.pHome - row.python_halves.p_1h_home),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(tsOut.firstHalf.overUnder05.pOver - row.python_halves.p_1h_over_0_5),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(tsOut.secondHalf.overUnder05.pOver - row.python_halves.p_2h_over_0_5),
      ).toBeLessThan(1e-12);
    }
  });

  it("EXP_V41: maintains < 1e-12 parity on 120 player prop cases, enforces (0,1) UnitProbability and models sub_cover", () => {
    const propsArt = readJson<HierarchicalPropsModelArtifact>(
      "model_hierarchical_props_v3_6_candidate.json",
    );
    const snap = readJson<{
      holdout_sealed_untouched: boolean;
      rows: Array<{
        case_id: string;
        prop_family: SoccerPropFamily;
        pos_cluster: SoccerPositionCluster;
        lineup_status: LineupStatusV36;
        weighted_sum_y: number;
        weighted_exposure_90: number;
        expected_minutes_starter: number;
        team_goal_factor: number;
        opp_def_factor: number;
        referee_factor: number;
        context_weight: number;
        line: number;
        python_output: {
          lambda_eb_per90: number;
          expected_minutes: number;
          r_effective: number;
          p_over_raw: number;
          p_over_calibrated: number;
          p_under_calibrated: number;
          p_over_sub_cover: number;
          sub_cover_lift: number;
        };
      }>;
    }>("hierarchical_props_v3_6_snapshot.json");

    expect(propsArt.production_activated).toBe(false);
    expect(snap.holdout_sealed_untouched).toBe(true);

    for (const r of snap.rows) {
      const tsP = projectSoccerPlayerPropOutlook(
        {
          propFamily: r.prop_family,
          posCluster: r.pos_cluster,
          lineupStatus: r.lineup_status,
          weightedSumY: r.weighted_sum_y,
          weightedExposure90: r.weighted_exposure_90,
          expectedMinutesStarter: r.expected_minutes_starter,
          teamGoalFactor: r.team_goal_factor,
          oppDefFactor: r.opp_def_factor,
          refereeFactor: r.referee_factor,
          contextWeight: r.context_weight,
          line: r.line,
        },
        propsArt,
      );

      expect(Math.abs(tsP.lambdaEbPer90 - r.python_output.lambda_eb_per90)).toBeLessThan(1e-12);
      expect(Math.abs(tsP.expectedMinutes - r.python_output.expected_minutes)).toBeLessThan(1e-12);
      expect(Math.abs(tsP.pOverCalibrated - r.python_output.p_over_calibrated)).toBeLessThan(1e-12);
      expect(Math.abs(tsP.pOverSubCover - r.python_output.p_over_sub_cover)).toBeLessThan(1e-12);
      expect(tsP.pOverSubCover).toBeGreaterThanOrEqual(tsP.pOverCalibrated);
    }

    // Guardia dura contra el bug 100x [0..100] de Scout Picks
    expect(() => assertStrictUnitProbability(1.0)).toThrow();
    expect(() => assertStrictUnitProbability(0.0)).toThrow();
    expect(() => assertStrictUnitProbability(75.0)).toThrow();

    const sample = projectSoccerPlayerPropOutlook(
      {
        propFamily: "goals",
        posCluster: "FW_CF",
        weightedSumY: 6.0,
        weightedExposure90: 8.5,
        lineupStatus: "confirmed_starter",
      },
      propsArt,
    );
    const cmp2Way = comparePropAgainstBookQuote({
      pCalibrated: sample.pOverCalibrated,
      pSubCoverCalibrated: sample.pOverSubCover,
      bookmaker: "betano",
      oddsSelected: 2.35,
      oddsOpposite: 1.55,
      side: "over",
      activePerks: ["sub_cover"],
    });
    expect(cmp2Way.oneWayQuoteOnly).toBe(false);
    expect(Math.abs(cmp2Way.probDeltaVsBookNoVig)).toBeLessThan(1.0);

    // NFL script-coupled player props: RB trailing vs leading
    const rbLeading = projectNflPlayerPropOutlook(
      {
        position: "RB",
        marketKey: "rush_yds",
        seasonTotal: 640,
        gamesPlayed: 9,
        line: 64.5,
        teamExpectedMargin: 7.5,
      },
      propsArt,
    );
    const rbTrailing = projectNflPlayerPropOutlook(
      {
        position: "RB",
        marketKey: "rush_yds",
        seasonTotal: 640,
        gamesPlayed: 9,
        line: 64.5,
        teamExpectedMargin: -7.5,
      },
      propsArt,
    );
    expect(rbLeading.pOverCalibrated).toBeGreaterThan(rbTrailing.pOverCalibrated);
  });

  it("EXP_V42: maintains < 1e-12 parity across 90 MLB, NHL & NBA v3.6 cases", () => {
    const cfg = readJson<MultiSportV36ConfigArtifact>("multisport_v3_6_config_candidate.json");
    const snap = readJson<{
      mlb_cases: Array<{
        input: MLBV36Input;
        python_output: {
          p_home: number;
          p_away: number;
          f5: { p_home: number; p_tie: number; p_away: number; p_over_4_5: number };
          full_game: {
            expected_total_runs: number;
            p_over_cond_no_push: number;
            p_runline_home_minus_1_5: number;
            extra_innings_over_correction_pp: number;
          };
        };
      }>;
      nhl_cases: Array<{
        input: NHLV36Input;
        python_output: {
          p_home: number;
          p_home_reg: number;
          p_ot_reg: number;
          expected_goals_home_full: number;
          p_over_cond_no_push: number;
        };
      }>;
      nba_cases: Array<{
        input: NBAV36Input;
        python_output: {
          expected_margin: number;
          expected_total: number;
          p_home: number;
          p_overtime: number;
          p_over: number;
        };
      }>;
    }>("multisport_v3_6_snapshot.json");

    for (const c of snap.mlb_cases) {
      const ts = projectMlbV36Outlook(c.input, cfg);
      expect(Math.abs(ts.p_home - c.python_output.p_home)).toBeLessThan(1e-12);
      expect(Math.abs(ts.f5.p_home - c.python_output.f5.p_home)).toBeLessThan(1e-12);
      expect(Math.abs(ts.f5.p_tie - c.python_output.f5.p_tie)).toBeLessThan(1e-12);
      expect(
        Math.abs(
          ts.full_game.expected_total_runs - c.python_output.full_game.expected_total_runs,
        ),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(
          ts.full_game.p_over_cond_no_push - c.python_output.full_game.p_over_cond_no_push,
        ),
      ).toBeLessThan(1e-12);
      expect(ts.full_game.extra_innings_over_correction_pp).toBeGreaterThan(0);
    }

    for (const c of snap.nhl_cases) {
      const ts = projectNhlV36Outlook(c.input, cfg);
      expect(Math.abs(ts.p_home - c.python_output.p_home)).toBeLessThan(1e-12);
      expect(Math.abs(ts.p_ot_reg - c.python_output.p_ot_reg)).toBeLessThan(1e-12);
      expect(
        Math.abs(ts.expected_goals_home_full - c.python_output.expected_goals_home_full),
      ).toBeLessThan(1e-12);
      expect(ts.ot_conservation_residual).toBeLessThan(1e-11);
    }

    for (const c of snap.nba_cases) {
      const ts = projectNbaV36Outlook(c.input, cfg);
      expect(Math.abs(ts.expected_margin - c.python_output.expected_margin)).toBeLessThan(1e-12);
      expect(Math.abs(ts.p_home - c.python_output.p_home)).toBeLessThan(1e-12);
      expect(Math.abs(ts.p_overtime - c.python_output.p_overtime)).toBeLessThan(1e-12);
      expect(Math.abs(ts.p_over - c.python_output.p_over)).toBeLessThan(1e-12);
    }
  });
});
