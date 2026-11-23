import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { asLeagueId } from "@pitchlab/contracts";
import type {
  MatchEnfrentamientosData,
  MatchEnrichedLineups,
  MatchInjuryItem,
  MatchPlayerPickItem,
} from "../../types";
import { MatchEnfrentamientosPanel } from "./MatchEnfrentamientosPanel";
import { MatchInjuriesPanel } from "./MatchInjuriesPanel";
import { MatchLineupsPanel } from "./MatchLineupsPanel";
import { MatchPlayerPicksBoard } from "./MatchPlayerPicksBoard";

const SAMPLE_PLAYER_PICKS: readonly MatchPlayerPickItem[] = [
  {
    id: "pp-maina-sot",
    playerName: "Linton Maina",
    playerSlug: "linton-maina",
    teamSide: "home",
    teamName: "FC Köln",
    teamSlug: "fc-koln",
    positionLabel: "ED",
    photoKey: null,
    fallbackPhotoKey: null,
    playerHref: "/app/laliga/t/fc-koln/p/linton-maina",
    marketKey: "player_sot",
    marketLabel: "Tiros a puerta",
    direction: "over",
    selectionLabel: "Más de 0.5 tiros a puerta",
    line: 0.5,
    p: 0.62,
    fairDecimal: 1.61,
    marketDecimal: 1.75,
    marketBookLabel: "Bet365",
    evPct: 8.4,
    evidenceBullets: [
      { label: "4/5 con KOE de local", ratePct: 80, tone: "green" },
      { label: "4/9 en torneo", ratePct: 44, tone: "red" },
      { label: "10/20 últimos partidos", ratePct: 50, tone: "amber" },
    ],
    pick: {
      id: "pp-maina-sot",
      gameId: "laliga-2026-test",
      league: asLeagueId("laliga"),
      leagueLabel: "LaLiga",
      matchLabel: "FC Köln vs Elversberg",
      kickoffLocal: "08:30",
      gameStatus: "NS",
      slotIndex: 50,
      category: "tactico",
      categoryLabel: "Tiros a puerta",
      risk: "medio",
      engineKey: "tachyon",
      engineName: "PitchLab Tachyon v5.1",
      marketGroup: "Tiros a puerta",
      selectionKey: "player_sot:linton-maina:0.5",
      market: "player_sot",
      line: 0.5,
      conflictGroup: "independent",
      label: "L. Maina · Más de 0.5 tiros a puerta",
      rationale: "4/5 de local",
      p: 0.62,
      fairDecimal: 1.61,
      fairAmerican: -164,
      marketDecimal: 1.75,
      marketAmerican: -133,
      marketBookLabel: "Bet365",
      edgePts: 5.2,
      confidenceScore: 62,
      suggestedUnits: 0.75,
    },
  },
  {
    id: "pp-maina-shots",
    playerName: "Linton Maina",
    playerSlug: "linton-maina",
    teamSide: "home",
    teamName: "FC Köln",
    teamSlug: "fc-koln",
    positionLabel: "ED",
    photoKey: null,
    fallbackPhotoKey: null,
    playerHref: "/app/laliga/t/fc-koln/p/linton-maina",
    marketKey: "player_shots",
    marketLabel: "Tiros totales",
    direction: "under",
    selectionLabel: "Menos de 2.5 tiros",
    line: 2.5,
    p: 0.58,
    fairDecimal: 1.72,
    marketDecimal: 1.85,
    marketBookLabel: "Codere",
    evPct: 7.3,
    evidenceBullets: [{ label: "6/10 debajo de 2.5 remates", ratePct: 60, tone: "green" }],
    pick: {
      id: "pp-maina-shots",
      gameId: "laliga-2026-test",
      league: asLeagueId("laliga"),
      leagueLabel: "LaLiga",
      matchLabel: "FC Köln vs Elversberg",
      kickoffLocal: "08:30",
      gameStatus: "NS",
      slotIndex: 51,
      category: "tactico",
      categoryLabel: "Tiros totales",
      risk: "medio",
      engineKey: "tachyon",
      engineName: "PitchLab Tachyon v5.1",
      marketGroup: "Tiros totales",
      selectionKey: "player_shots:linton-maina:2.5",
      market: "player_shots",
      line: 2.5,
      conflictGroup: "independent",
      label: "L. Maina · Menos de 2.5 tiros",
      rationale: "6/10 debajo de 2.5 remates",
      p: 0.58,
      fairDecimal: 1.72,
      fairAmerican: -139,
      marketDecimal: 1.85,
      marketAmerican: -118,
      marketBookLabel: "Codere",
      edgePts: 4.0,
      confidenceScore: 58,
      suggestedUnits: 0.75,
    },
  },
];

const SAMPLE_LINEUPS: MatchEnrichedLineups = {
  status: "probable",
  bannerLabel: "Alineación probable — sujeta a cambios",
  home: {
    teamSlug: "fc-barcelona",
    teamName: "FC Barcelona",
    formation: "4-3-3",
    coachName: "Hansi Flick",
    coachPhotoKey: null,
    coachNationality: "Alemania",
    starters: [
      {
        id: "ter-stegen",
        name: "Marc-André ter Stegen",
        shortName: "Ter Stegen",
        slug: "marc-andre-ter-stegen",
        jersey: "1",
        positionGroup: "GK",
        positionLabel: "POR",
        age: 34,
        heightCm: 187,
        nationality: "Alemania",
        nationalityCode: "GER",
        photoKey: null,
        fallbackPhotoKey: null,
        rating: null,
        statsSummary: "10 PJ · 28 atajadas · 11 GC",
        playerHref: "/app/laliga/t/fc-barcelona/p/marc-andre-ter-stegen",
        recentMatches: [],
        isStarter: true,
        availability: "available",
      },
      {
        id: "pedri",
        name: "Pedri González",
        shortName: "Pedri",
        slug: "pedri-gonzalez",
        jersey: "8",
        positionGroup: "MID",
        positionLabel: "MC",
        age: 23,
        heightCm: 174,
        nationality: "España",
        nationalityCode: "ESP",
        photoKey: null,
        fallbackPhotoKey: null,
        rating: null,
        statsSummary: "12 PJ · 4 G · 5 A",
        playerHref: "/app/laliga/t/fc-barcelona/p/pedri-gonzalez",
        recentMatches: [
          {
            dateIso: "2026-11-15",
            opponent: "Real Sociedad",
            score: "2-0",
            result: "W",
            statsSummary: "MIN: 88 · SOT: 2 · PAS: 64",
          },
        ],
        isStarter: true,
        availability: "available",
      },
    ],
    substitutes: [],
    unavailable: [
      {
        id: "gavi",
        name: "Gavi Páez",
        shortName: "Gavi",
        slug: "gavi",
        jersey: "6",
        positionGroup: "MID",
        positionLabel: "MC",
        age: 22,
        heightCm: 173,
        nationality: "España",
        nationalityCode: "ESP",
        photoKey: null,
        fallbackPhotoKey: null,
        rating: null,
        statsSummary: "0 PJ",
        playerHref: "/app/laliga/t/fc-barcelona/p/gavi",
        recentMatches: [],
        isStarter: false,
        availability: "injured",
      },
    ],
  },
  away: {
    teamSlug: "real-madrid",
    teamName: "Real Madrid",
    formation: "4-3-3",
    coachName: "Carlo Ancelotti",
    coachPhotoKey: null,
    coachNationality: "Italia",
    starters: [
      {
        id: "courtois",
        name: "Thibaut Courtois",
        shortName: "Courtois",
        slug: "thibaut-courtois",
        jersey: "1",
        positionGroup: "GK",
        positionLabel: "POR",
        age: 34,
        heightCm: 200,
        nationality: "Bélgica",
        nationalityCode: "BEL",
        photoKey: null,
        fallbackPhotoKey: null,
        rating: null,
        statsSummary: "11 PJ · 34 atajadas",
        playerHref: "/app/laliga/t/real-madrid/p/thibaut-courtois",
        recentMatches: [],
        isStarter: true,
        availability: "available",
      },
    ],
    substitutes: [],
    unavailable: [],
  },
};

const SAMPLE_ENFRENTAMIENTOS: MatchEnfrentamientosData = {
  rankings: {
    leagueSize: 20,
    attack: [
      {
        key: "for_per_game",
        label: "Goles anotados / PJ",
        unit: "",
        homeValue: 2.8,
        homeRank: 1,
        awayValue: 2.1,
        awayRank: 3,
        higherIsBetter: true,
      },
    ],
    defense: [
      {
        key: "against_per_game",
        label: "Goles recibidos / PJ",
        unit: "",
        homeValue: 0.9,
        homeRank: 2,
        awayValue: 0.8,
        awayRank: 1,
        higherIsBetter: false,
      },
    ],
  },
  h2h: [
    {
      id: "h2h-1",
      dateIso: "2026-04-12",
      competitionLabel: "LaLiga",
      isSameCompetition: true,
      homeTeam: "Barcelona",
      awayTeam: "Real Madrid",
      homeSlug: "fc-barcelona",
      awaySlug: "real-madrid",
      homeScore: 2,
      awayScore: 1,
      isHomeForFocus: true,
      resultForFocus: "W",
    },
  ],
  homeRecent: [],
  awayRecent: [],
};

const SAMPLE_INJURIES: readonly MatchInjuryItem[] = [
  {
    teamSide: "home",
    player: "Gavi Páez",
    playerSlug: "gavi",
    position: "MC",
    status: "Baja",
    detail: "Lesión muscular",
    injuryCategory: "Muscular",
    expectedReturn: "2026-12-01",
    reportedAt: null,
    photoKey: null,
    fallbackPhotoKey: null,
  },
  {
    teamSide: "away",
    player: "David Alaba",
    playerSlug: "david-alaba",
    position: "DFC",
    status: "Duda",
    detail: "Sobrecarga",
    injuryCategory: "Física",
    expectedReturn: null,
    reportedAt: null,
    photoKey: null,
    fallbackPhotoKey: null,
  },
];

const meta: Meta = {
  title: "Platform/MatchDeepPanels",
  parameters: { layout: "padded" },
};

export default meta;

export const PlayerPicksDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => <MatchPlayerPicksBoard picks={SAMPLE_PLAYER_PICKS} allowFull />,
};

export const PlayerPicksLight: StoryObj = {
  globals: { theme: "light" },
  render: () => <MatchPlayerPicksBoard picks={SAMPLE_PLAYER_PICKS} allowFull />,
};

export const LineupsInteractiveDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => <MatchLineupsPanel lineups={SAMPLE_LINEUPS} />,
};

export const LineupsInteractiveLight: StoryObj = {
  globals: { theme: "light" },
  render: () => <MatchLineupsPanel lineups={SAMPLE_LINEUPS} />,
};

export const EnfrentamientosDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => (
    <MatchEnfrentamientosPanel
      enfrentamientos={SAMPLE_ENFRENTAMIENTOS}
      league="laliga"
      homeName="Barcelona"
      homeSlug="fc-barcelona"
      awayName="Real Madrid"
      awaySlug="real-madrid"
    />
  ),
};

export const EnfrentamientosLight: StoryObj = {
  globals: { theme: "light" },
  render: () => (
    <MatchEnfrentamientosPanel
      enfrentamientos={SAMPLE_ENFRENTAMIENTOS}
      league="laliga"
      homeName="Barcelona"
      homeSlug="fc-barcelona"
      awayName="Real Madrid"
      awaySlug="real-madrid"
    />
  ),
};

export const InjuriesDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => (
    <MatchInjuriesPanel
      injuries={SAMPLE_INJURIES}
      league="laliga"
      homeName="Barcelona"
      homeSlug="fc-barcelona"
      awayName="Real Madrid"
      awaySlug="real-madrid"
    />
  ),
};

export const InjuriesLight: StoryObj = {
  globals: { theme: "light" },
  render: () => (
    <MatchInjuriesPanel
      injuries={SAMPLE_INJURIES}
      league="laliga"
      homeName="Barcelona"
      homeSlug="fc-barcelona"
      awayName="Real Madrid"
      awaySlug="real-madrid"
    />
  ),
};

const SAMPLE_NBA_PLAYER_PICKS: readonly MatchPlayerPickItem[] = [
  {
    id: "pp-nba-lebron-pts",
    playerName: "LeBron James",
    playerSlug: "lebron-james",
    teamSide: "home",
    teamName: "LA Lakers",
    teamSlug: "lal",
    positionLabel: "SF",
    photoKey: null,
    fallbackPhotoKey: null,
    playerHref: "/app/nba/t/lal/p/lebron-james",
    marketKey: "nba_pts",
    marketLabel: "Puntos",
    direction: "over",
    selectionLabel: "Más de 24.5 puntos",
    line: 24.5,
    p: 0.57,
    fairDecimal: 1.75,
    marketDecimal: 1.87,
    marketBookLabel: "Pinnacle",
    evPct: 7.2,
    evidenceBullets: [
      { label: "4/5 con LAL en casa", ratePct: 80, tone: "green" },
      { label: "7/10 recientes", ratePct: 70, tone: "green" },
      { label: "13/20 en temporada", ratePct: 65, tone: "green" },
    ],
    pick: {
      id: "pp-nba-lebron-pts",
      gameId: "nba-2026-test",
      league: asLeagueId("nba"),
      leagueLabel: "NBA",
      matchLabel: "LA Lakers vs Phoenix Suns",
      kickoffLocal: "21:30",
      gameStatus: "NS",
      slotIndex: 50,
      category: "tactico",
      categoryLabel: "Props NBA",
      risk: "medio",
      engineKey: "tachyon",
      engineName: "PitchLab Tachyon v5.1",
      marketGroup: "Puntos",
      selectionKey: "nba_pts:lebron-james:24.5",
      market: "nba_pts",
      line: 24.5,
      conflictGroup: "independent",
      label: "L. James · Más de 24.5 puntos",
      rationale: "7/10 superando 24.5 puntos",
      p: 0.57,
      fairDecimal: 1.75,
      fairAmerican: -133,
      marketDecimal: 1.87,
      marketAmerican: -115,
      marketBookLabel: "Pinnacle",
      edgePts: 3.5,
      confidenceScore: 57,
      suggestedUnits: 0.75,
    },
  },
];

const SAMPLE_NBA_ENFRENTAMIENTOS: MatchEnfrentamientosData = {
  rankings: {
    leagueSize: 30,
    attack: [
      {
        key: "for_per_game",
        label: "Puntos anotados / PJ",
        unit: "pts",
        homeValue: 117.4,
        homeRank: 5,
        awayValue: 114.8,
        awayRank: 11,
        higherIsBetter: true,
      },
    ],
    defense: [
      {
        key: "against_per_game",
        label: "Puntos recibidos / PJ",
        unit: "pts",
        homeValue: 111.2,
        homeRank: 8,
        awayValue: 115.6,
        awayRank: 19,
        higherIsBetter: false,
      },
    ],
  },
  h2h: [
    {
      id: "h2h-nba-1",
      dateIso: "2026-10-25",
      competitionLabel: "NBA",
      isSameCompetition: true,
      homeTeam: "LA Lakers",
      awayTeam: "Phoenix Suns",
      homeSlug: "lal",
      awaySlug: "phx",
      homeScore: 121,
      awayScore: 116,
      isHomeForFocus: true,
      resultForFocus: "W",
    },
  ],
  homeRecent: [],
  awayRecent: [],
};

export const EnfrentamientosNbaDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => (
    <MatchEnfrentamientosPanel
      enfrentamientos={SAMPLE_NBA_ENFRENTAMIENTOS}
      league="nba"
      homeName="LA Lakers"
      homeSlug="lal"
      awayName="Phoenix Suns"
      awaySlug="phx"
    />
  ),
};

export const PlayerPicksNbaLight: StoryObj = {
  globals: { theme: "light" },
  render: () => (
    <MatchPlayerPicksBoard
      picks={SAMPLE_NBA_PLAYER_PICKS}
      allowFull
      oddsFormat="american"
      homeLabel="LA Lakers"
      awayLabel="Phoenix Suns"
    />
  ),
};

export const PlayerPicksVisitorLockedDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => (
    <MatchPlayerPicksBoard
      picks={SAMPLE_PLAYER_PICKS}
      allowFull={false}
      oddsFormat="american"
      homeLabel="FC Köln"
      awayLabel="Elversberg"
    />
  ),
};

export const EmptyStatesDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: "16px" }}>
      <MatchPlayerPicksBoard
        picks={[]}
        allowFull
        oddsFormat="decimal"
        homeLabel="LA Lakers"
        awayLabel="Phoenix Suns"
      />
      <MatchLineupsPanel lineups={null} />
      <MatchInjuriesPanel
        injuries={[]}
        league="nba"
        homeName="LA Lakers"
        homeSlug="lal"
        awayName="Phoenix Suns"
        awaySlug="phx"
      />
    </div>
  ),
};
