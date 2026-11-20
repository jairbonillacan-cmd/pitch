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

/** Matriz completa: Momio justo + Casa, EV positivo y negativo, y flechas Steam / Shortening / Drifting (tema oscuro). */
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

/** Matriz completa de momios y movimientos en tema claro. */
export const MatrizMovimientosYValorClaro: Story = {
  globals: { theme: "light" },
  render: MatrizMovimientosYValorOscuro.render,
};

/** Chip individual destacado con valor positivo y señal Steam (tema oscuro). */
export const SteamConValorPositivoOscuro: Story = {
  globals: { theme: "dark" },
};

/** Chip individual destacado con valor positivo y señal Steam en tema claro. */
export const SteamConValorPositivoClaro: Story = {
  globals: { theme: "light" },
};

/** Chip con cuota subiendo (`drifting`) y EV negativo, sin mostrar falso valor positivo (tema oscuro). */
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

/** Chip con cuota subiendo (`drifting`) y EV negativo en tema claro. */
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
