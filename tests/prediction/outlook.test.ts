import { describe, expect, it } from "vitest";

import { probabilityToFairOdds as contractsProbabilityToFairOdds } from "../../packages/contracts/src/view-models";
import blendWeightsJson from "../../src/data/prediction/blend_weights_v3_1.json";
import featuresSnapshotJson from "../../src/data/prediction/features_snapshot.json";
import modelMotorAJson from "../../src/data/prediction/model_motor_a.json";
import modelNflJson from "../../src/data/prediction/model_nfl.json";
import nflSnapshotJson from "../../src/data/prediction/nfl_snapshot.json";
import { computeSegmentBlendedProbs, type BlendWeightsArtifact } from "../../src/domain/prediction/blend";
import { createMulberry32 as clvMulberry32 } from "../../src/domain/prediction/clv";
import {
  buildDixonColesScoreMatrix,
  deriveAll2WayMarkets,
} from "../../src/domain/prediction/markets_2way";
import {
  clamp,
  createMulberry32,
  logit,
  normalCdf,
  sigmoid,
} from "../../src/domain/prediction/math";
import { createMulberry32 as mcMulberry32 } from "../../src/domain/prediction/montecarlo";
import type { OddsSnapshotRow } from "../../src/domain/prediction/odds";
import {
  buildMatchOutlook,
  canonicalizeOutlookLeague,
  FALLBACK_OUTLOOK_CALIBRATION_ARTIFACT,
  getDefaultOutlookCalibrationArtifact,
  OUTLOOK_SCHEMA_VERSION,
  OutlookValidationError,
  probabilityToFairOdds,
  resolveCalibrationBucket,
  type FootballOutlookMarketKey,
  type MatchOutlook,
  type OutlookCalibrationArtifact,
} from "../../src/domain/prediction/outlook";
import type {
  ModelArtifact,
  NFLModelArtifact,
  NFLSnapshotFile,
  SnapshotFile,
} from "../../src/domain/prediction/types";

const motorA = modelMotorAJson as unknown as ModelArtifact;
const footballSnapshots = featuresSnapshotJson as unknown as SnapshotFile;
const nflModel = modelNflJson as unknown as NFLModelArtifact;
const nflSnapshots = nflSnapshotJson as unknown as NFLSnapshotFile;
const blendArtifact = blendWeightsJson as unknown as BlendWeightsArtifact;

const FORBIDDEN_KEY_NAMES = new Set([
  "stake",
  "stake_u",
  "stake_raw_u",
  "kelly",
  "kellyfraction",
  "f_full_kelly",
  "f_quarter_kelly",
  "expectededge",
  "edge",
  "edge_effective",
  "ev",
  "ev_shrunk",
  "value",
  "valuestatus",
  "tier",
]);

function assertNoBettingOrStakeLeakage(node: unknown, path = "root"): void {
  if (node === null || node === undefined) return;
  if (typeof node === "string") {
    expect(node.toLowerCase(), `string prohibido en ${path}`).not.toContain("pick seguro");
    return;
  }
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, idx) => assertNoBettingOrStakeLeakage(item, `${path}[${idx}]`));
    return;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const normKey = k.toLowerCase();
    expect(
      FORBIDDEN_KEY_NAMES.has(normKey),
      `clave prohibida "${k}" detectada en ${path}.${k}`,
    ).toBe(false);
    expect(normKey).not.toContain("kelly");
    expect(normKey).not.toContain("stake");
    assertNoBettingOrStakeLeakage(v, `${path}.${k}`);
  }
}

describe("math.ts — primitivas deterministas compartidas", () => {
  it("mantiene identidad logit/sigmoid, simetría normalCdf y paridad exacta de mulberry32", () => {
    expect(clamp(-2, 0.01, 0.99)).toBe(0.01);
    expect(clamp(2, 0.01, 0.99)).toBe(0.99);
    expect(clamp(0.42, 0.01, 0.99)).toBe(0.42);

    expect(sigmoid(-800)).toBe(0);
    expect(sigmoid(800)).toBe(1);
    for (const p of [0.01, 0.12, 0.37, 0.5, 0.73, 0.99]) {
      expect(Math.abs(sigmoid(logit(p)) - p)).toBeLessThan(1e-12);
    }

    // Abramowitz & Stegun 7.1.26 evalúa normalCdf(0) = 0.5000000005 (|Δ| = 5e-10 < 1e-9)
    expect(Math.abs(normalCdf(0) - 0.5)).toBeLessThan(1e-9);
    for (const z of [-3.5, -1.96, -0.75, 0.25, 1.645, 2.8]) {
      expect(Math.abs(normalCdf(z) + normalCdf(-z) - 1)).toBeLessThan(1e-12);
    }

    const rMath = createMulberry32(20261112);
    const rClv = clvMulberry32(20261112);
    const rMc = mcMulberry32(20261112);
    for (let i = 0; i < 50; i += 1) {
      const u = rMath();
      expect(u).toBe(rClv());
      expect(u).toBe(rMc());
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});

describe("probabilityToFairOdds — paridad exacta con @pitchlab/contracts", () => {
  it("coincide bit a bit con packages/contracts/src/view-models.ts en todo (0, 1) y extremos", () => {
    const testPoints = [0, 0.001, 0.01, 0.05, 0.2, 0.5, 0.625, 0.8, 0.99, 0.999, 1];
    for (let k = 1; k < 200; k += 1) {
      testPoints.push(k / 200);
    }
    for (const p of testPoints) {
      expect(probabilityToFairOdds(p)).toEqual(contractsProbabilityToFairOdds(p));
    }

    expect(probabilityToFairOdds(0.002)).toEqual({ decimal: 100, american: 9900 });
    expect(probabilityToFairOdds(0.5)).toEqual({ decimal: 2, american: 100 });
    expect(probabilityToFairOdds(0.999)).toEqual({ decimal: 1.01, american: -10000 });
    expect(() => probabilityToFairOdds(Number.NaN)).toThrow(OutlookValidationError);
    expect(() => probabilityToFairOdds(Number.POSITIVE_INFINITY)).toThrow(OutlookValidationError);
  });
});

describe("buildMatchOutlook — coherencia exacta de matriz única Dixon-Coles en fútbol", () => {
  it("deriva los 11 mercados y top 3 marcadores de una sola matriz DC con error < 1e-12", () => {
    const lamHome = 1.68;
    const lamAway = 1.12;
    const rho = -0.05;
    const maxGoals = 12;

    const matrix = buildDixonColesScoreMatrix(lamHome, lamAway, rho, maxGoals);
    const derived = deriveAll2WayMarkets(lamHome, lamAway, rho, maxGoals);

    const outlook = buildMatchOutlook({
      matchId: "dc-coherence-check-01",
      sport: "football",
      league: "MEX",
      homeTeam: "Club América",
      awayTeam: "CD Guadalajara",
      tsDecision: "2026-11-12T18:00:00Z",
      kickoffUtc: "2026-11-12T21:00:00Z",
      football: { lamHome, lamAway, rho, maxGoals },
    });

    expect(outlook.schemaVersion).toBe(OUTLOOK_SCHEMA_VERSION);
    const expectedOrder: readonly FootballOutlookMarketKey[] = [
      "1x2",
      "double_chance",
      "totals_1_5",
      "totals_2_5",
      "totals_3_5",
      "btts",
      "dnb",
      "ah_-1_0",
      "ah_-0_5",
      "ah_0_5",
      "ah_1_0",
    ];
    expect(outlook.markets.map((m) => m.marketKey)).toEqual(expectedOrder);

    for (const m of outlook.markets) {
      expect(m.market).toBeNull();
      const sumP = m.selections.reduce((acc, s) => acc + s.p, 0);
      if (m.marketKey === "double_chance") {
        expect(m.isOverlappingMarket).toBe(true);
        expect(m.expectedProbabilitySum).toBe(2);
        expect(Math.abs(sumP - 2)).toBeLessThan(1e-12);
      } else {
        expect(m.isOverlappingMarket).toBe(false);
        expect(m.expectedProbabilitySum).toBe(1);
        expect(Math.abs(sumP - 1)).toBeLessThan(1e-12);
      }

      const rankOne = m.selections.filter((s) => s.isMostLikely);
      expect(rankOne).toHaveLength(1);
      expect(rankOne[0]!.rank).toBe(1);
      expect(m.headline.selection).toBe(rankOne[0]!.selection);
      expect(m.headline.p).toBe(rankOne[0]!.p);
      expect(m.headline.fairOdds).toEqual(rankOne[0]!.fairOdds);
    }

    // 1X2 coherente con matriz DC y DNB condicional = pH / (pH + pA)
    let pHMat = 0;
    let pDMat = 0;
    let pAMat = 0;
    for (let h = 0; h <= maxGoals; h += 1) {
      for (let a = 0; a <= maxGoals; a += 1) {
        const cell = matrix[h]![a]!;
        if (h > a) pHMat += cell;
        else if (h === a) pDMat += cell;
        else pAMat += cell;
      }
    }
    const matTot = pHMat + pDMat + pAMat;
    pHMat /= matTot;
    pDMat /= matTot;
    pAMat /= matTot;

    const m1x2 = outlook.marketsByKey["1x2"]!;
    const pH = m1x2.selections.find((s) => s.selection === "home")!.p;
    const pD = m1x2.selections.find((s) => s.selection === "draw")!.p;
    const pA = m1x2.selections.find((s) => s.selection === "away")!.p;

    expect(Math.abs(pH - pHMat)).toBeLessThan(1e-15);
    expect(Math.abs(pD - pDMat)).toBeLessThan(1e-15);
    expect(Math.abs(pA - pAMat)).toBeLessThan(1e-15);

    const mDc = outlook.marketsByKey.double_chance!;
    const p1X = mDc.selections.find((s) => s.selection === "1X")!.p;
    const p12 = mDc.selections.find((s) => s.selection === "12")!.p;
    const pX2 = mDc.selections.find((s) => s.selection === "X2")!.p;
    expect(Math.abs(p1X + pA - 1)).toBeLessThan(1e-12);
    expect(Math.abs(p12 + pD - 1)).toBeLessThan(1e-12);
    expect(Math.abs(pX2 + pH - 1)).toBeLessThan(1e-12);

    const mDnb = outlook.marketsByKey.dnb!;
    const dnbHome = mDnb.selections.find((s) => s.selection === "home")!.p;
    const dnbAway = mDnb.selections.find((s) => s.selection === "away")!.p;
    expect(Math.abs(dnbHome - pH / (pH + pA))).toBeLessThan(1e-15);
    expect(Math.abs(dnbAway - pA / (pH + pA))).toBeLessThan(1e-15);
    expect(Math.abs(dnbHome - derived.dnb.home.p_effective_win)).toBeLessThan(1e-15);
    expect(Math.abs((mDnb.pPush ?? 0) - pD)).toBeLessThan(1e-15);

    // Coherencia AH ±0.5 con 1X2/doble oportunidad y pPush en AH ±1.0
    const ahMinusHalf = outlook.marketsByKey["ah_-0_5"]!;
    const ahPlusHalf = outlook.marketsByKey["ah_0_5"]!;
    expect(
      Math.abs(ahMinusHalf.selections.find((s) => s.selection === "home")!.p - pH),
    ).toBeLessThan(1e-15);
    expect(
      Math.abs(ahPlusHalf.selections.find((s) => s.selection === "home")!.p - p1X),
    ).toBeLessThan(1e-15);
    expect(ahMinusHalf.pPush).toBeUndefined();
    expect(ahPlusHalf.pPush).toBeUndefined();

    const ahMinusOne = outlook.marketsByKey["ah_-1_0"]!;
    const ahPlusOne = outlook.marketsByKey["ah_1_0"]!;
    expect(ahMinusOne.pPush).toBeCloseTo(
      derived.ah.paired_by_home_line["-1"]!.home.p_push,
      14,
    );
    expect(ahPlusOne.pPush).toBeCloseTo(
      derived.ah.paired_by_home_line["1"]!.home.p_push,
      14,
    );

    // Top 3 marcadores exactos ordenados por p descendente
    expect(outlook.topScorelines).toHaveLength(3);
    expect(outlook.topScorelines[0]!.isMostLikely).toBe(true);
    expect(outlook.topScorelines[0]!.rank).toBe(1);
    expect(outlook.topScorelines[0]!.p).toBeGreaterThanOrEqual(outlook.topScorelines[1]!.p);
    expect(outlook.topScorelines[1]!.p).toBeGreaterThanOrEqual(outlook.topScorelines[2]!.p);

    assertNoBettingOrStakeLeakage(outlook);
  });
});

describe("Prueba explícita 1 — Partido real de Liga MX (headline + cuota justa por mercado)", () => {
  const mexMatchKey = "MEX:20260906:atlas:atlante";
  const mexRow = footballSnapshots.rows[mexMatchKey]!;

  it("publica los 11 mercados de Liga MX con headline + cuota justa y market: null sin cuotas reales", () => {
    expect(mexRow).toBeDefined();
    expect(canonicalizeOutlookLeague("football", "liga-mx")).toBe("MEX");

    const outlook = buildMatchOutlook({
      matchId: mexMatchKey,
      sport: "football",
      league: "liga-mx",
      homeTeam: "Atlas FC",
      awayTeam: "CF Atlante",
      tsDecision: "2026-09-06T18:00:00Z",
      kickoffUtc: "2026-09-06T20:00:00Z",
      football: {
        footballRow: mexRow,
        footballModel: motorA,
      },
    });

    expect(outlook.canonicalLeague).toBe("MEX");
    expect(outlook.dixonColesParams?.rho).toBe(-0.05);
    expect(outlook.markets).toHaveLength(11);
    expect(outlook.topScorelines).toHaveLength(3);

    const headlineSummary = outlook.markets.map((m) => ({
      marketKey: m.marketKey,
      selection: m.headline.selection,
      label: m.headline.label,
      p: Number(m.headline.p.toFixed(4)),
      fairDecimal: m.headline.fairOdds.decimal,
      fairAmerican: m.headline.fairOdds.american,
      pSource: m.headline.pSource,
      market: m.market,
    }));

    console.info(
      "[v3.2 B1 Liga MX] Atlas FC vs CF Atlante headlines:",
      JSON.stringify({
        markets: headlineSummary,
        topScorelines: outlook.topScorelines.map((s) => ({
          score: s.score,
          p: Number(s.p.toFixed(4)),
          fairOdds: s.fairOdds,
        })),
      }),
    );

    expect(headlineSummary).toHaveLength(11);
    for (const item of headlineSummary) {
      expect(item.p).toBeGreaterThan(0.5 - 1e-6); // En 2-way siempre >= 0.5; en 1x2 Atlas > 0.5
      expect(item.fairDecimal).toBeGreaterThanOrEqual(1.01);
      expect(item.fairDecimal).toBeLessThanOrEqual(100);
      expect(item.pSource).toBe("model");
      expect(item.market).toBeNull();
    }

    // Con lamHome ≈ 1.779 vs lamAway ≈ 1.104, Atlas FC es favorito en 1X2 y DNB
    expect(outlook.marketsByKey["1x2"]!.headline.selection).toBe("home");
    expect(outlook.marketsByKey["1x2"]!.headline.fairOdds).toEqual(
      probabilityToFairOdds(outlook.marketsByKey["1x2"]!.headline.p),
    );
    expect(outlook.marketsByKey.dnb!.headline.selection).toBe("home");
    // En Atlas vs Atlante (pDraw > pAway), 1X = pHome + pDraw supera a 12 = pHome + pAway
    expect(outlook.marketsByKey.double_chance!.headline.selection).toBe("1X");

    assertNoBettingOrStakeLeakage(outlook);
  });

  it("consume cuotas reales frescas de Pinnacle en Liga MX (market_sharp_novig) e ignora recreativas como sharp", () => {
    const snapshots: OddsSnapshotRow[] = [
      {
        event_id: mexMatchKey,
        sport: "football",
        league: "MEX",
        market: "1x2",
        line: null,
        selection: "home",
        book: "pinnacle",
        price_decimal: 1.95,
        ts_captured: "2026-09-06T17:45:00Z",
        ts_event_start: "2026-09-06T20:00:00Z",
        source: "scraped_ws",
      },
      {
        event_id: mexMatchKey,
        sport: "football",
        league: "MEX",
        market: "1x2",
        line: null,
        selection: "draw",
        book: "pinnacle",
        price_decimal: 3.55,
        ts_captured: "2026-09-06T17:45:00Z",
        ts_event_start: "2026-09-06T20:00:00Z",
        source: "scraped_ws",
      },
      {
        event_id: mexMatchKey,
        sport: "football",
        league: "MEX",
        market: "1x2",
        line: null,
        selection: "away",
        book: "pinnacle",
        price_decimal: 4.10,
        ts_captured: "2026-09-06T17:45:00Z",
        ts_event_start: "2026-09-06T20:00:00Z",
        source: "scraped_ws",
      },
      // Casa recreativa en BTTS: aporta contexto de mercado pero JAMÁS activa sharp
      {
        event_id: mexMatchKey,
        sport: "football",
        league: "MEX",
        market: "btts",
        line: null,
        selection: "yes",
        book: "caliente",
        price_decimal: 1.72,
        ts_captured: "2026-09-06T17:50:00Z",
        ts_event_start: "2026-09-06T20:00:00Z",
        source: "scraped_ws",
      },
      {
        event_id: mexMatchKey,
        sport: "football",
        league: "MEX",
        market: "btts",
        line: null,
        selection: "no",
        book: "caliente",
        price_decimal: 2.02,
        ts_captured: "2026-09-06T17:50:00Z",
        ts_event_start: "2026-09-06T20:00:00Z",
        source: "scraped_ws",
      },
    ];

    const outlook = buildMatchOutlook({
      matchId: mexMatchKey,
      sport: "football",
      league: "MEX",
      homeTeam: "Atlas FC",
      awayTeam: "CF Atlante",
      tsDecision: "2026-09-06T18:00:00Z",
      kickoffUtc: "2026-09-06T20:00:00Z",
      football: { footballRow: mexRow, footballModel: motorA },
      oddsSnapshots: snapshots,
    });

    const m1x2 = outlook.marketsByKey["1x2"]!;
    expect(m1x2.headline.pSource).toBe("market_sharp_novig");
    expect(m1x2.market?.book).toBe("pinnacle");
    expect(m1x2.market?.tsCaptured).toBe("2026-09-06T17:45:00Z");
    expect(m1x2.selections[0]!.dataQuality.sharpMarketAvailable).toBe(true);

    // Doble oportunidad mantiene coherencia aditiva con 1X2 pero sin inventar cuota de casa
    const mDc = outlook.marketsByKey.double_chance!;
    expect(mDc.headline.pSource).toBe("market_sharp_novig");
    expect(mDc.market).toBeNull();
    const pHomeSharp = m1x2.selections.find((s) => s.selection === "home")!.p;
    const pDrawSharp = m1x2.selections.find((s) => s.selection === "draw")!.p;
    const pAwaySharp = m1x2.selections.find((s) => s.selection === "away")!.p;
    expect(
      Math.abs(mDc.selections.find((s) => s.selection === "1X")!.p - (pHomeSharp + pDrawSharp)),
    ).toBeLessThan(1e-15);
    expect(
      Math.abs(mDc.selections.find((s) => s.selection === "1X")!.p + pAwaySharp - 1),
    ).toBeLessThan(1e-15);

    // BTTS solo tiene casa recreativa -> pSource sigue siendo "model"
    const mBtts = outlook.marketsByKey.btts!;
    expect(mBtts.headline.pSource).toBe("model");
    expect(mBtts.selections[0]!.dataQuality.sharpMarketAvailable).toBe(false);
    expect(mBtts.market?.book).toBe("caliente");

    // Totales sin cuota real -> market: null
    expect(outlook.marketsByKey.totals_2_5!.market).toBeNull();
    assertNoBettingOrStakeLeakage(outlook);
  });
});

describe("Prueba explícita 2 — Partido real de NFL (moneyline, spread y total con headline + cuota justa)", () => {
  const nflMatchKey = "2025_14_DAL_DET";
  const nflRow = nflSnapshots.rows[nflMatchKey]!;

  it("publica moneyline, spread y totals en NFL con línea de mercado real y cuotas justas exactas", () => {
    expect(nflRow).toBeDefined();

    const outlook: MatchOutlook = buildMatchOutlook({
      matchId: nflMatchKey,
      sport: "nfl",
      league: "nfl",
      homeTeam: "Detroit Lions",
      awayTeam: "Dallas Cowboys",
      tsDecision: "2025-12-04T23:30:00Z",
      kickoffUtc: "2025-12-05T01:15:00Z",
      nfl: {
        nflRow,
        nflModel,
        liveContext: {
          homeTeam: "DET",
          awayTeam: "DAL",
          homeOffEpaPerPlay: 0.14,
          homeDefEpaPerPlay: -0.05,
          awayOffEpaPerPlay: 0.02,
          awayDefEpaPerPlay: 0.06,
          isDome: true,
        },
      },
      marketQuotes: [
        {
          market: "moneyline",
          book: "pinnacle",
          tsCaptured: "2025-12-04T23:15:00Z",
          oddsBySelection: { home: 1.56, away: 2.55 },
        },
        {
          market: "spread",
          line: -3.5,
          book: "pinnacle",
          tsCaptured: "2025-12-04T23:15:00Z",
          oddsBySelection: { home: 1.96, away: 1.94 },
        },
        {
          market: "totals",
          line: 48.5,
          book: "pinnacle",
          tsCaptured: "2025-12-04T23:15:00Z",
          oddsBySelection: { over: 1.91, under: 1.99 },
        },
      ],
    });

    expect(outlook.sport).toBe("nfl");
    expect(outlook.canonicalLeague).toBe("NFL");
    expect(outlook.topScorelines).toEqual([]);
    expect(outlook.dixonColesParams).toBeNull();
    expect(outlook.markets.map((m) => m.marketKey)).toEqual(["moneyline", "spread", "totals"]);

    for (const m of outlook.markets) {
      const sumP = m.selections.reduce((acc, s) => acc + s.p, 0);
      expect(Math.abs(sumP - 1)).toBeLessThan(1e-12);
      expect(m.headline.pSource).toBe("market_sharp_novig");
      expect(m.market?.book).toBe("pinnacle");
      expect(m.headline.fairOdds).toEqual(probabilityToFairOdds(m.headline.p));
    }

    const nflHeadlineSummary = outlook.markets.map((m) => ({
      marketKey: m.marketKey,
      line: m.line,
      selection: m.headline.selection,
      label: m.headline.label,
      p: Number(m.headline.p.toFixed(4)),
      fairOdds: m.headline.fairOdds,
      pSource: m.headline.pSource,
    }));
    console.info(
      "[v3.2 B1 NFL] Detroit Lions vs Dallas Cowboys headlines:",
      JSON.stringify(nflHeadlineSummary),
    );

    expect(outlook.marketsByKey.moneyline!.headline.selection).toBe("home");
    expect(outlook.marketsByKey.spread!.line).toBe(-3.5);
    expect(outlook.marketsByKey.spread!.headline.selection).toBe("away"); // 1.94 vs 1.96
    expect(outlook.marketsByKey.totals!.line).toBe(48.5);
    expect(outlook.marketsByKey.totals!.headline.selection).toBe("over"); // 1.91 vs 1.99

    assertNoBettingOrStakeLeakage(outlook);
  });

  it("marca low_coverage con 4/29 features NFL en vivo, expone pPush en líneas enteras y deja market: null sin cuotas", () => {
    const sparseFeatures = nflRow.features.map((v, idx) => (idx < 4 ? v : null));
    const outlook = buildMatchOutlook({
      matchId: "nfl_buffalo_bills_vs_minnesota_vikings",
      sport: "nfl",
      league: "NFL",
      homeTeam: "Buffalo Bills",
      awayTeam: "Minnesota Vikings",
      tsDecision: "2026-11-12T18:00:00Z",
      nfl: {
        nflRow: { ...nflRow, features: sparseFeatures },
        nflModel,
        spreadLine: -3.0,
        totalLine: 45.0,
      },
    });

    expect(outlook.dataQuality.coverageRatio).toBeCloseTo(4 / 29, 12);
    expect(outlook.dataQuality.flag).toBe("low_coverage");
    expect(outlook.dataQuality.sharpMarketAvailable).toBe(false);

    expect(outlook.markets.map((m) => m.marketKey)).toEqual(["moneyline", "spread", "totals"]);
    for (const m of outlook.markets) {
      expect(m.market).toBeNull();
      expect(m.headline.pSource).toBe("model");
      const sumP = m.selections.reduce((acc, s) => acc + s.p, 0);
      expect(Math.abs(sumP - 1)).toBeLessThan(1e-12);
    }

    expect(outlook.marketsByKey.spread!.pPush).toBeGreaterThan(0);
    expect(outlook.marketsByKey.totals!.pPush).toBeGreaterThan(0);

    // Sin spreadLine ni totalLine ni cuotas -> solo se publica moneyline (cero líneas inventadas)
    const mlOnly = buildMatchOutlook({
      matchId: "nfl_ml_only",
      sport: "nfl",
      league: "NFL",
      homeTeam: "Buffalo Bills",
      awayTeam: "Minnesota Vikings",
      tsDecision: "2026-11-12T18:00:00Z",
      nfl: { nflRow, nflModel },
    });
    expect(mlOnly.markets.map((m) => m.marketKey)).toEqual(["moneyline"]);
    expect(mlOnly.markets[0]!.market).toBeNull();
    assertNoBettingOrStakeLeakage(outlook);
  });
});

describe("Jerarquía de pSource, frescura causal y calibración (outlook_calibration_v3_2.json)", () => {
  it("activa blend_v3_1 en segmento habilitado (G1::1x2) y descarta cuotas caducadas o futuras", () => {
    const lamHome = 1.55;
    const lamAway = 1.15;
    const rho = -0.06;
    const derived = deriveAll2WayMarkets(lamHome, lamAway, rho, 12);
    const model1x2 = [
      derived.dnb.home.p_full_win,
      derived.dnb.p_push,
      derived.dnb.away.p_full_win,
    ];
    const pinnacleOdds: readonly [number, number, number] = [2.15, 3.30, 3.65];

    const expectedBlend = computeSegmentBlendedProbs({
      artifact: blendArtifact,
      league: "G1",
      market: "1x2",
      modelProbs: model1x2,
      marketRawOdds: pinnacleOdds,
    });

    const freshOutlook = buildMatchOutlook({
      matchId: "g1-blend-check",
      sport: "football",
      league: "G1",
      homeTeam: "Olympiacos",
      awayTeam: "PAOK",
      tsDecision: "2026-11-12T18:00:00Z",
      kickoffUtc: "2026-11-12T19:00:00Z",
      football: { lamHome, lamAway, rho },
      marketQuotes: [
        {
          market: "1x2",
          book: "pinnacle",
          tsCaptured: "2026-11-12T17:30:00Z",
          oddsBySelection: { home: 2.15, draw: 3.30, away: 3.65 },
        },
      ],
    });

    const m1x2 = freshOutlook.marketsByKey["1x2"]!;
    expect(m1x2.headline.pSource).toBe("blend_v3_1");
    expect(Math.abs(m1x2.selections[0]!.p - expectedBlend.p_final[0]!)).toBeLessThan(1e-12);
    expect(Math.abs(m1x2.selections[1]!.p - expectedBlend.p_final[1]!)).toBeLessThan(1e-12);
    expect(Math.abs(m1x2.selections[2]!.p - expectedBlend.p_final[2]!)).toBeLessThan(1e-12);

    // Cuota caducada (> 180 min) y cuota futura (> tsDecision) deben descartarse -> market: null
    const staleAndFutureOutlook = buildMatchOutlook({
      matchId: "g1-stale-future-check",
      sport: "football",
      league: "G1",
      homeTeam: "Olympiacos",
      awayTeam: "PAOK",
      tsDecision: "2026-11-12T18:00:00Z",
      kickoffUtc: "2026-11-12T19:00:00Z",
      football: { lamHome, lamAway, rho },
      marketQuotes: [
        {
          market: "1x2",
          book: "pinnacle",
          tsCaptured: "2026-11-12T14:55:00Z", // 185 min antes (> 180)
          oddsBySelection: { home: 2.15, draw: 3.30, away: 3.65 },
        },
        {
          market: "btts",
          book: "pinnacle",
          tsCaptured: "2026-11-12T18:05:00Z", // futura respecto a tsDecision
          oddsBySelection: { yes: 1.85, no: 2.02 },
        },
      ],
    });

    expect(staleAndFutureOutlook.marketsByKey["1x2"]!.market).toBeNull();
    expect(staleAndFutureOutlook.marketsByKey["1x2"]!.headline.pSource).toBe("model");
    expect(staleAndFutureOutlook.marketsByKey.btts!.market).toBeNull();
    expect(staleAndFutureOutlook.marketsByKey.btts!.headline.pSource).toBe("model");
  });

  it("usa fallback base_rate cuando faltan features del modelo y resuelve calibrationBucket con y sin artefacto", () => {
    const baseRateFootball = buildMatchOutlook({
      matchId: "fb-missing-features",
      sport: "football",
      league: "MEX",
      homeTeam: "Pumas UNAM",
      awayTeam: "Club León",
      tsDecision: "2026-11-12T18:00:00Z",
      football: null,
    });
    expect(baseRateFootball.dataQuality.flag).toBe("fallback_base_rate");
    expect(baseRateFootball.dataQuality.coverageRatio).toBe(0);
    expect(baseRateFootball.marketsByKey["1x2"]!.headline.pSource).toBe("base_rate");
    expect(baseRateFootball.topScorelines[0]!.pSource).toBe("base_rate");

    const customCal: OutlookCalibrationArtifact = {
      ...FALLBACK_OUTLOOK_CALIBRATION_ARTIFACT,
      segments: {
        "NFL::moneyline": {
          sport: "nfl",
          league: "NFL",
          market: "moneyline",
          selected_source_when_sharp_present: "market_sharp_novig",
          benchmark_note: "nflverse_consensus_sin_cierre_sharp",
          n: 1088,
          ece: 0.019,
          reliability_bins: [
            {
              bin_index: 5,
              p_min: 0.5,
              p_max: 0.6,
              n: 210,
              mean_pred: 0.548,
              empirical_freq: 0.552,
            },
          ],
        },
      },
    };

    const bucketHit = resolveCalibrationBucket(0.55, "nfl", "NFL", "moneyline", customCal);
    expect(bucketHit.segmentKey).toBe("NFL::moneyline");
    expect(bucketHit.binIndex).toBe(5);
    expect(bucketHit.empiricalFreq).toBe(0.552);
    expect(bucketHit.eceSegment).toBe(0.019);
    expect(bucketHit.benchmarkNote).toBe("nflverse_consensus_sin_cierre_sharp");

    const bucketFallback = resolveCalibrationBucket(
      0.63,
      "football",
      "UNSEEN",
      "dnb",
      FALLBACK_OUTLOOK_CALIBRATION_ARTIFACT,
    );
    expect(bucketFallback.segmentKey).toBe("THEORETICAL_FALLBACK");
    expect(bucketFallback.binIndex).toBe(6);
    expect(bucketFallback.pMin).toBe(0.6);
    expect(bucketFallback.pMax).toBe(0.7);
    expect(bucketFallback.n).toBe(0);
    expect(bucketFallback.empiricalFreq).toBeNull();
    expect(getDefaultOutlookCalibrationArtifact().holdout_sealed_untouched).toBe(true);
  });

  it("consume por defecto el artefacto real outlook_calibration_v3_2.json generado por B4 (98 segmentos)", () => {
    const defaultCal = getDefaultOutlookCalibrationArtifact();
    expect(defaultCal.schema_version).toBe("outlook_calibration_v3.2.0");
    expect(defaultCal.eval_split).toBe("walk_forward_dev");
    expect(defaultCal.holdout_sealed_untouched).toBe(true);
    expect(Object.keys(defaultCal.segments).length).toBeGreaterThanOrEqual(98);

    const mexOutlook = buildMatchOutlook({
      matchId: "mex-cal-integration",
      sport: "football",
      league: "MEX",
      homeTeam: "Club América",
      awayTeam: "CD Cruz Azul",
      tsDecision: "2026-11-12T18:00:00Z",
      football: { lamHome: 1.62, lamAway: 1.18 },
    });
    expect(mexOutlook.marketsByKey["1x2"]!.selections[0]!.calibrationBucket.segmentKey).toBe(
      "MEX::1x2",
    );
    expect(mexOutlook.marketsByKey["1x2"]!.selections[0]!.calibrationBucket.n).toBeGreaterThan(0);
    expect(
      mexOutlook.marketsByKey["1x2"]!.selections[0]!.calibrationBucket.empiricalFreq,
    ).not.toBeNull();
    expect(mexOutlook.marketsByKey.totals_2_5!.selections[0]!.calibrationBucket.segmentKey).toBe(
      "MEX::totals",
    );
    expect(mexOutlook.marketsByKey.btts!.selections[0]!.calibrationBucket.segmentKey).toBe(
      "MEX::btts",
    );
    expect(mexOutlook.marketsByKey["ah_-0_5"]!.selections[0]!.calibrationBucket.segmentKey).toBe(
      "MEX::ah",
    );

    const nflOutlook = buildMatchOutlook({
      matchId: "nfl-cal-integration",
      sport: "nfl",
      league: "NFL",
      homeTeam: "Kansas City Chiefs",
      awayTeam: "Baltimore Ravens",
      tsDecision: "2026-11-12T18:00:00Z",
      nfl: { pHome: 0.58, pAway: 0.42 },
    });
    const nflBucket = nflOutlook.marketsByKey.moneyline!.selections[0]!.calibrationBucket;
    expect(nflBucket.segmentKey).toBe("NFL::moneyline");
    expect(nflBucket.n).toBeGreaterThan(0);
    expect(nflBucket.benchmarkNote).toContain("sin cierre sharp");
  });
});
