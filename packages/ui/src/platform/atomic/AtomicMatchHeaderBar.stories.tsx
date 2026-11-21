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

export const EstadosDelPartidoClaro: Story = {
  globals: { theme: "light" },
  render: EstadosDelPartidoOscuro.render,
};

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

export const EnVivoOscuro: Story = {
  globals: { theme: "dark" },
};

export const EnVivoClaro: Story = {
  globals: { theme: "light" },
};

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

export const MovilEnVivoOscuro: Story = {
  globals: { theme: "dark" },
  render: (args: AtomicMatchHeaderBarProps) => (
    <div style={{ maxWidth: 375 }}>
      <AtomicMatchHeaderBar {...args} />
    </div>
  ),
};

export const MovilEnVivoClaro: Story = {
  globals: { theme: "light" },
  render: MovilEnVivoOscuro.render,
};

export const StickyMovil320Oscuro: Story = {
  globals: { theme: "dark" },
  render: (args: AtomicMatchHeaderBarProps) => (
    <div
      style={{
        width: 320,
        maxWidth: "100%",
        maxHeight: 220,
        overflowY: "auto",
        overflowX: "clip",
        border: "1px solid var(--pl-border)",
        borderRadius: 12,
      }}
    >
      <AtomicMatchHeaderBar
        {...args}
        sticky
        trailing={
          <button type="button" className="pl-atom-seg-btn is-active">
            Siguiendo
          </button>
        }
      />
      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        <span className="pl-atom-sub">Ancho 320 px · Encabezado sticky compacto</span>
        <div className="pl-atom-card" style={{ minHeight: 180 }}>
          <span className="pl-atom-sub">Contenido desplazable del partido</span>
        </div>
      </div>
    </div>
  ),
};

export const StickyMovil320Claro: Story = {
  globals: { theme: "light" },
  render: StickyMovil320Oscuro.render,
};

export const StickyEscritorio1440Oscuro: Story = {
  globals: { theme: "dark" },
  parameters: { layout: "fullscreen" },
  render: (args: AtomicMatchHeaderBarProps) => (
    <div style={{ maxWidth: 1440, margin: "0 auto" }}>
      <AtomicMatchHeaderBar
        {...args}
        sticky
        trailing={
          <button type="button" className="pl-atom-seg-btn is-active">
            Siguiendo
          </button>
        }
      />
      <div style={{ padding: 16 }}>
        <div className="pl-atom-card" style={{ minHeight: 160 }}>
          <span className="pl-atom-sub">Vista 1440 px · Barra sticky de una sola línea</span>
        </div>
      </div>
    </div>
  ),
};

export const StickyEscritorio1440Claro: Story = {
  globals: { theme: "light" },
  parameters: { layout: "fullscreen" },
  render: StickyEscritorio1440Oscuro.render,
};
