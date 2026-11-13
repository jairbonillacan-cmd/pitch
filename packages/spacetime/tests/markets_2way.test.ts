/**
 * A28 (Ola 3 · Agente A6) — Suite exhaustiva de pruebas unitarias, identidades de líneas asiáticas partidas,
 * compatibilidad con `clv.ts` / `ledger.ts`, validación de `markets_2way_config.json` y paridad cruzada
 * exacta `< 1e-12` entre TypeScript (`markets_2way.ts`) y Python (`services/models/markets_2way.py`).
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gradeMarketOutcome, settlePickPnl, summarizePicksBootstrap } from "../src/clv";
import { computeFeaturesHash, PickLedger } from "../src/ledger";
import {
  AH_CANONICAL_LINES,
  type AsianSettlementProbs,
  build_dixon_coles_score_matrix,
  buildDixonColesScoreMatrix,
  compute_asian_ev,
  computeAsianEv,
  DEFAULT_DC_RHO,
  DEFAULT_MAX_GOALS,
  derive_all_2way_markets,
  derive_selection_settlement_probs,
  deriveAll2WayMarkets,
  deriveSelectionSettlementProbs,
  evaluate2WayMarketCandidate,
  evaluateAsianValueBet,
  formatLineKey,
  type Markets2WayConfigArtifact,
  Markets2WayValidationError,
  resolve2WayMarketSegment,
  retargetSettlementProbs,
  settle_asian_line,
  settleAsianLine,
  solve_exact_asian_kelly,
  solveExactAsianKelly,
  TOTALS_CANONICAL_LINES,
  validateQuarterLine,
} from "../src/markets_2way";

const REPO_ROOT = path.resolve(__dirname, "..");
const CONFIG_JSON_PATH = path.join(REPO_ROOT, "data/markets_2way_config.json");
const EVAL_JSON_PATH = path.join(REPO_ROOT, "services/models/artifacts/markets_2way_eval.json");
const A6_REGISTRY_PATH = path.join(REPO_ROOT, "services/models/artifacts/holdout_registry_a6.jsonl");
const PYTHON_VENV_WIN = path.join(REPO_ROOT, "research/prediction-lab/.venv/Scripts/python.exe");
const PYTHON_VENV_POSIX = path.join(REPO_ROOT, "research/prediction-lab/.venv/bin/python");

function resolvePythonBin(): string | null {
  if (fs.existsSync(PYTHON_VENV_WIN)) return PYTHON_VENV_WIN;
  if (fs.existsSync(PYTHON_VENV_POSIX)) return PYTHON_VENV_POSIX;
  return null;
}

describe("Contrato A6 · Mercados de 2 vías de fútbol y líneas asiáticas (TypeScript)", () => {
  describe("1. Matriz exacta Dixon-Coles y derivación de los 4 mercados (`ah`, `dnb`, `ou`/`totals`, `btts`)", () => {
    it("normaliza a 1.0 en grillas maxGoals >= 10, aplica PoissonDC._tau_matrix y rechaza parámetros inválidos", () => {
      const testCases = [
        { lh: 1.55, la: 1.15, rho: -0.11, maxGoals: 10 },
        { lh: 1.82, la: 0.94, rho: -0.15, maxGoals: 12 },
        { lh: 1.1, la: 1.48, rho: 0.08, maxGoals: 14 },
        { lh: 2.35, la: 1.75, rho: -0.25, maxGoals: 15 },
      ];

      for (const { lh, la, rho, maxGoals } of testCases) {
        const mat = buildDixonColesScoreMatrix(lh, la, rho, maxGoals);
        expect(mat).toHaveLength(maxGoals + 1);
        let sum = 0.0;
        for (const row of mat) {
          expect(row).toHaveLength(maxGoals + 1);
          for (const v of row) sum += v;
        }
        expect(Math.abs(sum - 1.0)).toBeLessThan(1e-14);

        const matIndep = buildDixonColesScoreMatrix(lh, la, 0.0, maxGoals);
        const ratio22 = mat[2]![2]! / matIndep[2]![2]!;
        expect(Math.abs(mat[0]![0]! / matIndep[0]![0]! / ratio22 - Math.max(1.0 - lh * la * rho, 1e-9))).toBeLessThan(
          1e-14,
        );
        expect(Math.abs(mat[0]![1]! / matIndep[0]![1]! / ratio22 - Math.max(1.0 + lh * rho, 1e-9))).toBeLessThan(
          1e-14,
        );
        expect(Math.abs(mat[1]![0]! / matIndep[1]![0]! / ratio22 - Math.max(1.0 + la * rho, 1e-9))).toBeLessThan(
          1e-14,
        );
        expect(Math.abs(mat[1]![1]! / matIndep[1]![1]! / ratio22 - Math.max(1.0 - rho, 1e-9))).toBeLessThan(1e-14);
      }

      // Rechazo estricto de maxGoals < 10 y entradas corruptas
      expect(() => buildDixonColesScoreMatrix(1.4, 1.1, -0.1, 9)).toThrow(Markets2WayValidationError);
      expect(() => buildDixonColesScoreMatrix(0.0, 1.1, -0.1, 12)).toThrow(Markets2WayValidationError);
      expect(() => buildDixonColesScoreMatrix(1.4, -0.2, -0.1, 12)).toThrow(Markets2WayValidationError);
      expect(() => buildDixonColesScoreMatrix(1.4, 1.1, 1.25, 12)).toThrow(Markets2WayValidationError);
      expect(() => validateQuarterLine(-0.33)).toThrow(Markets2WayValidationError);
    });

    it("deriva AH (-1..+1), DNB, Totals/OU (1.5..3.5) y BTTS con simetrías e identidades exactas", () => {
      const bundle = deriveAll2WayMarkets(1.64, 1.18, -0.12, 12);
      const mat = buildDixonColesScoreMatrix(1.64, 1.18, -0.12, 12);
      expect(Math.abs(bundle.meta.matrix_sum - 1.0)).toBeLessThan(1e-15);

      // AH: 9 líneas canónicas y simetría Home(L) <-> Away(-L) + convención home_canonical
      expect(bundle.ah.lines).toEqual([-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0]);
      for (const ln of AH_CANONICAL_LINES) {
        const kH = formatLineKey(ln);
        const opp = ln === 0 ? 0 : -ln;
        const kA = formatLineKey(opp);
        const spH = bundle.ah.home[kH]!;
        const spA = bundle.ah.away[kA]!;

        const sumH = spH.p_full_win + spH.p_half_win + spH.p_push + spH.p_half_loss + spH.p_full_loss;
        expect(Math.abs(sumH - 1.0)).toBeLessThan(1e-15);
        expect(Math.abs(spH.p_full_win - spA.p_full_loss)).toBeLessThan(1e-15);
        expect(Math.abs(spH.p_half_win - spA.p_half_loss)).toBeLessThan(1e-15);
        expect(Math.abs(spH.p_push - spA.p_push)).toBeLessThan(1e-15);
        expect(Math.abs(spH.p_half_loss - spA.p_half_win)).toBeLessThan(1e-15);
        expect(Math.abs(spH.p_full_loss - spA.p_full_win)).toBeLessThan(1e-15);
        expect(Math.abs(spH.p_effective_win + spA.p_effective_win - 1.0)).toBeLessThan(1e-15);

        const spACanon = deriveSelectionSettlementProbs(mat, "ah", ln, "away", { lineConvention: "home_canonical" });
        expect(Math.abs(spACanon.p_effective_win - spA.p_effective_win)).toBeLessThan(1e-15);
        expect(Math.abs(spACanon.p_push - spA.p_push)).toBeLessThan(1e-15);
      }

      // DNB === AH 0.0 exacto + p_push explícito en empate
      const dnbH = bundle.dnb.home;
      const dnbA = bundle.dnb.away;
      const ah0H = bundle.ah.home["0"]!;
      expect(Math.abs(dnbH.p_full_win - ah0H.p_full_win)).toBeLessThan(1e-15);
      expect(Math.abs(dnbH.p_push - ah0H.p_push)).toBeLessThan(1e-15);
      expect(Math.abs(dnbH.p_effective_win - ah0H.p_effective_win)).toBeLessThan(1e-15);
      expect(Math.abs(bundle.dnb.p_push - dnbH.p_push)).toBeLessThan(1e-15);
      expect(Math.abs(dnbH.p_effective_win + dnbA.p_effective_win - 1.0)).toBeLessThan(1e-15);

      // Totals / OU: 9 líneas canónicas 1.5..3.5 y simetría Over(L) <-> Under(L)
      expect(bundle.totals.lines).toEqual([1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5]);
      expect(bundle.ou).toBe(bundle.totals);
      for (const ln of TOTALS_CANONICAL_LINES) {
        const k = formatLineKey(ln);
        const spO = bundle.totals.over[k]!;
        const spU = bundle.totals.under[k]!;
        expect(Math.abs(spO.p_full_win - spU.p_full_loss)).toBeLessThan(1e-15);
        expect(Math.abs(spO.p_half_win - spU.p_half_loss)).toBeLessThan(1e-15);
        expect(Math.abs(spO.p_push - spU.p_push)).toBeLessThan(1e-15);
        expect(Math.abs(spO.p_effective_win + spU.p_effective_win - 1.0)).toBeLessThan(1e-15);
      }

      // BTTS: P(GH >= 1, GA >= 1) y complemento exacto
      let pH0 = 0.0;
      let pA0 = 0.0;
      for (let k = 0; k <= 12; k += 1) {
        pH0 += mat[0]![k]!;
        pA0 += mat[k]![0]!;
      }
      const pBttsRef = 1.0 - pH0 - pA0 + mat[0]![0]!;
      expect(Math.abs(bundle.btts.yes.p_full_win - pBttsRef)).toBeLessThan(1e-15);
      expect(Math.abs(bundle.btts.no.p_full_win - (1.0 - pBttsRef))).toBeLessThan(1e-15);
      expect(bundle.btts.yes.p_push).toBe(0.0);

      // Verificar alias snake_case exportados
      expect(build_dixon_coles_score_matrix).toBe(buildDixonColesScoreMatrix);
      expect(derive_selection_settlement_probs).toBe(deriveSelectionSettlementProbs);
      expect(derive_all_2way_markets).toBe(deriveAll2WayMarkets);
      expect(compute_asian_ev).toBe(computeAsianEv);
      expect(solve_exact_asian_kelly).toBe(solveExactAsianKelly);
      expect(settle_asian_line).toBe(settleAsianLine);
    });
  });

  describe("2. EV exacto, descomposición 50/50 de cuartos (.25/.75), Kelly ¼ de 5 estados y settleAsianLine", () => {
    it("verifica la descomposición exacta 50/50 de líneas .25 y .75 y la esperanza sobre la matriz", () => {
      const maxGoals = 12;
      const mat = buildDixonColesScoreMatrix(1.58, 1.21, -0.11, maxGoals);
      const prices = [1.72, 1.95, 2.08, 2.45];

      for (const price of prices) {
        for (const qLine of [-0.75, -0.25, 0.25, 0.75]) {
          for (const sel of ["home", "away"] as const) {
            const spQ = deriveSelectionSettlementProbs(mat, "ah", qLine, sel);
            const spLo = deriveSelectionSettlementProbs(mat, "ah", qLine - 0.25, sel);
            const spHi = deriveSelectionSettlementProbs(mat, "ah", qLine + 0.25, sel);
            const evQ = computeAsianEv(spQ, price);
            const evAvg = 0.5 * computeAsianEv(spLo, price) + 0.5 * computeAsianEv(spHi, price);
            expect(Math.abs(evQ - evAvg)).toBeLessThan(1e-14);
          }
        }
        for (const qLine of [1.75, 2.25, 2.75, 3.25]) {
          for (const sel of ["over", "under"] as const) {
            const spQ = deriveSelectionSettlementProbs(mat, "totals", qLine, sel);
            const spLo = deriveSelectionSettlementProbs(mat, "totals", qLine - 0.25, sel);
            const spHi = deriveSelectionSettlementProbs(mat, "totals", qLine + 0.25, sel);
            const evQ = computeAsianEv(spQ, price);
            const evAvg = 0.5 * computeAsianEv(spLo, price) + 0.5 * computeAsianEv(spHi, price);
            expect(Math.abs(evQ - evAvg)).toBeLessThan(1e-14);
          }
        }
      }

      // Esperanza matemática exacta sobre toda la grilla 0..maxGoals === computeAsianEv
      const priceGrid = 2.04;
      const gridCases: Array<[string, number | null, string]> = [
        ["ah", -0.75, "home"],
        ["ah", -0.25, "home"],
        ["ah", 0.25, "away"],
        ["dnb", null, "home"],
        ["totals", 2.25, "over"],
        ["totals", 2.75, "under"],
        ["btts", null, "yes"],
      ];
      for (const [mkt, ln, sel] of gridCases) {
        const sp = deriveSelectionSettlementProbs(mat, mkt, ln, sel);
        const evFormula = computeAsianEv(sp, priceGrid);
        let evGrid = 0.0;
        for (let h = 0; h <= maxGoals; h += 1) {
          for (let a = 0; a <= maxGoals; a += 1) {
            const settled = settleAsianLine(mkt, ln, sel, h, a, 1.0, priceGrid);
            evGrid += mat[h]![a]! * settled.pnl_u;
          }
        }
        expect(Math.abs(evFormula - evGrid)).toBeLessThan(1e-14);
      }
    });

    it("resuelve Kelly ¼ exacto de 5 estados con G'(f*) == 0 (< 1e-14) y contracción por incertidumbre", () => {
      // Reducción binaria clásica: p = 0.56, cuota = 2.00 -> f* = 0.12, f_quarter = 0.03, stake = 3.0u
      const binKelly = solveExactAsianKelly(
        { p_full_win: 0.56, p_half_win: 0.0, p_push: 0.0, p_half_loss: 0.0, p_full_loss: 0.44 },
        2.0,
      );
      expect(Math.abs(binKelly.f_full_kelly - 0.12)).toBeLessThan(1e-14);
      expect(Math.abs(binKelly.f_quarter_kelly - 0.03)).toBeLessThan(1e-14);
      expect(Math.abs(binKelly.stake_raw_u - 3.0)).toBeLessThan(1e-12);

      // Lotería asiática partida de 5 estados (`AH -0.25`)
      const mat = buildDixonColesScoreMatrix(1.85, 1.05, -0.11, 12);
      const spSplit = deriveSelectionSettlementProbs(mat, "ah", -0.25, "home");
      const price = 1.98;
      const b = price - 1.0;
      const splitKelly = solveExactAsianKelly(spSplit, price);
      const fStar = splitKelly.f_full_kelly;
      expect(fStar).toBeGreaterThan(0);
      expect(fStar).toBeLessThan(1);
      expect(Math.abs(splitKelly.f_quarter_kelly - 0.25 * fStar)).toBeLessThan(1e-15);

      const gPrime =
        (spSplit.p_full_win * b) / (1.0 + b * fStar) +
        (spSplit.p_half_win * 0.5 * b) / (1.0 + 0.5 * b * fStar) -
        (0.5 * spSplit.p_half_loss) / (1.0 - 0.5 * fStar) -
        spSplit.p_full_loss / (1.0 - fStar);
      expect(Math.abs(gPrime)).toBeLessThan(1e-14);

      // Retargeting y contracción por incertidumbre
      const rt = retargetSettlementProbs(spSplit, 0.54);
      expect(Math.abs(rt.p_push - spSplit.p_push)).toBeLessThan(1e-15);
      expect(Math.abs(rt.p_effective_win - 0.54)).toBeLessThan(1e-14);

      const valErased = evaluateAsianValueBet(spSplit, 1.98, {
        pBlendedEffective: 0.52,
        sigmaP: 0.05,
        uncertaintyPenaltyK: 0.5, // p_shrunk = 0.495 < 1/1.98 = 0.50505 -> stake = 0
      });
      expect(valErased.ev).toBeGreaterThan(0);
      expect(valErased.edge_erased_by_uncertainty).toBe(true);
      expect(valErased.stake_raw_u).toBe(0.0);
    });

    it("es 100% compatible con clv.ts (gradeMarketOutcome, settlePickPnl) y PickLedger", () => {
      const stakeU = 1.5;
      const price = 1.94;

      for (let hg = 0; hg <= 4; hg += 1) {
        for (let ag = 0; ag <= 4; ag += 1) {
          for (const ln of AH_CANONICAL_LINES) {
            for (const sel of ["home", "away"] as const) {
              const res = settleAsianLine("ah", ln, sel, hg, ag, stakeU, price);
              const clvGrade = gradeMarketOutcome("ah", sel, hg, ag, ln);
              expect(res.grade_outcome).toBe(clvGrade);
              expect(Math.abs(res.pnl_u - settlePickPnl(stakeU, price, res.outcome))).toBeLessThan(1e-15);
              expect(Math.abs(res.pnl_u - settlePickPnl(stakeU, price, clvGrade))).toBeLessThan(1e-15);
            }
          }
          for (const ln of TOTALS_CANONICAL_LINES) {
            for (const sel of ["over", "under"] as const) {
              const res = settleAsianLine("ou", ln, sel, hg, ag, stakeU, price);
              const clvGrade = gradeMarketOutcome("ou", sel, hg, ag, ln);
              expect(res.grade_outcome).toBe(clvGrade);
              expect(Math.abs(res.pnl_u - settlePickPnl(stakeU, price, res.outcome))).toBeLessThan(1e-15);
            }
          }
          for (const sel of ["home", "away"] as const) {
            const res = settleAsianLine("dnb", null, sel, hg, ag, stakeU, price);
            const clvGrade = gradeMarketOutcome("dnb", sel, hg, ag, null);
            expect(res.grade_outcome).toBe(clvGrade);
            expect(Math.abs(res.pnl_u - settlePickPnl(stakeU, price, res.outcome))).toBeLessThan(1e-15);
          }
          for (const sel of ["yes", "no"] as const) {
            const res = settleAsianLine("btts", null, sel, hg, ag, stakeU, price);
            const clvGrade = gradeMarketOutcome("btts", sel, hg, ag, null);
            expect(res.grade_outcome).toBe(clvGrade);
            expect(Math.abs(res.pnl_u - settlePickPnl(stakeU, price, res.outcome))).toBeLessThan(1e-15);
          }
        }
      }

      // Integración directa con PickLedger y summarizePicksBootstrap en half_win y half_loss
      const ledger = new PickLedger();
      const fh = computeFeaturesHash({ dc_lam_home: 1.65, dc_lam_away: 1.12, dc_rho: -0.11 });
      ledger.appendPick({
        pick_id: "pk-a6-ah-quarter-1",
        ts_emitido: "2024-11-10T14:00:00Z",
        event_id: "ev-e0-001",
        sport: "football",
        league: "E0",
        market: "ah",
        line: 0.25,
        selection: "home",
        book: "b365",
        price_tomado: 2.0,
        p_modelo: 0.56,
        p_mercado: 0.52,
        p_final: 0.53,
        ev: 0.042,
        stake_u: 1.0,
        tier: "solido",
        version_modelo: "spacetime_v3.1_dc_markets_2way",
        features_hash: fh,
      });
      // Empate 1-1 en AH +0.25 -> half_win (+0.5u)
      const settled11 = settleAsianLine("ah", 0.25, "home", 1, 1, 1.0, 2.0);
      expect(settled11.outcome).toBe("half_win");
      expect(settled11.pnl_u).toBe(0.5);
      ledger.appendSettlement({
        pick_id: "pk-a6-ah-quarter-1",
        ts_liquidado: "2024-11-10T17:00:00Z",
        outcome: settled11.outcome,
      });
      const summary = summarizePicksBootstrap(ledger, { nResamples: 1000, seed: 42 });
      expect(summary.global.roi_pct).toBe(0.5);
    });
  });

  describe("3. Paridad numérica cruzada estricta < 1e-12 TS ↔ Python (`markets_2way.py`)", () => {
    it.skip("coincide a < 1e-12 en matriz Dixon-Coles, 4 mercados, retargeting, EV, Kelly ¼ y liquidación", () => {
      const pyBin = resolvePythonBin();
      expect(pyBin).not.toBeNull();

      const pyScript = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(REPO_ROOT, "services/models"))})
import markets_2way as m2w

cases = [
    (1.62, 1.14, -0.11, 12),
    (2.15, 0.85, -0.18, 10),
    (0.95, 1.52, 0.06, 14),
]
out = []
for lh, la, rho, mg in cases:
    mat = m2w.build_dixon_coles_score_matrix(lh, la, rho, mg)
    bundle = m2w.derive_all_2way_markets(lh, la, rho, mg)
    sp_ah = bundle["ah"]["home"]["-0.25"]
    sp_ou = bundle["totals"]["over"]["2.25"]
    rt_ah = m2w.retarget_settlement_probs(sp_ah, 0.545)
    ev_ah = m2w.compute_asian_ev(rt_ah, 1.97)
    kelly_ah = m2w.solve_exact_asian_kelly(rt_ah, 1.97)
    vb_ou = m2w.evaluate_asian_value_bet(sp_ou, 2.02, p_blended_effective=0.535, sigma_p=0.02, uncertainty_penalty_k=0.5)
    s1 = m2w.settle_asian_line("ah", -0.25, "home", 1, 1, 1.4, 1.97)
    s2 = m2w.settle_asian_line("ou", 2.75, "over", 2, 1, 1.2, 2.04)
    out.append({
        "lh": lh, "la": la, "rho": rho, "mg": mg,
        "mat_corners": [mat[0][0], mat[0][1], mat[1][0], mat[1][1], mat[2][1], mat[3][2]],
        "bundle": bundle,
        "rt_ah": rt_ah,
        "ev_ah": ev_ah,
        "kelly_ah": kelly_ah,
        "vb_ou": vb_ou,
        "s1": s1,
        "s2": s2,
    })
print(json.dumps(out))
`;
      const rawStdout = execFileSync(pyBin!, ["-c", pyScript], { encoding: "utf-8" });
      const pyVectors = JSON.parse(rawStdout) as Array<Record<string, any>>;
      expect(pyVectors).toHaveLength(3);

      const checkProbsParity = (tsSp: AsianSettlementProbs, pySp: Record<string, number>) => {
        for (const k of [
          "p_full_win",
          "p_half_win",
          "p_push",
          "p_half_loss",
          "p_full_loss",
          "p_effective_win",
        ] as const) {
          expect(Math.abs(tsSp[k] - pySp[k]!)).toBeLessThan(1e-12);
        }
      };

      for (const vec of pyVectors) {
        const { lh, la, rho, mg } = vec;
        const tsMat = buildDixonColesScoreMatrix(lh, la, rho, mg);
        const tsCorners = [
          tsMat[0]![0]!,
          tsMat[0]![1]!,
          tsMat[1]![0]!,
          tsMat[1]![1]!,
          tsMat[2]![1]!,
          tsMat[3]![2]!,
        ];
        for (let i = 0; i < tsCorners.length; i += 1) {
          expect(Math.abs(tsCorners[i]! - vec.mat_corners[i])).toBeLessThan(1e-12);
        }

        const tsBundle = deriveAll2WayMarkets(lh, la, rho, mg);
        for (const ln of AH_CANONICAL_LINES) {
          const k = formatLineKey(ln);
          checkProbsParity(tsBundle.ah.home[k]!, vec.bundle.ah.home[k]);
          checkProbsParity(tsBundle.ah.away[k]!, vec.bundle.ah.away[k]);
        }
        checkProbsParity(tsBundle.dnb.home, vec.bundle.dnb.home);
        checkProbsParity(tsBundle.dnb.away, vec.bundle.dnb.away);
        for (const ln of TOTALS_CANONICAL_LINES) {
          const k = formatLineKey(ln);
          checkProbsParity(tsBundle.totals.over[k]!, vec.bundle.totals.over[k]);
          checkProbsParity(tsBundle.totals.under[k]!, vec.bundle.totals.under[k]);
        }
        checkProbsParity(tsBundle.btts.yes, vec.bundle.btts.yes);
        checkProbsParity(tsBundle.btts.no, vec.bundle.btts.no);

        const tsRt = retargetSettlementProbs(tsBundle.ah.home["-0.25"]!, 0.545);
        checkProbsParity(tsRt, vec.rt_ah);
        expect(Math.abs(computeAsianEv(tsRt, 1.97) - vec.ev_ah)).toBeLessThan(1e-12);

        const tsKelly = solveExactAsianKelly(tsRt, 1.97);
        expect(Math.abs(tsKelly.f_full_kelly - vec.kelly_ah.f_full_kelly)).toBeLessThan(1e-12);
        expect(Math.abs(tsKelly.f_quarter_kelly - vec.kelly_ah.f_quarter_kelly)).toBeLessThan(1e-12);
        expect(Math.abs(tsKelly.stake_raw_u - vec.kelly_ah.stake_raw_u)).toBeLessThan(1e-12);
        expect(Math.abs(tsKelly.expected_log_growth_g - vec.kelly_ah.expected_log_growth_g)).toBeLessThan(1e-12);

        const tsVb = evaluateAsianValueBet(tsBundle.totals.over["2.25"]!, 2.02, {
          pBlendedEffective: 0.535,
          sigmaP: 0.02,
          uncertaintyPenaltyK: 0.5,
        });
        expect(Math.abs(tsVb.ev - vec.vb_ou.ev)).toBeLessThan(1e-12);
        expect(Math.abs(tsVb.stake_raw_u - vec.vb_ou.stake_raw_u)).toBeLessThan(1e-12);

        const tsS1 = settleAsianLine("ah", -0.25, "home", 1, 1, 1.4, 1.97);
        const tsS2 = settleAsianLine("ou", 2.75, "over", 2, 1, 1.2, 2.04);
        expect(tsS1.outcome).toBe(vec.s1.outcome);
        expect(Math.abs(tsS1.pnl_u - vec.s1.pnl_u)).toBeLessThan(1e-12);
        expect(tsS2.outcome).toBe(vec.s2.outcome);
        expect(Math.abs(tsS2.pnl_u - vec.s2.pnl_u)).toBeLessThan(1e-12);
      }
    });
  });

  describe("4. Artefacto `markets_2way_config.json`, regla estricta A4+A3 y holdout sellado", () => {
    it.skip("valida integridad de `markets_2way_config.json`, `markets_2way_eval.json` y `holdout_registry_a6.jsonl`", () => {
      expect(fs.existsSync(CONFIG_JSON_PATH)).toBe(true);
      expect(fs.existsSync(EVAL_JSON_PATH)).toBe(true);
      expect(fs.existsSync(A6_REGISTRY_PATH)).toBe(true);

      const cfg = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, "utf-8")) as Markets2WayConfigArtifact & {
        summary: Record<string, any>;
      };
      const ev = JSON.parse(fs.readFileSync(EVAL_JSON_PATH, "utf-8")) as Record<string, any>;
      const regLines = fs
        .readFileSync(A6_REGISTRY_PATH, "utf-8")
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l));

      expect(cfg.schema_version).toBe("markets_2way_config_v1");
      expect(cfg.eval_split).toBe("walk_forward_dev");
      expect(cfg.holdout_sealed_untouched).toBe(true);
      expect(ev.unlock_holdout).toBe(false);
      expect(regLines.length).toBeGreaterThanOrEqual(1);
      for (const entry of regLines) {
        expect(entry.eval_split).toBe("walk_forward_dev");
        expect(entry.unlock_holdout).toBe(false);
      }

      const segEntries = Object.entries(cfg.segments);
      expect(segEntries).toHaveLength(92);

      for (const [segKey, seg] of segEntries) {
        expect(ev.segments[segKey].enabled).toBe(seg.enabled);
        if (seg.enabled) {
          expect(seg.disabled_reason).toBeNull();
          expect(seg.a4_gate_passed).toBe(true);
          expect(seg.a3_validation_passed).toBe(true);
          expect(seg.w_effective).toBeGreaterThan(0.05);
          expect(seg.clv_pct_mean_oos_a3!).toBeGreaterThan(0.0);
        } else {
          expect(typeof seg.disabled_reason).toBe("string");
          expect(seg.disabled_reason!.length).toBeGreaterThan(0);
          expect(seg.w_effective).toBe(0.0);
        }
      }

      // Segmento no visto o deshabilitado cae a w_effective = 0 (100% mercado sin margen)
      const unseen = resolve2WayMarketSegment(cfg, "LIGA_DESCONOCIDA", "ah");
      expect(unseen.found).toBe(false);
      expect(unseen.entry.enabled).toBe(false);
      expect(unseen.entry.dc_rho_recommended).toBe(DEFAULT_DC_RHO);
      expect(cfg.dixon_coles_defaults?.default_max_goals).toBe(DEFAULT_MAX_GOALS);

      const candUnseen = evaluate2WayMarketCandidate({
        config: cfg,
        league: "LIGA_DESCONOCIDA",
        market: "ou",
        line: 2.25,
        selection: "over",
        lamHome: 1.6,
        lamAway: 1.2,
        marketPairRawOdds: [1.9, 1.96],
        executionPriceDecimal: 1.98,
      });
      expect(candUnseen.enabled).toBe(false);
      expect(candUnseen.w_effective).toBe(0.0);
      expect(Math.abs(candUnseen.p_final_effective - candUnseen.p_market_novig)).toBeLessThan(1e-14);
    });
  });
});
