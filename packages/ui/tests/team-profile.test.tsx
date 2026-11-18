import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import { badgeFactsFromEntries, computeBadges } from "../src/platform/badges";
import { ProfileBadgesSection } from "../src/platform/club/badges/ProfileBadges";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";
import { PlayerProfileClubView } from "../src/platform/club/team/PlayerProfileClubView";
import { TeamProfileClubView, type TeamProfileData } from "../src/platform/club/team/TeamProfileClubView";

const EMPTY_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "2026",
    roundLabel: "",
    generatedAt: "2026-11-15T12:00:00Z",
    games: [],
    standings: [],
  },
]);

const BASE_SOCCER: TeamProfileData = {
  league: asLeagueId("liga-mx"),
  leagueLabel: "Liga MX",
  sport: "football",
  seasonLabel: "Apertura 2026",
  updatedAt: "15 nov 2026",
  team: {
    id: "liga-mx.monterrey",
    slug: "monterrey",
    name: "Rayados de Monterrey",
    shortName: "Monterrey",
    code: "MTY",
  },
  standing: {
    rank: 2,
    totalTeams: 18,
    played: 16,
    won: 10,
    drawn: 3,
    lost: 3,
    goalsFor: 31,
    goalsAgainst: 17,
    goalDiff: 14,
    points: 33,
  },
  venue: {
    name: "Estadio BBVA",
    elevationM: 537,
    roofType: "open",
  },
  injuries: [],
  recentAverages: {
    sampleGames: 5,
    scoredAvg: 2.0,
    concededAvg: 1.0,
    marginAvg: 1.0,
    cleanSheets: 2,
    wins: 3,
    draws: 1,
    losses: 1,
    homeRecord: { games: 3, wins: 2, draws: 1, losses: 0, scoredAvg: 2.3, concededAvg: 1.0 },
    awayRecord: { games: 2, wins: 1, draws: 0, losses: 1, scoredAvg: 1.5, concededAvg: 1.0 },
    streak: ["G", "E", "P", "G", "G"],
  },
  modelSection: {
    locked: false,
    engineLabel: "Tachyon v3.0 · Índice de fuerza",
    sampleNote: "Calibración con 16 partidos",
    updatedLabel: "15 nov 2026",
    metrics: [
      { id: "strength", label: "Índice de fuerza", value: "1,712 pts", tone: "brand" },
    ],
    unavailableReason: null,
  },
  upcomingFixtures: [
    {
      id: "g-next",
      gameHref: "/app/liga-mx/games/g-next",
      dateLabel: "sáb, 22 nov",
      kickoffLocal: "21:00",
      round: "Jornada 17",
      venue: "Estadio BBVA",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "america", name: "Club América", shortName: "América", href: "/app/liga-mx/teams/america" },
      hasForecast: true,
      isRedacted: false,
      projectedTeamScore: 1.7,
      projectedOpponentScore: 1.2,
      winProbability: 0.49,
      confidenceLabel: "Confianza media",
    },
  ],
  recentMatches: [
    {
      id: "r1",
      gameHref: null,
      date: "2026-11-10",
      dateLabel: "10 nov 2026",
      round: "Jornada 16",
      isHome: true,
      neutralSite: false,
      opponent: { slug: "cruz-azul", name: "Cruz Azul", shortName: "Cruz Azul", href: "/app/liga-mx/teams/cruz-azul" },
      teamScore: 2,
      opponentScore: 1,
      outcome: "G",
      resultNote: null,
    },
  ],
  relatedTeams: [],
};

describe("TeamProfileClubView", () => {
  it("renderiza pestañas accesibles role=tablist/tabpanel y contenido de fútbol en miembro", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="member">
        <TeamProfileClubView profile={BASE_SOCCER} initialTab="resumen" />
      </PlatformProvider>,
    );

    expect(html).toContain("Rayados de Monterrey");
    expect(html).toContain('aria-label="Ruta del equipo"');
    expect(html).toContain("México · Guadalupe");
    expect(html).not.toContain("Nuevo León");
    expect(html).toContain("Estadio BBVA");
    expect(html).toContain("Entrenador");
    expect(html).toContain("Sin registro");
    expect(html).toContain("Récord en torneo");
    expect(html).toContain("Efectividad");
    expect(html).toContain("Balance goleador");
    expect(html).not.toContain("Tabla general");
    expect(html).toContain("Partido anterior");
    expect(html).toContain("Partido siguiente");
    expect(html).toContain("10/11/26");
    expect(html).not.toContain("crest-pedestal");
    expect(html).not.toContain("pl-pill--brand");
    expect(html).toContain("pl-team-standing-inline");
    expect(html).toContain("pl-team-updated-text");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("pl-team-workspace");
    expect(html).toContain("Estadísticas");
    expect(html).toContain("Plantilla");
    expect(html).toContain("Lista");
    expect(html).toContain("Calendario");
    expect(html).toContain("Finalizados");
    expect(html).toContain("Próximos");
    expect(html).toContain("Datos del modelo");
    expect(html).toContain("1,712 pts");
    expect(html).not.toContain("Proy. 1.70");
    expect(html).toContain("49%");
  });

  it("bloquea métricas del modelo y pronóstico en modo visitante (Cero-Fuga)", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="visitor">
        <TeamProfileClubView profile={BASE_SOCCER} initialTab="partidos" />
      </PlatformProvider>,
    );

    expect(html).toContain("Pase PitchLab Ultra");
    expect(html).not.toContain("1,712 pts");
    expect(html).not.toContain("1.70");
    expect(html).toContain("Cruz Azul");
  });

  it("omite empates cuando el deporte es NBA y muestra estado vacío honesto cuando faltan métricas", () => {
    const nbaEmpty: TeamProfileData = {
      ...BASE_SOCCER,
      league: asLeagueId("nba"),
      leagueLabel: "NBA",
      sport: "basketball",
      standing: null,
      recentAverages: {
        ...BASE_SOCCER.recentAverages,
        draws: 0,
        cleanSheets: null,
        homeRecord: { games: 3, wins: 2, draws: 0, losses: 1, scoredAvg: 115.4, concededAvg: 110.2 },
        awayRecord: { games: 2, wins: 1, draws: 0, losses: 1, scoredAvg: 112.0, concededAvg: 113.5 },
        streak: ["G", "P", "G", "G", "P"],
      },
      modelSection: {
        locked: false,
        engineLabel: "Motor NBA · Ritmo y eficiencia",
        sampleNote: null,
        updatedLabel: null,
        metrics: [],
        unavailableReason: "Este corte aún no incluye métricas ajustadas del modelo para este equipo.",
      },
    };

    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="member">
        <TeamProfileClubView profile={nbaEmpty} initialTab="resumen" />
      </PlatformProvider>,
    );

    expect(html).toContain("Este corte aún no incluye métricas ajustadas del modelo");
    expect(html).toContain("3G - 1P");
    expect(html).not.toContain("Empates");
    expect(html).not.toContain("3G - 0E - 1P");
  });

  it("resuelve País · Ciudad con pin y estadio aunque el snapshot traiga solo el país", () => {
    const troyes: TeamProfileData = {
      ...BASE_SOCCER,
      league: asLeagueId("ligue-1"),
      leagueLabel: "Ligue 1",
      seasonLabel: "2026/27",
      team: {
        id: "ligue-1.es-troyes",
        slug: "es-troyes",
        name: "ES Troyes AC",
        shortName: "Troyes",
        code: "ESTAC",
      },
      venue: {
        name: "Francia",
        elevationM: null,
        roofType: null,
      },
    };

    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="member">
        <TeamProfileClubView profile={troyes} initialTab="resumen" />
      </PlatformProvider>,
    );

    expect(html).toContain("Francia · Troyes");
    expect(html).not.toContain("Gran Este");
    expect(html).toContain("Stade de l&#x27;Aube");
    expect(html).toContain("pl-team-stadium-tag");
  });

  it("muestra la tarjeta En Vivo en la cabecera cuando el equipo está jugando y usa PlSelect curado", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="member">
        <TeamProfileClubView
          profile={BASE_SOCCER}
          initialTab="resumen"
          liveBoardOverride={{
            generatedAt: "2026-11-22T21:27:00Z",
            sourceFetchedAt: "2026-11-22T21:27:00Z",
            active: true,
            nextPollSeconds: 20,
            notice: null,
            entries: [
              {
                gameId: "g-next",
                league: "liga-mx",
                phase: "live",
                clock: "27",
                minute: 27,
                score: { home: 1, away: 0 },
                htScore: null,
                redCards: null,
                kickoffUtc: "2026-11-22T21:00:00Z",
              },
            ],
          }}
        />
      </PlatformProvider>,
    );

    expect(html).toContain("data-team-live-slot");
    expect(html).toContain("En Vivo");
    expect(html).toContain("27&#x27;");
    expect(html).not.toContain("Partido anterior");
    expect(html).toContain("data-pl-select");
    expect(html).not.toContain('class="pl-tmr-select"');
  });

  it("unifica pestañas y plantilla agrupada por demarcación con datos reales y lesiones sin sub-filtros extra", () => {
    const withSquad: TeamProfileData = {
      ...BASE_SOCCER,
      injuries: [
        {
          player: "Luis Díaz",
          position: "LW",
          status: "Lesionado",
          detail: "Isquiotibiales",
          reportedAt: "2026-11-15",
        },
      ],
      squad: {
        coachName: "Martín Demichelis",
        updatedAt: "15 nov 2026",
        players: [
          {
            id: "p-fwd",
            slug: "german-berterame",
            name: "Germán Berterame",
            shortName: "G. Berterame",
            jersey: "7",
            positionGroup: "FWD",
            positionLabel: "ST",
            age: 28,
            heightCm: 179,
            weightKg: 75,
            nationality: "Argentina",
            nationalityCode: "ARG",
            stats: {
              appearances: 16,
              subIns: 1,
              goals: 8,
              assists: 2,
              shots: 39,
              shotsOnTarget: 18,
              foulsCommitted: 10,
              foulsSuffered: 14,
              yellowCards: 2,
              redCards: 0,
              offsides: 6,
              saves: 0,
              shotsFaced: 0,
              goalsConceded: 0,
            },
            candidatePicks: [],
          },
          {
            id: "p-mid",
            slug: "luis-diaz",
            name: "Luis Díaz",
            shortName: "L. Díaz",
            jersey: "14",
            positionGroup: "MID",
            positionLabel: "LW",
            age: 29,
            heightCm: 178,
            weightKg: 73,
            nationality: "Colombia",
            nationalityCode: "COL",
            stats: {
              appearances: 12,
              subIns: 0,
              goals: 5,
              assists: 4,
              shots: 28,
              shotsOnTarget: 13,
              foulsCommitted: 8,
              foulsSuffered: 21,
              yellowCards: 1,
              redCards: 0,
              offsides: 3,
              saves: 0,
              shotsFaced: 0,
              goalsConceded: 0,
            },
            candidatePicks: [],
          },
          {
            id: "p-gk",
            slug: "esteban-andrada",
            name: "Esteban Andrada",
            shortName: "E. Andrada",
            jersey: "1",
            positionGroup: "GK",
            positionLabel: "GK",
            age: 35,
            heightCm: 194,
            weightKg: 88,
            nationality: "Argentina",
            nationalityCode: "ARG",
            stats: {
              appearances: 16,
              subIns: 0,
              goals: 0,
              assists: 0,
              shots: 0,
              shotsOnTarget: 0,
              foulsCommitted: 1,
              foulsSuffered: 2,
              yellowCards: 1,
              redCards: 0,
              offsides: 0,
              saves: 47,
              shotsFaced: 64,
              goalsConceded: 17,
            },
            candidatePicks: [],
          },
        ],
      },
    };

    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="member">
        <TeamProfileClubView profile={withSquad} initialTab="plantilla" />
      </PlatformProvider>,
    );

    expect(html).toContain("pl-team-main-sheet");
    expect(html).toContain("Delanteros");
    expect(html).toContain("Centrocampistas");
    expect(html).toContain("Porteros");
    expect(html).toContain("G / A");
    expect(html).toContain("Tiros (TaP)");
    expect(html).toContain("Atajadas");
    expect(html).toContain("8 / 2");
    expect(html).toContain("39 (18)");
    expect(html).toContain("Lesionado");
    expect(html).toContain("Isquiotibiales");
    expect(html).not.toContain("Mejores jugadores");
    expect(html).not.toContain("Valor de mercado");
    expect(html).not.toContain("Club anterior");
    expect(html).not.toContain("Contrato");
  });

  it("muestra insignias compactas con detalle en role=tooltip al hacer hover o foco", () => {
    const all = computeBadges(badgeFactsFromEntries([]), new Date("2026-11-18T12:00:00Z"));
    const html = renderToStaticMarkup(
      <ProfileBadgesSection
        isOwn
        publicBadges={[]}
        own={{
          all,
          publicIds: [],
          featuredIds: [],
          canFeature: false,
          saving: false,
        }}
      />,
    );

    expect(html).toContain('role="tooltip"');
    expect(html).toContain("Ojo fino");
    expect(html).not.toContain("pl-badge-tile-criterion");
  });

  it("renderiza fotos reales de entrenador y jugadores, ficha táctica y perfil individual con prioridad LCP", () => {
    const withPhotos: TeamProfileData = {
      ...BASE_SOCCER,
      squad: {
        coachName: "Vincent Kompany",
        coach: {
          name: "Vincent Kompany",
          shortName: "V. Kompany",
          photoKey: "pl-m:246",
          nationality: "Bélgica",
          nationalityCode: "BEL",
          preferredFormation: "4-2-3-1",
          styleLabel: "Posesión ofensiva · Presión alta",
          careerRecord: {
            matches: 180,
            wins: 112,
            draws: 34,
            losses: 34,
            winPct: 62.2,
          },
        },
        updatedAt: "18 nov 2026",
        players: [
          {
            id: "bz-2462",
            slug: "harry-kane",
            name: "Harry Kane",
            shortName: "H. Kane",
            jersey: "9",
            positionGroup: "FWD",
            positionLabel: "ST",
            age: 33,
            birthDate: "1993-07-28",
            heightCm: 188,
            weightKg: 86,
            preferredFoot: "R",
            nationality: "Inglaterra",
            nationalityCode: "ENG",
            photoKey: "pl-p:2462",
            availability: "available",
            stats: {
              appearances: 14,
              subIns: 0,
              goals: 15,
              assists: 5,
              shots: 48,
              shotsOnTarget: 26,
              foulsCommitted: 6,
              foulsSuffered: 19,
              yellowCards: 1,
              redCards: 0,
              offsides: 5,
              saves: 0,
              shotsFaced: 0,
              goalsConceded: 0,
            },
            candidatePicks: [],
          },
        ],
      },
    };

    const summaryHtml = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="member">
        <TeamProfileClubView profile={withPhotos} initialTab="resumen" />
      </PlatformProvider>,
    );
    expect(summaryHtml).toContain("Vincent Kompany");
    expect(summaryHtml).toContain("4-2-3-1");
    expect(summaryHtml).toContain("data-team-coach-card");
    expect(summaryHtml).toContain("https://sports.bzzoiro.com/img/manager/246/");

    const squadHtml = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="member">
        <TeamProfileClubView profile={withPhotos} initialTab="plantilla" />
      </PlatformProvider>,
    );
    expect(squadHtml).toContain("https://sports.bzzoiro.com/img/player/2462/");
    expect(squadHtml).toContain("28/7/1993");
    expect(squadHtml).toContain('loading="lazy"');

    const playerHtml = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="member">
        <PlayerProfileClubView
          profile={{
            league: BASE_SOCCER.league,
            leagueLabel: BASE_SOCCER.leagueLabel,
            sport: "football",
            seasonLabel: BASE_SOCCER.seasonLabel,
            updatedAt: "18 nov 2026",
            team: BASE_SOCCER.team,
            coachName: "Vincent Kompany",
            coach: withPhotos.squad?.coach ?? null,
            player: withPhotos.squad!.players[0]!,
            picksLocked: false,
            nextFixture: null,
            teammates: [
              {
                slug: "jamal-musiala",
                name: "Jamal Musiala",
                shortName: "J. Musiala",
                jersey: "42",
                positionGroup: "MID",
                photoKey: "pl-p:2465",
                href: "/app/liga-mx/teams/monterrey/players/jamal-musiala",
              },
            ],
          }}
        />
      </PlatformProvider>,
    );

    expect(playerHtml).toContain("Harry Kane");
    expect(playerHtml).toMatch(/fetchpriority="high"/i);
    expect(playerHtml).toContain("28/7/1993");
    expect(playerHtml).toContain("Derecho");
    expect(playerHtml).toContain("DT: Vincent Kompany");
    expect(playerHtml).toContain("https://sports.bzzoiro.com/img/player/2465/");
  });
});
