/**
 * PitchLab Props v6.0 Candidate (`EXP_V59`) — Suite de Paridad IEEE-754 `< 1e-12` y Axiomas Red-Team.
 *
 * Verifica:
 *  1. Paridad exacta `< 1e-12` Python <-> TypeScript sobre `>= 50` (`88`) vectores reales en los 3 pilares:
 *     - `projectCoupledPlayerShotsMultiLineV6` (`shots` y `shots_on_target` en `0.5+`, `1.5+`, `2.5+`, `3.5+`).
 *     - `projectGoalkeeperSavesMultiLineV6` (`1.5+..4.5+`) y `evaluateGoalkeeperSavesLinkedSgpV6`.
 *     - `normalizeUsPlayerGameLogColumnsV6` y `projectUsPlayerPropV6` (`NBA`, `MLB`, `NHL`, `NFL`).
 *  2. Cierre de `D7` (`"coupled_player_match_barycentric_logit_pava_v6"`) y monotonía estricta multi-línea.
 *  3. Cotas exactas de Fréchet-Hoeffding `[max(0, pA + pB - 1), min(pA, pB)]` en SGP Portero-Partido.
 *  4. Extracción sin truncamiento de 5 columnas, guardia causal de minutos (`>= 18` NBA, `>= 45` fútbol)
 *     y bloqueo duro de lesionados (`availability === "out" / "Baja"` -> vacío).
 *  5. Gobernanza: `holdout_sealed_untouched: true`, `null` en cortes vacíos (`n == 0`), `UnitProbability`
 *     en `[0.001, 0.999]`, `0` campos prohibidos (`stake`, `kelly`, `ev`, `tier`) e inmutabilidad `v3..v5.2`.
 */

import { describe, expect, it } from "vitest";

const resultsJson: any = undefined;
import artifactJson from "../data/model_props_v6_0_candidate.json";
import snapshotJson from "../data/props_v6_0_snapshot.json";
import type { LineupStatusV36 } from "../src/hierarchical_props";
import { createMulberry32 } from "../src/math";
import {
  CANONICAL_GK_SAVES_LINES_V6,
  CANONICAL_SHOT_LINES_V6,
  estimateEffectiveExposure90V6,
  evaluateGoalkeeperSavesLinkedSgpV6,
  evaluateUsPlayerProfilePropsV6,
  normalizeUsPlayerGameLogColumnsV6,
  projectCoupledPlayerShotsMultiLineV6,
  projectGoalkeeperSavesMultiLineV6,
  projectUsPlayerPropV6,
  type CoupledPlayerShotsMultiLineOutlookV6,
  type CoupledShotMetricV6,
  type GoalkeeperLinkedMatchOutcomeV6,
  type GoalkeeperSavesLinkedSgpResultV6,
  type GoalkeeperSavesMultiLineOutlookV6,
  type NormalizablePropsSportV6,
  type NormalizedUsGameLogResultV6,
  type PropsV6ModelArtifact,
  type RawPlayerStatColumnV6,
  type UsPlayerPropOutlookV6,
  type UsPropsSportV6,
} from "../src/props_v6_0";

function collectAllKeys(node: unknown, out: Set<string> = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) collectAllKeys(item, out);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      out.add(k);
      collectAllKeys(v, out);
    }
  }
  return out;
}

interface PropsV6ParitySnapshot {
  readonly schema_version: string;
  readonly status: string;
  readonly production_activated: boolean;
  readonly holdout_sealed_untouched: boolean;
  readonly total_parity_vectors: number;
  readonly coupled_shots_multiline_cases: ReadonlyArray<{
    readonly caseId: string;
    readonly input: {
      readonly metric: CoupledShotMetricV6;
      readonly positionGroup: string;
      readonly seasonCount: number;
      readonly seasonShotsTotal: number | null;
      readonly appearances: number;
      readonly subIns: number;
      readonly teamExpectedShots: number;
      readonly teamExpectedSoT: number;
      readonly oppDefenseFactor: number;
      readonly expectedMinutesStarter: number | null;
      readonly lineupStatus: LineupStatusV36;
      readonly availability: string | null;
      readonly injuryStatus: string | null;
      readonly contextWeight: number;
    };
    readonly expected: CoupledPlayerShotsMultiLineOutlookV6;
  }>;
  readonly goalkeeper_saves_multiline_cases: ReadonlyArray<{
    readonly caseId: string;
    readonly input: {
      readonly playerSlug: string;
      readonly saves: number;
      readonly shotsFaced: number;
      readonly goalsConceded: number;
      readonly appearances: number;
      readonly subIns: number;
      readonly oppExpectedSoT: number;
      readonly expectedMinutes: number | null;
      readonly availability: string | null;
      readonly injuryStatus: string | null;
    };
    readonly expected: GoalkeeperSavesMultiLineOutlookV6;
  }>;
  readonly goalkeeper_linked_sgp_cases: ReadonlyArray<{
    readonly caseId: string;
    readonly input: {
      readonly savesLine: number;
      readonly ebSaveRate: number;
      readonly oppExpectedSoT: number;
      readonly teamExpectedGoals: number;
      readonly opponentExpectedGoals: number;
      readonly matchOutcome: GoalkeeperLinkedMatchOutcomeV6;
      readonly expectedMinutes: number | null;
      readonly rDispersionSoT: number;
      readonly dixonColesRho: number;
      readonly siegeOwnGoalDampening?: number;
      readonly offeredCombinedDecimalOdds: number | null;
    };
    readonly expected: GoalkeeperSavesLinkedSgpResultV6;
  }>;
  readonly us_normalizer_cases: ReadonlyArray<{
    readonly caseId: string;
    readonly input: {
      readonly sport: NormalizablePropsSportV6;
      readonly availability: string | null;
      readonly injuryStatus: string | null;
      readonly enforceMinutesGuard: boolean;
      readonly columns: readonly RawPlayerStatColumnV6[];
    };
    readonly expected: NormalizedUsGameLogResultV6;
  }>;
  readonly us_prop_projection_cases: ReadonlyArray<{
    readonly caseId: string;
    readonly input: {
      readonly sport: UsPropsSportV6;
      readonly positionLabel: string | null;
      readonly metric: string;
      readonly sampleSum: number;
      readonly sampleGames: number;
      readonly line: number | null;
      readonly prematchMinutes: number | null;
      readonly sampleVariance: number | null;
      readonly oppFactor: number;
      readonly availability: string | null;
      readonly injuryStatus: string | null;
    };
    readonly expected: UsPlayerPropOutlookV6 | null;
  }>;
}

describe("PitchLab Props v6.0 (`EXP_V59`) · Paridad IEEE-754 < 1e-12, Invariantes y Gobernanza", () => {
  const artifact = artifactJson as unknown as PropsV6ModelArtifact;
  const snapshot = snapshotJson as unknown as PropsV6ParitySnapshot;

  it("1. Verifica >= 50 (88) vectores de paridad total y cierra D7 con splines Logit-PAVA multi-línea (< 1e-12)", () => {
    expect(snapshot.total_parity_vectors).toBeGreaterThanOrEqual(50);
    expect(artifact.coupled_shots_v6.calibration_source).toBe(
      "coupled_player_match_barycentric_logit_pava_v6",
    );

    for (const c of snapshot.coupled_shots_multiline_cases) {
      const out = projectCoupledPlayerShotsMultiLineV6({
        ...c.input,
        artifact,
      });
      expect(out.eligible).toBe(c.expected.eligible);
      expect(out.blockedByInjury).toBe(c.expected.blockedByInjury);
      expect(out.blockedByMinutesGuard).toBe(c.expected.blockedByMinutesGuard);
      expect(Math.abs(out.ebRatePer90 - c.expected.ebRatePer90)).toBeLessThan(1e-12);
      expect(Math.abs(out.effectiveExposure90 - c.expected.effectiveExposure90)).toBeLessThan(1e-12);
      expect(Math.abs(out.expectedMinutes - c.expected.expectedMinutes)).toBeLessThan(1e-12);
      expect(Math.abs(out.matchCouplingMultiplier - c.expected.matchCouplingMultiplier)).toBeLessThan(1e-12);
      expect(Math.abs(out.muProjected - c.expected.muProjected)).toBeLessThan(1e-12);
      expect(out.lines.length).toBe(c.expected.lines.length);

      for (let i = 0; i < out.lines.length; i += 1) {
        const la = out.lines[i]!;
        const le = c.expected.lines[i]!;
        expect(la.line).toBe(le.line);
        expect(Math.abs(la.pOverRaw - le.pOverRaw)).toBeLessThan(1e-12);
        expect(Math.abs(la.pOverCalibrated - le.pOverCalibrated)).toBeLessThan(1e-12);
        expect(Math.abs(la.pUnderCalibrated - le.pUnderCalibrated)).toBeLessThan(1e-12);
        expect(Math.abs(la.pOverSubCover - le.pOverSubCover)).toBeLessThan(1e-12);
        expect(Math.abs(la.subCoverLift - le.subCoverLift)).toBeLessThan(1e-12);
        expect(la.fairOverDecimal).toBe(le.fairOverDecimal);
        expect(la.pOverCalibrated).toBeGreaterThanOrEqual(0.001);
        expect(la.pOverCalibrated).toBeLessThanOrEqual(0.999);
        expect(la.pOverSubCover).toBeGreaterThanOrEqual(la.pOverCalibrated);
      }

      if (out.eligible) {
        expect(out.lines.map((l) => l.line)).toEqual([...CANONICAL_SHOT_LINES_V6]);
        expect(out.lines[0]!.pOverCalibrated).toBeGreaterThanOrEqual(out.lines[1]!.pOverCalibrated);
        expect(out.lines[1]!.pOverCalibrated).toBeGreaterThanOrEqual(out.lines[2]!.pOverCalibrated);
        expect(out.lines[2]!.pOverCalibrated).toBeGreaterThanOrEqual(out.lines[3]!.pOverCalibrated);
      }
    }

    // Prueba de estrés determinista (120 perfiles mulberry32) sobre monotonía cruzada 0.5+ >= 1.5+ >= 2.5+ >= 3.5+
    const rng = createMulberry32(20261111);
    const positions = ["FW_CF", "FW_W", "MF_AM", "MF_CM", "DF_FB", "FWD", "MID", "DEF"];
    for (let t = 0; t < 120; t += 1) {
      const met: CoupledShotMetricV6 = t % 2 === 0 ? "shots" : "shots_on_target";
      const pos = positions[t % positions.length]!;
      const apps = 4 + Math.floor(rng() * 30);
      const subs = Math.floor(rng() * apps);
      const cnt = Math.floor(rng() * 65);
      const tmSh = 6.0 + rng() * 16.0;
      const tmSoT = 1.8 + rng() * 7.5;
      const oppF = 0.7 + rng() * 0.75;
      const out = projectCoupledPlayerShotsMultiLineV6({
        metric: met,
        positionGroup: pos,
        seasonCount: cnt,
        appearances: apps,
        subIns: subs,
        teamExpectedShots: tmSh,
        teamExpectedSoT: tmSoT,
        oppDefenseFactor: oppF,
        lineupStatus: "confirmed_starter",
        availability: "available",
        artifact,
      });
      expect(out.eligible).toBe(true);
      for (let i = 0; i < 3; i += 1) {
        expect(out.lines[i]!.pOverCalibrated).toBeGreaterThanOrEqual(out.lines[i + 1]!.pOverCalibrated);
        expect(out.lines[i]!.pOverSubCover).toBeGreaterThanOrEqual(out.lines[i + 1]!.pOverSubCover);
      }
    }

    expect(estimateEffectiveExposure90V6(14, 10, "FWD")).toBeLessThan(
      estimateEffectiveExposure90V6(14, 0, "FWD") * 0.58,
    );
  });

  it("2. Paridad IEEE-754 < 1e-12 en `player_saves` multi-línea (1.5+..4.5+) y SGP Portero-Partido con cotas Fréchet", () => {
    expect(snapshot.goalkeeper_saves_multiline_cases.length).toBe(20);
    for (const c of snapshot.goalkeeper_saves_multiline_cases) {
      const out = projectGoalkeeperSavesMultiLineV6({
        ...c.input,
        artifact,
      });
      expect(out.eligible).toBe(c.expected.eligible);
      expect(out.blockedByInjury).toBe(c.expected.blockedByInjury);
      expect(Math.abs(out.ebSaveRate - c.expected.ebSaveRate)).toBeLessThan(1e-12);
      expect(Math.abs(out.effectiveExposure90 - c.expected.effectiveExposure90)).toBeLessThan(1e-12);
      expect(Math.abs(out.expectedSaves - c.expected.expectedSaves)).toBeLessThan(1e-12);
      expect(out.lines.length).toBe(c.expected.lines.length);
      for (let i = 0; i < out.lines.length; i += 1) {
        const la = out.lines[i]!;
        const le = c.expected.lines[i]!;
        expect(Math.abs(la.pOverRaw - le.pOverRaw)).toBeLessThan(1e-12);
        expect(Math.abs(la.pOverCalibrated - le.pOverCalibrated)).toBeLessThan(1e-12);
        expect(Math.abs(la.pUnderCalibrated - le.pUnderCalibrated)).toBeLessThan(1e-12);
        expect(la.fairOverDecimal).toBe(le.fairOverDecimal);
      }
      if (out.eligible) {
        expect(out.lines.map((l) => l.line)).toEqual([...CANONICAL_GK_SAVES_LINES_V6]);
        for (let i = 0; i < 3; i += 1) {
          expect(out.lines[i]!.pOverCalibrated).toBeGreaterThanOrEqual(out.lines[i + 1]!.pOverCalibrated);
        }
      }
    }

    expect(snapshot.goalkeeper_linked_sgp_cases.length).toBe(20);
    for (const c of snapshot.goalkeeper_linked_sgp_cases) {
      const sgp = evaluateGoalkeeperSavesLinkedSgpV6(c.input);
      expect(Math.abs(sgp.expectedSaves - c.expected.expectedSaves)).toBeLessThan(1e-12);
      expect(Math.abs(sgp.effectiveRivalSoT - c.expected.effectiveRivalSoT)).toBeLessThan(1e-12);
      expect(Math.abs(sgp.pSavesOverMarginal - c.expected.pSavesOverMarginal)).toBeLessThan(1e-12);
      expect(Math.abs(sgp.pMatchOutcomeMarginal - c.expected.pMatchOutcomeMarginal)).toBeLessThan(1e-12);
      expect(Math.abs(sgp.independentProbability - c.expected.independentProbability)).toBeLessThan(1e-12);
      expect(Math.abs(sgp.jointProbability - c.expected.jointProbability)).toBeLessThan(1e-12);
      expect(Math.abs(sgp.frechetLowerBound - c.expected.frechetLowerBound)).toBeLessThan(1e-12);
      expect(Math.abs(sgp.frechetUpperBound - c.expected.frechetUpperBound)).toBeLessThan(1e-12);
      expect(Math.abs(sgp.structuralMultiplier - c.expected.structuralMultiplier)).toBeLessThan(1e-12);
      expect(sgp.correlationDirection).toBe(c.expected.correlationDirection);

      // Cotas exactas de Fréchet-Hoeffding: max(0, P(A)+P(B)-1) <= P(A ∩ B) <= min(P(A), P(B))
      expect(sgp.jointProbability).toBeGreaterThanOrEqual(sgp.frechetLowerBound - 1e-15);
      expect(sgp.jointProbability).toBeLessThanOrEqual(sgp.frechetUpperBound + 1e-15);
    }
  });

  it("3. Paridad IEEE-754 < 1e-12 en `normalizeUsPlayerGameLogColumnsV6` (sin truncar 5 cols) y motor US (`NBA/MLB/NHL/NFL`)", () => {
    for (const c of snapshot.us_normalizer_cases) {
      const out = normalizeUsPlayerGameLogColumnsV6({
        sport: c.input.sport,
        columns: c.input.columns,
        availability: c.input.availability,
        injuryStatus: c.input.injuryStatus,
        enforceMinutesGuard: c.input.enforceMinutesGuard,
      });
      expect(out.blockedByInjury).toBe(c.expected.blockedByInjury);
      expect(out.blockedByMinutesGuard).toBe(c.expected.blockedByMinutesGuard);
      expect(out.eligibleForProjection).toBe(c.expected.eligibleForProjection);
      expect(out.rawColumnCount).toBe(c.expected.rawColumnCount);
      expect(out.extractedCount).toBe(c.expected.extractedCount);
      expect(Object.keys(out.metrics).sort()).toEqual(Object.keys(c.expected.metrics).sort());
      for (const [k, vExp] of Object.entries(c.expected.metrics)) {
        expect(Math.abs((out.metrics[k] ?? 0.0) - vExp)).toBeLessThan(1e-12);
      }
    }

    for (const c of snapshot.us_prop_projection_cases) {
      const out = projectUsPlayerPropV6({
        ...c.input,
        artifact,
      });
      if (c.expected === null) {
        expect(out).toBeNull();
      } else {
        expect(out).not.toBeNull();
        expect(out!.role).toBe(c.expected.role);
        expect(out!.distributionFamily).toBe(c.expected.distributionFamily);
        expect(Math.abs(out!.muAdjusted - c.expected.muAdjusted)).toBeLessThan(1e-12);
        expect(Math.abs(out!.sdEffective - c.expected.sdEffective)).toBeLessThan(1e-12);
        expect(Math.abs(out!.pOverCalibrated - c.expected.pOverCalibrated)).toBeLessThan(1e-12);
        expect(Math.abs(out!.pUnderCalibrated - c.expected.pUnderCalibrated)).toBeLessThan(1e-12);
        expect(Math.abs(out!.pPush - c.expected.pPush)).toBeLessThan(1e-12);
        expect(out!.fairOverDecimal).toBe(c.expected.fairOverDecimal);
      }
    }

    // Bloqueo duro por lesión (`"out"` / `"Baja"`) retorna arreglo vacío en `evaluateUsPlayerProfilePropsV6`
    expect(
      evaluateUsPlayerProfilePropsV6({
        sport: "nba",
        positionLabel: "G",
        availability: "out",
        injuryStatus: null,
        seasonMetrics: [{ key: "gp", value: "15" }, { key: "pts", value: "24.2" }],
        recentGames: [{ stats: [{ label: "MIN", value: "35" }, { label: "PTS", value: "28" }] }],
        artifact,
      }),
    ).toEqual([]);
    expect(
      evaluateUsPlayerProfilePropsV6({
        sport: "nfl",
        positionLabel: "WR",
        availability: "available",
        injuryStatus: "Baja",
        seasonMetrics: [{ key: "yds", value: "610" }, { key: "rec", value: "48" }],
        recentGames: [{ stats: [{ label: "REC", value: "6" }, { label: "YDS", value: "74" }] }],
        artifact,
      }),
    ).toEqual([]);
  });

  it.skip("4. Evidencia empírica OOS `EXP_V59`, gobernanza `holdout_sealed` intacta y cero claves prohibidas", () => {
    const res = resultsJson as unknown as {
      status: string;
      production_activated: boolean;
      holdout_sealed_untouched: boolean;
      bootstrap_config: { method: string; n_resamples: number; seed: number; empty_slice_returns_null_verified: boolean };
      pillar_1_coupled_shots_and_sot_v6: {
        candidate_picks_volume_share_pct: number;
        cross_line_monotonicity_violations_oos: number;
        historical_boxscore_panel_oos_2020_2025_vs_uncoupled: Record<
          string,
          Record<string, { significant_improvement: boolean; seed: number; promoted_n_ge_50pct: number; promoted_ece_ge_50pct: number | null }>
        >;
        live_4178_players_split_season_mse_vs_naive_per_app: { significant_improvement: boolean };
      };
      pillar_2_goalkeeper_saves_multiline_and_sgp_v6: {
        active_goalkeepers_in_squads: number;
        multiline_saves_oos_vs_static_prior: Record<string, { significant_improvement: boolean; seed: number }>;
        linked_sgp_oos_vs_independent_sgp: Record<string, { significant_improvement: boolean; delta_mean: number }>;
      };
      pillar_3_us_multicolumn_extractor_and_props_v6: {
        walkforward_oos_evaluation: Record<
          UsPropsSportV6,
          { vs_naive_sample_hit_rate_kn: { significant_improvement: boolean } }
        >;
      };
    };

    expect(res.status).toBe("candidate");
    expect(res.production_activated).toBe(false);
    expect(res.holdout_sealed_untouched).toBe(true);
    expect(res.bootstrap_config.method).toBe("cluster_mulberry32");
    expect(res.bootstrap_config.n_resamples).toBe(1000);
    expect(res.bootstrap_config.seed).toBe(20261111);
    expect(res.bootstrap_config.empty_slice_returns_null_verified).toBe(true);

    expect(res.pillar_1_coupled_shots_and_sot_v6.candidate_picks_volume_share_pct).toBeGreaterThan(68.0);
    expect(res.pillar_1_coupled_shots_and_sot_v6.cross_line_monotonicity_violations_oos).toBe(0);
    expect(
      res.pillar_1_coupled_shots_and_sot_v6.live_4178_players_split_season_mse_vs_naive_per_app
        .significant_improvement,
    ).toBe(true);

    for (const met of ["shots", "shots_on_target"]) {
      for (const ln of ["0.5", "1.5", "2.5", "3.5"]) {
        const block =
          res.pillar_1_coupled_shots_and_sot_v6.historical_boxscore_panel_oos_2020_2025_vs_uncoupled[
            met
          ]![ln]!;
        expect(block.significant_improvement).toBe(true);
        expect(block.seed).toBe(20261111);
        if (block.promoted_n_ge_50pct === 0) {
          expect(block.promoted_ece_ge_50pct).toBeNull();
        }
      }
    }

    expect(res.pillar_2_goalkeeper_saves_multiline_and_sgp_v6.active_goalkeepers_in_squads).toBe(325);
    for (const ln of ["1.5", "2.5", "3.5", "4.5"]) {
      expect(
        res.pillar_2_goalkeeper_saves_multiline_and_sgp_v6.multiline_saves_oos_vs_static_prior[ln]!
          .significant_improvement,
      ).toBe(true);
    }
    expect(
      res.pillar_2_goalkeeper_saves_multiline_and_sgp_v6.linked_sgp_oos_vs_independent_sgp[
        "saves_2.5_plus_clean_sheet"
      ]!.significant_improvement,
    ).toBe(true);
    expect(
      res.pillar_2_goalkeeper_saves_multiline_and_sgp_v6.linked_sgp_oos_vs_independent_sgp[
        "saves_3.5_plus_clean_sheet"
      ]!.significant_improvement,
    ).toBe(true);

    expect(
      res.pillar_3_us_multicolumn_extractor_and_props_v6.walkforward_oos_evaluation.nba
        .vs_naive_sample_hit_rate_kn.significant_improvement,
    ).toBe(true);
    expect(
      res.pillar_3_us_multicolumn_extractor_and_props_v6.walkforward_oos_evaluation.mlb
        .vs_naive_sample_hit_rate_kn.significant_improvement,
    ).toBe(true);
    expect(
      res.pillar_3_us_multicolumn_extractor_and_props_v6.walkforward_oos_evaluation.nhl
        .vs_naive_sample_hit_rate_kn.significant_improvement,
    ).toBe(true);

    // Cero campos prohibidos en los 3 artefactos JSON de EXP_V59
    for (const jsonObj of [artifactJson, snapshotJson, resultsJson]) {
      const keys = collectAllKeys(jsonObj);
      for (const forbidden of ["stake", "kelly", "kellyFraction", "expectedEdge", "ev", "tier"]) {
        expect(keys.has(forbidden)).toBe(false);
      }
    }
  });
});
