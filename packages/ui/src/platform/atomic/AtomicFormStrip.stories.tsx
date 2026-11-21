import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AtomicFormStrip, type AtomicFormStripProps } from "./AtomicFormStrip";

const AMERICA_TOOLTIPS: readonly string[] = [
  "J11 · América 2-0 Toluca",
  "J12 · América 3-1 Pachuca",
  "J13 · Tigres 1-1 América",
  "J14 · América 2-1 Monterrey",
  "J15 · Cruz Azul 2-1 América",
];

const CELTICS_TOOLTIPS: readonly string[] = [
  "Celtics 118-104 Knicks",
  "Celtics 112-109 Heat",
  "Bucks 115-108 Celtics",
  "Celtics 121-106 76ers",
  "Celtics 114-101 Cavaliers",
];

const meta = {
  title: "Platform v4 / Atomic Kit / AtomicFormStrip",
  component: AtomicFormStrip,
  parameters: { layout: "padded" },
  args: {
    form: ["G", "G", "E", "G", "P"],
    sport: "football",
    notation: "es",
    max: 5,
    size: "sm",
    teamName: "América",
    tooltips: AMERICA_TOOLTIPS,
  },
  render: (args: AtomicFormStripProps) => (
    <div className="pl-atom-card" style={{ maxWidth: 420 }}>
      <AtomicFormStrip {...args} />
    </div>
  ),
} satisfies Meta<typeof AtomicFormStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

export const RachasYTamanosOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <section className="pl-atom-card" style={{ maxWidth: 480 }} aria-label="Ejemplos de racha reciente">
      <div style={ROW_STYLE}>
        <span className="pl-atom-title">América · Mediano (md)</span>
        <AtomicFormStrip
          form={["G", "G", "E", "G", "P"]}
          size="md"
          teamName="América"
          tooltips={AMERICA_TOOLTIPS}
        />
      </div>
      <div style={ROW_STYLE}>
        <span className="pl-atom-sub">Cruz Azul · Estándar (sm) desde cadena</span>
        <AtomicFormStrip form="G-E-P-G-G" size="sm" teamName="Cruz Azul" />
      </div>
      <div style={ROW_STYLE}>
        <span className="pl-atom-sub">Monterrey · Compacto (xs)</span>
        <AtomicFormStrip form={["P", "E", "G", "E", "G"]} size="xs" teamName="Monterrey" />
      </div>
      <div style={ROW_STYLE}>
        <span className="pl-atom-sub">Tigres · Racha perfecta</span>
        <AtomicFormStrip form={["G", "G", "G", "G", "G"]} size="sm" teamName="Tigres" />
      </div>
      <div style={ROW_STYLE}>
        <span className="pl-atom-sub">Puebla · Racha adversa</span>
        <AtomicFormStrip form={["P", "P", "E", "P", "P"]} size="sm" teamName="Puebla" />
      </div>
      <div style={ROW_STYLE}>
        <span className="pl-atom-sub">Boston Celtics · Notación automática EE. UU.</span>
        <AtomicFormStrip
          form="WWLWW"
          sport="basketball"
          size="sm"
          teamName="Boston Celtics"
          tooltips={CELTICS_TOOLTIPS}
        />
      </div>
      <div style={ROW_STYLE}>
        <span className="pl-atom-sub">Recién ascendido · Sin racha</span>
        <AtomicFormStrip form={null} emptyFallback="Sin racha" size="sm" />
      </div>
    </section>
  ),
};

export const RachasYTamanosClaro: Story = {
  globals: { theme: "light" },
  render: RachasYTamanosOscuro.render,
};

export const ConTooltipsPorPartidoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <section
      className="pl-atom-card"
      style={{ maxWidth: 480, display: "grid", gap: 12 }}
      aria-label="Rachas recientes con contexto por partido"
    >
      <div style={ROW_STYLE}>
        <span className="pl-atom-title">América · Fútbol (G/E/P)</span>
        <AtomicFormStrip
          form={["G", "G", "E", "G", "P"]}
          sport="football"
          size="md"
          teamName="América"
          tooltips={AMERICA_TOOLTIPS}
        />
      </div>
      <div style={ROW_STYLE}>
        <span className="pl-atom-title">Boston Celtics · NBA (W/L)</span>
        <AtomicFormStrip
          form={["W", "W", "L", "W", "W"]}
          sport="basketball"
          size="md"
          teamName="Boston Celtics"
          tooltips={CELTICS_TOOLTIPS}
        />
      </div>
    </section>
  ),
};

export const ConTooltipsPorPartidoClaro: Story = {
  globals: { theme: "light" },
  render: ConTooltipsPorPartidoOscuro.render,
};

export const CompactoOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    form: ["G", "E", "P", "G", "G"],
    size: "xs",
    teamName: "América",
    tooltips: AMERICA_TOOLTIPS,
  },
};

export const CompactoClaro: Story = {
  globals: { theme: "light" },
  args: {
    form: ["G", "E", "P", "G", "G"],
    size: "xs",
    teamName: "América",
    tooltips: AMERICA_TOOLTIPS,
  },
};
