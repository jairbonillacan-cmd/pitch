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
  },
  render: (args: AtomicStatComparisonBarProps) => (
    <div className="pl-atom-card" style={{ maxWidth: 560 }}>
      <AtomicStatComparisonBar {...args} />
    </div>
  ),
} satisfies Meta<typeof AtomicStatComparisonBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Panel completo con porcentajes, positivos, empate y valores negativos (tema oscuro). */
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
          asDefinitionItem
        />
        <AtomicStatComparisonBar
          label="Goles esperados (xG)"
          homeValue={1.84}
          awayValue={0.92}
          homeLabel="América"
          awayLabel="Cruz Azul"
          digits={2}
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
          label="Grandes ocasiones"
          homeValue={2}
          awayValue={3}
          homeLabel="América"
          awayLabel="Cruz Azul"
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

/** Panel completo de estadísticas en tema claro. */
export const PanelEstadisticasClaro: Story = {
  globals: { theme: "light" },
  render: PanelEstadisticasOscuro.render,
};

/** Métrica con ambos valores negativos («Goles evitados -0.54 vs -0.44») en tema oscuro. */
export const GolesEvitadosNegativosOscuro: Story = {
  globals: { theme: "dark" },
};

/** Métrica con ambos valores negativos en tema claro. */
export const GolesEvitadosNegativosClaro: Story = {
  globals: { theme: "light" },
};

/** Variante compacta con positivos, empate y valores negativos para tarjetas densas (tema oscuro). */
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
        variant="compact"
        showTeamLabels
      />
      <AtomicStatComparisonBar
        label="Tiros de esquina"
        homeValue={4}
        awayValue={4}
        homeLabel="América"
        awayLabel="Cruz Azul"
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

/** Variante compacta en tema claro. */
export const VarianteCompactaClaro: Story = {
  globals: { theme: "light" },
  render: VarianteCompactaOscuro.render,
};
