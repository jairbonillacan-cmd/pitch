/**
 * A17 / v2 — tests de de-vig y del servicio de predicción (incluyendo Motor C híbrido y Line Shopping).
 */
import { describe, expect, it } from "vitest";
import footballModelJson from "../../src/data/prediction/model_motor_a.json";
import footballSnapshotJson from "../../src/data/prediction/features_snapshot.json";
import nflModelJson from "../../src/data/prediction/model_nfl.json";
import nflSnapshotJson from "../../src/data/prediction/nfl_snapshot.json";
import {
  InvalidOddsError,
  devig,
  devigPower,
  devigProportional,
  devigShin,
  impliedProbabilities,
  overround,
} from "../../src/domain/prediction/devig.js";
import { HYBRID_MODEL_ID, predictMatch, predictMatchBatch } from "../../src/domain/prediction/service.js";
import type {
  ModelArtifact,
  NFLModelArtifact,
  NFLSnapshotRow,
  SnapshotFile,
  SnapshotRow,
} from "../../src/domain/prediction/types.js";

const footballModel = footballModelJson as unknown as ModelArtifact;
const footballSnapshot = footballSnapshotJson as unknown as SnapshotFile;
const footballRow = Object.values(footballSnapshot.rows)[0] as SnapshotRow;
const nflModel = nflModelJson as unknown as NFLModelArtifact;
const nflSnapshot = nflSnapshotJson as unknown as { rows: Record<string, NFLSnapshotRow> };
const nflRow = Object.values(nflSnapshot.rows)[0]!;

const ODDS: readonly number[] = [2.0, 3.5, 4.0];

function expectSimplex(p: readonly number[]): void {
  expect(p).toHaveLength(3);
  const sum = p.reduce((a, b) => a + b, 0);
  expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-12);
  for (const v of p) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  }
}

describe("A17 — de-vig", () => {
  it("calcula el overround", () => {
    expect(overround(ODDS)).toBeCloseTo(1 / 2 + 1 / 3.5 + 1 / 4 - 1, 12);
  });

  it("proporcional normaliza las probabilidades implícitas", () => {
    const p = devigProportional(ODDS);
    expectSimplex(p);
    expect(p[0]).toBeCloseTo(0.4827586206896552, 10);
    expect(p[1]).toBeCloseTo(0.27586206896551724, 10);
    expect(p[2]).toBeCloseTo(0.2413793103448276, 10);
    expect(devigProportional(ODDS)).toEqual(impliedProbabilities(ODDS));
  });

  it("power resuelve α y suma 1 a 1e-12", () => {
    const p = devigPower(ODDS);
    expectSimplex(p);
    // q_i^α con q=[0.5,0.285714,0.25]; α debe ser >1 (hay margen)
    expect(p[0]).toBeGreaterThan(0.4827);
    expect(p[2]).toBeLessThan(0.2414);
  });

  it("Shin converge y suma 1", () => {
    const p = devigShin(ODDS);
    expectSimplex(p);
    // Shin reparte el margen de forma no lineal: el favorito no puede subir tanto como en power
    expect(p[0]).toBeGreaterThan(0.4827);
  });

  it("los tres métodos son deterministas", () => {
    expect(devig(ODDS, "power")).toEqual(devig(ODDS, "power"));
    expect(devig(ODDS, "shin")).toEqual(devig(ODDS, "shin"));
    expect(devig(ODDS, "proportional")).toEqual(devig(ODDS, "proportional"));
  });

  it("rechaza cuotas <= 1 y longitudes incorrectas", () => {
    expect(() => devigProportional([1.0, 3.0, 4.0])).toThrow(InvalidOddsError);
    expect(() => devigProportional([2.0, 3.0])).toThrow(InvalidOddsError);
    expect(() => devigProportional([2.0, Number.NaN, 4.0])).toThrow(InvalidOddsError);
  });

  it("paridad con Python en cuotas reales de football-data", () => {
    // Valores de `features_market.parquet` (mkt_open_b365_power_*) calculados por
    // `features/build_market_features.py` con brentq sobre Σq^α = 1.
    const cases: Array<{ odds: number[]; expected: number[] }> = [
      { odds: [1.444, 3.75, 6.0], expected: [0.654915827526, 0.218142746204, 0.12694142627] },
      { odds: [1.615, 3.25, 5.0], expected: [0.579156098384, 0.261053272611, 0.159790629007] },
      { odds: [2.2, 3.25, 2.75], expected: [0.412603458406, 0.266234854626, 0.321161686953] },
    ];
    for (const c of cases) {
      const p = devigPower(c.odds);
      for (let i = 0; i < 3; i += 1) {
        expect(Math.abs(p[i]! - c.expected[i]!)).toBeLessThanOrEqual(1e-10);
      }
    }
  });

  it("rechaza overround absurdo (caso BFE 2.13 del snapshot A13)", () => {
    const absurd = [1.32, 1.47, 1.45]; // Σ1/o ≈ 2.13
    expect(() => devigPower(absurd)).toThrow(InvalidOddsError);
  });
});

describe("A17 — predictMatch", () => {
  it("con odds válidas usa el mercado y reporta el método y métricas de valor", () => {
    const p = predictMatch({ sport: "football", row: footballRow, model: footballModel, odds: ODDS });
    expect(p.modelId).toBe("market_devig");
    expect(p.dataQualityFlag).toBe("ok");
    expect(p.sport).toBe("football");
    expect(p.marketMethod).toBe("power");
    expect(Math.abs(p.pHome + p.pDraw + p.pAway - 1)).toBeLessThanOrEqual(1e-9);
    expect(p.modelMarketDivergence).toHaveLength(3);
    expect(p.expectedEdge).toHaveLength(3);
    expect(p.kellyFraction).toHaveLength(3);
    expect(typeof p.uncertaintyGatePassed).toBe("boolean");
  });

  it("soporta modo hybrid (Motor C) y Line Shopping con bestOdds", () => {
    const base = predictMatch({
      sport: "football",
      row: footballRow,
      model: footballModel,
      odds: ODDS,
      mode: "hybrid",
      hybridAlpha: 0.85,
    });
    expect(base.modelId).toBe(HYBRID_MODEL_ID);
    expect(base.hybridAlpha).toBeCloseTo(0.85, 12);

    const shopped = predictMatch({
      sport: "football",
      row: footballRow,
      model: footballModel,
      odds: ODDS,
      bestOdds: [2.15, 3.7, 4.3],
      mode: "hybrid",
      hybridAlpha: 0.85,
    });
    expect(shopped.expectedEdge![0]).toBeGreaterThan(base.expectedEdge![0]);
  });

  it("respeta el método pedido", () => {
    const p = predictMatch({
      sport: "football", row: footballRow, model: footballModel,
      odds: ODDS, oddsMethod: "proportional",
    });
    expect(p.marketMethod).toBe("proportional");
    expect(p.pHome).toBeCloseTo(0.4827586206896552, 10);
  });

  it("sin odds usa Motor A", () => {
    const p = predictMatch({ sport: "football", row: footballRow, model: footballModel });
    expect(p.dataQualityFlag).toBe("ok");
    expect(p.sport).toBe("football");
    expect(p.modelId).not.toBe("market_devig");
  });

  it("con odds inválidas cae a Motor A y marca fallback", () => {
    const p = predictMatch({
      sport: "football", row: footballRow, model: footballModel, odds: [1.0, 3.0, 4.0],
    });
    expect(p.dataQualityFlag).toBe("fallback_motor_a");
    expect(p.modelId).not.toBe("market_devig");
  });

  it("NFL usa su motor e ignora odds", () => {
    const p = predictMatch({ sport: "nfl", row: nflRow, model: nflModel });
    expect(p.sport).toBe("nfl");
    expect(p.modelId).toBe("nfl_logistic_v1");
    expect(p.dataQualityFlag).toBe("ok");
  });

  it("predictMatchBatch es determinista y equivale a llamadas individuales", () => {
    const requests = [
      { sport: "football" as const, row: footballRow, model: footballModel, odds: ODDS },
      { sport: "football" as const, row: footballRow, model: footballModel },
      { sport: "nfl" as const, row: nflRow, model: nflModel },
    ];
    const batch = predictMatchBatch(requests);
    expect(batch).toHaveLength(3);
    batch.forEach((p, i) => expect(p).toEqual(predictMatch(requests[i]!)));
    expect(predictMatchBatch(requests)).toEqual(batch);
  });
});
