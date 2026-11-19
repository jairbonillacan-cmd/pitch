import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";
import {
  CompareHubView,
  type CompareLeagueCatalog,
  type ComparePlayerOption,
  type PlayerComparisonPayload,
  type TeamComparisonPayload,
} from "../src/platform/club/CompareHubView";
import { PlayerProfileClubView } from "../src/platform/club/team/PlayerProfileClubView";
import { MatchMoneyPanel } from "../src/platform/club/match/MatchMoneyPanel";
import { PwaAndPushSection } from "../src/platform/club/account/PwaAndPushSection";
import { buildNotifications } from "../src/platform/notifications";
import type { PlatformGame } from "../src/platform/types";

const BASE_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura 2026",
    roundLabel: "Jornada 16",
    generatedAt: "2026-11-19T12:00:00Z",
    games: [],
    standings: [],
  },
]);

const SAMPLE_CATALOG: CompareLeagueCatalog[] = [
  {
    league: asLeagueId("liga-mx"),
    label: "Liga MX",
    sport: "football",
    teams: [
      { slug: "america", name: "Club América", shortName: "América", rank: 1 },
      { slug: "chivas", name: "Chivas Guadalajara", shortName: "Chivas", rank: 2 },
    ],
  },
];

const SAMPLE_TEAM_CMP: TeamComparisonPayload = {
  league: asLeagueId("liga-mx"),
  leagueLabel: "Liga MX",
  sport: "football",
  seasonLabel: "Apertura 2026",
  teamA: {
    slug: "america",
    name: "Club América",
    shortName: "América",
    code: "AME",
    rank: 1,
    recordLabel: "8G-6E-2P",
    pointsLabel: "30 pts",
    streak: ["G", "E", "G", "G", "E"],
    coachName: "André Jardine",
    coachPhotoKey: null,
    href: "/app/liga-mx/teams/america",
  },
  teamB: {
    slug: "chivas",
    name: "Chivas Guadalajara",
    shortName: "Chivas",
    code: "GDL",
    rank: 2,
    recordLabel: "8G-6E-2P",
    pointsLabel: "30 pts",
    streak: ["G", "P", "G", "E", "G"],
    coachName: "Gabriel Milito",
    coachPhotoKey: null,
    href: "/app/liga-mx/teams/chivas",
  },
  metrics: [
    {
      id: "for-avg",
      label: "Goles a favor / PJ",
      valueA: "2.38",
      valueB: "1.63",
      numA: 2.38,
      numB: 1.63,
    },
  ],
  h2hSummary: { played: 1, winsA: 1, draws: 0, winsB: 0 },
  h2hMatches: [
    {
      id: "h1",
      dateLabel: "14 sep 2026",
      round: "Jornada 8",
      homeName: "América",
      awayName: "Chivas",
      homeScore: 2,
      awayScore: 1,
      winner: "A",
      gameHref: null,
    },
  ],
};

const SAMPLE_PLAYER_OPTIONS: ComparePlayerOption[] = [
  {
    ref: "los-angeles-dodgers:shohei-ohtani",
    name: "Shohei Ohtani",
    shortName: "S. Ohtani",
    teamSlug: "los-angeles-dodgers",
    teamName: "Los Angeles Dodgers",
    positionLabel: "DH",
    jersey: "17",
    photoKey: null,
    fallbackPhotoKey: null,
  },
  {
    ref: "new-york-yankees:aaron-judge",
    name: "Aaron Judge",
    shortName: "A. Judge",
    teamSlug: "new-york-yankees",
    teamName: "New York Yankees",
    positionLabel: "RF",
    jersey: "99",
    photoKey: null,
    fallbackPhotoKey: null,
  },
];

const SAMPLE_PLAYER_CMP: PlayerComparisonPayload = {
  league: asLeagueId("mlb"),
  leagueLabel: "MLB",
  sport: "baseball",
  seasonLabel: "Temporada 2026",
  playerA: {
    ref: "los-angeles-dodgers:shohei-ohtani",
    name: "Shohei Ohtani",
    shortName: "S. Ohtani",
    teamSlug: "los-angeles-dodgers",
    teamName: "Los Angeles Dodgers",
    positionLabel: "DH",
    jersey: "17",
    age: 32,
    heightCm: 193,
    weightKg: 95,
    nationality: "Japón",
    photoKey: null,
    fallbackPhotoKey: null,
    href: "/app/mlb/teams/los-angeles-dodgers/players/shohei-ohtani",
  },
  playerB: {
    ref: "new-york-yankees:aaron-judge",
    name: "Aaron Judge",
    shortName: "A. Judge",
    teamSlug: "new-york-yankees",
    teamName: "New York Yankees",
    positionLabel: "RF",
    jersey: "99",
    age: 34,
    heightCm: 201,
    weightKg: 128,
    nationality: "Estados Unidos",
    photoKey: null,
    fallbackPhotoKey: null,
    href: "/app/mlb/teams/new-york-yankees/players/aaron-judge",
  },
  metrics: [{ id: "hr", label: "HR", valueA: "30", valueB: "46", numA: 30, numB: 46 }],
};

function makeSampleGame(): PlatformGame {
  return {
    id: "mx-ame-chv",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 16",
    dayId: "2026-11-20",
    dayLabel: "Vie 20 nov",
    kickoffUtc: "2026-11-20T20:00:00.000Z",
    kickoffLocal: "14:00",
    venue: "Estadio Azteca",
    status: "NS",
    home: {
      slug: "america",
      name: "Club América",
      shortName: "América",
      code: "AME",
      record: "8G-6E-2P",
    },
    away: {
      slug: "chivas",
      name: "Chivas Guadalajara",
      shortName: "Chivas",
      code: "GDL",
      record: "8G-6E-2P",
    },
    hasForecast: true,
    x12: [0.51, 0.27, 0.22],
    projection: { home: 1.7, away: 1.1, total: 2.8 },
    confidenceScore: 76,
    confidenceLevel: "alta",
    preGame: {
      cortexSynthesis: "Ritmo equilibrado",
      tacticalKeys: [],
      lineupStatusLabel: "Once estimado",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "19 nov 2026",
    spacetime: null,
    picks: [
      {
        id: "pk-move-1",
        gameId: "mx-ame-chv",
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        matchLabel: "América vs Chivas",
        kickoffLocal: "14:00",
        gameStatus: "NS",
        slotIndex: 0,
        category: "valor",
        categoryLabel: "Valor",
        risk: "medio",
        engineKey: "geodesic",
        engineName: "Spacetime",
        marketGroup: "1X2",
        selectionKey: "home",
        conflictGroup: "home_side",
        label: "América gana",
        rationale: "Ventaja de local",
        p: 0.513,
        fairDecimal: 1.95,
        fairAmerican: -105,
        marketDecimal: 2.12,
        marketAmerican: 112,
        marketBookLabel: "Bet365",
        edgePts: 4.1,
        confidenceScore: 76,
        suggestedUnits: 1,
        isRedacted: false,
        bookQuotes: [
          {
            book: "bet365",
            bookLabel: "Bet365",
            decimal: 2.12,
            capturedAtUtc: "2026-11-20T14:30:00.000Z",
            openingDecimal: 1.92,
            movementDirection: "drifting",
            isBest: true,
          },
          {
            book: "pinnacle",
            bookLabel: "Pinnacle",
            decimal: 2.04,
            capturedAtUtc: "2026-11-20T14:30:00.000Z",
            openingDecimal: 1.92,
            movementDirection: "drifting",
          },
        ],
      },
    ],
  };
}

describe("Nuevas vistas Paso 2: Comparador H2H, Perfil MLB, Movimiento de línea y PWA/Push", () => {
  it("CompareHubView renderiza Equipos H2H y Jugadores con barras e historial directo", () => {
    const htmlTeams = renderToStaticMarkup(
      <PlatformProvider dataset={BASE_DATASET} initialRole="member">
        <CompareHubView
          initialMode="equipos"
          initialLeague={asLeagueId("liga-mx")}
          catalog={SAMPLE_CATALOG}
          initialTeamComparison={SAMPLE_TEAM_CMP}
          initialPlayerOptions={SAMPLE_PLAYER_OPTIONS}
          initialPlayerComparison={SAMPLE_PLAYER_CMP}
          disableLiveFetch
        />
      </PlatformProvider>,
    );
    expect(htmlTeams).toContain("Comparador H2H");
    expect(htmlTeams).toContain("Historial directo (H2H)");
    expect(htmlTeams).toContain("2.38");

    const htmlPlayers = renderToStaticMarkup(
      <PlatformProvider dataset={BASE_DATASET} initialRole="member">
        <CompareHubView
          initialMode="jugadores"
          initialLeague={asLeagueId("mlb")}
          catalog={SAMPLE_CATALOG}
          initialTeamComparison={SAMPLE_TEAM_CMP}
          initialPlayerOptions={SAMPLE_PLAYER_OPTIONS}
          initialPlayerComparison={SAMPLE_PLAYER_CMP}
          disableLiveFetch
        />
      </PlatformProvider>,
    );
    expect(htmlPlayers).toContain("Shohei Ohtani");
    expect(htmlPlayers).toContain("Aaron Judge");
    expect(htmlPlayers).toContain("46");
  });

  it("PlayerProfileClubView renderiza seasonMetrics MLB, tabla Últimos 5 partidos y enlace Comparar", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={BASE_DATASET} initialRole="member">
        <PlayerProfileClubView
          profile={{
            league: asLeagueId("mlb"),
            leagueLabel: "MLB",
            sport: "baseball",
            seasonLabel: "Temporada 2026",
            updatedAt: "19 nov 2026",
            team: {
              id: "mlb.los-angeles-dodgers",
              slug: "los-angeles-dodgers",
              name: "Los Angeles Dodgers",
              shortName: "Dodgers",
              code: "LAD",
            },
            coachName: "Dave Roberts",
            coach: {
              name: "Dave Roberts",
              photoKey: "/brand/official/coaches/mlb/los-angeles-dodgers.webp",
            },
            player: {
              id: "39832",
              slug: "shohei-ohtani",
              name: "Shohei Ohtani",
              shortName: "S. Ohtani",
              jersey: "17",
              positionGroup: "FWD",
              positionLabel: "DH",
              age: 32,
              birthDate: "1994-07-05",
              heightCm: 193,
              weightKg: 95,
              nationality: "Japón",
              nationalityCode: "JPN",
              photoKey: null,
              availability: "available",
              stats: {
                appearances: 135,
                subIns: 0,
                goals: 0,
                assists: 0,
                shots: 0,
                shotsOnTarget: 0,
                foulsCommitted: 0,
                foulsSuffered: 0,
                yellowCards: 0,
                redCards: 0,
                offsides: 0,
                saves: 0,
                shotsFaced: 0,
                goalsConceded: 0,
              },
              seasonMetrics: [
                { key: "avg", label: "AVG", value: ".275", detail: "144 H en 523 AB" },
                { key: "hr", label: "HR", value: "30" },
              ],
              recentGames: [
                {
                  dateIso: "2026-10-07",
                  opponent: "Atlanta Braves",
                  opponentAbbr: "ATL",
                  isHome: false,
                  score: "4-1",
                  result: "W",
                  stats: [
                    { label: "AB", value: "4" },
                    { label: "HR", value: "1" },
                  ],
                },
              ],
              candidatePicks: [],
            },
            picksLocked: false,
            lastMatch: null,
            nextFixture: null,
            teammates: [],
          }}
        />
      </PlatformProvider>,
    );

    expect(html).toContain(".275");
    expect(html).toContain("Últimos 5 partidos");
    expect(html).toContain("ATL");
    expect(html).toContain("/app/comparar?modo=jugadores&amp;liga=mlb");
  });

  it("MatchMoneyPanel muestra gráfica de movimiento de línea y omite cuota justa cuando está bloqueado", () => {
    const gameWithMovement = makeSampleGame();
    const htmlUnlocked = renderToStaticMarkup(
      <PlatformProvider dataset={BASE_DATASET} initialRole="member">
        <MatchMoneyPanel
          game={gameWithMovement}
          markets={[]}
          oddsFormat="decimal"
          unlocked
          isFinished={false}
          onOpenNumbers={() => undefined}
        />
      </PlatformProvider>,
    );
    expect(htmlUnlocked).toContain("data-odds-movement-chart");
    expect(htmlUnlocked).toContain("Movimiento de línea");
    expect(htmlUnlocked).toContain("Subió +0.20");
    expect(htmlUnlocked).toContain("Justo:");

    const htmlLocked = renderToStaticMarkup(
      <PlatformProvider dataset={BASE_DATASET} initialRole="visitor">
        <MatchMoneyPanel
          game={gameWithMovement}
          markets={[]}
          oddsFormat="decimal"
          unlocked={false}
          isFinished={false}
          onOpenNumbers={() => undefined}
        />
      </PlatformProvider>,
    );
    expect(htmlLocked).toContain("data-odds-movement-chart");
    expect(htmlLocked).not.toContain("Justo:");
  });

  it("buildNotifications genera alerta de movimiento de línea y respeta isRedacted", () => {
    const now = new Date("2026-11-20T15:00:00Z");
    const game = makeSampleGame();

    const alerts = buildNotifications({
      games: [game],
      watchlistGameIds: [game.id],
      journal: [],
      oddsFormat: "decimal",
      now,
      generatedAtIso: now.toISOString(),
    });

    const moveAlert = alerts.find((a) => a.id === "line-move:pk-move-1");
    expect(moveAlert).toBeDefined();
    expect(moveAlert?.kind).toBe("cuotas");
    expect(moveAlert?.priority).toBe("urgent");
    expect(moveAlert?.title).toContain("Línea al alza");
    expect(moveAlert?.context.lead).toContain("superó la cuota justa");

    const redactedGame: PlatformGame = {
      ...game,
      picks: [{ ...game.picks[0]!, isRedacted: true }],
    };
    const redactedAlerts = buildNotifications({
      games: [redactedGame],
      watchlistGameIds: [redactedGame.id],
      journal: [],
      oddsFormat: "decimal",
      now,
      generatedAtIso: now.toISOString(),
    });
    const redactedMove = redactedAlerts.find((a) => a.id === "line-move:pk-move-1");
    expect(redactedMove?.title).not.toContain("América gana");
    expect(redactedMove?.context.lead).not.toContain("cuota justa");
  });

  it("PwaAndPushSection oculta el botón Instalar sin soporte y muestra temas push cuando está activo", () => {
    const htmlOff = renderToStaticMarkup(
      <PwaAndPushSection accountsEnabled={false} canPersistServer={false} />,
    );
    expect(htmlOff).not.toContain("data-pwa-install-btn");

    const htmlOn = renderToStaticMarkup(
      <PwaAndPushSection
        accountsEnabled
        canPersistServer
        storyPushState={{ configured: true, subscribed: true, installAvailable: true }}
      />,
    );
    expect(htmlOn).toContain("data-pwa-install-btn");
    expect(htmlOn).toContain("Picks liquidados");
    expect(htmlOn).toContain("Inicio 60 min y goles en vivo");
  });
});
