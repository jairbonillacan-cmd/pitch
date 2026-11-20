import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId } from "@pitchlab/contracts";
import { CalibrationCurveChart } from "./components/CalibrationCurveChart";
import { PlayerPropStreakCard } from "./components/PlayerPropStreakCard";
import { TacticalPitchSvg } from "./components/TacticalPitchSvg";

const meta: Meta = {
  title: "Platform v4 / Componentes Atómicos v3",
  parameters: { layout: "padded" },
};
export default meta;

const SAMPLE_LINEUPS = {
  sourceLabel: "Once confirmado oficial",
  verifiedAtUtc: "2026-11-19T18:00:00Z",
  homeFormation: "4-2-3-1",
  awayFormation: "4-3-3",
  homeStarters: [
    { name: "Luis Malagón", number: 1, position: "GK" },
    { name: "Kevin Álvarez", number: 5, position: "RB" },
    { name: "Israel Reyes", number: 3, position: "CB" },
    { name: "Sebastián Cáceres", number: 4, position: "CB" },
    { name: "Cristian Calderón", number: 18, position: "LB" },
    { name: "Jonathan dos Santos", number: 6, position: "DM" },
    { name: "Álvaro Fidalgo", number: 8, position: "CM" },
    { name: "Alejandro Zendejas", number: 17, position: "RW" },
    { name: "Diego Valdés", number: 10, position: "AM" },
    { name: "Brian Rodríguez", number: 7, position: "LW" },
    { name: "Henry Martín", number: 21, position: "ST" },
  ],
  awayStarters: [
    { name: "Raúl Rangel", number: 1, position: "GK" },
    { name: "Alan Mozo", number: 2, position: "RB" },
    { name: "Gilberto Sepúlveda", number: 3, position: "CB" },
    { name: "Jesús Orozco", number: 13, position: "CB" },
    { name: "Mateo Chávez", number: 50, position: "LB" },
    { name: "Fernando Beltrán", number: 20, position: "CM" },
    { name: "Erick Gutiérrez", number: 15, position: "DM" },
    { name: "Roberto Alvarado", number: 25, position: "CM" },
    { name: "Cade Cowell", number: 16, position: "LW" },
    { name: "Ricardo Marín", number: 19, position: "ST" },
    { name: "Pável Pérez", number: 6, position: "RW" },
  ],
};

const SAMPLE_PROP_SERIES = [
  {
    key: "sot",
    label: "Tiros a puerta",
    unit: "tiros",
    defaultLine: 1.5,
    minLine: 0.5,
    maxLine: 4.5,
    step: 0.5,
    points: [
      { label: "vs TOL", value: 2 },
      { label: "vs MTY", value: 3 },
      { label: "vs TIG", value: 1 },
      { label: "vs PUM", value: 2 },
      { label: "vs CAZ", value: 4 },
      { label: "vs GDL", value: 2 },
      { label: "vs LEO", value: 0 },
      { label: "vs PAC", value: 3 },
      { label: "vs SAN", value: 2 },
      { label: "vs NEC", value: 2 },
    ],
  },
  {
    key: "goals",
    label: "Goles",
    unit: "goles",
    defaultLine: 0.5,
    minLine: 0.5,
    maxLine: 2.5,
    step: 0.5,
    points: [
      { label: "vs TOL", value: 1 },
      { label: "vs MTY", value: 0 },
      { label: "vs TIG", value: 1 },
      { label: "vs PUM", value: 0 },
      { label: "vs CAZ", value: 2 },
    ],
  },
];

const SAMPLE_CALIBRATION = [
  { p: 0.44, hit: false },
  { p: 0.46, hit: true },
  { p: 0.54, hit: true },
  { p: 0.57, hit: false },
  { p: 0.58, hit: true },
  { p: 0.62, hit: true },
  { p: 0.65, hit: true },
  { p: 0.66, hit: false },
  { p: 0.72, hit: true },
  { p: 0.75, hit: true },
  { p: 0.78, hit: true },
  { p: 0.83, hit: true },
  { p: 0.86, hit: true },
];

function AtomicV3Showcase({ theme }: { theme: "dark" | "light" }): React.JSX.Element {
  return (
    <div
      data-theme={theme}
      className="space-y-6 p-4 rounded-2xl"
      style={{ background: "var(--pl-bg)", color: "var(--pl-text)" }}
    >
      <TacticalPitchSvg
        homeName="América"
        awayName="Guadalajara"
        lineups={SAMPLE_LINEUPS}
        mode="confirmed"
      />
      <PlayerPropStreakCard
        playerName="Henry Martín"
        teamName="Club América"
        teamSlug="america"
        league={asLeagueId("liga-mx")}
        positionLabel="Delantero"
        series={SAMPLE_PROP_SERIES}
      />
      <CalibrationCurveChart samples={SAMPLE_CALIBRATION} />
    </div>
  );
}

export const Oscuro: StoryObj = {
  render: () => <AtomicV3Showcase theme="dark" />,
};

export const Claro: StoryObj = {
  render: () => <AtomicV3Showcase theme="light" />,
};
