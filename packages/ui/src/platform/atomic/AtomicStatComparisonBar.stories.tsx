import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AtomicStatComparisonBar,
  type AtomicStatComparisonBarProps,
} from "./AtomicStatComparisonBar";

const meta = {
  title: "Platform v4 / Atomic Kit / AtomicStatComparisonBar",
  component: AtomicStatComparisonBar,
  parameters: { layout: "padded" },
  args: {
    label: "Goles evitados",
    homeValue: -0.54,
    awayValue: -0.44,
    homeLabel: "América",
    awayLabel: "Cruz Azul",
    signed: true,
    digits: 2,
    variant: "default",
    showTeamLabels: true,
    lowerIsBetter: false,
    rankA: null,
    rankB: null,
  },
  render: (args: AtomicStatComparisonBarProps) => (
    <div className="pl-atom-card" style={{ maxWidth: 560 }}>
      <AtomicStatComparisonBar {...args} />
    </div>
  ),
} satisfies Meta<typeof AtomicStatComparisonBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PanelEstadisticasOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <section className="pl-atom-card" style={{ maxWidth: 620 }} aria-label="Estadísticas comparadas">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <strong className="pl-atom-title">América</strong>
        <span className="pl-atom-sub">Estadísticas del partido</span>
        <strong className="pl-atom-title">Cruz Azul</strong>
      </div>

      <dl style={{ display: "grid", gap: 12, margin: 0 }}>
        <AtomicStatComparisonBar
          label="Posesión"
          homeValue={58}
          awayValue={42}
          homeLabel="América"
          awayLabel="Cruz Azul"
          pct
          rankA={2}
          rankB={6}
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Goles esperados (xG)"
          homeValue={1.84}
          awayValue={0.92}
          homeLabel="América"
          awayLabel="Cruz Azul"
          digits={2}
          rankA={1}
          rankB={5}
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Tiros a puerta"
          homeValue={7}
          awayValue={4}
          homeLabel="América"
          awayLabel="Cruz Azul"
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Tiros de esquina"
          homeValue={5}
          awayValue={5}
          homeLabel="América"
          awayLabel="Cruz Azul"
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Goles recibidos / partido"
          homeValue={0.85}
          awayValue={1.24}
          homeLabel="América"
          awayLabel="Cruz Azul"
          digits={2}
          lowerIsBetter
          rankA={1}
          rankB={8}
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Goles evitados"
          homeValue={-0.54}
          awayValue={-0.44}
          homeLabel="América"
          awayLabel="Cruz Azul"
          signed
          digits={2}
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Impacto neto en área"
          homeValue={0.38}
          awayValue={-0.27}
          homeLabel="América"
          awayLabel="Cruz Azul"
          signed
          digits={2}
          asDefinitionItem
        />
      </dl>
    </section>
  ),
};

export const PanelEstadisticasClaro: Story = {
  globals: { theme: "light" },
  render: PanelEstadisticasOscuro.render,
};

export const MenorEsMejorYRangosOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <section
      className="pl-atom-card"
      style={{ maxWidth: 620 }}
      aria-label="Comparativa defensiva con rangos ordinales en liga"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <strong className="pl-atom-title">América</strong>
        <span className="pl-atom-sub">Ataque vs Defensa · Ranking de liga</span>
        <strong className="pl-atom-title">Cruz Azul</strong>
      </div>

      <dl style={{ display: "grid", gap: 12, margin: 0 }}>
        <AtomicStatComparisonBar
          label="Goles a favor / 90'"
          homeValue={2.12}
          awayValue={1.74}
          homeLabel="América"
          awayLabel="Cruz Azul"
          digits={2}
          rankA={1}
          rankB={4}
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Goles concedidos / 90'"
          homeValue={0.82}
          awayValue={1.18}
          homeLabel="América"
          awayLabel="Cruz Azul"
          digits={2}
          lowerIsBetter
          rankA={2}
          rankB={9}
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Remates recibidos / 90'"
          homeValue={9.4}
          awayValue={12.8}
          homeLabel="América"
          awayLabel="Cruz Azul"
          digits={1}
          lowerIsBetter
          rankA={3}
          rankB={12}
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Faltas cometidas / 90'"
          homeValue={10.2}
          awayValue={13.5}
          homeLabel="América"
          awayLabel="Cruz Azul"
          digits={1}
          lowerIsBetter
          rankA={4}
          rankB={15}
          asDefinitionItem
        />
      </dl>
    </section>
  ),
};

export const MenorEsMejorYRangosClaro: Story = {
  globals: { theme: "light" },
  render: MenorEsMejorYRangosOscuro.render,
};

export const GolesEvitadosNegativosOscuro: Story = {
  globals: { theme: "dark" },
};

export const GolesEvitadosNegativosClaro: Story = {
  globals: { theme: "light" },
};

export const VarianteCompactaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div className="pl-atom-card" style={{ maxWidth: 360 }}>
      <AtomicStatComparisonBar
        label="Posesión"
        homeValue={61}
        awayValue={39}
        homeLabel="América"
        awayLabel="Cruz Azul"
        pct
        rankA={2}
        rankB={7}
        variant="compact"
        showTeamLabels
      />
      <AtomicStatComparisonBar
        label="Goles concedidos"
        homeValue={0.82}
        awayValue={1.18}
        homeLabel="América"
        awayLabel="Cruz Azul"
        digits={2}
        lowerIsBetter
        rankA={1}
        rankB={8}
        variant="compact"
      />
      <AtomicStatComparisonBar
        label="Goles evitados"
        homeValue={-0.54}
        awayValue={-0.44}
        homeLabel="América"
        awayLabel="Cruz Azul"
        signed
        digits={2}
        variant="compact"
      />
    </div>
  ),
};

export const VarianteCompactaClaro: Story = {
  globals: { theme: "light" },
  render: VarianteCompactaOscuro.render,
};
