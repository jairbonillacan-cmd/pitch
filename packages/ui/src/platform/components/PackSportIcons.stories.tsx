import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  MAESTRO_NEW_INTERFACE_ICONS,
  MaestroIcon,
} from "./MaestroPrimitives";
import {
  MARKET_CATEGORY_ICON_NAMES,
  MATCH_CONTEXT_ICON_NAMES,
  MarketCategoryIcon,
  MatchContextIcon,
  PACK_ICON_ASSET_MANIFEST,
  PLAYER_META_ICON_NAMES,
  PlayerMetaIcon,
  resolveMarketCategoryIconKey,
} from "./PackSportIcons";
import {
  SPORT_EVENT_PACK_ASSETS,
  SportEventIcon,
} from "./SportEventIcons";

const meta = {
  title: "Platform v4 / Iconos / Pack Deportivo WebP",
  component: MarketCategoryIcon,
  parameters: { layout: "padded" },
  args: {
    name: "xg-radar",
    size: 24,
  },
} satisfies Meta<typeof MarketCategoryIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

const STAGE_STYLE: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  display: "grid",
  gap: 24,
  color: "var(--pl-text)",
};

const SECTION_STYLE: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
  borderRadius: 12,
  border: "1px solid var(--pl-border)",
  background: "var(--pl-surface)",
};

const GRID_STYLE: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fill, minmax(136px, 1fr))",
};

const CELL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 8px",
  borderRadius: 10,
  border: "1px solid var(--pl-border)",
  background: "var(--pl-surface-elevated)",
  textAlign: "center",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.3,
  color: "var(--pl-text-secondary)",
  wordBreak: "break-word",
};

const HEADER_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

function FullPackGallery(): React.JSX.Element {
  return (
    <main style={STAGE_STYLE}>
      <header style={HEADER_ROW_STYLE}>
        <h1 className="m-0 text-lg font-extrabold">Pack Deportivo WebP (Claro y Oscuro)</h1>
        <span className="num text-xs" style={{ color: "var(--pl-text-muted)" }}>
          {PACK_ICON_ASSET_MANIFEST.length} activos verificados 1x/2x
        </span>
      </header>

      <section style={SECTION_STYLE}>
        <div style={HEADER_ROW_STYLE}>
          <h2 className="m-0 text-sm font-bold">Eventos ({SPORT_EVENT_PACK_ASSETS.length})</h2>
          <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
            eventos/*.webp
          </span>
        </div>
        <ul role="list" style={GRID_STYLE}>
          {SPORT_EVENT_PACK_ASSETS.map((kind) => (
            <li key={kind} style={CELL_STYLE}>
              <SportEventIcon kind={kind} size={24} />
              <span style={LABEL_STYLE}>{kind}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={SECTION_STYLE}>
        <div style={HEADER_ROW_STYLE}>
          <h2 className="m-0 text-sm font-bold">
            Interfaz nuevos ({MAESTRO_NEW_INTERFACE_ICONS.length})
          </h2>
          <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
            interfaz/*.webp
          </span>
        </div>
        <ul role="list" style={GRID_STYLE}>
          {MAESTRO_NEW_INTERFACE_ICONS.map((name) => (
            <li key={name} style={CELL_STYLE}>
              <MaestroIcon name={name} size={24} />
              <span style={LABEL_STYLE}>{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={SECTION_STYLE}>
        <div style={HEADER_ROW_STYLE}>
          <h2 className="m-0 text-sm font-bold">
            Mercados ({MARKET_CATEGORY_ICON_NAMES.length})
          </h2>
          <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
            mercados/*.webp
          </span>
        </div>
        <ul role="list" style={GRID_STYLE}>
          {MARKET_CATEGORY_ICON_NAMES.map((name) => (
            <li key={name} style={CELL_STYLE}>
              <MarketCategoryIcon name={name} size={24} />
              <span style={LABEL_STYLE}>{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={SECTION_STYLE}>
        <div style={HEADER_ROW_STYLE}>
          <h2 className="m-0 text-sm font-bold">
            Jugador ({PLAYER_META_ICON_NAMES.length})
          </h2>
          <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
            jugador/*.webp
          </span>
        </div>
        <ul role="list" style={GRID_STYLE}>
          {PLAYER_META_ICON_NAMES.map((name) => (
            <li key={name} style={CELL_STYLE}>
              <PlayerMetaIcon name={name} size={24} />
              <span style={LABEL_STYLE}>{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={SECTION_STYLE}>
        <div style={HEADER_ROW_STYLE}>
          <h2 className="m-0 text-sm font-bold">
            Contexto ({MATCH_CONTEXT_ICON_NAMES.length})
          </h2>
          <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
            contexto/*.webp
          </span>
        </div>
        <ul role="list" style={GRID_STYLE}>
          {MATCH_CONTEXT_ICON_NAMES.map((name) => (
            <li key={name} style={CELL_STYLE}>
              <MatchContextIcon name={name} size={24} />
              <span style={LABEL_STYLE}>{name}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const SAMPLE_FAMILIES: readonly string[] = [
  "1x2",
  "double_chance",
  "dnb",
  "btts",
  "totals",
  "team_totals",
  "half_time_result",
  "second_half_result",
  "combo_1x2_over",
  "asian_handicap",
  "win_to_nil",
  "corners_total",
  "shots_total",
  "shots_on_target",
  "fouls_total",
  "cards_total",
  "nba_totals",
  "nba_player_props",
  "mlb_f5",
  "mlb_run_line",
  "mlb_totals",
  "nhl_puck_line",
  "nfl_totals",
  "EV+",
  "CLV",
  "Steam",
  "ROI",
  "Yield",
];

function MarketResolutionGallery(): React.JSX.Element {
  return (
    <section style={SECTION_STYLE}>
      <h2 className="m-0 text-sm font-bold">Resolución automática de familias y métricas</h2>
      <ul role="list" style={GRID_STYLE}>
        {SAMPLE_FAMILIES.map((family) => {
          const resolved = resolveMarketCategoryIconKey(family);
          return (
            <li key={family} style={CELL_STYLE}>
              <MarketCategoryIcon family={family} size={24} />
              <span style={{ ...LABEL_STYLE, color: "var(--pl-text)", fontWeight: 700 }}>
                {family}
              </span>
              <span style={LABEL_STYLE}>{resolved}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const CatalogoCompletoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <FullPackGallery />,
};

export const CatalogoCompletoClaro: Story = {
  globals: { theme: "light" },
  render: () => <FullPackGallery />,
};

export const ResolucionFamiliasOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <MarketResolutionGallery />,
};

export const ResolucionFamiliasClaro: Story = {
  globals: { theme: "light" },
  render: () => <MarketResolutionGallery />,
};
