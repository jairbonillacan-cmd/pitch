import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AtomicOddsChip, type AtomicOddsChipProps } from "./AtomicOddsChip";

const meta = {
  title: "Platform v4 / Atomic Kit / AtomicOddsChip",
  component: AtomicOddsChip,
  parameters: { layout: "padded" },
  args: {
    label: "América gana",
    fairDecimal: 1.82,
    marketDecimal: 1.94,
    openingDecimal: 2.18,
    movement: "steam",
    oddsFormat: "decimal",
    valuePct: 6.6,
    highlight: true,
    compact: false,
    variant: "chip",
  },
  render: (args: AtomicOddsChipProps) => (
    <div style={{ maxWidth: 420 }}>
      <AtomicOddsChip {...args} />
    </div>
  ),
} satisfies Meta<typeof AtomicOddsChip>;

export default meta;
type Story = StoryObj<typeof meta>;

const ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 6,
};

export const MatrizMovimientosYValorOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <section
      className="pl-atom-card"
      style={{ maxWidth: 680 }}
      aria-label="Variantes de chip de momios y movimiento de mercado"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        <div style={ITEM_STYLE}>
          <span className="pl-atom-sub">EV+ positivo · Steam (caída fuerte)</span>
          <AtomicOddsChip
            label="América gana"
            fairDecimal={1.82}
            marketDecimal={1.94}
            openingDecimal={2.18}
            movement="steam"
            valuePct={6.6}
            highlight
          />
        </div>

        <div style={ITEM_STYLE}>
          <span className="pl-atom-sub">EV+ positivo · Shortening (bajando)</span>
          <AtomicOddsChip
            label="Más de 2.5 goles"
            fairDecimal={1.76}
            marketDecimal={1.85}
            openingDecimal={1.92}
            movement="shortening"
            valuePct={5.1}
          />
        </div>

        <div style={ITEM_STYLE}>
          <span className="pl-atom-sub">EV negativo (sin insignia) · Drifting (subiendo)</span>
          <AtomicOddsChip
            label="Empate"
            fairDecimal={3.55}
            marketDecimal={3.35}
            openingDecimal={3.2}
            movement="drifting"
            valuePct={-5.6}
          />
        </div>

        <div style={ITEM_STYLE}>
          <span className="pl-atom-sub">EV negativo · Movimiento estable</span>
          <AtomicOddsChip
            label="Ambos anotan · Sí"
            fairDecimal={1.9}
            marketDecimal={1.86}
            openingDecimal={1.86}
            movement="stable"
            valuePct={-2.1}
          />
        </div>

        <div style={ITEM_STYLE}>
          <span className="pl-atom-sub">Solo momio justo (sin cuota de casa)</span>
          <AtomicOddsChip label="Cruz Azul o empate" fairDecimal={2.15} />
        </div>

        <div style={ITEM_STYLE}>
          <span className="pl-atom-sub">Formato americano compacto · Steam + EV+</span>
          <AtomicOddsChip
            label="América −0.5"
            fairDecimal={1.85}
            marketDecimal={1.96}
            openingDecimal={2.16}
            movement="steam"
            oddsFormat="american"
            valuePct={5.9}
            compact
          />
        </div>
      </div>
    </section>
  ),
};

export const MatrizMovimientosYValorClaro: Story = {
  globals: { theme: "light" },
  render: MatrizMovimientosYValorOscuro.render,
};

export const VarianteCeldaTabularOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <section
      className="pl-atom-card"
      style={{ maxWidth: 680 }}
      aria-label="Variante tabular compacta de momios para matrices de mercado"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        <AtomicOddsChip
          variant="cell"
          label="Local · 1"
          fairDecimal={1.74}
          marketDecimal={1.92}
          openingDecimal={2.12}
          movement="steam"
          valuePct={10.3}
          highlight
        />
        <AtomicOddsChip
          variant="cell"
          label="Empate · X"
          fairDecimal={3.45}
          marketDecimal={3.3}
          openingDecimal={3.18}
          movement="drifting"
          valuePct={-4.3}
        />
        <AtomicOddsChip
          variant="cell"
          label="Visita · 2"
          fairDecimal={4.85}
          marketDecimal={5.1}
          openingDecimal={5.28}
          movement="shortening"
          valuePct={5.2}
        />
        <AtomicOddsChip
          variant="cell"
          label="Más de 2.5"
          fairDecimal={1.78}
          marketDecimal={1.86}
          openingDecimal={1.86}
          movement="stable"
          oddsFormat="american"
          valuePct={4.5}
        />
        <AtomicOddsChip
          variant="cell"
          label="Solo justo"
          fairDecimal={2.05}
        />
      </div>
    </section>
  ),
};

export const VarianteCeldaTabularClaro: Story = {
  globals: { theme: "light" },
  render: VarianteCeldaTabularOscuro.render,
};

export const SteamConValorPositivoOscuro: Story = {
  globals: { theme: "dark" },
};

export const SteamConValorPositivoClaro: Story = {
  globals: { theme: "light" },
};

export const SubiendoSinValorOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    label: "Empate",
    fairDecimal: 3.55,
    marketDecimal: 3.35,
    openingDecimal: 3.2,
    movement: "drifting",
    valuePct: -5.6,
    highlight: false,
  },
};

export const SubiendoSinValorClaro: Story = {
  globals: { theme: "light" },
  args: {
    label: "Empate",
    fairDecimal: 3.55,
    marketDecimal: 3.35,
    openingDecimal: 3.2,
    movement: "drifting",
    valuePct: -5.6,
    highlight: false,
  },
};
