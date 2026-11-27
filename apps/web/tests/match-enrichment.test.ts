import { describe, expect, it } from "vitest";
import { asLeagueId, asTeamId, type SquadPlayerEntry, type TeamSquadEntry } from "@pitchlab/contracts";
import type { MatchPicksCatalog } from "@pitchlab/ui/picks-catalog";
import type { PlatformGame } from "@pitchlab/ui/types";
import {
  buildEnrichedMatchInjuries,
  buildEnrichedMatchLineups,
  buildMatchEnfrentamientos,
  buildMatchPlayerPicks,
} from "../src/server/match-enrichment";
import {
  loadGamePreviewPayload,
  loadInitialShellDatasetForAccess,
} from "../src/server/platform-data";

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

function makeGame(overrides: Partial<PlatformGame> = {}): PlatformGame {
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
    ...overrides,
  };
}

describe("match-enrichment server module", () => {
  const game = makeGame();
  const homeSquad = makeSquad("fc-barcelona", "Barcelona");
  const awaySquad = makeSquad("real-madrid", "Real Madrid");
  const sanitize = (raw?: string | null) => (raw && raw.startsWith("pl-") ? raw : null);

  it("deriva XI probable excluyendo lesionados, aplica Cero-Fuga cuando allowFull=false y preserva entrenador y banca", () => {
    expect(
      buildEnrichedMatchLineups({
        game,
        allowFull: false,
        homeSquad,
        awaySquad,
        sanitizePhotoKey: sanitize,
      }),
    ).toBeNull();

    const lineups = buildEnrichedMatchLineups({
      game,
      allowFull: true,
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

  it("calcula Enfrentamientos con rankings reales, control Cero-Fuga en indices ajustados y filtro de competencia", () => {
    const baseSnapshot = {
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
    };

    const enfMember = buildMatchEnfrentamientos({
      game,
      leagueLabel: "LaLiga",
      allowFull: true,
      snapshot: baseSnapshot,
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

    expect(enfMember.rankings?.leagueSize).toBe(2);
    expect(enfMember.rankings?.attack[0]?.homeRank).toBe(1);
    expect(enfMember.rankings?.defense[0]?.awayRank).toBe(1);
    expect(enfMember.rankings?.attack.some((r) => r.key === "adjusted_offense")).toBe(true);
    expect(enfMember.homeRecent[0]?.isSameCompetition).toBe(true);
    expect(enfMember.homeRecent[1]?.isSameCompetition).toBe(false);
    expect(enfMember.h2h).toHaveLength(1);
    expect(enfMember.h2h[0]?.homeScore).toBe(2);

    const enfVisitor = buildMatchEnfrentamientos({
      game,
      leagueLabel: "LaLiga",
      allowFull: false,
      snapshot: baseSnapshot,
      homeHistory: [],
      awayHistory: [],
    });
    expect(enfVisitor.rankings?.attack.some((r) => r.key === "for_per_game")).toBe(true);
    expect(enfVisitor.rankings?.attack.some((r) => r.key === "adjusted_offense")).toBe(false);
    expect(enfVisitor.rankings?.defense.some((r) => r.key === "adjusted_defense")).toBe(false);
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
    expect(memberPlayerPicks.length).toBe(4);
    expect(memberPlayerPicks.some((p) => p.photoKey === "pl-p:7" && p.marketKey === "player_sot")).toBe(true);
    expect(memberPlayerPicks.some((p) => p.photoKey === "pl-p:1" && p.marketKey === "player_saves")).toBe(true);

    const visitorInjuries = buildEnrichedMatchInjuries({
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
    expect(visitorInjuries).toEqual([]);

    const injuries = buildEnrichedMatchInjuries({
      game,
      allowFull: true,
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

  it("blinda FD-16, casas permitidas, Anti-EV, muestra >= 45 min y unidades obligatorias en picks", () => {
    const toxicSquad = makeSquad("fc-barcelona", "Barcelona", {
      players: [
        makePlayer("77", "Low Minutes FWD", "FWD", {
          recentGames: [
            {
              dateIso: "2026-11-15",
              opponent: "Rival",
              isHome: true,
              score: "1-0",
              result: "W",
              stats: [{ label: "MIN", value: "24" }],
            },
          ],
          candidatePicks: [
            {
              id: "low-min-pick",
              marketKey: "player_sot",
              marketLabel: "Tiros a puerta",
              selectionLabel: "Más de 0.5 tiros a puerta",
              line: 0.5,
              projectionMean: 0.7,
              projectionSd: 0.5,
              p: 0.6,
              fairDecimal: 1.67,
              fairAmerican: -149,
              rationale: "Poca muestra real.",
            },
          ],
        }),
        makePlayer("78", "Good FWD", "FWD", {
          candidatePicks: [
            {
              id: "unitless-pick",
              marketKey: "player_sot",
              marketLabel: "Tiros",
              selectionLabel: "Más de 1.5",
              line: 1.5,
              projectionMean: 1.8,
              projectionSd: 1.0,
              p: 0.58,
              fairDecimal: 1.72,
              fairAmerican: -139,
              rationale: "Sin unidad explícita.",
            },
            {
              id: "valid-pick",
              marketKey: "player_sot",
              marketLabel: "Tiros a puerta",
              selectionLabel: "Más de 1.5 tiros a puerta",
              line: 1.5,
              projectionMean: 1.9,
              projectionSd: 1.0,
              p: 0.6,
              fairDecimal: 1.67,
              fairAmerican: -149,
              rationale: "7 tiros en 5 partidos.",
            },
          ],
        }),
      ],
    });

    const catalog: MatchPicksCatalog = {
      gameId: game.id,
      league: asLeagueId("laliga"),
      sport: "football",
      gameStatus: "NS",
      generatedAtUtc: "2026-11-22T12:00:00Z",
      engineVersion: "spacetime-v5.1",
      isRedactedForVisitor: false,
      totalPicks: 2,
      availableFamilies: ["player_props_football"],
      familyCounts: { player_props_football: 2 },
      picks: [
        {
          id: "cat-blocked-book",
          gameId: game.id,
          league: asLeagueId("laliga"),
          leagueLabel: "LaLiga",
          sport: "football",
          matchLabel: "Barcelona vs Real Madrid",
          kickoffUtc: "2026-11-22T20:00:00Z",
          kickoffLocal: "14:00",
          gameStatus: "NS",
          family: "player_props_football",
          familyLabel: "Tiros a puerta",
          category: "player_props",
          axis: "player_prop",
          direction: "over",
          line: 0.5,
          label: "Más de 0.5 tiros a puerta",
          selectionKey: "player_sot:good-fwd:0.5",
          conflictGroup: "independent",
          settlement: "pending",
          engineName: "PitchLab Tachyon v5.1",
          isPrimaryModelPick: false,
          isDerived: true,
          recommendationScore: 70,
          isRedacted: false,
          pricing: {
            p: 0.58,
            fairOdds: 1.72,
            fairAmerican: -139,
            marketDecimal: 2.2,
            marketAmerican: 120,
            marketBookLabel: "Betfair",
            marketCapturedAtUtc: "2026-11-22T12:00:00Z",
            deVigMarketProb: 0.5,
            deVigMethod: "proportional",
            overroundPct: 4.5,
            evPct: 27.6,
            edgePts: 12.5,
            noVigEdgePts: 8.0,
            valueLabel: "Valor",
            hasPositiveValue: true,
          },
          evidence: {
            windows: [],
            xgSignal: null,
            refereeSignal: null,
            bullets: [{ label: "Datos Bzzoiro internos", ratePct: 80, tone: "high" }],
            avgObservedRatePct: 80,
          },
          playerMeta: {
            playerName: "Good FWD",
            playerSlug: "good-fwd",
            teamSide: "home",
            teamName: "FC Barcelona",
            teamSlug: "fc-barcelona",
            position: "FWD",
            statKey: "shots_on_target",
            statLabel: "Tiros a puerta",
            minMinutesGuard: 45,
            qualifyingMatches: 5,
            avgMinutes: 78,
            lineupStatus: "probable",
            projectionMean: 1.1,
            projectionSd: 0.8,
          },
        },
        {
          id: "cat-inflated-sharp-ev",
          gameId: game.id,
          league: asLeagueId("laliga"),
          leagueLabel: "LaLiga",
          sport: "football",
          matchLabel: "Barcelona vs Real Madrid",
          kickoffUtc: "2026-11-22T20:00:00Z",
          kickoffLocal: "14:00",
          gameStatus: "NS",
          family: "player_props_football",
          familyLabel: "Tiros totales",
          category: "player_props",
          axis: "player_prop",
          direction: "over",
          line: 2.5,
          label: "Más de 2.5 tiros",
          selectionKey: "player_shots:good-fwd:2.5",
          conflictGroup: "independent",
          settlement: "pending",
          engineName: "PitchLab Tachyon v5.1",
          isPrimaryModelPick: false,
          isDerived: true,
          recommendationScore: 70,
          isRedacted: false,
          pricing: {
            p: 0.62,
            fairOdds: 1.61,
            fairAmerican: -164,
            marketDecimal: 1.98,
            marketAmerican: -102,
            marketBookLabel: "Pinnacle",
            marketCapturedAtUtc: "2026-11-22T12:00:00Z",
            deVigMarketProb: 0.52,
            deVigMethod: "proportional",
            overroundPct: 2.5,
            evPct: 22.8,
            edgePts: 11.4,
            noVigEdgePts: 10.0,
            valueLabel: "Valor",
            hasPositiveValue: true,
          },
          evidence: {
            windows: [],
            xgSignal: null,
            refereeSignal: null,
            bullets: [{ label: "6/8 últimos partidos", ratePct: 75, tone: "high" }],
            avgObservedRatePct: 75,
          },
          playerMeta: {
            playerName: "Good FWD",
            playerSlug: "good-fwd",
            teamSide: "home",
            teamName: "FC Barcelona",
            teamSlug: "fc-barcelona",
            position: "FWD",
            statKey: "shots",
            statLabel: "Tiros totales",
            minMinutesGuard: 45,
            qualifyingMatches: 5,
            avgMinutes: 78,
            lineupStatus: "probable",
            projectionMean: 2.8,
            projectionSd: 1.2,
          },
        },
      ],
    };

    const picks = buildMatchPlayerPicks({
      game,
      allowFull: true,
      catalog,
      homeSquad: toxicSquad,
      awaySquad: null,
      sanitizePhotoKey: sanitize,
    });

    expect(picks.some((p) => p.playerName === "Low Minutes FWD")).toBe(false);
    expect(picks.some((p) => p.selectionLabel === "Más de 1.5")).toBe(false);
    const blockedBookItem = picks.find((p) => p.id === "cat-blocked-book");
    expect(blockedBookItem?.marketBookLabel).toBeNull();
    expect(blockedBookItem?.marketDecimal).toBeNull();
    expect(blockedBookItem?.evPct).toBeNull();
    expect(blockedBookItem?.evidenceBullets).toEqual([]);
    const inflatedSharpItem = picks.find((p) => p.id === "cat-inflated-sharp-ev");
    expect(inflatedSharpItem?.marketBookLabel).toBe("Pinnacle");
    expect(inflatedSharpItem?.evPct).toBeNull();
  });

  it("usa unidades multi-deporte exactas y nunca filtra cancha/formacion de futbol a deportes US", () => {
    const mlbGame = makeGame({
      id: "mlb-test",
      league: asLeagueId("mlb"),
      leagueLabel: "MLB",
      sport: "baseball",
    });
    const nhlGame = makeGame({
      id: "nhl-test",
      league: asLeagueId("nhl"),
      leagueLabel: "NHL",
      sport: "ice-hockey",
    });
    const nbaGame = makeGame({
      id: "nba-test",
      league: asLeagueId("nba"),
      leagueLabel: "NBA",
      sport: "basketball",
    });

    const ratesSnapshot = {
      teamRates: {
        "laliga.fc-barcelona": {
          teamId: "laliga.fc-barcelona",
          name: "FC Barcelona",
          forPerGame: 4.5,
          againstPerGame: 3.1,
          gamesPlayed: 10,
        },
        "laliga.real-madrid": {
          teamId: "laliga.real-madrid",
          name: "Real Madrid",
          forPerGame: 3.9,
          againstPerGame: 3.4,
          gamesPlayed: 10,
        },
      },
    };

    expect(
      buildMatchEnfrentamientos({
        game: mlbGame,
        leagueLabel: "MLB",
        snapshot: ratesSnapshot,
        homeHistory: [],
        awayHistory: [],
      }).rankings?.attack[0]?.label,
    ).toBe("Carreras anotadas / PJ");

    expect(
      buildMatchEnfrentamientos({
        game: nhlGame,
        leagueLabel: "NHL",
        snapshot: ratesSnapshot,
        homeHistory: [],
        awayHistory: [],
      }).rankings?.attack[0]?.label,
    ).toBe("Goles anotados / PJ");

    expect(
      buildMatchEnfrentamientos({
        game: nbaGame,
        leagueLabel: "NBA",
        snapshot: ratesSnapshot,
        homeHistory: [],
        awayHistory: [],
      }).rankings?.attack[0]?.label,
    ).toBe("Puntos anotados / PJ");

    expect(
      buildEnrichedMatchLineups({
        game: nbaGame,
        homeSquad,
        awaySquad,
        confirmedLineups: {
          status: "confirmed",
          sourceLabel: "Oficial",
          verifiedAtUtc: "2026-11-22T12:00:00Z",
          homeFormation: "4-3-3",
          homeStarters: [{ name: "Star" }],
          awayStarters: [{ name: "Star 2" }],
        },
        sanitizePhotoKey: sanitize,
      }),
    ).toBeNull();
  });

  it("respeta presupuesto de shell RSC (<= 480 KB) y Cero-Fuga en preview real", async () => {
    const visitorShell = loadInitialShellDatasetForAccess(false);
    const memberShell = loadInitialShellDatasetForAccess(true);
    const visitorBytes = Buffer.byteLength(JSON.stringify(visitorShell), "utf8");
    const memberBytes = Buffer.byteLength(JSON.stringify(memberShell), "utf8");
    expect(visitorBytes).toBeLessThanOrEqual(480 * 1024);
    expect(memberBytes).toBeLessThanOrEqual(480 * 1024);

    const sampleGame = memberShell.games.find((g) => g.league === "laliga" && g.status !== "FT") ?? memberShell.games[0];
    expect(sampleGame).toBeDefined();
    if (!sampleGame) return;

    const visitorPreview = await loadGamePreviewPayload(sampleGame.id, false);
    const memberPreview = await loadGamePreviewPayload(sampleGame.id, true);
    expect(visitorPreview?.fullAccess).toBe(false);
    expect(visitorPreview?.detail.markets).toEqual([]);
    expect(visitorPreview?.detail.playerPicks ?? []).toEqual([]);
    expect(
      (visitorPreview?.detail.enfrentamientos?.rankings?.attack ?? []).some(
        (r) => r.key === "adjusted_offense",
      ),
    ).toBe(false);
    const previewJson = JSON.stringify(memberPreview);
    expect(previewJson).not.toMatch(/sofascore|a\.espncdn\.com|mlbstatic\.com/i);
  });
});
