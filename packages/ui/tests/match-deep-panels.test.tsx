import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import type {
  MatchEnfrentamientosData,
  MatchEnrichedLineups,
  MatchInjuryItem,
  MatchPlayerPickItem,
} from "../src/platform/types";
import {
  MatchEnfrentamientosPanel,
  buildEnfrentamientosRankingRows,
  filterEnfrentamientosHistory,
} from "../src/platform/club/match/MatchEnfrentamientosPanel";
import { MatchInjuriesPanel } from "../src/platform/club/match/MatchInjuriesPanel";
import {
  MatchLineupsPanel,
  buildLineupMetricChip,
} from "../src/platform/club/match/MatchLineupsPanel";
import {
  MatchPlayerPicksBoard,
  filterPlayerPicks,
} from "../src/platform/club/match/MatchPlayerPicksBoard";

const PLAYER_PICKS: readonly MatchPlayerPickItem[] = [
  {
    id: "p-over",
    playerName: "Álex Berenguer",
    playerSlug: "alex-berenguer",
    teamSide: "home",
    teamName: "Athletic Club",
    teamSlug: "athletic-club",
    positionLabel: "EI",
    photoKey: null,
    fallbackPhotoKey: null,
    playerHref: "/app/laliga/t/athletic-club/p/alex-berenguer",
    marketKey: "player_sot",
    marketLabel: "Tiros a puerta",
    direction: "over",
    selectionLabel: "Más de 0.5 tiros a puerta",
    line: 0.5,
    p: 0.62,
    fairDecimal: 1.61,
    marketDecimal: 1.9,
    marketBookLabel: "Bet365",
    evPct: 17.8,
    evidenceBullets: [{ label: "4/5 en casa", ratePct: 80, tone: "green" }],
    pick: {
      id: "p-over",
      gameId: "g1",
      league: asLeagueId("laliga"),
      leagueLabel: "LaLiga",
      matchLabel: "Athletic vs Real Sociedad",
      kickoffLocal: "14:00",
      gameStatus: "NS",
      slotIndex: 50,
      category: "tactico",
      categoryLabel: "Tiros a puerta",
      risk: "medio",
      engineKey: "tachyon",
      engineName: "Tachyon",
      marketGroup: "Tiros a puerta",
      selectionKey: "player_sot:berenguer:0.5",
      market: "player_sot",
      line: 0.5,
      conflictGroup: "independent",
      label: "Á. Berenguer · Más de 0.5 tiros a puerta",
      rationale: "4/5 en casa",
      p: 0.62,
      fairDecimal: 1.61,
      fairAmerican: -164,
      marketDecimal: 1.9,
      marketAmerican: -111,
      edgePts: 9.4,
      confidenceScore: 62,
      suggestedUnits: 0.75,
    },
  },
  {
    id: "p-under",
    playerName: "Mikel Oyarzabal",
    playerSlug: "mikel-oyarzabal",
    teamSide: "away",
    teamName: "Real Sociedad",
    teamSlug: "real-sociedad",
    positionLabel: "DC",
    photoKey: null,
    fallbackPhotoKey: null,
    playerHref: "/app/laliga/t/real-sociedad/p/mikel-oyarzabal",
    marketKey: "player_shots",
    marketLabel: "Tiros totales",
    direction: "under",
    selectionLabel: "Menos de 2.5 tiros",
    line: 2.5,
    p: 0.55,
    fairDecimal: 1.82,
    marketDecimal: null,
    marketBookLabel: null,
    evPct: null,
    evidenceBullets: [],
    pick: {
      id: "p-under",
      gameId: "g1",
      league: asLeagueId("laliga"),
      leagueLabel: "LaLiga",
      matchLabel: "Athletic vs Real Sociedad",
      kickoffLocal: "14:00",
      gameStatus: "NS",
      slotIndex: 51,
      category: "tactico",
      categoryLabel: "Tiros totales",
      risk: "medio",
      engineKey: "tachyon",
      engineName: "Tachyon",
      marketGroup: "Tiros totales",
      selectionKey: "player_shots:oyarzabal:2.5",
      market: "player_shots",
      line: 2.5,
      conflictGroup: "independent",
      label: "M. Oyarzabal · Menos de 2.5 tiros",
      rationale: "6/10 debajo",
      p: 0.55,
      fairDecimal: 1.82,
      fairAmerican: -122,
      marketDecimal: null,
      marketAmerican: null,
      edgePts: null,
      confidenceScore: 55,
      suggestedUnits: 0.75,
    },
  },
];

const LINEUPS: MatchEnrichedLineups = {
  status: "probable",
  bannerLabel: "Alineación probable — sujeta a cambios",
  home: {
    teamSlug: "athletic-club",
    teamName: "Athletic Club",
    formation: "4-2-3-1",
    coachName: "Ernesto Valverde",
    coachPhotoKey: null,
    coachNationality: "España",
    starters: [
      {
        id: "unai-simon",
        name: "Unai Simón",
        shortName: "Unai Simón",
        slug: "unai-simon",
        jersey: "1",
        positionGroup: "GK",
        positionLabel: "POR",
        age: 29,
        heightCm: 190,
        nationality: "España",
        nationalityCode: "ESP",
        photoKey: null,
        fallbackPhotoKey: null,
        rating: null,
        statsSummary: "12 PJ · 29 atajadas",
        playerHref: "/app/laliga/t/athletic-club/p/unai-simon",
        recentMatches: [],
        isStarter: true,
        availability: "available",
      },
      {
        id: "nico-williams",
        name: "Nico Williams",
        shortName: "Nico Williams",
        slug: "nico-williams",
        jersey: "10",
        positionGroup: "FWD",
        positionLabel: "EI",
        age: 24,
        heightCm: 181,
        nationality: "España",
        nationalityCode: "ESP",
        photoKey: null,
        fallbackPhotoKey: null,
        rating: null,
        statsSummary: "11 PJ · 4 G · 6 A",
        playerHref: "/app/laliga/t/athletic-club/p/nico-williams",
        recentMatches: [
          {
            dateIso: "2026-11-15",
            opponent: "Getafe",
            score: "2-0",
            result: "W",
            statsSummary: "MIN: 90 · G: 1",
          },
        ],
        isStarter: true,
        availability: "available",
      },
    ],
    substitutes: [],
    unavailable: [],
  },
  away: {
    teamSlug: "real-sociedad",
    teamName: "Real Sociedad",
    formation: "4-3-3",
    coachName: "Imanol Alguacil",
    coachPhotoKey: null,
    coachNationality: "España",
    starters: [
      {
        id: "remiro",
        name: "Álex Remiro",
        shortName: "Remiro",
        slug: "alex-remiro",
        jersey: "1",
        positionGroup: "GK",
        positionLabel: "POR",
        age: 31,
        heightCm: 191,
        nationality: "España",
        nationalityCode: "ESP",
        photoKey: null,
        fallbackPhotoKey: null,
        rating: null,
        statsSummary: "12 PJ",
        playerHref: "/app/laliga/t/real-sociedad/p/alex-remiro",
        recentMatches: [],
        isStarter: true,
        availability: "available",
      },
    ],
    substitutes: [],
    unavailable: [],
  },
};

const ENFRENTAMIENTOS: MatchEnfrentamientosData = {
  rankings: {
    leagueSize: 20,
    attack: [
      {
        key: "for_pg",
        label: "Goles anotados / PJ",
        unit: "",
        homeValue: 1.9,
        homeRank: 4,
        awayValue: 1.5,
        awayRank: 8,
        higherIsBetter: true,
      },
    ],
    defense: [
      {
        key: "against_pg",
        label: "Goles recibidos / PJ",
        unit: "",
        homeValue: 0.9,
        homeRank: 2,
        awayValue: 1.1,
        awayRank: 5,
        higherIsBetter: false,
      },
    ],
  },
  h2h: [
    {
      id: "h1",
      dateIso: "2026-03-01",
      competitionLabel: "LaLiga",
      isSameCompetition: true,
      homeTeam: "Athletic Club",
      awayTeam: "Real Sociedad",
      homeSlug: "athletic-club",
      awaySlug: "real-sociedad",
      homeScore: 2,
      awayScore: 1,
      isHomeForFocus: true,
      resultForFocus: "W",
    },
  ],
  homeRecent: [
    {
      id: "hr1",
      dateIso: "2026-11-12",
      competitionLabel: "Copa del Rey",
      isSameCompetition: false,
      homeTeam: "Racing",
      awayTeam: "Athletic Club",
      homeSlug: "racing",
      awaySlug: "athletic-club",
      homeScore: 0,
      awayScore: 3,
      isHomeForFocus: false,
      resultForFocus: "W",
    },
  ],
  awayRecent: [],
};

const INJURIES: readonly MatchInjuryItem[] = [
  {
    teamSide: "home",
    player: "Unai Egiluz",
    playerSlug: "unai-egiluz",
    position: "DFC",
    status: "Baja",
    detail: "Rodilla",
    injuryCategory: "Rodilla",
    expectedReturn: "2026-12-20",
    reportedAt: null,
    photoKey: null,
    fallbackPhotoKey: null,
  },
];

describe("match-deep-panels (Q3/Q4/Q5 + Cero-Fuga)", () => {
  it("MatchPlayerPicksBoard aplica Cero-Fuga en visitante y filtra por Direccion/Metrica", () => {
    const lockedHtml = renderToStaticMarkup(
      <MatchPlayerPicksBoard picks={PLAYER_PICKS} allowFull={false} />,
    );
    expect(lockedHtml).toContain("data-player-picks-locked");
    expect(lockedHtml).not.toContain("Álex Berenguer");

    const openHtml = renderToStaticMarkup(
      <MatchPlayerPicksBoard picks={PLAYER_PICKS} allowFull />,
    );
    expect(openHtml).toContain("data-player-picks-board");
    expect(openHtml).toContain("Álex Berenguer");
    expect(openHtml).toContain("Mikel Oyarzabal");
    expect(openHtml).toContain("Más de");
    expect(openHtml).toContain("Menos de");

    const onlyUnder = filterPlayerPicks(PLAYER_PICKS, {
      direction: "under",
      metric: "all",
      team: "all",
    });
    expect(onlyUnder.map((p) => p.id)).toEqual(["p-under"]);

    const onlySot = filterPlayerPicks(PLAYER_PICKS, {
      direction: "all",
      metric: "player_sot",
      team: "all",
    });
    expect(onlySot.map((p) => p.id)).toEqual(["p-over"]);
  });

  it("MatchLineupsPanel renderiza banner probable, ficha lateral y chips de vistas reales", () => {
    const html = renderToStaticMarkup(<MatchLineupsPanel lineups={LINEUPS} />);
    expect(html).toContain("Alineación probable — sujeta a cambios");
    expect(html).toContain("Rendimiento");
    expect(html).toContain("Edad");
    expect(html).toContain("Estatura");
    expect(html).toContain("Nacionalidad");
    expect(html).toContain("Ernesto Valverde");
    expect(html).toContain("Ver jugador");
    expect(html).not.toContain("Valor de mercado");

    const nico = LINEUPS.home.starters[1]!;
    expect(buildLineupMetricChip(nico, "edad")).toBe("24 a");
    expect(buildLineupMetricChip(nico, "estatura")).toBe("181 cm");
    expect(buildLineupMetricChip(nico, "nacionalidad")).toBe("ESP");
  });

  it("MatchEnfrentamientosPanel combina rankings Ataque/Defensa y filtra historial por localia/competencia", () => {
    const html = renderToStaticMarkup(
      <MatchEnfrentamientosPanel
        enfrentamientos={ENFRENTAMIENTOS}
        league="laliga"
        homeName="Athletic Club"
        homeSlug="athletic-club"
        awayName="Real Sociedad"
        awaySlug="real-sociedad"
      />,
    );
    expect(html).toContain("Clasificación de equipos");
    expect(html).toContain("Entre 20 equipos");
    expect(html).toContain("4.º");
    expect(html).toContain("Esta competencia");

    const mixedRows = buildEnfrentamientosRankingRows(
      ENFRENTAMIENTOS.rankings,
      "attack",
      "defense",
    );
    expect(mixedRows[0]?.metricLabel).toContain("Goles anotados / PJ vs Goles recibidos / PJ");
    expect(mixedRows[0]?.homeRank).toBe(4);
    expect(mixedRows[0]?.awayRank).toBe(5);

    expect(
      filterEnfrentamientosHistory(ENFRENTAMIENTOS.homeRecent, {
        onlyFocusHomeVenue: false,
        onlySameCompetition: true,
      }),
    ).toHaveLength(0);
    expect(
      filterEnfrentamientosHistory(ENFRENTAMIENTOS.h2h, {
        onlyFocusHomeVenue: true,
        onlySameCompetition: true,
      }),
    ).toHaveLength(1);
  });

  it("MatchInjuriesPanel muestra bajas separadas y estado vacio limpio", () => {
    const html = renderToStaticMarkup(
      <MatchInjuriesPanel
        injuries={INJURIES}
        league="laliga"
        homeName="Athletic Club"
        homeSlug="athletic-club"
        awayName="Real Sociedad"
        awaySlug="real-sociedad"
      />,
    );
    expect(html).toContain("Unai Egiluz");
    expect(html).toContain("Rodilla");
    expect(html).toContain("Sin bajas ni dudas reportadas.");

    const emptyHtml = renderToStaticMarkup(
      <MatchInjuriesPanel
        injuries={[]}
        league="laliga"
        homeName="Athletic Club"
        homeSlug="athletic-club"
        awayName="Real Sociedad"
        awaySlug="real-sociedad"
      />,
    );
    expect(emptyHtml).toContain("data-injuries-empty");
  });
});
