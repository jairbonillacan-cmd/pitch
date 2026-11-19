import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId } from "@pitchlab/contracts";
import { CalibrationHonestyLab } from "./components/CalibrationHonestyLab";
import { LivePicksTrackerStrip } from "./components/LivePicksTrackerStrip";
import { PlayerPropStreakCard } from "./components/PlayerPropStreakCard";
import { RefereeRigorBadge } from "./components/RefereeRigorBadge";
import type { RefereeAnalyticsItem } from "./referee-stats";
import type { JournalEntry, PlatformGame } from "./types";

const meta: Meta = {
  title: "Platform v4 / Componentes Atómicos v4 (Goal 3)",
  parameters: { layout: "padded" },
};
export default meta;

const SAMPLE_REFEREES: readonly RefereeAnalyticsItem[] = [
  {
    name: "Luis Santander",
    country: "México",
    matches: 38,
    avgYellow: 4.95,
    avgRed: 0.42,
    avgFouls: 26.6,
    avgGoals: 3.18,
    ebYellow: 4.72,
    leagueMeanYellow: 4.15,
    rigorPercentile: 92,
    rigorTier: "estricto",
    rigorLabel: "Estricto",
    rank: 2,
    totalInLeague: 18,
    upcoming: [
      {
        gameId: "mx-sample-1",
        matchLabel: "América vs Chivas",
        dayLabel: "Sáb 21 nov · 21:00",
        href: "/app/liga-mx/g/america-vs-chivas",
      },
    ],
  },
  {
    name: "César Ramos",
    country: "México",
    matches: 44,
    avgYellow: 4.12,
    avgRed: 0.18,
    avgFouls: 23.1,
    avgGoals: 2.74,
    ebYellow: 4.13,
    leagueMeanYellow: 4.15,
    rigorPercentile: 50,
    rigorTier: "promedio",
    rigorLabel: "Promedio",
    rank: 9,
    totalInLeague: 18,
    upcoming: [],
  },
  {
    name: "Marco Ortiz",
    country: "México",
    matches: 29,
    avgYellow: 3.25,
    avgRed: 0.08,
    avgFouls: 20.4,
    avgGoals: 2.55,
    ebYellow: 3.56,
    leagueMeanYellow: 4.15,
    rigorPercentile: 14,
    rigorTier: "permisivo",
    rigorLabel: "Permisivo",
    rank: 16,
    totalInLeague: 18,
    upcoming: [],
  },
];

const SAMPLE_LIVE_GAME = {
  id: "mx-live-demo",
  league: asLeagueId("liga-mx"),
  leagueLabel: "Liga MX",
  sport: "football",
  status: "LIVE",
  score: { home: 2, away: 1 },
  home: { slug: "america", name: "Club América", shortName: "América", record: "10-4-2" },
  away: { slug: "cruz-azul", name: "Cruz Azul", shortName: "Cruz Azul", record: "11-3-2" },
} as unknown as PlatformGame;

const SAMPLE_LIVE_JOURNAL: JournalEntry[] = [
  {
    id: "j-live-over",
    pickId: "p-over",
    gameId: "mx-live-demo",
    leagueLabel: "Liga MX",
    matchLabel: "América vs Cruz Azul",
    pickLabel: "Más de 2.5 goles",
    origin: "Spacetime Suite",
    units: 1,
    userDecimal: 1.92,
    fairDecimal: 1.84,
    clvPct: 4.2,
    status: "pending",
    sealedAt: "Hoy 19:00",
  },
  {
    id: "j-live-ah",
    pickId: "p-ah",
    gameId: "mx-live-demo",
    leagueLabel: "Liga MX",
    matchLabel: "América vs Cruz Azul",
    pickLabel: "América -0.75",
    origin: "Spacetime Suite",
    units: 1,
    userDecimal: 2.04,
    fairDecimal: 1.95,
    clvPct: 3.1,
    status: "pending",
    sealedAt: "Hoy 19:05",
  },
];

export const RefereeRigorDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 920 }}>
      <div className="glass-card glass-ring rounded-2xl p-4">
        <RefereeRigorBadge referee={SAMPLE_REFEREES[0]!} variant="compact" />
      </div>
      <div className="pl-ref-dir-grid">
        {SAMPLE_REFEREES.map((r) => (
          <RefereeRigorBadge key={r.name} referee={r} variant="card" />
        ))}
      </div>
    </div>
  ),
};

export const RefereeRigorLight: StoryObj = {
  globals: { theme: "light" },
  render: RefereeRigorDark.render,
};

export const CalibrationHonestyLabDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ maxWidth: 880 }}>
      <CalibrationHonestyLab oddsFormat="decimal" settledCount={248} />
    </div>
  ),
};

export const CalibrationHonestyLabLight: StoryObj = {
  globals: { theme: "light" },
  render: () => (
    <div style={{ maxWidth: 880 }}>
      <CalibrationHonestyLab oddsFormat="american" settledCount={248} />
    </div>
  ),
};

export const CalibratedPropAndLiveProgressDark: StoryObj = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 18, maxWidth: 720 }}>
      <PlayerPropStreakCard
        playerName="Henry Martín"
        teamName="Club América"
        teamSlug="america"
        league={asLeagueId("liga-mx")}
        positionLabel="Delantero"
        oddsFormat="decimal"
        series={[
          {
            key: "shots",
            label: "Tiros totales",
            unit: "tiros",
            defaultLine: 1.5,
            minLine: 0.5,
            maxLine: 5.5,
            step: 0.5,
            points: [
              { label: "PUE", value: 3 },
              { label: "MTY", value: 2 },
              { label: "TIG", value: 1 },
              { label: "GDL", value: 4 },
              { label: "TOL", value: 2 },
            ],
          },
        ]}
      />
      <LivePicksTrackerStrip
        journal={SAMPLE_LIVE_JOURNAL}
        games={[SAMPLE_LIVE_GAME]}
        overrideScoreboard={[
          {
            gameId: "mx-live-demo",
            league: asLeagueId("liga-mx"),
            phase: "live",
            clock: "68",
            minute: 68,
            score: { home: 2, away: 1 },
            htScore: { home: 1, away: 0 },
            redCards: null,
            kickoffUtc: "2026-11-19T19:00:00Z",
          },
        ]}
      />
    </div>
  ),
};

export const CalibratedPropAndLiveProgressLight: StoryObj = {
  globals: { theme: "light" },
  render: CalibratedPropAndLiveProgressDark.render,
};
