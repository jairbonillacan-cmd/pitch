import { describe, expect, it } from "vitest";
import {
  LeagueSnapshotSchema,
  asGameId,
  asLeagueId,
  asSeasonId,
  type GameDTO,
  type StandingRow,
} from "@pitchlab/contracts";
import type { NflTeamRateInput } from "@pitchlab/engines-reference";
import type { MlbFetchedGame } from "../src/adapters/mlb-statsapi.js";
import { buildMlbLeagueSnapshot } from "../src/mlb-snapshot.js";
import type { UsGameRow } from "../src/providers/bzzoiro-us.js";
import { computeNflStandings, divisionMetaForTeam, finalizeConferenceStandings } from "../src/us-divisions.js";
import { buildUsLeagueSnapshot } from "../src/us-snapshot.js";
import { validateLeagueSnapshotCandidate } from "../src/validation/snapshot-validator.js";

function makeNflTeam(slug: string, name: string, code: string): NflTeamRateInput {
  return {
    teamId: `nfl.${slug}`,
    name,
    shortName: name.split(" ").at(-1) ?? name,
    code,
    pointsFor: 0,
    pointsAgainst: 0,
    gamesPlayed: 0,
  };
}

function makeNflGame(
  id: string,
  startTime: string,
  homeSlug: string,
  homeName: string,
  homeCode: string,
  awaySlug: string,
  awayName: string,
  awayCode: string,
  score: [number, number],
): GameDTO {
  return {
    id: asGameId(id),
    league: asLeagueId("nfl"),
    season: asSeasonId("2026"),
    startTime,
    status: "final",
    round: "Semana 1",
    neutralSite: false,
    home: {
      id: `nfl.${homeSlug}` as GameDTO["home"]["id"],
      name: homeName,
      shortName: homeName.split(" ").at(-1) ?? homeName,
      code: homeCode,
      league: asLeagueId("nfl"),
    },
    away: {
      id: `nfl.${awaySlug}` as GameDTO["away"]["id"],
      name: awayName,
      shortName: awayName.split(" ").at(-1) ?? awayName,
      code: awayCode,
      league: asLeagueId("nfl"),
    },
    result: {
      home: score[0],
      away: score[1],
      observedAt: startTime,
      source: "test",
    },
  };
}

function makeMlbFetched(
  gamePk: number,
  startTime: string,
  homeSlug: string,
  homeName: string,
  homeCode: string,
  awaySlug: string,
  awayName: string,
  awayCode: string,
  score: [number, number] | null,
  gameType: "R" | "W" = "R",
): MlbFetchedGame {
  return {
    gameType,
    dto: {
      id: asGameId(`mlb-2026-${gamePk}`),
      league: asLeagueId("mlb"),
      season: asSeasonId("mlb-2026"),
      startTime,
      status: score ? "final" : "scheduled",
      round: gameType === "W" ? "Serie Mundial" : "Temporada regular",
      neutralSite: false,
      home: {
        id: `mlb.${homeSlug}` as GameDTO["home"]["id"],
        name: homeName,
        shortName: homeName.split(" ").at(-1) ?? homeName,
        code: homeCode,
        league: asLeagueId("mlb"),
        logoUrl: `/brand/sports/mlb/r1/svg/${homeSlug}.svg`,
      },
      away: {
        id: `mlb.${awaySlug}` as GameDTO["away"]["id"],
        name: awayName,
        shortName: awayName.split(" ").at(-1) ?? awayName,
        code: awayCode,
        league: asLeagueId("mlb"),
        logoUrl: `/brand/sports/mlb/r1/svg/${awaySlug}.svg`,
      },
      ...(score
        ? {
            result: {
              home: score[0],
              away: score[1],
              observedAt: startTime,
              source: "mlb_statsapi",
            },
          }
        : {}),
    },
  };
}

describe("Clasificación US por conferencias (NFL, NBA, NHL, MLB)", () => {
  it("computa tabla NFL con conferencias AFC/NFC, winPct, juegos detrás y sembrado", () => {
    const teams: NflTeamRateInput[] = [
      makeNflTeam("buffalo-bills", "Buffalo Bills", "BUF"),
      makeNflTeam("kansas-city-chiefs", "Kansas City Chiefs", "KC"),
      makeNflTeam("dallas-cowboys", "Dallas Cowboys", "DAL"),
      makeNflTeam("philadelphia-eagles", "Philadelphia Eagles", "PHI"),
    ];
    const games: GameDTO[] = [
      makeNflGame(
        "nfl-1",
        "2026-09-10T20:00:00Z",
        "buffalo-bills",
        "Buffalo Bills",
        "BUF",
        "kansas-city-chiefs",
        "Kansas City Chiefs",
        "KC",
        [27, 20],
      ),
      makeNflGame(
        "nfl-2",
        "2026-09-11T20:00:00Z",
        "philadelphia-eagles",
        "Philadelphia Eagles",
        "PHI",
        "dallas-cowboys",
        "Dallas Cowboys",
        "DAL",
        [21, 21],
      ),
    ];

    const standings = computeNflStandings(games, teams, () => undefined);
    expect(standings).toHaveLength(4);

    const buf = standings.find((r) => r.teamId === "nfl.buffalo-bills")!;
    const kc = standings.find((r) => r.teamId === "nfl.kansas-city-chiefs")!;
    const phi = standings.find((r) => r.teamId === "nfl.philadelphia-eagles")!;

    expect(buf).toMatchObject({
      conference: "AFC",
      division: "AFC Este",
      won: 1,
      lost: 0,
      winPct: 1,
      seed: 1,
    });
    expect(kc).toMatchObject({
      conference: "AFC",
      won: 0,
      lost: 1,
      winPct: 0,
      seed: 2,
    });
    // Empate en NFL vale 0.500 en winPct
    expect(phi).toMatchObject({
      conference: "NFC",
      drawn: 1,
      winPct: 0.5,
    });
  });

  it("asigna otLosses y 2*W + OTL puntos en standings NHL", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const rows: UsGameRow[] = [
      {
        source: "bzzoiro",
        sport: "nhl",
        season: "2026-27",
        providerMatchId: 101,
        kickoffUtc: "2026-11-14T00:00:00Z",
        status: "finished",
        home: { providerTeamId: 1, name: "Boston Bruins", shortName: "Bruins" },
        away: { providerTeamId: 2, name: "Toronto Maple Leafs", shortName: "Maple Leafs" },
        homeScore: 4,
        awayScore: 3,
        overtime: true,
        shootout: false,
        providerEloHome: null,
        providerEloAway: null,
      },
      {
        source: "bzzoiro",
        sport: "nhl",
        season: "2026-27",
        providerMatchId: 102,
        kickoffUtc: "2026-11-16T00:00:00Z",
        status: "scheduled",
        home: { providerTeamId: 2, name: "Toronto Maple Leafs", shortName: "Maple Leafs" },
        away: { providerTeamId: 1, name: "Boston Bruins", shortName: "Bruins" },
        homeScore: null,
        awayScore: null,
        overtime: false,
        shootout: false,
        providerEloHome: null,
        providerEloAway: null,
      },
    ];

    const snap = buildUsLeagueSnapshot({ sport: "nhl", rows, now, previousSnapshot: null });
    expect(snap.standings).toBeDefined();
    const bruins = snap.standings!.find((r) => r.teamId === "nhl.boston-bruins")!;
    const leafs = snap.standings!.find((r) => r.teamId === "nhl.toronto-maple-leafs")!;
    expect(bruins).toMatchObject({ won: 1, lost: 0, otLosses: 0, points: 2, conference: "Este" });
    expect(leafs).toMatchObject({ won: 0, lost: 0, otLosses: 1, points: 1, conference: "Este" });
  });

  it("resuelve divisiones canónicas de las cuatro ligas y construye snapshot MLB válido", () => {
    expect(divisionMetaForTeam("mlb", "los-angeles-dodgers")).toEqual({
      conference: "Liga Nacional",
      division: "NL Oeste",
    });
    expect(divisionMetaForTeam("nba", "boston-celtics")).toEqual({
      conference: "Este",
      division: "Atlántico",
    });

    const seasonGames: MlbFetchedGame[] = [
      makeMlbFetched(
        1,
        "2026-09-20T00:10:00Z",
        "los-angeles-dodgers",
        "Los Angeles Dodgers",
        "LAD",
        "new-york-yankees",
        "New York Yankees",
        "NYY",
        [6, 3],
        "R",
      ),
      makeMlbFetched(
        2,
        "2026-10-25T00:00:00Z",
        "los-angeles-dodgers",
        "Los Angeles Dodgers",
        "LAD",
        "new-york-yankees",
        "New York Yankees",
        "NYY",
        [4, 2],
        "W",
      ),
    ];

    const upcomingGames: MlbFetchedGame[] = [
      makeMlbFetched(
        3,
        "2027-03-26T20:10:00Z",
        "new-york-yankees",
        "New York Yankees",
        "NYY",
        "los-angeles-dodgers",
        "Los Angeles Dodgers",
        "LAD",
        null,
        "R",
      ),
    ];

    const standings: StandingRow[] = finalizeConferenceStandings("mlb", [
      {
        teamId: "mlb.los-angeles-dodgers",
        name: "Los Angeles Dodgers",
        shortName: "Dodgers",
        code: "LAD",
        logoUrl: "/brand/sports/mlb/r1/svg/los-angeles-dodgers.svg",
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        winPct: 1,
        goalsFor: 6,
        goalsAgainst: 3,
        points: 0,
        conference: "Liga Nacional",
        division: "Oeste LN",
      },
      {
        teamId: "mlb.new-york-yankees",
        name: "New York Yankees",
        shortName: "Yankees",
        code: "NYY",
        logoUrl: "/brand/sports/mlb/r1/svg/new-york-yankees.svg",
        played: 1,
        won: 0,
        drawn: 0,
        lost: 1,
        winPct: 0,
        goalsFor: 3,
        goalsAgainst: 6,
        points: 0,
        conference: "Liga Americana",
        division: "Este LA",
      },
    ]);

    const now = new Date("2026-11-18T18:00:00Z");
    const { snapshot, allPlayedForResults } = buildMlbLeagueSnapshot({
      seasonYear: 2026,
      seasonGames,
      upcomingGames,
      standings,
      now,
      previousSnapshot: null,
    });

    expect(allPlayedForResults).toHaveLength(2);
    expect(() => LeagueSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.standings).toHaveLength(2);
    expect(snapshot.games.some((g) => g.status === "scheduled")).toBe(true);
    expect(snapshot.games.every((g) => Boolean(snapshot.analyses[g.id]))).toBe(true);
    expect(snapshot.games[0]?.home.logoUrl).toBe("/brand/sports/mlb/r1/svg/los-angeles-dodgers.svg");
    const validation = validateLeagueSnapshotCandidate(snapshot, null, { nowMs: now.getTime() });
    expect(validation.issues).toEqual([]);
  });
});
