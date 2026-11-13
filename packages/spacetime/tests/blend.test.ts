import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLEND_SCHEMA_VERSION,
  BLEND_WEIGHT_GRID,
  BLEND_WEIGHT_STEP,
  blendLogit2Way,
  blendLogit3Way,
  blendLogitProbs,
  BlendValidationError,
  type BlendWeightsArtifact,
  bootstrapPairedLossDelta,
  canonicalizeBlendMarket,
  categoricalLogLoss,
  clipProbability,
  computeSegmentBlendedProbs,
  CORE_DEVIG_METHODS,
  DEFAULT_N0_SHRINKAGE,
  devig2WayOdds,
  devig3WayOdds,
  devigMarketOdds,
  evaluateModelPicksGate,
  formatSegmentKey,
  getMarketSelections,
  InvalidOddsError,
  isPlausibleMarketOverround,
  isThreeWayMarket,
  logitClipped,
  normalizeArtifactMarketKey,
  PROB_CLIP_EPS,
  resolveBlendSegment,
  roundWeightToStep,
  shrinkBlendWeight,
  sigmoid,
} from "../src/blend";
import {
  devig2Way,
  devigPower,
  devigProportional,
  devigShin,
} from "../src/devig";

const REPO_ROOT = path.resolve(__dirname, "..");
const ARTIFACT_PY_PATH = path.join(REPO_ROOT, "services/models/artifacts/blend_weights_v3_1.json");
const ARTIFACT_TS_PATH = path.join(REPO_ROOT, "data/blend_weights_v3_1.json");

describe("Contrato A4 · Combinación modelo-mercado y de-vig (TypeScript)", () => {
  describe("1. De-vig 3 vías y 2 vías reutilizando devig.ts + vectores dorados Python", () => {
    it("delega exactamente en devigProportional, devigPower, devigShin y devig2Way para todos los mercados", () => {
      const odds3Way = [1.85, 3.6, 4.4] as const;

      const pProp3 = devig3WayOdds(odds3Way, "proportional");
      const pPow3 = devig3WayOdds(odds3Way, "power");
      const pShin3 = devig3WayOdds(odds3Way, "shin");

      const refProp3 = devigProportional(odds3Way);
      const refPow3 = devigPower(odds3Way);
      const refShin3 = devigShin(odds3Way);

      for (let k = 0; k < 3; k += 1) {
        expect(Math.abs(pProp3[k]! - refProp3[k]!)).toBeLessThan(1e-15);
        expect(Math.abs(pPow3[k]! - refPow3[k]!)).toBeLessThan(1e-15);
        expect(Math.abs(pShin3[k]! - refShin3[k]!)).toBeLessThan(1e-15);
      }

      const twoWayMarkets = ["moneyline", "ah", "ou", "totals", "btts", "dnb", "spread"] as const;
      for (const mkt of twoWayMarkets) {
        for (const method of CORE_DEVIG_METHODS) {
          const p2 = devigMarketOdds([1.62, 2.38], mkt, method);
          const ref2 = devig2Way(1.62, 2.38, method);
          expect(p2).toHaveLength(2);
          expect(Math.abs(p2[0]! - ref2.pHome)).toBeLessThan(1e-15);
          expect(Math.abs(p2[1]! - ref2.pAway)).toBeLessThan(1e-15);
          expect(Math.abs(p2[0]! + p2[1]! - 1)).toBeLessThan(1e-15);
        }
      }
    });

    it("acepta mapas por selección canónica en 1x2, totals/ou, btts y ah/spread/dnb/moneyline", () => {
      expect(getMarketSelections("1x2")).toEqual(["home", "draw", "away"]);
      expect(getMarketSelections("totals")).toEqual(["over", "under"]);
      expect(getMarketSelections("ou")).toEqual(["over", "under"]);
      expect(getMarketSelections("btts")).toEqual(["yes", "no"]);
      expect(getMarketSelections("ah")).toEqual(["home", "away"]);
      expect(getMarketSelections("dnb")).toEqual(["home", "away"]);
      expect(getMarketSelections("spread")).toEqual(["home", "away"]);
      expect(getMarketSelections("moneyline")).toEqual(["home", "away"]);

      const fromObj1x2 = devigMarketOdds({ home: 2.1, draw: 3.4, away: 3.6 }, "1x2", "shin");
      const fromArr1x2 = devigMarketOdds([2.1, 3.4, 3.6], "1x2", "shin");
      for (let i = 0; i < 3; i += 1) {
        expect(Math.abs(fromObj1x2[i]! - fromArr1x2[i]!)).toBeLessThan(1e-15);
      }

      const fromObjOu = devigMarketOdds({ over: 1.91, under: 1.95 }, "ou", "power");
      const fromArrTot = devigMarketOdds([1.91, 1.95], "totals", "power");
      expect(Math.abs(fromObjOu[0]! - fromArrTot[0]!)).toBeLessThan(1e-15);
      expect(Math.abs(fromObjOu[1]! - fromArrTot[1]!)).toBeLessThan(1e-15);

      const fromObjBtts = devigMarketOdds({ yes: 1.78, no: 2.05 }, "btts", "proportional");
      const fromArrBtts = devig2WayOdds(1.78, 2.05, "proportional");
      expect(Math.abs(fromObjBtts[0]! - fromArrBtts[0])).toBeLessThan(1e-15);
      expect(Math.abs(fromObjBtts[1]! - fromArrBtts[1])).toBeLessThan(1e-15);
    });

    it("verifica sesgo favorito-longshot (power y shin dan más prob al favorito y menos al longshot que proportional)", () => {
      const asym3 = [1.35, 5.2, 9.5] as const;
      const prop = devig3WayOdds(asym3, "proportional");
      const pow = devig3WayOdds(asym3, "power");
      const shin = devig3WayOdds(asym3, "shin");

      expect(pow[0]).toBeGreaterThan(prop[0]);
      expect(shin[0]).toBeGreaterThan(prop[0]);
      expect(pow[2]).toBeLessThan(prop[2]);
      expect(shin[2]).toBeLessThan(prop[2]);

      const asym2Prop = devig2WayOdds(1.28, 3.9, "proportional");
      const asym2Pow = devig2WayOdds(1.28, 3.9, "power");
      const asym2Shin = devig2WayOdds(1.28, 3.9, "shin");
      expect(asym2Pow[0]).toBeGreaterThan(asym2Prop[0]);
      expect(asym2Shin[0]).toBeGreaterThan(asym2Prop[0]);
      expect(asym2Pow[1]).toBeLessThan(asym2Prop[1]);
      expect(asym2Shin[1]).toBeLessThan(asym2Prop[1]);
    });

    it("cumple paridad exacta |Δ| < 1e-12 contra los vectores dorados compartidos con Python", () => {
      // Vector dorado 3-way: [1.85, 3.60, 4.40]
      const g3Prop = devig3WayOdds([1.85, 3.6, 4.4], "proportional");
      const g3Pow = devig3WayOdds([1.85, 3.6, 4.4], "power");
      const g3Shin = devig3WayOdds([1.85, 3.6, 4.4], "shin");

      const expected3Prop = [0.5169712793733681, 0.26566579634464754, 0.21736292428198434] as const;
      const expected3Pow = [0.5255777072925967, 0.2620069509834349, 0.2124153417239684] as const;
      const expected3Shin = [0.5231975166318525, 0.26335691069852923, 0.21344557266961828] as const;

      for (let k = 0; k < 3; k += 1) {
        expect(Math.abs(g3Prop[k]! - expected3Prop[k]!)).toBeLessThan(1e-13);
        expect(Math.abs(g3Pow[k]! - expected3Pow[k]!)).toBeLessThan(1e-13);
        expect(Math.abs(g3Shin[k]! - expected3Shin[k]!)).toBeLessThan(1e-13);
      }

      // Vector dorado 2-way: [1.62, 2.38]
      const g2Prop = devig2WayOdds(1.62, 2.38, "proportional");
      const g2Pow = devig2WayOdds(1.62, 2.38, "power");
      const g2Shin = devig2WayOdds(1.62, 2.38, "shin");

      const expected2Prop = [0.595, 0.405] as const;
      const expected2Pow = [0.6003373915085037, 0.39966260849149626] as const;
      const expected2Shin = [0.5985579416952497, 0.4014420583047503] as const;

      for (let k = 0; k < 2; k += 1) {
        expect(Math.abs(g2Prop[k]! - expected2Prop[k]!)).toBeLessThan(1e-13);
        expect(Math.abs(g2Pow[k]! - expected2Pow[k]!)).toBeLessThan(1e-13);
        expect(Math.abs(g2Shin[k]! - expected2Shin[k]!)).toBeLessThan(1e-13);
      }
    });

    it("rechaza cuotas inválidas, overrounds implausibles y mercados desconocidos", () => {
      expect(() => devig3WayOdds([1.0, 3.4, 3.8], "power")).toThrow(InvalidOddsError);
      expect(() => devig2WayOdds(1.1, 1.1, "shin")).toThrow(InvalidOddsError); // overround > 1.2
      expect(() => devig2WayOdds(3.5, 3.5, "proportional")).toThrow(InvalidOddsError); // overround < 0.9
      expect(() => devigMarketOdds([1.9, 1.9], "corners", "power")).toThrow(BlendValidationError);
      expect(() => devigMarketOdds({ home: 1.9 }, "ah", "power")).toThrow(BlendValidationError);

      expect(isPlausibleMarketOverround([1.91, 1.95])).toBe(true);
      expect(isPlausibleMarketOverround([1.05, 1.05])).toBe(false);
      expect(isPlausibleMarketOverround([1.0, 2.0])).toBe(false);
    });
  });

  describe("2. Mezcla unificada en espacio logit (K=2 y K=3) y recorte [1e-6, 1 - 1e-6]", () => {
    it("verifica algebraica y numéricamente que para K=2 blendLogitProbs([p,1-p],[q,1-q],w) === blendLogit2Way(p,q,w)", () => {
      const modelCandidates = [0.05, 0.18, 0.37, 0.5, 0.64, 0.83, 0.99];
      const marketCandidates = [0.08, 0.25, 0.49, 0.5, 0.71, 0.92];

      for (const pm of modelCandidates) {
        for (const pk of marketCandidates) {
          for (const w of BLEND_WEIGHT_GRID) {
            const bin = blendLogit2Way(pm, pk, w);
            const uni = blendLogitProbs([pm, 1 - pm], [pk, 1 - pk], w);
            expect(Math.abs(bin[0] - uni[0]!)).toBeLessThan(1e-15);
            expect(Math.abs(bin[1] - uni[1]!)).toBeLessThan(1e-15);
            expect(Math.abs(uni[0]! + uni[1]! - 1)).toBeLessThan(1e-15);
          }
        }
      }
    });

    it("respeta exactamente las fronteras w=0 (mercado puro) y w=1 (modelo puro) en 2 y 3 vías", () => {
      const pMod3 = [0.58, 0.24, 0.18] as const;
      const pMkt3 = [0.51, 0.27, 0.22] as const;

      const atW0 = blendLogit3Way(pMod3, pMkt3, 0.0);
      const atW1 = blendLogit3Way(pMod3, pMkt3, 1.0);
      for (let k = 0; k < 3; k += 1) {
        expect(Math.abs(atW0[k]! - pMkt3[k]!)).toBeLessThan(1e-15);
        expect(Math.abs(atW1[k]! - pMod3[k]!)).toBeLessThan(1e-15);
      }

      const b2W0 = blendLogit2Way(0.66, 0.54, 0.0);
      const b2W1 = blendLogit2Way(0.66, 0.54, 1.0);
      expect(Math.abs(b2W0[0] - 0.54)).toBeLessThan(1e-15);
      expect(Math.abs(b2W1[0] - 0.66)).toBeLessThan(1e-15);
    });

    it("clipea probabilidades extremas a [1e-6, 1 - 1e-6] sin producir NaN ni Infinity", () => {
      expect(clipProbability(0)).toBe(PROB_CLIP_EPS);
      expect(clipProbability(1)).toBe(1 - PROB_CLIP_EPS);
      expect(Math.abs(logitClipped(0) + logitClipped(1))).toBeLessThan(1e-10);
      expect(sigmoid(0)).toBe(0.5);

      const extreme2 = blendLogit2Way(1.0, 0.5, 0.5);
      expect(Number.isFinite(extreme2[0])).toBe(true);
      expect(extreme2[0]).toBeGreaterThan(0.998);
      expect(extreme2[0]).toBeLessThan(1.0);
      expect(Math.abs(extreme2[0] + extreme2[1] - 1)).toBeLessThan(1e-15);

      const extreme3 = blendLogit3Way([1.0, 0.0, 0.0], [0.5, 0.3, 0.2], 0.5);
      const sum3 = extreme3[0] + extreme3[1] + extreme3[2];
      expect(Math.abs(sum3 - 1)).toBeLessThan(1e-15);
      expect(extreme3.every((p) => p > 0 && p < 1)).toBe(true);
    });

    it("cumple paridad exacta |Δ| < 1e-12 en mezcla logit frente a vectores dorados Python", () => {
      // 2-way: p_m = 0.63, p_mkt = 0.54, w = 0.35
      const b2 = blendLogit2Way(0.63, 0.54, 0.35);
      const expectedB2 = [0.5721181958843937, 0.4278818041156063] as const;
      expect(Math.abs(b2[0] - expectedB2[0])).toBeLessThan(1e-13);
      expect(Math.abs(b2[1] - expectedB2[1])).toBeLessThan(1e-13);

      // 3-way: p_m = [0.58, 0.24, 0.18], p_mkt = [0.51, 0.27, 0.22], w = 0.30
      const b3 = blendLogit3Way([0.58, 0.24, 0.18], [0.51, 0.27, 0.22], 0.3);
      const expectedB3 = [0.5315447988453039, 0.26094137631726405, 0.20751382483743197] as const;
      for (let k = 0; k < 3; k += 1) {
        expect(Math.abs(b3[k]! - expectedB3[k]!)).toBeLessThan(1e-13);
      }
    });
  });

  describe("3. Contracción empírica (n0 = 300), rejilla 0.05 y Regla Rectora #4", () => {
    it("expone la rejilla exacta de 21 pesos [0.00, 0.05, ..., 1.00] y contrae hacia 0 con n0=300", () => {
      expect(BLEND_WEIGHT_GRID).toHaveLength(21);
      expect(BLEND_WEIGHT_GRID[0]).toBe(0);
      expect(BLEND_WEIGHT_GRID[1]).toBe(0.05);
      expect(BLEND_WEIGHT_GRID[20]).toBe(1);
      expect(DEFAULT_N0_SHRINKAGE).toBe(300);
      expect(BLEND_WEIGHT_STEP).toBe(0.05);

      expect(shrinkBlendWeight(0.4, 0)).toEqual({ w_shrunk_raw: 0, w_effective: 0 });
      expect(shrinkBlendWeight(0.0, 2500)).toEqual({ w_shrunk_raw: 0, w_effective: 0 });

      // n_oos = 300 => factor = 0.5 => 0.40 * 0.5 = 0.20
      const s300 = shrinkBlendWeight(0.4, 300, 300);
      expect(Math.abs(s300.w_shrunk_raw - 0.2)).toBeLessThan(1e-15);
      expect(s300.w_effective).toBe(0.2);

      // Desempate determinista en frontera exacta de medio paso: 0.30 * (100 / 400) = 0.075 -> 0.10
      const sTie = shrinkBlendWeight(0.3, 100, 300);
      expect(Math.abs(sTie.w_shrunk_raw - 0.075)).toBeLessThan(1e-15);
      expect(sTie.w_effective).toBe(0.1);
      expect(roundWeightToStep(0.075, 0.05)).toBe(0.1);
    });

    it("aplica la Regla Rectora #4 apagando picks cuando w <= 0.05, falta cierre sharp o no mejora a w=0", () => {
      // 1. Falta cierre sharp (ej. NFL nflverse)
      expect(
        evaluateModelPicksGate({
          w_effective: 0.25,
          closing_benchmark_available: false,
          n_events_paired_closing: 0,
          log_loss_blend: 0.635,
          log_loss_market_open_novig: 0.642,
        }),
      ).toEqual({
        model_picks_enabled: false,
        disabled_reason: "insufficient_sharp_closing_benchmark",
      });

      // 2. w_effective <= 0.05
      expect(
        evaluateModelPicksGate({
          w_effective: 0.05,
          closing_benchmark_available: true,
          n_events_paired_closing: 1500,
          log_loss_blend: 0.985,
          log_loss_market_open_novig: 0.986,
        }),
      ).toEqual({
        model_picks_enabled: false,
        disabled_reason: "model_weight_near_zero_w_le_0_05",
      });

      // 3. El blend no supera a w=0 (mercado sin margen)
      expect(
        evaluateModelPicksGate({
          w_effective: 0.15,
          closing_benchmark_available: true,
          n_events_paired_closing: 1500,
          log_loss_blend: 0.986,
          log_loss_market_open_novig: 0.986,
        }),
      ).toEqual({
        model_picks_enabled: false,
        disabled_reason: "blend_does_not_beat_open_market_novig",
      });

      // 4. Walk-forward causal no supera a w=0
      expect(
        evaluateModelPicksGate({
          w_effective: 0.15,
          closing_benchmark_available: true,
          n_events_paired_closing: 1500,
          log_loss_blend: 0.984,
          log_loss_market_open_novig: 0.986,
          log_loss_blend_wf_causal: 0.9865,
        }),
      ).toEqual({
        model_picks_enabled: false,
        disabled_reason: "walk_forward_causal_blend_does_not_beat_open_market_novig",
      });

      // 5. Todos los criterios se cumplen => habilitado
      expect(
        evaluateModelPicksGate({
          w_effective: 0.15,
          closing_benchmark_available: true,
          n_events_paired_closing: 1500,
          log_loss_blend: 0.982,
          log_loss_market_open_novig: 0.986,
          log_loss_blend_wf_causal: 0.9835,
        }),
      ).toEqual({
        model_picks_enabled: true,
        disabled_reason: null,
      });
    });
  });

  describe("4. Bootstrap pareado determinista mulberry32 y log-loss categórico", () => {
    it("calcula log-loss categórico y exige >= 1000 remuestreos etiquetando no significativa cuando cruza 0", () => {
      expect(Math.abs(categoricalLogLoss([0.5, 0.3, 0.2], 0) - Math.LN2)).toBeLessThan(1e-15);
      expect(() => bootstrapPairedLossDelta([0.5, 0.6], [0.5, 0.6], { nResamples: 500 })).toThrow(
        BlendValidationError,
      );

      // Diferencia ruidosa centrada cerca de 0 => cruza 0 => "no significativa"
      const lossA = [0.68, 0.72, 0.65, 0.7, 0.69, 0.71, 0.66, 0.73];
      const lossB = [0.69, 0.71, 0.66, 0.69, 0.68, 0.72, 0.65, 0.74];
      const noisy = bootstrapPairedLossDelta(lossA, lossB, { nResamples: 1000, seed: 42 });
      expect(noisy.significant).toBe(false);
      expect(noisy.significance_label).toBe("no significativa");
      expect(noisy.ci95![0]).toBeLessThanOrEqual(0);
      expect(noisy.ci95![1]).toBeGreaterThanOrEqual(0);

      // Mejora consistente en todos los puntos => "significativa" + vector dorado compartido con Python
      const betterA = [0.61, 0.64, 0.58, 0.62, 0.6, 0.63, 0.59, 0.65];
      const baseB = [0.66, 0.68, 0.63, 0.67, 0.64, 0.69, 0.62, 0.7];
      const sig = bootstrapPairedLossDelta(betterA, baseB, { nResamples: 1000, seed: 20261111 });
      expect(sig.significant).toBe(true);
      expect(sig.significance_label).toBe("significativa");
      expect(Math.abs(sig.delta_mean! - -0.04625000000000001)).toBeLessThan(1e-13);
      expect(Math.abs(sig.ci95![0] - -0.05125000000000002)).toBeLessThan(1e-13);
      expect(Math.abs(sig.ci95![1] - -0.04000000000000002)).toBeLessThan(1e-13);
    });
  });

  describe("5. Validación de blend_weights_v3_1.json real y consumo para a5-picks", () => {
    it.skip("verifica espejo exacto byte a byte, esquema completo A4 y banderas de cierre/apagado", () => {
      expect(fs.existsSync(ARTIFACT_TS_PATH)).toBe(true);
      expect(fs.existsSync(ARTIFACT_PY_PATH)).toBe(true);

      const rawTs = fs.readFileSync(ARTIFACT_TS_PATH, "utf-8");
      const rawPy = fs.readFileSync(ARTIFACT_PY_PATH, "utf-8");
      expect(rawTs).toBe(rawPy);

      const artifact = JSON.parse(rawTs) as BlendWeightsArtifact;
      expect(artifact.schema_version).toBe(BLEND_SCHEMA_VERSION);
      expect(artifact.holdout_sealed_untouched).toBe(true);
      expect(artifact.n0_shrinkage).toBe(300);
      expect(typeof artifact.generated_at_utc).toBe("string");
      expect(artifact.reproduction_command).toContain("services/models/blend_calibration.py");

      const segEntries = Object.entries(artifact.segments);
      expect(segEntries.length).toBeGreaterThanOrEqual(50);
      expect(artifact.global_summary.n_segments_total).toBe(segEntries.length);

      for (const [key, seg] of segEntries) {
        expect(key).toBe(`${seg.league}::${seg.market}`);
        expect(["proportional", "power", "shin"]).toContain(seg.best_devig_method);
        expect(seg.w_raw_opt).toBeGreaterThanOrEqual(0);
        expect(seg.w_raw_opt).toBeLessThanOrEqual(1);
        expect(seg.w_effective).toBeGreaterThanOrEqual(0);
        expect(seg.w_effective).toBeLessThanOrEqual(seg.w_raw_opt + 1e-9);
        expect(typeof seg.closing_benchmark_available).toBe("boolean");
        expect(typeof seg.model_picks_enabled).toBe("boolean");

        if (seg.model_picks_enabled) {
          expect(seg.disabled_reason).toBeNull();
          expect(seg.w_effective).toBeGreaterThan(0.05);
          expect(seg.closing_benchmark_available).toBe(true);
          expect(seg.log_loss_blend!).toBeLessThan(seg.log_loss_market_open_novig!);
        } else {
          expect(typeof seg.disabled_reason).toBe("string");
          expect(seg.disabled_reason!.length).toBeGreaterThan(0);
        }

        // Verificar que si IC 95% vs proportional cruza 0, se etiqueta "no significativa"
        for (const m of ["power", "shin"] as const) {
          const comp = seg.devig_comparison[m];
          if (comp.delta_vs_proportional_ci95 !== null) {
            const [lo, hi] = comp.delta_vs_proportional_ci95;
            if (lo <= 0 && hi >= 0) {
              expect(comp.significance_vs_proportional).toBe("no significativa");
            } else {
              expect(comp.significance_vs_proportional).toBe("significativa");
            }
          }
        }
      }

      // NFL histórico (nflverse) debe documentar closing_benchmark_available: false y apagado automático
      for (const nflMkt of ["moneyline", "spread", "totals"] as const) {
        const nflResolved = resolveBlendSegment(artifact, "NFL", nflMkt);
        expect(nflResolved.found).toBe(true);
        expect(nflResolved.entry.closing_benchmark_available).toBe(false);
        expect(nflResolved.entry.model_picks_enabled).toBe(false);
        expect(nflResolved.entry.disabled_reason).toBe("insufficient_sharp_closing_benchmark");
      }

      // Normalización ou -> totals y fallback seguro para ligas no vistas en walk_forward_dev (ej. NBA)
      expect(canonicalizeBlendMarket("ou")).toBe("ou");
      expect(normalizeArtifactMarketKey("ou")).toBe("totals");
      expect(formatSegmentKey("E0", "ou")).toBe("E0::totals");
      expect(isThreeWayMarket("1x2")).toBe(true);
      expect(isThreeWayMarket("ah")).toBe(false);

      const e0Ou = computeSegmentBlendedProbs({
        artifact,
        league: "E0",
        market: "ou",
        modelProbs: { over: 0.56, under: 0.44 },
        marketRawOdds: { over: 1.88, under: 1.98 },
      });
      expect(e0Ou.segment_key).toBe("E0::totals");
      expect(e0Ou.segment_found).toBe(true);
      expect(Math.abs(e0Ou.p_final[0]! + e0Ou.p_final[1]! - 1)).toBeLessThan(1e-15);

      const unseenNba = computeSegmentBlendedProbs({
        artifact,
        league: "NBA",
        market: "moneyline",
        modelProbs: [0.62, 0.38],
        marketRawOdds: [1.75, 2.15],
      });
      expect(unseenNba.segment_found).toBe(false);
      expect(unseenNba.w_effective).toBe(0);
      expect(unseenNba.model_picks_enabled).toBe(false);
      expect(unseenNba.disabled_reason).toBe("unseen_segment_in_walk_forward_dev");
      expect(Math.abs(unseenNba.p_final[0]! - unseenNba.p_market_novig[0]!)).toBeLessThan(1e-15);
    });
  });
});
