import { describe, expect, it } from "vitest";
import {
  asLeagueId,
  asTeamId,
  type SquadPlayerEntry,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import type { PlatformGame } from "@pitchlab/ui/types";
import {
  buildEnrichedMatchLineups,
  buildMatchPlayerPicks,
} from "../src/server/match-enrichment";
import {
  buildNbaPropsBridgeFromPlayerGames,
  checkStrictPlayerMinutesAndAvailabilityGuardV6,
  evaluateGuardedUsPlayerPropsV6,
  normalizeUsEspnOverviewV6,
  normalizeUsPlayerGameLogRowV6,
} from "../src/server/player-live-stats";
import {
  CANONICAL_GK_SAVES_LINES_V6,
  CANONICAL_SHOT_LINES_V6,
  deriveMatchPlayerPropsV6,
  evaluateCoupledFootballShotsV6,
  evaluateFootballPropV6,
  evaluateGoalkeeperSavesSgpComboV6,
  evaluateGoalkeeperSavesV6,
  loadStructuredPlayerProps,
} from "../src/server/props-explorer";

function collectAllKeys(node: unknown, out: Set<string> = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) collectAllKeys(item, out);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      out.add(k);
      collectAllKeys(v, out);
    }
  }
  return out;
}

function makePlatformGame(overrides: Partial<PlatformGame> = {}): PlatformGame {
  return {
    id: "laliga-2026-v6-test",
    league: asLeagueId("laliga"),
    leagueLabel: "LaLiga",
    sport: "football",
    round: "Jornada 20",
    dayId: "2026-11-23",
    dayLabel: "Lun 23 nov",
    kickoffUtc: "2026-11-23T20:00:00Z",
    kickoffLocal: "14:00",
    venue: "Estadio Santiago Bernabéu",
    referee: "Jesús Gil Manzano",
    status: "NS",
    home: {
      slug: "real-madrid",
      name: "Real Madrid",
      shortName: "Real Madrid",
      code: "RMA",
      record: "14-3-2",
    },
    away: {
      slug: "fc-barcelona",
      name: "FC Barcelona",
      shortName: "Barcelona",
      code: "BAR",
      record: "13-4-2",
    },
    x12: [0.44, 0.27, 0.29],
    projection: { home: 1.75, away: 1.35, total: 3.1 },
    confidenceScore: 74,
    confidenceLevel: "alta",
    picks: [],
    preGame: {
      cortexSynthesis: "",
      tacticalKeys: [],
      lineupStatusLabel: "Por confirmar",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "Hoy",
    spacetime: null,
    ...overrides,
  };
}

function makeSquadPlayer(overrides: Partial<SquadPlayerEntry> = {}): SquadPlayerEntry {
  return {
    id: "10",
    slug: "kylian-mbappe",
    name: "Kylian Mbappé",
    shortName: "K. Mbappé",
    jersey: "9",
    positionGroup: "FWD",
    positionLabel: "Delantero centro",
    age: 27,
    birthDate: "1998-12-20",
    heightCm: 178,
    weightKg: 75,
    preferredFoot: "R",
    nationality: "Francia",
    nationalityCode: "FRA",
    photoKey: "pl-p:10",
    fallbackPhotoKey: null,
    availability: "available",
    injuryDetail: null,
    expectedReturn: null,
    stats: {
      appearances: 16,
      subIns: 1,
      goals: 12,
      assists: 4,
      shots: 56,
      shotsOnTarget: 26,
      foulsCommitted: 11,
      foulsSuffered: 24,
      yellowCards: 2,
      redCards: 0,
      offsides: 14,
      saves: 0,
      shotsFaced: 0,
      goalsConceded: 0,
    },
    recentGames: [
      {
        dateIso: "2026-11-18",
        opponent: "Sevilla",
        isHome: true,
        score: "3-1",
        result: "W",
        stats: [{ label: "MIN", value: "88" }, { label: "TIROS", value: "4" }],
      },
      {
        dateIso: "2026-11-12",
        opponent: "Valencia",
        isHome: false,
        score: "2-0",
        result: "W",
        stats: [{ label: "MIN", value: "84" }, { label: "TIROS", value: "3" }],
      },
      {
        dateIso: "2026-11-05",
        opponent: "Betis",
        isHome: true,
        score: "2-1",
        result: "W",
        stats: [{ label: "MIN", value: "90" }, { label: "TIROS", value: "5" }],
      },
    ],
    candidatePicks: [],
    ...overrides,
  };
}

describe("Spacetime v6.0 Props Engine · Lossless US normalization, Hard Block, Strict Minutes, Coupled Shots & GK SGP", () => {
  it("normalizes >5-column ESPN game logs losslessly across NBA, MLB (pitcher & batter), NHL, and NFL (QB/RB/WR/TE)", () => {
    const nbaOverview = normalizeUsEspnOverviewV6("nba", {
      statistics: {
        labels: ["GP", "MIN", "FG%", "3PT", "3P%", "FT%", "REB", "AST", "STL", "BLK", "PTS"],
        splits: [
          {
            displayName: "Regular Season",
            stats: ["20", "35.4", "49.1", "3.4-8.2", "41.5", "86.0", "8.2", "6.4", "1.3", "0.7", "28.6"],
          },
        ],
      },
      gameLog: {
        statistics: [
          {
            labels: ["MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"],
            events: [
              {
                eventId: "e1",
                stats: ["36:30", "11-21", "52.4", "4-9", "44.4", "6-7", "85.7", "9", "7", "1", "2", "2", "3", "32"],
              },
              {
                eventId: "e2",
                stats: ["34:00", "9-19", "47.4", "3-8", "37.5", "5-6", "83.3", "7", "6", "0", "1", "3", "2", "26"],
              },
              {
                eventId: "e3",
                stats: ["35:30", "10-20", "50.0", "5-10", "50.0", "4-4", "100", "8", "8", "1", "1", "2", "1", "29"],
              },
            ],
          },
        ],
        events: {
          e1: { gameDate: "2026-11-20T00:30:00Z", atVs: "vs", score: "120-112", gameResult: "W", opponent: { displayName: "Miami Heat", abbreviation: "MIA" } },
          e2: { gameDate: "2026-11-18T00:30:00Z", atVs: "@", score: "110-106", gameResult: "W", opponent: { displayName: "New York Knicks", abbreviation: "NYK" } },
          e3: { gameDate: "2026-11-16T00:30:00Z", atVs: "vs", score: "115-108", gameResult: "W", opponent: { displayName: "Orlando Magic", abbreviation: "ORL" } },
        },
      },
    });
    const nbaGame0Labels = nbaOverview.recentGames[0]?.stats.map((s) => s.label) ?? [];
    expect(nbaGame0Labels).toEqual(expect.arrayContaining(["MIN", "PTS", "REB", "AST", "3PM"]));
    expect(nbaOverview.recentGames[0]?.stats.find((s) => s.label === "PTS")?.value).toBe("32");
    expect(nbaOverview.recentGames[0]?.stats.find((s) => s.label === "3PM")?.value).toBe("4");

    const nbaProps = evaluateGuardedUsPlayerPropsV6({
      sport: "nba",
      playerName: "Jayson Tatum",
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      positionLabel: "SF",
      seasonMetrics: nbaOverview.seasonMetrics,
      recentGames: nbaOverview.recentGames,
    });
    expect(nbaProps.map((p) => p.metric).sort()).toEqual(["3PM", "AST", "PTS", "REB"]);
    expect(nbaProps.every((p) => p.pOver > 0.001 && p.pOver < 0.999 && p.fairOverDecimal > 1)).toBe(true);

    const mlbPitcherOverview = normalizeUsEspnOverviewV6("mlb", {
      statistics: {
        labels: ["GP", "W", "L", "ERA", "WHIP", "IP", "H", "ER", "BB", "SO"],
        splits: [{ displayName: "Regular Season", stats: ["14", "9", "2", "2.65", "1.02", "86.2", "68", "26", "21", "104"] }],
      },
      gameLog: {
        statistics: [
          {
            labels: ["GS", "CG", "SHO", "PC", "IP", "H", "R", "ER", "BB", "SO", "HR"],
            events: [
              { eventId: "p1", stats: ["1", "0", "0", "98", "6.2", "5", "2", "2", "1", "8", "1"] },
              { eventId: "p2", stats: ["1", "0", "0", "94", "6.0", "4", "1", "1", "2", "7", "0"] },
              { eventId: "p3", stats: ["1", "0", "0", "102", "7.0", "5", "2", "2", "1", "9", "1"] },
            ],
          },
        ],
        events: {
          p1: { gameDate: "2026-08-20T01:00:00Z", atVs: "vs", score: "5-2", gameResult: "W", opponent: { displayName: "San Diego Padres", abbreviation: "SD" } },
          p2: { gameDate: "2026-08-14T01:00:00Z", atVs: "@", score: "4-1", gameResult: "W", opponent: { displayName: "San Francisco Giants", abbreviation: "SF" } },
          p3: { gameDate: "2026-08-08T01:00:00Z", atVs: "vs", score: "6-2", gameResult: "W", opponent: { displayName: "Arizona Diamondbacks", abbreviation: "ARI" } },
        },
      },
    });
    const pitcherLabels = mlbPitcherOverview.recentGames[0]?.stats.map((s) => s.label) ?? [];
    expect(pitcherLabels).toEqual(expect.arrayContaining(["IP", "SO", "H", "ER", "BB"]));
    expect(mlbPitcherOverview.recentGames[0]?.stats.find((s) => s.label === "SO")?.value).toBe("8");
    const pitcherProps = evaluateGuardedUsPlayerPropsV6({
      sport: "mlb",
      playerName: "Yoshinobu Yamamoto",
      teamSlug: "los-angeles-dodgers",
      teamName: "Los Angeles Dodgers",
      positionLabel: "SP",
      seasonMetrics: mlbPitcherOverview.seasonMetrics,
      recentGames: mlbPitcherOverview.recentGames,
    });
    expect(pitcherProps.map((p) => p.metric).sort()).toEqual(["BB", "ER", "H", "IP", "SO"]);

    const mlbBatterOverview = normalizeUsEspnOverviewV6("mlb", {
      statistics: {
        labels: ["GP", "AB", "R", "H", "2B", "3B", "HR", "RBI", "BB", "SO", "TB", "AVG"],
        splits: [{ displayName: "Regular Season", stats: ["40", "156", "34", "49", "11", "2", "13", "36", "24", "38", "103", ".314"] }],
      },
      gameLog: {
        statistics: [
          {
            labels: ["AB", "R", "H", "2B", "3B", "HR", "RBI", "BB", "SO", "TB"],
            events: [
              { eventId: "b1", stats: ["4", "2", "2", "1", "0", "1", "3", "1", "1", "6"] },
              { eventId: "b2", stats: ["4", "1", "1", "0", "0", "0", "1", "1", "1", "1"] },
              { eventId: "b3", stats: ["5", "1", "2", "1", "0", "0", "2", "0", "2", "3"] },
            ],
          },
        ],
        events: {
          b1: { gameDate: "2026-08-20T01:00:00Z", atVs: "vs", score: "7-3", gameResult: "W", opponent: { displayName: "San Diego Padres", abbreviation: "SD" } },
          b2: { gameDate: "2026-08-19T01:00:00Z", atVs: "vs", score: "4-2", gameResult: "W", opponent: { displayName: "San Diego Padres", abbreviation: "SD" } },
          b3: { gameDate: "2026-08-18T01:00:00Z", atVs: "vs", score: "5-4", gameResult: "W", opponent: { displayName: "San Diego Padres", abbreviation: "SD" } },
        },
      },
    });
    const batterLabels = mlbBatterOverview.recentGames[0]?.stats.map((s) => s.label) ?? [];
    expect(batterLabels).toEqual(expect.arrayContaining(["H", "HR", "TB", "RBI", "BB", "SO"]));
    const batterProps = evaluateGuardedUsPlayerPropsV6({
      sport: "mlb",
      playerName: "Shohei Ohtani",
      teamSlug: "los-angeles-dodgers",
      teamName: "Los Angeles Dodgers",
      positionLabel: "DH",
      seasonMetrics: mlbBatterOverview.seasonMetrics,
      recentGames: mlbBatterOverview.recentGames,
    });
    expect(batterProps.map((p) => p.metric).sort()).toEqual(["BB", "H", "HR", "RBI", "SO", "TB"]);

    const nhlOverview = normalizeUsEspnOverviewV6("nhl", {
      statistics: {
        labels: ["GP", "G", "A", "PTS", "+/-", "PIM", "SOG", "TOI"],
        splits: [{ displayName: "Regular Season", stats: ["22", "12", "18", "30", "11", "8", "79", "21:15"] }],
      },
      gameLog: {
        statistics: [
          {
            labels: ["G", "A", "PTS", "+/-", "PIM", "PPG", "SHG", "SOG", "TOI"],
            events: [
              { eventId: "h1", stats: ["1", "2", "3", "2", "0", "1", "0", "5", "22:10"] },
              { eventId: "h2", stats: ["0", "1", "1", "1", "2", "0", "0", "4", "20:45"] },
              { eventId: "h3", stats: ["1", "0", "1", "0", "0", "0", "0", "3", "21:00"] },
            ],
          },
        ],
        events: {
          h1: { gameDate: "2026-11-20T01:00:00Z", atVs: "vs", score: "4-2", gameResult: "W", opponent: { displayName: "Toronto Maple Leafs", abbreviation: "TOR" } },
          h2: { gameDate: "2026-11-18T01:00:00Z", atVs: "@", score: "3-2", gameResult: "W", opponent: { displayName: "Boston Bruins", abbreviation: "BOS" } },
          h3: { gameDate: "2026-11-16T01:00:00Z", atVs: "vs", score: "2-1", gameResult: "W", opponent: { displayName: "Montreal Canadiens", abbreviation: "MTL" } },
        },
      },
    });
    const nhlLabels = nhlOverview.recentGames[0]?.stats.map((s) => s.label) ?? [];
    expect(nhlLabels).toEqual(expect.arrayContaining(["SOG", "G", "A", "PTS", "TOI"]));
    const nhlProps = evaluateGuardedUsPlayerPropsV6({
      sport: "nhl",
      playerName: "Connor McDavid",
      teamSlug: "edmonton-oilers",
      teamName: "Edmonton Oilers",
      positionLabel: "C",
      seasonMetrics: nhlOverview.seasonMetrics,
      recentGames: nhlOverview.recentGames,
    });
    expect(nhlProps.map((p) => p.metric).sort()).toEqual(["A", "G", "PTS", "SOG"]);

    const nflQbOverview = normalizeUsEspnOverviewV6("nfl", {
      statistics: {
        labels: ["GP", "CMP", "ATT", "CMP%", "YDS", "AVG", "TD", "INT"],
        splits: [{ displayName: "Regular Season", stats: ["10", "232", "341", "68.0", "2740", "8.0", "22", "6"] }],
      },
      gameLog: {
        statistics: [
          {
            labels: ["C/ATT", "CMP%", "AVG", "LNG", "INT", "SACK", "YDS", "TD"],
            events: [
              { eventId: "q1", stats: ["25-35", "71.4", "8.4", "44", "0", "1", "294", "3"] },
              { eventId: "q2", stats: ["22-33", "66.7", "7.8", "39", "1", "2", "258", "2"] },
            ],
          },
        ],
        events: {
          q1: { gameDate: "2026-11-17T18:00:00Z", atVs: "vs", score: "31-20", gameResult: "W", opponent: { displayName: "Buffalo Bills", abbreviation: "BUF" } },
          q2: { gameDate: "2026-11-10T18:00:00Z", atVs: "@", score: "27-24", gameResult: "W", opponent: { displayName: "Denver Broncos", abbreviation: "DEN" } },
        },
      },
    });
    expect(nflQbOverview.recentGames[0]?.stats.map((s) => s.label)).toEqual(
      expect.arrayContaining(["CMP", "ATT", "YDS", "TD"]),
    );
    const qbProps = evaluateGuardedUsPlayerPropsV6({
      sport: "nfl",
      playerName: "Patrick Mahomes",
      teamSlug: "kansas-city-chiefs",
      teamName: "Kansas City Chiefs",
      positionLabel: "QB",
      seasonMetrics: nflQbOverview.seasonMetrics,
      recentGames: nflQbOverview.recentGames,
    });
    expect(qbProps.map((p) => p.metric).sort()).toEqual(["ATT", "CMP", "TD", "YDS"]);

    const nflRbProps = evaluateGuardedUsPlayerPropsV6({
      sport: "nfl",
      playerName: "Saquon Barkley",
      teamSlug: "philadelphia-eagles",
      teamName: "Philadelphia Eagles",
      positionLabel: "RB",
      seasonMetrics: [
        { key: "gp", value: "10" },
        { key: "car", value: "190" },
        { key: "yds", value: "1040" },
        { key: "rec", value: "26" },
        { key: "td", value: "9" },
      ],
      recentGames: [
        { stats: [{ label: "CAR", value: "21" }, { label: "YDS", value: "118" }, { label: "REC", value: "3" }, { label: "TD", value: "1" }] },
      ],
    });
    expect(nflRbProps.map((p) => p.metric).sort()).toEqual(["CAR", "REC", "TD", "YDS"]);

    const nflWrOverview = normalizeUsEspnOverviewV6("nfl", {
      statistics: {
        labels: ["GP", "REC", "TGTS", "YDS", "AVG", "TD", "LNG"],
        splits: [{ displayName: "Regular Season", stats: ["10", "68", "96", "940", "13.8", "8", "62"] }],
      },
      gameLog: {
        statistics: [
          {
            labels: ["AVG", "LNG", "FUM", "LST", "REC", "TGTS", "YDS", "TD"],
            events: [
              { eventId: "w1", stats: ["14.5", "42", "0", "0", "7", "10", "102", "1"] },
            ],
          },
        ],
        events: {
          w1: { gameDate: "2026-11-17T18:00:00Z", atVs: "vs", score: "28-21", gameResult: "W", opponent: { displayName: "Dallas Cowboys", abbreviation: "DAL" } },
        },
      },
    });
    expect(nflWrOverview.recentGames[0]?.stats.map((s) => s.label)).toEqual(
      expect.arrayContaining(["REC", "TGTS", "YDS", "TD"]),
    );
    const wrProps = evaluateGuardedUsPlayerPropsV6({
      sport: "nfl",
      playerName: "Justin Jefferson",
      teamSlug: "minnesota-vikings",
      teamName: "Minnesota Vikings",
      positionLabel: "WR",
      seasonMetrics: nflWrOverview.seasonMetrics,
      recentGames: nflWrOverview.recentGames,
    });
    expect(wrProps.map((p) => p.metric).sort()).toEqual(["REC", "TD", "TGTS", "YDS"]);

    const teProps = evaluateGuardedUsPlayerPropsV6({
      sport: "nfl",
      playerName: "Travis Kelce",
      teamSlug: "kansas-city-chiefs",
      teamName: "Kansas City Chiefs",
      positionLabel: "TE",
      seasonMetrics: [
        { key: "gp", value: "10" },
        { key: "rec", value: "61" },
        { key: "tgts", value: "82" },
        { key: "yds", value: "640" },
        { key: "td", value: "5" },
      ],
      recentGames: [
        { stats: [{ label: "REC", value: "6" }, { label: "TGTS", value: "8" }, { label: "YDS", value: "72" }, { label: "TD", value: "1" }] },
      ],
    });
    expect(teProps.map((p) => p.metric).sort()).toEqual(["REC", "TD", "TGTS", "YDS"]);
  });

  it("enforces hard availability block (0 picks) for out, Baja, injured, IR, and IL-* across all 5 sports", () => {
    const blockedTokens = ["out", "Baja", "injured", "lesionado", "suspended", "IR", "IL-10", "IL-15", "IL-60"];

    for (const token of blockedTokens) {
      expect(
        evaluateGuardedUsPlayerPropsV6({
          sport: "nba",
          playerName: "Luka Doncic",
          teamSlug: "dallas-mavericks",
          teamName: "Dallas Mavericks",
          positionLabel: "G",
          availability: token,
          seasonMetrics: [{ key: "gp", value: "15" }, { key: "min", value: "36.5" }, { key: "pts", value: "31.2" }],
          recentGames: [{ stats: [{ label: "MIN", value: "37" }, { label: "PTS", value: "34" }] }],
        }),
      ).toEqual([]);

      expect(
        evaluateGuardedUsPlayerPropsV6({
          sport: "mlb",
          playerName: "Gerrit Cole",
          teamSlug: "new-york-yankees",
          teamName: "New York Yankees",
          positionLabel: "SP",
          injuryStatus: token,
          seasonMetrics: [{ key: "gp", value: "12" }, { key: "so", value: "84" }, { key: "ip", value: "72.1" }],
          recentGames: [{ stats: [{ label: "SO", value: "7" }, { label: "IP", value: "6.0" }] }],
        }),
      ).toEqual([]);

      expect(
        evaluateGuardedUsPlayerPropsV6({
          sport: "nhl",
          playerName: "Auston Matthews",
          teamSlug: "toronto-maple-leafs",
          teamName: "Toronto Maple Leafs",
          positionLabel: "C",
          injuryStatus: token,
          seasonMetrics: [{ key: "gp", value: "18" }, { key: "sog", value: "72" }, { key: "g", value: "14" }],
          recentGames: [{ stats: [{ label: "SOG", value: "4" }, { label: "G", value: "1" }] }],
        }),
      ).toEqual([]);

      expect(
        evaluateGuardedUsPlayerPropsV6({
          sport: "nfl",
          playerName: "Ja'Marr Chase",
          teamSlug: "cincinnati-bengals",
          teamName: "Cincinnati Bengals",
          positionLabel: "WR",
          availability: token,
          seasonMetrics: [{ key: "gp", value: "10" }, { key: "rec", value: "70" }, { key: "yds", value: "1020" }],
          recentGames: [{ stats: [{ label: "REC", value: "7" }, { label: "YDS", value: "110" }] }],
        }),
      ).toEqual([]);

      const blockedShots = evaluateCoupledFootballShotsV6({
        metric: "shots",
        playerName: "Vinícius Júnior",
        positionGroup: "FWD",
        positionLabel: "Extremo izquierdo",
        seasonCount: 44,
        appearances: 14,
        subIns: 1,
        avgMinutes: 84,
        teamProjectedGoals: 1.9,
        availability: token,
        allowFull: true,
      });
      expect(blockedShots.eligible).toBe(false);
      expect(blockedShots.blockedByInjury).toBe(true);
      expect(blockedShots.lines).toEqual([]);

      const blockedGk = evaluateGoalkeeperSavesV6({
        playerName: "Thibaut Courtois",
        saves: 42,
        shotsFaced: 56,
        goalsConceded: 14,
        appearances: 14,
        subIns: 0,
        avgMinutes: 90,
        oppExpectedSoT: 4.5,
        injuryStatus: token,
        allowFull: true,
      });
      expect(blockedGk.eligible).toBe(false);
      expect(blockedGk.blockedByInjury).toBe(true);
      expect(blockedGk.lines).toEqual([]);

      const blockedSgp = evaluateGoalkeeperSavesSgpComboV6({
        playerName: "Thibaut Courtois",
        savesLine: 2.5,
        matchOutcome: "clean_sheet",
        saves: 42,
        shotsFaced: 56,
        goalsConceded: 14,
        appearances: 14,
        subIns: 0,
        avgMinutes: 90,
        teamExpectedGoals: 1.7,
        opponentExpectedGoals: 0.9,
        availability: token,
        allowFull: true,
      });
      expect(blockedSgp.eligible).toBe(false);
      expect(blockedSgp.blockedByInjury).toBe(true);
    }

    expect(
      buildNbaPropsBridgeFromPlayerGames({
        player: "Stephen Curry",
        teamSlug: "golden-state-warriors",
        teamName: "Golden State Warriors",
        availability: "out",
        games: [
          { game_date: "2026-11-18T01:00:00Z", minutes: "34:00", points: 28, rebounds: 5, assists: 6, three_pointers_made: 5 },
          { game_date: "2026-11-16T01:00:00Z", minutes: "33:00", points: 26, rebounds: 4, assists: 7, three_pointers_made: 4 },
          { game_date: "2026-11-14T01:00:00Z", minutes: "35:00", points: 31, rebounds: 6, assists: 5, three_pointers_made: 6 },
        ],
      }),
    ).toEqual([]);
  });

  it("strictly rejects null and below-threshold minutes in NBA (>= 18) and football (>= 45)", () => {
    const nbaNullGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
      sport: "nba",
      avgMinutes: null,
    });
    expect(nbaNullGuard.eligible).toBe(false);
    expect(nbaNullGuard.blockedByMinutesGuard).toBe(true);
    expect(nbaNullGuard.minRequiredMinutes).toBe(18);

    const basketballNullGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
      sport: "basketball",
      avgMinutes: undefined,
    });
    expect(basketballNullGuard.eligible).toBe(false);
    expect(basketballNullGuard.blockedByMinutesGuard).toBe(true);
    expect(basketballNullGuard.minRequiredMinutes).toBe(18);

    const footballNullGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
      sport: "football",
      avgMinutes: null,
    });
    expect(footballNullGuard.eligible).toBe(false);
    expect(footballNullGuard.blockedByMinutesGuard).toBe(true);
    expect(footballNullGuard.minRequiredMinutes).toBe(45);

    const nbaLogNoMin = normalizeUsPlayerGameLogRowV6({
      sport: "nba",
      columns: [
        { label: "PTS", value: "24" },
        { label: "REB", value: "7" },
        { label: "AST", value: "5" },
      ],
      enforceMinutesGuard: true,
    });
    expect(nbaLogNoMin.eligibleForProjection).toBe(false);
    expect(nbaLogNoMin.blockedByMinutesGuard).toBe(true);

    expect(
      evaluateGuardedUsPlayerPropsV6({
        sport: "nba",
        playerName: "Jugador Sin Minutos",
        teamSlug: "boston-celtics",
        teamName: "Boston Celtics",
        positionLabel: "G",
        seasonMetrics: [{ key: "gp", value: "10" }, { key: "pts", value: "21.0" }],
        recentGames: [{ stats: [{ label: "PTS", value: "22" }, { label: "REB", value: "5" }] }],
      }),
    ).toEqual([]);

    expect(
      evaluateGuardedUsPlayerPropsV6({
        sport: "nba",
        playerName: "Suplente 14 Min",
        teamSlug: "boston-celtics",
        teamName: "Boston Celtics",
        positionLabel: "G",
        seasonMetrics: [{ key: "gp", value: "10" }, { key: "min", value: "14.2" }, { key: "pts", value: "9.5" }],
        recentGames: [{ stats: [{ label: "MIN", value: "14" }, { label: "PTS", value: "10" }] }],
      }),
    ).toEqual([]);

    const shotsNullMin = evaluateCoupledFootballShotsV6({
      metric: "shots_on_target",
      playerName: "Kylian Mbappé",
      positionGroup: "FWD",
      seasonCount: 24,
      appearances: 15,
      subIns: 1,
      avgMinutes: null,
      allowFull: true,
    });
    expect(shotsNullMin.eligible).toBe(false);
    expect(shotsNullMin.blockedByMinutesGuard).toBe(true);
    expect(shotsNullMin.lines).toEqual([]);

    const gkNullMin = evaluateGoalkeeperSavesV6({
      playerName: "Thibaut Courtois",
      saves: 40,
      shotsFaced: 52,
      goalsConceded: 12,
      appearances: 14,
      subIns: 0,
      avgMinutes: null,
      allowFull: true,
    });
    expect(gkNullMin.eligible).toBe(false);
    expect(gkNullMin.blockedByMinutesGuard).toBe(true);
    expect(gkNullMin.lines).toEqual([]);

    const game = makePlatformGame();
    const squadWithoutMinutes: TeamSquadEntry = {
      teamId: asTeamId("laliga.real-madrid"),
      teamSlug: "real-madrid",
      teamName: "Real Madrid",
      coachName: "Carlo Ancelotti",
      updatedAt: "2026-11-23T10:00:00Z",
      players: [
        makeSquadPlayer({
          recentGames: [],
          seasonMetrics: [],
          candidatePicks: [
            {
              id: "mbappe-sot-05",
              marketKey: "player_sot",
              marketLabel: "Tiros a puerta",
              selectionLabel: "Más de 0.5 tiros a puerta",
              line: 0.5,
              projectionMean: 1.5,
              projectionSd: 0.9,
              p: 0.65,
              fairDecimal: 1.54,
              fairAmerican: -185,
              rationale: "26 tiros a puerta en 16 PJ.",
            },
          ],
        }),
      ],
    };
    const picksWithoutMin = buildMatchPlayerPicks({
      game,
      allowFull: true,
      catalog: null,
      homeSquad: squadWithoutMinutes,
      awaySquad: null,
      sanitizePhotoKey: (raw) => raw ?? null,
    });
    expect(picksWithoutMin).toEqual([]);
  });

  it("enforces coupled shots/shots_on_target 0.5+..3.5+ monotonicity, volume coupling, Anti-EV, and v5 routing for goals/cards", () => {
    for (const metric of ["shots", "shots_on_target"] as const) {
      const highVolume = evaluateCoupledFootballShotsV6({
        metric,
        playerName: "Kylian Mbappé",
        positionGroup: "FWD",
        positionLabel: "Delantero centro",
        seasonCount: metric === "shots" ? 58 : 28,
        seasonShotsTotal: 58,
        appearances: 16,
        subIns: 1,
        avgMinutes: 85,
        teamExpectedShots: 18.5,
        teamExpectedSoT: 6.8,
        lineupStatus: "confirmed",
        allowFull: true,
        marketQuotesByLine: {
          0.5: { overDecimal: 1.45, bookLabel: "Betfair" },
          1.5: { overDecimal: 2.05, bookLabel: "Pinnacle" },
          2.5: { overDecimal: 25.0, bookLabel: "Pinnacle" },
          3.5: { overDecimal: 120.0, bookLabel: "Bet365" },
        },
      });
      const lowVolume = evaluateCoupledFootballShotsV6({
        metric,
        playerName: "Kylian Mbappé",
        positionGroup: "FWD",
        positionLabel: "Delantero centro",
        seasonCount: metric === "shots" ? 58 : 28,
        seasonShotsTotal: 58,
        appearances: 16,
        subIns: 1,
        avgMinutes: 85,
        teamExpectedShots: 8.0,
        teamExpectedSoT: 2.5,
        lineupStatus: "confirmed",
        allowFull: true,
      });

      expect(highVolume.eligible).toBe(true);
      expect(highVolume.lines.map((l) => l.line)).toEqual([...CANONICAL_SHOT_LINES_V6]);
      expect(highVolume.muProjected).toBeGreaterThan(lowVolume.muProjected ?? 0);

      for (let i = 0; i < highVolume.lines.length; i += 1) {
        const cur = highVolume.lines[i]!;
        expect(cur.pOver).not.toBeNull();
        expect(cur.pOverSubCover).not.toBeNull();
        expect(cur.fairOverDecimal).not.toBeNull();
        expect(cur.pOverSubCover!).toBeGreaterThanOrEqual(cur.pOver!);
        expect(cur.selectionLabel).toContain(metric === "shots" ? "tiros" : "tiros a puerta");
        if (i > 0) {
          const prev = highVolume.lines[i - 1]!;
          expect(prev.pOver!).toBeGreaterThanOrEqual(cur.pOver!);
          expect(prev.pOverSubCover!).toBeGreaterThanOrEqual(cur.pOverSubCover!);
        }
      }

      const betfairLine = highVolume.lines.find((l) => l.line === 0.5)!;
      expect(betfairLine.marketBookLabel).toBeNull();
      expect(betfairLine.marketOverDecimal).toBeNull();
      expect(betfairLine.evPct).toBeNull();

      const pinnacleLine15 = highVolume.lines.find((l) => l.line === 1.5)!;
      expect(pinnacleLine15.marketBookLabel).toBe("Pinnacle");
      expect(pinnacleLine15.hasVerifiedMarketQuote).toBe(true);

      const inflatedSharpLine = highVolume.lines.find((l) => l.line === 2.5)!;
      expect(inflatedSharpLine.marketBookLabel).toBe("Pinnacle");
      expect(inflatedSharpLine.evPct).toBeNull();

      const inflatedSoftLine = highVolume.lines.find((l) => l.line === 3.5)!;
      expect(inflatedSoftLine.marketBookLabel).toBe("Bet365");
      expect(inflatedSoftLine.evPct).toBeNull();
    }

    const shotsRoute = evaluateFootballPropV6({
      playerName: "Kylian Mbappé",
      statLabel: "Tiros totales",
      line: 2.5,
      projectionMean: 3.4,
      projectionSd: 1.5,
      league: "laliga",
      positionGroup: "FWD",
      positionLabel: "Delantero centro",
      avgMinutes: 85,
      sampleGames: 16,
      allowFull: true,
    });
    expect(shotsRoute.source).toBe("spacetime_coupled_shots_v6");

    const goalsRoute = evaluateFootballPropV6({
      playerName: "Kylian Mbappé",
      statLabel: "Anotador",
      line: 0.5,
      projectionMean: 0.72,
      projectionSd: 0.6,
      league: "laliga",
      positionGroup: "FWD",
      positionLabel: "Delantero centro",
      avgMinutes: 85,
      sampleGames: 16,
      allowFull: true,
    });
    expect(goalsRoute.source).toBe("spacetime_hierarchical_v5");
  });

  it("projects goalkeeper player_saves 1.5+..4.5+, evaluates clean_sheet SGP, and enforces Cero-Fuga visitor redaction", () => {
    const gkMember = evaluateGoalkeeperSavesV6({
      playerName: "Thibaut Courtois",
      saves: 48,
      shotsFaced: 62,
      goalsConceded: 14,
      appearances: 16,
      subIns: 0,
      avgMinutes: 90,
      oppExpectedSoT: 4.8,
      allowFull: true,
      marketQuotesByLine: {
        2.5: { overDecimal: 1.85, bookLabel: "Bet365" },
      },
    });
    expect(gkMember.eligible).toBe(true);
    expect(gkMember.isRedacted).toBe(false);
    expect(gkMember.lines.map((l) => l.line)).toEqual([...CANONICAL_GK_SAVES_LINES_V6]);
    expect(gkMember.expectedSaves).toBeGreaterThan(1.5);
    for (let i = 0; i < gkMember.lines.length; i += 1) {
      const cur = gkMember.lines[i]!;
      expect(cur.selectionLabel).toContain("atajadas");
      expect(cur.pOver).not.toBeNull();
      expect(cur.fairOverDecimal).not.toBeNull();
      if (i > 0) {
        expect(gkMember.lines[i - 1]!.pOver!).toBeGreaterThanOrEqual(cur.pOver!);
      }
    }

    const sgpCleanSheet = evaluateGoalkeeperSavesSgpComboV6({
      playerName: "Thibaut Courtois",
      savesLine: 2.5,
      matchOutcome: "clean_sheet",
      saves: 48,
      shotsFaced: 62,
      goalsConceded: 14,
      appearances: 16,
      subIns: 0,
      avgMinutes: 90,
      oppExpectedSoT: 4.4,
      teamExpectedGoals: 1.75,
      opponentExpectedGoals: 0.95,
      offeredCombinedDecimalOdds: 4.2,
      offeredBookLabel: "Bet365",
      allowFull: true,
    });
    expect(sgpCleanSheet.eligible).toBe(true);
    expect(sgpCleanSheet.isRedacted).toBe(false);
    expect(sgpCleanSheet.comboLabelEs).toContain("atajadas");
    expect(sgpCleanSheet.comboLabelEs).toContain("Portería a cero");
    expect(sgpCleanSheet.jointProbability).not.toBeNull();
    expect(sgpCleanSheet.probabilityLowerBound).not.toBeNull();
    expect(sgpCleanSheet.probabilityUpperBound).not.toBeNull();
    expect(sgpCleanSheet.jointProbability!).toBeGreaterThanOrEqual(
      sgpCleanSheet.probabilityLowerBound! - 1e-12,
    );
    expect(sgpCleanSheet.jointProbability!).toBeLessThanOrEqual(
      sgpCleanSheet.probabilityUpperBound! + 1e-12,
    );
    expect(sgpCleanSheet.fairCombinedDecimal).toBeGreaterThan(1);
    expect(sgpCleanSheet.bookQuoteAudit).not.toBeNull();

    const gkVisitor = evaluateGoalkeeperSavesV6({
      playerName: "Thibaut Courtois",
      saves: 48,
      shotsFaced: 62,
      goalsConceded: 14,
      appearances: 16,
      subIns: 0,
      avgMinutes: 90,
      oppExpectedSoT: 4.8,
      allowFull: false,
      marketQuotesByLine: {
        2.5: { overDecimal: 1.85, bookLabel: "Bet365" },
      },
    });
    expect(gkVisitor.isRedacted).toBe(true);
    expect(gkVisitor.expectedSaves).toBeNull();
    expect(gkVisitor.ebSaveRate).toBeNull();
    for (const ln of gkVisitor.lines) {
      expect(ln.isRedacted).toBe(true);
      expect(ln.pOver).toBeNull();
      expect(ln.pUnder).toBeNull();
      expect(ln.fairOverDecimal).toBeNull();
      expect(ln.fairUnderDecimal).toBeNull();
      expect(ln.marketOverDecimal).toBeNull();
      expect(ln.evPct).toBeNull();
    }

    const sgpVisitor = evaluateGoalkeeperSavesSgpComboV6({
      playerName: "Thibaut Courtois",
      savesLine: 2.5,
      matchOutcome: "clean_sheet",
      saves: 48,
      shotsFaced: 62,
      goalsConceded: 14,
      appearances: 16,
      subIns: 0,
      avgMinutes: 90,
      teamExpectedGoals: 1.75,
      opponentExpectedGoals: 0.95,
      offeredCombinedDecimalOdds: 4.2,
      offeredBookLabel: "Bet365",
      allowFull: false,
    });
    expect(sgpVisitor.isRedacted).toBe(true);
    expect(sgpVisitor.jointProbability).toBeNull();
    expect(sgpVisitor.pSavesOverMarginal).toBeNull();
    expect(sgpVisitor.pMatchOutcomeMarginal).toBeNull();
    expect(sgpVisitor.fairCombinedDecimal).toBeNull();
    expect(sgpVisitor.offeredCombinedDecimal).toBeNull();
    expect(sgpVisitor.evPct).toBeNull();
    expect(sgpVisitor.bookQuoteAudit).toBeNull();

    const shotsVisitor = evaluateCoupledFootballShotsV6({
      metric: "shots",
      playerName: "Kylian Mbappé",
      positionGroup: "FWD",
      seasonCount: 56,
      appearances: 16,
      subIns: 1,
      avgMinutes: 85,
      allowFull: false,
    });
    expect(shotsVisitor.isRedacted).toBe(true);
    expect(shotsVisitor.muProjected).toBeNull();
    expect(shotsVisitor.lines.every((l) => l.pOver === null && l.fairOverDecimal === null && l.evPct === null)).toBe(
      true,
    );

    const allVisitorKeys = collectAllKeys({ gkVisitor, sgpVisitor, shotsVisitor });
    expect(allVisitorKeys.has("stake")).toBe(false);
    expect(allVisitorKeys.has("kelly")).toBe(false);
    expect(allVisitorKeys.has("kellyFraction")).toBe(false);
    expect(allVisitorKeys.has("expectedEdge")).toBe(false);
    expect(JSON.stringify({ gkMember, sgpCleanSheet, gkVisitor, sgpVisitor })).not.toMatch(
      /Fr[eé]chet-Hoeffding|Armador Inteligente Geodesic|Beta\(\d+,\d+\)/i,
    );
    expect(loadStructuredPlayerProps({ fullAccess: false })).toEqual([]);
  });

  it("wires v6.0 lossless US props and football coupled shots/saves into match-enrichment while keeping lineups null outside football", () => {
    const nbaGame = makePlatformGame({
      id: "nba-2026-bos-mia",
      league: asLeagueId("nba"),
      leagueLabel: "NBA",
      sport: "basketball",
      home: { slug: "boston-celtics", name: "Boston Celtics", shortName: "Boston", code: "BOS", record: "14-4" },
      away: { slug: "miami-heat", name: "Miami Heat", shortName: "Miami", code: "MIA", record: "10-8" },
      projection: { home: 116.4, away: 109.1, total: 225.5 },
      preGame: {
        cortexSynthesis: "",
        tacticalKeys: [],
        lineupStatusLabel: "Por confirmar",
        lineupsConfirmed60m: false,
        absences: [
          {
            teamSide: "home",
            player: "Kristaps Porzingis",
            role: "C",
            status: "Baja",
            impactNote: "Lesión de pierna",
          },
        ],
        moneyFlow: null,
      },
    });

    const nbaHomeSquad: TeamSquadEntry = {
      teamId: asTeamId("nba.boston-celtics"),
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      coachName: "Joe Mazzulla",
      updatedAt: "2026-11-23T10:00:00Z",
      players: [
        makeSquadPlayer({
          id: "0",
          slug: "jayson-tatum",
          name: "Jayson Tatum",
          shortName: "J. Tatum",
          positionGroup: "FWD",
          positionLabel: "SF",
          seasonMetrics: [
            { key: "gp", label: "JJ", value: "16" },
            { key: "min", label: "MIN", value: "35.2" },
            { key: "pts", label: "PTS", value: "28.4" },
            { key: "reb", label: "REB", value: "8.2" },
            { key: "ast", label: "AST", value: "5.8" },
            { key: "3pm", label: "3PM", value: "3.4" },
          ],
          recentGames: [
            {
              dateIso: "2026-11-20",
              opponent: "Miami Heat",
              isHome: true,
              score: "118-110",
              result: "W",
              stats: [
                { label: "MIN", value: "36" },
                { label: "PTS", value: "30" },
                { label: "REB", value: "9" },
                { label: "AST", value: "6" },
                { label: "3PM", value: "4" },
              ],
            },
          ],
        }),
        makeSquadPlayer({
          id: "8",
          slug: "kristaps-porzingis",
          name: "Kristaps Porzingis",
          shortName: "K. Porzingis",
          positionGroup: "FWD",
          positionLabel: "C",
          seasonMetrics: [
            { key: "gp", label: "JJ", value: "10" },
            { key: "min", label: "MIN", value: "30.5" },
            { key: "pts", label: "PTS", value: "20.1" },
          ],
          recentGames: [
            {
              dateIso: "2026-11-18",
              opponent: "Knicks",
              isHome: true,
              score: "112-104",
              result: "W",
              stats: [{ label: "MIN", value: "31" }, { label: "PTS", value: "21" }],
            },
          ],
        }),
      ],
    };

    expect(
      buildEnrichedMatchLineups({
        game: nbaGame,
        homeSquad: nbaHomeSquad,
        awaySquad: null,
        sanitizePhotoKey: (raw) => raw ?? null,
      }),
    ).toBeNull();

    expect(
      buildMatchPlayerPicks({
        game: nbaGame,
        allowFull: false,
        catalog: null,
        homeSquad: nbaHomeSquad,
        awaySquad: null,
        sanitizePhotoKey: (raw) => raw ?? null,
      }),
    ).toEqual([]);

    const nbaMatchPicks = buildMatchPlayerPicks({
      game: nbaGame,
      allowFull: true,
      catalog: null,
      homeSquad: nbaHomeSquad,
      awaySquad: null,
      sanitizePhotoKey: (raw) => raw ?? null,
    });
    expect(nbaMatchPicks.some((p) => p.playerName === "Jayson Tatum" && p.marketKey === "nba_pts")).toBe(true);
    expect(nbaMatchPicks.some((p) => p.playerName === "Jayson Tatum" && p.marketKey === "nba_3pm")).toBe(true);
    expect(nbaMatchPicks.some((p) => p.playerName === "Kristaps Porzingis")).toBe(false);
    expect(nbaMatchPicks.every((p) => p.pick.engineName === "PitchLab Spacetime v6.0")).toBe(true);

    expect(
      deriveMatchPlayerPropsV6({
        gameId: nbaGame.id,
        league: "nba",
        sport: "basketball",
        homeTeamName: nbaGame.home.name,
        homeTeamSlug: nbaGame.home.slug,
        awayTeamName: nbaGame.away.name,
        awayTeamSlug: nbaGame.away.slug,
        homeSquad: nbaHomeSquad,
        awaySquad: null,
        allowFull: false,
      }),
    ).toEqual([]);
  });
});
