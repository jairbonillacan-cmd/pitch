import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AtomicFormStrip, type AtomicFormStripProps } from "./AtomicFormStrip";

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

/** Rachas `G`/`E`/`P` en tamaños `md`, `sm` y compacto `xs`, más ligas EE. UU. y estado vacío (tema oscuro). */
export const RachasYTamanosOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <section className="pl-atom-card" style={{ maxWidth: 480 }} aria-label="Ejemplos de racha reciente">
      <div style={ROW_STYLE}>
        <span className="pl-atom-title">América · Mediano (md)</span>
        <AtomicFormStrip form={["G", "G", "E", "G", "P"]} size="md" teamName="América" />
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
        <AtomicFormStrip form="WWLWW" sport="basketball" size="sm" teamName="Boston Celtics" />
      </div>
      <div style={ROW_STYLE}>
        <span className="pl-atom-sub">Recién ascendido · Sin racha</span>
        <AtomicFormStrip form={null} emptyFallback="Sin racha" size="sm" />
      </div>
    </section>
  ),
};

/** Rachas `G`/`E`/`P` y tamaños en tema claro. */
export const RachasYTamanosClaro: Story = {
  globals: { theme: "light" },
  render: RachasYTamanosOscuro.render,
};

/** Tamaño compacto `xs` para tablas de posiciones y tarjetas móviles (tema oscuro). */
export const CompactoOscuro: Story = {
  globals: { theme: "dark" },
  args: {
    form: ["G", "E", "P", "G", "G"],
    size: "xs",
    teamName: "América",
  },
};

/** Tamaño compacto `xs` en tema claro. */
export const CompactoClaro: Story = {
  globals: { theme: "light" },
  args: {
    form: ["G", "E", "P", "G", "G"],
    size: "xs",
    teamName: "América",
  },
};
