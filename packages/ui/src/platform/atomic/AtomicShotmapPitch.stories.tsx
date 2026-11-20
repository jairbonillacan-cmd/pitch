import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AtomicShotmapPitch,
  type AtomicShotItem,
  type AtomicShotmapPitchProps,
} from "./AtomicShotmapPitch";

const MATCH_SHOTS: readonly AtomicShotItem[] = [
  {
    id: "shot-1",
    minute: 11,
    side: "away",
    outcome: "miss",
    xg: 0.06,
    x: 74,
    y: 66,
    player: "Lorenzo Faravelli",
    situation: "Jugada abierta",
  },
  {
    id: "shot-2",
    minute: 18,
    side: "home",
    outcome: "goal",
    xg: 0.42,
    x: 91,
    y: 47,
    player: "Henry Martín",
    situation: "Jugada abierta",
  },
  {
    id: "shot-3",
    minute: 27,
    side: "away",
    outcome: "block",
    xg: 0.12,
    x: 84,
    y: 55,
    player: "Giorgos Giakoumakis",
    situation: "Tiro de esquina",
  },
  {
    id: "shot-4",
    minute: 31,
    side: "home",
    outcome: "save",
    xg: 0.24,
    x: 82,
    y: 36,
    player: "Álvaro Fidalgo",
    situation: "Jugada abierta",
  },
  {
    id: "shot-5",
    minute: 44,
    addedTime: 2,
    side: "home",
    outcome: "post",
    xg: 0.31,
    x: 88,
    y: 62,
    player: "Alejandro Zendejas",
    situation: "Contraataque",
  },
  {
    id: "shot-6",
    minute: 52,
    side: "away",
    outcome: "goal",
    xg: 0.36,
    x: 89,
    y: 41,
    player: "Carlos Rotondi",
    situation: "Jugada abierta",
  },
  {
    id: "shot-7",
    minute: 64,
    side: "away",
    outcome: "save",
    xg: 0.19,
    x: 80,
    y: 59,
    player: "Ignacio Rivero",
    situation: "Tiro libre",
  },
  {
    id: "shot-8",
    minute: 71,
    side: "home",
    outcome: "block",
    xg: 0.15,
    x: 85,
    y: 44,
    player: "Brian Rodríguez",
    situation: "Jugada abierta",
  },
  {
    id: "shot-9",
    minute: 79,
    side: "home",
    outcome: "goal",
    xg: 0.54,
    x: 94,
    y: 52,
    player: "Diego Valdés",
    situation: "Pase filtrado",
  },
  {
    id: "shot-10",
    minute: 86,
    side: "home",
    outcome: "miss",
    xg: 0.09,
    x: 76,
    y: 28,
    player: "Israel Reyes",
    situation: "Tiro de esquina",
  },
];

const HOME_ONLY_SHOTS: readonly AtomicShotItem[] = MATCH_SHOTS.filter(
  (shot) => shot.side === "home",
);

const meta = {
  title: "Platform v4 / Atomic Kit / AtomicShotmapPitch",
  component: AtomicShotmapPitch,
  parameters: { layout: "padded" },
  args: {
    shots: MATCH_SHOTS,
    homeLabel: "América",
    awayLabel: "Cruz Azul",
    view: "auto",
    title: "Mapa de tiros",
    showEmpty: false,
  },
  render: (args: AtomicShotmapPitchProps) => (
    <div style={{ maxWidth: 720 }}>
      <AtomicShotmapPitch {...args} />
    </div>
  ),
} satisfies Meta<typeof AtomicShotmapPitch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partido con goles, atajadas, poste, bloqueos y tiros fuera con escala xG (tema oscuro). */
export const PartidoCompletoOscuro: Story = {
  globals: { theme: "dark" },
};

/** Partido completo en tema claro sobre tokens `--pl-*`. */
export const PartidoCompletoClaro: Story = {
  globals: { theme: "light" },
};

/** Media cancha ofensiva centrada en los remates del equipo local (tema oscuro). */
export const MediaCanchaOfensivaOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    shots: HOME_ONLY_SHOTS,
    view: "half",
    title: "Mapa de tiros · América",
  },
};

/** Media cancha ofensiva en tema claro. */
export const MediaCanchaOfensivaClaro: Story = {
  globals: { theme: "light" },
  args: {
    shots: HOME_ONLY_SHOTS,
    view: "half",
    title: "Mapa de tiros · América",
  },
};

/** Estado vacío explícito cuando el partido aún no tiene coordenadas registradas (tema oscuro). */
export const EstadoVacioOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    shots: [],
    showEmpty: true,
  },
};

/** Estado vacío explícito en tema claro. */
export const EstadoVacioClaro: Story = {
  globals: { theme: "light" },
  args: {
    shots: [],
    showEmpty: true,
  },
};

/** Vista compacta de 375 px sin desbordamiento horizontal (tema oscuro). */
export const MovilOscuro: Story = {
  globals: { theme: "dark" },
  render: (args: AtomicShotmapPitchProps) => (
    <div style={{ maxWidth: 375 }}>
      <AtomicShotmapPitch {...args} />
    </div>
  ),
};

/** Vista compacta de 375 px en tema claro. */
export const MovilClaro: Story = {
  globals: { theme: "light" },
  render: MovilOscuro.render,
};
