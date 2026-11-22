import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId } from "@pitchlab/contracts";
import { EmblemSurfaceProvider } from "../sports";
import { redactDatasetForVisitor } from "./access-guard";
import {
  LeagueHubClubView,
  type LeagueHubEnrichmentData,
} from "./club/CoreMatchViews";
import { SportOutlookCard } from "./club/match/sport-outlook/SportOutlookCard";
import type { SportOutlookInput } from "./club/match/sport-outlook/sport-outlook-types";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import { STORY_DATASET } from "./story-fixtures";

const NFL: SportOutlookInput = {
  sport: "nfl",
  homeTeam: "Kansas City Chiefs",
  awayTeam: "Buffalo Bills",
  pHome: 0.562,
  pAway: 0.438,
  expectedHome: 25.4,
  expectedAway: 22.1,
  drivers: [
    { factor: "sumersports_epa_success", impactLogit: 0.24, impactUnits: 2.6 },
    { factor: "injuries_qb_depth", impactLogit: -0.08, impactUnits: -0.9 },
    { factor: "referee_penalties", impactLogit: 0.05, impactUnits: 0.5 },
    { factor: "weather_stadium_physics", impactLogit: 0.11, impactUnits: 1.1 },
  ],
  lines: [
    { kind: "total", line: 47.5, p: 0.514 },
    { kind: "spread", line: -3.5, p: 0.478 },
  ],
  nflSpecials: {
    expectedMargin: 3.3,
    pOvertime: 0.068,
    fairOvertimeDecimal: 14.71,
    pExactPlus3: 0.094,
    pExactMinus3: 0.061,
    pExactPlus7: 0.062,
    pExactMinus7: 0.039,
  },
  confirmations: [
    { kind: "key_player", team: "home", status: "confirmed", playerName: "Patrick Mahomes" },
    { kind: "key_player", team: "away", status: "questionable", playerName: "Dalton Kincaid" },
  ],
  rest: { home: { restDays: 7 }, away: { restDays: 7 } },
  generatedAtUtc: "2026-11-14T19:00:00Z",
};

const NHL: SportOutlookInput = {
  sport: "nhl",
  homeTeam: "Edmonton Oilers",
  awayTeam: "Vancouver Canucks",
  pHome: 0.574,
  pAway: 0.426,
  pHomeReg: 0.468,
  pOtReg: 0.212,
  pAwayReg: 0.32,
  expectedHome: 3.4,
  expectedAway: 2.9,
  drivers: [
    { factor: "even_strength_xg_possession", impactLogit: 0.21, impactUnits: 0.38 },
    { factor: "starting_goalie_matchup", impactLogit: -0.09, impactUnits: -0.17 },
    { factor: "skater_injuries", impactLogit: 0.02, impactUnits: 0.03 },
    { factor: "home_ice_and_altitude", impactLogit: 0.12, impactUnits: 0.15 },
  ],
  lines: [
    { kind: "total", line: 6.5, p: 0.462 },
    { kind: "spread", line: -1.5, p: 0.318 },
  ],
  confirmations: [
    {
      kind: "goalie",
      team: "home",
      status: "confirmed",
      playerName: "Stuart Skinner",
      updatedAtUtc: "2026-11-14T17:05:00Z",
    },
    { kind: "goalie", team: "away", status: "pending" },
  ],
  rest: { away: { backToBack: true } },
  generatedAtUtc: "2026-11-14T17:10:00Z",
};

const MLB: SportOutlookInput = {
  sport: "mlb",
  homeTeam: "Los Angeles Dodgers",
  awayTeam: "San Diego Padres",
  pHome: 0.561,
  pAway: 0.439,
  expectedHome: 4.6,
  expectedAway: 3.9,
  drivers: [
    { factor: "fip_woba_pythag_structure", impactLogit: 0.11, impactUnits: 0.31 },
    { factor: "starting_pitcher_matchup", impactLogit: 0.14, impactUnits: 0.36 },
    { factor: "park_barometric_and_weather", impactLogit: -0.01, impactUnits: -0.02 },
    { factor: "roster_injuries", impactLogit: -0.04, impactUnits: -0.09 },
  ],
  lines: [
    { kind: "total", line: 8.5, p: 0.493 },
    { kind: "spread", line: -1.5, p: 0.364 },
    { kind: "first5_winner", line: 0, p: 0.552 },
    { kind: "first5_total", line: 4.5, p: 0.471 },
  ],
  confirmations: [
    { kind: "starting_pitcher", team: "home", status: "probable", playerName: "Yoshinobu Yamamoto" },
    { kind: "starting_pitcher", team: "away", status: "probable", playerName: "Dylan Cease" },
    { kind: "lineup", team: "home", status: "pending" },
  ],
  generatedAtUtc: "2026-11-14T15:40:00Z",
};

const NBA: SportOutlookInput = {
  sport: "nba",
  homeTeam: "Denver Nuggets",
  awayTeam: "Boston Celtics",
  pHome: 0.512,
  pAway: 0.488,
  expectedHome: 114.2,
  expectedAway: 113.6,
  expectedPace: 98.7,
  drivers: [
    { factor: "net_rtg_srs_four_factors", impactLogit: -0.19, impactUnits: -2.3 },
    { factor: "nba_hca_and_altitude", impactLogit: 0.27, impactUnits: 3.2 },
    { factor: "rotation_injuries", impactLogit: -0.04, impactUnits: -0.2 },
  ],
  lines: [
    { kind: "total", line: 226.5, p: 0.534 },
    { kind: "spread", line: -1.5, p: 0.471 },
  ],
  confirmations: [
    { kind: "key_player", team: "away", status: "questionable", playerName: "Jayson Tatum" },
    { kind: "key_player", team: "home", status: "out", playerName: "Aaron Gordon" },
  ],
  rest: { home: { restDays: 3 }, away: { backToBack: true } },
  generatedAtUtc: "2026-11-14T18:20:00Z",
};

const NCAAF: SportOutlookInput = {
  sport: "ncaaf",
  homeTeam: "Texas Longhorns",
  awayTeam: "Oklahoma Sooners",
  pHome: 0.684,
  pAway: 0.316,
  expectedHome: 30.6,
  expectedAway: 23.1,
  drivers: [
    { factor: "fpi_srs_sos_ypp_power", impactLogit: 0.42, impactUnits: 5.1 },
    { factor: "cfb_hfa_and_altitude_shock", impactLogit: 0.2, impactUnits: 2.8 },
    { factor: "open_meteo_wind_precip", impactLogit: 0, impactUnits: 0 },
  ],
  generatedAtUtc: "2026-11-14T12:00:00Z",
};

const SIN_DATOS: SportOutlookInput = {
  ...NBA,
  pHome: Number.NaN,
  pAway: Number.NaN,
};

function Frame({
  outlook,
  oddsFormat = "american",
  isExample = true,
  mobile = false,
}: {
  readonly outlook: SportOutlookInput;
  readonly oddsFormat?: "american" | "decimal";
  readonly isExample?: boolean;
  readonly mobile?: boolean;
}): React.JSX.Element {
  return (
    <div style={{ maxWidth: mobile ? 375 : 960, width: "100%", margin: mobile ? "0 auto" : undefined }}>
      <SportOutlookCard outlook={outlook} oddsFormat={oddsFormat} isExample={isExample} />
    </div>
  );
}

const meta = {
  title: "Platform v4 / Panorama por deporte",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Nfl: Story = { render: () => <Frame outlook={NFL} />, globals: { theme: "dark" } };
export const NflClaro: Story = { ...Nfl, globals: { theme: "light" } };

export const Nhl: Story = { render: () => <Frame outlook={NHL} />, globals: { theme: "dark" } };
export const NhlClaro: Story = { ...Nhl, globals: { theme: "light" } };

export const Mlb: Story = { render: () => <Frame outlook={MLB} />, globals: { theme: "dark" } };
export const MlbClaro: Story = { ...Mlb, globals: { theme: "light" } };

export const Nba: Story = { render: () => <Frame outlook={NBA} />, globals: { theme: "dark" } };
export const NbaClaro: Story = { ...Nba, globals: { theme: "light" } };

export const NcaafSoloMotor: Story = {
  render: () => <Frame outlook={NCAAF} />,
  globals: { theme: "dark" },
};
export const NcaafSoloMotorClaro: Story = { ...NcaafSoloMotor, globals: { theme: "light" } };

export const SinPanorama: Story = {
  render: () => <Frame outlook={SIN_DATOS} />,
  globals: { theme: "dark" },
};
export const SinPanoramaClaro: Story = { ...SinPanorama, globals: { theme: "light" } };

export const Movil: Story = {
  render: () => <Frame outlook={MLB} mobile />,
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const MovilClaro: Story = { ...Movil, globals: { theme: "light" } };

const OUTLOOK_MINIMO_SIN_LINEAS: SportOutlookInput = {
  sport: "nba",
  homeTeam: "Boston Celtics",
  awayTeam: "Miami Heat",
  pHome: 0.642,
  pAway: 0.358,
  expectedHome: 115.4,
  expectedAway: 108.1,
  drivers: [],
  lines: [],
  confirmations: [],
  generatedAtUtc: "2026-11-21T18:00:00Z",
};

const VISITOR_LEAGUE_DATASET = redactDatasetForVisitor(STORY_DATASET);

const EMPTY_LEAGUE_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura 2026",
    roundLabel: "Jornada pendiente",
    generatedAt: "2026-11-21T18:00:00Z",
    games: [],
    standings: [],
  },
]);

const LIGA_MX_HUB_ENRICHMENT: LeagueHubEnrichmentData = {
  league: "liga-mx",
  leagueLabel: "Liga MX",
  capabilities: {
    sport: "football",
    tier: "tier1_core",
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: false,
    hasReferees: true,
    hasPlayerProps: true,
  },
  seasonProgress: {
    seasonLabel: "Apertura 2026",
    periodLabel: "Jornada 16",
    startDateIso: "2026-07-10",
    endDateIso: "2026-11-24",
    startLabel: "10 jul",
    endLabel: "24 nov",
    playedRounds: 15,
    totalRounds: 17,
    pct: 88,
    progressSummary: "88% de la temporada",
  },
  standingsSplits: {
    league: "liga-mx",
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura 2026",
    roundLabel: "Jornada 16",
    updatedAt: "2026-11-21T18:00:00Z",
    hasRelegationZones: false,
    hasConferences: false,
    conferences: [],
    total: [
      {
        rank: 1,
        teamId: "liga-mx.cruz-azul",
        teamSlug: "cruz-azul",
        name: "Cruz Azul",
        shortName: "Cruz Azul",
        code: "CAZ",
        teamHref: "/app/liga-mx/t/cruz-azul",
        conference: null,
        division: null,
        played: 15,
        won: 12,
        drawn: 2,
        lost: 1,
        goalsFor: 34,
        goalsAgainst: 11,
        goalDiff: 23,
        points: 38,
        winPct: null,
        gamesBehind: null,
        seed: 1,
        form: ["W", "W", "D", "W", "W"],
        zoneId: "liguilla",
        zoneLabel: "Liguilla directa",
        zoneTone: "ucl",
      },
      {
        rank: 2,
        teamId: "liga-mx.club-america",
        teamSlug: "club-america",
        name: "Club América",
        shortName: "América",
        code: "AME",
        teamHref: "/app/liga-mx/t/club-america",
        conference: null,
        division: null,
        played: 15,
        won: 10,
        drawn: 3,
        lost: 2,
        goalsFor: 29,
        goalsAgainst: 15,
        goalDiff: 14,
        points: 33,
        winPct: null,
        gamesBehind: null,
        seed: 2,
        form: ["W", "D", "W", "W", "L"],
        zoneId: "liguilla",
        zoneLabel: "Liguilla directa",
        zoneTone: "ucl",
      },
    ],
    home: [
      {
        rank: 1,
        teamId: "liga-mx.cruz-azul",
        teamSlug: "cruz-azul",
        name: "Cruz Azul",
        shortName: "Cruz Azul",
        code: "CAZ",
        teamHref: "/app/liga-mx/t/cruz-azul",
        conference: null,
        division: null,
        played: 8,
        won: 7,
        drawn: 1,
        lost: 0,
        goalsFor: 20,
        goalsAgainst: 5,
        goalDiff: 15,
        points: 22,
        winPct: null,
        gamesBehind: null,
        seed: 1,
        form: ["W", "W", "W", "D", "W"],
        zoneId: "liguilla",
        zoneLabel: "Liguilla directa",
        zoneTone: "ucl",
      },
    ],
    away: [
      {
        rank: 1,
        teamId: "liga-mx.cruz-azul",
        teamSlug: "cruz-azul",
        name: "Cruz Azul",
        shortName: "Cruz Azul",
        code: "CAZ",
        teamHref: "/app/liga-mx/t/cruz-azul",
        conference: null,
        division: null,
        played: 7,
        won: 5,
        drawn: 1,
        lost: 1,
        goalsFor: 14,
        goalsAgainst: 6,
        goalDiff: 8,
        points: 16,
        winPct: null,
        gamesBehind: null,
        seed: 1,
        form: ["W", "D", "W", "L", "W"],
        zoneId: "liguilla",
        zoneLabel: "Liguilla directa",
        zoneTone: "ucl",
      },
    ],
    zones: [
      {
        id: "liguilla",
        label: "Liguilla directa (1–6)",
        tone: "ucl",
        startRank: 1,
        endRank: 6,
        scope: "league",
      },
    ],
  },
  bracket: null,
  attackDefense: null,
  statLeaders: {
    scoringUnitPlural: "goles",
    playerCategories: [
      {
        key: "goals",
        label: "Goles",
        unitLabel: "goles",
        entries: [
          {
            rank: 1,
            playerSlug: "henry-martin",
            name: "Henry Martín",
            shortName: "H. Martín",
            teamSlug: "club-america",
            teamName: "Club América",
            teamHref: "/app/liga-mx/t/club-america",
            playerHref: "/app/liga-mx/t/club-america/p/henry-martin",
            positionLabel: "DEL",
            appearances: 14,
            primaryValue: 11,
            primaryFormatted: "11",
            secondaryLabel: "0.79 / partido",
          },
        ],
      },
    ],
    teamAttack: [
      {
        rank: 1,
        teamSlug: "cruz-azul",
        name: "Cruz Azul",
        shortName: "Cruz Azul",
        teamHref: "/app/liga-mx/t/cruz-azul",
        played: 15,
        primaryValue: 2.27,
        primaryFormatted: "2.27",
        secondaryLabel: "34 goles",
      },
    ],
    teamDefense: [
      {
        rank: 1,
        teamSlug: "cruz-azul",
        name: "Cruz Azul",
        shortName: "Cruz Azul",
        teamHref: "/app/liga-mx/t/cruz-azul",
        played: 15,
        primaryValue: 0.73,
        primaryFormatted: "0.73",
        secondaryLabel: "11 recibidos",
      },
    ],
  },
  titleProjection: {
    titleLabel: "Campeón Apertura 2026",
    subtitle: "Simulación Spacetime v5.1",
    candidates: [
      {
        rank: 1,
        teamSlug: "cruz-azul",
        name: "Cruz Azul",
        shortName: "Cruz Azul",
        code: "CAZ",
        teamHref: "/app/liga-mx/t/cruz-azul",
        currentRank: 1,
        played: 15,
        points: 38,
        winPct: null,
        titleProbPct: 31.4,
        fairDecimal: 3.18,
        netRatingLabel: "+1.12 xG",
      },
      {
        rank: 2,
        teamSlug: "club-america",
        name: "Club América",
        shortName: "América",
        code: "AME",
        teamHref: "/app/liga-mx/t/club-america",
        currentRank: 2,
        played: 15,
        points: 33,
        winPct: null,
        titleProbPct: 24.8,
        fairDecimal: 4.03,
        netRatingLabel: "+0.86 xG",
      },
    ],
  },
  refereeRanking: null,
};

export const NbaFormatoDecimalOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <Frame outlook={NBA} oddsFormat="decimal" isExample={false} />,
};

export const NbaFormatoDecimalClaro: Story = {
  ...NbaFormatoDecimalOscuro,
  globals: { theme: "light" },
};

export const PanoramaMinimoSinLineasOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <Frame outlook={OUTLOOK_MINIMO_SIN_LINEAS} oddsFormat="decimal" isExample={false} />,
};

export const PanoramaMinimoSinLineasClaro: Story = {
  ...PanoramaMinimoSinLineasOscuro,
  globals: { theme: "light" },
};

export const LeagueHubEnriquecidoOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { layout: "fullscreen" },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <LeagueHubClubView
          leagueId={asLeagueId("liga-mx")}
          initialSection="tabla"
          enrichment={LIGA_MX_HUB_ENRICHMENT}
        />
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const LeagueHubEnriquecidoClaro: Story = {
  ...LeagueHubEnriquecidoOscuro,
  globals: { theme: "light" },
};

export const LeagueHubVacioSinPartidosOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { layout: "fullscreen" },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={EMPTY_LEAGUE_DATASET} initialRole="member">
        <LeagueHubClubView
          leagueId={asLeagueId("liga-mx")}
          initialSection="partidos"
          enrichment={null}
        />
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const LeagueHubVacioSinPartidosClaro: Story = {
  ...LeagueHubVacioSinPartidosOscuro,
  globals: { theme: "light" },
};

export const LeagueHubVisitanteCeroFugaOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { layout: "fullscreen" },
  render: () => (
    <EmblemSurfaceProvider surface="public">
      <PlatformProvider dataset={VISITOR_LEAGUE_DATASET} initialRole="visitor">
        <LeagueHubClubView
          leagueId={asLeagueId("liga-mx")}
          initialSection="partidos"
          enrichment={null}
        />
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const LeagueHubVisitanteCeroFugaClaro: Story = {
  ...LeagueHubVisitanteCeroFugaOscuro,
  globals: { theme: "light" },
};

export const LeagueHubMovilOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <div style={{ maxWidth: 375, width: "100%", margin: "0 auto" }}>
          <LeagueHubClubView
            leagueId={asLeagueId("liga-mx")}
            initialSection="tabla"
            enrichment={LIGA_MX_HUB_ENRICHMENT}
          />
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const LeagueHubMovilClaro: Story = {
  ...LeagueHubMovilOscuro,
  globals: { theme: "light" },
};
