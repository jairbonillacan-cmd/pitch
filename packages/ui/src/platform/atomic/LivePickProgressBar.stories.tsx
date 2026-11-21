import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  LivePickProgressBar,
  type LiveAsianPickState,
  type LivePickLineupAlert,
} from "./LivePickProgressBar";

type ProgressProps = React.ComponentProps<typeof LivePickProgressBar>;

interface AsianStateFixture {
  readonly state: LiveAsianPickState;
  readonly pickLabel: string;
  readonly matchLabel: string;
  readonly clockLabel: string;
  readonly actualValue: number;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly projectedFinal: number;
}

const ASIAN_STATE_FIXTURES: readonly AsianStateFixture[] = [
  {
    state: "won_full",
    pickLabel: "América -0.5 (Hándicap asiático)",
    matchLabel: "América 2-0 Cruz Azul",
    clockLabel: "78'",
    actualValue: 2,
    targetLine: 0.5,
    unitLabel: "dif.",
    projectedFinal: 2.2,
  },
  {
    state: "won_half",
    pickLabel: "América +0.25 (Hándicap asiático)",
    matchLabel: "América 1-1 Tigres",
    clockLabel: "81'",
    actualValue: 0,
    targetLine: -0.25,
    unitLabel: "dif.",
    projectedFinal: 0.1,
  },
  {
    state: "push",
    pickLabel: "Más de 2.0 goles (Línea asiática)",
    matchLabel: "Arsenal 1-1 Chelsea",
    clockLabel: "72'",
    actualValue: 2,
    targetLine: 2.0,
    unitLabel: "goles",
    projectedFinal: 2.5,
  },
  {
    state: "lost_half",
    pickLabel: "Cruz Azul -0.25 (Hándicap asiático)",
    matchLabel: "Cruz Azul 0-0 Monterrey",
    clockLabel: "84'",
    actualValue: 0,
    targetLine: 0.25,
    unitLabel: "dif.",
    projectedFinal: 0.1,
  },
  {
    state: "lost_full",
    pickLabel: "Chivas -1.0 (Hándicap asiático)",
    matchLabel: "Chivas 0-1 Atlas",
    clockLabel: "86'",
    actualValue: -1,
    targetLine: 1.0,
    unitLabel: "dif.",
    projectedFinal: -0.8,
  },
];

const BENCH_ALERT: LivePickLineupAlert = "titular_en_banca";

const meta = {
  title: "Platform v4 / Atomic Kit / LivePickProgressBar",
  component: LivePickProgressBar,
  parameters: { layout: "padded" },
  args: {
    pickLabel: "Más de 2.5 goles",
    matchLabel: "América 2-0 Cruz Azul",
    clockLabel: "64'",
    actualValue: 2,
    targetLine: 2.5,
    unitLabel: "goles",
    direction: "over",
    projectedFinal: 3.1,
    asianState: null,
    starterAlert: null,
    starterAlertDetail: null,
    compact: false,
  },
  render: (args: ProgressProps) => (
    <div style={{ maxWidth: 640 }}>
      <LivePickProgressBar {...args} />
    </div>
  ),
} satisfies Meta<typeof LivePickProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OverUnderEnVivoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 14, maxWidth: 680 }}>
      <LivePickProgressBar
        pickLabel="Más de 2.5 goles"
        matchLabel="América 2-0 Cruz Azul"
        clockLabel="64'"
        actualValue={2}
        targetLine={2.5}
        unitLabel="goles"
        direction="over"
        projectedFinal={3.1}
      />

      <LivePickProgressBar
        pickLabel="Menos de 9.5 tiros de esquina"
        matchLabel="Arsenal 1-1 Chelsea"
        clockLabel="71'"
        actualValue={6}
        targetLine={9.5}
        unitLabel="córners"
        direction="under"
        projectedFinal={8.2}
      />

      <LivePickProgressBar
        pickLabel="Jayson Tatum · Más de 26.5 puntos"
        matchLabel="Celtics 88-81 Knicks"
        clockLabel="3C · 03:45"
        actualValue={21}
        targetLine={26.5}
        unitLabel="pts"
        direction="over"
        projectedFinal={29.4}
      />

      <LivePickProgressBar
        pickLabel="Más de 3.5 tarjetas amarillas"
        matchLabel="Tigres 1-1 Monterrey"
        clockLabel="58'"
        actualValue={3}
        targetLine={3.5}
        unitLabel="tarjetas"
        direction="over"
        projectedFinal={4.6}
        compact
      />
    </div>
  ),
};

export const OverUnderEnVivoClaro: Story = {
  globals: { theme: "light" },
  render: OverUnderEnVivoOscuro.render,
};

export const CincoEstadosAsiaticosOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 12, maxWidth: 680 }}>
      {ASIAN_STATE_FIXTURES.map((item) => (
        <LivePickProgressBar
          key={item.state}
          pickLabel={item.pickLabel}
          matchLabel={item.matchLabel}
          clockLabel={item.clockLabel}
          actualValue={item.actualValue}
          targetLine={item.targetLine}
          unitLabel={item.unitLabel}
          direction="handicap"
          projectedFinal={item.projectedFinal}
          asianState={item.state}
        />
      ))}
    </div>
  ),
};

export const CincoEstadosAsiaticosClaro: Story = {
  globals: { theme: "light" },
  render: CincoEstadosAsiaticosOscuro.render,
};

export const AlertaTitularEnBancaOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    pickLabel: "Henry Martín · Más de 1.5 remates a puerta",
    matchLabel: "América 0-0 Cruz Azul",
    clockLabel: "19'",
    actualValue: 0,
    targetLine: 1.5,
    unitLabel: "tiros",
    direction: "over",
    projectedFinal: 0.4,
    starterAlert: BENCH_ALERT,
    starterAlertDetail:
      "Confirmado como suplente en el XI oficial; proyección ajustada por minutos disponibles.",
  },
};

export const AlertaTitularEnBancaClaro: Story = {
  globals: { theme: "light" },
  args: AlertaTitularEnBancaOscuro.args,
};

export const MovilOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
      <LivePickProgressBar
        pickLabel="Más de 2.5 goles"
        matchLabel="América 2-0 Cruz Azul"
        clockLabel="64'"
        actualValue={2}
        targetLine={2.5}
        unitLabel="goles"
        direction="over"
        projectedFinal={3.1}
        compact
      />
      <LivePickProgressBar
        pickLabel="América +0.25 (Hándicap)"
        matchLabel="América 1-1 Tigres"
        clockLabel="81'"
        actualValue={0}
        targetLine={-0.25}
        unitLabel="dif."
        direction="handicap"
        projectedFinal={0.1}
        asianState="won_half"
        compact
      />
      <LivePickProgressBar
        pickLabel="Henry Martín · +1.5 tiros a puerta"
        matchLabel="América 0-0 Cruz Azul"
        clockLabel="19'"
        actualValue={0}
        targetLine={1.5}
        unitLabel="tiros"
        direction="over"
        projectedFinal={0.4}
        starterAlert={BENCH_ALERT}
        starterAlertDetail="Suplente en XI confirmado."
        compact
      />
    </div>
  ),
};

export const MovilClaro: Story = {
  globals: { theme: "light" },
  render: MovilOscuro.render,
};
