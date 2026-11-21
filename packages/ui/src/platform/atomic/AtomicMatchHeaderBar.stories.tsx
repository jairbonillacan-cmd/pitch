import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId } from "@pitchlab/contracts";
import {
  AtomicMatchHeaderBar,
  type AtomicMatchHeaderBarProps,
  type AtomicMatchHeaderTeam,
} from "./AtomicMatchHeaderBar";

const LIGA_MX = asLeagueId("liga-mx");

const AMERICA: AtomicMatchHeaderTeam = {
  slug: "america",
  name: "Club América",
  shortName: "América",
};

const CRUZ_AZUL: AtomicMatchHeaderTeam = {
  slug: "cruz-azul",
  name: "Cruz Azul",
  shortName: "Cruz Azul",
};

const CRUZ_AZUL_CON_ROJA: AtomicMatchHeaderTeam = {
  ...CRUZ_AZUL,
  redCards: 1,
};

const TIGRES: AtomicMatchHeaderTeam = {
  slug: "tigres-uanl",
  name: "Tigres UANL",
  shortName: "Tigres",
};

const MONTERREY: AtomicMatchHeaderTeam = {
  slug: "monterrey",
  name: "Rayados de Monterrey",
  shortName: "Monterrey",
};

const meta = {
  title: "Platform v4 / Atomic Kit / AtomicMatchHeaderBar",
  component: AtomicMatchHeaderBar,
  parameters: { layout: "padded" },
  args: {
    league: LIGA_MX,
    home: AMERICA,
    away: CRUZ_AZUL_CON_ROJA,
    phase: "live",
    clock: "68",
    score: { home: 2, away: 1 },
    latestEvent: {
      kind: "goal",
      minute: 64,
      label: "Henry Martín",
    },
    sticky: false,
  },
  render: (args: AtomicMatchHeaderBarProps) => (
    <div style={{ maxWidth: 820 }}>
      <AtomicMatchHeaderBar {...args} />
    </div>
  ),
} satisfies Meta<typeof AtomicMatchHeaderBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const SECTION_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

/** Los tres estados clave (`NS`, `LIVE` con minuto y marcador, y `FT`) más medio tiempo (tema oscuro). */
export const EstadosDelPartidoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      <div style={SECTION_STYLE}>
        <span className="pl-atom-sub">Por jugar (NS)</span>
        <AtomicMatchHeaderBar
          league={LIGA_MX}
          home={TIGRES}
          away={MONTERREY}
          phase="scheduled"
          clock="19:05"
          score={null}
          trailing={
            <button type="button" className="pl-atom-seg-btn">
              Seguir
            </button>
          }
        />
      </div>

      <div style={SECTION_STYLE}>
        <span className="pl-atom-sub">En vivo (LIVE · minuto, marcador, expulsión e incidencia)</span>
        <AtomicMatchHeaderBar
          league={LIGA_MX}
          home={AMERICA}
          away={CRUZ_AZUL_CON_ROJA}
          phase="live"
          clock="68"
          score={{ home: 2, away: 1 }}
          latestEvent={{ kind: "goal", minute: 64, label: "Henry Martín" }}
          trailing={
            <button type="button" className="pl-atom-seg-btn is-active">
              Siguiendo
            </button>
          }
        />
      </div>

      <div style={SECTION_STYLE}>
        <span className="pl-atom-sub">Medio tiempo (MT)</span>
        <AtomicMatchHeaderBar
          league={LIGA_MX}
          home={AMERICA}
          away={CRUZ_AZUL}
          phase="halftime"
          score={{ home: 1, away: 1 }}
          latestEvent={{ kind: "yellow", minute: 45, addedTime: 2, label: "Sebastián Cáceres" }}
        />
      </div>

      <div style={SECTION_STYLE}>
        <span className="pl-atom-sub">Finalizado (FT)</span>
        <AtomicMatchHeaderBar
          league={LIGA_MX}
          home={AMERICA}
          away={CRUZ_AZUL}
          phase="final"
          score={{ home: 2, away: 1 }}
          latestEvent={{ kind: "whistle", minute: 90, addedTime: 4, label: "Silbatazo final" }}
        />
      </div>
    </div>
  ),
};

/** Los tres estados clave (`NS`, `LIVE` y `FT`) en tema claro. */
export const EstadosDelPartidoClaro: Story = {
  globals: { theme: "light" },
  render: EstadosDelPartidoOscuro.render,
};

/** Partido programado (`NS`) antes del inicio (tema oscuro). */
export const PorJugarNSOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    home: TIGRES,
    away: MONTERREY,
    phase: "scheduled",
    clock: "19:05",
    score: null,
    latestEvent: null,
  },
};

/** Partido programado (`NS`) en tema claro. */
export const PorJugarNSClaro: Story = {
  globals: { theme: "light" },
  args: {
    home: TIGRES,
    away: MONTERREY,
    phase: "scheduled",
    clock: "19:05",
    score: null,
    latestEvent: null,
  },
};

/** Partido en vivo (`LIVE`) con minuto, marcador, tarjeta roja e incidencia (tema oscuro). */
export const EnVivoOscuro: Story = {
  globals: { theme: "dark" },
};

/** Partido en vivo (`LIVE`) en tema claro. */
export const EnVivoClaro: Story = {
  globals: { theme: "light" },
};

/** Partido finalizado (`FT`) resaltando al equipo ganador (tema oscuro). */
export const FinalizadoFTOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    home: AMERICA,
    away: CRUZ_AZUL,
    phase: "final",
    clock: null,
    score: { home: 2, away: 1 },
    latestEvent: null,
  },
};

/** Partido finalizado (`FT`) en tema claro. */
export const FinalizadoFTClaro: Story = {
  globals: { theme: "light" },
  args: {
    home: AMERICA,
    away: CRUZ_AZUL,
    phase: "final",
    clock: null,
    score: { home: 2, away: 1 },
    latestEvent: null,
  },
};

/** Encabezado compacto en ancho móvil de 375 px sin desbordamiento (tema oscuro). */
export const MovilEnVivoOscuro: Story = {
  globals: { theme: "dark" },
  render: (args: AtomicMatchHeaderBarProps) => (
    <div style={{ maxWidth: 375 }}>
      <AtomicMatchHeaderBar {...args} />
    </div>
  ),
};

/** Encabezado compacto en ancho móvil de 375 px en tema claro. */
export const MovilEnVivoClaro: Story = {
  globals: { theme: "light" },
  render: MovilEnVivoOscuro.render,
};
