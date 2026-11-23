import React from "react";
import { asLeagueId } from "@pitchlab/contracts";
import {
  CompareHubView,
  type CompareAttackDefensePayload,
  type CompareLeagueCatalog,
  type ComparePlayerOption,
  type PlayerComparisonPayload,
  type TeamComparisonPayload,
} from "./club/CompareHubView";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";

const STORY_DATASET = buildPlatformDataset([
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

const meta = {
  title: "PitchLab v4 / Comparador H2H",
  component: CompareHubView,
  parameters: { layout: "fullscreen" },
};
export default meta;

const dark = { globals: { theme: "dark" } };
const light = { globals: { theme: "light" } };

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <PlatformProvider dataset={STORY_DATASET} initialRole="member">
      {children}
    </PlatformProvider>
  );
}

const CATALOG: CompareLeagueCatalog[] = [
  {
    league: asLeagueId("liga-mx"),
    label: "Liga MX",
    sport: "football",
    teams: [
      { slug: "america", name: "Club América", shortName: "América", rank: 1 },
      { slug: "chivas", name: "Chivas Guadalajara", shortName: "Chivas", rank: 2 },
      { slug: "monterrey", name: "Rayados de Monterrey", shortName: "Monterrey", rank: 6 },
    ],
  },
  {
    league: asLeagueId("mlb"),
    label: "MLB",
    sport: "baseball",
    teams: [
      { slug: "los-angeles-dodgers", name: "Los Angeles Dodgers", shortName: "Dodgers", rank: 1 },
      { slug: "new-york-yankees", name: "New York Yankees", shortName: "Yankees", rank: 2 },
    ],
  },
];

const TEAM_COMPARISON: TeamComparisonPayload = {
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
    href: "/app/liga-mx/t/america",
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
    href: "/app/liga-mx/t/chivas",
  },
  metrics: [
    {
      id: "win-rate",
      label: "Efectividad de victorias",
      valueA: "50.0 %",
      valueB: "50.0 %",
      numA: 50,
      numB: 50,
      pct: true,
    },
    {
      id: "for-avg",
      label: "Goles a favor / PJ",
      valueA: "2.38",
      valueB: "1.63",
      numA: 2.38,
      numB: 1.63,
      rankA: 1,
      rankB: 6,
    },
    {
      id: "against-avg",
      label: "Goles en contra / PJ",
      valueA: "1.44",
      valueB: "0.94",
      numA: 1.44,
      numB: 0.94,
      lowerIsBetter: true,
      rankA: 7,
      rankB: 2,
    },
    {
      id: "diff",
      label: "Diferencial neto",
      valueA: "+15",
      valueB: "+11",
      numA: 15,
      numB: 11,
    },
  ],
  h2hSummary: { played: 2, winsA: 1, draws: 1, winsB: 0 },
  h2hMatches: [
    {
      id: "h2h-1",
      dateLabel: "14 sep 2026",
      round: "Jornada 8",
      homeName: "América",
      awayName: "Chivas",
      homeScore: 2,
      awayScore: 1,
      winner: "A",
      gameHref: "/app/liga-mx/g/america-vs-chivas",
    },
    {
      id: "h2h-2",
      dateLabel: "8 mar 2026",
      round: "Clausura 2026",
      homeName: "Chivas",
      awayName: "América",
      homeScore: 1,
      awayScore: 1,
      winner: "draw",
      gameHref: null,
    },
  ],
};

const ATTACK_DEFENSE_FIXTURE: CompareAttackDefensePayload = {
  league: asLeagueId("liga-mx"),
  leagueLabel: "Liga MX",
  leagueSize: 18,
  teamASlug: "america",
  teamBSlug: "chivas",
  teamAAttackRank: 1,
  teamADefenseRank: 6,
  teamAOverallRank: 2,
  teamBAttackRank: 5,
  teamBDefenseRank: 2,
  teamBOverallRank: 3,
  attackMetrics: [
    {
      key: "goals_for_pg",
      category: "attack",
      label: "Goles a favor / partido",
      valueA: 2.38,
      valueB: 1.63,
      leagueAverage: 1.42,
      rankA: 1,
      rankB: 6,
      leagueSize: 18,
      lowerIsBetter: false,
      digits: 2,
      pct: false,
    },
    {
      key: "expected_goals_for",
      category: "attack",
      label: "Goles esperados a favor",
      valueA: 1.94,
      valueB: 1.58,
      leagueAverage: 1.38,
      rankA: 2,
      rankB: 5,
      leagueSize: 18,
      lowerIsBetter: false,
      digits: 2,
      pct: false,
    },
    {
      key: "shots_on_target_pg",
      category: "attack",
      label: "Tiros a puerta / partido",
      valueA: 5.8,
      valueB: 4.9,
      leagueAverage: 4.1,
      rankA: 1,
      rankB: 4,
      leagueSize: 18,
      lowerIsBetter: false,
      digits: 1,
      pct: false,
    },
  ],
  defenseMetrics: [
    {
      key: "goals_against_pg",
      category: "defense",
      label: "Goles en contra / partido",
      valueA: 1.44,
      valueB: 0.94,
      leagueAverage: 1.41,
      rankA: 7,
      rankB: 2,
      leagueSize: 18,
      lowerIsBetter: true,
      digits: 2,
      pct: false,
    },
    {
      key: "expected_goals_against",
      category: "defense",
      label: "Goles esperados en contra",
      valueA: 1.21,
      valueB: 1.02,
      leagueAverage: 1.36,
      rankA: 5,
      rankB: 2,
      leagueSize: 18,
      lowerIsBetter: true,
      digits: 2,
      pct: false,
    },
    {
      key: "clean_sheet_pct",
      category: "defense",
      label: "Porcentaje arco en cero",
      valueA: 31,
      valueB: 44,
      leagueAverage: 27,
      rankA: 6,
      rankB: 2,
      leagueSize: 18,
      lowerIsBetter: false,
      digits: 0,
      pct: true,
    },
  ],
};

const PLAYER_OPTIONS: ComparePlayerOption[] = [
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

const PLAYER_COMPARISON: PlayerComparisonPayload = {
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
    href: "/app/mlb/t/los-angeles-dodgers/p/shohei-ohtani",
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
    href: "/app/mlb/t/new-york-yankees/p/aaron-judge",
  },
  metrics: [
    { id: "gp", label: "JJ", valueA: "135", valueB: "148", numA: 135, numB: 148 },
    { id: "avg", label: "AVG", valueA: ".275", valueB: ".312", numA: 0.275, numB: 0.312 },
    { id: "hr", label: "HR", valueA: "30", valueB: "46", numA: 30, numB: 46 },
    { id: "rbi", label: "CI", valueA: "81", valueB: "118", numA: 81, numB: 118 },
  ],
};

export const EquiposH2HOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <CompareHubView
        initialMode="equipos"
        initialLeague={asLeagueId("liga-mx")}
        catalog={CATALOG}
        initialTeamComparison={TEAM_COMPARISON}
        initialPlayerOptions={PLAYER_OPTIONS}
        initialPlayerComparison={PLAYER_COMPARISON}
        initialAttackDefense={ATTACK_DEFENSE_FIXTURE}
        disableLiveFetch
      />
    </Shell>
  ),
};
export const EquiposH2HClaro = { ...EquiposH2HOscuro, ...light };

export const JugadoresMlbOscuro = {
  ...dark,
  render: () => (
    <Shell>
      <CompareHubView
        initialMode="jugadores"
        initialLeague={asLeagueId("mlb")}
        catalog={CATALOG}
        initialTeamComparison={TEAM_COMPARISON}
        initialPlayerOptions={PLAYER_OPTIONS}
        initialPlayerComparison={PLAYER_COMPARISON}
        disableLiveFetch
      />
    </Shell>
  ),
};
export const JugadoresMlbClaro = { ...JugadoresMlbOscuro, ...light };
