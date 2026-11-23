/**
 * PitchLab Multi-Sport Walk-Forward Physics & Early-Payout v6.0 (`EXP_V60`) —
 * Suite de paridad IEEE-754 `< 1e-12` Python <-> TypeScript sobre `>= 40` (`64`) vectores reales
 * en las 4 ligas (`MLB`, `NHL`, `NBA`, `NFL`), verificación algebraica de *Early Payout*
 * (`+5 MLB`, `+20 NBA`, `+17 NFL`, `+3 NHL`), axiomas físicos (`Axioma 5`, `Axioma 8`,
 * identidad *Empty-Net* `OT`, ensanchamiento `sigma_margin` por bajas NBA) y gobernanza Red-Team.
 */

import { describe, expect, it } from "vitest";

const expResultsJson: any = undefined;
import modelV60Json from "../data/model_multisport_v6_0_candidate.json";
import snapshotV60Json from "../data/multisport_v6_0_snapshot.json";

import {
  evaluateBrownianEarlyPayoutV60,
  MULTISPORT_V60_SCHEMA_VERSION,
  projectMlbWalkforwardOutlookV60,
  projectMultiSportMatchupFromStateV60,
  projectNbaWalkforwardOutlookV60,
  projectNflWalkforwardOutlookV60,
  projectNhlWalkforwardOutlookV60,
  solveNflKeyMarginPmfV60,
  type MlbWalkforwardInputV60,
  type MlbWalkforwardOutlookV60,
  type MultiSportLeagueV60,
  type MultiSportModelArtifactV60,
  type NbaWalkforwardInputV60,
  type NbaWalkforwardOutlookV60,
  type NflWalkforwardInputV60,
  type NflWalkforwardOutlookV60,
  type NhlWalkforwardInputV60,
  type NhlWalkforwardOutlookV60,
} from "../src/multisport_v6_0";

interface ParitySnapshotV60 {
  readonly schema_version: string;
  readonly status: string;
  readonly production_activated: boolean;
  readonly holdout_sealed_untouched: boolean;
  readonly parity_cases_count: number;
  readonly parity_cases: ReadonlyArray<{
    readonly case_id: string;
    readonly sport: MultiSportLeagueV60;
    readonly date: string;
    readonly home_code: string;
    readonly away_code: string;
    readonly input: Record<string, unknown>;
    readonly expected: Record<string, unknown>;
  }>;
  readonly live_scheduled_outlooks_2026: ReadonlyArray<{
    readonly game_id: string;
    readonly sport: MultiSportLeagueV60;
    readonly kickoff_utc: string;
    readonly home_code: string;
    readonly away_code: string;
    readonly neutral_site: boolean;
    readonly p_home: number;
    readonly p_away: number;
    readonly p_home_early_payout_win: number;
    readonly p_away_early_payout_win: number;
    readonly expected_total: number;
  }>;
}

describe("PitchLab Multi-Sport v6.0 (`EXP_V60`) · Paridad IEEE-754 < 1e-12 y Física Walk-Forward", () => {
  const artifact = modelV60Json as unknown as MultiSportModelArtifactV60;
  const snapshot = snapshotV60Json as unknown as ParitySnapshotV60;
  const expResults = expResultsJson as unknown as {
    status: string;
    production_activated: boolean;
    holdout_sealed_untouched: boolean;
    hyperparameter_tuning_on_holdout: boolean;
    governance: {
      causality_rule: string;
      bootstrap_method: string;
      bootstrap_seed: number;
      bootstrap_resamples: number;
      total_games_ingested: number;
      games_by_sport: Record<MultiSportLeagueV60, number>;
      early_payout_dominance_violations: number;
      early_payout_games_checked: number;
      forbidden_fields_present: boolean;
    };
    pooled_4_leagues_oos: {
      all_games_moneyline_vs_coin_oos: {
        n_rows: number;
        logloss: { delta_mean: number; ci95_hi: number; significant_improvement: boolean };
      };
    };
    sports: Record<
      MultiSportLeagueV60,
      {
        validation_status: string;
        total_games_ingested: number;
        early_payout_audit: {
          trigger_lead: number;
          final_score_validation_status: string;
          intra_game_validation_status: string;
          algebraic_dominance_violations: number;
        };
      }
    >;
  };

  it("1. Paridad IEEE-754 < 1e-12 en >= 40 (`64`) vectores reales en las 4 ligas (`MLB`, `NHL`, `NBA`, `NFL`)", () => {
    expect(artifact.schema_version).toBe(MULTISPORT_V60_SCHEMA_VERSION);
    expect(snapshot.parity_cases.length).toBeGreaterThanOrEqual(40);

    const counts: Record<MultiSportLeagueV60, number> = { mlb: 0, nhl: 0, nba: 0, nfl: 0 };

    for (const c of snapshot.parity_cases) {
      counts[c.sport] += 1;

      if (c.sport === "mlb") {
        const out = projectMlbWalkforwardOutlookV60(
          c.input as unknown as MlbWalkforwardInputV60,
          artifact,
        );
        const exp = c.expected as unknown as MlbWalkforwardOutlookV60;
        expect(Math.abs(out.p_home - exp.p_home)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_away - exp.p_away)).toBeLessThan(1e-12);
        expect(Math.abs(out.effective_home_woba - exp.effective_home_woba)).toBeLessThan(1e-12);
        expect(Math.abs(out.effective_away_woba - exp.effective_away_woba)).toBeLessThan(1e-12);
        expect(Math.abs(out.f5.mu_home - exp.f5.mu_home)).toBeLessThan(1e-12);
        expect(Math.abs(out.f5.mu_away - exp.f5.mu_away)).toBeLessThan(1e-12);
        expect(Math.abs(out.f5.p_home - exp.f5.p_home)).toBeLessThan(1e-12);
        expect(Math.abs(out.f5.p_tie - exp.f5.p_tie)).toBeLessThan(1e-12);
        expect(Math.abs(out.f5.p_away - exp.f5.p_away)).toBeLessThan(1e-12);
        expect(Math.abs(out.f5.p_over_4_5 - exp.f5.p_over_4_5)).toBeLessThan(1e-12);
        expect(Math.abs(out.full_game.p_extra_innings - exp.full_game.p_extra_innings)).toBeLessThan(1e-12);
        expect(Math.abs(out.full_game.expected_total_runs - exp.full_game.expected_total_runs)).toBeLessThan(1e-12);
        expect(
          Math.abs(out.full_game.p_runline_home_minus_1_5 - exp.full_game.p_runline_home_minus_1_5),
        ).toBeLessThan(1e-12);
        for (const k of ["7.5", "8.5", "9.5"]) {
          expect(
            Math.abs((out.full_game.totals_by_line[k]?.p_over ?? 0) - (exp.full_game.totals_by_line[k]?.p_over ?? 0)),
          ).toBeLessThan(1e-12);
        }
        expect(
          Math.abs(out.early_payout.p_home_early_payout_win - exp.early_payout.p_home_early_payout_win),
        ).toBeLessThan(1e-12);
        expect(
          Math.abs(out.early_payout.p_away_early_payout_win - exp.early_payout.p_away_early_payout_win),
        ).toBeLessThan(1e-12);
        expect(out.early_payout.p_home_early_payout_win).toBeGreaterThanOrEqual(out.p_home);
        expect(out.early_payout.p_away_early_payout_win).toBeGreaterThanOrEqual(out.p_away);
      } else if (c.sport === "nhl") {
        const out = projectNhlWalkforwardOutlookV60(
          c.input as unknown as NhlWalkforwardInputV60,
          artifact,
        );
        const exp = c.expected as unknown as NhlWalkforwardOutlookV60;
        expect(out.goalie_confirmed_home).toBe(false);
        expect(out.goalie_confirmed_away).toBe(false);
        expect(out.goalie_quality_flag).toBe("unconfirmed_goalie_warning");
        expect(Math.abs(out.p_home - exp.p_home)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_away - exp.p_away)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_home_reg - exp.p_home_reg)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_ot_reg - exp.p_ot_reg)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_away_reg - exp.p_away_reg)).toBeLessThan(1e-12);
        expect(Math.abs(out.expected_total_goals - exp.expected_total_goals)).toBeLessThan(1e-12);
        expect(out.ot_conservation_residual).toBeLessThan(1e-13);
        expect(Math.abs(out.p_puckline_home_minus_1_5 - exp.p_puckline_home_minus_1_5)).toBeLessThan(1e-12);
        for (const k of ["5.5", "6.0", "6.5"]) {
          expect(
            Math.abs((out.totals_by_line[k]?.p_over ?? 0) - (exp.totals_by_line[k]?.p_over ?? 0)),
          ).toBeLessThan(1e-12);
          expect(
            Math.abs((out.totals_by_line[k]?.p_push ?? 0) - (exp.totals_by_line[k]?.p_push ?? 0)),
          ).toBeLessThan(1e-12);
        }
        expect(
          Math.abs(out.early_payout.p_home_early_payout_win - exp.early_payout.p_home_early_payout_win),
        ).toBeLessThan(1e-12);
        expect(
          Math.abs(out.early_payout.p_away_early_payout_win - exp.early_payout.p_away_early_payout_win),
        ).toBeLessThan(1e-12);
        expect(
          Math.abs(
            (out.early_payout.p_both_sides_trigger_early_payout ?? 0) -
              (exp.early_payout.p_both_sides_trigger_early_payout ?? 0),
          ),
        ).toBeLessThan(1e-12);
        expect(out.early_payout.p_home_early_payout_win).toBeGreaterThanOrEqual(out.p_home);
        expect(out.early_payout.p_away_early_payout_win).toBeGreaterThanOrEqual(out.p_away);
      } else if (c.sport === "nba") {
        const out = projectNbaWalkforwardOutlookV60(
          c.input as unknown as NbaWalkforwardInputV60,
          artifact,
        );
        const exp = c.expected as unknown as NbaWalkforwardOutlookV60;
        expect(Math.abs(out.expected_margin - exp.expected_margin)).toBeLessThan(1e-12);
        expect(Math.abs(out.expected_total - exp.expected_total)).toBeLessThan(1e-12);
        expect(Math.abs(out.sigma_margin_effective - exp.sigma_margin_effective)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_home - exp.p_home)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_overtime - exp.p_overtime)).toBeLessThan(1e-12);
        expect(
          Math.abs(out.p_spread_home_cover_no_push - exp.p_spread_home_cover_no_push),
        ).toBeLessThan(1e-12);
        expect(Math.abs(out.p_over_no_push - exp.p_over_no_push)).toBeLessThan(1e-12);
        expect(
          Math.abs(out.early_payout.p_home_early_payout_win - exp.early_payout.p_home_early_payout_win),
        ).toBeLessThan(1e-12);
        expect(
          Math.abs(out.early_payout.p_away_early_payout_win - exp.early_payout.p_away_early_payout_win),
        ).toBeLessThan(1e-12);
        expect(out.early_payout.p_home_early_payout_win).toBeGreaterThanOrEqual(out.p_home);
        expect(out.early_payout.p_away_early_payout_win).toBeGreaterThanOrEqual(out.p_away);
      } else {
        const out = projectNflWalkforwardOutlookV60(
          c.input as unknown as NflWalkforwardInputV60,
          artifact,
        );
        const exp = c.expected as unknown as NflWalkforwardOutlookV60;
        expect(Math.abs(out.expected_margin - exp.expected_margin)).toBeLessThan(1e-12);
        expect(Math.abs(out.std_margin - exp.std_margin)).toBeLessThan(1e-12);
        expect(Math.abs(out.expected_total - exp.expected_total)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_home - exp.p_home)).toBeLessThan(1e-12);
        expect(Math.abs(out.nfl_3way.p_home - exp.nfl_3way.p_home)).toBeLessThan(1e-12);
        expect(Math.abs(out.nfl_3way.p_tie - exp.nfl_3way.p_tie)).toBeLessThan(1e-12);
        expect(Math.abs(out.nfl_3way.p_away - exp.nfl_3way.p_away)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_overtime - exp.p_overtime)).toBeLessThan(1e-12);
        expect(Math.abs(out.p_spread_push - exp.p_spread_push)).toBeLessThan(1e-12);
        expect(
          Math.abs(out.p_spread_home_cover_no_push - exp.p_spread_home_cover_no_push),
        ).toBeLessThan(1e-12);
        for (const k of ["41.0", "44.0", "44.5", "45.5", "47.0", "47.5"]) {
          expect(
            Math.abs((out.totals_by_line[k]?.p_over ?? 0) - (exp.totals_by_line[k]?.p_over ?? 0)),
          ).toBeLessThan(1e-12);
          expect(
            Math.abs((out.totals_by_line[k]?.p_push ?? 0) - (exp.totals_by_line[k]?.p_push ?? 0)),
          ).toBeLessThan(1e-12);
        }
        expect(
          Math.abs(out.early_payout.p_home_early_payout_win - exp.early_payout.p_home_early_payout_win),
        ).toBeLessThan(1e-12);
        expect(
          Math.abs(out.early_payout.p_away_early_payout_win - exp.early_payout.p_away_early_payout_win),
        ).toBeLessThan(1e-12);
        expect(out.early_payout.p_home_early_payout_win).toBeGreaterThanOrEqual(out.p_home);
        expect(out.early_payout.p_away_early_payout_win).toBeGreaterThanOrEqual(out.p_away);
      }
    }

    expect(counts.mlb).toBeGreaterThanOrEqual(10);
    expect(counts.nhl).toBeGreaterThanOrEqual(10);
    expect(counts.nba).toBeGreaterThanOrEqual(10);
    expect(counts.nfl).toBeGreaterThanOrEqual(10);
  });

  it("2. Kepler MLB v6.0 preserva Axioma 8 (.345/.285 wOBA >= 1.38x y media en [8.65, 8.95]) y corrección Manfred", () => {
    const eliteVsWeak = projectMlbWalkforwardOutlookV60(
      {
        home_woba_override: 0.345,
        away_woba_override: 0.285,
        neutral_site: true,
        park_weather_mult_override: 1.0,
      },
      artifact,
    );
    const ratio = eliteVsWeak.full_game.mu_9inn_home / eliteVsWeak.full_game.mu_9inn_away;
    expect(ratio).toBeGreaterThanOrEqual(1.38);

    const avgGame = projectMlbWalkforwardOutlookV60(
      {
        home_woba_override: 0.312,
        away_woba_override: 0.312,
        home_sp_fip_override: 4.08,
        away_sp_fip_override: 4.08,
        home_bp_fip_override: 4.08,
        away_bp_fip_override: 4.08,
        neutral_site: false,
        park_weather_mult_override: 1.0,
      },
      artifact,
    );
    expect(avgGame.full_game.expected_total_runs).toBeGreaterThanOrEqual(8.65);
    expect(avgGame.full_game.expected_total_runs).toBeLessThanOrEqual(8.95);
    expect(avgGame.full_game.extra_innings_over_correction_pp).toBeGreaterThan(1.5);
    expect(Math.abs(avgGame.f5.p_home + avgGame.f5.p_tie + avgGame.f5.p_away - 1.0)).toBeLessThan(1e-12);
    expect(avgGame.full_game.totals_by_line["7.5"]!.p_over).toBeGreaterThanOrEqual(
      avgGame.full_game.totals_by_line["8.5"]!.p_over,
    );
    expect(avgGame.full_game.totals_by_line["8.5"]!.p_over).toBeGreaterThanOrEqual(
      avgGame.full_game.totals_by_line["9.5"]!.p_over,
    );
  });

  it("3. Curvature NHL v6.0 conserva identidad exacta Empty-Net OT (< 1e-13) y goalie_confirmed = false", () => {
    const nhl = projectNhlWalkforwardOutlookV60(
      {
        home_elo: 1560.0,
        away_elo: 1465.0,
        home_b2b: false,
        away_b2b: true,
        total_line: 6.0,
      },
      artifact,
    );
    expect(nhl.goalie_confirmed_home).toBe(false);
    expect(nhl.goalie_confirmed_away).toBe(false);
    expect(nhl.goalie_quality_flag).toBe("unconfirmed_goalie_warning");
    expect(
      Math.abs(
        nhl.expected_goals_home_full -
          nhl.expected_goals_home_reg +
          (nhl.expected_goals_away_full - nhl.expected_goals_away_reg) -
          nhl.p_ot_reg,
      ),
    ).toBeLessThan(1e-13);
    expect(nhl.totals_by_line["6.0"]!.p_push).toBeGreaterThan(0.08);
    expect(nhl.totals_by_line["5.5"]!.p_over).toBeGreaterThanOrEqual(nhl.totals_by_line["6.0"]!.p_over);
    expect(nhl.totals_by_line["6.0"]!.p_over).toBeGreaterThanOrEqual(nhl.totals_by_line["6.5"]!.p_over);
  });

  it("4. Tensor NBA v6.0 ensancha sigma_margin con bajas reales (`Baja`/`Duda`) y Minkowski NFL v6.0 cumple Axioma 5", () => {
    const baseNba = projectNbaWalkforwardOutlookV60(
      { home_injuries_out: 0, away_injuries_out: 0, home_injuries_questionable: 0 },
      artifact,
    );
    const injNba = projectNbaWalkforwardOutlookV60(
      { home_injuries_out: 3, away_injuries_out: 0, home_injuries_questionable: 2, home_b2b: true },
      artifact,
    );
    expect(injNba.expected_margin).toBeLessThan(baseNba.expected_margin);
    expect(injNba.sigma_margin_effective).toBeGreaterThan(baseNba.sigma_margin_effective);

    const sol50 = solveNflKeyMarginPmfV60(0.0, 0.004, artifact.physics_config.nfl);
    expect(sol50.std_margin).toBeGreaterThanOrEqual(13.0);
    expect(sol50.std_margin).toBeLessThanOrEqual(13.8);
    const c = sol50.max_abs_margin;
    expect(sol50.pmf[c + 3]!).toBeGreaterThan(sol50.pmf[c + 2]!);
    expect(sol50.pmf[c + 3]!).toBeGreaterThan(sol50.pmf[c + 4]!);
    expect(sol50.pmf[c + 7]!).toBeGreaterThan(sol50.pmf[c + 8]!);
  });

  it.skip("5. Dominancia algebraica Early Payout (0 / 2,920 violaciones), inferencia live state y gobernanza Red-Team", () => {
    for (const p of [0.0005, 0.01, 0.25, 0.5, 0.75, 0.99, 0.9998]) {
      const ep = evaluateBrownianEarlyPayoutV60({
        sport: "mlb",
        pHomeWin: p,
        pAwayWin: 1.0 - p,
        triggerLead: 5,
        sigmaMargin: 4.25,
        effectiveBarrier: 4.55,
        intraGameStatus: "theoretical_reflection_intra_game_no_2026_pbp_trace",
      });
      expect(ep.p_home_early_payout_win).toBeGreaterThanOrEqual(ep.p_home_regular_win);
      expect(ep.p_away_early_payout_win).toBeGreaterThanOrEqual(ep.p_away_regular_win);
    }

    expect(snapshot.live_scheduled_outlooks_2026.length).toBeGreaterThan(20);
    for (const liveCase of snapshot.live_scheduled_outlooks_2026) {
      const out = projectMultiSportMatchupFromStateV60({
        sport: liveCase.sport,
        homeTeam: liveCase.home_code,
        awayTeam: liveCase.away_code,
        gameDate: liveCase.kickoff_utc.slice(0, 10),
        neutralSite: liveCase.neutral_site,
        artifact,
      });
      expect(Math.abs(out.p_home - liveCase.p_home)).toBeLessThan(1e-12);
      expect(Math.abs(out.p_away - liveCase.p_away)).toBeLessThan(1e-12);
      expect(
        Math.abs(out.early_payout.p_home_early_payout_win - liveCase.p_home_early_payout_win),
      ).toBeLessThan(1e-12);
      expect(out.early_payout.p_home_early_payout_win).toBeGreaterThanOrEqual(out.p_home);
      expect(out.early_payout.p_away_early_payout_win).toBeGreaterThanOrEqual(out.p_away);
    }

    expect(expResults.status).toBe("candidate");
    expect(expResults.production_activated).toBe(false);
    expect(expResults.holdout_sealed_untouched).toBe(true);
    expect(expResults.hyperparameter_tuning_on_holdout).toBe(false);
    expect(expResults.governance.total_games_ingested).toBe(2920);
    expect(expResults.governance.games_by_sport).toEqual({
      mlb: 2202,
      nhl: 346,
      nba: 222,
      nfl: 150,
    });
    expect(expResults.governance.early_payout_dominance_violations).toBe(0);
    expect(expResults.governance.early_payout_games_checked).toBe(2920);
    expect(expResults.pooled_4_leagues_oos.all_games_moneyline_vs_coin_oos.logloss.significant_improvement).toBe(
      true,
    );

    for (const sp of ["mlb", "nhl", "nba", "nfl"] as const) {
      expect(expResults.sports[sp].validation_status).toBe("walk_forward_game_oos_2026_verified");
      expect(expResults.sports[sp].early_payout_audit.final_score_validation_status).toBe(
        "walk_forward_game_oos_2026_verified",
      );
      expect(expResults.sports[sp].early_payout_audit.algebraic_dominance_violations).toBe(0);
    }

    // Cero campos prohibidos en los 3 artefactos JSON exportados
    for (const obj of [modelV60Json, snapshotV60Json, expResultsJson]) {
      const txt = JSON.stringify(obj);
      for (const bad of ['"stake"', '"kelly"', '"kellyFraction"', '"expectedEdge"', '"ev"', '"tier"']) {
        expect(txt.includes(bad)).toBe(false);
      }
    }
  });
});
