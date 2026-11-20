import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EarlyPayoutStrip,
  EpistemicBandStrip,
  LiveWinProbBar,
  SgpCopulaAuditCard,
} from "../src/platform";

describe("Componentes atómicos Spacetime v5.1 → UI", () => {
  it("renderiza EpistemicBandStrip con rango 90 %, piso justo y disclosure accesible", () => {
    const html = renderToStaticMarkup(
      <EpistemicBandStrip
        homeLabel="América"
        awayLabel="Cruz Azul"
        homeBand={{
          pPoint: 0.54,
          pLower90: 0.48,
          pUpper90: 0.6,
          halfWidth90: 0.06,
          conservativeFairDecimal: 2.08,
          grade: "moderate",
        }}
        drawBand={{
          pPoint: 0.26,
          pLower90: 0.21,
          pUpper90: 0.31,
          halfWidth90: 0.05,
          conservativeFairDecimal: 4.76,
          grade: "high",
        }}
        awayBand={{
          pPoint: 0.2,
          pLower90: 0.15,
          pUpper90: 0.25,
          halfWidth90: 0.05,
          conservativeFairDecimal: 6.67,
          grade: "high",
        }}
        oddsFormat="decimal"
      />,
    );
    expect(html).toContain("Rango de confianza (90 %)");
    expect(html).toContain("Varianza moderada");
    expect(html).toContain("Rango 48 %–60 %");
    expect(html).toContain("<details");
  });

  it("renderiza EarlyPayoutStrip con lift en pp y momio justo", () => {
    const html = renderToStaticMarkup(
      <EarlyPayoutStrip
        homeLabel="Liverpool"
        awayLabel="Arsenal"
        earlyPayout={{
          triggerLabel: "Ventaja de +2 goles",
          homeWinProb: 0.52,
          awayWinProb: 0.29,
          homeLiftPts: 2.6,
          awayLiftPts: 1.9,
          fairHomeDecimal: 1.92,
          fairAwayDecimal: 3.45,
          bothTriggerProb: 0.003,
          validatedOos: true,
        }}
        oddsFormat="decimal"
      />,
    );
    expect(html).toContain("Pago anticipado");
    expect(html).toContain("Ventaja de +2 goles");
    expect(html).toContain("+2.6 pp");
    expect(html).toContain("doble cobro");
  });

  it("renderiza SgpCopulaAuditCard con correlación positiva y alerta de sobrecargo", () => {
    const html = renderToStaticMarkup(
      <SgpCopulaAuditCard
        legs={[]}
        oddsFormat="decimal"
        precomputedAudit={{
          sport: "soccer",
          nLegs: 2,
          independentProbability: 0.3,
          jointProbability: 0.35,
          correlationMultiplier: 1.17,
          correlationDirection: "positively_correlated",
          fairCombinedDecimal: 2.86,
          fairCombinedAmerican: 186,
          bookQuoteAudit: {
            offeredDecimal: 2.0,
            impliedBookProbability: 0.5,
            fairCombinedDecimal: 2.86,
            effectiveHoldPct: 30.0,
            taxFlag: "severe_sgp_tax",
          },
        }}
      />,
    );
    expect(html).toContain("Correlación a favor");
    expect(html).toContain("×1.17");
    expect(html).toContain("Sobrecargo alto SGP");
    expect(html).toContain("30.0 % margen");
  });

  it("renderiza LiveWinProbBar con 1X2 vivo y Siguiente gol", () => {
    const html = renderToStaticMarkup(
      <LiveWinProbBar
        homeLabel="América"
        awayLabel="Toluca"
        inPlay={{
          minute: 72,
          pHome: 0.78,
          pDraw: 0.16,
          pAway: 0.06,
          fairHomeDecimal: 1.28,
          fairDrawDecimal: 6.25,
          fairAwayDecimal: 16.67,
          pNextGoalHome: 0.29,
          pNextGoalAway: 0.21,
          pNoMoreGoals: 0.5,
          expectedFinalTotal: 2.65,
          redCardsHome: 0,
          redCardsAway: 1,
        }}
        oddsFormat="decimal"
      />,
    );
    expect(html).toContain("Probabilidad en vivo · 72");
    expect(html).toContain("Siguiente gol:");
    expect(html).toContain("ajuste por roja");
    expect(html).toContain("Sin más goles");
  });
});
