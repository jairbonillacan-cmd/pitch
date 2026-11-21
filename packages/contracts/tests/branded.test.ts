import { describe, expect, it } from "vitest";
import {
  DEFAULT_SANITIZED_ERROR_MESSAGE,
  DEFAULT_UNIT_PROBABILITY_EPSILON,
  FORBIDDEN_PROVIDER_TOKENS,
  MAX_POSITIVE_DECIMAL_ODDS,
  QUOTE_MOVEMENTS,
  VISITOR_RESTRICTED_KEYS,
  asTeamId,
  assertCanonicalPublicSlug,
  assertNoRestrictedKeysInVisitorPayload,
  assertOpaqueResourceId,
  assertPositiveDecimalOdds,
  assertStrictFiniteNumber,
  assertUnitProbability,
  clampToUnitProbability,
  containsForbiddenFd16Term,
  createRedactedVisitorPick,
  createSanitizedErrorPayload,
  createSpacetimeAnchoredQuote,
  isCanonicalPublicSlug,
  isOpaqueResourceId,
  isPositiveDecimalOdds,
  isSafePublicLabel,
  isUnitProbability,
  parseCanonicalPublicSlug,
  parseOpaqueResourceId,
  parsePositiveDecimalOdds,
  parseStrictFiniteNumber,
  parseUnitProbability,
  probabilityToFairDecimal,
  type Brand,
  type CanonicalPublicSlug,
  type OpaqueResourceId,
  type PositiveDecimalOdds,
  type QuoteMovement,
  type RedactedVisitorPick,
  type SanitizedErrorPayload,
  type SpacetimeAnchoredQuote,
  type UnitProbability,
} from "../src/index.js";

describe("@pitchlab/contracts · Branded types & Level 1 constructors", () => {
  describe("Brand compatibility with ids.ts", () => {
    it("re-exports Brand without conflicting with ids.ts branded IDs", () => {
      type CustomTag = Brand<string, "CustomTag">;
      const custom = "custom_01" as CustomTag;
      const teamId = asTeamId("liga-mx.america");
      expect(custom).toBe("custom_01");
      expect(teamId).toBe("liga-mx.america");
    });
  });

  describe("parseStrictFiniteNumber & assertStrictFiniteNumber", () => {
    it("accepts finite numbers and canonical numeric strings", () => {
      expect(parseStrictFiniteNumber(0)).toBe(0);
      expect(Object.is(parseStrictFiniteNumber(-0), 0)).toBe(true);
      expect(Object.is(parseStrictFiniteNumber("-0"), 0)).toBe(true);
      expect(parseStrictFiniteNumber(42)).toBe(42);
      expect(parseStrictFiniteNumber(-3.14)).toBe(-3.14);
      expect(parseStrictFiniteNumber("0")).toBe(0);
      expect(parseStrictFiniteNumber("42")).toBe(42);
      expect(parseStrictFiniteNumber("+42.5")).toBe(42.5);
      expect(parseStrictFiniteNumber("-0.25")).toBe(-0.25);
      expect(parseStrictFiniteNumber(".5")).toBe(0.5);
      expect(parseStrictFiniteNumber("5.")).toBe(5);
      expect(parseStrictFiniteNumber("1.5e-2")).toBe(0.015);
      expect(parseStrictFiniteNumber("2E+3")).toBe(2000);
      expect(parseStrictFiniteNumber(" 1.91 ")).toBe(1.91);
      expect(assertStrictFiniteNumber("2.5", "line")).toBe(2.5);
    });

    it("rejects null, undefined, booleans, empty/whitespace, non-finite, malformed strings, arrays, objects, symbols, bigints", () => {
      const invalidInputs: unknown[] = [
        null,
        undefined,
        true,
        false,
        "",
        " ",
        "   \t\n  ",
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        "NaN",
        "Infinity",
        "-Infinity",
        "1e500",
        "0x10",
        "0b10",
        "0o10",
        "1_000",
        "1,50",
        "12px",
        "1 2",
        ".",
        "+",
        "-",
        [],
        [1],
        {},
        { valueOf: () => 1 },
        Symbol("1"),
        10n,
      ];

      for (const value of invalidInputs) {
        expect(parseStrictFiniteNumber(value)).toBeNull();
        expect(() => assertStrictFiniteNumber(value, "metric")).toThrow(RangeError);
      }
    });
  });

  describe("UnitProbability", () => {
    it("accepts open interval (0, 1) and rejects 0, 1, negatives, > 1, and 0..100 scales", () => {
      const p = parseUnitProbability(0.55);
      expect(p).toBe(0.55);
      expect(parseUnitProbability("0.0001")).toBe(0.0001);
      expect(parseUnitProbability(".5")).toBe(0.5);
      expect(parseUnitProbability(0.9999)).toBe(0.9999);
      expect(assertUnitProbability(0.62, "winProb")).toBe(0.62);

      const invalidProbs: unknown[] = [
        0,
        -0,
        1,
        -0.01,
        -1,
        1.0001,
        50,
        55,
        100,
        "0",
        "1",
        "100",
        "55",
        "",
        "   ",
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        null,
        undefined,
        true,
        false,
        [],
        {},
        Symbol("p"),
      ];

      for (const value of invalidProbs) {
        expect(parseUnitProbability(value)).toBeNull();
        expect(() => assertUnitProbability(value, "p")).toThrow(RangeError);
      }
    });

    it("guards runtime number values strictly with isUnitProbability", () => {
      expect(isUnitProbability(0.5)).toBe(true);
      expect(isUnitProbability(0.001)).toBe(true);
      expect(isUnitProbability(0.999)).toBe(true);
      expect(isUnitProbability("0.5")).toBe(false);
      expect(isUnitProbability(0)).toBe(false);
      expect(isUnitProbability(1)).toBe(false);
      expect(isUnitProbability(100)).toBe(false);
      expect(isUnitProbability(Number.NaN)).toBe(false);
      expect(isUnitProbability(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isUnitProbability(null)).toBe(false);
      expect(isUnitProbability(true)).toBe(false);
    });

    it("clamps finite raw numbers into [epsilon, 1 - epsilon] and rejects non-finite or invalid epsilon", () => {
      expect(clampToUnitProbability(0)).toBe(DEFAULT_UNIT_PROBABILITY_EPSILON);
      expect(clampToUnitProbability(-10)).toBe(DEFAULT_UNIT_PROBABILITY_EPSILON);
      expect(clampToUnitProbability(1)).toBe(1 - DEFAULT_UNIT_PROBABILITY_EPSILON);
      expect(clampToUnitProbability(100)).toBe(1 - DEFAULT_UNIT_PROBABILITY_EPSILON);
      expect(clampToUnitProbability(0.42)).toBe(0.42);
      expect(clampToUnitProbability(0, 0.01)).toBe(0.01);
      expect(clampToUnitProbability(1, 0.01)).toBe(0.99);
      expect(isUnitProbability(clampToUnitProbability(0))).toBe(true);
      expect(isUnitProbability(clampToUnitProbability(1))).toBe(true);

      expect(() => clampToUnitProbability(Number.NaN)).toThrow(RangeError);
      expect(() => clampToUnitProbability(Number.POSITIVE_INFINITY)).toThrow(RangeError);
      expect(() => clampToUnitProbability(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
      expect(() => clampToUnitProbability(0.5, 0)).toThrow(RangeError);
      expect(() => clampToUnitProbability(0.5, -0.01)).toThrow(RangeError);
      expect(() => clampToUnitProbability(0.5, 0.5)).toThrow(RangeError);
      expect(() => clampToUnitProbability(0.5, Number.NaN)).toThrow(RangeError);
    });

    it("enforces nominal branding at compile time", () => {
      // @ts-expect-error raw number must not satisfy UnitProbability
      const rawProb: UnitProbability = 0.5;
      expect(rawProb).toBe(0.5);

      const brandedProb = assertUnitProbability(0.5);
      // @ts-expect-error UnitProbability must not satisfy PositiveDecimalOdds
      const mismatchedOdds: PositiveDecimalOdds = brandedProb;
      expect(mismatchedOdds).toBe(0.5);
    });
  });

  describe("PositiveDecimalOdds & probabilityToFairDecimal", () => {
    it("accepts (1, 1000] and rejects <= 1, > 1000, non-finite, and invalid types", () => {
      expect(parsePositiveDecimalOdds(1.01)).toBe(1.01);
      expect(parsePositiveDecimalOdds(2.5)).toBe(2.5);
      expect(parsePositiveDecimalOdds(MAX_POSITIVE_DECIMAL_ODDS)).toBe(1000);
      expect(parsePositiveDecimalOdds("1.91")).toBe(1.91);
      expect(assertPositiveDecimalOdds("3.4", "bookDecimal")).toBe(3.4);

      expect(isPositiveDecimalOdds(2.1)).toBe(true);
      expect(isPositiveDecimalOdds("2.1")).toBe(false);
      expect(isPositiveDecimalOdds(1)).toBe(false);
      expect(isPositiveDecimalOdds(1000.01)).toBe(false);

      const invalidOdds: unknown[] = [
        0,
        -2,
        0.99,
        1,
        1.0,
        "1",
        "1.0",
        1000.01,
        1001,
        "1000.5",
        "",
        " ",
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        null,
        undefined,
        true,
        false,
        [],
        {},
      ];

      for (const value of invalidOdds) {
        expect(parsePositiveDecimalOdds(value)).toBeNull();
        expect(() => assertPositiveDecimalOdds(value, "odds")).toThrow(RangeError);
      }
    });

    it("computes fair decimal odds from UnitProbability within (1, 1000]", () => {
      const half = assertUnitProbability(0.5);
      expect(probabilityToFairDecimal(half)).toBe(2);

      const forty = assertUnitProbability(0.4);
      expect(probabilityToFairDecimal(forty)).toBeCloseTo(2.5, 6);

      const minNormal = assertUnitProbability(0.001);
      expect(probabilityToFairDecimal(minNormal)).toBe(1000);

      const extremeLongshot = assertUnitProbability(0.0001);
      expect(probabilityToFairDecimal(extremeLongshot)).toBe(MAX_POSITIVE_DECIMAL_ODDS);
      expect(isPositiveDecimalOdds(probabilityToFairDecimal(extremeLongshot))).toBe(true);

      // @ts-expect-error probabilityToFairDecimal requires branded UnitProbability
      expect(probabilityToFairDecimal(0.5)).toBe(2);
    });
  });

  describe("SpacetimeAnchoredQuote", () => {
    it("creates a sealed deterministic quote anchored to Spacetime valuation", () => {
      const quote = createSpacetimeAnchoredQuote({
        bookLabel: "Caliente MX",
        marketKey: "soccer.totals",
        selection: "Over 2.5",
        line: 2.5,
        bookDecimal: 2.1,
        modelProb: 0.55,
        movement: "STEAM",
        capturedAtIso: "2026-11-21T14:30:00Z",
      });

      expect(quote.bookLabel).toBe("Caliente MX");
      expect(quote.marketKey).toBe("soccer.totals");
      expect(quote.selection).toBe("Over 2.5");
      expect(quote.line).toBe(2.5);
      expect(quote.bookDecimal).toBe(2.1);
      expect(quote.modelProb).toBe(0.55);
      expect(quote.fairDecimal).toBeCloseTo(1 / 0.55, 6);
      expect(quote.edgePts).toBe(7.4);
      expect(quote.evPct).toBe(15.5);
      expect(quote.movement).toBe("STEAM");
      expect(quote.capturedAtIso).toBe("2026-11-21T14:30:00Z");
      expect(Object.isFrozen(quote)).toBe(true);
    });

    it("defaults movement to STABLE and line to null, and normalizes zero edge/ev", () => {
      const quote = createSpacetimeAnchoredQuote({
        bookLabel: "Bet365",
        marketKey: "1x2",
        selection: "Local",
        bookDecimal: assertPositiveDecimalOdds(2.0),
        modelProb: assertUnitProbability(0.5),
        capturedAtIso: "2026-11-21T08:00:00-06:00",
      });

      expect(quote.line).toBeNull();
      expect(quote.movement).toBe("STABLE");
      expect(Object.is(quote.edgePts, 0)).toBe(true);
      expect(Object.is(quote.evPct, 0)).toBe(true);

      for (const movement of QUOTE_MOVEMENTS) {
        const q = createSpacetimeAnchoredQuote({
          bookLabel: "Pinnacle",
          marketKey: "1x2",
          selection: "Empate",
          bookDecimal: 3.2,
          modelProb: 0.3,
          movement,
          capturedAtIso: "2026-11-21T14:00:00Z",
        });
        expect(q.movement).toBe(movement);
      }
    });

    it("rejects quotes without valid Spacetime valuation, invalid odds, invalid movement/timestamp, or bookLabel with URLs/domains/providers", () => {
      const baseValid = {
        bookLabel: "Caliente",
        marketKey: "1x2",
        selection: "Local",
        bookDecimal: 2.1,
        modelProb: 0.55,
        movement: "SHORTENING" as QuoteMovement,
        capturedAtIso: "2026-11-21T14:00:00Z",
      };

      expect(() =>
        createSpacetimeAnchoredQuote({
          ...baseValid,
          modelProb: undefined as unknown as number,
        }),
      ).toThrow(RangeError);

      expect(() =>
        createSpacetimeAnchoredQuote({
          ...baseValid,
          modelProb: 0,
        }),
      ).toThrow(RangeError);

      expect(() =>
        createSpacetimeAnchoredQuote({
          ...baseValid,
          modelProb: 1,
        }),
      ).toThrow(RangeError);

      expect(() =>
        createSpacetimeAnchoredQuote({
          ...baseValid,
          modelProb: 55,
        }),
      ).toThrow(RangeError);

      expect(() =>
        createSpacetimeAnchoredQuote({
          ...baseValid,
          bookDecimal: 1.0,
        }),
      ).toThrow(RangeError);

      expect(() =>
        createSpacetimeAnchoredQuote({
          ...baseValid,
          line: Number.NaN,
        }),
      ).toThrow(RangeError);

      expect(() =>
        createSpacetimeAnchoredQuote({
          ...baseValid,
          movement: "SPIKE" as unknown as QuoteMovement,
        }),
      ).toThrow(RangeError);

      expect(() =>
        createSpacetimeAnchoredQuote({
          ...baseValid,
          capturedAtIso: "not-a-timestamp",
        }),
      ).toThrow(RangeError);

      const forbiddenBookLabels = [
        "",
        "   ",
        "https://caliente.mx",
        "http://bet365.com",
        "www.pinnacle.com",
        "caliente.mx",
        "bet365.com/odds",
        "sports.bzzoiro.com",
        "Bzzoiro",
        "ESPN",
        "SportMonks",
        "SofaScore",
        "Odds-Api",
        "api-football",
        "ScoutPicks",
        "AstraAnalisis",
      ];

      for (const bookLabel of forbiddenBookLabels) {
        expect(() =>
          createSpacetimeAnchoredQuote({
            ...baseValid,
            bookLabel,
          }),
        ).toThrow(RangeError);
      }

      // @ts-expect-error unbranded object literal must not satisfy SpacetimeAnchoredQuote
      const forgedQuote: SpacetimeAnchoredQuote = {
        bookLabel: "Caliente",
        marketKey: "1x2",
        selection: "Local",
        line: null,
        bookDecimal: assertPositiveDecimalOdds(2.1),
        modelProb: assertUnitProbability(0.55),
        fairDecimal: probabilityToFairDecimal(assertUnitProbability(0.55)),
        edgePts: 7.4,
        evPct: 15.5,
        movement: "STABLE",
        capturedAtIso: "2026-11-21T14:00:00Z",
      };
      expect(forgedQuote.bookLabel).toBe("Caliente");
    });
  });

  describe("RedactedVisitorPick & assertNoRestrictedKeysInVisitorPayload", () => {
    it("creates a structurally distinct visitor_redacted pick with only safe fields", () => {
      const redacted = createRedactedVisitorPick({
        id: "pick_locked_01",
        gameId: "game_ame_chi_01",
        league: "liga-mx",
        familyLabel: "Total de goles",
      });

      expect(redacted.__accessTier).toBe("visitor_redacted");
      expect(redacted.id).toBe("pick_locked_01");
      expect(redacted.gameId).toBe("game_ame_chi_01");
      expect(redacted.league).toBe("liga-mx");
      expect(redacted.familyLabel).toBe("Total de goles");
      expect(redacted.locked).toBe(true);
      expect(redacted.reason).toBe("pass_required");
      expect(Object.isFrozen(redacted)).toBe(true);
      expect(() => assertNoRestrictedKeysInVisitorPayload(redacted)).not.toThrow();
      expect(() =>
        assertNoRestrictedKeysInVisitorPayload({
          items: [redacted],
          meta: { surface: "visitor", count: 1 },
        }),
      ).not.toThrow();
    });

    it("rejects empty fields and strips extra keys at runtime while forbidding them at compile time", () => {
      expect(() =>
        createRedactedVisitorPick({
          id: "   ",
          gameId: "game_01",
          league: "liga-mx",
          familyLabel: "1X2",
        }),
      ).toThrow(RangeError);

      const inputWithRestricted = {
        id: "pick_002",
        gameId: "game_002",
        league: "nfl",
        familyLabel: "Spread",
        fairDecimal: 1.91,
      };
      // @ts-expect-error restricted key is forbidden in createRedactedVisitorPick input
      const stripped = createRedactedVisitorPick(inputWithRestricted);
      expect("fairDecimal" in stripped).toBe(false);
      expect(() => assertNoRestrictedKeysInVisitorPayload(stripped)).not.toThrow();
    });

    it("forbids every restricted key at compile time and catches all nested leaks at runtime", () => {
      const baseRedacted = createRedactedVisitorPick({
        id: "pick_001",
        gameId: "game_001",
        league: "liga-mx",
        familyLabel: "Resultado 1X2",
      });

      // @ts-expect-error fairDecimal is forbidden on RedactedVisitorPick
      const leakedFair: RedactedVisitorPick = { ...baseRedacted, fairDecimal: 2.0 };
      // @ts-expect-error evPct is forbidden on RedactedVisitorPick
      const leakedEv: RedactedVisitorPick = { ...baseRedacted, evPct: 5.2 };
      // @ts-expect-error edgePts is forbidden on RedactedVisitorPick
      const leakedEdge: RedactedVisitorPick = { ...baseRedacted, edgePts: 3.1 };
      // @ts-expect-error modelProb is forbidden on RedactedVisitorPick
      const leakedProb: RedactedVisitorPick = { ...baseRedacted, modelProb: 0.58 };
      // @ts-expect-error line is forbidden on RedactedVisitorPick
      const leakedLine: RedactedVisitorPick = { ...baseRedacted, line: 2.5 };
      // @ts-expect-error side is forbidden on RedactedVisitorPick
      const leakedSide: RedactedVisitorPick = { ...baseRedacted, side: "home" };
      // @ts-expect-error playerName is forbidden on RedactedVisitorPick
      const leakedPlayer: RedactedVisitorPick = { ...baseRedacted, playerName: "Henry Martin" };
      // @ts-expect-error inPlayWinProb is forbidden on RedactedVisitorPick
      const leakedLive: RedactedVisitorPick = { ...baseRedacted, inPlayWinProb: 0.64 };
      // @ts-expect-error x12 is forbidden on RedactedVisitorPick
      const leakedX12: RedactedVisitorPick = { ...baseRedacted, x12: [0.5, 0.3, 0.2] };

      const leakedPayloads: unknown[] = [
        leakedFair,
        leakedEv,
        leakedEdge,
        leakedProb,
        leakedLine,
        leakedSide,
        leakedPlayer,
        leakedLive,
        leakedX12,
      ];

      expect(VISITOR_RESTRICTED_KEYS).toHaveLength(9);

      for (const payload of leakedPayloads) {
        expect(() => assertNoRestrictedKeysInVisitorPayload(payload)).toThrow(RangeError);
      }

      expect(() =>
        assertNoRestrictedKeysInVisitorPayload({
          games: [{ id: "g1", picks: [{ id: "p1", fairDecimal: 0 }] }],
        }),
      ).toThrow(RangeError);

      expect(() =>
        assertNoRestrictedKeysInVisitorPayload({
          live: { detail: { inPlayWinProb: null } },
        }),
      ).toThrow(RangeError);

      expect(() =>
        assertNoRestrictedKeysInVisitorPayload({
          games: [{ x12: [0, 0, 0] }],
        }),
      ).toThrow(RangeError);

      const nullProto = Object.create(null) as Record<string, unknown>;
      nullProto.evPct = null;
      expect(() => assertNoRestrictedKeysInVisitorPayload(nullProto)).toThrow(RangeError);

      const circularSafe: Record<string, unknown> = { id: "safe_1" };
      circularSafe.self = circularSafe;
      expect(() => assertNoRestrictedKeysInVisitorPayload(circularSafe)).not.toThrow();

      expect(() => assertNoRestrictedKeysInVisitorPayload(null)).not.toThrow();
      expect(() => assertNoRestrictedKeysInVisitorPayload("ok")).not.toThrow();
    });
  });

  describe("OpaqueResourceId", () => {
    it("accepts clean [a-zA-Z0-9_-]{4,64} IDs and rejects URLs, slashes, traversal, wrong length, and FD-16 providers", () => {
      expect(parseOpaqueResourceId("ab12")).toBe("ab12");
      expect(parseOpaqueResourceId("pick_9f8a2b-01")).toBe("pick_9f8a2b-01");
      expect(parseOpaqueResourceId("a".repeat(64))).toBe("a".repeat(64));
      expect(isOpaqueResourceId("req_7c1d9e")).toBe(true);
      expect(assertOpaqueResourceId("game-4f9a2c")).toBe("game-4f9a2c");

      const invalidIds: unknown[] = [
        "",
        "abc",
        "a".repeat(65),
        "has space",
        "a/b/c",
        "a\\b\\c",
        "../etc/passwd",
        "foo..bar",
        "https://sports.bzzoiro.com/img/team/1",
        "http://example.com",
        "caliente.mx",
        "bzzoiro_1234",
        "espn-article-99",
        "sportmonks_fixture",
        "sofascore_live",
        "odds-api-key",
        "odds_api_123",
        "api-football-9",
        "api_football_9",
        "scoutpicks_01",
        "astraanalisis_01",
        null,
        undefined,
        12345,
        true,
        [],
        {},
      ];

      for (const value of invalidIds) {
        expect(parseOpaqueResourceId(value)).toBeNull();
        expect(isOpaqueResourceId(value)).toBe(false);
        expect(() => assertOpaqueResourceId(value)).toThrow(RangeError);
      }
    });
  });

  describe("CanonicalPublicSlug", () => {
    it("accepts clean ASCII kebab-case slugs (2..96) including 4-digit years and 6-char hashes", () => {
      expect(parseCanonicalPublicSlug("mx")).toBe("mx");
      expect(parseCanonicalPublicSlug("liga-mx")).toBe("liga-mx");
      expect(parseCanonicalPublicSlug("america-vs-chivas-4f9a2c")).toBe(
        "america-vs-chivas-4f9a2c",
      );
      expect(parseCanonicalPublicSlug("copa-2026")).toBe("copa-2026");
      expect(parseCanonicalPublicSlug("schalke-04")).toBe("schalke-04");
      expect(parseCanonicalPublicSlug("real-espanyol")).toBe("real-espanyol");
      expect(parseCanonicalPublicSlug("a".repeat(96))).toBe("a".repeat(96));
      expect(isCanonicalPublicSlug("premier-league")).toBe(true);
      expect(assertCanonicalPublicSlug("champions-league")).toBe("champions-league");
    });

    it("rejects bad lengths, uppercase, non-ASCII, numeric tails >= 5 digits, and FD-16 provider substrings", () => {
      const invalidSlugs: unknown[] = [
        "",
        "a",
        "a".repeat(97),
        "America-Chivas",
        "américa-chivas",
        "-leading",
        "trailing-",
        "double--hyphen",
        "snake_case",
        "with space",
        "path/segment",
        "dot.slug",
        "america-vs-chivas-18721",
        "real-madrid-12345",
        "fixture-9876543",
        "18721",
        ...FORBIDDEN_PROVIDER_TOKENS.map((token) => `match-${token}-preview`),
        ...FORBIDDEN_PROVIDER_TOKENS,
        "the-oddsapi-feed",
        "apifootball-live",
        null,
        undefined,
        1234,
        true,
      ];

      for (const value of invalidSlugs) {
        expect(parseCanonicalPublicSlug(value)).toBeNull();
        expect(isCanonicalPublicSlug(value)).toBe(false);
        expect(() => assertCanonicalPublicSlug(value)).toThrow(RangeError);
      }

      const opaqueId: OpaqueResourceId = assertOpaqueResourceId("pick_9f8a2b");
      // @ts-expect-error OpaqueResourceId must not satisfy CanonicalPublicSlug
      const slugFromId: CanonicalPublicSlug = opaqueId;
      expect(slugFromId).toBe("pick_9f8a2b");
      // @ts-expect-error raw string must not satisfy OpaqueResourceId
      const rawOpaque: OpaqueResourceId = "pick_9f8a2b";
      expect(rawOpaque).toBe("pick_9f8a2b");
    });
  });

  describe("SanitizedErrorPayload", () => {
    it("preserves clean user-facing messages, normalizes codes, and attaches valid opaque requestIds", () => {
      const payload = createSanitizedErrorPayload(
        "rate-limited",
        "Demasiados intentos. Intenta de nuevo en 60 segundos.",
        "req_8a9f0c12",
      );

      expect(payload.code).toBe("RATE_LIMITED");
      expect(payload.message).toBe("Demasiados intentos. Intenta de nuevo en 60 segundos.");
      expect(payload.requestId).toBe("req_8a9f0c12");
      expect(Object.isFrozen(payload)).toBe(true);

      const safeRouteMessage = createSanitizedErrorPayload(
        "PASS_EXPIRED",
        "Tu pase venció. Renuévalo en /precio o consulta /app/liga-mx.",
      );
      expect(safeRouteMessage.message).toBe(
        "Tu pase venció. Renuévalo en /precio o consulta /app/liga-mx.",
      );
      expect("requestId" in safeRouteMessage).toBe(false);

      const safeEnglishMessage = createSanitizedErrorPayload(
        "BAD_REQUEST",
        "At least one selection is required.",
      );
      expect(safeEnglishMessage.message).toBe("At least one selection is required.");
    });

    it("scrubs stack traces, SQL queries, Postgres errors, internal paths, secrets, and FD-16 leaks", () => {
      const unsafeMessages = [
        "Error: boom\n    at loadUser (/app/apps/web/src/server/auth.ts:42:11)",
        "TypeError: Cannot read properties of undefined (reading 'id')",
        "SELECT id, email FROM users WHERE id = $1",
        'duplicate key value violates unique constraint "users_email_key"',
        'relation "sealed_picks" does not exist',
        "DELETE FROM sessions WHERE user_id = 1",
        "UPDATE users SET role = 'admin'",
        "INSERT INTO audit_log VALUES (1)",
        "ENOENT: no such file or directory, open '/etc/passwd'",
        "Failed opening C:\\Users\\admin\\secrets\\.env",
        "Failure inside packages/contracts/src/branded.ts:99",
        "Crash at server.ts:128:4",
        "postgres://user:pass@db.internal:5432/pitchlab",
        "Timeout calling https://sports.bzzoiro.com/api/events",
        "Missing DATABASE_URL environment variable",
        "Invalid header Bearer eyJhbGciOiJIUzI1NiJ9.payload",
        "Upstream sportmonks failure",
        "   ",
      ];

      for (const unsafe of unsafeMessages) {
        const sanitized = createSanitizedErrorPayload("INTERNAL_ERROR", unsafe, "../bad/req");
        expect(sanitized.code).toBe("INTERNAL_ERROR");
        expect(sanitized.message).toBe(DEFAULT_SANITIZED_ERROR_MESSAGE);
        expect("requestId" in sanitized).toBe(false);
      }

      const badCode = createSanitizedErrorPayload(
        "SELECT * FROM users",
        "Solicitud inválida.",
      );
      expect(badCode.code).toBe("INTERNAL_ERROR");
      expect(badCode.message).toBe("Solicitud inválida.");

      // @ts-expect-error unbranded object literal cannot satisfy SanitizedErrorPayload
      const rawPayload: SanitizedErrorPayload = {
        code: "INTERNAL_ERROR",
        message: "raw",
      };
      expect(rawPayload.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("FD-16 · containsForbiddenFd16Term & isSafePublicLabel", () => {
    it("blocks all normalized providers/competitors, FD-16 algorithms, URLs/domains, raw 5+ digit IDs, and forbidden editorial jargon", () => {
      const forbiddenSamples = [
        "Bzzoiro",
        "bzzoiro",
        "SportMonks",
        "Sport Monks",
        "SofaScore",
        "Sofa-Score",
        "ESPN",
        "a.espncdn.com",
        "oddsapi",
        "odds-api",
        "Odds API",
        "The Odds API",
        "the_odds_api",
        "theoddsapi",
        "API-Football",
        "API Football",
        "apifootball",
        "ScoutPicks",
        "Scout Picks",
        "AstraAnalisis",
        "Astra Análisis",
        "nflverse",
        "NFL-verse",
        "openfootball",
        "Open Football",
        "Polymarket",
        "Poly-Market",
        "Kalshi",
        "Understat",
        "Betfair",
        "Betfair Exchange",
        "FlashScore",
        "Flash Score",
        "WhoScored",
        "Who-Scored",
        "FBref",
        "FB-Ref",
        "Dixon-Coles",
        "DixonColes",
        "Dixon Coles",
        "dixon_coles",
        "Poisson",
        "Modelo Poisson bivariado",
        "LightGBM",
        "Light GBM",
        "Platt",
        "Calibración Platt",
        "Pitágoras",
        "Pitagoras",
        "Venn-Abers",
        "VennAbers",
        "CatBoost",
        "XGBoost",
        "Elo",
        "Rating Elo",
        "ClubElo",
        "xG-Elo",
        "Brier",
        "Brier score",
        "log-loss",
        "Log Loss",
        "logloss",
        "ECE",
        "ECE 0.03",
        "mc ",
        "MC 10000",
        "Simulación MC",
        "Monte Carlo",
        "monte-carlo",
        "HGB",
        "PAVA",
        "Log5",
        "xG",
        "Diferencia de xG",
        "xG%",
        "xGA",
        "xGOT",
        "https://example.com/feed",
        "http://caliente.mx/odds",
        "www.ejemplo.org",
        "example.com",
        "api.datos.io",
        "tracker.app",
        "feed.net/live",
        "12345",
        "Evento 602407",
        "fixture_19621792",
        "match-987654",
        "Confianza 82",
        "Confianza: 78 %",
        "Confianza-90",
        "Datos completos",
        "Datos parciales",
        "Datos completos / parciales",
      ];

      for (const sample of forbiddenSamples) {
        expect(containsForbiddenFd16Term(sample), sample).toBe(true);
        expect(isSafePublicLabel(sample), sample).toBe(false);
      }
    });

    it("accepts clean Spanish/English public labels without false positives and rejects empty/control strings", () => {
      expect(containsForbiddenFd16Term("")).toBe(false);
      expect(containsForbiddenFd16Term("   ")).toBe(false);
      expect(isSafePublicLabel("")).toBe(false);
      expect(isSafePublicLabel("   ")).toBe(false);
      expect(isSafePublicLabel("Línea\nrota")).toBe(false);

      const safeSamples = [
        "Calidad de sus tiros a 5 contra 5",
        "Duelo de porteros",
        "Duelo de abridores",
        "Otro factor del modelo",
        "Hielo local y altura",
        "Real Espanyol",
        "Forma reciente",
        "Connor McDavid",
        "Christian McCaffrey",
        "Temporada 2026",
        "Más de 225.5 puntos",
        "Abridores confirmados",
        "J.R. Smith",
        "St. Louis Blues",
        "Confianza del equipo en casa",
        "Datos de localía y descanso",
        "Ritmo ofensivo reciente",
      ];

      for (const sample of safeSamples) {
        expect(containsForbiddenFd16Term(sample), sample).toBe(false);
        expect(isSafePublicLabel(sample), sample).toBe(true);
      }
    });
  });
});
