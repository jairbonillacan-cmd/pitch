/**
 * A14 / v2 — paridad numérica del motor NFL (con QB Elo y continuidad) y contrato de despacho por deporte.
 *
 * Los JSON son copias byte a byte de `research/prediction-lab/artifacts/model_nfl/`
 * (sha256 verificado por el orquestador). `probs_python` está redondeado a 12
 * decimales en `pipeline/export_model_nfl.py`, así que el suelo de error esperado
 * es ~5e-13; la tolerancia contractual es 1e-9.
 */
import { describe, expect, it } from "vitest";
import nflModelJson from "../data/model_nfl.json";
import nflSnapshotJson from "../data/nfl_snapshot.json";
import footballModelJson from "../data/model_motor_a.json";
import footballSnapshotJson from "../data/features_snapshot.json";
import {
  NFL_MODEL_ID,
  PROBABILITY_SUM_TOLERANCE,
  assertValidNFLModel,
  predictForSport,
  predictNFL,
} from "../src/engine";
import type {
  ModelArtifact,
  NFLModelArtifact,
  NFLSnapshotFile,
  NFLSnapshotRow,
  SnapshotFile,
  SnapshotRow,
} from "../src/types";

const nflModel = nflModelJson as unknown as NFLModelArtifact;
const nflSnapshot = nflSnapshotJson as unknown as NFLSnapshotFile;
const nflRows = Object.entries(nflSnapshot.rows) as Array<[string, NFLSnapshotRow]>;
const PARITY_TOLERANCE = 1e-9;
const SIMPLEX_TOLERANCE = PROBABILITY_SUM_TOLERANCE;

function assertPredictionValid(p: { pHome: number; pDraw: number; pAway: number }): void {
  for (const value of [p.pHome, p.pDraw, p.pAway]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(p.pHome + p.pDraw + p.pAway - 1)).toBeLessThanOrEqual(SIMPLEX_TOLERANCE);
}

describe("A14 — artefacto NFL", () => {
  it("tiene 29 features (incluyendo QB Elo, Coach Elo y continuidad), 3 clases y el mapeo H/T/A documentado", () => {
    expect(nflModel.sport).toBe("nfl");
    expect(nflModel.features).toHaveLength(29);
    expect(nflModel.n_features).toBe(29);
    expect(nflModel.features).toContain("qb_elo_diff");
    expect(nflModel.features).toContain("coach_elo_diff");
    expect(nflModel.features).toContain("composite_elo_diff");
    expect(nflModel.coef).toHaveLength(3);
    expect(nflModel.intercept).toHaveLength(3);
    expect(nflModel.classes).toEqual([0, 1, 2]);
    expect(nflModel.class_map).toEqual({ "0": "H", "1": "T", "2": "A" });
    for (const row of nflModel.coef) expect(row).toHaveLength(29);
    expect(nflModel.scaler.mean).toHaveLength(29);
    expect(nflModel.scaler.scale).toHaveLength(29);
  });

  it("assertValidNFLModel acepta el artefacto real", () => {
    expect(() => assertValidNFLModel(nflModel)).not.toThrow();
  });

  it("assertValidNFLModel rechaza un artefacto con sport incorrecto", () => {
    const bad = { ...nflModel, sport: "football" } as unknown as NFLModelArtifact;
    expect(() => assertValidNFLModel(bad)).toThrow(/sport/);
  });
});

describe("A14 — paridad con Python en los 200 partidos", () => {
  it("reproduce `probs_python` con |Δ| <= 1e-9", () => {
    expect(nflRows.length).toBe(200);
    let maxDiff = 0;
    for (const [gameId, row] of nflRows) {
      const prediction = predictNFL(row, nflModel);
      assertPredictionValid(prediction);
      expect(prediction.sport).toBe("nfl");
      expect(prediction.modelId).toBe(NFL_MODEL_ID);
      const expected = row.probs_python;
      expect(expected, `${gameId}: falta probs_python`).toBeDefined();
      if (expected === undefined) continue;
      const deltas = [
        Math.abs(prediction.pHome - expected[0]!),
        Math.abs(prediction.pDraw - expected[1]!),
        Math.abs(prediction.pAway - expected[2]!),
      ];
      for (const d of deltas) {
        maxDiff = Math.max(maxDiff, d);
        expect(d, `${gameId}: |Δ| demasiado grande`).toBeLessThanOrEqual(PARITY_TOLERANCE);
      }
    }
    // El residuo debe ser el redondeo a 12 decimales, no un error de orden/mapeo.
    console.log(`[A14] paridad NFL: 200 partidos / 600 comparaciones; max|Δ|=${maxDiff.toExponential(3)}`);
    expect(maxDiff).toBeLessThanOrEqual(1e-11);
  });
});

describe("A14 — robustez del motor NFL", () => {
  it("es determinista y no muta la fila", () => {
    const row = nflRows[0]![1];
    const before = JSON.stringify(row);
    const a = predictNFL(row, nflModel);
    const b = predictNFL(row, nflModel);
    expect(a).toEqual(b);
    expect(JSON.stringify(row)).toBe(before);
  });

  it("imputa null con la media del escalador (equivale a 0 estandarizado)", () => {
    const row = nflRows[0]![1];
    const withNull = { ...row, features: row.features.map((_, i) => (i === 0 ? null : row.features[i])) };
    const imputed = {
      ...row,
      features: row.features.map((_, i) => (i === 0 ? nflModel.scaler.mean[0]! : row.features[i])),
    };
    const a = predictNFL(withNull as NFLSnapshotRow, nflModel);
    const b = predictNFL(imputed as NFLSnapshotRow, nflModel);
    expect(a.pHome).toBeCloseTo(b.pHome, 12);
    expect(a.pDraw).toBeCloseTo(b.pDraw, 12);
    expect(a.pAway).toBeCloseTo(b.pAway, 12);
  });

  it("rechaza un vector de features con longitud incorrecta", () => {
    const row = nflRows[0]![1];
    const bad = { ...row, features: row.features.slice(0, 10) } as NFLSnapshotRow;
    expect(() => predictNFL(bad, nflModel)).toThrow();
  });

  it("rechaza un valor no finito", () => {
    const row = nflRows[0]![1];
    const features = [...row.features];
    features[3] = Number.POSITIVE_INFINITY;
    expect(() => predictNFL({ ...row, features } as NFLSnapshotRow, nflModel)).toThrow();
  });
});

describe("A14 — predictForSport despacha al motor correcto", () => {
  const footballModel = footballModelJson as unknown as ModelArtifact;
  const footballSnapshot = footballSnapshotJson as unknown as SnapshotFile;
  const footballRow = Object.values(footballSnapshot.rows)[0] as SnapshotRow;

  it("usa NFL para sport='nfl'", () => {
    const request = { sport: "nfl", row: nflRows[0]![1], model: nflModel } as const;
    const prediction = predictForSport(request);
    expect(prediction.sport).toBe("nfl");
    expect(prediction.modelId).toBe(NFL_MODEL_ID);
    assertPredictionValid(prediction);
  });

  it("usa fútbol para sport='football'", () => {
    const request = {
      sport: "football",
      row: footballRow,
      model: footballModel,
      marketProbs: null,
    } as const;
    const prediction = predictForSport(request);
    expect(prediction.sport).toBe("football");
    assertPredictionValid(prediction);
  });

  it("usa el mercado cuando se pasa en fútbol", () => {
    const request = {
      sport: "football",
      row: footballRow,
      model: footballModel,
      marketProbs: [0.5, 0.25, 0.25],
    } as const;
    const prediction = predictForSport(request);
    expect(prediction.sport).toBe("football");
    expect(prediction.pHome).toBeCloseTo(0.5, 12);
    assertPredictionValid(prediction);
  });
});
