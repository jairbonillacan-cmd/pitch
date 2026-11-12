/**
 * A28 (Ola 1 · Agente A2) — Suite de pruebas unitarias, Red Team y paridad numérica/criptográfica
 * exacta entre TypeScript (`ledger.ts` + `clv.ts`) y Python (`services/models/clv_report.py`).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOTSTRAP_RESAMPLES,
  computeClvMetrics,
  computeMaxDrawdownU,
  computePickClv,
  gradeMarketOutcome,
  settlePickPnl,
  summarizePicksBootstrap,
} from "../../src/domain/prediction/clv.js";
import {
  DuplicatePickError,
  GENESIS_HASH,
  LedgerIntegrityError,
  LedgerValidationError,
  PickLedger,
  computeFeaturesHash,
  computeLedgerEntryHash,
  sha256Hex,
  verifyLedgerIntegrity,
  type PickLedgerInput,
} from "../../src/domain/prediction/ledger.js";

function makeSamplePick(overrides: Partial<PickLedgerInput> = {}): PickLedgerInput {
  return {
    pick_id: "pk-mx-001",
    ts_emitido: "2026-09-12T18:30:00Z",
    event_id: "ev-ligamx-001",
    sport: "football",
    league: "Liga MX",
    market: "ah",
    line: -0.25,
    selection: "home",
    book: "caliente_mx",
    price_tomado: 2.1,
    p_modelo: 0.54,
    p_mercado: 0.49,
    p_final: 0.52,
    ev: 0.092,
    stake_u: 1.5,
    tier: "solido",
    version_modelo: "3.0.0",
    features_hash: "a".repeat(64),
    ...overrides,
  };
}

describe("A2 — SHA-256 puro (FIPS 180-4)", () => {
  it("reproduce vectores estándar FIPS 180-4 y cadenas multibyte UTF-8", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });
});

describe("A2 — Ledger inmutable append-only (PickLedger)", () => {
  it("almacena los 18 campos obligatorios, congela registros y encadena prev_hash -> entry_hash", () => {
    const ledger = new PickLedger();
    expect(ledger.headHash).toBe(GENESIS_HASH);

    const inputObj = { ...makeSamplePick() };
    const e1 = ledger.appendPick(inputObj);

    // Mutar el objeto de entrada posterior a appendPick jamás altera el registro guardado
    inputObj.price_tomado = 99.0;
    expect(ledger.getPick("pk-mx-001")?.price_tomado).toBe(2.1);

    expect(e1.record_type).toBe("pick");
    expect(e1.prev_hash).toBe(GENESIS_HASH);
    expect(e1.entry_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(e1)).toBe(true);

    // Intentar mutar el registro congelado lanza TypeError en modo estricto ES2022
    expect(() => {
      (e1 as unknown as { price_tomado: number }).price_tomado = 3.5;
    }).toThrow(TypeError);

    // Intentar mutar el arreglo devuelto por getPicks() también lanza TypeError
    const picksView = ledger.getPicks();
    expect(Object.isFrozen(picksView)).toBe(true);
    expect(() => {
      (picksView as unknown as PickLedgerInput[]).push(makeSamplePick({ pick_id: "hack" }));
    }).toThrow(TypeError);

    const e2 = ledger.appendPick(
      makeSamplePick({
        pick_id: "pk-mx-002",
        market: "1x2",
        line: null,
        tier: "valor",
      }),
    );
    expect(e2.prev_hash).toBe(e1.entry_hash);
    expect(ledger.verifyIntegrity()).toBe(true);
  });

  it("rechaza pick_id duplicados y rangos inválidos o no finitos", () => {
    const ledger = new PickLedger();
    ledger.appendPick(makeSamplePick({ pick_id: "dup-01" }));

    expect(() => ledger.appendPick(makeSamplePick({ pick_id: "dup-01" }))).toThrow(
      DuplicatePickError,
    );

    for (const badPrice of [1.0, 0.99, -2.0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        ledger.appendPick(makeSamplePick({ pick_id: `pr-${String(badPrice)}`, price_tomado: badPrice })),
      ).toThrow(LedgerValidationError);
    }

    for (const badProb of [0, 1, -0.05, 1.01, Number.NaN]) {
      expect(() =>
        ledger.appendPick(makeSamplePick({ pick_id: `pf-${String(badProb)}`, p_final: badProb })),
      ).toThrow(LedgerValidationError);
    }

    for (const badStake of [0, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        ledger.appendPick(makeSamplePick({ pick_id: `st-${String(badStake)}`, stake_u: badStake })),
      ).toThrow(LedgerValidationError);
    }

    for (const badTier of ["inventado", "baseline_v3_0", "especulativo"]) {
      expect(() =>
        ledger.appendPick(
          makeSamplePick({
            pick_id: `bad-tier-${badTier}`,
            tier: badTier as unknown as PickLedgerInput["tier"],
          }),
        ),
      ).toThrow(LedgerValidationError);
    }
  });

  it("registra cierres y liquidaciones en eslabones separados sin mutar la emisión original y detecta alteración JSONL", () => {
    const ledger = new PickLedger();
    const pick = ledger.appendPick(makeSamplePick({ pick_id: "pk-chain-1" }));
    const pickSnapshotJson = JSON.stringify(pick);

    const closing = ledger.appendClosing({
      pick_id: "pk-chain-1",
      ts_recorded: "2026-09-12T20:59:59Z",
      closing_missing: false,
      closing_book: "pinnacle",
      closing_source: "scraped_ws",
      price_cierre_bruto: 1.94,
      price_cierre_sin_margen: 2.0,
    });
    const settlement = ledger.appendSettlement({
      pick_id: "pk-chain-1",
      ts_liquidado: "2026-09-12T23:10:00Z",
      outcome: "half_win",
    });

    expect(JSON.stringify(ledger.getPick("pk-chain-1"))).toBe(pickSnapshotJson);
    expect(closing.prev_hash).toBe(pick.entry_hash);
    expect(settlement.prev_hash).toBe(closing.entry_hash);
    expect(settlement.pnl_u).toBeCloseTo(0.5 * 1.5 * (2.1 - 1.0), 12);

    const jsonl = ledger.toJsonl();
    const restored = PickLedger.fromJsonl(jsonl);
    expect(restored.recordCount).toBe(3);
    expect(restored.headHash).toBe(ledger.headHash);

    // Alteración retroactiva del primer registro en JSONL
    const lines = jsonl.trim().split("\n");
    const tamperedFirst = JSON.parse(lines[0]!) as Record<string, unknown>;
    tamperedFirst.price_tomado = 2.45;
    const tamperedJsonl = [JSON.stringify(tamperedFirst), lines[1]!, lines[2]!].join("\n") + "\n";
    expect(() => PickLedger.fromJsonl(tamperedJsonl)).toThrow(LedgerIntegrityError);

    // Incluso recalculando el hash del primer eslabón, rompe prev_hash del segundo eslabón
    tamperedFirst.entry_hash = computeLedgerEntryHash(
      tamperedFirst as unknown as Parameters<typeof computeLedgerEntryHash>[0],
    );
    const brokenChainJsonl = [JSON.stringify(tamperedFirst), lines[1]!, lines[2]!].join("\n") + "\n";
    expect(() => PickLedger.fromJsonl(brokenChainJsonl)).toThrow(LedgerIntegrityError);
  });
});

describe("A2 — Tracker de CLV, bloqueo de casas recreativas y liquidación asiática", () => {
  it("calcula clv_pct y clv_prob exactos y anula a null cuando falta cierre sharp o es casa recreativa", () => {
    const ok = computePickClv({
      price_tomado: 2.1,
      price_cierre_sin_margen: 2.0,
      closing_missing: false,
      closing_book: "pinnacle",
    });
    expect(ok.closing_missing).toBe(false);
    expect(ok.clv_pct).toBeCloseTo(2.1 / 2.0 - 1, 14);
    expect(ok.clv_prob).toBeCloseTo(1 / 2.0 - 1 / 2.1, 14);

    const missing = computePickClv({
      price_tomado: 2.1,
      price_cierre_sin_margen: 2.0,
      closing_missing: true,
      closing_book: "pinnacle",
    });
    expect(missing.clv_pct).toBeNull();
    expect(missing.clv_prob).toBeNull();
    expect(missing.closing_missing).toBe(true);

    for (const recBook of ["caliente_mx", "caliente", "codere", "b365", "bfe"]) {
      const blocked = computePickClv({
        price_tomado: 2.1,
        price_cierre_sin_margen: 2.0,
        closing_missing: false,
        closing_book: recBook,
      });
      expect(blocked.clv_pct).toBeNull();
      expect(blocked.clv_prob).toBeNull();
      expect(blocked.closing_missing).toBe(true);
    }

    // En historical_fd solo Pinnacle es válido (ni siquiera smarkets)
    const smarketsHist = computePickClv({
      price_tomado: 2.1,
      price_cierre_sin_margen: 2.0,
      closing_missing: false,
      closing_book: "smarkets",
      closing_source: "historical_fd",
    });
    expect(smarketsHist.clv_pct).toBeNull();
    expect(smarketsHist.closing_missing).toBe(true);
  });

  it("liquida victorias, derrotas, push/void y medias líneas asiáticas con exactitud", () => {
    expect(settlePickPnl(2.0, 2.2, "win")).toBeCloseTo(2.4, 12);
    expect(settlePickPnl(2.0, 2.2, "loss")).toBeCloseTo(-2.0, 12);
    expect(settlePickPnl(2.0, 2.2, "void")).toBeCloseTo(0, 12);
    expect(settlePickPnl(2.0, 2.2, "push")).toBeCloseTo(0, 12);
    expect(settlePickPnl(2.0, 2.2, "half_win")).toBeCloseTo(1.2, 12);
    expect(settlePickPnl(2.0, 2.2, "half_loss")).toBeCloseTo(-1.0, 12);

    expect(gradeMarketOutcome("ah", "home", 0, 0, -0.25)).toBe("half_loss");
    expect(gradeMarketOutcome("ah", "home", 0, 0, 0.25)).toBe("half_win");
    expect(gradeMarketOutcome("ah", "home", 1, 0, -0.75)).toBe("half_win");
    expect(gradeMarketOutcome("ou", "over", 2, 0, 2.25)).toBe("half_loss");
    expect(gradeMarketOutcome("ou", "under", 2, 0, 2.25)).toBe("half_win");
    expect(gradeMarketOutcome("dnb", "away", 1, 1)).toBe("void");
    expect(computeMaxDrawdownU([1.0, -2.5, -1.0, 4.0])).toBeCloseTo(3.5, 12);
  });
});

describe("A2 — Bootstrap (>= 1000 remuestreos) y Paridad Exacta TS <-> Python", () => {
  it("calcula IC 95% bootstrap, significancia y desgloses por league, market, tier y book", () => {
    const picks = Array.from({ length: 30 }, (_, i) => ({
      ...makeSamplePick({
        pick_id: `boot-${i}`,
        league: i % 2 === 0 ? "Liga MX" : "E0",
        market: i % 3 === 0 ? "ah" : "1x2",
        tier: i % 2 === 0 ? "solido" : "valor",
        book: i % 2 === 0 ? "caliente_mx" : "codere_mx",
        price_tomado: i % 2 === 0 ? 2.1 : 1.9,
        stake_u: 1.0,
      }),
      closing_missing: false,
      closing_book: "pinnacle",
      price_cierre_sin_margen: 2.0,
      outcome: (i % 2 === 0 ? "win" : "loss") as "win" | "loss",
    }));

    const rep = summarizePicksBootstrap(picks, { seed: 42 });
    expect(rep.meta.n_resamples).toBe(DEFAULT_BOOTSTRAP_RESAMPLES);
    expect(rep.global.statistically_significant).toBe(false);
    expect(rep.global.significance_label).toBe("no significativa");
    expect(Object.keys(rep.by_league)).toEqual(["E0", "Liga MX"]);
    expect(Object.keys(rep.by_tier)).toEqual(["solido", "valor"]);
    expect(Object.keys(rep.by_book)).toEqual(["caliente_mx", "codere_mx"]);

    const evalList = computeClvMetrics(picks);
    expect(evalList).toHaveLength(30);

    expect(() => summarizePicksBootstrap(picks, { nResamples: 999 })).toThrow(
      LedgerValidationError,
    );
  });

  it("mantiene paridad bit a bit en SHA-256 y |Δ| < 1e-12 en Bootstrap frente a services/models/clv_report.py", () => {
    const fh = computeFeaturesHash({
      xg_diff: 0.45,
      liga: "Liga MX — América",
      vals: [1.0, null, -0.25],
    });
    expect(fh).toBe("de5682eca3227e9ab07e6377a02b2c7cd8423f0d55c0cb7330f16ed4de6bb18f");

    const ledger = new PickLedger();
    ledger.appendPick({
      pick_id: "pk-001",
      ts_emitido: "2026-08-15T18:00:00Z",
      event_id: "ev-mx-101",
      sport: "football",
      league: "Liga MX",
      market: "ah",
      line: -0.25,
      selection: "home",
      book: "caliente_mx",
      price_tomado: 2.1,
      p_modelo: 0.53,
      p_mercado: 0.49,
      p_final: 0.515,
      ev: 0.0815,
      stake_u: 1.5,
      tier: "solido",
      version_modelo: "3.0.0",
      features_hash: fh,
    });
    ledger.appendClosing({
      pick_id: "pk-001",
      ts_recorded: "2026-08-15T19:59:59Z",
      closing_missing: false,
      closing_book: "pinnacle",
      closing_source: "scraped_ws",
      price_cierre_bruto: 1.94,
      price_cierre_sin_margen: 2.0,
    });
    ledger.appendSettlement({
      pick_id: "pk-001",
      ts_liquidado: "2026-08-15T22:10:00Z",
      outcome: "half_win",
    });

    ledger.appendPick({
      pick_id: "pk-002",
      ts_emitido: "2026-08-16T16:00:00Z",
      event_id: "ev-epl-202",
      sport: "football",
      league: "E0",
      market: "1x2",
      line: null,
      selection: "away",
      book: "b365",
      price_tomado: 2.4,
      p_modelo: 0.46,
      p_mercado: 0.43,
      p_final: 0.445,
      ev: 0.068,
      stake_u: 1.0,
      tier: "valor",
      version_modelo: "3.0.0",
      features_hash: fh,
    });
    ledger.appendClosing({
      pick_id: "pk-002",
      ts_recorded: "2026-08-16T17:59:59Z",
      closing_missing: false,
      closing_book: "pinnacle",
      closing_source: "historical_fd",
      price_cierre_sin_margen: 2.25,
    });
    ledger.appendSettlement({
      pick_id: "pk-002",
      ts_liquidado: "2026-08-16T20:00:00Z",
      outcome: "loss",
    });

    ledger.appendPick(
      {
        pick_id: "pk-003",
        ts_emitido: "2026-08-17T20:00:00Z",
        event_id: "ev-nfl-303",
        sport: "nfl",
        league: "NFL",
        market: "spread",
        line: -3.0,
        selection: "home",
        book: "codere_mx",
        price_tomado: 1.95,
        p_modelo: 0.55,
        p_mercado: 0.52,
        p_final: 0.54,
        ev: 0.053,
        stake_u: 1.0,
        tier: "baseline_v3_0",
        version_modelo: "3.0.0",
        features_hash: fh,
      },
      { allowLegacyTiers: true },
    );
    ledger.appendClosing({
      pick_id: "pk-003",
      ts_recorded: "2026-08-17T23:59:59Z",
      closing_missing: true,
    });
    ledger.appendSettlement({
      pick_id: "pk-003",
      ts_liquidado: "2026-08-18T03:15:00Z",
      outcome: "void",
    });

    expect(verifyLedgerIntegrity(ledger.getRecords())).toBe(true);
    const deserializedHistorical = PickLedger.fromJsonl(ledger.toJsonl());
    expect(deserializedHistorical.getPick("pk-003")?.tier).toBe("baseline_v3_0");
    expect(deserializedHistorical.headHash).toBe(ledger.headHash);

    // Los 9 hashes SHA-256 encadenados coinciden carácter por carácter con Python (`clv_report.py`)
    expect(ledger.getRecords().map((r) => r.entry_hash)).toEqual([
      "68562c60e8fac11f874b59a81246f0f70e63cb2988adea60cd28b8fc1ecb5fbc",
      "cf12b701bdb26f5adf4c3a1857a02905ba845be945e2f4eeb6d0826ae6f59c8c",
      "b6884fb3ba3d57be38c24e76e5a7bba18020c2bf5c235eb2806260d31ee49b8b",
      "24336218627244745baedde4e6ca1106b337af363199cd4feb1d422aafec01a8",
      "9bc38359961fff1536b5044bd4772707b3be355e045a74cb5b00be1513e0dde3",
      "e1d5b8e6ed39f00d875267ab8a91cd4b001d0dff561f5b463bf47c959466538b",
      "8c8391e581f8dbdb6af29738036152c826c4999ad47f27367a633477a8f43a58",
      "cecd39ffeab8343a2ef9319e9b23237d44e7f13abe03bb50aebb9de9bb8f3b4c",
      "2b4d1150e91cc4a8e9c790965140a674e3c82ef7943e06ad6907275b4e49eb3e",
    ]);

    const rep = summarizePicksBootstrap(ledger, { nResamples: 1000, seed: 20261111 });
    const g = rep.global;
    expect(Math.abs(g.clv_pct_mean! - 0.05833333333333335)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.clv_pct_ci95![0] - 0.050000000000000044)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.clv_pct_ci95![1] - 0.06666666666666665)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.clv_prob_mean! - 0.025793650793650785)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.clv_prob_ci95![0] - 0.023809523809523836)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.clv_prob_ci95![1] - 0.027777777777777735)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.roi_pct! - -0.05)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.roi_pct_ci95![0] - -1.0)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.roi_pct_ci95![1] - 0.55)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.roi_bootstrap.prob_gt_zero! - 0.372)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(g.max_drawdown_u - 1.0)).toBeLessThanOrEqual(1e-12);
  });
});
