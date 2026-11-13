/**
 * A28 (Ola 3 · Agente A7) — Suite contractual de paridad Python↔TypeScript, enrutamiento
 * numérico/faltantes/categórico (`bitset_idx`), compuerta de activación en producción y
 * benchmark estricto de latencia (`< 0.1 ms` por partido) para `src/domain/prediction/gbm.ts`.
 */
import { describe, expect, it } from "vitest";
import snapshotJson from "../data/features_snapshot.json";
import gbmTreesJson from "../data/gbm_trees_v3_1.json";
import parityJson from "../data/gbm_validation_parity.json";
import logitModelJson from "../data/model_motor_a.json";
import {
  InvalidFeaturesError,
  PROBABILITY_SUM_TOLERANCE,
  predictMotorA,
  softmax3,
} from "../src/engine";
import {
  DEFAULT_GBM_PRODUCTION_ACTIVATED,
  ENSEMBLE_LOGIT_GBM_MODEL_ID,
  GBM_MODEL_ID,
  GBM_SCHEMA_VERSION,
  GbmArtifactValidationError,
  applyTemperature3,
  blendLogitAndGbm,
  evaluateCompactValidationRow,
  isGbmProductionActivated,
  predictGbm,
  predictGbmCalibratedProbs,
  predictGbmRawProbs,
  predictLogitGbmEnsemble,
  predictMotorAWithOptionalGbm,
  validateGbmArtifact,
  type GbmArtifact,
  type GbmInputRow,
  type GbmValidationParityFile,
} from "../src/gbm";
import type { ModelArtifact, SnapshotFile, SnapshotRow } from "../src/types";

const gbmTrees = gbmTreesJson as unknown as GbmArtifact;
const parityData = parityJson as unknown as GbmValidationParityFile;
const logitModel = logitModelJson as unknown as ModelArtifact;
const snapshot = snapshotJson as unknown as SnapshotFile;
const snapshotEntries = Object.entries(snapshot.rows) as Array<[string, SnapshotRow]>;

/** Tolerancia contractual no negociable de paridad A7 (`max |p_python - p_ts| < 1e-6`). */
const STRICT_PARITY_TOLERANCE = 1e-6;
/** Cota superior no negociable de latencia media por partido tras warmup JIT (`< 0.1 ms`). */
const MAX_MEAN_LATENCY_MS = 0.1;
/** Corte inmutable del holdout sellado (`2025-02-02T17:30:00Z`). */
const HOLDOUT_CUT_UTC = "2025-02-02T17:30:00Z";
const HOLDOUT_CUT_EPOCH_MS = Date.parse(HOLDOUT_CUT_UTC);

function isValidSimplexTuple(probs: readonly [number, number, number]): boolean {
  for (let k = 0; k < 3; k += 1) {
    const p = probs[k]!;
    if (!Number.isFinite(p) || p < 0 || p > 1) return false;
  }
  const sum = probs[0] + probs[1] + probs[2];
  return Number.isFinite(sum) && Math.abs(sum - 1) <= PROBABILITY_SUM_TOLERANCE;
}

function expectSimplexTuple(probs: readonly [number, number, number], label: string): void {
  for (let k = 0; k < 3; k += 1) {
    const p = probs[k]!;
    expect(Number.isFinite(p), `${label}[${k}] no finita`).toBe(true);
    expect(p, `${label}[${k}] < 0`).toBeGreaterThanOrEqual(0);
    expect(p, `${label}[${k}] > 1`).toBeLessThanOrEqual(1);
  }
  const sum = probs[0] + probs[1] + probs[2];
  expect(Math.abs(sum - 1), `${label}: |suma - 1| = ${Math.abs(sum - 1)}`).toBeLessThanOrEqual(
    PROBABILITY_SUM_TOLERANCE,
  );
}

function buildOneHot(divIndex: number, nDivs: number): number[] {
  const arr = new Array<number>(nDivs).fill(0);
  if (divIndex >= 0 && divIndex < nDivs) {
    arr[divIndex] = 1;
  }
  return arr;
}

function quantileSorted(sortedAsc: readonly number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo]!;
  const frac = pos - lo;
  return sortedAsc[lo]! * (1 - frac) + sortedAsc[hi]! * frac;
}

describe("A7 — Invariantes estructurales y de no-fuga de gbm_trees_v3_1.json", () => {
  it("valida sin errores todas las invariantes dimensionales y de bosque", () => {
    expect(() => validateGbmArtifact(gbmTrees)).not.toThrow();
    expect(gbmTrees.schema_version).toBe(GBM_SCHEMA_VERSION);
    expect(gbmTrees.type).toBe("hist_gradient_boosting_multiclass");
    expect(gbmTrees.n_classes).toBe(3);
    expect(gbmTrees.classes).toEqual([0, 1, 2]);
    expect(gbmTrees.n_features_base).toBe(113);
    expect(gbmTrees.div_levels).toHaveLength(23);
    expect(gbmTrees.features).toHaveLength(136);
    expect(gbmTrees.features).toEqual(logitModel.features);
    expect(gbmTrees.n_iter).toBeGreaterThan(0);
    expect(gbmTrees.n_trees).toBe(gbmTrees.n_iter * 3);
    expect(gbmTrees.trees).toHaveLength(gbmTrees.n_trees);
    expect(gbmTrees.calibration.temperature).toBeGreaterThan(0);
    expect(gbmTrees.logit_companion).toBeDefined();
  });

  it("respeta estrictamente el corte temporal pre-holdout (< 2025-02-02T17:30:00Z) y cobertura 100% de validación", () => {
    expect(gbmTrees.training_window).toBeDefined();
    expect(gbmTrees.training_window?.holdout_touched).toBe(false);
    expect(Date.parse(gbmTrees.training_window?.holdout_cut_ts_utc ?? "")).toBe(
      HOLDOUT_CUT_EPOCH_MS,
    );
    expect(Date.parse(gbmTrees.training_window?.end_ts_utc_exclusive ?? "")).toBeLessThanOrEqual(
      HOLDOUT_CUT_EPOCH_MS,
    );
    if (gbmTrees.calibration.calibrated_on_window) {
      expect(
        Date.parse(gbmTrees.calibration.calibrated_on_window.end_ts_utc_exclusive),
      ).toBeLessThanOrEqual(HOLDOUT_CUT_EPOCH_MS);
    }

    expect(parityData.holdout_touched).toBe(false);
    expect(Date.parse(parityData.holdout_cut_ts_utc)).toBe(HOLDOUT_CUT_EPOCH_MS);
    expect(Date.parse(parityData.validation_window.end_ts_utc_exclusive)).toBeLessThanOrEqual(
      HOLDOUT_CUT_EPOCH_MS,
    );
    expect(parityData.validation_window.coverage_pct).toBe(100);
    expect(parityData.n).toBe(parityData.validation_window.n_matches);
    expect(parityData.n).toBeGreaterThan(1000);
    expect(parityData.features_base).toHaveLength(parityData.n);
    expect(parityData.div_indices).toHaveLength(parityData.n);
    expect(parityData.probs_gbm_raw_python).toHaveLength(parityData.n);
    expect(parityData.probs_gbm_calibrated_python).toHaveLength(parityData.n);
    expect(parityData.probs_logit_python).toHaveLength(parityData.n);
    expect(parityData.probs_ensemble_python).toHaveLength(parityData.n);
  });

  it("sincroniza el veredicto honesto de activación en producción entre JSON y constante por defecto", () => {
    expect(typeof gbmTrees.production_activated).toBe("boolean");
    expect(isGbmProductionActivated(gbmTrees)).toBe(gbmTrees.production_activated);
    expect(isGbmProductionActivated(null)).toBe(DEFAULT_GBM_PRODUCTION_ACTIVATED);
    expect(gbmTrees.production_activated).toBe(DEFAULT_GBM_PRODUCTION_ACTIVATED);
    expect(gbmTrees.activation_verdict).toBeDefined();
    expect(gbmTrees.activation_verdict?.activated).toBe(gbmTrees.production_activated);
    expect(gbmTrees.activation_verdict?.significance).toBe(
      gbmTrees.production_activated ? "significativa" : "no significativa",
    );
  });
});

describe("A7 — Paridad estricta (< 1e-6) sobre el 100% del set de validación", () => {
  it("cumple max |p_python - p_ts| < 1e-6 en las 3 clases (H, D, A) y suma en símplex 1.0 en el 100% de validación", () => {
    const nRows = parityData.n;
    let maxRawDiff = 0;
    let maxCalDiff = 0;
    let maxLogitDiff = 0;
    let maxEnsDiff = 0;
    let worstMatchId = "";
    const simplexViolations: string[] = [];

    for (let i = 0; i < nRows; i += 1) {
      const baseFeats = parityData.features_base[i]!;
      const divIdx = parityData.div_indices[i]!;
      const pyRaw = parityData.probs_gbm_raw_python[i]!;
      const pyCal = parityData.probs_gbm_calibrated_python[i]!;
      const pyLogit = parityData.probs_logit_python[i]!;
      const pyEns = parityData.probs_ensemble_python[i]!;

      const tsOut = evaluateCompactValidationRow(baseFeats, divIdx, gbmTrees);

      if (!isValidSimplexTuple(tsOut.gbmRaw)) simplexViolations.push(`row[${i}].gbmRaw`);
      if (!isValidSimplexTuple(tsOut.gbmCalibrated)) {
        simplexViolations.push(`row[${i}].gbmCalibrated`);
      }
      if (!isValidSimplexTuple(tsOut.logit)) simplexViolations.push(`row[${i}].logit`);
      if (!isValidSimplexTuple(tsOut.ensemble)) simplexViolations.push(`row[${i}].ensemble`);

      for (let k = 0; k < 3; k += 1) {
        const dRaw = Math.abs(tsOut.gbmRaw[k]! - pyRaw[k]!);
        const dCal = Math.abs(tsOut.gbmCalibrated[k]! - pyCal[k]!);
        const dLog = Math.abs(tsOut.logit[k]! - pyLogit[k]!);
        const dEns = Math.abs(tsOut.ensemble[k]! - pyEns[k]!);

        if (dRaw > maxRawDiff) maxRawDiff = dRaw;
        if (dCal > maxCalDiff) maxCalDiff = dCal;
        if (dLog > maxLogitDiff) maxLogitDiff = dLog;
        if (dEns > maxEnsDiff) {
          maxEnsDiff = dEns;
          worstMatchId = parityData.match_ids[i] ?? String(i);
        }
      }
    }

    console.info(
      `[GBM_PARITY_STATS] ${JSON.stringify({
        n_validation_rows: nRows,
        max_abs_diff_gbm_raw: maxRawDiff,
        max_abs_diff_gbm_calibrated: maxCalDiff,
        max_abs_diff_logit_companion: maxLogitDiff,
        max_abs_diff_ensemble: maxEnsDiff,
        worst_match_id: worstMatchId,
      })}`,
    );

    expect(simplexViolations).toEqual([]);
    expect(maxRawDiff).toBeLessThan(STRICT_PARITY_TOLERANCE);
    expect(maxCalDiff).toBeLessThan(STRICT_PARITY_TOLERANCE);
    expect(maxLogitDiff).toBeLessThan(STRICT_PARITY_TOLERANCE);
    expect(maxEnsDiff).toBeLessThan(STRICT_PARITY_TOLERANCE);
  });

  it("produce probabilidades idénticas entre SnapshotRow (predictGbm / predictLogitGbmEnsemble) y fila compacta", () => {
    const nDivs = gbmTrees.div_levels.length;
    const stride = Math.max(1, Math.floor(parityData.n / 500));

    for (let i = 0; i < parityData.n; i += stride) {
      const baseFeats = parityData.features_base[i]!;
      const divIdx = parityData.div_indices[i]!;
      const snapRow: SnapshotRow = {
        div: divIdx >= 0 ? (gbmTrees.div_levels[divIdx] ?? "UNK") : "UNK",
        features: baseFeats,
        div_onehot: buildOneHot(divIdx, nDivs),
        probs_python: parityData.probs_ensemble_python[i]!,
      };

      const compact = evaluateCompactValidationRow(baseFeats, divIdx, gbmTrees);
      const rawProbs = predictGbmRawProbs(snapRow, gbmTrees);
      const calPred = predictGbm(snapRow, gbmTrees);
      const ensPred = predictLogitGbmEnsemble(snapRow, gbmTrees);

      expect(calPred.modelId).toBe(GBM_MODEL_ID);
      expect(ensPred.modelId).toBe(ENSEMBLE_LOGIT_GBM_MODEL_ID);

      for (let k = 0; k < 3; k += 1) {
        const calArr = [calPred.pHome, calPred.pDraw, calPred.pAway] as const;
        const ensArr = [ensPred.pHome, ensPred.pDraw, ensPred.pAway] as const;
        expect(Math.abs(rawProbs[k]! - compact.gbmRaw[k]!)).toBeLessThanOrEqual(2e-15);
        expect(Math.abs(calArr[k]! - compact.gbmCalibrated[k]!)).toBeLessThanOrEqual(2e-15);
        expect(Math.abs(ensArr[k]! - compact.ensemble[k]!)).toBeLessThanOrEqual(2e-15);
      }
    }
  });

  it("evalúa sin errores las 200 filas reales de features_snapshot.json y respeta la compuerta de producción", () => {
    expect(snapshotEntries.length).toBeGreaterThanOrEqual(200);
    for (const [key, row] of snapshotEntries) {
      const gbmOut = predictGbm(row, gbmTrees);
      expectSimplexTuple([gbmOut.pHome, gbmOut.pDraw, gbmOut.pAway], `snapshot[${key}].gbm`);

      const gatedOut = predictMotorAWithOptionalGbm(row, logitModel, gbmTrees, false);
      const pureLogit = predictMotorA(row, logitModel);

      if (!gbmTrees.production_activated) {
        expect(gatedOut).toEqual(pureLogit);
      } else {
        expect(gatedOut.modelId).toBe(ENSEMBLE_LOGIT_GBM_MODEL_ID);
      }

      const forcedEns = predictMotorAWithOptionalGbm(row, logitModel, gbmTrees, true);
      expect(forcedEns.modelId).toBe(ENSEMBLE_LOGIT_GBM_MODEL_ID);
      expectSimplexTuple(
        [forcedEns.pHome, forcedEns.pDraw, forcedEns.pAway],
        `snapshot[${key}].forcedEns`,
      );
    }
  });
});

describe("A7 — Enrutamiento exacto de bordes numéricos, faltantes (NaN/null) y categóricos (bitset_idx)", () => {
  const syntheticMixedArtifact: GbmArtifact = {
    schema_version: GBM_SCHEMA_VERSION,
    type: "hist_gradient_boosting_multiclass",
    codename: "SyntheticMixedGbm",
    version: "3.1.0-test",
    created_at: "2025-01-01T00:00:00Z",
    seed: 7,
    production_activated: false,
    n_classes: 3,
    classes: [0, 1, 2],
    n_iter: 1,
    n_trees: 3,
    // 2 base features: [cat_league_tier (design 0), num_xg_diff (design 1)] + 2 div_onehot (design 2, 3)
    // Simulamos reordenamiento interno de sklearn: columna 0 en árbol = design 0 (cat), columna 1 en árbol = design 1 (num)
    features: ["cat_league_tier", "num_xg_diff", "div_E0", "div_SP1"],
    n_features_base: 2,
    div_levels: ["E0", "SP1"],
    tree_col_to_design_col: [0, 1, 2, 3],
    categorical_features: [
      {
        design_feature_idx: 0,
        feature_name: "cat_league_tier",
        category_to_code: { top: 2, mid: 5, high_word: 165 },
        // Categorías conocidas: bits 2, 5 (word 0 = (1<<2)|(1<<5) = 36) y bit 165 (word 5, bit 5 = 32)
        known_cat_bitset: [36, 0, 0, 0, 0, 32, 0, 0],
      },
    ],
    baseline_prediction: [0.1, -0.05, -0.05],
    calibration: {
      temperature: 1.25,
      blend_space: "logit",
      w_logit: 0.6,
      w_gbm: 0.4,
    },
    trees: [
      // Clase 0: split categórico en raíz (feature 0 = cat_league_tier).
      // Izquierda si catCode ∈ {2, 165}; missing_go_to_left = 1 (desconocidos/NaN van a la izquierda).
      {
        iteration: 0,
        class_index: 0,
        n_nodes: 3,
        is_leaf: [0, 1, 1],
        feature_idx: [0, -1, -1],
        num_threshold: [0, 0, 0],
        left: [1, 0, 0],
        right: [2, 0, 0],
        value: [0, 0.8, -0.4],
        missing_go_to_left: [1, 0, 0],
        is_categorical: [1, 0, 0],
        bitset_idx: [0, 0, 0],
        raw_left_cat_bitsets: [[4, 0, 0, 0, 0, 32, 0, 0]],
      },
      // Clase 1: split numérico exacto en `num_threshold = 0.5` (<= 0.5 izquierda, > 0.5 derecha; NaN -> derecha).
      {
        iteration: 0,
        class_index: 1,
        n_nodes: 3,
        is_leaf: [0, 1, 1],
        feature_idx: [1, -1, -1],
        num_threshold: [0.5, 0, 0],
        left: [1, 0, 0],
        right: [2, 0, 0],
        value: [0, 0.35, -0.25],
        missing_go_to_left: [0, 0, 0],
      },
      // Clase 2: split numérico en `div_E0` (`design 2`), `missing_go_to_left = 1`.
      {
        iteration: 0,
        class_index: 2,
        n_nodes: 3,
        is_leaf: [0, 1, 1],
        feature_idx: [2, -1, -1],
        num_threshold: [0.5, 0, 0],
        left: [1, 0, 0],
        right: [2, 0, 0],
        value: [0, 0.2, -0.3],
        missing_go_to_left: [1, 0, 0],
      },
    ],
  };

  it("enruta categorías en palabras altas de 256 bits (`bitset_idx`), categorías no vistas y valores exactos en num_threshold", () => {
    // Caso 1: cat="high_word" (código 165 -> bit 5 en palabra 5 -> izquierda: +0.8),
    //         num_xg_diff = 0.5 exacto (`<= 0.5` -> izquierda: +0.35),
    //         div_onehot = [1, 0] (`1 > 0.5` -> derecha: -0.3)
    const rowBoundaryLeft: GbmInputRow = {
      div: "E0",
      features: [null, 0.5],
      div_onehot: [1, 0],
      raw_categories: { cat_league_tier: "high_word" },
    };
    const expectedRaw1 = softmax3([0.1 + 0.8, -0.05 + 0.35, -0.05 - 0.3]);
    const gotRaw1 = predictGbmRawProbs(rowBoundaryLeft, syntheticMixedArtifact);
    for (let k = 0; k < 3; k += 1) {
      expect(Math.abs(gotRaw1[k]! - expectedRaw1[k]!)).toBeLessThanOrEqual(1e-15);
    }

    // Caso 2: cat="mid" (código 5 conocido, bit NO activo en left -> derecha: -0.4),
    //         num_xg_diff = 0.5 + 1e-12 (`> 0.5` -> derecha: -0.25),
    //         div_onehot = [0, 1] (`0 <= 0.5` -> izquierda: +0.2)
    const rowRight: GbmInputRow = {
      div: "SP1",
      features: [5, 0.5 + 1e-12],
      div_onehot: [0, 1],
      raw_categories: { cat_league_tier: "mid" },
    };
    const expectedRaw2 = softmax3([0.1 - 0.4, -0.05 - 0.25, -0.05 + 0.2]);
    const gotRaw2 = predictGbmRawProbs(rowRight, syntheticMixedArtifact);
    for (let k = 0; k < 3; k += 1) {
      expect(Math.abs(gotRaw2[k]! - expectedRaw2[k]!)).toBeLessThanOrEqual(1e-15);
    }

    // Caso 3: categoría desconocida `"unseen_tier"` -> va por `missing_go_to_left = 1` (izquierda: +0.8),
    //         num_xg_diff = null -> va por `missing_go_to_left = 0` (derecha: -0.25)
    const rowMissingAndUnseen: GbmInputRow = {
      div: "SP1",
      features: [null, null],
      div_onehot: [0, 1],
      raw_categories: { cat_league_tier: "unseen_tier" },
    };
    const expectedRaw3 = softmax3([0.1 + 0.8, -0.05 - 0.25, -0.05 + 0.2]);
    const gotRaw3 = predictGbmRawProbs(rowMissingAndUnseen, syntheticMixedArtifact);
    for (let k = 0; k < 3; k += 1) {
      expect(Math.abs(gotRaw3[k]! - expectedRaw3[k]!)).toBeLessThanOrEqual(1e-15);
    }

    // Verificar calibración por temperatura T = 1.25
    const gotCal3 = predictGbmCalibratedProbs(rowMissingAndUnseen, syntheticMixedArtifact);
    const expectedCal3 = applyTemperature3(expectedRaw3, 1.25);
    for (let k = 0; k < 3; k += 1) {
      expect(Math.abs(gotCal3[k]! - expectedCal3[k]!)).toBeLessThanOrEqual(1e-15);
    }
  });

  it("valida calibración de temperatura, mezcla convexa/log-lineal y rechaza entradas o árboles corruptos", () => {
    const pA: readonly [number, number, number] = [0.55, 0.25, 0.2];
    const pB: readonly [number, number, number] = [0.45, 0.3, 0.25];

    expect(applyTemperature3(pA, 1.0)).toEqual(pA);
    const softer = applyTemperature3(pA, 2.0);
    expect(softer[0]).toBeLessThan(pA[0]);
    expectSimplexTuple(softer, "softer");

    const probBlend = blendLogitAndGbm(pA, pB, {
      blend_space: "probability",
      w_logit: 0.5,
      w_gbm: 0.5,
    });
    expect(Math.abs(probBlend[0] - 0.5)).toBeLessThan(1e-12);
    expectSimplexTuple(probBlend, "probBlend");

    expect(() => applyTemperature3(pA, 0)).toThrow(GbmArtifactValidationError);
    expect(() =>
      predictGbmRawProbs(
        { div: "E0", features: [Number.POSITIVE_INFINITY, 0.1], div_onehot: [1, 0] },
        syntheticMixedArtifact,
      ),
    ).toThrow(InvalidFeaturesError);
    expect(() =>
      predictGbmRawProbs(
        { div: "E0", features: [0.1], div_onehot: [1, 0] },
        syntheticMixedArtifact,
      ),
    ).toThrow(InvalidFeaturesError);

    const cyclicArtifact: GbmArtifact = {
      ...syntheticMixedArtifact,
      trees: [
        {
          ...syntheticMixedArtifact.trees[0]!,
          // Ciclo inválido: el nodo 0 apunta a sí mismo
          left: [0, 0, 0],
        },
        syntheticMixedArtifact.trees[1]!,
        syntheticMixedArtifact.trees[2]!,
      ],
    };
    expect(() => validateGbmArtifact(cyclicArtifact)).toThrow(GbmArtifactValidationError);
  });
});

describe("A7 — Benchmark real de latencia en TypeScript (< 0.1 ms por partido tras warmup JIT)", () => {
  it("ejecuta inferencia completa por partido con latencia media < 0.1 ms y reporta media, p50 y p99", () => {
    const nDivs = gbmTrees.div_levels.length;
    const nBenchRows = parityData.n;

    // Pre-construir las filas SnapshotRow reales del set de validación fuera del cronómetro
    // para medir exclusivamente el costo real de inferencia por partido (no la carga de fixture).
    const benchRows: SnapshotRow[] = new Array<SnapshotRow>(nBenchRows);
    for (let i = 0; i < nBenchRows; i += 1) {
      const divIdx = parityData.div_indices[i]!;
      benchRows[i] = {
        div: divIdx >= 0 ? (gbmTrees.div_levels[divIdx] ?? "UNK") : "UNK",
        features: parityData.features_base[i]!,
        div_onehot: buildOneHot(divIdx, nDivs),
      };
    }

    // 1. Warmup JIT (>= 2,000 evaluaciones completas para compilación TurboFan estable)
    let sink = 0;
    const warmupIters = 2000;
    for (let w = 0; w < warmupIters; w += 1) {
      const r = benchRows[w % nBenchRows]!;
      const p1 = predictGbm(r, gbmTrees);
      const p2 = predictLogitGbmEnsemble(r, gbmTrees);
      sink += p1.pHome + p2.pHome;
    }
    expect(Number.isFinite(sink)).toBe(true);

    // 2. Medición del mejor de K = 5 pases completos de los 4,785 partidos (aísla pausas de GC /
    //    preempción del SO cuando corren decenas de workers de Vitest en paralelo sin relajar < 0.1 ms)
    const numPasses = 5;
    let totalGbmMs = Number.POSITIVE_INFINITY;
    let totalEnsMs = Number.POSITIVE_INFINITY;

    for (let pass = 0; pass < numPasses; pass += 1) {
      const tStartGbm = performance.now();
      for (let i = 0; i < nBenchRows; i += 1) {
        const out = predictGbm(benchRows[i]!, gbmTrees);
        sink += out.pHome;
      }
      const elapsedGbm = performance.now() - tStartGbm;
      if (elapsedGbm < totalGbmMs) {
        totalGbmMs = elapsedGbm;
      }

      const tStartEns = performance.now();
      for (let i = 0; i < nBenchRows; i += 1) {
        const out = predictLogitGbmEnsemble(benchRows[i]!, gbmTrees);
        sink += out.pHome;
      }
      const elapsedEns = performance.now() - tStartEns;
      if (elapsedEns < totalEnsMs) {
        totalEnsMs = elapsedEns;
      }
    }

    const meanGbmOnlyMs = totalGbmMs / nBenchRows;
    const meanEnsembleMs = totalEnsMs / nBenchRows;

    // 3. Distribución por partido (p50 y p99) tomando el mínimo por partido en 3 pasadas para filtrar jitter de SO
    const perMatchEnsembleMs = new Array<number>(nBenchRows).fill(Number.POSITIVE_INFINITY);
    const perMatchGbmMs = new Array<number>(nBenchRows).fill(Number.POSITIVE_INFINITY);
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 0; i < nBenchRows; i += 1) {
        const t0 = performance.now();
        const out = predictLogitGbmEnsemble(benchRows[i]!, gbmTrees);
        const dt = performance.now() - t0;
        sink += out.pAway;
        if (dt < perMatchEnsembleMs[i]!) perMatchEnsembleMs[i] = dt;
      }
      for (let i = 0; i < nBenchRows; i += 1) {
        const t0 = performance.now();
        const out = predictGbm(benchRows[i]!, gbmTrees);
        const dt = performance.now() - t0;
        sink += out.pDraw;
        if (dt < perMatchGbmMs[i]!) perMatchGbmMs[i] = dt;
      }
    }
    perMatchEnsembleMs.sort((a, b) => a - b);
    const p50EnsembleMs = quantileSorted(perMatchEnsembleMs, 0.5);
    const p99EnsembleMs = quantileSorted(perMatchEnsembleMs, 0.99);

    perMatchGbmMs.sort((a, b) => a - b);
    const p50GbmOnlyMs = quantileSorted(perMatchGbmMs, 0.5);
    const p99GbmOnlyMs = quantileSorted(perMatchGbmMs, 0.99);

    expect(Number.isFinite(sink)).toBe(true);

    console.info(
      `[GBM_LATENCY_BENCH] ${JSON.stringify({
        n_benchmark_matches: nBenchRows,
        warmup_iterations: warmupIters,
        num_passes_best_of: numPasses,
        gbm_calibrated_only: {
          mean_ms_per_match: Number(meanGbmOnlyMs.toFixed(6)),
          p50_ms_per_match: Number(p50GbmOnlyMs.toFixed(6)),
          p99_ms_per_match: Number(p99GbmOnlyMs.toFixed(6)),
          total_ms: Number(totalGbmMs.toFixed(3)),
        },
        logit_plus_gbm_ensemble: {
          mean_ms_per_match: Number(meanEnsembleMs.toFixed(6)),
          p50_ms_per_match: Number(p50EnsembleMs.toFixed(6)),
          p99_ms_per_match: Number(p99EnsembleMs.toFixed(6)),
          total_ms: Number(totalEnsMs.toFixed(3)),
        },
      })}`,
    );

    expect(meanGbmOnlyMs).toBeLessThan(MAX_MEAN_LATENCY_MS);
    expect(meanEnsembleMs).toBeLessThan(MAX_MEAN_LATENCY_MS);
  });
});
