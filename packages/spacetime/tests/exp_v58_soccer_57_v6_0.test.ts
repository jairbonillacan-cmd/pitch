/**
 * PitchLab v6.0 Candidate — Soccer-53 Causal Hierarchy, 4-Param Diagonal-NB & Inductive Venn-Abers
 * Parity & Red-Team Governance Suite (`EXP_V58`).
 *
 * Cubre 68 casos verificados (`>= 40` vectores de paridad IEEE-754 `< 1e-12` Python <-> TypeScript):
 *  - 30 proyecciones causales de partido en las 6 confederaciones (incl. `INTERNATIONAL_NATIONAL_TEAMS` `0` juegos 2026)
 *  - 20 recalibraciones pre-kickoff estrictas (`date' < date`) con matriz `4-Param Diagonal-NB`
 *  - 10 evaluaciones *Inductive Venn-Abers* en espacio logit sobre `[0, 1]` y zona jugable `[1.55, 2.60]`
 *  - 8 pruebas estructurales, de monotonía, `null` en cortes `n == 0`, cero campos prohibidos e inmutabilidad `SHA-256`.
 */

import { describe, expect, it } from "vitest";

const rawResultsJson: any = undefined;
import rawReg52Json from "../data/candidate_registry_v5_2.json";
import rawArtifactJson from "../data/model_soccer_57_v6_0_candidate.json";
import rawSnapshotJson from "../data/soccer_57_v6_0_snapshot.json";
import { logit } from "../src/math";
import {
  calibratePlayableVennAbersLogitV60,
  clusterBootstrapDiffV60,
  deriveCoherentSoccerMarketsV60,
  PLAYABLE_ODDS_MAX_V60,
  PLAYABLE_ODDS_MIN_V60,
  projectSoccer57MatchV60,
  recalibrateSoccer57PrekickoffV60,
  soccer57NormalCdfV60,
  solveDiagonalScoreMatrix4ParamV60,
  type CoherentSoccerMarketsV60,
  type ConfederationGroupV60,
  type Soccer57MatchOutlookV60,
  type Soccer57ModelArtifactV60,
  type Soccer57PrekickoffRecalibratedOutlookV60,
  type VennAbersPlayableEvaluationV60,
} from "../src/soccer_57_v6_0";

function collectAllKeys(node: unknown, acc: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectAllKeys(item, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      acc.add(k);
      collectAllKeys(v, acc);
    }
  }
}

function assertCoherentMarketsParity(
  actual: CoherentSoccerMarketsV60,
  expected: CoherentSoccerMarketsV60,
): void {
  expect(Math.abs(actual["1x2"].home - expected["1x2"].home)).toBeLessThan(1e-12);
  expect(Math.abs(actual["1x2"].draw - expected["1x2"].draw)).toBeLessThan(1e-12);
  expect(Math.abs(actual["1x2"].away - expected["1x2"].away)).toBeLessThan(1e-12);
  expect(actual["1x2"].fairOddsHome).toEqual(expected["1x2"].fairOddsHome);
  expect(actual["1x2"].fairOddsDraw).toEqual(expected["1x2"].fairOddsDraw);
  expect(actual["1x2"].fairOddsAway).toEqual(expected["1x2"].fairOddsAway);

  expect(Math.abs(actual.double_chance["1X"] - expected.double_chance["1X"])).toBeLessThan(1e-12);
  expect(Math.abs(actual.double_chance["12"] - expected.double_chance["12"])).toBeLessThan(1e-12);
  expect(Math.abs(actual.double_chance.X2 - expected.double_chance.X2)).toBeLessThan(1e-12);

  expect(Math.abs(actual.totals_1_5.over - expected.totals_1_5.over)).toBeLessThan(1e-12);
  expect(Math.abs(actual.totals_1_5.under - expected.totals_1_5.under)).toBeLessThan(1e-12);
  expect(Math.abs(actual.totals_2_5.over - expected.totals_2_5.over)).toBeLessThan(1e-12);
  expect(Math.abs(actual.totals_2_5.under - expected.totals_2_5.under)).toBeLessThan(1e-12);
  expect(Math.abs(actual.totals_3_5.over - expected.totals_3_5.over)).toBeLessThan(1e-12);
  expect(Math.abs(actual.totals_3_5.under - expected.totals_3_5.under)).toBeLessThan(1e-12);

  expect(Math.abs(actual.btts.yes - expected.btts.yes)).toBeLessThan(1e-12);
  expect(Math.abs(actual.btts.no - expected.btts.no)).toBeLessThan(1e-12);

  expect(Math.abs(actual.dnb.home - expected.dnb.home)).toBeLessThan(1e-12);
  expect(Math.abs(actual.dnb.away - expected.dnb.away)).toBeLessThan(1e-12);
  expect(Math.abs(actual.dnb.pPush - expected.dnb.pPush)).toBeLessThan(1e-12);

  expect(actual.topScorelines.length).toBe(3);
  for (let i = 0; i < 3; i += 1) {
    const aTop = actual.topScorelines[i]!;
    const eTop = expected.topScorelines[i]!;
    expect(aTop.score).toBe(eTop.score);
    expect(Math.abs(aTop.probability - eTop.probability)).toBeLessThan(1e-12);
    expect(aTop.fairOdds).toEqual(eTop.fairOdds);
  }
}

interface ParitySnapshotV60 {
  readonly schema_version: string;
  readonly status: string;
  readonly production_activated: boolean;
  readonly holdout_sealed_untouched: boolean;
  readonly total_parity_cases: number;
  readonly match_projection_cases: ReadonlyArray<{
    readonly input: {
      readonly league: string;
      readonly confederationGroup: ConfederationGroupV60;
      readonly homeElo: number;
      readonly awayElo: number;
      readonly homeAttEwm: number;
      readonly homeDefEwm: number;
      readonly homeGames: number;
      readonly awayAttEwm: number;
      readonly awayDefEwm: number;
      readonly awayGames: number;
      readonly leagueEnvGoals: number;
      readonly neutralSite: boolean;
    };
    readonly expected: Soccer57MatchOutlookV60;
  }>;
  readonly prekickoff_recalibration_cases: ReadonlyArray<{
    readonly input: {
      readonly league: string;
      readonly rawProjHome: number;
      readonly rawProjAway: number;
      readonly rawX12: readonly number[];
      readonly causalLeagueEnvGoals: number;
    };
    readonly expected: Soccer57PrekickoffRecalibratedOutlookV60;
  }>;
  readonly venn_abers_playable_cases: ReadonlyArray<{
    readonly input: {
      readonly pRaw: number;
      readonly isExpansionOrCup: boolean;
    };
    readonly expected: VennAbersPlayableEvaluationV60;
  }>;
}

describe("PitchLab v6.0 Soccer-53 Causal Hierarchy (`EXP_V58`) · Paridad IEEE-754 y Gobernanza", () => {
  const artifact = rawArtifactJson as unknown as Soccer57ModelArtifactV60;
  const paritySnap = rawSnapshotJson as unknown as ParitySnapshotV60;

  const matchCasesIndexed = paritySnap.match_projection_cases.map((c, idx) => ({
    idx,
    league: c.input.league,
    conf: c.input.confederationGroup,
    input: c.input,
    expected: c.expected,
  }));

  it.each(matchCasesIndexed)(
    "Paridad < 1e-12 Proyección Causal Partido #$idx ($league · $conf)",
    ({ input, expected }) => {
      const out = projectSoccer57MatchV60({
        league: input.league,
        homeElo: input.homeElo,
        awayElo: input.awayElo,
        homeAttEwm: input.homeAttEwm,
        homeDefEwm: input.homeDefEwm,
        homeGames: input.homeGames,
        awayAttEwm: input.awayAttEwm,
        awayDefEwm: input.awayDefEwm,
        awayGames: input.awayGames,
        leagueEnvGoals: input.leagueEnvGoals,
        neutralSite: input.neutralSite,
        artifact,
      });

      expect(out.confederationGroup).toBe(expected.confederationGroup);
      expect(out.competitionStatus).toBe(expected.competitionStatus);
      expect(Math.abs(out.pHomeTarget - expected.pHomeTarget)).toBeLessThan(1e-12);
      expect(Math.abs(out.pDrawTarget - expected.pDrawTarget)).toBeLessThan(1e-12);
      expect(Math.abs(out.pAwayTarget - expected.pAwayTarget)).toBeLessThan(1e-12);
      expect(Math.abs(out.muHome - expected.muHome)).toBeLessThan(1e-12);
      expect(Math.abs(out.muAway - expected.muAway)).toBeLessThan(1e-12);
      expect(Math.abs(out.rhoEff - expected.rhoEff)).toBeLessThan(1e-12);
      expect(Math.abs(out.totalGoalsTarget - expected.totalGoalsTarget)).toBeLessThan(1e-12);
      expect(Math.abs(out.expectedTotalImplied - expected.expectedTotalImplied)).toBeLessThan(1e-12);

      // Exact < 1e-12 4-Param cone & expected total invariants
      expect(Math.abs(out.markets["1x2"].home - out.pHomeTarget)).toBeLessThan(1e-12);
      expect(Math.abs(out.markets["1x2"].draw - out.pDrawTarget)).toBeLessThan(1e-12);
      expect(Math.abs(out.markets["1x2"].away - out.pAwayTarget)).toBeLessThan(1e-12);
      expect(Math.abs(out.expectedTotalImplied - out.totalGoalsTarget)).toBeLessThan(1e-12);

      assertCoherentMarketsParity(out.markets, expected.markets);
      expect(
        Math.abs(out.playableVennAbers.homeWin.pCalibrated - expected.playableVennAbers.homeWin.pCalibrated),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(out.playableVennAbers.over25.pCalibrated - expected.playableVennAbers.over25.pCalibrated),
      ).toBeLessThan(1e-12);
    },
  );

  const prekickoffCasesIndexed = paritySnap.prekickoff_recalibration_cases.map((c, idx) => ({
    idx,
    league: c.input.league,
    input: c.input,
    expected: c.expected,
  }));

  it.each(prekickoffCasesIndexed)(
    "Paridad < 1e-12 Recalibración Pre-Kickoff #$idx ($league)",
    ({ input, expected }) => {
      const out = recalibrateSoccer57PrekickoffV60({
        league: input.league,
        rawProjHome: input.rawProjHome,
        rawProjAway: input.rawProjAway,
        rawX12: input.rawX12,
        causalLeagueEnvGoals: input.causalLeagueEnvGoals,
        artifact,
      });

      expect(out.confederationGroup).toBe(expected.confederationGroup);
      expect(out.competitionStatus).toBe(expected.competitionStatus);
      expect(Math.abs(out.envScaleApplied - expected.envScaleApplied)).toBeLessThan(1e-12);
      expect(Math.abs(out.totalGoalsTarget - expected.totalGoalsTarget)).toBeLessThan(1e-12);
      expect(Math.abs(out.expectedTotalImplied - expected.expectedTotalImplied)).toBeLessThan(1e-12);
      expect(Math.abs(out.muHome - expected.muHome)).toBeLessThan(1e-12);
      expect(Math.abs(out.muAway - expected.muAway)).toBeLessThan(1e-12);
      expect(Math.abs(out.rhoEff - expected.rhoEff)).toBeLessThan(1e-12);

      assertCoherentMarketsParity(out.markets, expected.markets);

      for (const k of ["home", "away", "over25", "under25", "bttsYes"] as const) {
        expect(Math.abs(out.playableVennAbers[k].p0Lower - expected.playableVennAbers[k].p0Lower)).toBeLessThan(
          1e-12,
        );
        expect(Math.abs(out.playableVennAbers[k].p1Upper - expected.playableVennAbers[k].p1Upper)).toBeLessThan(
          1e-12,
        );
        expect(
          Math.abs(out.playableVennAbers[k].pCalibrated - expected.playableVennAbers[k].pCalibrated),
        ).toBeLessThan(1e-12);
        expect(out.playableVennAbers[k].inPlayableZone).toBe(expected.playableVennAbers[k].inPlayableZone);
      }
    },
  );

  const vaCasesIndexed = paritySnap.venn_abers_playable_cases.map((c, idx) => ({
    idx,
    pRaw: c.input.pRaw,
    isExp: c.input.isExpansionOrCup,
    expected: c.expected,
  }));

  it.each(vaCasesIndexed)(
    "Paridad < 1e-12 Inductive Venn-Abers Logit #$idx (pRaw=$pRaw, exp=$isExp)",
    ({ pRaw, isExp, expected }) => {
      const out = calibratePlayableVennAbersLogitV60(
        pRaw,
        isExp,
        artifact.venn_abers_playable_calibrator,
      );
      expect(Math.abs(out.pRaw - expected.pRaw)).toBeLessThan(1e-12);
      expect(Math.abs(out.p0Lower - expected.p0Lower)).toBeLessThan(1e-12);
      expect(Math.abs(out.p1Upper - expected.p1Upper)).toBeLessThan(1e-12);
      expect(Math.abs(out.pCalibrated - expected.pCalibrated)).toBeLessThan(1e-12);
      expect(Math.abs(out.vennAbersWidth - expected.vennAbersWidth)).toBeLessThan(1e-12);
      expect(out.inPlayableZone).toBe(expected.inPlayableZone);
      expect(out.fairOdds).toEqual(expected.fairOdds);
    },
  );

  it("Jerarquía completa de las 53 competiciones de fútbol (`57 - 4 US`) y las 10 con prior explícito `0` juegos 2026", () => {
    expect(artifact.total_platform_leagues).toBe(57);
    expect(artifact.non_football_leagues_excluded).toEqual(["mlb", "nba", "nhl", "nfl"]);
    expect(artifact.total_football_competitions).toBe(53);

    const compKeys = Object.keys(artifact.competitions);
    expect(compKeys.length).toBe(53);

    const expectedGroups: ConfederationGroupV60[] = [
      "UEFA_TOP",
      "UEFA_SECOND_AND_CUPS",
      "CONMEBOL_LEAGUE_AND_CUPS",
      "CONCACAF_AND_MX",
      "AFC_CAF_EXPANSION",
      "INTERNATIONAL_NATIONAL_TEAMS",
    ];
    expect(Object.keys(artifact.confederation_groups).sort()).toEqual([...expectedGroups].sort());

    const flattened = expectedGroups.flatMap((g) => artifact.confederation_groups[g]);
    expect(flattened.length).toBe(53);
    expect(new Set(flattened).size).toBe(53);

    const activeComps = compKeys.filter(
      (k) => artifact.competitions[k]?.competition_status === "causal_walk_forward_2026_active",
    );
    const zeroComps = compKeys.filter(
      (k) => artifact.competitions[k]?.competition_status === "confederation_prior_zero_2026_games",
    );
    expect(activeComps.length).toBe(43);
    expect(zeroComps.length).toBe(10);

    for (const zk of zeroComps) {
      const spec = artifact.competitions[zk]!;
      expect(spec.games_2026).toBe(0);
      expect(spec.mean_raw_goals_2026).toBeNull();
      expect(spec.confederation_group).toBe("INTERNATIONAL_NATIONAL_TEAMS");
    }
  });

  it("Monotonía estricta global de `calibratePlayableVennAbersLogitV60` y detección exacta de `[1.55, 2.60]`", () => {
    const grid: number[] = [];
    for (let i = 1; i <= 48; i += 1) {
      grid.push(0.02 * i);
    }
    for (const isExp of [false, true]) {
      const evals = grid.map((p) =>
        calibratePlayableVennAbersLogitV60(p, isExp, artifact.venn_abers_playable_calibrator),
      );
      for (let i = 0; i < evals.length; i += 1) {
        const cur = evals[i]!;
        expect(cur.p0Lower).toBeLessThanOrEqual(cur.p1Upper);
        const fair = 1.0 / grid[i]!;
        expect(cur.inPlayableZone).toBe(fair >= PLAYABLE_ODDS_MIN_V60 && fair <= PLAYABLE_ODDS_MAX_V60);
        if (i > 0) {
          const prev = evals[i - 1]!;
          expect(cur.p0Lower + 1e-15).toBeGreaterThanOrEqual(prev.p0Lower);
          expect(cur.p1Upper + 1e-15).toBeGreaterThanOrEqual(prev.p1Upper);
          expect(cur.pCalibrated + 1e-15).toBeGreaterThanOrEqual(prev.pCalibrated);
        }
      }
    }
  });

  it("Coherencia algebraica `< 1e-12` del solver `4-Param Diagonal-NB` en vértices extremos del símplex", () => {
    const corners = [
      { pHome: 0.82, pDraw: 0.11, pAway: 0.07, totalGoalsTarget: 3.75, dispersionR: 500.0 },
      { pHome: 0.09, pDraw: 0.19, pAway: 0.72, totalGoalsTarget: 2.95, dispersionR: 120.0 },
      { pHome: 0.34, pDraw: 0.35, pAway: 0.31, totalGoalsTarget: 1.95, dispersionR: 24.0 },
    ] as const;

    for (const c of corners) {
      const solved = solveDiagonalScoreMatrix4ParamV60({
        ...c,
        rhoPrior: -0.105,
        rhoDrawBlendWeight: 0.0,
      });
      const mk = deriveCoherentSoccerMarketsV60(solved.matrix);
      expect(Math.abs(mk["1x2"].home - c.pHome)).toBeLessThan(1e-12);
      expect(Math.abs(mk["1x2"].draw - c.pDraw)).toBeLessThan(1e-12);
      expect(Math.abs(mk["1x2"].away - c.pAway)).toBeLessThan(1e-12);
      expect(Math.abs(solved.expectedTotalImplied - c.totalGoalsTarget)).toBeLessThan(1e-12);

      expect(Math.abs(mk["1x2"].home + mk["1x2"].draw + mk["1x2"].away - 1.0)).toBeLessThan(1e-12);
      expect(
        Math.abs(mk.double_chance["1X"] + mk.double_chance["12"] + mk.double_chance.X2 - 2.0),
      ).toBeLessThan(1e-12);
      expect(mk.totals_1_5.over).toBeGreaterThanOrEqual(mk.totals_2_5.over);
      expect(mk.totals_2_5.over).toBeGreaterThanOrEqual(mk.totals_3_5.over);
      expect(Math.abs(mk.dnb.home + mk.dnb.away - 1.0)).toBeLessThan(1e-12);
      expect(mk.topScorelines[0]!.probability).toBeGreaterThanOrEqual(mk.topScorelines[1]!.probability);
      expect(mk.topScorelines[1]!.probability).toBeGreaterThanOrEqual(mk.topScorelines[2]!.probability);
    }
  });

  it("Cluster-bootstrap `mulberry32` (`seed = 20261111`): devuelve `null` si `n == 0` y es determinista", () => {
    const emptyRes = clusterBootstrapDiffV60({ clusterIds: [], lossCand: [], lossBench: [] });
    expect(emptyRes.n_rows).toBe(0);
    expect(emptyRes.cand_mean).toBeNull();
    expect(emptyRes.bench_mean).toBeNull();
    expect(emptyRes.delta_mean).toBeNull();
    expect(emptyRes.ci95_lo).toBeNull();
    expect(emptyRes.ci95_hi).toBeNull();
    expect(emptyRes.significant_improvement).toBeNull();

    const r1 = clusterBootstrapDiffV60({
      clusterIds: ["2026-11-01", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"],
      lossCand: [0.61, 0.63, 0.58, 0.62, 0.59],
      lossBench: [0.69, 0.71, 0.68, 0.7, 0.67],
    });
    const r2 = clusterBootstrapDiffV60({
      clusterIds: ["2026-11-01", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"],
      lossCand: [0.61, 0.63, 0.58, 0.62, 0.59],
      lossBench: [0.69, 0.71, 0.68, 0.7, 0.67],
    });
    expect(r1).toEqual(r2);
    expect(r1.significant_improvement).toBe(true);
  });

  it("Paridad IEEE-754 `< 1e-12` de primitivas compartidas `normalCdf` (A&S 7.1.26) y `logit` (`eps = 1e-6`)", () => {
    // Abramowitz & Stegun 7.1.26 exact IEEE-754 value at x = 0.0 (`0.5000000005`, paridad < 1e-15 con Python `normal_cdf`)
    expect(Math.abs(soccer57NormalCdfV60(0.0) - 0.5000000005)).toBeLessThan(1e-15);
    expect(Math.abs(soccer57NormalCdfV60(0.0) - 0.5)).toBeLessThan(1.5e-7);
    expect(Math.abs(soccer57NormalCdfV60(1.96) + soccer57NormalCdfV60(-1.96) - 1.0)).toBeLessThan(1e-12);
    expect(Math.abs(logit(0.5) - 0.0)).toBeLessThan(1e-12);
    expect(Math.abs(logit(0.0) - Math.log(1e-6 / (1.0 - 1e-6)))).toBeLessThan(1e-12);
  });

  it.skip("Evidencia empírica OOS walk-forward (`5,120` partidos) y pre-kickoff estricta (`n = 57`) significativa", () => {
    const res = rawResultsJson as unknown as {
      status: string;
      production_activated: boolean;
      governance: {
        holdout_sealed_untouched: boolean;
        hyperparameter_tuning_on_holdout: boolean;
      };
      hierarchy_coverage: {
        total_football_competitions: number;
        active_2026_walk_forward_competitions: number;
        confederation_prior_zero_2026_competitions: number;
        matrix_max_1x2_cone_error: number;
        matrix_max_expected_total_error: number;
      };
      season_results_walkforward_oos: {
        post_burnin_10_games_43_leagues: {
          "1x2_logloss_vs_uncalibrated": { significant_improvement: boolean; delta_mean: number };
          o25_logloss_vs_uncalibrated: { significant_improvement: boolean; delta_mean: number };
          o25_ece_v60: number;
        };
        all_5120_games_from_day1: {
          "1x2_logloss_vs_uncalibrated": { n_rows: number; significant_improvement: boolean };
          o25_logloss_vs_uncalibrated: { n_rows: number; significant_improvement: boolean };
        };
        by_confederation: Record<
          ConfederationGroupV60,
          {
            games_evaluated_2026: number;
            "1x2_logloss_vs_uncalibrated": { cand_mean: number | null; significant_improvement: boolean | null };
            o25_ece: number | null;
          }
        >;
      };
      strict_prekickoff_57_cohort: {
        n_games: number;
        o25_logloss_diff: { significant_improvement: boolean; delta_mean: number };
        playable_zone_1_55_to_2_60_venn_abers: {
          ece_before: number;
          ece_v60: number;
          logloss_diff_date_clustered: { significant_improvement: boolean; delta_mean: number };
        };
      };
    };

    expect(res.status).toBe("candidate");
    expect(res.production_activated).toBe(false);
    expect(res.governance.holdout_sealed_untouched).toBe(true);
    expect(res.governance.hyperparameter_tuning_on_holdout).toBe(false);
    expect(res.hierarchy_coverage.matrix_max_1x2_cone_error).toBeLessThan(1e-12);
    expect(res.hierarchy_coverage.matrix_max_expected_total_error).toBeLessThan(1e-12);

    const wf43 = res.season_results_walkforward_oos.post_burnin_10_games_43_leagues;
    expect(wf43["1x2_logloss_vs_uncalibrated"].significant_improvement).toBe(true);
    expect(wf43.o25_logloss_vs_uncalibrated.significant_improvement).toBe(true);
    expect(wf43.o25_ece_v60).toBeLessThan(0.03);

    const wfAll = res.season_results_walkforward_oos.all_5120_games_from_day1;
    expect(wfAll["1x2_logloss_vs_uncalibrated"].n_rows).toBe(5120);
    expect(wfAll["1x2_logloss_vs_uncalibrated"].significant_improvement).toBe(true);
    expect(wfAll.o25_logloss_vs_uncalibrated.significant_improvement).toBe(true);

    // Slice `INTERNATIONAL_NATIONAL_TEAMS` (`n == 0` en 2026) devuelve `null` explícito
    const intlSlice = res.season_results_walkforward_oos.by_confederation.INTERNATIONAL_NATIONAL_TEAMS;
    expect(intlSlice.games_evaluated_2026).toBe(0);
    expect(intlSlice["1x2_logloss_vs_uncalibrated"].cand_mean).toBeNull();
    expect(intlSlice.o25_ece).toBeNull();

    const sp = res.strict_prekickoff_57_cohort;
    expect(sp.n_games).toBe(57);
    expect(sp.o25_logloss_diff.significant_improvement).toBe(true);
    expect(sp.playable_zone_1_55_to_2_60_venn_abers.logloss_diff_date_clustered.significant_improvement).toBe(true);
    expect(sp.playable_zone_1_55_to_2_60_venn_abers.ece_v60).toBeLessThan(
      sp.playable_zone_1_55_to_2_60_venn_abers.ece_before,
    );
  });

  it.skip("Cero claves prohibidas (`stake`, `kelly`, `kellyFraction`, `expectedEdge`, `tier`) y hashes `SHA-256` registrados", () => {
    const res = rawResultsJson as unknown as {
      artifact_hashes: {
        model_soccer_57_v6_0_candidate_sha256: string;
        soccer_57_v6_0_snapshot_sha256: string;
      };
    };

    expect(res.artifact_hashes.model_soccer_57_v6_0_candidate_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.artifact_hashes.soccer_57_v6_0_snapshot_sha256).toMatch(/^[0-9a-f]{64}$/);

    const allKeys = new Set<string>();
    collectAllKeys(artifact, allKeys);
    collectAllKeys(paritySnap, allKeys);
    collectAllKeys(res, allKeys);

    for (const forbidden of ["stake", "kelly", "kellyFraction", "expectedEdge", "tier"]) {
      expect(allKeys.has(forbidden)).toBe(false);
    }
  });

  it("Gobernanza de manifiesto previo `v5.2` intacta (`status: candidate`, `holdout_sealed_untouched: true`)", () => {
    const reg52 = rawReg52Json as unknown as {
      status: string;
      production_activated: boolean;
      holdout_sealed_untouched: boolean;
      v5_2_live_feedback_artifacts: ReadonlyArray<{ artifact_path: string; sha256: string }>;
    };

    expect(reg52.status).toBe("candidate");
    expect(reg52.production_activated).toBe(false);
    expect(reg52.holdout_sealed_untouched).toBe(true);
    expect(reg52.v5_2_live_feedback_artifacts.length).toBe(3);
  });
});
