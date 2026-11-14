import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SportOutlookCard } from "../src/platform/club/match/sport-outlook/SportOutlookCard";
import {
  DRIVER_COPY,
  confirmationViews,
  isValidOutlook,
  lineViews,
  marginText,
  restNotes,
  topDrivers,
  winnerSegments,
} from "../src/platform/club/match/sport-outlook/sport-outlook-logic";
import type { SportOutlookInput } from "../src/platform/club/match/sport-outlook/sport-outlook-types";

const NHL: SportOutlookInput = {
  sport: "nhl",
  homeTeam: "Edmonton",
  awayTeam: "Vancouver",
  pHome: 0.57,
  pAway: 0.43,
  pHomeReg: 0.47,
  pOtReg: 0.21,
  pAwayReg: 0.32,
  expectedHome: 3.4,
  expectedAway: 2.9,
  drivers: [
    { factor: "starting_goalie_matchup", impactLogit: -0.09, impactUnits: -0.17 },
    { factor: "even_strength_xg_possession", impactLogit: 0.21, impactUnits: 0.38 },
    { factor: "skater_injuries", impactLogit: 0.01, impactUnits: 0.02 },
    { factor: "home_ice_and_altitude", impactLogit: 0.12, impactUnits: 0.15 },
  ],
  lines: [
    { kind: "total", line: 6.5, p: 0.46 },
    { kind: "first5_total", line: 4.5, p: 0.5 },
  ],
  confirmations: [
    { kind: "goalie", team: "home", status: "confirmed", playerName: "Skinner" },
    { kind: "goalie", team: "away", status: "pending" },
  ],
  rest: { away: { backToBack: true }, home: { restDays: 1 } },
  generatedAtUtc: "2026-11-14T17:10:00Z",
};

/** Etiquetas técnicas del motor que nunca deben llegar a la UI (FD-16). */
const JARGON = /Corsi|Fenwick|Pythag|FIP|wOBA|SRS|Four Factors|Open-Meteo|Log5|xG%/;

describe("isValidOutlook", () => {
  it("acepta un panorama coherente", () => {
    expect(isValidOutlook(NHL)).toBe(true);
  });

  it("rechaza probabilidades que no suman 1 o no son números", () => {
    expect(isValidOutlook({ ...NHL, pHome: 0.8, pAway: 0.5 })).toBe(false);
    expect(isValidOutlook({ ...NHL, pHome: Number.NaN })).toBe(false);
    expect(isValidOutlook({ ...NHL, expectedHome: -1 })).toBe(false);
    expect(isValidOutlook({ ...NHL, homeTeam: "  " })).toBe(false);
  });
});

describe("winnerSegments", () => {
  it("en NHL separa tiempo regular y tiempo extra", () => {
    const segs = winnerSegments(NHL);
    expect(segs.map((s) => s.label)).toEqual([
      "Edmonton en tiempo regular",
      "Tiempo extra o penales",
      "Vancouver en tiempo regular",
    ]);
  });

  it("vuelve a dos segmentos si el reparto regular no cuadra", () => {
    expect(winnerSegments({ ...NHL, pOtReg: 0.6 })).toHaveLength(2);
    expect(winnerSegments({ ...NHL, sport: "nba" })).toHaveLength(2);
  });
});

describe("textos", () => {
  it("describe el margen en unidades del deporte", () => {
    expect(marginText(NHL)).toBe("Edmonton por 0.5 goles");
    expect(marginText({ ...NHL, expectedAway: 3.38 })).toBe("Partido parejo");
    expect(
      marginText({ ...NHL, sport: "mlb", expectedHome: 3, expectedAway: 4 }),
    ).toBe("Vancouver por 1.0 carrera");
  });

  it("ordena los factores por impacto y nunca muestra la etiqueta técnica", () => {
    const drivers = topDrivers(NHL);
    expect(drivers.map((d) => d.factor)).toEqual([
      "even_strength_xg_possession",
      "home_ice_and_altitude",
      "starting_goalie_matchup",
    ]);
    expect(drivers[0]!.text).toBe("Edmonton · +0.4 goles");
    expect(drivers[2]!.favors).toBe("away");
    for (const d of drivers) expect(d.label).not.toMatch(JARGON);
    for (const label of Object.values(DRIVER_COPY)) expect(label).not.toMatch(JARGON);
  });

  it("usa un nombre genérico para factores desconocidos", () => {
    const [d] = topDrivers({
      ...NHL,
      drivers: [{ factor: "nuevo_factor", impactLogit: 0.3, impactUnits: 0.4 }],
    });
    expect(d!.label).toBe("Otro factor del modelo");
  });

  it("descarta las primeras 5 entradas fuera de MLB", () => {
    const views = lineViews(NHL);
    expect(views).toHaveLength(1);
    expect(views[0]!.options.map((o) => o.label)).toEqual([
      "Más de 6.5 goles",
      "Menos de 6.5 goles",
    ]);
    expect(lineViews({ ...NHL, sport: "mlb" })).toHaveLength(2);
  });

  it("dice cuándo se confirma lo pendiente", () => {
    const [home, away] = confirmationViews(NHL);
    expect(home!.title).toBe("Portero confirmado: Skinner");
    expect(home!.tone).toBe("ok");
    expect(away!.title).toBe("Portero por confirmar");
    expect(away!.detail).toBe("Vancouver · Suele confirmarse la mañana del partido");
  });

  it("avisa del segundo partido en dos noches y omite descansos normales", () => {
    expect(restNotes(NHL)).toEqual(["Vancouver juega su segundo partido en dos noches"]);
  });
});

describe("SportOutlookCard", () => {
  it("muestra ganador, marcador, líneas, confirmaciones y factores", () => {
    const html = renderToStaticMarkup(
      <SportOutlookCard outlook={NHL} oddsFormat="decimal" />,
    );
    expect(html).toContain("Gana Edmonton");
    expect(html).toContain("57.0 %");
    expect(html).toContain("Tiempo extra o penales");
    expect(html).toContain("Más de 6.5 goles");
    expect(html).toContain("Portero por confirmar");
    expect(html).toContain("Qué inclina el partido");
    expect(html).not.toMatch(JARGON);
    expect(html).not.toContain("Ejemplo");
  });

  it("muestra el estado vacío si el panorama no es válido", () => {
    const html = renderToStaticMarkup(
      <SportOutlookCard outlook={{ ...NHL, pHome: Number.NaN }} oddsFormat="decimal" />,
    );
    expect(html).toContain('data-state="empty"');
    expect(html).not.toContain("Marcador esperado");
  });

  it("oculta secciones sin datos del motor", () => {
    const html = renderToStaticMarkup(
      <SportOutlookCard
        outlook={{ ...NHL, lines: [], confirmations: [], rest: {}, drivers: [] }}
        oddsFormat="american"
        isExample
      />,
    );
    expect(html).not.toContain("Líneas del partido");
    expect(html).not.toContain("Antes del partido");
    expect(html).not.toContain("Qué inclina el partido");
    expect(html).toContain("Ejemplo");
  });
});
