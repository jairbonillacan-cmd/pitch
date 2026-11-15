import React from "react";
import {
  asLeagueId,
  asMarketKey,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import {
  LeagueHubClubView,
  MatchStudioClubView,
} from "./club/CoreMatchViews";
import { ConfidenceChip } from "./components/ConfidenceChip";
import { HomeMatchCard } from "./components/HomeMatchCard";
import { MatchTicketCard } from "./components/MatchTicketCard";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";

const row = (market: string, selection: string, label: string, p: number, line?: number) => ({
  market: asMarketKey(market),
  selection,
  label,
  ...(line !== undefined ? { line } : {}),
  p,
  fairOdds: Math.round((1 / p) * 100) / 100,
});

const NBA_SCHEDULED: MatchAnalysis = {
  id: "nba-story-ind-phi",
  league: asLeagueId("nba"),
  leagueLabel: "NBA",
  sport: "basketball",
  hasForecast: true,
  round: "",
  day: "2030-11-15",
  dayLabel: "domingo, 15 de noviembre",
  kickoffUtc: "2030-11-15T23:00:00Z",
  kickoffLocal: "17:00",
  venue: "",
  status: "NS",
  home: {
    slug: "philadelphia-76ers",
    name: "Philadelphia 76ers",
    shortName: "76ers",
    code: "PHI",
    record: "",
  },
  away: {
    slug: "indiana-pacers",
    name: "Indiana Pacers",
    shortName: "Pacers",
    code: "IND",
    record: "",
  },
  projection: { home: 115.8, away: 109.0, total: 224.8, margin: 6.8 },
  x12: [0.7, 0, 0.3],
  marketGroups: [
    {
      group: "Ganador",
      rows: [
        row("h2h", "home", "76ers gana", 0.7),
        row("h2h", "away", "Pacers gana", 0.3),
      ],
    },
    {
      group: "Spread PHI -7.5",
      rows: [
        row("spreads", "home", "76ers -7.5", 0.47, -7.5),
        row("spreads", "away", "Pacers +7.5", 0.53, 7.5),
      ],
    },
    {
      group: "Total 225.5",
      rows: [
        row("totals", "over", "Más de 225.5 puntos", 0.48, 225.5),
        row("totals", "under", "Menos de 225.5 puntos", 0.52, 225.5),
      ],
    },
    {
      group: "Puntos por equipo",
      rows: [
        row("team_totals", "home_over", "76ers más de 116.5 pts", 0.47, 116.5),
        row("team_totals", "away_over", "Pacers más de 108.5 pts", 0.52, 108.5),
      ],
    },
  ],
  outcomes: [
    { key: "home", label: "76ers gana", probability: 0.7 },
    { key: "away", label: "Pacers gana", probability: 0.3 },
  ],
  factors: [
    { label: "Local", detail: "13 partidos esta temporada", impact: "", value: "115.8 pts proyectados" },
    { label: "Visitante", detail: "13 partidos esta temporada", impact: "", value: "109.0 pts proyectados" },
    { label: "Descanso", detail: "IND: jugó ayer", impact: "", value: "PHI: 1 días de descanso" },
  ],
  trace: [],
  confidence: {
    score: 69,
    level: "alta",
    reasons: ["Muestra suficiente"],
    factors: [
      { key: "favorite", label: "Favorito", value: 0.7, weight: 0.5, detail: "76ers con 70 % de probabilidad." },
    ],
  },
};

const NBA_EMPTY: MatchAnalysis = {
  id: "nba-story-den-nop",
  league: asLeagueId("nba"),
  leagueLabel: "NBA",
  sport: "basketball",
  hasForecast: false,
  round: "",
  day: "2030-11-16",
  dayLabel: "lunes, 16 de noviembre",
  kickoffUtc: "2030-11-16T01:00:00Z",
  kickoffLocal: "19:00",
  venue: "",
  status: "NS",
  home: {
    slug: "new-orleans-pelicans",
    name: "New Orleans Pelicans",
    shortName: "Pelicans",
    code: "NOP",
    record: "",
  },
  away: {
    slug: "denver-nuggets",
    name: "Denver Nuggets",
    shortName: "Nuggets",
    code: "DEN",
    record: "",
  },
  marketGroups: [],
  outcomes: [],
  factors: [],
  trace: [],
};

const NHL_SCHEDULED: MatchAnalysis = {
  id: "nhl-story-edm-phi",
  league: asLeagueId("nhl"),
  leagueLabel: "NHL",
  sport: "ice-hockey",
  hasForecast: true,
  round: "",
  day: "2030-11-16",
  dayLabel: "lunes, 16 de noviembre",
  kickoffUtc: "2030-11-17T00:00:00Z",
  kickoffLocal: "18:00",
  venue: "",
  status: "NS",
  home: {
    slug: "philadelphia-flyers",
    name: "Philadelphia Flyers",
    shortName: "Flyers",
    code: "PHI",
    record: "",
  },
  away: {
    slug: "edmonton-oilers",
    name: "Edmonton Oilers",
    shortName: "Oilers",
    code: "EDM",
    record: "",
  },
  projection: { home: 2.64, away: 3.01, total: 5.65, margin: -0.37 },
  x12: [0.439, 0, 0.561],
  marketGroups: [
    {
      group: "Ganador (incluye tiempo extra)",
      rows: [
        row("h2h", "home", "Flyers gana", 0.439),
        row("h2h", "away", "Oilers gana", 0.561),
      ],
    },
    {
      group: "Puck line PHI +1.5",
      rows: [
        row("spreads", "home", "Flyers +1.5", 0.68, 1.5),
        row("spreads", "away", "Oilers -1.5", 0.32, -1.5),
      ],
    },
    {
      group: "Total 5.5",
      rows: [
        row("totals", "over", "Más de 5.5 goles", 0.51, 5.5),
        row("totals", "under", "Menos de 5.5 goles", 0.49, 5.5),
      ],
    },
    {
      group: "Goles por equipo",
      rows: [
        row("team_totals", "home_over", "Flyers más de 2.5 goles", 0.49, 2.5),
        row("team_totals", "away_over", "Oilers más de 2.5 goles", 0.58, 2.5),
      ],
    },
  ],
  outcomes: [
    { key: "home", label: "Flyers gana", probability: 0.439 },
    { key: "away", label: "Oilers gana", probability: 0.561 },
  ],
  factors: [
    { label: "Local", detail: "21 partidos esta temporada", impact: "", value: "2.64 goles proyectados" },
    { label: "Visitante", detail: "20 partidos esta temporada", impact: "", value: "3.01 goles proyectados" },
    { label: "Descanso", detail: "EDM: 3 días de descanso", impact: "", value: "PHI: 3 días de descanso" },
    {
      label: "Tiempo extra",
      detail: "se define en tiempo extra o penales",
      impact: "",
      value: "17 % de llegar empatados al final",
    },
  ],
  trace: [],
  confidence: {
    score: 41,
    level: "baja",
    reasons: ["Partido parejo", "Muestra suficiente"],
    factors: [
      { key: "favorite", label: "Favorito", value: 0.56, weight: 0.5, detail: "Oilers con 56 %." },
    ],
  },
};

const STORY_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("nba"),
    leagueLabel: "NBA",
    sport: "basketball",
    season: "2026-27",
    roundLabel: "",
    generatedAt: "2030-11-15T12:00:00Z",
    games: [NBA_SCHEDULED, NBA_EMPTY],
    standings: [],
  },
  {
    league: asLeagueId("nhl"),
    leagueLabel: "NHL",
    sport: "ice-hockey",
    season: "2026-27",
    roundLabel: "",
    generatedAt: "2030-11-15T12:00:00Z",
    games: [NHL_SCHEDULED],
    standings: [],
  },
]);

const EMPTY_GAME = STORY_DATASET.games.find((g) => g.id === "nba-story-den-nop")!;

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <PlatformProvider dataset={STORY_DATASET} initialRole="member" allowRoleSimulation>
      {children}
    </PlatformProvider>
  );
}

export default {
  title: "PitchLab v4 / Fase 2 NBA y NHL",
  parameters: { layout: "fullscreen" },
};

const light = { globals: { theme: "light" } };
const dark = { globals: { theme: "dark" } };

export const HubNbaOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <LeagueHubClubView leagueId={asLeagueId("nba")} />
    </Shell>
  ),
};
export const HubNbaClaro = { ...HubNbaOscuro, ...light };

export const FichaNbaOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <MatchStudioClubView leagueId={asLeagueId("nba")} gameId="nba-story-ind-phi" />
    </Shell>
  ),
};
export const FichaNbaClaro = { ...FichaNbaOscuro, ...light };

export const HubNhlOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <LeagueHubClubView leagueId={asLeagueId("nhl")} />
    </Shell>
  ),
};
export const HubNhlClaro = { ...HubNhlOscuro, ...light };

export const FichaNhlOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <MatchStudioClubView leagueId={asLeagueId("nhl")} gameId="nhl-story-edm-phi" />
    </Shell>
  ),
};
export const FichaNhlClaro = { ...FichaNhlOscuro, ...light };

export const EstadoVacioSinPronosticoOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <div className="pl-stage p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <ConfidenceChip game={EMPTY_GAME} size="lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HomeMatchCard game={EMPTY_GAME} />
          <MatchTicketCard game={EMPTY_GAME} />
        </div>
        <MatchStudioClubView leagueId={asLeagueId("nba")} gameId="nba-story-den-nop" />
      </div>
    </Shell>
  ),
};
export const EstadoVacioSinPronosticoClaro = { ...EstadoVacioSinPronosticoOscuro, ...light };
