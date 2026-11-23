import { describe, expect, it } from "vitest";
import { getLeagueCapability, type LeagueCapabilityContract } from "@pitchlab/contracts";
import {
  buildActiveFootballBracket,
  buildActiveUsSeriesBracket,
  buildProjectedLigaMxBracket,
  buildProjectedNbaBracket,
  buildProjectedUefaOrCupBracket,
  classifyKnockoutStageKey,
  classifyUsSeriesStageKey,
  resolveStandingsZonesForLeague,
  type LeagueStandingsSplitsPayload,
  type StandingsSplitRow,
  type TeamMetaRecord,
  type UnifiedMatchRecord,
} from "../src/server/standings-brackets-pure";

function makeRow(
  league: "liga-mx" | "champions-league" | "nba",
  rank: number,
  conference: string | null = null,
): StandingsSplitRow {
  const slug = `${league}-team-${rank}`;
  return {
    rank,
    teamId: `${league}.${slug}`,
    teamSlug: slug,
    name: `Club ${rank}`,
    shortName: `C${rank}`,
    code: `C${String(rank).padStart(2, "0")}`,
    teamHref: `/app/${league}/t/${slug}`,
    conference,
    division: null,
    played: 10,
    won: Math.max(0, 10 - rank),
    drawn: 1,
    lost: Math.min(9, rank),
    goalsFor: 20,
    goalsAgainst: 10 + rank,
    goalDiff: 10 - rank,
    points: Math.max(1, 30 - rank),
    winPct: null,
    gamesBehind: null,
    seed: rank,
    form: ["W", "D", "L"],
    zoneId: null,
    zoneLabel: null,
    zoneTone: null,
  };
}

describe("standings-brackets-pure: motor puro de zonas y cuadros eliminatorios", () => {
  it("resuelve zonas de clasificación según contrato de liga y bloquea descenso si hasRelegationZones es false", () => {
    const ligaMxCap = getLeagueCapability("liga-mx")!;
    const premierCap = getLeagueCapability("premier-league")!;
    const bundesligaCap = getLeagueCapability("bundesliga")!;
    const uclCap = getLeagueCapability("champions-league")!;
    const nbaCap = getLeagueCapability("nba")!;
    const noRelPremier: LeagueCapabilityContract = { ...premierCap, hasRelegationZones: false };

    expect(resolveStandingsZonesForLeague("liga-mx", ligaMxCap, 3)).toEqual([]);

    const mxZones = resolveStandingsZonesForLeague("liga-mx", ligaMxCap, 18);
    expect(mxZones.map((z) => [z.id, z.startRank, z.endRank])).toEqual([
      ["liguilla-direct", 1, 6],
      ["play-in", 7, 10],
    ]);

    const filteredPremierZones = resolveStandingsZonesForLeague("premier-league", noRelPremier, 20);
    expect(filteredPremierZones.some((z) => z.tone === "rel")).toBe(false);

    const bundesZones = resolveStandingsZonesForLeague("bundesliga", bundesligaCap, 18);
    expect(bundesZones.map((z) => z.id)).toEqual(["ucl", "uel", "uecl", "playoff-rel", "rel"]);

    const uclZones = resolveStandingsZonesForLeague("champions-league", uclCap, 36);
    expect(uclZones.map((z) => [z.id, z.startRank, z.endRank])).toEqual([
      ["r16", 1, 8],
      ["ko-playoffs", 9, 24],
    ]);

    const nbaZones = resolveStandingsZonesForLeague("nba", nbaCap, 30);
    expect(nbaZones.every((z) => z.scope === "conference")).toBe(true);
    expect(nbaZones.map((z) => [z.id, z.startRank, z.endRank])).toEqual([
      ["po", 1, 6],
      ["play-in", 7, 10],
    ]);
  });

  it("clasifica rondas eliminatorias de fútbol y series US excluyendo fase de grupos y temporada regular", () => {
    expect(classifyKnockoutStageKey("champions-league", "Group Stage", "League Phase", true)).toBeNull();
    expect(classifyKnockoutStageKey("liga-mx", "Tercer lugar", null, false)).toBeNull();
    expect(classifyKnockoutStageKey("liga-mx", "Cuartos de Final", null, false)?.key).toBe("quarterfinals");
    expect(classifyKnockoutStageKey("liga-mx", "Gran Final Ida", null, false)?.twoLegged).toBe(true);
    expect(classifyKnockoutStageKey("champions-league", "Final", null, true)?.twoLegged).toBe(false);

    expect(classifyUsSeriesStageKey("baseball", "Regular Season", null)).toBeNull();
    expect(classifyUsSeriesStageKey("baseball", "ALCS Game 4", "Championship Series")?.bestOf).toBe(7);
    expect(classifyUsSeriesStageKey("baseball", "World Series", null)?.label).toBe("Serie Mundial");
    expect(classifyUsSeriesStageKey("ice-hockey", "Stanley Cup Finals", null)?.label).toBe(
      "Final de la Stanley Cup",
    );
  });

  it("proyecta correctamente Liguilla MX, cuadro UEFA de 24 equipos y Playoffs NBA", () => {
    const mxRows = Array.from({ length: 18 }, (_, i) => makeRow("liga-mx", i + 1));
    const mxSplits: LeagueStandingsSplitsPayload = {
      league: "liga-mx",
      leagueLabel: "Liga MX",
      sport: "football",
      season: "2026",
      roundLabel: "Jornada 17",
      updatedAt: "2026-11-22T00:00:00Z",
      hasRelegationZones: false,
      hasConferences: false,
      conferences: [],
      total: mxRows,
      home: mxRows,
      away: mxRows,
      zones: [],
    };
    const mxBracket = buildProjectedLigaMxBracket(mxSplits);
    expect(mxBracket).not.toBeNull();
    expect(mxBracket!.format).toBe("liga_mx_liguilla");
    expect(mxBracket!.rounds.map((r) => r.key)).toEqual([
      "play_in",
      "quarterfinals",
      "semifinals",
      "final",
    ]);
    expect(mxBracket!.rounds[0]!.ties[0]!.teamA.seed).toBe(7);
    expect(mxBracket!.rounds[0]!.ties[0]!.teamB.seed).toBe(8);

    const uclRows = Array.from({ length: 24 }, (_, i) => makeRow("champions-league", i + 1));
    const uclBracket = buildProjectedUefaOrCupBracket({
      ...mxSplits,
      league: "champions-league",
      leagueLabel: "Champions League",
      total: uclRows,
      home: uclRows,
      away: uclRows,
    });
    expect(uclBracket).not.toBeNull();
    expect(uclBracket!.format).toBe("uefa_knockout");
    expect(uclBracket!.rounds[0]!.key).toBe("knockout_playoffs");
    expect(uclBracket!.rounds[0]!.ties[0]!.teamA.seed).toBe(9);
    expect(uclBracket!.rounds[0]!.ties[0]!.teamB.seed).toBe(24);

    const eastRows = Array.from({ length: 10 }, (_, i) => makeRow("nba", i + 1, "Este"));
    const westRows = Array.from({ length: 10 }, (_, i) => ({
      ...makeRow("nba", i + 11, "Oeste"),
      seed: i + 1,
    }));
    const nbaBracket = buildProjectedNbaBracket("NBA", null, {
      ...mxSplits,
      league: "nba",
      leagueLabel: "NBA",
      sport: "basketball",
      hasConferences: true,
      conferences: ["Este", "Oeste"],
      total: [...eastRows, ...westRows],
      home: [...eastRows, ...westRows],
      away: [...eastRows, ...westRows],
    });
    expect(nbaBracket).not.toBeNull();
    expect(nbaBracket!.conferences.map((c) => c.conference)).toEqual(["Este", "Oeste"]);
    expect(nbaBracket!.finalsTie?.bestOf).toBe(7);
  });

  it("construye cuadros activos en fútbol (desempate por posición Liga MX) y series US al mejor de 7", () => {
    const mxCap = getLeagueCapability("liga-mx")!;
    const mxRegistry = new Map<string, TeamMetaRecord>([
      [
        "america",
        {
          teamId: "liga-mx.america",
          teamSlug: "america",
          name: "Club América",
          shortName: "América",
          code: "AME",
          conference: null,
          division: null,
          snapshotSeed: 1,
          snapshotGamesBehind: null,
        },
      ],
      [
        "chivas",
        {
          teamId: "liga-mx.chivas",
          teamSlug: "chivas",
          name: "Chivas",
          shortName: "Chivas",
          code: "GDL",
          conference: null,
          division: null,
          snapshotSeed: 6,
          snapshotGamesBehind: null,
        },
      ],
    ]);
    const mxSplits: LeagueStandingsSplitsPayload = {
      league: "liga-mx",
      leagueLabel: "Liga MX",
      sport: "football",
      season: "2026",
      roundLabel: "Cuartos",
      updatedAt: "2026-11-22T00:00:00Z",
      hasRelegationZones: false,
      hasConferences: false,
      conferences: [],
      total: [
        { ...makeRow("liga-mx", 1), teamSlug: "america" },
        { ...makeRow("liga-mx", 6), teamSlug: "chivas" },
      ],
      home: [],
      away: [],
      zones: [],
    };
    const mxMatches: UnifiedMatchRecord[] = [
      {
        dedupeKey: "leg-1",
        matchSlug: "chivas-vs-america-ida",
        href: "/app/liga-mx/g/chivas-vs-america-ida",
        dateIso: "2026-11-18T02:00:00Z",
        dayKey: "2026-11-18",
        round: "Cuartos de final",
        stageName: "Liguilla",
        status: "FT",
        homeTeamId: "liga-mx.chivas",
        awayTeamId: "liga-mx.america",
        homeSlug: "chivas",
        awaySlug: "america",
        homeScore: 1,
        awayScore: 1,
        extraTimeScore: null,
        penaltyShootout: null,
        overtime: false,
      },
      {
        dedupeKey: "leg-2",
        matchSlug: "america-vs-chivas-vuelta",
        href: "/app/liga-mx/g/america-vs-chivas-vuelta",
        dateIso: "2026-11-21T02:00:00Z",
        dayKey: "2026-11-21",
        round: "Cuartos de final",
        stageName: "Liguilla",
        status: "FT",
        homeTeamId: "liga-mx.america",
        awayTeamId: "liga-mx.chivas",
        homeSlug: "america",
        awaySlug: "chivas",
        homeScore: 0,
        awayScore: 0,
        extraTimeScore: null,
        penaltyShootout: null,
        overtime: false,
      },
    ];
    const activeMx = buildActiveFootballBracket(
      "liga-mx",
      "Liga MX",
      null,
      mxRegistry,
      mxMatches,
      mxCap,
      mxSplits,
    );
    expect(activeMx).not.toBeNull();
    const tie = activeMx!.rounds[0]!.ties[0]!;
    expect(tie.status).toBe("decided");
    expect(tie.winnerTeamSlug).toBe("america");
    expect(tie.note).toBe("Avanza por mejor posición en tabla general");

    const nbaCap = getLeagueCapability("nba")!;
    const nbaRegistry = new Map<string, TeamMetaRecord>();
    const nbaGames: UnifiedMatchRecord[] = [1, 2, 3, 4].map((n) => ({
      dedupeKey: `nba-${n}`,
      matchSlug: `celtics-vs-heat-g${n}`,
      href: `/app/nba/g/celtics-vs-heat-g${n}`,
      dateIso: `2026-05-0${n}T00:00:00Z`,
      dayKey: `2026-05-0${n}`,
      round: "First Round",
      stageName: "Playoffs",
      status: "FT",
      homeTeamId: "nba.boston-celtics",
      awayTeamId: "nba.miami-heat",
      homeSlug: "boston-celtics",
      awaySlug: "miami-heat",
      homeScore: 112,
      awayScore: 98,
      extraTimeScore: null,
      penaltyShootout: null,
      overtime: false,
    }));
    const activeNba = buildActiveUsSeriesBracket(
      "nba",
      "NBA",
      null,
      nbaRegistry,
      nbaGames,
      nbaCap,
    );
    expect(activeNba).not.toBeNull();
    const seriesTie = activeNba!.rounds[0]!.ties[0]!;
    expect(seriesTie.status).toBe("decided");
    expect(seriesTie.seriesWinsA).toBe(4);
    expect(seriesTie.seriesWinsB).toBe(0);
    expect(seriesTie.winnerTeamSlug).toBe("boston-celtics");
  });
});
