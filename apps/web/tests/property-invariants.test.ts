import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import { evaluatePlayerLinkedSgpV5 } from "@pitchlab/spacetime/v5";
import { redactDatasetForVisitor } from "@pitchlab/ui/access-guard";
import {
  buildSmartAutoParlay,
  computeParlaySummary,
  isParlayPickOutlier,
  parlayMarketDiversityKey,
} from "@pitchlab/ui/parlay";
import { buildPlatformDataset } from "@pitchlab/ui/picks-engine";
import {
  bivariateNormalJointProb,
  buildMatchPicksCatalog,
  catalogPickItemToMatchPick,
  computeAdaptiveDeVig,
  computePickPricing,
  computePowerDeVig,
  computeProportionalDeVig,
  computeShinDeVig,
  evaluateBetBuilder,
  gradeCatalogPick,
  MARKET_FAMILY_IDS,
  scoreRecommendedCatalogPick,
  type BetBuilderLegInput,
  type CatalogPickItem,
  type MarketFamilyId,
  type PickSettlementStatus,
} from "@pitchlab/ui/picks-catalog";
import type {
  MatchPick,
  PlatformDataset,
  PlatformGame,
  PlatformMarketRow,
} from "@pitchlab/ui/types";
import {
  isCleanPublicCanonicalPath,
  sanitizeCanonicalPublicUrl,
} from "../src/server/json-ld";
import {
  buildServerMatchPicksCatalog,
  redactCatalogPickForVisitor,
} from "../src/server/picks-catalog";
import { evaluateSgpCopulaV5 } from "../src/server/spacetime-v5";

const NUM_RUNS = 150;
const FIXED_NOW_ISO = "2026-11-21T15:00:00Z";
const SITE_ORIGIN = "https://pitchlab.mx";
const VALID_SETTLEMENTS = new Set<PickSettlementStatus>(["hit", "miss", "push", "pending"]);

const ASCII_LOWER = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const ASCII_ALPHA = "abcdefghijklmnopqrstuvwxyz".split("");

const arbCleanSlug = fc
  .tuple(
    fc.constantFrom(...ASCII_ALPHA),
    fc.array(fc.constantFrom(...ASCII_LOWER), { minLength: 2, maxLength: 10 }),
  )
  .map(([first, rest]) => `${first}${rest.join("")}`);

const arbUpperToken = fc
  .array(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")), {
    minLength: 6,
    maxLength: 10,
  })
  .map((chars) => chars.join(""));

function makeBaseGame(overrides: Partial<PlatformGame> = {}): PlatformGame {
  return {
    id: "prop-game-1",
    league: asLeagueId("premier-league"),
    leagueLabel: "Premier League",
    sport: "football",
    round: "Jornada 12",
    dayId: "2026-11-21",
    dayLabel: "sábado, 21 de noviembre",
    kickoffUtc: "2026-11-21T20:00:00Z",
    kickoffLocal: "14:00",
    venue: "Anfield",
    referee: "Michael Oliver",
    status: "NS",
    home: {
      slug: "liverpool",
      name: "Liverpool",
      shortName: "Liverpool",
      code: "LIV",
      record: "9G-2E-1P",
    },
    away: {
      slug: "arsenal",
      name: "Arsenal",
      shortName: "Arsenal",
      code: "ARS",
      record: "8G-3E-1P",
    },
    hasForecast: true,
    x12: [0.52, 0.25, 0.23],
    projection: { home: 1.72, away: 1.08, total: 2.8 },
    goalLine: { line: 2.5, pOver: 0.56 },
    confidenceScore: 76,
    confidenceLevel: "alta",
    picks: [],
    preGame: {
      cortexSynthesis: "",
      tacticalKeys: [],
      lineupStatusLabel: "Pendiente",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "2026-11-21",
    spacetime: null,
    ...overrides,
  };
}

function makeSampleMarkets(homeDec: number, drawDec: number, awayDec: number, bookLabel: string): PlatformMarketRow[] {
  return [
    {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "home",
      label: "Gana Liverpool",
      p: 0.52,
      fairDecimal: 1.92,
      fairAmerican: -109,
      openDecimal: homeDec,
      currentDecimal: homeDec,
      quoteBookLabel: bookLabel,
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      bookQuotes: [
        {
          book: bookLabel.toLowerCase(),
          bookLabel,
          decimal: homeDec,
          capturedAtUtc: FIXED_NOW_ISO,
          isBest: true,
        },
      ],
      edgePts: 4.5,
    },
    {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "draw",
      label: "Empate",
      p: 0.25,
      fairDecimal: 4.0,
      fairAmerican: 300,
      openDecimal: drawDec,
      currentDecimal: drawDec,
      quoteBookLabel: bookLabel,
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: -2.1,
    },
    {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "away",
      label: "Gana Arsenal",
      p: 0.23,
      fairDecimal: 4.35,
      fairAmerican: 335,
      openDecimal: awayDec,
      currentDecimal: awayDec,
      quoteBookLabel: bookLabel,
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: -3.2,
    },
  ];
}

function makePromoPick(game: PlatformGame, isPromo: boolean, secretLabel: string, marketDec: number): MatchPick {
  return {
    id: `${game.id}__${isPromo ? "promo" : "locked"}`,
    gameId: game.id,
    league: game.league,
    leagueLabel: game.leagueLabel,
    matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
    kickoffLocal: game.kickoffLocal,
    gameStatus: game.status,
    slotIndex: isPromo ? 0 : 1,
    category: "principal",
    categoryLabel: "Pick principal",
    risk: "medio",
    engineKey: "singularity",
    engineName: "PitchLab Spacetime v5.1",
    marketGroup: "Resultado 1X2",
    market: "1x2",
    selectionKey: "home",
    line: null,
    conflictGroup: "home_side",
    label: secretLabel,
    rationale: "Señal cuantitativa",
    p: 0.56,
    fairDecimal: 1.79,
    fairAmerican: -127,
    marketDecimal: marketDec,
    marketAmerican: 110,
    marketBookLabel: "CasaSecreta",
    marketCapturedAtUtc: FIXED_NOW_ISO,
    edgePts: 8.4,
    confidenceScore: 76,
    suggestedUnits: 1.0,
    isDailyOpenPromo: isPromo,
    isRedacted: false,
  };
}

describe("Property-Based Testing · Invariantes cuantitativas y de seguridad", () => {
  describe("De-Vig proporcional, Shin y adaptativo", () => {
    it("nunca produce NaN/Infinity y conserva probabilidades en (0, 1) con suma ≈ 1.0 para cuotas arbitrarias 1.02..50.0", () => {
      const arbOdd = fc.double({ min: 1.02, max: 50.0, noNaN: true, noDefaultInfinity: true });
      const arbDecimals = fc.oneof(fc.tuple(arbOdd, arbOdd), fc.tuple(arbOdd, arbOdd, arbOdd));

      fc.assert(
        fc.property(arbDecimals, (decimals) => {
          const results = [
            computeProportionalDeVig(decimals),
            computeShinDeVig(decimals),
            computePowerDeVig(decimals),
            computeAdaptiveDeVig(decimals, "auto"),
            computeAdaptiveDeVig(decimals, "proportional"),
            computeAdaptiveDeVig(decimals, "shin"),
            computeAdaptiveDeVig(decimals, "power"),
          ];

          for (const res of results) {
            if (res === null) continue;
            expect(res.probs.length).toBe(decimals.length);
            expect(Number.isFinite(res.overroundPct)).toBe(true);
            let sum = 0;
            for (const p of res.probs) {
              expect(Number.isFinite(p)).toBe(true);
              expect(p).toBeGreaterThan(0);
              expect(p).toBeLessThan(1);
              sum += p;
            }
            expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
            if (res.shinZ !== undefined) {
              expect(Number.isFinite(res.shinZ)).toBe(true);
              expect(res.shinZ).toBeGreaterThanOrEqual(0);
              expect(res.shinZ).toBeLessThan(1);
            }
          }
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("produce probabilidades válidas y monótonas en mercados de 2 vías con overround realista", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.18, max: 0.82, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 0.18, noNaN: true, noDefaultInfinity: true }),
          (trueP, margin) => {
            const d1 = 1 / (trueP * (1 + margin));
            const d2 = 1 / ((1 - trueP) * (1 + margin));
            const pair = [d1, d2] as const;

            const prop = computeProportionalDeVig(pair);
            const shin = computeShinDeVig(pair);
            const power = computePowerDeVig(pair);
            const adaptive = computeAdaptiveDeVig(pair, "auto");

            expect(prop).not.toBeNull();
            expect(shin).not.toBeNull();
            expect(power).not.toBeNull();
            expect(adaptive).not.toBeNull();

            for (const res of [prop!, shin!, power!, adaptive!]) {
              expect(res.probs).toHaveLength(2);
              const [p0, p1] = res.probs;
              expect(Number.isFinite(p0)).toBe(true);
              expect(Number.isFinite(p1)).toBe(true);
              expect(p0!).toBeGreaterThan(0);
              expect(p0!).toBeLessThan(1);
              expect(p1!).toBeGreaterThan(0);
              expect(p1!).toBeLessThan(1);
              expect(Math.abs(p0! + p1! - 1.0)).toBeLessThanOrEqual(0.001);
              if (d1 < d2) expect(p0!).toBeGreaterThanOrEqual(p1!);
              if (d2 < d1) expect(p1!).toBeGreaterThanOrEqual(p0!);
            }

            if (margin >= 0.04) expect(adaptive!.method).toBe("shin");
            if (margin <= 0.03) expect(adaptive!.method).toBe("proportional");

            const pricing = computePickPricing({
              calibratedProb: trueP,
              marketDecimal: d1,
              companionMarketDecimals: pair,
              companionIndex: 0,
              marketBookLabel: "Pinnacle",
              marketCapturedAtUtc: "2026-11-21T16:00:00Z",
              nowIso: "2026-11-21T18:00:00Z",
            });
            expect(Number.isFinite(pricing.fairOdds)).toBe(true);
            expect(pricing.fairOdds).toBeGreaterThanOrEqual(1.01);
            expect(pricing.deVigMarketProb).not.toBeNull();
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("produce probabilidades válidas y suma ≈ 1.0 en mercados de 3 vías con overround realista", () => {
      const arbWeight = fc.double({ min: 0.15, max: 1.0, noNaN: true, noDefaultInfinity: true });

      fc.assert(
        fc.property(
          arbWeight,
          arbWeight,
          arbWeight,
          fc.double({ min: 0.01, max: 0.2, noNaN: true, noDefaultInfinity: true }),
          (w1, w2, w3, margin) => {
            const totalW = w1 + w2 + w3;
            const trio = [
              1 / ((w1 / totalW) * (1 + margin)),
              1 / ((w2 / totalW) * (1 + margin)),
              1 / ((w3 / totalW) * (1 + margin)),
            ] as const;

            for (const res of [
              computeProportionalDeVig(trio),
              computeShinDeVig(trio),
              computePowerDeVig(trio),
              computeAdaptiveDeVig(trio, "auto"),
            ]) {
              expect(res).not.toBeNull();
              expect(res!.probs).toHaveLength(3);
              const sum = res!.probs.reduce((acc, p) => acc + p, 0);
              for (const p of res!.probs) {
                expect(Number.isFinite(p)).toBe(true);
                expect(p).toBeGreaterThan(0);
                expect(p).toBeLessThan(1);
              }
              expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("Bet Builder y Cópula SGP · Cotas de Fréchet-Hoeffding", () => {
    it("bivariateNormalJointProb respeta cotas de Fréchet-Hoeffding y signo de correlación sin NaN/Infinity", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: -0.92, max: 0.92, noNaN: true, noDefaultInfinity: true }),
          (pA, pB, rho) => {
            const joint = bivariateNormalJointProb(pA, pB, rho);
            const frechetLo = Math.max(0, pA + pB - 1);
            const frechetHi = Math.min(pA, pB);

            expect(Number.isFinite(joint)).toBe(true);
            expect(joint).toBeGreaterThanOrEqual(frechetLo - 1e-12);
            expect(joint).toBeLessThanOrEqual(frechetHi + 1e-12);
            if (rho > 0.05) {
              expect(joint).toBeGreaterThanOrEqual(pA * pB - 1e-9);
            }
            if (rho < -0.05) {
              expect(joint).toBeLessThanOrEqual(pA * pB + 1e-9);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("evaluateBetBuilder mantiene jointProbability acotada por Fréchet-Hoeffding para 2..5 piernas SGP", () => {
      const sgpAxisSpecs: ReadonlyArray<{
        readonly family: BetBuilderLegInput["family"];
        readonly axis: BetBuilderLegInput["axis"];
        readonly selectionKey: string;
        readonly label: string;
        readonly line: number | null;
        readonly direction: BetBuilderLegInput["direction"];
      }> = [
        { family: "1x2", axis: "result_ft", selectionKey: "home", label: "Gana Local", line: null, direction: "home" },
        { family: "totals", axis: "goals_total", selectionKey: "over_2.5", label: "Más de 2.5 goles", line: 2.5, direction: "over" },
        { family: "btts", axis: "btts", selectionKey: "yes", label: "Ambos anotan Sí", line: null, direction: "yes" },
        { family: "corners_total", axis: "corners_total", selectionKey: "over_9.5", label: "Más de 9.5 córners", line: 9.5, direction: "over" },
        { family: "cards_total", axis: "cards_total", selectionKey: "over_4.5", label: "Más de 4.5 tarjetas", line: 4.5, direction: "over" },
      ];

      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 5 }),
          fc.array(fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }), {
            minLength: 5,
            maxLength: 5,
          }),
          fc.option(fc.double({ min: 1.1, max: 50.0, noNaN: true, noDefaultInfinity: true }), { nil: null }),
          (legCount, probs, offeredBookDecimal) => {
            const legs: BetBuilderLegInput[] = sgpAxisSpecs.slice(0, legCount).map((spec, idx) => ({
              id: `sgp-leg-${idx}`,
              gameId: "sgp-game-1",
              sport: "football",
              gameStatus: "NS",
              family: spec.family,
              axis: spec.axis,
              selectionKey: spec.selectionKey,
              label: spec.label,
              line: spec.line,
              direction: spec.direction,
              p: probs[idx]!,
              marketDecimal: null,
              isRedacted: false,
            }));

            const evaluated = evaluateBetBuilder(legs, { offeredBookDecimal });
            const usedProbs = legs.map((l) => l.p);
            const frechetLo = Math.max(0, usedProbs.reduce((acc, p) => acc + p, 0) - (usedProbs.length - 1));
            const frechetHi = Math.min(...usedProbs);

            expect(Number.isFinite(evaluated.jointProbability)).toBe(true);
            expect(Number.isFinite(evaluated.independentProbability)).toBe(true);
            expect(Number.isFinite(evaluated.correlationMultiplier)).toBe(true);
            expect(Number.isFinite(evaluated.fairCombinedDecimal)).toBe(true);
            expect(evaluated.fairCombinedDecimal).toBeGreaterThanOrEqual(1.01);
            expect(evaluated.jointProbability).toBeGreaterThanOrEqual(frechetLo - 1e-4);
            expect(evaluated.jointProbability).toBeLessThanOrEqual(frechetHi + 1e-4);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("evaluateSgpCopulaV5 (Student-t QMC) respeta cotas de Fréchet-Hoeffding sin NaN/Infinity", () => {
      const soccerFactors = [
        "goal_diff",
        "total_goals",
        "total_corners",
        "total_yellow_cards",
        "total_shots_on_target",
      ] as const;

      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 4 }),
          fc.array(fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }), {
            minLength: 4,
            maxLength: 4,
          }),
          fc.array(fc.constantFrom<1 | -1>(1, -1), { minLength: 4, maxLength: 4 }),
          (legCount, probs, dirs) => {
            const legs = soccerFactors.slice(0, legCount).map((factor, idx) => ({
              legId: `v5-leg-${idx}`,
              factor,
              marginalProbability: probs[idx]!,
              direction: dirs[idx]!,
            }));

            const audit = evaluateSgpCopulaV5({
              sport: "soccer",
              legs,
              offeredCombinedDecimalOdds: null,
            });
            const usedProbs = legs.map((l) => l.marginalProbability);
            const frechetLo = Math.max(0, usedProbs.reduce((acc, p) => acc + p, 0) - (usedProbs.length - 1));
            const frechetHi = Math.min(...usedProbs);

            expect(Number.isFinite(audit.jointProbability)).toBe(true);
            expect(Number.isFinite(audit.independentProbability)).toBe(true);
            expect(Number.isFinite(audit.correlationMultiplier)).toBe(true);
            expect(Number.isFinite(audit.fairCombinedDecimal)).toBe(true);
            expect(audit.jointProbability).toBeGreaterThanOrEqual(frechetLo - 1e-4);
            expect(audit.jointProbability).toBeLessThanOrEqual(frechetHi + 1e-4);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("gradeCatalogPick · Liquidación determinista auditable en FT", () => {
    it("partidos FT siempre producen estado determinista válido y particionan 1X2, BTTS, DNB y totales sin ocultar resultados", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          fc.constantFrom(0.5, 1.5, 2.0, 2.5, 3.0, 3.5, 4.5),
          (homeGoals, awayGoals, totalLine) => {
            const ftGame = makeBaseGame({
              id: `ft-${homeGoals}-${awayGoals}`,
              status: "FT",
              score: { home: homeGoals, away: awayGoals },
            });

            const oneXTwo = (["home", "draw", "away"] as const).map((selectionKey) => {
              const first = gradeCatalogPick({
                game: ftGame,
                family: "1x2",
                selectionKey,
                line: null,
              });
              const second = gradeCatalogPick({
                game: ftGame,
                family: "1x2",
                selectionKey,
                line: null,
              });
              expect(first).toBe(second);
              expect(VALID_SETTLEMENTS.has(first)).toBe(true);
              return first;
            });

            expect(oneXTwo.filter((s) => s === "hit")).toHaveLength(1);
            expect(oneXTwo.filter((s) => s === "miss")).toHaveLength(2);

            const bttsYes = gradeCatalogPick({ game: ftGame, family: "btts", selectionKey: "yes", line: null });
            const bttsNo = gradeCatalogPick({ game: ftGame, family: "btts", selectionKey: "no", line: null });
            expect(VALID_SETTLEMENTS.has(bttsYes)).toBe(true);
            expect(VALID_SETTLEMENTS.has(bttsNo)).toBe(true);
            expect(new Set([bttsYes, bttsNo])).toEqual(new Set(["hit", "miss"]));

            const dnbHome = gradeCatalogPick({ game: ftGame, family: "dnb", selectionKey: "home", line: null });
            const dnbAway = gradeCatalogPick({ game: ftGame, family: "dnb", selectionKey: "away", line: null });
            if (homeGoals === awayGoals) {
              expect(dnbHome).toBe("push");
              expect(dnbAway).toBe("push");
            } else {
              expect(new Set([dnbHome, dnbAway])).toEqual(new Set(["hit", "miss"]));
            }

            const overRes = gradeCatalogPick({
              game: ftGame,
              family: "totals",
              selectionKey: "over",
              line: totalLine,
            });
            const underRes = gradeCatalogPick({
              game: ftGame,
              family: "totals",
              selectionKey: "under",
              line: totalLine,
            });
            expect(VALID_SETTLEMENTS.has(overRes)).toBe(true);
            expect(VALID_SETTLEMENTS.has(underRes)).toBe(true);
            if (homeGoals + awayGoals === totalLine) {
              expect(overRes).toBe("push");
              expect(underRes).toBe("push");
            } else {
              expect(new Set([overRes, underRes])).toEqual(new Set(["hit", "miss"]));
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("partidos NS y LIVE siempre liquidan como pending para cualquier familia", () => {
      fc.assert(
        fc.property(
          fc.constantFrom<"NS" | "LIVE">("NS", "LIVE"),
          fc.constantFrom<MarketFamilyId>(...MARKET_FAMILY_IDS),
          fc.integer({ min: 0, max: 6 }),
          fc.integer({ min: 0, max: 6 }),
          (status, family, homeGoals, awayGoals) => {
            const game = makeBaseGame({
              status,
              ...(status === "LIVE" ? { score: { home: homeGoals, away: awayGoals } } : {}),
            });
            const settlement = gradeCatalogPick({
              game,
              family,
              selectionKey: "home",
              line: 2.5,
            });
            expect(settlement).toBe("pending");
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("Cero-Fuga · redactCatalogPickForVisitor y buildServerMatchPicksCatalog", () => {
    it("redactCatalogPickForVisitor borra probabilidad, cuotas, EV, edge, jugador y evidencia en cualquier pick NS/LIVE", () => {
      fc.assert(
        fc.property(
          fc.constantFrom<"NS" | "LIVE">("NS", "LIVE"),
          fc.constantFrom<MarketFamilyId>(...MARKET_FAMILY_IDS),
          fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 1.15, max: 25.0, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: -25.0, max: 45.0, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: -20.0, max: 30.0, noNaN: true, noDefaultInfinity: true }),
          fc.integer({ min: 0, max: 15 }),
          arbUpperToken,
          (gameStatus, family, prob, marketDec, evPct, edgePts, slotIdx, secretToken) => {
            const secretLabel = `SECRETPICK_${secretToken}`;
            const secretSelection = `SECRETSEL_${secretToken}`;
            const secretBook = `SECRETBOOK_${secretToken}`;
            const secretPlayer = `SECRETPLAYER_${secretToken}`;
            const secretRef = `SECRETREF_${secretToken}`;

            const rawItem: CatalogPickItem = {
              id: `pick-${secretToken}`,
              gameId: "game-cero-fuga",
              league: asLeagueId("premier-league"),
              leagueLabel: "Premier League",
              sport: "football",
              matchLabel: "Liverpool vs Arsenal",
              kickoffUtc: FIXED_NOW_ISO,
              kickoffLocal: "14:00",
              gameStatus,
              family,
              familyLabel: "Mercado",
              category: "resultado",
              axis: "result_ft",
              selectionKey: secretSelection,
              label: secretLabel,
              line: 2.5,
              direction: "home",
              pricing: {
                p: Math.round(prob * 10_000) / 10_000,
                fairOdds: Math.round((1 / prob) * 100) / 100,
                fairAmerican: -120,
                marketDecimal: Math.round(marketDec * 100) / 100,
                marketAmerican: 115,
                marketBookLabel: secretBook,
                marketCapturedAtUtc: FIXED_NOW_ISO,
                deVigMarketProb: 0.48,
                deVigMethod: "shin",
                overroundPct: 4.8,
                evPct: Math.round(evPct * 10) / 10,
                edgePts: Math.round(edgePts * 10) / 10,
                noVigEdgePts: 3.2,
                valueLabel: "Valor +6.5 %",
                hasPositiveValue: true,
              },
              evidence: {
                windows: [
                  {
                    window: "L5",
                    label: "Últimos 5",
                    hits: 4,
                    sample: 5,
                    pushes: 0,
                    ratePct: 80,
                    meanValue: 2.4,
                    tone: "high",
                  },
                ],
                xgSignal: {
                  homeXg: 1.85,
                  awayXg: 0.92,
                  totalXg: 2.77,
                  marginXg: 0.93,
                  source: "spacetime_v5",
                  summary: `XG_${secretToken}`,
                },
                refereeSignal: {
                  name: secretRef,
                  matches: 22,
                  rawAvgYellow: 4.5,
                  shrunkYellowPerGame: 4.4,
                  cardsMultiplier: 1.09,
                  foulsMultiplier: 1.04,
                  rigorTier: "estricto",
                  summary: `REF_${secretToken}`,
                },
                bullets: [{ label: `BULLET_${secretToken}`, ratePct: 80, tone: "high" }],
                avgObservedRatePct: 80,
              },
              settlement: "pending",
              engineName: "PitchLab Spacetime v5.1",
              isPrimaryModelPick: true,
              isDerived: true,
              conflictGroup: "home_side",
              playerMeta: {
                playerName: secretPlayer,
                teamSide: "home",
                teamName: "Liverpool",
                position: "FWD",
                statKey: "shots",
                statLabel: "Remates",
                minMinutesGuard: 45,
                qualifyingMatches: 10,
                avgMinutes: 86,
                lineupStatus: "confirmed",
                projectionMean: 3.4,
                projectionSd: 1.1,
              },
              bookQuotes: [
                {
                  book: "secretbook",
                  bookLabel: secretBook,
                  decimal: Math.round(marketDec * 100) / 100,
                  capturedAtUtc: FIXED_NOW_ISO,
                },
              ],
              isDailyOpenPromo: true,
              isTipsterWeeklyOpen: true,
              isRedacted: false,
            };

            const redacted = redactCatalogPickForVisitor(rawItem, slotIdx);
            const serialized = JSON.stringify(redacted);

            expect(redacted.isRedacted).toBe(true);
            expect(redacted.isDailyOpenPromo).toBe(false);
            expect(redacted.isTipsterWeeklyOpen).toBe(false);
            expect(redacted.isPrimaryModelPick).toBe(false);
            expect(redacted.isDerived).toBe(false);
            expect(redacted.selectionKey).toBe("locked");
            expect(redacted.line).toBeNull();
            expect(redacted.playerMeta).toBeNull();
            expect(redacted.bookQuotes).toBeUndefined();
            expect(redacted.pricing.p).toBe(0);
            expect(redacted.pricing.fairOdds).toBe(0);
            expect(redacted.pricing.fairAmerican).toBe(0);
            expect(redacted.pricing.marketDecimal).toBeNull();
            expect(redacted.pricing.marketAmerican).toBeNull();
            expect(redacted.pricing.marketBookLabel).toBeNull();
            expect(redacted.pricing.deVigMarketProb).toBeNull();
            expect(redacted.pricing.evPct).toBeNull();
            expect(redacted.pricing.edgePts).toBeNull();
            expect(redacted.pricing.noVigEdgePts).toBeNull();
            expect(redacted.pricing.valueLabel).toBeNull();
            expect(redacted.pricing.hasPositiveValue).toBe(false);
            expect(redacted.evidence.windows).toEqual([]);
            expect(redacted.evidence.bullets).toEqual([]);
            expect(redacted.evidence.xgSignal).toBeNull();
            expect(redacted.evidence.refereeSignal).toBeNull();

            expect(serialized).not.toContain("fairDecimal");
            expect(serialized).not.toContain("modelProb");
            expect(serialized).toContain('"evPct":null');
            expect(serialized).toContain('"edgePts":null');
            expect(serialized).toContain('"marketDecimal":null');
            expect(serialized).toContain('"fairOdds":0');
            expect(serialized).not.toContain(secretLabel);
            expect(serialized).not.toContain(secretSelection);
            expect(serialized).not.toContain(secretBook);
            expect(serialized).not.toContain(secretPlayer);
            expect(serialized).not.toContain(secretRef);

            const adaptedRedacted = catalogPickItemToMatchPick(redacted, null, slotIdx);
            const adaptedSerialized = JSON.stringify(adaptedRedacted);
            expect(adaptedRedacted.isRedacted).toBe(true);
            expect(adaptedRedacted.p).toBe(0);
            expect(adaptedRedacted.fairDecimal).toBe(0);
            expect(adaptedRedacted.marketDecimal).toBeNull();
            expect(adaptedRedacted.edgePts).toBeNull();
            expect(adaptedRedacted.selectionKey).toBe("locked");
            expect(adaptedSerialized).not.toContain(secretLabel);
            expect(adaptedSerialized).not.toContain(secretSelection);
            expect(adaptedSerialized).not.toContain(secretBook);
            expect(adaptedSerialized).not.toContain(secretPlayer);
            expect(adaptedSerialized).not.toContain(secretRef);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("buildServerMatchPicksCatalog y redactDatasetForVisitor en NS/LIVE solo exponen promocionales explícitos para visitantes", () => {
      fc.assert(
        fc.property(
          fc.constantFrom<"NS" | "LIVE">("NS", "LIVE"),
          fc.boolean(),
          fc.double({ min: 1.4, max: 4.5, noNaN: true, noDefaultInfinity: true }),
          arbUpperToken,
          (status, includePromo, marketDec, token) => {
            const roundedDec = Math.round(marketDec * 100) / 100;
            const secretBook = `BOOK_${token}`;
            const lockedLabel = `LOCKED_${token}`;
            const promoLabel = `PROMO_${token}`;

            const base = makeBaseGame({
              id: `visitor-prop-${token}`,
              status,
              markets: makeSampleMarkets(roundedDec, 3.45, 3.8, secretBook),
            });
            const lockedPick = makePromoPick(base, false, lockedLabel, roundedDec);
            const promoPick = makePromoPick(base, true, promoLabel, roundedDec);
            const game: PlatformGame = {
              ...base,
              picks: includePromo ? [promoPick, lockedPick] : [lockedPick],
            };

            const catalog = buildServerMatchPicksCatalog(game, {
              fullAccess: false,
              markets: game.markets,
              nowIso: FIXED_NOW_ISO,
            });

            expect(catalog.isRedactedForVisitor).toBe(true);
            for (const item of catalog.picks) {
              const isExplicitPromo = Boolean(item.isDailyOpenPromo || item.isTipsterWeeklyOpen);
              if (!isExplicitPromo) {
                expect(item.isRedacted).toBe(true);
                expect(item.isPrimaryModelPick).toBe(false);
                expect(item.isDerived).toBe(false);
                expect(item.pricing.p).toBe(0);
                expect(item.pricing.fairOdds).toBe(0);
                expect(item.pricing.marketDecimal).toBeNull();
                expect(item.pricing.evPct).toBeNull();
                expect(item.pricing.edgePts).toBeNull();
                expect(item.bookQuotes).toBeUndefined();
                expect(JSON.stringify(item)).not.toContain(secretBook);
                expect(JSON.stringify(item)).not.toContain(lockedLabel);
              }
            }

            const dataset: PlatformDataset = {
              generatedAt: FIXED_NOW_ISO,
              leagues: [],
              games: [game],
              playerProps: [],
              dailyPromoPickId: includePromo ? promoPick.id : "",
              tipsterWeeklyPickId: "",
              tipsterWeeklySlug: "",
              isServerRedactedForVisitor: false,
            };
            const redactedDataset = redactDatasetForVisitor(dataset);
            const redactedGame = redactedDataset.games[0]!;
            if (!includePromo) {
              expect(redactedGame.x12).toEqual([0, 0, 0]);
              expect(redactedGame.projection).toEqual({ home: 0, away: 0, total: 0 });
              expect(redactedGame.goalLine).toBeNull();
              expect(redactedGame.spacetime).toBeNull();
            }
            for (const p of redactedGame.picks) {
              if (!p.isDailyOpenPromo && !p.isTipsterWeeklyOpen) {
                expect(p.isRedacted).toBe(true);
                expect(p.p).toBe(0);
                expect(p.fairDecimal).toBe(0);
                expect(p.marketDecimal).toBeNull();
                expect(p.edgePts).toBeNull();
              }
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("FD-16 · sanitizeCanonicalPublicUrl", () => {
    const providerTokens = [
      "bzzoiro",
      "sportmonks",
      "sofascore",
      "espn",
      "api-football",
      "api-sports",
      "flagcdn",
      "understat",
      "polymarket",
      "kalshi",
      "nflverse",
      "openfootball",
    ] as const;

    it("rechaza siempre dominios de proveedor, segmentos con marca de proveedor y query keys de proveedor", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...providerTokens),
          arbCleanSlug,
          arbCleanSlug,
          (provider, segA, segB) => {
            expect(
              sanitizeCanonicalPublicUrl(`https://${provider}.com/${segA}/${segB}`, SITE_ORIGIN),
            ).toBeNull();
            expect(
              sanitizeCanonicalPublicUrl(`https://api.${provider}.io/v2/${segA}`, SITE_ORIGIN),
            ).toBeNull();
            expect(
              sanitizeCanonicalPublicUrl(`/${segA}/${provider}-${segB}`, SITE_ORIGIN),
            ).toBeNull();
            expect(
              sanitizeCanonicalPublicUrl(`${SITE_ORIGIN}/${segA}/${segB}-${provider}`, SITE_ORIGIN),
            ).toBeNull();
            expect(
              sanitizeCanonicalPublicUrl(`${SITE_ORIGIN}/resultados?bzzoiro_id=42`, SITE_ORIGIN),
            ).toBeNull();
            expect(
              sanitizeCanonicalPublicUrl(`${SITE_ORIGIN}/resultados?sofascore_id=42`, SITE_ORIGIN),
            ).toBeNull();
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("rechaza siempre colas o segmentos numéricos de 5 o más dígitos típicos de IDs crudos de proveedor", () => {
      fc.assert(
        fc.property(
          arbCleanSlug,
          arbCleanSlug,
          fc.constantFrom("-", "_", "/"),
          fc.integer({ min: 10_000, max: 999_999_999 }),
          (section, slug, sep, rawId) => {
            const candidatePath = `/${section}/${slug}${sep}${rawId}`;
            expect(sanitizeCanonicalPublicUrl(candidatePath, SITE_ORIGIN)).toBeNull();
            expect(sanitizeCanonicalPublicUrl(`${SITE_ORIGIN}${candidatePath}`, SITE_ORIGIN)).toBeNull();
            expect(isCleanPublicCanonicalPath(candidatePath)).toBe(false);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("nunca devuelve una URL que contenga dominios de proveedor, colas numéricas >= 5 dígitos, query strings ni rutas privadas", () => {
      const forbiddenProviderRe =
        /(?:sportmonks|api-sports|api-football|bzzoiro|sofascore|flagcdn|understat|polymarket|kalshi|espn|nflverse|openfootball)/i;
      const numericIdRe = /(?:^|\/|[-_])\d{5,}(?=\/|\.|$)/;
      const privatePrefixRe = /^\/(?:app|api|i|p|login|signup|onboarding|baja|canjear|offline)(?:\/|$)/i;

      const encodeHex = (ch: string): string =>
        `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;

      const arbStructuredPath = fc.oneof(
        fc.tuple(arbCleanSlug, arbCleanSlug).map(([a, b]) => `/${a}/${b}`),
        fc.tuple(fc.constantFrom(...providerTokens), arbCleanSlug).map(([p, s]) => `/${encodeHex(p[0]!)}${p.slice(1)}/${s}`),
        fc.tuple(fc.constantFrom(...providerTokens), arbCleanSlug).map(([p, s]) => `/%25${p.charCodeAt(0).toString(16)}${p.slice(1)}/${s}`),
        fc.tuple(arbCleanSlug, fc.constantFrom("app", "api", "login")).map(([s, priv]) => `/${s}/../${priv}/picks`),
        fc.tuple(arbCleanSlug, fc.constantFrom("app", "api", "login")).map(([s, priv]) => `/${s}/%2e%2e/${priv}/picks`),
        fc.tuple(fc.constantFrom("app", "api", "login"), arbCleanSlug).map(([priv, s]) => `/${encodeHex(priv[0]!)}${priv.slice(1)}/${s}`),
        fc.tuple(arbCleanSlug, fc.integer({ min: 10_000, max: 999_999 })).map(
          ([s, id]) => `/${s}/team-${String(id).split("").map(encodeHex).join("")}`,
        ),
        arbCleanSlug.map((s) => `//evil.com/${s}`),
        arbCleanSlug.map((s) => `/\\evil.com/${s}`),
        arbCleanSlug.map((s) => `/%2f/evil.com/${s}`),
        fc.string({ minLength: 0, maxLength: 140 }),
      );

      fc.assert(
        fc.property(arbStructuredPath, (rawInput) => {
          const out = sanitizeCanonicalPublicUrl(rawInput, SITE_ORIGIN);
          if (out === null) return;
          expect(out.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
          expect(out.includes("?")).toBe(false);
          expect(out.includes("#")).toBe(false);
          expect(out.includes("\\")).toBe(false);
          const pathname = out.slice(SITE_ORIGIN.length);
          expect(pathname.startsWith("//")).toBe(false);
          expect(isCleanPublicCanonicalPath(pathname)).toBe(true);
          const decodedPath = decodeURIComponent(pathname);
          expect(forbiddenProviderRe.test(pathname)).toBe(false);
          expect(forbiddenProviderRe.test(decodedPath)).toBe(false);
          expect(numericIdRe.test(pathname)).toBe(false);
          expect(numericIdRe.test(decodedPath)).toBe(false);
          expect(privatePrefixRe.test(pathname)).toBe(false);
          expect(privatePrefixRe.test(decodedPath)).toBe(false);
        }),
        { numRuns: NUM_RUNS },
      );

      expect(sanitizeCanonicalPublicUrl("//evil.com/x", SITE_ORIGIN)).toBeNull();
      expect(sanitizeCanonicalPublicUrl("/\\evil.com/x", SITE_ORIGIN)).toBeNull();
      expect(sanitizeCanonicalPublicUrl("/%62zzoiro", SITE_ORIGIN)).toBeNull();
      expect(sanitizeCanonicalPublicUrl("/%2562zzoiro", SITE_ORIGIN)).toBeNull();
      expect(sanitizeCanonicalPublicUrl("/%61pp/picks", SITE_ORIGIN)).toBeNull();
      expect(sanitizeCanonicalPublicUrl("/partidos/../app/picks", SITE_ORIGIN)).toBeNull();
      expect(sanitizeCanonicalPublicUrl("/partidos/%2e%2e/app/picks", SITE_ORIGIN)).toBeNull();
      expect(sanitizeCanonicalPublicUrl("/partidos/team-%31%32%33%34%35", SITE_ORIGIN)).toBeNull();
    });
  });

  describe("Cópula SGP Jugador+Partido · evaluatePlayerLinkedSgpV5 (Fréchet-Hoeffding estricto)", () => {
    it("respeta cotas superior e inferior de Fréchet-Hoeffding incluso en líneas extremas (Over 6.5 / 8.5)", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.002, max: 0.95, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.15, max: 5.5, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.15, max: 5.5, noNaN: true, noDefaultInfinity: true }),
          fc.constantFrom<"team_win" | "team_win_or_draw" | "any">(
            "team_win",
            "team_win_or_draw",
            "any",
          ),
          fc.constantFrom<number | null>(null, 0.5, 1.5, 2.5, 4.5, 6.5, 8.5),
          fc.double({ min: -0.18, max: 0.14, noNaN: true, noDefaultInfinity: true }),
          (pPlayerAnytimeGoal, teamExpectedGoals, opponentExpectedGoals, teamOutcome, totalLine, dcRho) => {
            const res = evaluatePlayerLinkedSgpV5({
              pPlayerAnytimeGoal,
              teamExpectedGoals,
              opponentExpectedGoals,
              teamOutcome,
              matchTotalOverLine: totalLine,
              dixonColesRho: dcRho,
            });
            const marginals: number[] = [res.pPlayerScores];
            if (teamOutcome !== "any") marginals.push(res.pTeamOutcomeMarginal);
            if (res.pTotalOutcomeMarginal !== null) marginals.push(res.pTotalOutcomeMarginal);

            const frechetLo = Math.max(
              0,
              marginals.reduce((acc, p) => acc + p, 0) - (marginals.length - 1),
            );
            const frechetHi = Math.min(...marginals);

            expect(Number.isFinite(res.jointProbability)).toBe(true);
            expect(res.jointProbability).toBeGreaterThanOrEqual(0);
            expect(res.jointProbability).toBeGreaterThanOrEqual(frechetLo - 1e-9);
            expect(res.jointProbability).toBeLessThanOrEqual(frechetHi + 1e-9);
            expect(Number.isFinite(res.fairCombinedOdds.decimal)).toBe(true);
            expect(res.fairCombinedOdds.decimal).toBeGreaterThan(1);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("Ola 7 · Anti-EV alucinado, unidades obligatorias, cero cruce de líneas y diversidad de parlays", () => {
    it("suprime EV+ cuando |p - deVigMarketProb| > 0.12 o evPct supera el umbral sharp/soft", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.2, max: 0.72, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.13, max: 0.35, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.02, max: 0.08, noNaN: true, noDefaultInfinity: true }),
          fc.constantFrom("Pinnacle", "Bet365", "Caliente"),
          (trueMarketP, delta, overround, bookLabel) => {
            const pModel = Math.min(0.95, trueMarketP + delta);
            if (pModel - trueMarketP <= 0.125) return;
            const d1 = Math.max(1.05, Math.round((1 / (trueMarketP * (1 + overround))) * 100) / 100);
            const d2 = Math.max(
              1.05,
              Math.round((1 / ((1 - trueMarketP) * (1 + overround))) * 100) / 100,
            );
            const pricing = computePickPricing({
              calibratedProb: pModel,
              marketDecimal: d1,
              companionMarketDecimals: [d1, d2],
              companionIndex: 0,
              marketBookLabel: bookLabel,
              marketCapturedAtUtc: FIXED_NOW_ISO,
              nowIso: FIXED_NOW_ISO,
            });
            if (
              pricing.deVigMarketProb !== null &&
              Math.abs(pricing.p - pricing.deVigMarketProb) > 0.12
            ) {
              expect(pricing.hasPositiveValue).toBe(false);
              expect(pricing.evPct).toBeNull();
              expect(pricing.edgePts).toBeNull();
              expect(pricing.valueLabel).toBeNull();
            }
            if (pricing.hasPositiveValue && pricing.evPct !== null) {
              const limit = bookLabel === "Pinnacle" ? 18 : 22;
              expect(pricing.evPct).toBeLessThanOrEqual(limit);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("garantiza unidad obligatoria en totales y excluye mercados de conteo del slot totales", () => {
      const sports: ReadonlyArray<{
        readonly sport: MatchAnalysis["sport"];
        readonly league: "premier-league" | "nba" | "mlb" | "nhl";
        readonly line: number;
        readonly expectedUnit: RegExp;
      }> = [
        { sport: "football", league: "premier-league", line: 3.5, expectedUnit: /\bgoles\b/i },
        { sport: "basketball", league: "nba", line: 221.5, expectedUnit: /\bpuntos\b/i },
        { sport: "baseball", league: "mlb", line: 8.5, expectedUnit: /\bcarreras\b/i },
        { sport: "ice-hockey", league: "nhl", line: 5.5, expectedUnit: /\bgoles\b/i },
      ];

      for (const spec of sports) {
        const match: MatchAnalysis = {
          id: `unit-${spec.sport}`,
          league: asLeagueId(spec.league),
          leagueLabel: spec.league,
          sport: spec.sport,
          round: "J1",
          day: "2026-11-21",
          dayLabel: "sábado",
          kickoffUtc: "2026-11-21T20:00:00Z",
          kickoffLocal: "14:00",
          venue: "Arena",
          status: "NS",
          home: { slug: "a", name: "Alpha", shortName: "Alpha", code: "ALP", record: "5-1" },
          away: { slug: "b", name: "Beta", shortName: "Beta", code: "BET", record: "3-3" },
          projection: { home: 2.0, away: 1.4, total: 3.4 },
          x12: [0.55, spec.sport === "football" ? 0.25 : 0, spec.sport === "football" ? 0.2 : 0.45],
          outcomes: [],
          marketGroups: [
            {
              group: "Córners totales",
              rows: [
                {
                  market: asMarketKey("corners_total"),
                  selection: "over_9.5",
                  label: "Más de 9.5",
                  line: 9.5,
                  p: 0.64,
                  fairOdds: 1.56,
                },
              ],
            },
            {
              group: "Totales",
              rows: [
                {
                  market: asMarketKey("totals"),
                  selection: `over_${spec.line}`,
                  label: `Más de ${spec.line}`,
                  line: spec.line,
                  p: 0.58,
                  fairOdds: 1.72,
                },
              ],
            },
          ],
          factors: [],
          trace: [],
          confidence: { score: 72, level: "alta", reasons: [] },
        };

        const ds = buildPlatformDataset([
          {
            league: asLeagueId(spec.league),
            leagueLabel: spec.league,
            sport: spec.sport,
            season: "2026",
            roundLabel: "J1",
            generatedAt: FIXED_NOW_ISO,
            games: [match],
          },
        ]);
        const game = ds.games[0]!;
        const totalPicks = game.picks.filter(
          (pk) => pk.market === "totals" || pk.category === "totales",
        );
        expect(totalPicks.length).toBeGreaterThan(0);
        for (const pk of totalPicks) {
          expect(pk.market).not.toBe("corners_total");
          expect(pk.label).toMatch(spec.expectedUnit);
        }
      }
    });

    it("impide cruce de cuotas entre líneas distintas de totales en buildMatchPicksCatalog", () => {
      const game = makeBaseGame({
        markets: [
          {
            group: "Goles totales",
            market: "totals",
            selection: "over",
            label: "Más de 2.5 goles",
            line: 2.5,
            p: 0.54,
            fairDecimal: 1.85,
            fairAmerican: -118,
            openDecimal: 1.9,
            currentDecimal: 1.9,
            quoteBookLabel: "Pinnacle",
            quoteCapturedAtUtc: FIXED_NOW_ISO,
            edgePts: 1.4,
          },
          {
            group: "Goles totales",
            market: "totals",
            selection: "under",
            label: "Menos de 2.5 goles",
            line: 2.5,
            p: 0.46,
            fairDecimal: 2.17,
            fairAmerican: 117,
            openDecimal: 1.96,
            currentDecimal: 1.96,
            quoteBookLabel: "Pinnacle",
            quoteCapturedAtUtc: FIXED_NOW_ISO,
            edgePts: -5.0,
          },
          {
            group: "Goles totales",
            market: "totals",
            selection: "over",
            label: "Más sin línea",
            p: 0.6,
            fairDecimal: 1.67,
            fairAmerican: -149,
            openDecimal: 2.5,
            currentDecimal: 2.5,
            quoteBookLabel: "Pinnacle",
            quoteCapturedAtUtc: FIXED_NOW_ISO,
            edgePts: 20,
          },
        ],
      });

      const catalog = buildMatchPicksCatalog(game, {
        nowIso: FIXED_NOW_ISO,
        allowedFamilies: new Set<MarketFamilyId>(["totals"]),
      });
      const over25 = catalog.picks.find((p) => p.line === 2.5 && p.direction === "over");
      const over15 = catalog.picks.find((p) => p.line === 1.5 && p.direction === "over");
      const over35 = catalog.picks.find((p) => p.line === 3.5 && p.direction === "over");
      expect(over25?.pricing.marketDecimal).toBe(1.9);
      expect(over15?.pricing.marketDecimal).toBeNull();
      expect(over35?.pricing.marketDecimal).toBeNull();
      for (const item of catalog.picks) {
        const scored = scoreRecommendedCatalogPick(item);
        if (item.pricing.evPct !== null && item.pricing.evPct < 0) {
          expect(scored.isRecommended).toBe(false);
        }
      }
    });

    it("computeParlaySummary([]) devuelve 0 y buildSmartAutoParlay veta outliers y exige diversidad", () => {
      const emptySummary = computeParlaySummary([]);
      expect(emptySummary.fairDecimal).toBe(0);
      expect(emptySummary.bookDecimal).toBe(0);
      expect(emptySummary.fairAmerican).toBe(0);
      expect(emptySummary.bookAmerican).toBe(0);

      const makeDiverseGame = (idx: number): PlatformGame => {
        const gid = `div-game-${idx}`;
        return makeBaseGame({
          id: gid,
          picks: [
            {
              ...makePromoPick(makeBaseGame({ id: gid }), false, "Más de 3.5 goles", 2.4),
              id: `${gid}__outlier`,
              market: "totals",
              selectionKey: "over_3.5",
              line: 3.5,
              conflictGroup: "over_total",
              p: 0.72,
              fairDecimal: 1.39,
              edgePts: 30.3,
              risk: "medio",
            },
            {
              ...makePromoPick(makeBaseGame({ id: gid }), false, "Más de 3.5 goles", 1.9),
              id: `${gid}__over35`,
              market: "totals",
              selectionKey: "over_3.5",
              line: 3.5,
              conflictGroup: "over_total",
              p: 0.59,
              fairDecimal: 1.69,
              edgePts: 6.4,
              risk: "medio",
            },
            {
              ...makePromoPick(makeBaseGame({ id: gid }), false, "Gana Liverpool", 1.85),
              id: `${gid}__h2h`,
              market: "1x2",
              selectionKey: "home",
              line: null,
              conflictGroup: "home_side",
              p: 0.58,
              fairDecimal: 1.72,
              edgePts: 3.9,
              risk: "medio",
            },
            {
              ...makePromoPick(makeBaseGame({ id: gid }), false, "Ambos anotan: Sí", 1.8),
              id: `${gid}__btts`,
              market: "btts",
              selectionKey: "yes",
              line: null,
              conflictGroup: "btts_yes",
              p: 0.58,
              fairDecimal: 1.72,
              edgePts: 2.4,
              risk: "medio",
            },
          ],
        });
      };

      const games = [makeDiverseGame(1), makeDiverseGame(2), makeDiverseGame(3)];
      const legs = buildSmartAutoParlay(games, {
        leagues: [],
        risk: "medio",
        legCount: 3,
        allowSgp: false,
        viewerRole: "member",
      });
      expect(legs).toHaveLength(3);
      for (const leg of legs) {
        expect(isParlayPickOutlier(leg.pick)).toBe(false);
        expect(leg.pick.id).not.toContain("__outlier");
      }
      const uniqueMarketKeys = new Set(legs.map((l) => parlayMarketDiversityKey(l.pick)));
      expect(uniqueMarketKeys.size).toBe(3);
    });
  });
});
