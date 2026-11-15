import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";
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
      { id: "elo", label: "Índice de fuerza Elo", value: "1,712 pts", tone: "brand" },
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
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("Datos del modelo");
    expect(html).toContain("1,712 pts");
    expect(html).toContain("Estadio BBVA");
    expect(html).toContain("1.70");
    expect(html).toContain("1.20");
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
});
