import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId, asMarketKey } from "@pitchlab/contracts";
import { CompactMatchRow } from "./components/CompactMatchRow";
import { DailyResultsCalendar } from "./components/DailyResultsCalendar";
import { DualStatComparisonCard } from "./components/DualStatComparisonCard";
import { LivePicksTrackerStrip } from "./components/LivePicksTrackerStrip";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import { buildMonthlyRecordCalendar, type CalendarRecordInputEntry } from "./record-stats";
import { makeStoryMatch } from "./story-fixtures";
import type { JournalEntry } from "./types";

const meta = {
  title: "PitchLab v4 / Simplificación UX",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const STORY_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura 2026",
    roundLabel: "Jornada 17",
    generatedAt: "2026-11-17T12:00:00Z",
    games: [
      {
        ...makeStoryMatch({
          id: "lmx-ame-tig",
          league: "liga-mx",
          leagueLabel: "Liga MX",
          sport: "football",
          status: "NS",
          homeSlug: "america",
          homeName: "Club América",
          homeCode: "AME",
          awaySlug: "tigres",
          awayName: "Tigres UANL",
          awayCode: "TIG",
          x12: [0.51, 0.26, 0.23],
          proj: { home: 1.8, away: 1.1, total: 2.9 },
        }),
        marketGroups: [
          {
            group: "Resultado",
            rows: [
              {
                market: asMarketKey("h2h"),
                selection: "home",
                label: "Club América gana",
                p: 0.51,
                fairOdds: 1.96,
              },
            ],
          },
        ],
      },
      {
        ...makeStoryMatch({
          id: "lmx-caz-mty",
          league: "liga-mx",
          leagueLabel: "Liga MX",
          sport: "football",
          status: "NS",
          homeSlug: "cruz-azul",
          homeName: "Cruz Azul",
          homeCode: "CAZ",
          awaySlug: "monterrey",
          awayName: "Monterrey",
          awayCode: "MTY",
          x12: [0.47, 0.28, 0.25],
          proj: { home: 2.0, away: 1.0, total: 3.0 },
        }),
        score: { home: 2, away: 0 },
        marketGroups: [
          {
            group: "Total de goles",
            rows: [
              {
                market: asMarketKey("totals"),
                selection: "over",
                line: 2.5,
                label: "Más de 2.5 goles",
                p: 0.64,
                fairOdds: 1.56,
              },
            ],
          },
        ],
      },
    ],
  },
]);

const CALENDAR_ENTRIES: CalendarRecordInputEntry[] = [
  {
    id: "c1",
    status: "won",
    units: 1.5,
    userDecimal: 2.1,
    fairDecimal: 1.92,
    clvPct: 4.1,
    leagueLabel: "Liga MX",
    matchLabel: "América vs Tigres",
    pickLabel: "América gana",
    origin: "Spacetime Suite",
    settledAtIso: "2026-11-06T22:00:00Z",
  },
  {
    id: "c2",
    status: "lost",
    units: 1.0,
    userDecimal: 1.91,
    fairDecimal: 1.85,
    clvPct: 1.2,
    leagueLabel: "NFL",
    matchLabel: "KC vs BUF",
    pickLabel: "KC −3.5",
    origin: "Spacetime Suite",
    settledAtIso: "2026-11-08T23:00:00Z",
  },
  {
    id: "c3",
    status: "won",
    units: 2.0,
    userDecimal: 2.2,
    fairDecimal: 2.0,
    clvPct: 5.0,
    leagueLabel: "Premier League",
    matchLabel: "Man City vs Fulham",
    pickLabel: "Más de 2.5 goles",
    origin: "Spacetime Suite",
    settledAtIso: "2026-11-14T18:00:00Z",
  },
  {
    id: "c4",
    status: "pending",
    units: 1.25,
    userDecimal: 1.95,
    fairDecimal: 1.82,
    clvPct: 3.6,
    leagueLabel: "Liga MX",
    matchLabel: "Cruz Azul vs Monterrey",
    pickLabel: "Más de 2.5 goles",
    origin: "Spacetime Suite",
    sealedAtIso: "2026-11-17T16:00:00Z",
  },
];

const LIVE_JOURNAL: JournalEntry[] = [
  {
    id: "lj-1",
    pickId: "lmx-caz-mty__p1",
    gameId: "lmx-caz-mty",
    leagueLabel: "Liga MX",
    matchLabel: "Cruz Azul vs Monterrey",
    pickLabel: "Más de 2.5 goles",
    origin: "Spacetime Suite",
    units: 1.5,
    userDecimal: 1.95,
    fairDecimal: 1.8,
    clvPct: 4.2,
    status: "pending",
    sealedAt: "17/11/2026 14:00",
    sealedAtIso: "2026-11-17T20:00:00Z",
  },
];

export const FilasCompactasOscuro: Story = {
  render: () => (
    <PlatformProvider dataset={STORY_DATASET} initialRole="member">
      <div className="max-w-md rounded-2xl overflow-hidden border" style={{ borderColor: "var(--pl-border)" }}>
        <CompactMatchRow
          game={STORY_DATASET.games[0]!}
          selected
          homeForm={["G", "G", "E", "P", "G"]}
          awayForm={["E", "G", "P", "G", "E"]}
        />
        <CompactMatchRow
          game={STORY_DATASET.games[1]!}
          liveEntry={{
            gameId: "lmx-caz-mty",
            league: "liga-mx",
            phase: "live",
            clock: "64",
            minute: 64,
            score: { home: 2, away: 0 },
            htScore: { home: 1, away: 0 },
            redCards: null,
            kickoffUtc: "2026-11-17T21:00:00Z",
          }}
          homeForm={["G", "G", "G", "E", "G"]}
          awayForm={["P", "G", "E", "G", "P"]}
        />
      </div>
    </PlatformProvider>
  ),
};

export const FilasCompactasClaro: Story = {
  globals: { theme: "light" },
  render: FilasCompactasOscuro.render,
};

export const CalendarioDiarioOscuro: Story = {
  render: () => (
    <PlatformProvider dataset={STORY_DATASET} initialRole="member">
      <div className="max-w-2xl glass-card glass-ring rounded-2xl p-5">
        <DailyResultsCalendar
          buildMonth={(ym) =>
            buildMonthlyRecordCalendar(CALENDAR_ENTRIES, ym || "2026-11", {
              nowIso: "2026-11-17T18:00:00Z",
            })
          }
          initialYearMonth="2026-11"
          todayYearMonth="2026-11"
          todayDateIso="2026-11-17"
        />
      </div>
    </PlatformProvider>
  ),
};

export const CalendarioDiarioClaro: Story = {
  globals: { theme: "light" },
  render: CalendarioDiarioOscuro.render,
};

export const ProgresoVivoYBarrasDuales: Story = {
  render: () => (
    <PlatformProvider dataset={STORY_DATASET} initialRole="member">
      <div className="max-w-2xl space-y-4">
        <LivePicksTrackerStrip
          journal={LIVE_JOURNAL}
          games={STORY_DATASET.games}
          overrideScoreboard={[
            {
              gameId: "lmx-caz-mty",
              league: "liga-mx",
              phase: "live",
              clock: "64",
              minute: 64,
              score: { home: 2, away: 0 },
              htScore: { home: 1, away: 0 },
              redCards: null,
              kickoffUtc: "2026-11-17T21:00:00Z",
            },
          ]}
        />
        <div className="pl-dual-stat-grid">
          <DualStatComparisonCard
            label="Goles esperados (xG)"
            badgeText="Total 2.9"
            homeLabel="Cruz Azul"
            awayLabel="Monterrey"
            homeValueText="1.85"
            awayValueText="1.05"
            homeNumeric={1.85}
            awayNumeric={1.05}
          />
          <DualStatComparisonCard
            label="Córners proyectados"
            badgeText="Total 9.8"
            homeLabel="Cruz Azul"
            awayLabel="Monterrey"
            homeValueText="5.6"
            awayValueText="4.2"
            homeNumeric={5.6}
            awayNumeric={4.2}
          />
        </div>
      </div>
    </PlatformProvider>
  ),
};
