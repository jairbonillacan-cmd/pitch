/**
 * A10 — paridad numérica TS vs Python y contrato de fallback.
 *
 * Los dos JSON son copias byte a byte de
 * `research/prediction-lab/artifacts/model_v1/` (verificado con sha256).
 * Python redondea `probs_python` a 12 decimales en `export_model.py`, así que el
 * suelo de error esperado es ~5e-13; usamos 1e-9 como tolerancia contractual.
 */
import { describe, expect, it } from "vitest";
import modelJson from "../../src/data/prediction/model_motor_a.json";
import snapshotJson from "../../src/data/prediction/features_snapshot.json";
import {
  BASE_RATES_MODEL_ID,
  GLOBAL_HDA_RATES,
  InvalidFeaturesError,
  MARKET_MODEL_ID,
  MOTOR_A_MODEL_ID,
  PROBABILITY_SUM_TOLERANCE,
  isValidMarketProbs,
  normalizeBaseRates,
  predictMotorA,
  predictWithFallback,
  softmax3,
} from "../../src/domain/prediction/engine.js";
import type {
  ModelArtifact,
  Prediction,
  SnapshotFile,
  SnapshotRow,
} from "../../src/domain/prediction/types.js";

const model = modelJson as unknown as ModelArtifact;
const snapshot = snapshotJson as unknown as SnapshotFile;
const rows = Object.entries(snapshot.rows) as Array<[string, SnapshotRow]>;

/** Tolerancia contractual de paridad. */
const PARITY_TOLERANCE = 1e-9;
/** Tolerancia interna del simplex (la misma que valida el motor). */
const SIMPLEX_TOLERANCE = PROBABILITY_SUM_TOLERANCE;

function probabilities(prediction: Prediction): readonly [number, number, number] {
  return [prediction.pHome, prediction.pDraw, prediction.pAway];
}

function expectSimplex(prediction: Prediction, label: string): void {
  const probs = probabilities(prediction);
  for (let i = 0; i < probs.length; i += 1) {
    const p = probs[i]!;
    expect(Number.isFinite(p), `${label}: probabilidad ${i} no finita`).toBe(true);
    expect(p, `${label}: probabilidad ${i} < 0`).toBeGreaterThanOrEqual(0);
    expect(p, `${label}: probabilidad ${i} > 1`).toBeLessThanOrEqual(1);
  }
  const sum = probs[0] + probs[1] + probs[2];
  expect(Number.isFinite(sum), `${label}: suma no finita`).toBe(true);
  expect(Math.abs(sum - 1), `${label}: |suma - 1| = ${Math.abs(sum - 1)}`).toBeLessThanOrEqual(
    SIMPLEX_TOLERANCE,
  );
}


function withColumnScaler(
  source: ModelArtifact,
  index: number,
  mean: number,
  scale: number,
): ModelArtifact {
  return {
    ...source,
    scaler: {
      ...source.scaler,
      mean: source.scaler.mean.map((value, i) => (i === index ? mean : value)),
      scale: source.scaler.scale.map((value, i) => (i === index ? scale : value)),
    },
  };
}

function cloneWithNaNsInImputer(source: ModelArtifact, index: number): ModelArtifact {
  return {
    ...source,
    imputer: {
      ...source.imputer,
      statistics: source.imputer.statistics.map((value, i) =>
        i === index ? Number.NaN : value,
      ),
    },
  };
}

describe("A10 — artefacto del modelo", () => {
  it("tiene 77 columnas (54 features + 23 dummies) y 3 clases", () => {
    expect(model.type).toBe("multinomial_logistic");
    expect(model.features).toHaveLength(77);
    expect(model.n_features_base).toBe(54);
    expect(model.div_levels).toHaveLength(23);
    expect(model.features.slice(54)).toEqual(
      model.div_levels.map((div) => `div_${div}`),
    );
    expect(new Set(model.features).size).toBe(77);
    expect(model.coef).toHaveLength(3);
    for (let k = 0; k < 3; k += 1) {
      expect(model.coef[k]).toHaveLength(77);
    }
    expect(model.intercept).toHaveLength(3);
    expect(model.classes).toHaveLength(3);
    expect(model.imputer.statistics).toHaveLength(77);
    expect(model.scaler.mean).toHaveLength(77);
    expect(model.scaler.scale).toHaveLength(77);
  });

  it("el snapshot tiene 200 filas con 54 features y 23 dummies cada una", () => {
    expect(rows).toHaveLength(200);
    expect(snapshot.n).toBe(200);
    for (const [matchId, row] of rows) {
      expect(row.features, `${matchId}: features`).toHaveLength(54);
      expect(row.div_onehot, `${matchId}: div_onehot`).toHaveLength(23);
      expect(row.probs_python, `${matchId}: probs_python`).toHaveLength(3);
    }
  });

  it("el one-hot de cada fila respeta el orden de div_levels", () => {
    for (const [matchId, row] of rows) {
      const expected = model.div_levels.map((div) => (row.div === div ? 1 : 0));
      expect(row.div_onehot, `${matchId}: one-hot de ${row.div}`).toEqual(expected);
    }
  });

  it("trata scale=0 como 1", () => {
    const [, row] = rows[0]!;
    const zeroScale = withColumnScaler(model, 0, 0, 0);
    const unitScale = withColumnScaler(model, 0, 0, 1);
    expect(predictMotorA(row, zeroScale)).toEqual(predictMotorA(row, unitScale));
    expectSimplex(predictMotorA(row, zeroScale), "scale=0");
  });

  it("rechaza artefactos con dimensiones incompletas", () => {
    const firstRow = rows[0]![1];
    const broken: ModelArtifact = {
      ...model,
      coef: [model.coef[0]!.slice(0, 76), model.coef[1]!, model.coef[2]!],
    };
    expect(() => predictMotorA(firstRow, broken)).toThrow(/ModelArtifact inválido/);
  });
});

describe("A10 — paridad numérica con Python", () => {
  it("reproduce probs_python en los 200 partidos con |Δ| <= 1e-9", () => {
    let comparisons = 0;
    let maxAbsDiff = 0;
    let sumAbsDiff = 0;
    let above1e12 = 0;
    let maxMatchId = "";
    let maxField = "";

    for (const [matchId, row] of rows) {
      const expected = row.probs_python;
      expect(expected, `${matchId}: falta probs_python`).toBeDefined();
      expect(expected, `${matchId}: probs_python debe tener 3 valores`).toHaveLength(3);

      const prediction = predictMotorA(row, model);
      const actual = probabilities(prediction);

      for (let i = 0; i < 3; i += 1) {
        const python = expected![i]!;
        const diff = Math.abs(actual[i]! - python);
        comparisons += 1;
        sumAbsDiff += diff;
        if (diff > 1e-12) {
          above1e12 += 1;
        }
        if (diff > maxAbsDiff) {
          maxAbsDiff = diff;
          maxMatchId = matchId;
          maxField = ["H", "D", "A"][i]!;
        }
        expect(
          diff,
          `${matchId} ${["H", "D", "A"][i]}: TS=${actual[i]} Python=${python} |Δ|=${diff}`,
        ).toBeLessThanOrEqual(PARITY_TOLERANCE);
      }
    }

    expect(comparisons).toBe(600);
    expect(maxAbsDiff).toBeLessThanOrEqual(PARITY_TOLERANCE);
    expect(above1e12).toBe(0);
    // Traza reproducible para el informe A10.
    console.log(
      `[A10] paridad Motor A: ${rows.length} partidos / ${comparisons} comparaciones; ` +
        `max|Δ|=${maxAbsDiff.toExponential(3)} (${maxMatchId} ${maxField}); ` +
        `mean|Δ|=${(sumAbsDiff / comparisons).toExponential(3)}; ` +
        `>1e-12=${above1e12}`,
    );
  });

  it("es determinista y no muta ni la fila ni el modelo", () => {
    const [, row] = rows[0]!;
    const rowBefore = JSON.stringify(row);
    const modelBefore = JSON.stringify(model);

    const first = predictMotorA(row, model);
    const second = predictMotorA(row, model);

    expect(first).toEqual(second);
    expect(JSON.stringify(row)).toBe(rowBefore);
    expect(JSON.stringify(model)).toBe(modelBefore);
    expect(first.modelId).toBe(MOTOR_A_MODEL_ID);
    expect(first.modelVersion).toBe(model.version);
    expect(first.generatedAt).toBe(model.created_at);
    expect(first.dataQualityFlag).toBe("ok");
  });

  it("mantiene el simplex y el rango [0,1] en los 200 partidos", () => {
    for (const [matchId, row] of rows) {
      expectSimplex(predictMotorA(row, model), matchId);
    }
  });

  it("softmax3 es estable con logits grandes y suman 1", () => {
    const probs = softmax3([1000, 1001, 1002]);
    expect(probs.every((p) => Number.isFinite(p) && p >= 0 && p <= 1)).toBe(true);
    expect(probs[0] + probs[1] + probs[2]).toBeCloseTo(1, 12);
    expect(probs[2]).toBeGreaterThan(probs[1]);
    expect(probs[1]).toBeGreaterThan(probs[0]);
  });
});

describe("A10 — nulls e imputación", () => {
  const nullRows = rows.filter(([, row]) => row.features.some((value) => value === null));

  it("hay al menos 10 filas con nulls y el imputer usa la mediana del artefacto", () => {
    expect(nullRows.length).toBeGreaterThanOrEqual(10);

    let checked = 0;
    for (const [matchId, row] of nullRows) {
      const imputedRow: SnapshotRow = {
        ...row,
        features: row.features.map((value, i) =>
          value === null ? model.imputer.statistics[i]! : value,
        ),
      };
      const withNulls = predictMotorA(row, model);
      const withMedian = predictMotorA(imputedRow, model);

      expect(withNulls, `${matchId}: null imputado != mediana explícita`).toEqual(withMedian);
      expectSimplex(withNulls, `${matchId} (nulls)`);
      checked += 1;
    }

    expect(checked).toBe(nullRows.length);
    console.log(
      `[A10] nulls: ${checked}/${rows.length} filas con al menos un null; ` +
        `todas igualan la imputación explícita por mediana`,
    );
  });

  it("no trata null como 0", () => {
    const [, row] = nullRows[0]!;
    const zeroed: SnapshotRow = {
      ...row,
      features: row.features.map((value) => (value === null ? 0 : value)),
    };
    expect(predictMotorA(row, model)).not.toEqual(predictMotorA(zeroed, model));
  });

  it("trata NaN como missing cuando la mediana es finita", () => {
    const [, row] = nullRows[0]!;
    const nanRow: SnapshotRow = {
      ...row,
      features: row.features.map((value, i) =>
        value === null ? Number.NaN : value,
      ),
    };
    const imputedRow: SnapshotRow = {
      ...row,
      features: row.features.map((value, i) =>
        value === null ? model.imputer.statistics[i]! : value,
      ),
    };
    expect(predictMotorA(nanRow, model)).toEqual(predictMotorA(imputedRow, model));
  });

  it("marca invalid_features si un null no tiene mediana finita", () => {
    const [, row] = nullRows[0]!;
    const nullIndex = row.features.findIndex((value) => value === null);
    expect(nullIndex).toBeGreaterThanOrEqual(0);

    const brokenModel = cloneWithNaNsInImputer(model, nullIndex);
    expect(() => predictMotorA(row, brokenModel)).toThrow(InvalidFeaturesError);

    const prediction = predictWithFallback(row, brokenModel);
    expect(prediction.dataQualityFlag).toBe("invalid_features");
    expect(prediction.modelId).toBe(BASE_RATES_MODEL_ID);
    expectSimplex(prediction, "fallback invalid_features");
    expect(prediction.pHome).toBeCloseTo(0.44, 9);
    expect(prediction.pDraw).toBeCloseTo(0.26, 9);
    expect(prediction.pAway).toBeCloseTo(0.3, 9);
  });
});

describe("A10 — predictWithFallback", () => {
  const [, row] = rows[0]!;

  it("usa el mercado cuando el vector es válido", () => {
    const prediction = predictWithFallback(row, model, [0.5, 0.3, 0.2]);
    expect(prediction.modelId).toBe(MARKET_MODEL_ID);
    expect(prediction.dataQualityFlag).toBe("ok");
    expect(prediction.pHome).toBeCloseTo(0.5, 12);
    expect(prediction.pDraw).toBeCloseTo(0.3, 12);
    expect(prediction.pAway).toBeCloseTo(0.2, 12);
    expectSimplex(prediction, "market_devig");
  });

  it("normaliza un mercado válido con suma 1 ± 1e-6", () => {
    expect(isValidMarketProbs([0.5000004, 0.3, 0.2])).toBe(true);
    const prediction = predictWithFallback(row, model, [0.5000004, 0.3, 0.2]);
    expect(prediction.modelId).toBe(MARKET_MODEL_ID);
    expectSimplex(prediction, "market_devig normalizado");
  });

  it("usa Motor A cuando no hay mercado", () => {
    for (const market of [undefined, null]) {
      const prediction = predictWithFallback(row, model, market);
      expect(prediction.modelId).toBe(MOTOR_A_MODEL_ID);
      expect(prediction.dataQualityFlag).toBe("ok");
      expect(prediction).toEqual(predictMotorA(row, model));
    }
  });

  it("vuelve a Motor A con flag fallback_motor_a si el mercado es inválido", () => {
    const invalidMarkets: ReadonlyArray<readonly number[]> = [
      [0.5, 0.3, 0.3],
      [0.5, 0.3],
      [0.5, 0.3, 0.2, 0.0],
      [Number.NaN, 0.5, 0.5],
      [-0.1, 0.6, 0.5],
      [0, 0, 0],
      [1.1, -0.1, 0],
    ];
    const motorA = predictMotorA(row, model);
    for (const market of invalidMarkets) {
      expect(isValidMarketProbs(market)).toBe(false);
      const prediction = predictWithFallback(row, model, market);
      expect(prediction.modelId).toBe(MOTOR_A_MODEL_ID);
      expect(prediction.dataQualityFlag).toBe("fallback_motor_a");
      expect(prediction).toEqual({ ...motorA, dataQualityFlag: "fallback_motor_a" });
    }
  });

  it("devuelve invalid_features con features corruptas y nunca lanza", () => {
    const corruptRows: SnapshotRow[] = [
      { ...row, features: row.features.slice(0, 53) },
      { ...row, features: [...row.features.slice(0, 53), Number.POSITIVE_INFINITY] },
      { ...row, features: [...row.features.slice(0, 53), Number.NEGATIVE_INFINITY] },
      { ...row, div_onehot: row.div_onehot.slice(0, 22) },
      { ...row, div_onehot: [...row.div_onehot.slice(0, 22), Number.NaN] },
    ];

    for (const corrupt of corruptRows) {
      expect(() => predictMotorA(corrupt, model)).toThrow(InvalidFeaturesError);
      expect(() => predictWithFallback(corrupt, model)).not.toThrow();

      const prediction = predictWithFallback(corrupt, model);
      expect(prediction.dataQualityFlag).toBe("invalid_features");
      expect(prediction.modelId).toBe(BASE_RATES_MODEL_ID);
      expectSimplex(prediction, "invalid_features");
    }
  });

  it("acepta un prior H/D/A explícito para invalid_features", () => {
    const corrupt: SnapshotRow = { ...row, features: row.features.slice(0, 10) };
    const prediction = predictWithFallback(corrupt, model, undefined, {
      pHome: 0.5,
      pDraw: 0.25,
      pAway: 0.25,
    });
    expect(prediction.dataQualityFlag).toBe("invalid_features");
    expect(prediction.pHome).toBeCloseTo(0.5, 12);
    expect(prediction.pDraw).toBeCloseTo(0.25, 12);
    expect(prediction.pAway).toBeCloseTo(0.25, 12);
  });

  it("el mercado válido no depende de las features", () => {
    const corrupt: SnapshotRow = { ...row, features: [] };
    const prediction = predictWithFallback(corrupt, model, [0.4, 0.3, 0.3]);
    expect(prediction.modelId).toBe(MARKET_MODEL_ID);
    expect(prediction.dataQualityFlag).toBe("ok");
  });
});

describe("A10 — normalización del prior", () => {
  it("normaliza GLOBAL_HDA_RATES y descarta priors inválidos", () => {
    const normalized = normalizeBaseRates(GLOBAL_HDA_RATES);
    expect(normalized.pHome + normalized.pDraw + normalized.pAway).toBeCloseTo(1, 12);

    for (const bad of [
      { pHome: Number.NaN, pDraw: 0.26, pAway: 0.3 },
      { pHome: -0.1, pDraw: 0.8, pAway: 0.3 },
      { pHome: 0, pDraw: 0, pAway: 0 },
    ]) {
      const fallback = normalizeBaseRates(bad);
      expect(fallback).toEqual(GLOBAL_HDA_RATES);
    }
  });
});
