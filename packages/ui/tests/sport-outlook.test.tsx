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
import { platformGameToSportOutlook } from "../src/platform/club/match/sport-outlook/sport-outlook-mapper";
import type { SportOutlookInput } from "../src/platform/club/match/sport-outlook/sport-outlook-types";
import type { PlatformGame } from "../src/platform/types";

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

const SAMPLE_NBA_GAME = {
  id: "nba-den-bos",
  league: "nba",
  leagueLabel: "NBA",
  sport: "basketball",
  hasForecast: true,
  status: "NS",
  home: { slug: "den", name: "Denver Nuggets", shortName: "Nuggets", code: "DEN", record: "" },
  away: { slug: "bos", name: "Boston Celtics", shortName: "Celtics", code: "BOS", record: "" },
  x12: [0.54, 0, 0.46],
  projection: { home: 114.2, away: 111.8, total: 226.0 },
  restDays: { home: 3, away: 0 },
  preGame: {
    cortexSynthesis: "",
    tacticalKeys: [],
    lineupStatusLabel: "",
    lineupsConfirmed60m: false,
    absences: [],
    moneyFlow: null,
  },
  markets: [
    {
      group: "Total 225.5",
      market: "totals",
      selection: "over",
      label: "Más de 225.5 puntos",
      line: 225.5,
      p: 0.53,
      fairDecimal: 1.89,
      fairAmerican: -112,
      openDecimal: null,
      currentDecimal: null,
      edgePts: null,
    },
    {
      group: "Spread DEN -2.5",
      market: "spreads",
      selection: "home",
      label: "Nuggets -2.5",
      line: -2.5,
      p: 0.49,
      fairDecimal: 2.04,
      fairAmerican: 104,
      openDecimal: null,
      currentDecimal: null,
      edgePts: null,
    },
  ],
  picks: [],
  factors: [],
  headToHead: [],
  updatedAtLabel: "Hoy",
  spacetime: null,
  round: "",
  dayId: "2030-11-15",
  dayLabel: "Hoy",
  kickoffUtc: "2030-11-15T23:00:00Z",
  kickoffLocal: "18:00",
  venue: "Ball Arena",
} as unknown as PlatformGame;

describe("platformGameToSportOutlook", () => {
  it("mapea partidos NBA reales con líneas, descanso y Cero-Fuga", () => {
    const mapped = platformGameToSportOutlook(SAMPLE_NBA_GAME);
    expect(mapped).not.toBeNull();
    expect(mapped?.sport).toBe("nba");
    expect(mapped?.lines).toEqual([
      { kind: "total", line: 225.5, p: 0.53 },
      { kind: "spread", line: -2.5, p: 0.49 },
    ]);
    expect(mapped?.rest).toEqual({
      home: { restDays: 3 },
      away: { restDays: 0, backToBack: true },
    });
    const html = renderToStaticMarkup(
      <SportOutlookCard outlook={mapped!} oddsFormat="decimal" />,
    );
    expect(html).toContain("Gana Denver Nuggets");
    expect(html).toContain("Más de 225.5 puntos");
    expect(html).toContain("Boston Celtics juega su segundo partido en dos noches");
  });

  it("mapea partidos NHL sin líneas y reparte tiempo extra solo cuando existe", () => {
    const nhl = {
      ...SAMPLE_NBA_GAME,
      id: "nhl-edm-van",
      league: "nhl",
      sport: "ice-hockey",
      x12: [0.47, 0.21, 0.32],
      projection: { home: 3.4, away: 2.9, total: 6.3 },
      markets: [],
      restDays: undefined,
    } as unknown as PlatformGame;
    const mapped = platformGameToSportOutlook(nhl);
    expect(mapped?.sport).toBe("nhl");
    expect(mapped?.pHomeReg).toBe(0.47);
    expect(mapped?.pOtReg).toBe(0.21);
    expect(mapped?.pAwayReg).toBe(0.32);
    expect(mapped?.lines).toBeUndefined();
    expect(mapped?.rest).toBeUndefined();
  });

  it("devuelve null en fútbol o sin pronóstico", () => {
    expect(
      platformGameToSportOutlook({
        ...SAMPLE_NBA_GAME,
        league: "liga-mx",
        sport: "football",
      } as unknown as PlatformGame),
    ).toBeNull();
    expect(
      platformGameToSportOutlook({
        ...SAMPLE_NBA_GAME,
        hasForecast: false,
      } as unknown as PlatformGame),
    ).toBeNull();
    expect(
      platformGameToSportOutlook({
        ...SAMPLE_NBA_GAME,
        projection: null,
      } as unknown as PlatformGame),
    ).toBeNull();
  });
});
