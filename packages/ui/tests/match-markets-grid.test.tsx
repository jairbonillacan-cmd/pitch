import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchMarketsGrid, type PlatformMarketRow } from "../src/index";

const FOOTBALL_MARKETS: readonly PlatformMarketRow[] = [
  {
    group: "Resultado 1X2",
    market: "1x2",
    selection: "home",
    label: "Gana América",
    p: 0.52,
    fairDecimal: 1.92,
    fairAmerican: -109,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: false,
    cardCategory: "resultado",
    cardTitle: "Resultado 1X2",
    isMostLikely: true,
  },
  {
    group: "Resultado 1X2",
    market: "1x2",
    selection: "draw",
    label: "Empate",
    p: 0.26,
    fairDecimal: 3.85,
    fairAmerican: 285,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: false,
    cardCategory: "resultado",
    cardTitle: "Resultado 1X2",
    isMostLikely: false,
  },
  {
    group: "Goles · América",
    market: "team_goals_home",
    selection: "home_over_0.5",
    label: "América · Más de 0.5 goles",
    p: 0.81,
    fairDecimal: 1.23,
    fairAmerican: -435,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "goles",
    cardTitle: "Goles América (0.5)",
    isMostLikely: true,
  },
  {
    group: "Goles · América",
    market: "team_goals_home",
    selection: "home_under_0.5",
    label: "América · Menos de 0.5 goles",
    p: 0.19,
    fairDecimal: 5.26,
    fairAmerican: 426,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "goles",
    cardTitle: "Goles América (0.5)",
    isMostLikely: false,
  },
  {
    group: "Hándicap asiático",
    market: "ah_-0_5",
    selection: "home",
    label: "América (-0.5)",
    p: 0.52,
    fairDecimal: 1.92,
    fairAmerican: -109,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: false,
    cardCategory: "handicap",
    cardTitle: "Hándicap asiático (-0.5)",
    isMostLikely: true,
  },
  {
    group: "Marcador exacto",
    market: "correct_score",
    selection: "1-0",
    label: "Marcador 1-0",
    p: 0.125,
    fairDecimal: 8.0,
    fairAmerican: 700,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "marcador",
    cardTitle: "Marcador exacto · Top 6",
    isMostLikely: true,
  },
  {
    group: "1er tiempo · Resultado",
    market: "ht_1x2",
    selection: "ht_draw",
    label: "1T · Empate",
    p: 0.43,
    fairDecimal: 2.33,
    fairAmerican: 133,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "primer_tiempo",
    cardTitle: "1er tiempo · Resultado 1X2",
    isMostLikely: true,
  },
];

describe("MatchMarketsGrid (Punto 5)", () => {
  it("agrupa en Resultado · Goles · Hándicap · Marcador · 1er tiempo, marca derivados y respeta formato de momio", () => {
    const americanHtml = renderToStaticMarkup(
      <MatchMarketsGrid
        sport="football"
        markets={FOOTBALL_MARKETS}
        oddsFormat="american"
        watermark="@lupita_mx · LUPI-2611"
        onHouseOddChange={() => undefined}
        onSealRow={() => undefined}
      />,
    );

    expect(americanHtml).toContain("Resultado");
    expect(americanHtml).toContain("Goles");
    expect(americanHtml).toContain("Hándicap");
    expect(americanHtml).toContain("Marcador");
    expect(americanHtml).toContain("1er tiempo");
    expect(americanHtml).toContain("Derivado del motor");
    expect(americanHtml).toContain("Más probable");
    expect(americanHtml).toContain("@lupita_mx · LUPI-2611");
    expect(americanHtml).toContain("Justo -109");
    expect(americanHtml).not.toMatch(/Poisson|Dixon-Coles|sigma|matriz/i);

    const decimalHtml = renderToStaticMarkup(
      <MatchMarketsGrid
        sport="football"
        markets={FOOTBALL_MARKETS}
        oddsFormat="decimal"
        watermark="@lupita_mx"
      />,
    );
    expect(decimalHtml).toContain("Justo 1.92");
    expect(decimalHtml).toContain("Justo 1.23");
  });

  it("agrupa corners_total, fouls_total y yellow_total en «Córners y conteos»", () => {
    const withCounts: readonly PlatformMarketRow[] = [
      ...FOOTBALL_MARKETS,
      {
        group: "Tiros de esquina 9.5",
        market: "corners_total",
        selection: "over",
        label: "Más de 9.5",
        p: 0.53,
        fairDecimal: 1.89,
        fairAmerican: -112,
        openDecimal: null,
        currentDecimal: null,
        edgePts: null,
      },
      {
        group: "Faltas 22.5",
        market: "fouls_total",
        selection: "over",
        label: "Más de 22.5",
        p: 0.56,
        fairDecimal: 1.79,
        fairAmerican: -127,
        openDecimal: null,
        currentDecimal: null,
        edgePts: null,
      },
      {
        group: "Tarjetas amarillas 4.5",
        market: "yellow_total",
        selection: "under",
        label: "Menos de 4.5",
        p: 0.58,
        fairDecimal: 1.72,
        fairAmerican: -139,
        openDecimal: null,
        currentDecimal: null,
        edgePts: null,
      },
    ];
    const html = renderToStaticMarkup(
      <MatchMarketsGrid
        sport="football"
        markets={withCounts}
        oddsFormat="decimal"
        watermark="@socio"
      />,
    );
    expect(html).toContain("Córners y conteos");
    expect(html).toContain("Tiros de esquina 9.5");
    expect(html).toContain("Faltas 22.5");
    expect(html).toContain("Tarjetas amarillas 4.5");
  });

  it("cuando está bloqueado oculta las filas y conserva la marca de agua", () => {
    const lockedHtml = renderToStaticMarkup(
      <MatchMarketsGrid
        sport="football"
        markets={FOOTBALL_MARKETS}
        oddsFormat="american"
        watermark="@visitante"
        locked
      />,
    );
    expect(lockedHtml).toContain("Pase PitchLab Ultra");
    expect(lockedHtml).toContain('data-watermark="@visitante"');
    expect(lockedHtml).not.toContain("América · Más de 0.5 goles");
    expect(lockedHtml).not.toContain("Justo");

    const emptyUnlockedHtml = renderToStaticMarkup(
      <MatchMarketsGrid
        sport="football"
        markets={[]}
        oddsFormat="american"
        watermark="@socio"
        locked={false}
      />,
    );
    expect(emptyUnlockedHtml).toContain("data-empty-markets");
    expect(emptyUnlockedHtml).not.toContain("Pase PitchLab Ultra");
  });
});
