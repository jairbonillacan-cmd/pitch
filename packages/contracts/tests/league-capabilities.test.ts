import { describe, expect, it } from "vitest";
import {
  COMPETITION_BY_ID,
  COMPETITION_CATALOG,
  FOOTBALL_MARKET_FAMILY_IDS,
  LEAGUE_CAPABILITY_LIST,
  LEAGUE_CAPABILITY_REGISTRY,
  LEAGUE_CATALOG,
  LIVE_CAPABLE_BZZOIRO_LEAGUES,
  MARKET_FAMILY_COUNT,
  MARKET_FAMILY_IDS,
  MLB_MARKET_FAMILY_IDS,
  NBA_MARKET_FAMILY_IDS,
  NFL_MARKET_FAMILY_IDS,
  NHL_MARKET_FAMILY_IDS,
  TIER1_LEAGUE_IDS,
  TIER1_MAJOR_CUP_IDS,
  getLeagueCapability,
  isLeagueHealthyForUi,
  isTier1League,
  type LeagueCapabilityContract,
  type MarketFamilyId,
} from "../src/index.js";

const EXPECTED_TIER1_CORE_FOOTBALL = [
  "liga-mx",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
] as const;

const EXPECTED_TIER1_MAJOR_CUPS = [
  "champions-league",
  "europa-league",
  "libertadores",
  "concacaf-champions",
  "mls",
] as const;

const EXPECTED_TIER1_US = ["nfl", "nba", "nhl", "mlb"] as const;

describe("LeagueCapabilityContract · Registro canónico de 57 ligas y 34 familias", () => {
  it("registra exactamente 57 ligas en paridad 1:1 con COMPETITION_CATALOG y LEAGUE_CATALOG", () => {
    expect(LEAGUE_CAPABILITY_LIST).toHaveLength(57);
    expect(Object.keys(LEAGUE_CAPABILITY_REGISTRY)).toHaveLength(57);

    const capabilityIds = LEAGUE_CAPABILITY_LIST.map((entry) => entry.id);
    expect(new Set(capabilityIds).size).toBe(57);

    const competitionIds = new Set(COMPETITION_CATALOG.map((item) => item.id));
    const catalogIds = new Set(LEAGUE_CATALOG.map((item) => item.id));
    expect(competitionIds.size).toBe(57);
    expect(catalogIds.size).toBe(57);

    for (const entry of LEAGUE_CAPABILITY_LIST) {
      expect(competitionIds.has(entry.id)).toBe(true);
      expect(catalogIds.has(entry.id)).toBe(true);
      expect(LEAGUE_CAPABILITY_REGISTRY[entry.id]).toBe(entry);
      expect(getLeagueCapability(entry.id)).toBe(entry);

      const meta = COMPETITION_BY_ID[entry.id];
      expect(meta).toBeDefined();
      expect(entry.sport).toBe(meta?.sport);

      if (entry.sport === "football") {
        expect(entry.bzzoiroId).toBe(meta?.bzzoiroId ?? null);
      }

      if (entry.bzzoiroId !== null) {
        expect(entry.bzzoiroLeagueIds.length).toBeGreaterThanOrEqual(1);
        expect(entry.bzzoiroLeagueIds[0]).toBe(entry.bzzoiroId);
      } else {
        expect(entry.bzzoiroLeagueIds).toEqual([]);
      }

      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.providers)).toBe(true);
      expect(Object.isFrozen(entry.competitionFormat)).toBe(true);
    }

    expect(Object.isFrozen(LEAGUE_CAPABILITY_LIST)).toBe(true);
    expect(Object.isFrozen(LEAGUE_CAPABILITY_REGISTRY)).toBe(true);
    expect(Object.isFrozen(TIER1_LEAGUE_IDS)).toBe(true);
    expect(Object.isFrozen(TIER1_MAJOR_CUP_IDS)).toBe(true);
    expect(Object.isFrozen(LIVE_CAPABLE_BZZOIRO_LEAGUES)).toBe(true);
  });

  it("particiona exactamente 15 ligas Tier 1 y 42 ligas Tier 2 con políticas de visibilidad estrictas", () => {
    expect(TIER1_LEAGUE_IDS).toHaveLength(15);
    expect(TIER1_MAJOR_CUP_IDS).toHaveLength(5);

    const expectedTier1 = new Set<string>([
      ...EXPECTED_TIER1_CORE_FOOTBALL,
      ...EXPECTED_TIER1_MAJOR_CUPS,
      ...EXPECTED_TIER1_US,
    ]);
    expect(new Set<string>(TIER1_LEAGUE_IDS)).toEqual(expectedTier1);
    expect(new Set<string>(TIER1_MAJOR_CUP_IDS)).toEqual(new Set<string>(EXPECTED_TIER1_MAJOR_CUPS));

    const tier1CoreEntries = LEAGUE_CAPABILITY_LIST.filter((entry) => entry.tier === "tier1_core");
    const tier1MajorCupEntries = LEAGUE_CAPABILITY_LIST.filter(
      (entry) => entry.tier === "tier1_major_cup",
    );
    const tier2Entries = LEAGUE_CAPABILITY_LIST.filter((entry) => entry.tier === "tier2_expansion");

    expect(tier1CoreEntries).toHaveLength(10);
    expect(tier1MajorCupEntries).toHaveLength(5);
    expect(tier2Entries).toHaveLength(42);

    for (const id of TIER1_LEAGUE_IDS) {
      expect(isTier1League(id)).toBe(true);
      const capability = getLeagueCapability(id);
      expect(capability?.uiVisibilityPolicy).toBe("always");
    }

    for (const entry of tier2Entries) {
      expect(isTier1League(entry.id)).toBe(false);
      expect(entry.uiVisibilityPolicy).toBe("only_when_healthy");
    }

    for (const invalidKey of ["liga-inexistente", "", "__proto__", "constructor", "toString"]) {
      expect(getLeagueCapability(invalidKey)).toBeUndefined();
      expect(isTier1League(invalidKey)).toBe(false);
    }
  });

  it("expone exactamente las 34 familias canónicas de mercado sin colisiones ni huecos", () => {
    expect(MARKET_FAMILY_COUNT).toBe(34);
    expect(MARKET_FAMILY_IDS).toHaveLength(34);
    expect(new Set(MARKET_FAMILY_IDS).size).toBe(34);

    expect(FOOTBALL_MARKET_FAMILY_IDS).toEqual([
      "1x2",
      "double_chance",
      "dnb",
      "btts",
      "totals",
      "team_totals",
      "half_time_result",
      "second_half_result",
      "combo_1x2_over",
      "combo_1x2_btts",
      "asian_handicap",
      "clean_sheet",
      "win_to_nil",
      "corners_total",
      "corners_team",
      "shots_total",
      "shots_on_target",
      "fouls_total",
      "cards_total",
      "player_props_football",
    ]);
    expect(NBA_MARKET_FAMILY_IDS).toEqual([
      "nba_moneyline",
      "nba_spread",
      "nba_totals",
      "nba_player_props",
    ]);
    expect(MLB_MARKET_FAMILY_IDS).toEqual([
      "mlb_moneyline",
      "mlb_run_line",
      "mlb_f5",
      "mlb_totals",
    ]);
    expect(NHL_MARKET_FAMILY_IDS).toEqual([
      "nhl_moneyline",
      "nhl_puck_line",
      "nhl_totals",
    ]);
    expect(NFL_MARKET_FAMILY_IDS).toEqual([
      "nfl_moneyline",
      "nfl_spread",
      "nfl_totals",
    ]);

    const footballSet = new Set<MarketFamilyId>(FOOTBALL_MARKET_FAMILY_IDS);
    const nbaSet = new Set<MarketFamilyId>(NBA_MARKET_FAMILY_IDS);
    const mlbSet = new Set<MarketFamilyId>(MLB_MARKET_FAMILY_IDS);
    const nhlSet = new Set<MarketFamilyId>(NHL_MARKET_FAMILY_IDS);
    const nflSet = new Set<MarketFamilyId>(NFL_MARKET_FAMILY_IDS);
    const allCoveredByTier1 = new Set<MarketFamilyId>();

    for (const entry of LEAGUE_CAPABILITY_LIST) {
      expect(entry.supportedMarketFamilies.length).toBeGreaterThan(0);
      expect(new Set(entry.supportedMarketFamilies).size).toBe(entry.supportedMarketFamilies.length);

      const expectedSportSet =
        entry.sport === "football"
          ? footballSet
          : entry.sport === "basketball"
            ? nbaSet
            : entry.sport === "baseball"
              ? mlbSet
              : entry.sport === "ice-hockey"
                ? nhlSet
                : nflSet;

      for (const family of entry.supportedMarketFamilies) {
        expect(expectedSportSet.has(family)).toBe(true);
        if (isTier1League(entry.id)) {
          allCoveredByTier1.add(family);
        }
      }

      if (!entry.hasPlayerProps) {
        expect(entry.supportedMarketFamilies).not.toContain("player_props_football");
        expect(entry.supportedMarketFamilies).not.toContain("nba_player_props");
      }
    }

    expect(allCoveredByTier1.size).toBe(34);
    expect(allCoveredByTier1).toEqual(new Set<MarketFamilyId>(MARKET_FAMILY_IDS));
  });

  it("modela reglas de formato por liga: Liga MX sin descenso con Liguilla, Top 5 con descenso y copas KO sin tabla", () => {
    const ligaMx = getLeagueCapability("liga-mx");
    expect(ligaMx.tier).toBe("tier1_core");
    expect(ligaMx.hasRelegationZones).toBe(false);
    expect(ligaMx.hasKnockoutBracket).toBe(true);
    expect(ligaMx.hasStandingsTable).toBe(true);
    expect(ligaMx.competitionFormat.hasRelegationZones).toBe(false);
    expect(ligaMx.competitionFormat.hasKnockoutBracket).toBe(true);
    expect(ligaMx.competitionFormat.standingsSplits).toEqual(["total", "home", "away"]);
    expect(ligaMx.bzzoiroId).toBe(19);
    expect(ligaMx.bzzoiroLeagueIds).toEqual([19, 20]);
    expect(ligaMx.providers.tacticalTelemetry).toBe(true);
    expect(ligaMx.providers.referees).toBe(true);
    expect(ligaMx.providers.playerLogs).toBe("bzzoiro_football");

    for (const euroLeague of ["premier-league", "laliga", "bundesliga", "serie-a", "ligue-1"] as const) {
      const capability = getLeagueCapability(euroLeague);
      expect(capability.tier).toBe("tier1_core");
      expect(capability.hasRelegationZones).toBe(true);
      expect(capability.hasKnockoutBracket).toBe(false);
      expect(capability.hasStandingsTable).toBe(true);
    }

    const nba = getLeagueCapability("nba");
    expect(nba.sport).toBe("basketball");
    expect(nba.providers.odds).toBe("bzzoiro");
    expect(nba.providers.playerLogs).toBe("bzzoiro_nba");
    expect(nba.hasPlayerProps).toBe(true);
    expect(nba.bzzoiroId).toBe(1);
    expect(nba.hasKnockoutBracket).toBe(true);
    expect(nba.hasRelegationZones).toBe(false);

    const nfl = getLeagueCapability("nfl");
    expect(nfl.sport).toBe("american-football");
    expect(nfl.providers.schedule).toBe("nflverse");
    expect(nfl.hasKnockoutBracket).toBe(true);
    expect(nfl.hasRelegationZones).toBe(false);

    const concacaf = getLeagueCapability("concacaf-champions");
    expect(concacaf.tier).toBe("tier1_major_cup");
    expect(concacaf.hasStandingsTable).toBe(false);
    expect(concacaf.hasKnockoutBracket).toBe(true);
    expect(concacaf.hasRelegationZones).toBe(false);
    expect(concacaf.competitionFormat.standingsSplits).toEqual([]);
    expect(concacaf.bzzoiroId).toBeNull();

    for (const entry of LEAGUE_CAPABILITY_LIST) {
      expect(entry.competitionFormat.hasStandingsTable).toBe(entry.hasStandingsTable);
      expect(entry.competitionFormat.hasKnockoutBracket).toBe(entry.hasKnockoutBracket);
      expect(entry.competitionFormat.hasRelegationZones).toBe(entry.hasRelegationZones);
      if (!entry.hasStandingsTable) {
        expect(entry.competitionFormat.standingsSplits).toEqual([]);
        expect(entry.hasRelegationZones).toBe(false);
      }
      expect(entry.minFreshnessHours).toBeGreaterThan(0);
    }
  });

  it("construye LIVE_CAPABLE_BZZOIRO_LEAGUES con las 41 ligas de fútbol en Bzzoiro sin mezclar NBA ni ESPN", () => {
    const liveKeys = Object.keys(LIVE_CAPABLE_BZZOIRO_LEAGUES);
    expect(liveKeys).toHaveLength(41);
    expect(LIVE_CAPABLE_BZZOIRO_LEAGUES["liga-mx"]).toEqual([19, 20]);
    expect(LIVE_CAPABLE_BZZOIRO_LEAGUES["premier-league"]).toEqual([1]);
    expect(LIVE_CAPABLE_BZZOIRO_LEAGUES["champions-league"]).toEqual([7]);
    expect(LIVE_CAPABLE_BZZOIRO_LEAGUES["mls"]).toEqual([18]);
    expect(LIVE_CAPABLE_BZZOIRO_LEAGUES["nba"]).toBeUndefined();
    expect(LIVE_CAPABLE_BZZOIRO_LEAGUES["la-liga"]).toBeUndefined();
    expect(LIVE_CAPABLE_BZZOIRO_LEAGUES["concacaf-champions"]).toBeUndefined();
    expect(LIVE_CAPABLE_BZZOIRO_LEAGUES["nfl"]).toBeUndefined();
    expect(LIVE_CAPABLE_BZZOIRO_LEAGUES["copa-del-mundo"]).toBeUndefined();

    for (const key of liveKeys) {
      const cap: LeagueCapabilityContract | undefined = getLeagueCapability(key);
      expect(cap?.sport).toBe("football");
      expect(cap?.hasLivePolling).toBe(true);
      expect(cap?.bzzoiroId).not.toBeNull();
    }
  });

  it("mantiene Tier 1 siempre visible y degrada limpiamente Tier 2 incompletas o vencidas en isLeagueHealthyForUi", () => {
    for (const id of TIER1_LEAGUE_IDS) {
      expect(isLeagueHealthyForUi(id)).toBe(true);
      expect(isLeagueHealthyForUi(id, null)).toBe(true);
      expect(
        isLeagueHealthyForUi(id, {
          hasValidSnapshot: false,
          gamesCount: 0,
          snapshotAgeHours: 999,
          hasError: true,
        }),
      ).toBe(true);
    }

    expect(
      isLeagueHealthyForUi("liga-fantasma", {
        hasValidSnapshot: true,
        gamesCount: 10,
        snapshotAgeHours: 1,
      }),
    ).toBe(false);

    expect(isLeagueHealthyForUi("eredivisie")).toBe(false);
    expect(isLeagueHealthyForUi("eredivisie", null)).toBe(false);
    expect(isLeagueHealthyForUi("eredivisie", {})).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        hasValidSnapshot: false,
        gamesCount: 9,
        snapshotAgeHours: 6,
      }),
    ).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        hasValidSnapshot: true,
        gamesCount: 0,
        snapshotAgeHours: 6,
      }),
    ).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        hasValidSnapshot: true,
        gamesCount: 9,
        snapshotAgeHours: 49,
      }),
    ).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        hasValidSnapshot: true,
        gamesCount: 9,
        snapshotAgeHours: null,
      }),
    ).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        hasValidSnapshot: true,
        gamesCount: 9,
        snapshotAgeHours: 6,
        hasError: true,
      }),
    ).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        hasValidSnapshot: true,
        gamesCount: 9,
        snapshotAgeHours: 6,
        hasStandings: false,
      }),
    ).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        hasValidSnapshot: true,
        gamesCount: 9,
        snapshotAgeHours: 6,
        hasFreshOdds: false,
      }),
    ).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        hasValidSnapshot: true,
        gamesCount: 9,
        snapshotAgeHours: 12,
      }),
    ).toBe(true);

    expect(
      isLeagueHealthyForUi("eredivisie", {
        cells: {
          calendario: { status: "ok", ageHours: 12, recordsCount: 9 },
          momios: { status: "pending_source", ageHours: null, recordsCount: 0 },
        },
      }),
    ).toBe(true);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        cells: {
          calendario: { status: "warning", ageHours: 40, recordsCount: 9 },
        },
      }),
    ).toBe(true);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        cells: {
          calendario: { status: "stale", ageHours: 52, recordsCount: 9 },
        },
      }),
    ).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        cells: {
          calendario: { status: "ok", ageHours: 12, recordsCount: 0 },
        },
      }),
    ).toBe(false);
    expect(
      isLeagueHealthyForUi("eredivisie", {
        cells: {
          calendario: { status: "ok", ageHours: 12, recordsCount: 9 },
          momios: { status: "error", ageHours: 12, recordsCount: 0 },
        },
      }),
    ).toBe(false);

    expect(
      isLeagueHealthyForUi("fa-cup", {
        hasValidSnapshot: true,
        gamesCount: 8,
        snapshotAgeHours: 10,
        hasStandings: false,
      }),
    ).toBe(true);

    expect(
      isLeagueHealthyForUi("copa-del-mundo", {
        hasValidSnapshot: true,
        gamesCount: 16,
        snapshotAgeHours: 60,
        hasFreshOdds: false,
      }),
    ).toBe(true);
    expect(
      isLeagueHealthyForUi("copa-del-mundo", {
        hasValidSnapshot: true,
        gamesCount: 16,
        snapshotAgeHours: 80,
      }),
    ).toBe(false);
  });
});
