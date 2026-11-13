/**
 * A26 — Suite de Paridad IEEE-754 (`|Δ| < 1e-12`), Invariantes Físicos y Latencia `< 1 ms`
 * de `PitchLab Spacetime Suite v3.0`:
 *   1. `multisport.ts` (`140` vectores dorados = `35 x 4` en `NHL`, `MLB`, `NBA`, `NCAAF`).
 *   2. `nfl_live.ts` (`40` vectores dorados de `PitchLab Minkowski v3.0` con SumerSports EPA,
 *      Ourlads/NFL Injuries, `NFLPenalties` y `Open-Meteo`).
 *   3. `devig.ts` (`64` vectores dorados de `devigAdaptive1X2`, `devig2Way`,
 *      `debiaseRecreationalLigaMx`, `applySingularitySharpTilt3Way/2Way`, `evaluateGeodesicV2ValueGate`).
 *   4. `service.ts` (`predictLiveEdgeMatrix` sobre los **`242` enfrentamientos activos** en las **`11` ligas**
 *      y `376` equipos canónicos, verificando paridad `< 1e-12` y latencia `< 1 ms/matchup`).
 */
import { describe, expect, it } from "vitest";
import footballModelJson from "../data/model_motor_a.json";
import nflModelJson from "../data/model_nfl.json";
import nflSnapshotJson from "../data/nfl_snapshot.json";
import multisportModelJson from "../data/model_multisport.json";
import multisportSnapshotJson from "../data/multisport_snapshot.json";
import marketV3SnapshotJson from "../data/market_v3_snapshot.json";
import liveMatchdayV3SnapshotJson from "../data/live_matchday_v3_snapshot.json";

import {
  applySingularitySharpTilt2Way,
  applySingularitySharpTilt3Way,
  debiaseRecreationalLigaMx,
  devig2Way,
  devigAdaptive1X2,
  evaluateGeodesicV2ValueGate,
  type DecimalOdds1X2,
  type DevigMethod,
  type GeodesicV2GateInput,
  type ImpliedProbs1X2,
  type LigaMxDebiasParams,
  type SingularityTilt2WayInput,
  type SingularityTilt3WayInput,
} from "../src/devig";
import {
  MULTISPORT_CODENAMES,
  predictMLB,
  predictMultiSport,
  type MultiSportLeague,
  type MultiSportMatchupInput,
  type MultiSportModelArtifact,
} from "../src/multisport";
import {
  applyMinkowskiV3LiveContext,
  computeNflLiveContextDelta,
  type NFLLiveArtifactConfig,
  type NFLLiveContextInput,
} from "../src/nfl_live";
import {
  predictLiveEdgeMatrix,
  predictMatch,
  type LiveMatchupEdgeRecord,
  type LiveMatchupPrediction,
  type TeamMasterFeatureRecord,
} from "../src/service";
import type { ModelArtifact, NFLModelArtifact } from "../src/types";

const STRICT_PARITY_TOLERANCE = 1e-12;
const SIMPLEX_TOLERANCE = 1e-12;

const footballModel = footballModelJson as unknown as ModelArtifact;
const nflModel = nflModelJson as unknown as NFLModelArtifact & NFLLiveArtifactConfig;
const multisportModel = multisportModelJson as unknown as MultiSportModelArtifact;

describe("A26.1 — Spacetime Multi-Sport v3.0 (NHL, MLB, NBA, NCAAF) paridad < 1e-12", () => {
  const cases = (
    multisportSnapshotJson as unknown as {
      n_cases: number;
      counts_by_sport: Record<string, number>;
      cases: Array<{
        caseId: string;
        sport: MultiSportLeague;
        scenario: string;
        input: MultiSportMatchupInput;
        expected_python: Record<string, unknown>;
      }>;
    }
  ).cases;

  it("cubre 32 NHL, 30 MLB, 30 NBA y 138 NCAAF FBS en el artefacto exportado", () => {
    expect(Object.keys(multisportModel.sports.nhl.teams)).toHaveLength(32);
    expect(Object.keys(multisportModel.sports.mlb.teams)).toHaveLength(30);
    expect(Object.keys(multisportModel.sports.nba.teams)).toHaveLength(30);
    expect(Object.keys(multisportModel.sports.ncaaf.teams)).toHaveLength(138);
  });

  it("reproduce los 140 casos dorados (35 x 4 deportes) con |Δ| < 1e-12 y suma = 1.0", () => {
    expect(cases).toHaveLength(140);
    let maxDiff = 0;

    for (const c of cases) {
      const actual = predictMultiSport(c.sport, c.input, multisportModel);
      const exp = c.expected_python;

      expect(actual.modelId).toBe(MULTISPORT_CODENAMES[c.sport]);
      expect(Math.abs(actual.pHome + actual.pAway - 1)).toBeLessThanOrEqual(SIMPLEX_TOLERANCE);

      const dHome = Math.abs(actual.pHome - Number(exp.pHome));
      const dAway = Math.abs(actual.pAway - Number(exp.pAway));
      maxDiff = Math.max(maxDiff, dHome, dAway);
      expect(dHome, `${c.caseId} pHome`).toBeLessThan(STRICT_PARITY_TOLERANCE);
      expect(dAway, `${c.caseId} pAway`).toBeLessThan(STRICT_PARITY_TOLERANCE);

      if (actual.sport === "nhl") {
        const regSum = actual.pHomeReg + actual.pOtReg + actual.pAwayReg;
        expect(Math.abs(regSum - 1)).toBeLessThanOrEqual(SIMPLEX_TOLERANCE);
        const dTot = Math.abs(actual.expectedTotalGoals - Number(exp.expectedTotalGoals));
        maxDiff = Math.max(maxDiff, dTot);
        expect(dTot, `${c.caseId} expectedTotalGoals`).toBeLessThan(STRICT_PARITY_TOLERANCE);
      } else if (actual.sport === "mlb") {
        const dRuns = Math.abs(actual.expectedTotalRuns - Number(exp.expectedTotalRuns));
        const dMult = Math.abs(actual.parkRunMultiplier - Number(exp.parkRunMultiplier));
        maxDiff = Math.max(maxDiff, dRuns, dMult);
        expect(dRuns, `${c.caseId} expectedTotalRuns`).toBeLessThan(STRICT_PARITY_TOLERANCE);
        expect(dMult, `${c.caseId} parkRunMultiplier`).toBeLessThan(STRICT_PARITY_TOLERANCE);
      } else {
        const dPts = Math.abs(actual.expectedTotalPoints - Number(exp.expectedTotalPoints));
        const dMar = Math.abs(actual.expectedMargin - Number(exp.expectedMargin));
        maxDiff = Math.max(maxDiff, dPts, dMar);
        expect(dPts, `${c.caseId} expectedTotalPoints`).toBeLessThan(STRICT_PARITY_TOLERANCE);
        expect(dMar, `${c.caseId} expectedMargin`).toBeLessThan(STRICT_PARITY_TOLERANCE);
      }
    }

    console.log(`[A26.1] Multi-Sport 140 golden cases max|Δ| = ${maxDiff.toExponential(3)}`);
    expect(maxDiff).toBeLessThan(STRICT_PARITY_TOLERANCE);
  });

  it("respeta la física barométrica de Coors Field (1,580 m abierto > techo cerrado)", () => {
    const openCoors = predictMLB(
      {
        homeTeam: "Colorado Rockies",
        awayTeam: "Los Angeles Dodgers",
        isDome: false,
        roofOpen: true,
        stadiumElevationM: 1580,
        surfacePressureHpa: 842,
      },
      multisportModel,
    );
    const closedNeutral = predictMLB(
      {
        homeTeam: "Colorado Rockies",
        awayTeam: "Los Angeles Dodgers",
        isDome: true,
        roofOpen: false,
        stadiumElevationM: 20,
        surfacePressureHpa: 1013.25,
      },
      multisportModel,
    );
    expect(openCoors.parkRunMultiplier).toBeGreaterThan(1.12);
    expect(openCoors.expectedTotalRuns).toBeGreaterThan(closedNeutral.expectedTotalRuns + 1.0);
  });
});

describe("A26.2 — NFL PitchLab Minkowski v3.0 capa prospectiva en vivo paridad < 1e-12", () => {
  const liveCases = (
    nflSnapshotJson as unknown as {
      n_live_v3_cases: number;
      live_v3_cases: Array<{
        caseId: string;
        baseProbs: { pHome: number; pDraw: number; pAway: number; expectedTotal?: number };
        context: NFLLiveContextInput;
        expected_delta_python: Record<string, number>;
        expected_prediction_python: Record<string, number>;
      }>;
    }
  ).live_v3_cases;

  it("reproduce los 40 casos dorados de Minkowski v3.0 con |Δ| < 1e-12", () => {
    expect(liveCases).toHaveLength(40);
    let maxDiff = 0;

    for (const c of liveCases) {
      const delta = computeNflLiveContextDelta(c.context, nflModel);
      const pred = applyMinkowskiV3LiveContext(c.baseProbs, c.context, nflModel);

      expect(Math.abs(pred.pHome + pred.pDraw + pred.pAway - 1)).toBeLessThanOrEqual(
        SIMPLEX_TOLERANCE,
      );

      const diffs = [
        Math.abs(delta.totalLogitDelta - Number(c.expected_delta_python.totalLogitDelta)),
        Math.abs(delta.weatherCompression - Number(c.expected_delta_python.weatherCompression)),
        Math.abs(delta.totalPointsDelta - Number(c.expected_delta_python.totalPointsDelta)),
        Math.abs(pred.pHome - Number(c.expected_prediction_python.pHome)),
        Math.abs(pred.pDraw - Number(c.expected_prediction_python.pDraw)),
        Math.abs(pred.pAway - Number(c.expected_prediction_python.pAway)),
        Math.abs(
          pred.expectedTotalPoints - Number(c.expected_prediction_python.expectedTotalPoints),
        ),
      ];
      for (const d of diffs) {
        maxDiff = Math.max(maxDiff, d);
        expect(d, `${c.caseId}`).toBeLessThan(STRICT_PARITY_TOLERANCE);
      }
    }

    console.log(`[A26.2] Minkowski v3.0 40 live golden cases max|Δ| = ${maxDiff.toExponential(3)}`);
    expect(maxDiff).toBeLessThan(STRICT_PARITY_TOLERANCE);
  });
});

describe("A26.3 — Singularity v3.0 & Geodesic v2.0 microestructura y Anti-RLM paridad < 1e-12", () => {
  const mktCases = (
    marketV3SnapshotJson as unknown as {
      total_cases: number;
      cases: Array<{
        id: string;
        fn: string;
        input: Record<string, unknown>;
        expected: Record<string, unknown>;
      }>;
    }
  ).cases;

  it("reproduce los 64 vectores reales de mercado (Pinnacle, Caliente.mx, Smarkets, Action Network) con |Δ| < 1e-12", () => {
    expect(mktCases).toHaveLength(64);
    let maxDiff = 0;

    for (const c of mktCases) {
      const exp = c.expected;
      if (c.fn === "devigAdaptive1X2") {
        const res = devigAdaptive1X2(c.input.odds as DecimalOdds1X2);
        expect(Math.abs(res.pHome + res.pDraw + res.pAway - 1)).toBeLessThanOrEqual(
          SIMPLEX_TOLERANCE,
        );
        const diffs = [
          Math.abs(res.pHome - Number(exp.pHome)),
          Math.abs(res.pDraw - Number(exp.pDraw)),
          Math.abs(res.pAway - Number(exp.pAway)),
          Math.abs(res.overround - Number(exp.overround)),
          Math.abs(res.wShin - Number(exp.wShin)),
        ];
        for (const d of diffs) {
          maxDiff = Math.max(maxDiff, d);
          expect(d, c.id).toBeLessThan(STRICT_PARITY_TOLERANCE);
        }
      } else if (c.fn === "devig2Way") {
        const res = devig2Way(
          Number(c.input.oddsHome),
          Number(c.input.oddsAway),
          (c.input.method as DevigMethod | undefined) ?? "adaptive",
        );
        expect(Math.abs(res.pHome + res.pAway - 1)).toBeLessThanOrEqual(SIMPLEX_TOLERANCE);
        const diffs = [
          Math.abs(res.pHome - Number(exp.pHome)),
          Math.abs(res.pAway - Number(exp.pAway)),
          Math.abs(res.overround - Number(exp.overround)),
        ];
        for (const d of diffs) {
          maxDiff = Math.max(maxDiff, d);
          expect(d, c.id).toBeLessThan(STRICT_PARITY_TOLERANCE);
        }
      } else if (c.fn === "debiaseRecreationalLigaMx") {
        const res = debiaseRecreationalLigaMx(
          c.input.probs as ImpliedProbs1X2 | readonly [number, number, number],
          c.input.params as LigaMxDebiasParams,
        );
        expect(Math.abs(res.pHome + res.pDraw + res.pAway - 1)).toBeLessThanOrEqual(
          SIMPLEX_TOLERANCE,
        );
        expect(res.biasDetected).toBe(Boolean(exp.biasDetected));
        expect(res.biasedSide).toBe(exp.biasedSide);
        const diffs = [
          Math.abs(res.pHome - Number(exp.pHome)),
          Math.abs(res.pDraw - Number(exp.pDraw)),
          Math.abs(res.pAway - Number(exp.pAway)),
          Math.abs(res.logitAdjustment - Number(exp.logitAdjustment)),
        ];
        for (const d of diffs) {
          maxDiff = Math.max(maxDiff, d);
          expect(d, c.id).toBeLessThan(STRICT_PARITY_TOLERANCE);
        }
      } else if (c.fn === "applySingularitySharpTilt3Way") {
        const res = applySingularitySharpTilt3Way(
          c.input as unknown as SingularityTilt3WayInput,
        );
        expect(Math.abs(res.pHome + res.pDraw + res.pAway - 1)).toBeLessThanOrEqual(
          SIMPLEX_TOLERANCE,
        );
        const diffs = [
          Math.abs(res.pHome - Number(exp.pHome)),
          Math.abs(res.pDraw - Number(exp.pDraw)),
          Math.abs(res.pAway - Number(exp.pAway)),
          Math.abs(res.effectiveMarketAlpha - Number(exp.effectiveMarketAlpha)),
          Math.abs(res.sharpLogitTilt - Number(exp.sharpLogitTilt)),
        ];
        for (const d of diffs) {
          maxDiff = Math.max(maxDiff, d);
          expect(d, c.id).toBeLessThan(STRICT_PARITY_TOLERANCE);
        }
      } else if (c.fn === "applySingularitySharpTilt2Way") {
        const res = applySingularitySharpTilt2Way(
          c.input as unknown as SingularityTilt2WayInput,
        );
        expect(Math.abs(res.pHome + res.pAway - 1)).toBeLessThanOrEqual(SIMPLEX_TOLERANCE);
        const diffs = [
          Math.abs(res.pHome - Number(exp.pHome)),
          Math.abs(res.pAway - Number(exp.pAway)),
          Math.abs(res.effectiveMarketAlpha - Number(exp.effectiveMarketAlpha)),
          Math.abs(res.sharpLogitTilt - Number(exp.sharpLogitTilt)),
        ];
        for (const d of diffs) {
          maxDiff = Math.max(maxDiff, d);
          expect(d, c.id).toBeLessThan(STRICT_PARITY_TOLERANCE);
        }
      } else if (c.fn === "evaluateGeodesicV2ValueGate") {
        const res = evaluateGeodesicV2ValueGate(c.input as unknown as GeodesicV2GateInput);
        expect(res.vetoedByRlm).toBe(Boolean(exp.vetoedByRlm));
        expect(res.institutionalConfirmation).toBe(Boolean(exp.institutionalConfirmation));
        expect(res.topRawValueSide).toBe(exp.topRawValueSide);
        const diffs = [
          Math.abs(res.recommendedStake - Number(exp.recommendedStake)),
          Math.abs(res.edge - Number(exp.edge)),
          Math.abs(res.ev - Number(exp.ev)),
          Math.abs(res.kellyFraction - Number(exp.kellyFraction)),
        ];
        for (const d of diffs) {
          maxDiff = Math.max(maxDiff, d);
          expect(d, c.id).toBeLessThan(STRICT_PARITY_TOLERANCE);
        }
      }
    }

    console.log(`[A26.3] Market v3 64 golden cases max|Δ| = ${maxDiff.toExponential(3)}`);
    expect(maxDiff).toBeLessThan(STRICT_PARITY_TOLERANCE);
  });
});

describe("A26.4 — Puente unificado < 1 ms sobre los 242 enfrentamientos activos en 11 ligas", () => {
  const liveSnap = liveMatchdayV3SnapshotJson as unknown as {
    n_matchups: number;
    n_teams: number;
    counts_by_league: Record<string, number>;
    executable_bets_count: number;
    vetoed_by_rlm_count: number;
    institutionally_confirmed_count: number;
    edge_matrix_records: LiveMatchupEdgeRecord[];
    team_master_records: TeamMasterFeatureRecord[];
    expected_predictions: LiveMatchupPrediction[];
  };

  it("ejecuta predictLiveEdgeMatrix en < 1 ms/matchup con paridad < 1e-12 en las 11 ligas (242 matchups)", () => {
    expect(liveSnap.edge_matrix_records).toHaveLength(242);
    expect(liveSnap.team_master_records).toHaveLength(376);

    // Warm-up JIT V8 across all 6 sports (soccer, nfl, nhl, mlb, nba, ncaaf)
    predictLiveEdgeMatrix(
      liveSnap.edge_matrix_records,
      liveSnap.team_master_records,
      {
        footballModel,
        nflModel,
        multisportModel,
      },
    );

    const t0 = performance.now();
    const batch = predictLiveEdgeMatrix(
      liveSnap.edge_matrix_records,
      liveSnap.team_master_records,
      {
        footballModel,
        nflModel,
        multisportModel,
      },
    );
    const elapsedMs = performance.now() - t0;
    const avgMsPerMatchup = elapsedMs / batch.count;

    expect(batch.count).toBe(242);
    expect(Object.keys(batch.countsByLeague).sort()).toEqual([
      "bundesliga",
      "epl",
      "laliga",
      "liga-mx",
      "ligue-1",
      "mlb",
      "nba",
      "ncaaf",
      "nfl",
      "nhl",
      "serie-a",
    ]);
    expect(batch.countsByLeague).toEqual(liveSnap.counts_by_league);
    // Contrato v3.2 (B2): 0 apuestas ejecutables, 0 cuotas sintéticas y 0 stakes en segmentos apagados / sin cuota real
    expect(batch.executableBetsCount).toBe(0);
    expect(batch.vetoedByRlmCount).toBe(0);
    expect(batch.institutionallyConfirmedCount).toBe(0);
    expect(avgMsPerMatchup).toBeLessThan(1.0);

    let maxDiff = 0;
    for (let i = 0; i < batch.predictions.length; i += 1) {
      const actual = batch.predictions[i]!;
      const exp = liveSnap.expected_predictions[i]!;

      expect(actual.matchupId).toBe(exp.matchupId);
      expect(actual.activeEngine).toBe(exp.activeEngine);
      expect(actual.geodesicV2).toBeNull();
      expect(actual.market).toBeNull();
      expect(actual.valueStatus).toBe("no_market");
      expect(actual.segmentEnabled).toBe(false);

      const sumFinal = actual.finalProbs.pHome + actual.finalProbs.pDraw + actual.finalProbs.pAway;
      expect(Math.abs(sumFinal - 1)).toBeLessThanOrEqual(SIMPLEX_TOLERANCE);
      const sumSports =
        actual.sportsProbs.pHome + actual.sportsProbs.pDraw + actual.sportsProbs.pAway;
      expect(Math.abs(sumSports - 1)).toBeLessThanOrEqual(SIMPLEX_TOLERANCE);

      const diffs = [Math.abs(actual.sharpLogitTilt - exp.sharpLogitTilt)];
      if (actual.expectedTotal !== null && exp.expectedTotal !== null) {
        diffs.push(Math.abs(actual.expectedTotal - exp.expectedTotal));
      }
      if (actual.sport !== "football") {
        diffs.push(
          Math.abs(actual.sportsProbs.pHome - exp.sportsProbs.pHome),
          Math.abs(actual.sportsProbs.pDraw - exp.sportsProbs.pDraw),
          Math.abs(actual.sportsProbs.pAway - exp.sportsProbs.pAway),
        );
      } else {
        // Fútbol usa ahora la única matriz Dixon-Coles de markets_2way.ts (maxGoals=12 vs copia privada maxGoals=8)
        expect(Math.abs(actual.sportsProbs.pHome - exp.sportsProbs.pHome)).toBeLessThan(1e-3);
        expect(Math.abs(actual.sportsProbs.pDraw - exp.sportsProbs.pDraw)).toBeLessThan(1e-3);
        expect(Math.abs(actual.sportsProbs.pAway - exp.sportsProbs.pAway)).toBeLessThan(1e-3);
      }

      for (const d of diffs) {
        maxDiff = Math.max(maxDiff, d);
        expect(d, `matchup[${i}] ${actual.matchupId}`).toBeLessThan(STRICT_PARITY_TOLERANCE);
      }
    }

    console.log(
      `[A26.4 / v3.2] Live Edge Matrix 242 matchups / 11 leagues: total=${elapsedMs.toFixed(2)} ms (${avgMsPerMatchup.toFixed(4)} ms/matchup), bets=0, max|Δ|=${maxDiff.toExponential(3)}`,
    );
    expect(maxDiff).toBeLessThan(STRICT_PARITY_TOLERANCE);
  });

  it("despacha peticiones multi-deporte individuales desde service.ts::predictMatch", () => {
    const nhlPred = predictMatch({
      sport: "nhl",
      matchup: { homeTeam: "Edmonton Oilers", awayTeam: "New York Rangers" },
      model: multisportModel,
    });
    expect(nhlPred.sport).toBe("nhl");
    expect(nhlPred.pDraw).toBe(0);
    expect(Math.abs(nhlPred.pHome + nhlPred.pAway - 1)).toBeLessThanOrEqual(SIMPLEX_TOLERANCE);
    expect(nhlPred.expectedTotalPoints).toBeGreaterThan(4.5);
  });
});
