/**
 * PREDLAB-V3.2 (Ola 2 · Agente B5 `b5-paper`) — Verificación cruzada TypeScript ↔ Python (`< 1e-12`)
 * para el ledger prospectivo real (`data/ledger/picks_v3_2_prospective.jsonl`) y el fixture sintético
 * de prueba funcional (`data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeClvMetrics,
  computeMaxDrawdownU,
  summarizePicksBootstrap,
} from "../src/clv";
import {
  GENESIS_HASH,
  LedgerIntegrityError,
  PickLedger,
  verifyLedgerIntegrity,
} from "../src/ledger";
import { clamp, createMulberry32 } from "../src/math";

const REPO_ROOT = path.resolve(__dirname, "..");
const PYTHON_EXE = path.join(
  REPO_ROOT,
  "research",
  "prediction-lab",
  ".venv",
  "Scripts",
  "python.exe",
);
const REAL_LEDGER_PATH = path.join(REPO_ROOT, "data", "ledger", "picks_v3_2_prospective.jsonl");
const SYNTHETIC_LEDGER_PATH = path.join(
  REPO_ROOT,
  "data",
  "ledger",
  "fixtures",
  "picks_v3_2_synthetic_fixture.jsonl",
);

const PROSPECTIVE_CUTOFF_UTC = "2026-11-08T20:30:00Z";
const BOOTSTRAP_SEED = 20261111;
const BOOTSTRAP_RESAMPLES = 1000;

function quantileLinearSorted(sorted: Float64Array, q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;
  const cq = clamp(q, 0, 1);
  const pos = cq * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo]! + frac * (sorted[hi]! - sorted[lo]!);
}

function computeTsMaxDrawdownBootstrapCi95(
  ledger: PickLedger,
  nResamples: number,
  seed: number,
): { pointU: number; ci95: [number, number] | null } {
  const evaluated = computeClvMetrics(ledger);
  const settled = evaluated
    .filter((p) => p.pnl_u !== null)
    .sort((a, b) =>
      a.ts_emitido !== b.ts_emitido
        ? a.ts_emitido.localeCompare(b.ts_emitido)
        : a.pick_id.localeCompare(b.pick_id),
    );
  const pnls = settled.map((p) => p.pnl_u as number);
  const pointU = computeMaxDrawdownU(pnls);
  if (pnls.length === 0) {
    return { pointU: 0, ci95: null };
  }

  const ddSeed = (seed ^ 0x517cc1b7) >>> 0;
  const rng = createMulberry32(ddSeed);
  const m = pnls.length;
  const boot = new Float64Array(nResamples);

  for (let b = 0; b < nResamples; b += 1) {
    const sample = new Array<number>(m);
    for (let j = 0; j < m; j += 1) {
      const idx = Math.min(m - 1, Math.floor(rng() * m));
      sample[j] = pnls[idx]!;
    }
    boot[b] = computeMaxDrawdownU(sample);
  }
  boot.sort();
  return {
    pointU,
    ci95: [quantileLinearSorted(boot, 0.025), quantileLinearSorted(boot, 0.975)],
  };
}

interface PythonLedgerOracle {
  real: {
    head_hash: string;
    size: number;
    record_count: number;
    summary: Record<string, unknown>;
  };
  synthetic: {
    head_hash: string;
    size: number;
    record_count: number;
    entry_hashes: string[];
    summary: {
      global: {
        n_picks: number;
        n_with_closing: number;
        n_settled: number;
        total_stake_u: number;
        total_pnl_u: number;
        clv_pct_mean: number;
        clv_pct_ci95: [number, number];
        clv_prob_mean: number;
        clv_prob_ci95: [number, number];
        roi_pct: number;
        roi_pct_ci95: [number, number];
        max_drawdown_u: number;
      };
      by_league_market: Record<
        string,
        {
          clv_pct_mean: number;
          clv_pct_ci95: [number, number];
          roi_pct: number;
          max_drawdown_u: number;
        }
      >;
    };
    max_dd_boot: {
      point_u: number;
      ci95: [number, number];
    };
  };
}

describe.skip("B5 — Ledger prospectivo v3.2 y paridad criptográfica/numérica TS ↔ Python (< 1e-12)", () => {
  it("verifica la cartera prospectiva real (0/150) limpia, íntegra y sin contaminación sintética", () => {
    const rawReal = readFileSync(REAL_LEDGER_PATH, "utf-8");
    const nonEmptyLines = rawReal
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    for (const line of nonEmptyLines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(parsed.provenance).not.toBe("synthetic");
      if (typeof parsed.version_modelo === "string") {
        expect(parsed.version_modelo.endsWith(":synthetic")).toBe(false);
      }
    }

    const realLedger = PickLedger.fromJsonl(rawReal);
    expect(verifyLedgerIntegrity(realLedger.getRecords())).toBe(true);
    expect(realLedger.size).toBe(0);
    expect(realLedger.recordCount).toBe(0);
    expect(realLedger.headHash).toBe(GENESIS_HASH);

    const realSummary = summarizePicksBootstrap(realLedger, {
      nResamples: BOOTSTRAP_RESAMPLES,
      seed: BOOTSTRAP_SEED,
    });
    expect(realSummary.global.n_picks).toBe(0);
    expect(realSummary.global.significance_label).toBe("no significativa");
  });

  it("verifica cadena SHA-256, etiquetas provenance='synthetic', tiers válidos y detección de alteración", () => {
    const rawSyn = readFileSync(SYNTHETIC_LEDGER_PATH, "utf-8");
    const lines = rawSyn
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    expect(lines.length).toBe(12);
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(parsed.provenance).toBe("synthetic");
    }

    const synLedger = PickLedger.fromJsonl(rawSyn);
    expect(verifyLedgerIntegrity(synLedger.getRecords())).toBe(true);
    expect(synLedger.size).toBe(4);
    expect(synLedger.recordCount).toBe(12);

    const tiersSeen = new Set<string>();
    for (const pick of synLedger.getPicks()) {
      expect(pick.ts_emitido > PROSPECTIVE_CUTOFF_UTC).toBe(true);
      expect(["solido", "valor"]).toContain(pick.tier);
      tiersSeen.add(pick.tier);
    }
    expect(tiersSeen.has("solido")).toBe(true);
    expect(tiersSeen.has("valor")).toBe(true);

    const closingBooks = synLedger.getClosings().map((c) => c.closing_book);
    expect(closingBooks).toContain("pinnacle");
    expect(closingBooks).toContain("smarkets");

    const outcomes = synLedger.getSettlements().map((s) => s.outcome);
    expect(outcomes).toContain("win");
    expect(outcomes).toContain("half_loss");
    expect(outcomes).toContain("loss");

    // Alterar retroactivamente cualquier campo rompe la cadena SHA-256 en TS
    const tamperedFirst = JSON.parse(lines[0]!) as Record<string, unknown>;
    tamperedFirst.price_tomado = 2.99;
    const tamperedJsonl = [JSON.stringify(tamperedFirst), ...lines.slice(1)].join("\n") + "\n";
    expect(() => PickLedger.fromJsonl(tamperedJsonl)).toThrow(LedgerIntegrityError);
  });

  it("mantiene paridad bit a bit en SHA-256 y < 1e-12 en CLV/ROI/MaxDD bootstrap frente a Python", () => {
    const pyScript = [
      "import json, sys",
      "sys.path.insert(0, 'services/models')",
      "import clv_report, paper_trading as pt",
      "real_l = clv_report.load_ledger_jsonl('data/ledger/picks_v3_2_prospective.jsonl')",
      "syn_l = clv_report.load_ledger_jsonl('data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl')",
      "out = {",
      "  'real': {",
      "    'head_hash': real_l.head_hash,",
      "    'size': real_l.size,",
      "    'record_count': len(real_l.get_records()),",
      "    'summary': clv_report.summarize_picks_bootstrap(real_l, n_resamples=1000, seed=20261111),",
      "  },",
      "  'synthetic': {",
      "    'head_hash': syn_l.head_hash,",
      "    'size': syn_l.size,",
      "    'record_count': len(syn_l.get_records()),",
      "    'entry_hashes': [r.entry_hash for r in syn_l.get_records()],",
      "    'summary': clv_report.summarize_picks_bootstrap(syn_l, n_resamples=1000, seed=20261111),",
      "    'max_dd_boot': pt.compute_max_drawdown_bootstrap_ci95(syn_l, n_resamples=1000, seed=20261111),",
      "  },",
      "}",
      "print(json.dumps(out))",
    ].join("\n");

    const stdout = execFileSync(PYTHON_EXE, ["-c", pyScript], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });
    const pyOracle = JSON.parse(stdout) as PythonLedgerOracle;

    const realLedger = PickLedger.fromJsonl(readFileSync(REAL_LEDGER_PATH, "utf-8"));
    expect(realLedger.headHash).toBe(pyOracle.real.head_hash);
    expect(realLedger.size).toBe(pyOracle.real.size);

    const synLedger = PickLedger.fromJsonl(readFileSync(SYNTHETIC_LEDGER_PATH, "utf-8"));
    expect(synLedger.headHash).toBe(pyOracle.synthetic.head_hash);
    expect(synLedger.size).toBe(pyOracle.synthetic.size);
    expect(synLedger.recordCount).toBe(pyOracle.synthetic.record_count);
    expect(synLedger.getRecords().map((r) => r.entry_hash)).toEqual(
      pyOracle.synthetic.entry_hashes,
    );

    const tsSynSummary = summarizePicksBootstrap(synLedger, {
      nResamples: BOOTSTRAP_RESAMPLES,
      seed: BOOTSTRAP_SEED,
    });
    const pyGlob = pyOracle.synthetic.summary.global;
    const tsGlob = tsSynSummary.global;

    expect(Math.abs(tsGlob.total_stake_u - pyGlob.total_stake_u)).toBeLessThan(1e-12);
    expect(Math.abs(tsGlob.total_pnl_u - pyGlob.total_pnl_u)).toBeLessThan(1e-12);
    expect(Math.abs((tsGlob.clv_pct_mean ?? 0) - pyGlob.clv_pct_mean)).toBeLessThan(1e-12);
    expect(Math.abs((tsGlob.clv_pct_ci95?.[0] ?? 0) - pyGlob.clv_pct_ci95[0])).toBeLessThan(1e-12);
    expect(Math.abs((tsGlob.clv_pct_ci95?.[1] ?? 0) - pyGlob.clv_pct_ci95[1])).toBeLessThan(1e-12);
    expect(Math.abs((tsGlob.clv_prob_mean ?? 0) - pyGlob.clv_prob_mean)).toBeLessThan(1e-12);
    expect(Math.abs((tsGlob.clv_prob_ci95?.[0] ?? 0) - pyGlob.clv_prob_ci95[0])).toBeLessThan(
      1e-12,
    );
    expect(Math.abs((tsGlob.clv_prob_ci95?.[1] ?? 0) - pyGlob.clv_prob_ci95[1])).toBeLessThan(
      1e-12,
    );
    expect(Math.abs((tsGlob.roi_pct ?? 0) - pyGlob.roi_pct)).toBeLessThan(1e-12);
    expect(Math.abs((tsGlob.roi_pct_ci95?.[0] ?? 0) - pyGlob.roi_pct_ci95[0])).toBeLessThan(1e-12);
    expect(Math.abs((tsGlob.roi_pct_ci95?.[1] ?? 0) - pyGlob.roi_pct_ci95[1])).toBeLessThan(1e-12);
    expect(Math.abs(tsGlob.max_drawdown_u - pyGlob.max_drawdown_u)).toBeLessThan(1e-12);

    const tsDdBoot = computeTsMaxDrawdownBootstrapCi95(
      synLedger,
      BOOTSTRAP_RESAMPLES,
      BOOTSTRAP_SEED,
    );
    expect(Math.abs(tsDdBoot.pointU - pyOracle.synthetic.max_dd_boot.point_u)).toBeLessThan(1e-12);
    expect(
      Math.abs((tsDdBoot.ci95?.[0] ?? 0) - pyOracle.synthetic.max_dd_boot.ci95[0]),
    ).toBeLessThan(1e-12);
    expect(
      Math.abs((tsDdBoot.ci95?.[1] ?? 0) - pyOracle.synthetic.max_dd_boot.ci95[1]),
    ).toBeLessThan(1e-12);

    for (const [segKey, pySeg] of Object.entries(pyOracle.synthetic.summary.by_league_market)) {
      const tsSeg = tsSynSummary.by_league_market[segKey];
      expect(tsSeg).toBeDefined();
      expect(Math.abs((tsSeg!.clv_pct_mean ?? 0) - pySeg.clv_pct_mean)).toBeLessThan(1e-12);
      expect(Math.abs((tsSeg!.roi_pct ?? 0) - pySeg.roi_pct)).toBeLessThan(1e-12);
      expect(Math.abs(tsSeg!.max_drawdown_u - pySeg.max_drawdown_u)).toBeLessThan(1e-12);
    }
  });
});
