import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AtomicAveragePositionsPitch,
  type AtomicAveragePositionPlayer,
  type AtomicAveragePositionsPitchProps,
} from "./AtomicAveragePositionsPitch";

const HOME_PLAYERS_11: readonly AtomicAveragePositionPlayer[] = [
  { id: "h-1", name: "Luis Malagón", number: 1, side: "home", x: 11, y: 50, touches: 31, position: "POR", rating: 7.4, playerHref: "/app/liga-mx/p/luis-malagon" },
  { id: "h-5", name: "Kevin Álvarez", number: 5, side: "home", x: 46, y: 84, touches: 62, position: "LD", rating: 7.1, playerHref: "/app/liga-mx/p/kevin-alvarez" },
  { id: "h-3", name: "Israel Reyes", number: 3, side: "home", x: 35, y: 63, touches: 68, position: "DFC", rating: 7.2, playerHref: "/app/liga-mx/p/israel-reyes" },
  { id: "h-4", name: "Sebastián Cáceres", number: 4, side: "home", x: 34, y: 37, touches: 64, position: "DFC", rating: 7.0, playerHref: "/app/liga-mx/p/sebastian-caceres" },
  { id: "h-18", name: "Cristian Calderón", number: 18, side: "home", x: 44, y: 16, touches: 58, position: "LI", rating: 6.9, playerHref: "/app/liga-mx/p/cristian-calderon" },
  { id: "h-6", name: "Jonathan dos Santos", shortName: "Dos Santos", number: 6, side: "home", x: 51, y: 58, touches: 82, position: "MCD", rating: 7.5, playerHref: "/app/liga-mx/p/jonathan-dos-santos" },
  { id: "h-8", name: "Álvaro Fidalgo", number: 8, side: "home", x: 56, y: 39, touches: 89, position: "MC", rating: 8.2, playerHref: "/app/liga-mx/p/alvaro-fidalgo" },
  { id: "h-17", name: "Alejandro Zendejas", number: 17, side: "home", x: 69, y: 81, touches: 54, position: "ED", rating: 7.6, playerHref: "/app/liga-mx/p/alejandro-zendejas" },
  { id: "h-10", name: "Diego Valdés", number: 10, side: "home", x: 67, y: 52, touches: 66, position: "MCO", rating: 8.3, playerHref: "/app/liga-mx/p/diego-valdes" },
  { id: "h-7", name: "Brian Rodríguez", number: 7, side: "home", x: 71, y: 20, touches: 49, position: "EI", rating: 7.1, playerHref: "/app/liga-mx/p/brian-rodriguez" },
  { id: "h-21", name: "Henry Martín", number: 21, side: "home", x: 78, y: 50, touches: 36, position: "DC", rating: 8.1, playerHref: "/app/liga-mx/p/henry-martin" },
];

const AWAY_PLAYERS_11: readonly AtomicAveragePositionPlayer[] = [
  { id: "a-23", name: "Kevin Mier", number: 23, side: "away", x: 12, y: 50, touches: 38, position: "POR", rating: 7.1, playerHref: "/app/liga-mx/p/kevin-mier" },
  { id: "a-2", name: "Jorge Sánchez", number: 2, side: "away", x: 41, y: 83, touches: 56, position: "LD", rating: 6.8, playerHref: "/app/liga-mx/p/jorge-sanchez" },
  { id: "a-4", name: "Willer Ditta", number: 4, side: "away", x: 31, y: 64, touches: 63, position: "DFC", rating: 7.2, playerHref: "/app/liga-mx/p/willer-ditta" },
  { id: "a-33", name: "Gonzalo Piovi", number: 33, side: "away", x: 32, y: 36, touches: 71, position: "DFC", rating: 6.7, playerHref: "/app/liga-mx/p/gonzalo-piovi" },
  { id: "a-29", name: "Carlos Rotondi", number: 29, side: "away", x: 45, y: 16, touches: 61, position: "LI", rating: 8.0, playerHref: "/app/liga-mx/p/carlos-rotondi" },
  { id: "a-6", name: "Erik Lira", number: 6, side: "away", x: 46, y: 50, touches: 75, position: "MCD", rating: 7.3, playerHref: "/app/liga-mx/p/erik-lira" },
  { id: "a-19", name: "Carlos Rodríguez", number: 19, side: "away", x: 56, y: 66, touches: 84, position: "MC", rating: 7.6, playerHref: "/app/liga-mx/p/carlos-rodriguez" },
  { id: "a-8", name: "Lorenzo Faravelli", number: 8, side: "away", x: 55, y: 35, touches: 78, position: "MC", rating: 7.0, playerHref: "/app/liga-mx/p/lorenzo-faravelli" },
  { id: "a-15", name: "Ignacio Rivero", number: 15, side: "away", x: 65, y: 78, touches: 52, position: "ED", rating: 7.4, playerHref: "/app/liga-mx/p/ignacio-rivero" },
  { id: "a-11", name: "Giorgos Giakoumakis", shortName: "Giakoumakis", number: 11, side: "away", x: 74, y: 51, touches: 33, position: "DC", rating: 6.5, playerHref: "/app/liga-mx/p/giorgos-giakoumakis" },
  { id: "a-7", name: "Uriel Antuna", number: 7, side: "away", x: 68, y: 24, touches: 47, position: "EI", rating: 6.9, playerHref: "/app/liga-mx/p/uriel-antuna" },
];

const ALL_22_PLAYERS: readonly AtomicAveragePositionPlayer[] = [
  ...HOME_PLAYERS_11,
  ...AWAY_PLAYERS_11,
];

function InteractiveAveragePositionsShowcase(
  props: AtomicAveragePositionsPitchProps,
): React.JSX.Element {
  const [selected, setSelected] = useState<AtomicAveragePositionPlayer | null>(null);

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 460 }}>
      <AtomicAveragePositionsPitch {...props} onSelectPlayer={setSelected} />
      <div className="pl-atom-card num" role="status" aria-live="polite">
        {selected ? (
          <span>
            Jugador activo: <strong>{selected.name}</strong> (#{selected.number ?? "—"} · Altura{" "}
            {Math.round(selected.x)} % · {selected.touches ?? "—"} toques)
          </span>
        ) : (
          <span className="pl-atom-sub">
            Toca o haz clic en un dorsal para consultar su altura media y volumen de toques.
          </span>
        )}
      </div>
    </div>
  );
}

const meta = {
  title: "Platform v4 / Atomic Kit / AtomicAveragePositionsPitch",
  component: AtomicAveragePositionsPitch,
  parameters: { layout: "padded" },
  args: {
    players: ALL_22_PLAYERS,
    homeLabel: "América",
    awayLabel: "Cruz Azul",
    homeFormation: "4-2-3-1",
    awayFormation: "4-3-3",
    defaultSide: "home",
    title: "Posiciones medias",
    showTable: true,
  },
  render: (args: AtomicAveragePositionsPitchProps) => (
    <div style={{ maxWidth: 460 }}>
      <AtomicAveragePositionsPitch {...args} />
    </div>
  ),
} satisfies Meta<typeof AtomicAveragePositionsPitch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Local11vs11Oscuro: Story = {
  globals: { theme: "dark" },
};

export const Local11vs11Claro: Story = {
  globals: { theme: "light" },
};

export const SeleccionInteractivaOscuro: Story = {
  globals: { theme: "dark" },
  render: (args: AtomicAveragePositionsPitchProps) => (
    <InteractiveAveragePositionsShowcase {...args} />
  ),
};

export const SeleccionInteractivaClaro: Story = {
  globals: { theme: "light" },
  render: SeleccionInteractivaOscuro.render,
};

export const Visita11vs11Oscuro: Story = {
  globals: { theme: "dark" },
  args: {
    defaultSide: "away",
  },
};

export const Visita11vs11Claro: Story = {
  globals: { theme: "light" },
  args: {
    defaultSide: "away",
  },
};

export const Comparativa11vs11Oscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16,
        maxWidth: 880,
      }}
    >
      <AtomicAveragePositionsPitch
        players={ALL_22_PLAYERS}
        homeLabel="América"
        awayLabel="Cruz Azul"
        homeFormation="4-2-3-1"
        awayFormation="4-3-3"
        defaultSide="home"
        title="Posiciones medias · Local"
        showTable={false}
      />
      <AtomicAveragePositionsPitch
        players={ALL_22_PLAYERS}
        homeLabel="América"
        awayLabel="Cruz Azul"
        homeFormation="4-2-3-1"
        awayFormation="4-3-3"
        defaultSide="away"
        title="Posiciones medias · Visita"
        showTable={false}
      />
    </div>
  ),
};

export const Comparativa11vs11Claro: Story = {
  globals: { theme: "light" },
  render: Comparativa11vs11Oscuro.render,
};
