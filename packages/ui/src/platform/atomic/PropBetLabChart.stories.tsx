import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PropBetLabChart, type PropBetLabPoint } from "./PropBetLabChart";

type ChartProps = React.ComponentProps<typeof PropBetLabChart>;

const FOOTBALL_POINTS: readonly PropBetLabPoint[] = [
  { id: "fb-1", label: "J6", opponent: "Puebla", date: "2026-08-29", value: 2, minutes: 90, xg: 0.64, isHome: true },
  { id: "fb-2", label: "J7", opponent: "Santos", date: "2026-09-05", value: 1, minutes: 81, xg: 0.31, isHome: false },
  { id: "fb-3", label: "J8", opponent: "Chivas", date: "2026-09-12", value: 3, minutes: 90, xg: 0.88, isHome: true },
  { id: "fb-4", label: "J9", opponent: "Atlas", date: "2026-09-19", value: 2, minutes: 84, xg: 0.52, isHome: true },
  { id: "fb-5", label: "J10", opponent: "Necaxa", date: "2026-09-26", value: 0, minutes: 62, xg: 0.14, isHome: false },
  { id: "fb-6", label: "J11", opponent: "Pumas", date: "2026-10-03", value: 2, minutes: 90, xg: 0.69, isHome: true },
  { id: "fb-7", label: "J12", opponent: "León", date: "2026-10-17", value: 1, minutes: 76, xg: 0.27, isHome: false },
  { id: "fb-8", label: "J13", opponent: "Toluca", date: "2026-10-24", value: 3, minutes: 90, xg: 0.91, isHome: true },
  { id: "fb-9", label: "J14", opponent: "Monterrey", date: "2026-10-31", value: 2, minutes: 88, xg: 0.58, isHome: false },
  { id: "fb-10", label: "J15", opponent: "Pachuca", date: "2026-11-07", value: 2, minutes: 90, xg: 0.74, isHome: true },
];

const NBA_POINTS: readonly PropBetLabPoint[] = [
  { id: "nba-1", label: "vs NYK", opponent: "Knicks", date: "2026-10-24", value: 31, minutes: 38, xg: null, isHome: true },
  { id: "nba-2", label: "@ MIA", opponent: "Heat", date: "2026-10-26", value: 24, minutes: 35, xg: null, isHome: false },
  { id: "nba-3", label: "vs MIL", opponent: "Bucks", date: "2026-10-28", value: 29, minutes: 39, xg: null, isHome: true },
  { id: "nba-4", label: "@ PHI", opponent: "76ers", date: "2026-10-30", value: 27, minutes: 37, xg: null, isHome: false },
  { id: "nba-5", label: "vs CLE", opponent: "Cavaliers", date: "2026-11-01", value: 22, minutes: 33, xg: null, isHome: true },
  { id: "nba-6", label: "@ ATL", opponent: "Hawks", date: "2026-11-03", value: 34, minutes: 41, xg: null, isHome: false },
  { id: "nba-7", label: "vs ORL", opponent: "Magic", date: "2026-11-05", value: 28, minutes: 38, xg: null, isHome: true },
  { id: "nba-8", label: "@ IND", opponent: "Pacers", date: "2026-11-07", value: 30, minutes: 36, xg: null, isHome: false },
  { id: "nba-9", label: "vs BKN", opponent: "Nets", date: "2026-11-09", value: 25, minutes: 32, xg: null, isHome: true },
  { id: "nba-10", label: "@ TOR", opponent: "Raptors", date: "2026-11-11", value: 33, minutes: 39, xg: null, isHome: false },
];

function InteractiveFootballLab(): React.JSX.Element {
  const [line, setLine] = useState<number>(1.5);
  const lineOptions: readonly number[] = [0.5, 1.5, 2.5];

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
      <div className="pl-atom-seg-group" role="group" aria-label="Elegir línea alternativa">
        {lineOptions.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`pl-atom-seg-btn num${line === candidate ? " is-active" : ""}`}
            aria-pressed={line === candidate}
            onClick={() => setLine(candidate)}
          >
            Línea {candidate.toFixed(1)}
          </button>
        ))}
      </div>

      <PropBetLabChart
        playerName="Henry Martín"
        statLabel="Remates a puerta"
        unitLabel="tiros"
        sport="football"
        line={line}
        points={FOOTBALL_POINTS}
        maxMinutes={90}
        rivalDefenseRank={15}
        rivalLeagueSize={18}
        rivalEbLabel="Rival cede 4.9 remates a puerta por 90'"
        calibratedProb={line === 0.5 ? 0.84 : line === 1.5 ? 0.64 : 0.28}
        fairDecimal={line === 0.5 ? 1.19 : line === 1.5 ? 1.56 : 3.57}
        onLineChange={setLine}
      />
    </div>
  );
}

const meta = {
  title: "Platform v4 / Atomic Kit / PropBetLabChart",
  component: PropBetLabChart,
  parameters: { layout: "padded" },
  args: {
    playerName: "Henry Martín",
    statLabel: "Remates a puerta",
    unitLabel: "tiros",
    sport: "football",
    line: 1.5,
    points: FOOTBALL_POINTS,
    maxMinutes: 90,
    rivalDefenseRank: 15,
    rivalLeagueSize: 18,
    rivalEbLabel: "Rival cede 4.9 remates a puerta por 90'",
    calibratedProb: 0.64,
    fairDecimal: 1.56,
  },
  render: (args: ChartProps) => (
    <div style={{ maxWidth: 720 }}>
      <PropBetLabChart {...args} />
    </div>
  ),
} satisfies Meta<typeof PropBetLabChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FutbolRematesXgOscuro: Story = {
  globals: { theme: "dark" },
};

export const FutbolRematesXgClaro: Story = {
  globals: { theme: "light" },
};

export const NbaPuntosMinutosOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    playerName: "Jayson Tatum",
    statLabel: "Puntos",
    unitLabel: "pts",
    sport: "basketball",
    line: 26.5,
    points: NBA_POINTS,
    maxMinutes: 48,
    rivalDefenseRank: 24,
    rivalLeagueSize: 30,
    rivalEbLabel: "Defensa rival 24.º en puntos permitidos a aleros",
    calibratedProb: 0.61,
    fairDecimal: 1.64,
  },
};

export const NbaPuntosMinutosClaro: Story = {
  globals: { theme: "light" },
  args: NbaPuntosMinutosOscuro.args,
};

export const LineaInteractivaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <InteractiveFootballLab />,
};

export const LineaInteractivaClaro: Story = {
  globals: { theme: "light" },
  render: () => <InteractiveFootballLab />,
};

export const MovilOscuro: Story = {
  globals: { theme: "dark" },
  render: (args: ChartProps) => (
    <div style={{ maxWidth: 375 }}>
      <PropBetLabChart {...args} />
    </div>
  ),
};

export const MovilClaro: Story = {
  globals: { theme: "light" },
  render: MovilOscuro.render,
};
