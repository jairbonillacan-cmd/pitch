import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AtomicLineupPitch,
  type AtomicLineupPitchProps,
  type AtomicLineupPlayer,
} from "./AtomicLineupPitch";

/** 4-3-3 titular (1 portero, 4 defensas, 3 medios, 3 delanteros) con notas e incidencias. */
const CONFIRMED_HOME_433: readonly AtomicLineupPlayer[] = [
  { name: "Kevin Mier", number: 23, position: "POR", rating: 7.2 },
  { name: "Jorge Sánchez", number: 2, position: "LD", rating: 6.8, events: ["yellow"] },
  { name: "Willer Ditta", number: 4, position: "DFC", rating: 7.3 },
  { name: "Gonzalo Piovi", number: 33, position: "DFC", rating: 6.5 },
  { name: "Carlos Rotondi", number: 29, position: "LI", rating: 8.1, events: ["goal"] },
  { name: "Erik Lira", number: 6, position: "MCD", rating: 7.2 },
  { name: "Carlos Rodríguez", number: 19, position: "MC", rating: 7.6 },
  { name: "Lorenzo Faravelli", number: 8, position: "MC", rating: 6.9, events: ["sub"] },
  { name: "Ignacio Rivero", number: 15, position: "ED", rating: 7.4, isCaptain: true },
  { name: "Giorgos Giakoumakis", number: 11, position: "DC", rating: 6.0 },
  { name: "Uriel Antuna", number: 7, position: "EI", rating: 6.7 },
];

/** 4-2-3-1 titular (1 portero, 4 defensas, 2 contenciones, 3 mediapuntas, 1 centrodelantero). */
const CONFIRMED_AWAY_4231: readonly AtomicLineupPlayer[] = [
  { name: "Luis Malagón", number: 1, position: "POR", rating: 7.8 },
  { name: "Kevin Álvarez", number: 5, position: "LD", rating: 7.0 },
  { name: "Israel Reyes", number: 3, position: "DFC", rating: 7.2 },
  { name: "Sebastián Cáceres", number: 4, position: "DFC", rating: 6.6, events: ["yellow"] },
  { name: "Cristian Calderón", number: 18, position: "LI", rating: 6.9 },
  { name: "Jonathan dos Santos", number: 6, position: "MCD", rating: 7.4, events: ["sub"] },
  { name: "Álvaro Fidalgo", number: 8, position: "MC", rating: 8.3 },
  { name: "Alejandro Zendejas", number: 17, position: "ED", rating: 7.5 },
  { name: "Diego Valdés", number: 10, position: "MCO", rating: 8.4, events: ["goal"] },
  { name: "Brian Rodríguez", number: 7, position: "EI", rating: 7.1 },
  { name: "Henry Martín", number: 21, position: "DC", rating: 8.2, isCaptain: true, events: ["goal"] },
];

const PROBABLE_HOME_433: readonly AtomicLineupPlayer[] = CONFIRMED_HOME_433.map(
  ({ name, number, position, isCaptain }) => ({ name, number, position, isCaptain }),
);

const PROBABLE_AWAY_4231: readonly AtomicLineupPlayer[] = CONFIRMED_AWAY_4231.map(
  ({ name, number, position, isCaptain }) => ({ name, number, position, isCaptain }),
);

const meta = {
  title: "Platform v4 / Atomic Kit / AtomicLineupPitch",
  component: AtomicLineupPitch,
  parameters: { layout: "padded" },
  args: {
    homeName: "Cruz Azul",
    awayName: "América",
    homeFormation: "4-3-3",
    awayFormation: "4-2-3-1",
    homeStarters: CONFIRMED_HOME_433,
    awayStarters: CONFIRMED_AWAY_4231,
    status: "confirmed",
    homeCoach: "Martín Anselmi",
    awayCoach: "André Jardine",
  },
  render: (args: AtomicLineupPitchProps) => (
    <div style={{ maxWidth: 920 }}>
      <AtomicLineupPitch {...args} />
    </div>
  ),
} satisfies Meta<typeof AtomicLineupPitch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** XI confirmado 4-3-3 vs 4-2-3-1 con notas en cuatro rangos, capitanes e incidencias (tema oscuro). */
export const Confirmado433vs4231Oscuro: Story = {
  globals: { theme: "dark" },
};

/** XI confirmado 4-3-3 vs 4-2-3-1 en tema claro. */
export const Confirmado433vs4231Claro: Story = {
  globals: { theme: "light" },
};

/** XI probable previo al silbatazo inicial sin notas de partido (tema oscuro). */
export const ProbablePrepartidoOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    status: "probable",
    homeStarters: PROBABLE_HOME_433,
    awayStarters: PROBABLE_AWAY_4231,
  },
};

/** XI probable previo al silbatazo inicial en tema claro. */
export const ProbablePrepartidoClaro: Story = {
  globals: { theme: "light" },
  args: {
    status: "probable",
    homeStarters: PROBABLE_HOME_433,
    awayStarters: PROBABLE_AWAY_4231,
  },
};

/** Contenedor móvil de 375 px con pestañas táctiles Local / Visita (tema oscuro). */
export const MovilOscuro: Story = {
  globals: { theme: "dark" },
  render: (args: AtomicLineupPitchProps) => (
    <div style={{ maxWidth: 375 }}>
      <AtomicLineupPitch {...args} />
    </div>
  ),
};

/** Contenedor móvil de 375 px en tema claro. */
export const MovilClaro: Story = {
  globals: { theme: "light" },
  render: MovilOscuro.render,
};
