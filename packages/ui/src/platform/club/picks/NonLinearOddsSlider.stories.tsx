import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SofascoreCard } from "../../../components/ui/primitives";
import { oddsToSliderStep } from "../../screener-views";
import type { OddsFormat } from "../../types";
import { NonLinearOddsSlider } from "./NonLinearOddsSlider";

const meta = {
  title: "Platform v4 / Picks / NonLinearOddsSlider",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function InteractiveOddsSlider({
  initialMinStep,
  initialMaxStep,
  oddsFormat,
  compact = false,
  caption,
}: {
  readonly initialMinStep: number;
  readonly initialMaxStep: number;
  readonly oddsFormat: OddsFormat;
  readonly compact?: boolean;
  readonly caption?: string;
}): React.JSX.Element {
  const [range, setRange] = useState<[number, number]>([initialMinStep, initialMaxStep]);

  return (
    <div style={{ maxWidth: compact ? 360 : 560 }}>
      <SofascoreCard title={caption} density="compact">
        <NonLinearOddsSlider
          minStep={range[0]}
          maxStep={range[1]}
          oddsFormat={oddsFormat}
          compact={compact}
          onChange={(nextMin, nextMax) => setRange([nextMin, nextMax])}
        />
      </SofascoreCard>
    </div>
  );
}

export const DecimalPorDefectoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <InteractiveOddsSlider
      initialMinStep={0}
      initialMaxStep={100}
      oddsFormat="decimal"
      caption="Estado inicial sin límite (escala completa 1.10 a 10.00+)"
    />
  ),
};

export const DecimalPorDefectoClaro: Story = {
  globals: { theme: "light" },
  render: DecimalPorDefectoOscuro.render,
};

export const DecimalRangoValorOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 18 }}>
      <InteractiveOddsSlider
        initialMinStep={oddsToSliderStep(1.45)}
        initialMaxStep={oddsToSliderStep(2.5)}
        oddsFormat="decimal"
        caption="Zona dulce en decimal (1.45–2.50 · resolución fina)"
      />
      <InteractiveOddsSlider
        initialMinStep={oddsToSliderStep(2.0)}
        initialMaxStep={oddsToSliderStep(5.0)}
        oddsFormat="decimal"
        caption="Rango de valor medio-alto (2.00–5.00)"
      />
    </div>
  ),
};

export const DecimalRangoValorClaro: Story = {
  globals: { theme: "light" },
  render: DecimalRangoValorOscuro.render,
};

export const AmericanoRangosOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 18 }}>
      <InteractiveOddsSlider
        initialMinStep={0}
        initialMaxStep={100}
        oddsFormat="american"
        caption="Formato americano por defecto (sin límite hasta +900+)"
      />
      <InteractiveOddsSlider
        initialMinStep={oddsToSliderStep(1.45)}
        initialMaxStep={oddsToSliderStep(2.5)}
        oddsFormat="american"
        caption="Zona dulce en formato americano (-222 a +150)"
      />
    </div>
  ),
};

export const AmericanoRangosClaro: Story = {
  globals: { theme: "light" },
  render: AmericanoRangosOscuro.render,
};

export const ExtremosYCompactoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 18 }}>
      <InteractiveOddsSlider
        initialMinStep={oddsToSliderStep(1.1)}
        initialMaxStep={oddsToSliderStep(1.35)}
        oddsFormat="decimal"
        caption="Extremo inferior · Favoritos cortos (1.10–1.35)"
      />
      <InteractiveOddsSlider
        initialMinStep={oddsToSliderStep(3.0)}
        initialMaxStep={100}
        oddsFormat="american"
        caption="Extremo superior sin tope · Momios largos (+200 a +900+)"
      />
      <InteractiveOddsSlider
        initialMinStep={oddsToSliderStep(1.65)}
        initialMaxStep={oddsToSliderStep(2.8)}
        oddsFormat="decimal"
        compact
        caption="Densidad compacta para hoja inferior móvil (360 px)"
      />
    </div>
  ),
};

export const ExtremosYCompactoClaro: Story = {
  globals: { theme: "light" },
  render: ExtremosYCompactoOscuro.render,
};
