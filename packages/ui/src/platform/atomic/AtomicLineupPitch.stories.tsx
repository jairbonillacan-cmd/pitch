import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { LiveSide } from "@pitchlab/contracts";
import {
  AtomicLineupPitch,
  type AtomicLineupPitchProps,
  type AtomicLineupPlayer,
} from "./AtomicLineupPitch";

const CONFIRMED_HOME_433: readonly AtomicLineupPlayer[] = [
  { name: "Kevin Mier", number: 23, position: "POR", rating: 7.2, playerHref: "/app/liga-mx/p/kevin-mier" },
  { name: "Jorge Sánchez", number: 2, position: "LD", rating: 6.8, events: ["yellow"], playerHref: "/app/liga-mx/p/jorge-sanchez" },
  { name: "Willer Ditta", number: 4, position: "DFC", rating: 7.3, playerHref: "/app/liga-mx/p/willer-ditta" },
  { name: "Gonzalo Piovi", number: 33, position: "DFC", rating: 6.5, playerHref: "/app/liga-mx/p/gonzalo-piovi" },
  { name: "Carlos Rotondi", number: 29, position: "LI", rating: 8.1, events: ["goal"], playerHref: "/app/liga-mx/p/carlos-rotondi" },
  { name: "Erik Lira", number: 6, position: "MCD", rating: 7.2, playerHref: "/app/liga-mx/p/erik-lira" },
  { name: "Carlos Rodríguez", number: 19, position: "MC", rating: 7.6, playerHref: "/app/liga-mx/p/carlos-rodriguez" },
  { name: "Lorenzo Faravelli", number: 8, position: "MC", rating: 6.9, events: ["sub"], playerHref: "/app/liga-mx/p/lorenzo-faravelli" },
  { name: "Ignacio Rivero", number: 15, position: "ED", rating: 7.4, isCaptain: true, playerHref: "/app/liga-mx/p/ignacio-rivero" },
  { name: "Giorgos Giakoumakis", number: 11, position: "DC", rating: 6.0, playerHref: "/app/liga-mx/p/giorgos-giakoumakis" },
  { name: "Uriel Antuna", number: 7, position: "EI", rating: 6.7, playerHref: "/app/liga-mx/p/uriel-antuna" },
];

const CONFIRMED_AWAY_4231: readonly AtomicLineupPlayer[] = [
  { name: "Luis Malagón", number: 1, position: "POR", rating: 7.8, playerHref: "/app/liga-mx/p/luis-malagon" },
  { name: "Kevin Álvarez", number: 5, position: "LD", rating: 7.0, playerHref: "/app/liga-mx/p/kevin-alvarez" },
  { name: "Israel Reyes", number: 3, position: "DFC", rating: 7.2, playerHref: "/app/liga-mx/p/israel-reyes" },
  { name: "Sebastián Cáceres", number: 4, position: "DFC", rating: 6.6, events: ["yellow"], playerHref: "/app/liga-mx/p/sebastian-caceres" },
  { name: "Cristian Calderón", number: 18, position: "LI", rating: 6.9, playerHref: "/app/liga-mx/p/cristian-calderon" },
  { name: "Jonathan dos Santos", number: 6, position: "MCD", rating: 7.4, events: ["sub"], playerHref: "/app/liga-mx/p/jonathan-dos-santos" },
  { name: "Álvaro Fidalgo", number: 8, position: "MC", rating: 8.3, playerHref: "/app/liga-mx/p/alvaro-fidalgo" },
  { name: "Alejandro Zendejas", number: 17, position: "ED", rating: 7.5, playerHref: "/app/liga-mx/p/alejandro-zendejas" },
  { name: "Diego Valdés", number: 10, position: "MCO", rating: 8.4, events: ["goal"], playerHref: "/app/liga-mx/p/diego-valdes" },
  { name: "Brian Rodríguez", number: 7, position: "EI", rating: 7.1, playerHref: "/app/liga-mx/p/brian-rodriguez" },
  { name: "Henry Martín", number: 21, position: "DC", rating: 8.2, isCaptain: true, events: ["goal"], playerHref: "/app/liga-mx/p/henry-martin" },
];

const PROBABLE_HOME_433: readonly AtomicLineupPlayer[] = CONFIRMED_HOME_433.map(
  ({ name, number, position, isCaptain, playerHref }) => ({
    name,
    number,
    position,
    isCaptain,
    playerHref,
  }),
);

const PROBABLE_AWAY_4231: readonly AtomicLineupPlayer[] = CONFIRMED_AWAY_4231.map(
  ({ name, number, position, isCaptain, playerHref }) => ({
    name,
    number,
    position,
    isCaptain,
    playerHref,
  }),
);

function InteractiveLineupShowcase(props: AtomicLineupPitchProps): React.JSX.Element {
  const [selected, setSelected] = useState<{
    readonly player: AtomicLineupPlayer;
    readonly side: LiveSide;
  } | null>(null);

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 920 }}>
      <AtomicLineupPitch
        {...props}
        onSelectPlayer={(player, side) => setSelected({ player, side })}
      />
      <div className="pl-atom-card num" role="status" aria-live="polite">
        {selected ? (
          <span>
            Jugador seleccionado: <strong>{selected.player.name}</strong> (
            {selected.side === "home" ? props.homeName : props.awayName} · #{selected.player.number ?? "—"}
            {selected.player.rating != null ? ` · Nota ${selected.player.rating.toFixed(1)}` : ""})
          </span>
        ) : (
          <span className="pl-atom-sub">
            Selecciona cualquier dorsal en la cancha para inspeccionar su perfil.
          </span>
        )}
      </div>
    </div>
  );
}

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

export const Confirmado433vs4231Oscuro: Story = {
  globals: { theme: "dark" },
};

export const Confirmado433vs4231Claro: Story = {
  globals: { theme: "light" },
};

export const SeleccionInteractivaOscuro: Story = {
  globals: { theme: "dark" },
  render: (args: AtomicLineupPitchProps) => <InteractiveLineupShowcase {...args} />,
};

export const SeleccionInteractivaClaro: Story = {
  globals: { theme: "light" },
  render: SeleccionInteractivaOscuro.render,
};

export const ProbablePrepartidoOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    status: "probable",
    homeStarters: PROBABLE_HOME_433,
    awayStarters: PROBABLE_AWAY_4231,
  },
};

export const ProbablePrepartidoClaro: Story = {
  globals: { theme: "light" },
  args: {
    status: "probable",
    homeStarters: PROBABLE_HOME_433,
    awayStarters: PROBABLE_AWAY_4231,
  },
};

export const MovilOscuro: Story = {
  globals: { theme: "dark" },
  render: (args: AtomicLineupPitchProps) => (
    <div style={{ maxWidth: 375 }}>
      <AtomicLineupPitch {...args} />
    </div>
  ),
};

export const MovilClaro: Story = {
  globals: { theme: "light" },
  render: MovilOscuro.render,
};
