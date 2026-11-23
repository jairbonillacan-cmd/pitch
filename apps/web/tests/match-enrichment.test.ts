import { describe, expect, it } from "vitest";
import { asLeagueId, asTeamId, type SquadPlayerEntry, type TeamSquadEntry } from "@pitchlab/contracts";
import type { PlatformGame } from "@pitchlab/ui/types";
import {
  buildEnrichedMatchInjuries,
  buildEnrichedMatchLineups,
  buildMatchEnfrentamientos,
  buildMatchPlayerPicks,
} from "../src/server/match-enrichment";

function makePlayer(
  id: string,
  name: string,
  group: SquadPlayerEntry["positionGroup"],
  opts?: Partial<SquadPlayerEntry>,
): SquadPlayerEntry {
  return {
    id,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    shortName: name,
    jersey: id,
    positionGroup: group,
    positionLabel: group,
    age: 25,
    birthDate: "2001-01-01",
    heightCm: 180,
    weightKg: 75,
    preferredFoot: "R",
    nationality: "España",
    nationalityCode: "ESP",
    photoKey: `pl-p:${id}`,
    fallbackPhotoKey: null,
    availability: "available",
    injuryDetail: null,
    expectedReturn: null,
    stats: {
      appearances: 12,
      subIns: 1,
      goals: group === "FWD" ? 5 : 1,
      assists: 2,
      shots: 18,
      shotsOnTarget: 8,
      foulsCommitted: 6,
      foulsSuffered: 10,
      yellowCards: 2,
      redCards: 0,
      offsides: 1,
      saves: group === "GK" ? 32 : 0,
      shotsFaced: 0,
      goalsConceded: 8,
    },
    recentGames: [
      {
        dateIso: "2026-11-15",
        opponent: "Rival CF",
        isHome: true,
        score: "2-1",
        result: "W",
        stats: [{ label: "MIN", value: "90" }, { label: "G", value: "1" }],
      },
    ],
    candidatePicks: [],
    ...opts,
  };
}

function makeSquad(teamSlug: string, teamName: string, extra?: Partial<TeamSquadEntry>): TeamSquadEntry {
  const players: SquadPlayerEntry[] = [
    makePlayer("1", `${teamName} GK`, "GK"),
    makePlayer("2", `${teamName} RB`, "DEF"),
    makePlayer("3", `${teamName} CB1`, "DEF"),
    makePlayer("4", `${teamName} CB2`, "DEF"),
    makePlayer("5", `${teamName} LB`, "DEF"),
    makePlayer("6", `${teamName} CDM`, "MID"),
    makePlayer("8", `${teamName} CM`, "MID"),
    makePlayer("10", `${teamName} CAM`, "MID"),
    makePlayer("7", `${teamName} LW`, "FWD", {
      candidatePicks: [
        {
          id: `${teamSlug}-lw-sot`,
          marketKey: "player_sot",
          marketLabel: "Tiros a puerta",
          selectionLabel: "Más de 0.5 tiros a puerta",
          line: 0.5,
          projectionMean: 0.65,
          projectionSd: 0.5,
          p: 0.58,
          fairDecimal: 1.72,
          fairAmerican: -139,
          rationale: "7 tiros a puerta en 12 partidos.",
        },
      ],
    }),
    makePlayer("9", `${teamName} ST`, "FWD"),
    makePlayer("11", `${teamName} RW`, "FWD"),
    makePlayer("12", `${teamName} Sub`, "MID", {
      stats: {
        appearances: 4,
        subIns: 4,
        goals: 0,
        assists: 0,
        shots: 2,
        shotsOnTarget: 0,
        foulsCommitted: 1,
        foulsSuffered: 1,
        yellowCards: 0,
        redCards: 0,
        offsides: 0,
        saves: 0,
        shotsFaced: 0,
        goalsConceded: 0,
      },
    }),
    makePlayer("19", `${teamName} Lesionado`, "FWD", {
      availability: "injured",
      injuryDetail: "Isquiotibiales",
      expectedReturn: "2026-12-05",
    }),
  ];

  return {
    teamId: asTeamId(`laliga.${teamSlug}`),
    teamSlug,
    teamName,
    coachName: `DT ${teamName}`,
    coach: {
      name: `DT ${teamName}`,
      photoKey: "pl-m:99",
      nationality: "España",
      preferredFormation: "4-3-3",
    },
    updatedAt: "2026-11-20T12:00:00Z",
    players,
    ...extra,
  };
}

function makeGame(): PlatformGame {
  return {
    id: "laliga-2026-barcelona-real-madrid",
    league: asLeagueId("laliga"),
    leagueLabel: "LaLiga",
    sport: "football",
    round: "Jornada 13",
    dayId: "2026-11-22",
    dayLabel: "Dom 22 nov",
    kickoffUtc: "2026-11-22T20:00:00Z",
    kickoffLocal: "14:00",
    venue: "Estadio Olímpico",
    referee: "Mateu Lahoz",
    status: "NS",
    home: {
      slug: "fc-barcelona",
      name: "FC Barcelona",
      shortName: "Barcelona",
      code: "BAR",
      record: "9-0-1",
    },
    away: {
      slug: "real-madrid",
      name: "Real Madrid",
      shortName: "Real Madrid",
      code: "RMA",
      record: "8-2-0",
    },
    x12: [0.46, 0.26, 0.28],
    projection: { home: 1.8, away: 1.3, total: 3.1 },
    confidenceScore: 76,
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
    headToHead: [
      {
        date: "2026-04-12",
        home: "Real Madrid",
        away: "FC Barcelona",
        homeGoals: 2,
        awayGoals: 2,
      },
    ],
    updatedAtLabel: "Hoy",
    spacetime: null,
  };
}

describe("match-enrichment server module", () => {
  const game = makeGame();
  const homeSquad = makeSquad("fc-barcelona", "Barcelona");
  const awaySquad = makeSquad("real-madrid", "Real Madrid");
  const sanitize = (raw?: string | null) => (raw && raw.startsWith("pl-") ? raw : null);

  it("deriva XI probable excluyendo lesionados y preserva entrenador, banca y estadisticas reales", () => {
    const lineups = buildEnrichedMatchLineups({
      game,
      homeSquad,
      awaySquad,
      sanitizePhotoKey: sanitize,
    });

    expect(lineups).not.toBeNull();
    expect(lineups?.status).toBe("probable");
    expect(lineups?.bannerLabel).toContain("Alineación probable");
    expect(lineups?.home.starters).toHaveLength(11);
    expect(lineups?.home.unavailable.map((p) => p.name)).toContain("Barcelona Lesionado");
    expect(lineups?.home.starters.some((p) => p.name.includes("Lesionado"))).toBe(false);
    expect(lineups?.home.starters[0]?.rating).toBeNull();
    expect(lineups?.home.coachName).toBe("DT Barcelona");
    expect(lineups?.home.starters[0]?.recentMatches).toHaveLength(1);
  });

  it("calcula Enfrentamientos con rankings reales sin ceros inventados y filtro de competencia", () => {
    const enf = buildMatchEnfrentamientos({
      game,
      leagueLabel: "LaLiga",
      snapshot: {
        teamRates: {
          "laliga.fc-barcelona": {
            teamId: "laliga.fc-barcelona",
            name: "FC Barcelona",
            forPerGame: 2.8,
            againstPerGame: 0.9,
            gamesPlayed: 10,
            adjustedFor: 2.5,
            adjustedAgainst: 0.95,
          },
          "laliga.real-madrid": {
            teamId: "laliga.real-madrid",
            name: "Real Madrid",
            forPerGame: 2.2,
            againstPerGame: 0.8,
            gamesPlayed: 10,
            adjustedFor: 2.1,
            adjustedAgainst: 0.85,
          },
        },
        standings: [
          {
            teamId: "laliga.fc-barcelona",
            name: "FC Barcelona",
            shortName: "Barcelona",
            code: "BAR",
            played: 10,
            won: 9,
            drawn: 0,
            lost: 1,
            goalsFor: 28,
            goalsAgainst: 9,
            points: 27,
          },
          {
            teamId: "laliga.real-madrid",
            name: "Real Madrid",
            shortName: "Real Madrid",
            code: "RMA",
            played: 10,
            won: 8,
            drawn: 2,
            lost: 0,
            goalsFor: 22,
            goalsAgainst: 8,
            points: 26,
          },
        ],
      },
      homeHistory: [
        {
          id: "h1",
          dateIso: "2026-11-10T18:00:00Z",
          leagueLabel: "LaLiga",
          isHome: true,
          opponentSlug: "sevilla",
          opponentName: "Sevilla",
          opponentShort: "Sevilla",
          goalsFor: 3,
          goalsAgainst: 0,
        },
        {
          id: "h2",
          dateIso: "2026-11-04T20:00:00Z",
          leagueLabel: "Champions League",
          isHome: false,
          opponentSlug: "inter",
          opponentName: "Inter",
          opponentShort: "Inter",
          goalsFor: 1,
          goalsAgainst: 2,
        },
      ],
      awayHistory: [],
    });

    expect(enf.rankings?.leagueSize).toBe(2);
    expect(enf.rankings?.attack[0]?.homeRank).toBe(1);
    expect(enf.rankings?.defense[0]?.awayRank).toBe(1);
    expect(enf.homeRecent[0]?.isSameCompetition).toBe(true);
    expect(enf.homeRecent[1]?.isSameCompetition).toBe(false);
    expect(enf.h2h).toHaveLength(1);
    expect(enf.h2h[0]?.homeScore).toBe(2);
  });

  it("aplica Cero-Fuga en picks de jugadores y fusiona lesiones de plantilla sin duplicados", () => {
    const visitorPlayerPicks = buildMatchPlayerPicks({
      game,
      allowFull: false,
      catalog: null,
      homeSquad,
      awaySquad,
      sanitizePhotoKey: sanitize,
    });
    expect(visitorPlayerPicks).toEqual([]);

    const memberPlayerPicks = buildMatchPlayerPicks({
      game,
      allowFull: true,
      catalog: null,
      homeSquad,
      awaySquad,
      sanitizePhotoKey: sanitize,
    });
    expect(memberPlayerPicks.length).toBe(2);
    expect(memberPlayerPicks[0]?.photoKey).toBe("pl-p:7");

    const injuries = buildEnrichedMatchInjuries({
      game,
      allowFull: false,
      leagueInjuries: [
        {
          teamId: asTeamId("laliga.fc-barcelona"),
          player: "Barcelona Lesionado",
          position: "FWD",
          status: "Baja",
          detail: "Isquiotibiales",
          injuryType: "Muscular",
          returnDate: "2026-12-05",
          reportedAt: "2026-11-20T10:00:00Z",
        },
      ],
      homeSquad,
      awaySquad,
      sanitizePhotoKey: sanitize,
    });

    const barcelonaInjuries = injuries.filter((i) => i.teamSide === "home");
    expect(barcelonaInjuries).toHaveLength(1);
    expect(barcelonaInjuries[0]?.photoKey).toBe("pl-p:19");
    expect(barcelonaInjuries[0]?.expectedReturn).toBe("2026-12-05");
  });
});
