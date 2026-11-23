import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SofascoreCard } from "../../../components/ui/primitives";
import type { BookQuoteItem } from "../../types";
import { BookmakerComparePill } from "./BookmakerComparePill";

const meta = {
  title: "Platform v4 / Picks / BookmakerComparePill",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CAPTURED_UTC = "2026-11-19T18:35:00Z";

const QUOTES_STEAM_MX: readonly BookQuoteItem[] = [
  {
    book: "caliente_mx",
    bookLabel: "Caliente",
    decimal: 1.94,
    openingDecimal: 2.12,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 1.9,
    openingDecimal: 2.06,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
  {
    book: "bet365",
    bookLabel: "Bet365",
    decimal: 1.88,
    openingDecimal: 2.04,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const QUOTES_SHORTENING_MX: readonly BookQuoteItem[] = [
  {
    book: "bet365",
    bookLabel: "Bet365",
    decimal: 2.08,
    openingDecimal: 2.16,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "novibet",
    bookLabel: "Novibet",
    decimal: 2.04,
    openingDecimal: 2.12,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 2.01,
    openingDecimal: 2.1,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const QUOTES_DRIFTING_MX: readonly BookQuoteItem[] = [
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 2.25,
    openingDecimal: 2.08,
    movementDirection: "drifting",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "playdoit",
    bookLabel: "Playdoit",
    decimal: 2.2,
    openingDecimal: 2.05,
    movementDirection: "drifting",
    capturedAtUtc: CAPTURED_UTC,
  },
  {
    book: "pinnacle",
    bookLabel: "Pinnacle",
    decimal: 2.18,
    openingDecimal: 2.04,
    movementDirection: "drifting",
    capturedAtUtc: CAPTURED_UTC,
  },
];

export const MultiCasaMxEvYMovimientosOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
        gap: 14,
        maxWidth: 980,
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          STEAM + EV+ · Caliente vs justo
        </span>
        <BookmakerComparePill
          probability={0.58}
          fairDecimal={1.72}
          houseDecimal={1.94}
          houseBookLabel="Caliente"
          openingDecimal={2.12}
          movementDirection="shortening"
          movementSignal="STEAM"
          capturedAtUtc={CAPTURED_UTC}
          bookQuotes={QUOTES_STEAM_MX}
          oddsFormat="decimal"
          variant="box"
          showMultiBookQuotes
          showCaptureStamp
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          SHORTENING + EV+ · Bet365
        </span>
        <BookmakerComparePill
          probability={0.52}
          fairDecimal={1.92}
          houseDecimal={2.08}
          houseBookLabel="Bet365"
          openingDecimal={2.16}
          movementDirection="shortening"
          movementSignal="SHORTENING"
          capturedAtUtc={CAPTURED_UTC}
          bookQuotes={QUOTES_SHORTENING_MX}
          oddsFormat="decimal"
          variant="box"
          showMultiBookQuotes
          showCaptureStamp
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          DRIFTING + EV+ · Codere
        </span>
        <BookmakerComparePill
          probability={0.49}
          fairDecimal={2.04}
          houseDecimal={2.25}
          houseBookLabel="Codere"
          openingDecimal={2.08}
          movementDirection="drifting"
          movementSignal="DRIFTING"
          capturedAtUtc={CAPTURED_UTC}
          bookQuotes={QUOTES_DRIFTING_MX}
          oddsFormat="decimal"
          variant="box"
          showMultiBookQuotes
          showCaptureStamp
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          Sin cuota capturada (solo momio justo)
        </span>
        <BookmakerComparePill
          probability={0.54}
          fairDecimal={1.85}
          houseDecimal={null}
          oddsFormat="decimal"
          variant="box"
        />
      </div>
    </div>
  ),
};

export const MultiCasaMxEvYMovimientosClaro: Story = {
  globals: { theme: "light" },
  render: MultiCasaMxEvYMovimientosOscuro.render,
};

export const FormatoAmericanoYCompactoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14,
        maxWidth: 760,
      }}
    >
      <BookmakerComparePill
        probability={0.58}
        fairDecimal={1.72}
        houseDecimal={1.94}
        houseBookLabel="Caliente"
        openingDecimal={2.12}
        movementSignal="STEAM"
        capturedAtUtc={CAPTURED_UTC}
        bookQuotes={QUOTES_STEAM_MX}
        oddsFormat="american"
        variant="compact"
        showMultiBookQuotes
      />
      <BookmakerComparePill
        probability={0.52}
        fairDecimal={1.92}
        houseDecimal={2.08}
        houseBookLabel="Bet365"
        openingDecimal={2.16}
        movementSignal="SHORTENING"
        capturedAtUtc={CAPTURED_UTC}
        bookQuotes={QUOTES_SHORTENING_MX}
        oddsFormat="american"
        variant="compact"
        showMultiBookQuotes
      />
      <BookmakerComparePill
        probability={0.49}
        fairDecimal={2.04}
        houseDecimal={2.25}
        houseBookLabel="Codere"
        openingDecimal={2.08}
        movementSignal="DRIFTING"
        capturedAtUtc={CAPTURED_UTC}
        bookQuotes={QUOTES_DRIFTING_MX}
        oddsFormat="american"
        variant="compact"
        showMultiBookQuotes
      />
    </div>
  ),
};

export const FormatoAmericanoYCompactoClaro: Story = {
  globals: { theme: "light" },
  render: FormatoAmericanoYCompactoOscuro.render,
};

export const VarianteInlineMercadosOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ maxWidth: 820 }}>
      <SofascoreCard title="Mercados en línea" meta="Comparativa MX">
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong className="text-sm">América gana (1X2)</strong>
            <BookmakerComparePill
              probability={0.58}
              fairDecimal={1.72}
              houseDecimal={1.94}
              houseBookLabel="Caliente"
              openingDecimal={2.12}
              movementSignal="STEAM"
              capturedAtUtc={CAPTURED_UTC}
              bookQuotes={QUOTES_STEAM_MX}
              oddsFormat="decimal"
              variant="inline"
              showMultiBookQuotes
              showCaptureStamp
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong className="text-sm">Más de 2.5 goles</strong>
            <BookmakerComparePill
              probability={0.52}
              fairDecimal={1.92}
              houseDecimal={2.08}
              houseBookLabel="Bet365"
              openingDecimal={2.16}
              movementSignal="SHORTENING"
              capturedAtUtc={CAPTURED_UTC}
              bookQuotes={QUOTES_SHORTENING_MX}
              oddsFormat="decimal"
              variant="inline"
              showCasaPrefix
              showMultiBookQuotes
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong className="text-sm">Ambos anotan: Sí</strong>
            <BookmakerComparePill
              probability={0.49}
              fairDecimal={2.04}
              houseDecimal={2.25}
              houseBookLabel="Codere"
              openingDecimal={2.08}
              movementSignal="DRIFTING"
              capturedAtUtc={CAPTURED_UTC}
              bookQuotes={QUOTES_DRIFTING_MX}
              oddsFormat="american"
              variant="inline"
              showMultiBookQuotes
            />
          </div>
        </div>
      </SofascoreCard>
    </div>
  ),
};

export const VarianteInlineMercadosClaro: Story = {
  globals: { theme: "light" },
  render: VarianteInlineMercadosOscuro.render,
};
