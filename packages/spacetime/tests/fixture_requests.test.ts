/**
 * Ciclo 9 / v2 — camino de producto completo: fixtures → features (Python) → servicio TS.
 *
 * `fixture_requests.json` lo genera `pipeline/export_fixture_requests.py`: 150 fixtures reales
 * con el vector de 79 features de 2a generación, el one-hot de división y `probsPython` como oráculo.
 */
import { describe, expect, it } from "vitest";
import requestsJson from "../data/fixture_requests.json";
import modelJson from "../data/model_motor_a.json";
import { predictMotorAWithAvailability } from "../src/engine.js";
import { predictMatch } from "../src/service.js";
import type { ModelArtifact } from "../src/types.js";

interface FixtureRequest {
  div: string;
  season: string;
  date: string;
  home: string;
  away: string;
  features: readonly (number | null)[];
  divOnehot: readonly number[];
  marketProbs: readonly number[] | null;
  probsPython: readonly number[];
  lineupAvailabilityDelta?: number;
  probsPythonWithAvailability?: readonly number[];
}

const model = modelJson as unknown as ModelArtifact;
const file = requestsJson as unknown as { n: number; requests: Record<string, FixtureRequest> };
const entries = Object.entries(file.requests);

describe("Ciclo 9 — peticiones de fixtures reales", () => {
  it("el archivo contiene 150 fixtures con la forma esperada", () => {
    expect(file.n).toBe(150);
    expect(entries).toHaveLength(150);
    for (const [, r] of entries.slice(0, 20)) {
      expect(r.features).toHaveLength(113);
      expect(r.divOnehot).toHaveLength(23);
      expect(r.probsPython).toHaveLength(3);
      expect(r.divOnehot.filter((x) => x === 1)).toHaveLength(1);
    }
  });

  it("el servicio TS reproduce las probabilidades de Python para los 150 fixtures", () => {
    let maxDiff = 0;
    for (const [matchId, r] of entries) {
      const prediction = predictMatch({
        sport: "football",
        row: { features: r.features, div_onehot: r.divOnehot },
        model,
      });
      const deltas = [
        Math.abs(prediction.pHome - r.probsPython[0]!),
        Math.abs(prediction.pDraw - r.probsPython[1]!),
        Math.abs(prediction.pAway - r.probsPython[2]!),
      ];
      for (const d of deltas) {
        maxDiff = Math.max(maxDiff, d);
        expect(d, `${matchId}: |Δ| fuera de tolerancia`).toBeLessThanOrEqual(1e-9);
      }
      const sum = prediction.pHome + prediction.pDraw + prediction.pAway;
      expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-9);
    }
    console.log(`[Ciclo 9] paridad fixture→servicio: 150 fixtures; max|Δ|=${maxDiff.toExponential(3)}`);
    expect(maxDiff).toBeLessThanOrEqual(1e-11);
  });

  it("reproduce probsPythonWithAvailability con |Δ| <= 1e-11 en los 150 fixtures", () => {
    let maxDiffAvail = 0;
    for (const [matchId, r] of entries) {
      if (!r.probsPythonWithAvailability) continue;
      const delta = r.lineupAvailabilityDelta ?? 0;
      const predAvail = predictMotorAWithAvailability(
        { features: r.features, div_onehot: r.divOnehot },
        model,
        delta,
      );
      const deltas = [
        Math.abs(predAvail.pHome - r.probsPythonWithAvailability[0]!),
        Math.abs(predAvail.pDraw - r.probsPythonWithAvailability[1]!),
        Math.abs(predAvail.pAway - r.probsPythonWithAvailability[2]!),
      ];
      for (const d of deltas) {
        maxDiffAvail = Math.max(maxDiffAvail, d);
        expect(d, `${matchId} avail: |Δ| fuera de tolerancia`).toBeLessThanOrEqual(1e-11);
      }
    }
    expect(maxDiffAvail).toBeLessThanOrEqual(1e-11);
  });

  it("las peticiones incluyen mercado de-vigado y una división entrenada", () => {
    const withMarket = entries.filter(([, r]) => r.marketProbs !== null);
    expect(withMarket.length).toBeGreaterThan(100);
    for (const [, r] of withMarket.slice(0, 20)) {
      const sum = r.marketProbs!.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-9);
      expect(model.div_levels).toContain(r.div);
    }
  });
});
