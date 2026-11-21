import React from "react";
import { SportOutlookCard } from "./club/match/sport-outlook/SportOutlookCard";
import type { SportOutlookInput } from "./club/match/sport-outlook/sport-outlook-types";

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

function Frame({ outlook }: { outlook: SportOutlookInput }): React.JSX.Element {
  return (
    <div style={{ maxWidth: 960 }}>
      <SportOutlookCard outlook={outlook} oddsFormat="american" isExample />
    </div>
  );
}

export default {
  title: "Platform v4 / Panorama por deporte",
};

export const Nfl = { render: () => <Frame outlook={NFL} />, globals: { theme: "dark" } };
export const NflClaro = { ...Nfl, globals: { theme: "light" } };

export const Nhl = { render: () => <Frame outlook={NHL} />, globals: { theme: "dark" } };
export const NhlClaro = { ...Nhl, globals: { theme: "light" } };

export const Mlb = { render: () => <Frame outlook={MLB} />, globals: { theme: "dark" } };
export const MlbClaro = { ...Mlb, globals: { theme: "light" } };

export const Nba = { render: () => <Frame outlook={NBA} />, globals: { theme: "dark" } };
export const NbaClaro = { ...Nba, globals: { theme: "light" } };

export const NcaafSoloMotor = {
  render: () => <Frame outlook={NCAAF} />,
  globals: { theme: "dark" },
};
export const NcaafSoloMotorClaro = { ...NcaafSoloMotor, globals: { theme: "light" } };

export const SinPanorama = {
  render: () => <Frame outlook={SIN_DATOS} />,
  globals: { theme: "dark" },
};
export const SinPanoramaClaro = { ...SinPanorama, globals: { theme: "light" } };

export const Movil = {
  render: () => <Frame outlook={MLB} />,
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const MovilClaro = { ...Movil, globals: { theme: "light" } };
