import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import { SportOutlookCard } from "../src/platform/club/match/sport-outlook/SportOutlookCard";
import {
  DRIVER_COPY,
  SPORT_LABEL,
  confirmationViews,
  isValidOutlook,
  lineViews,
  marginText,
  nflSpecialViews,
  restNotes,
  topDrivers,
  winnerSegments,
} from "../src/platform/club/match/sport-outlook/sport-outlook-logic";
import { platformGameToSportOutlook } from "../src/platform/club/match/sport-outlook/sport-outlook-mapper";
import type { SportOutlookInput } from "../src/platform/club/match/sport-outlook/sport-outlook-types";
import type {
  PlatformGame,
  PlatformGameDetail,
  PlatformMarketRow,
  SpacetimeSignal,
} from "../src/platform/types";

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

const JARGON =
  /Corsi|Fenwick|Pythag|FIP|wOBA|SRS|Four Factors|Open-Meteo|Log5|xG%|SumerSports|Ourlads|NFLPenalties|\bEPA\b/;

function makeMarketRow(
  overrides: Partial<PlatformMarketRow> &
    Pick<PlatformMarketRow, "market" | "selection" | "p">,
): PlatformMarketRow {
  return {
    group: "Mercado",
    label: overrides.selection,
    fairDecimal: Math.round((1 / Math.max(overrides.p, 0.01)) * 100) / 100,
    fairAmerican: overrides.p >= 0.5 ? -110 : 110,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    ...overrides,
  };
}

function makeSpacetimeSignal(
  overrides: Partial<SpacetimeSignal> = {},
): SpacetimeSignal {
  return {
    engineName: "PitchLab Spacetime",
    sportsEngineName: "PitchLab Spacetime",
    probs: { home: 0.55, draw: 0, away: 0.45 },
    market: null,
    value: [],
    expectedTotal: null,
    expectedMargin: null,
    drivers: [],
    availability: {
      homeInjured: null,
      awayInjured: null,
      homeMissingValuePct: null,
      awayMissingValuePct: null,
    },
    stadium: { name: null, elevationM: null },
    ...overrides,
  };
}

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
    expect(winnerSegments({ ...NHL, sport: "nfl" })).toHaveLength(2);
  });
});

describe("textos", () => {
  it("describe el margen en unidades del deporte", () => {
    expect(marginText(NHL)).toBe("Edmonton por 0.5 goles");
    expect(marginText({ ...NHL, expectedAway: 3.38 })).toBe("Partido parejo");
    expect(
      marginText({ ...NHL, sport: "mlb", expectedHome: 3, expectedAway: 4 }),
    ).toBe("Vancouver por 1.0 carrera");
    expect(
      marginText({ ...NHL, sport: "nfl", expectedHome: 25.4, expectedAway: 22.1 }),
    ).toBe("Edmonton por 3.3 puntos");
    expect(
      marginText({ ...NHL, sport: "nfl", expectedHome: 22, expectedAway: 21 }),
    ).toBe("Edmonton por 1.0 punto");
    expect(
      marginText({ ...NHL, sport: "nfl", expectedHome: 21.2, expectedAway: 21 }),
    ).toBe("Partido parejo");
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

  it("expone etiqueta NFL y escenarios clave de OT y margen ±3/±7 solo en NFL", () => {
    expect(SPORT_LABEL.nfl).toBe("Futbol americano · NFL");
    const nflOutlook: SportOutlookInput = {
      ...NHL,
      sport: "nfl",
      nflSpecials: {
        expectedMargin: 3.3,
        pOvertime: 0.068,
        fairOvertimeDecimal: 14.71,
        pExactPlus3: 0.094,
        pExactMinus3: 0.061,
        pExactPlus7: 0.062,
        pExactMinus7: 0.039,
      },
    };
    const specials = nflSpecialViews(nflOutlook);
    expect(specials.map((s) => s.key)).toEqual([
      "overtime",
      "key_margin_3",
      "key_margin_7",
    ]);
    expect(specials[0]!.title).toBe("Tiempo extra (OT)");
    expect(specials[1]!.subtitle).toBe("+3 (9.4 %) · −3 (6.1 %)");
    expect(specials[2]!.subtitle).toBe("+7 (6.2 %) · −7 (3.9 %)");
    expect(nflSpecialViews({ ...nflOutlook, sport: "nba" })).toEqual([]);
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

const SAMPLE_NBA_GAME: PlatformGame = {
  id: "nba-den-bos",
  league: asLeagueId("nba"),
  leagueLabel: "NBA",
  sport: "basketball",
  hasForecast: true,
  status: "NS",
  home: { slug: "den", name: "Denver Nuggets", shortName: "Nuggets", code: "DEN", record: "" },
  away: { slug: "bos", name: "Boston Celtics", shortName: "Celtics", code: "BOS", record: "" },
  x12: [0.54, 0, 0.46],
  projection: { home: 114.2, away: 111.8, total: 226.0 },
  confidenceScore: null,
  confidenceLevel: null,
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
};

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

  it("mapea NBA con mercados derivados sin campo line, expectedPace y drivers reales", () => {
    const nbaDerivedGame: PlatformGame = {
      ...SAMPLE_NBA_GAME,
      markets: [],
      factors: [
        { label: "Ritmo (Pace)", value: "98.7", sub: "Posesiones por 48 minutos" },
      ],
      spacetime: makeSpacetimeSignal({
        probs: { home: 0.54, draw: 0, away: 0.46 },
        drivers: [
          { label: "Localía y altura", impactLogit: 0.27 },
          { label: "net_rtg_srs_four_factors", impactLogit: -0.19 },
          { label: "Corsi% + Fenwick%", impactLogit: 0.08 },
        ],
      }),
    };
    const nbaDetail: PlatformGameDetail = {
      markets: [
        makeMarketRow({ market: "totals", selection: "over_221.5", p: 0.61, isDerived: true }),
        makeMarketRow({ market: "totals", selection: "over_226.5", p: 0.502, isDerived: true }),
        makeMarketRow({ market: "totals", selection: "over_231.5", p: 0.39, isDerived: true }),
        makeMarketRow({ market: "spread", selection: "home_-5.5", p: 0.41, isDerived: true }),
        makeMarketRow({ market: "spread", selection: "home_-2.5", p: 0.495, isDerived: true }),
        makeMarketRow({ market: "spread", selection: "home_+0.5", p: 0.58, isDerived: true }),
      ],
      headToHead: [],
      factors: nbaDerivedGame.factors,
    };

    const mapped = platformGameToSportOutlook(nbaDerivedGame, nbaDetail);
    expect(mapped).not.toBeNull();
    expect(mapped?.expectedPace).toBe(98.7);
    expect(mapped?.lines).toEqual([
      { kind: "total", line: 226.5, p: 0.502 },
      { kind: "spread", line: -2.5, p: 0.495 },
    ]);
    expect(mapped?.drivers.map((d) => d.factor)).toEqual([
      "nba_hca_and_altitude",
      "net_rtg_srs_four_factors",
      "model_factor_2",
    ]);
    expect(JSON.stringify(mapped)).not.toMatch(JARGON);

    const html = renderToStaticMarkup(
      <SportOutlookCard outlook={mapped!} oddsFormat="american" />,
    );
    expect(html).toContain("99 posesiones por equipo");
    expect(html).toContain("Más de 226.5 puntos");
    expect(html).toContain("Denver Nuggets −2.5");
    expect(html).toContain("Nivel de juego en la temporada");
    expect(html).toContain("Otro factor del modelo");
    expect(html).not.toMatch(JARGON);
  });

  it("mapea partidos NFL con líneas de producción, drivers y nflSpecials v5", () => {
    const nflGame: PlatformGame = {
      ...SAMPLE_NBA_GAME,
      id: "nfl-kc-buf",
      league: asLeagueId("nfl"),
      leagueLabel: "NFL",
      sport: "american-football",
      home: { slug: "kc", name: "Kansas City Chiefs", shortName: "Chiefs", code: "KC", record: "9-2" },
      away: { slug: "buf", name: "Buffalo Bills", shortName: "Bills", code: "BUF", record: "8-3" },
      x12: [0.562, 0, 0.438],
      projection: { home: 25.4, away: 22.1, total: 47.5 },
      markets: [],
      restDays: { home: 7, away: 7 },
      spacetime: makeSpacetimeSignal({
        probs: { home: 0.562, draw: 0, away: 0.438 },
        drivers: [
          { label: "Eficiencia por jugada", impactLogit: 0.24 },
          { label: "Lesiones (QB y titulares)", impactLogit: -0.09 },
          { label: "Clima y estadio", impactLogit: 0.11 },
        ],
      }),
    };
    const nflDetail: PlatformGameDetail = {
      markets: [
        makeMarketRow({ market: "spread", selection: "home_-3.5", p: 0.482, isDerived: true }),
        makeMarketRow({ market: "totals", selection: "over_47.5", p: 0.514, isDerived: true }),
      ],
      headToHead: [],
      factors: [],
      v5: {
        epistemic: {
          home: {
            pPoint: 0.562,
            pLower90: 0.51,
            pUpper90: 0.61,
            halfWidth90: 0.05,
            conservativeFairDecimal: 1.96,
            grade: "high",
          },
          away: {
            pPoint: 0.438,
            pLower90: 0.39,
            pUpper90: 0.49,
            halfWidth90: 0.05,
            conservativeFairDecimal: 2.56,
            grade: "high",
          },
        },
        nflSpecials: {
          expectedMargin: 3.3,
          pExactPlus3: 0.094,
          pExactMinus3: 0.061,
          pOvertime: 0.068,
          fairOvertimeDecimal: 14.71,
        },
        verifiedSummaryEs: "Resumen verificado",
        guardrailPassed: true,
      },
    };

    const mapped = platformGameToSportOutlook(nflGame, nflDetail);
    expect(mapped).not.toBeNull();
    expect(mapped?.sport).toBe("nfl");
    expect(mapped?.lines).toEqual([
      { kind: "total", line: 47.5, p: 0.514 },
      { kind: "spread", line: -3.5, p: 0.482 },
    ]);
    expect(mapped?.nflSpecials).toEqual({
      expectedMargin: 3.3,
      pOvertime: 0.068,
      fairOvertimeDecimal: 14.71,
      pExactPlus3: 0.094,
      pExactMinus3: 0.061,
    });
    expect(mapped?.drivers.map((d) => d.factor)).toEqual([
      "sumersports_epa_success",
      "injuries_qb_depth",
      "weather_stadium_physics",
    ]);

    const html = renderToStaticMarkup(
      <SportOutlookCard outlook={mapped!} oddsFormat="decimal" />,
    );
    expect(html).toContain("Futbol americano · NFL");
    expect(html).toContain("Escenarios clave de NFL");
    expect(html).toContain("Tiempo extra (OT)");
    expect(html).toContain("Margen clave ±3 puntos");
    expect(html).toContain("Más de 47.5 puntos");
    expect(html).toContain("Kansas City Chiefs −3.5");
    expect(html).toContain("Eficiencia por jugada");
    expect(html).not.toMatch(JARGON);
  });

  it("mapea partidos MLB con runline, F5 ganador/total y abridores probables", () => {
    const mlbGame: PlatformGame = {
      ...SAMPLE_NBA_GAME,
      id: "mlb-lad-sd",
      league: asLeagueId("mlb"),
      leagueLabel: "MLB",
      sport: "baseball",
      home: { slug: "lad", name: "Los Angeles Dodgers", shortName: "Dodgers", code: "LAD", record: "" },
      away: { slug: "sd", name: "San Diego Padres", shortName: "Padres", code: "SD", record: "" },
      x12: [0.561, 0, 0.439],
      projection: { home: 4.6, away: 3.9, total: 8.5 },
      markets: [],
      restDays: undefined,
      preGame: {
        ...SAMPLE_NBA_GAME.preGame,
        matchContext: {
          probablePitchers: {
            home: { name: "Yoshinobu Yamamoto", throwingHand: "R", era: 2.91 },
          },
        },
      },
    };
    const mlbDetail: PlatformGameDetail = {
      markets: [
        makeMarketRow({ market: "mlb_runline", selection: "home_-1.5", p: 0.364, isDerived: true }),
        makeMarketRow({ market: "totals", selection: "over_8.5", p: 0.493, isDerived: true }),
        makeMarketRow({ market: "f5_moneyline", selection: "f5_home", p: 0.552, isDerived: true }),
        makeMarketRow({ market: "f5_totals", selection: "f5_over_4.5", p: 0.471, isDerived: true }),
      ],
      headToHead: [],
      factors: [],
    };

    const mapped = platformGameToSportOutlook(mlbGame, mlbDetail);
    expect(mapped).not.toBeNull();
    expect(mapped?.sport).toBe("mlb");
    expect(mapped?.lines).toEqual([
      { kind: "total", line: 8.5, p: 0.493 },
      { kind: "spread", line: -1.5, p: 0.364 },
      { kind: "first5_winner", line: 0, p: 0.552 },
      { kind: "first5_total", line: 4.5, p: 0.471 },
    ]);
    expect(mapped?.confirmations).toEqual([
      {
        kind: "starting_pitcher",
        team: "home",
        status: "probable",
        playerName: "Yoshinobu Yamamoto",
      },
      { kind: "starting_pitcher", team: "away", status: "pending" },
    ]);

    const html = renderToStaticMarkup(
      <SportOutlookCard outlook={mapped!} oddsFormat="american" />,
    );
    expect(html).toContain("Primeras 5 entradas · ganador");
    expect(html).toContain("Primeras 5 entradas · carreras");
    expect(html).toContain("Más de 4.5 carreras");
    expect(html).toContain("Abridor probable: Yoshinobu Yamamoto");
    expect(html).toContain("Abridor por confirmar");

    const mlb3WayDetail: PlatformGameDetail = {
      markets: [
        makeMarketRow({ market: "mlb_f5", selection: "home", p: 0.44, isDerived: true }),
        makeMarketRow({ market: "mlb_f5", selection: "tie", p: 0.18, isDerived: true }),
        makeMarketRow({ market: "mlb_f5", selection: "away", p: 0.38, isDerived: true }),
      ],
      headToHead: [],
      factors: [],
    };
    const mapped3Way = platformGameToSportOutlook(mlbGame, mlb3WayDetail);
    expect(mapped3Way?.lines).toEqual([
      { kind: "first5_winner", line: 0, p: 0.44, pTie: 0.18, pAway: 0.38 },
    ]);
    const html3Way = renderToStaticMarkup(
      <SportOutlookCard outlook={mapped3Way!} oddsFormat="decimal" />,
    );
    expect(html3Way).toContain("Empate");
  });

  it("mapea partidos NHL sin líneas y reparte tiempo extra solo cuando existe", () => {
    const nhl: PlatformGame = {
      ...SAMPLE_NBA_GAME,
      id: "nhl-edm-van",
      league: asLeagueId("nhl"),
      sport: "ice-hockey",
      x12: [0.47, 0.21, 0.32],
      projection: { home: 3.4, away: 2.9, total: 6.3 },
      markets: [],
      restDays: undefined,
    };
    const mapped = platformGameToSportOutlook(nhl);
    expect(mapped?.sport).toBe("nhl");
    expect(mapped?.pHomeReg).toBe(0.47);
    expect(mapped?.pOtReg).toBe(0.21);
    expect(mapped?.pAwayReg).toBe(0.32);
    expect(mapped?.lines).toBeUndefined();
    expect(mapped?.rest).toBeUndefined();
    expect(mapped?.confirmations).toEqual([
      { kind: "goalie", team: "home", status: "pending" },
      { kind: "goalie", team: "away", status: "pending" },
    ]);
  });

  it("mapea nhl_puckline y porteros confirmados vs pendientes en NHL", () => {
    const nhl: PlatformGame = {
      ...SAMPLE_NBA_GAME,
      id: "nhl-edm-van-live",
      league: asLeagueId("nhl"),
      leagueLabel: "NHL",
      sport: "ice-hockey",
      home: { slug: "edm", name: "Edmonton Oilers", shortName: "Oilers", code: "EDM", record: "" },
      away: { slug: "van", name: "Vancouver Canucks", shortName: "Canucks", code: "VAN", record: "" },
      x12: [0.468, 0.212, 0.32],
      projection: { home: 3.4, away: 2.9, total: 6.3 },
      markets: [],
      preGame: {
        ...SAMPLE_NBA_GAME.preGame,
        lineupsConfirmed60m: true,
        confirmedLineups: {
          sourceLabel: "Oficial",
          verifiedAtUtc: "2026-11-14T17:05:00Z",
          homeStarters: [{ name: "Stuart Skinner", position: "G" }],
          awayStarters: [],
        },
      },
    };
    const nhlDetail: PlatformGameDetail = {
      markets: [
        makeMarketRow({ market: "nhl_puckline", selection: "home_-1.5", p: 0.318, isDerived: true }),
        makeMarketRow({ market: "totals", selection: "over_6.5", p: 0.462, isDerived: true }),
      ],
      headToHead: [],
      factors: [],
    };
    const mapped = platformGameToSportOutlook(nhl, nhlDetail);
    expect(mapped?.lines).toEqual([
      { kind: "total", line: 6.5, p: 0.462 },
      { kind: "spread", line: -1.5, p: 0.318 },
    ]);
    expect(mapped?.confirmations).toEqual([
      {
        kind: "goalie",
        team: "home",
        status: "confirmed",
        playerName: "Stuart Skinner",
        updatedAtUtc: "2026-11-14T17:05:00Z",
      },
      { kind: "goalie", team: "away", status: "pending" },
    ]);
  });

  it("devuelve null en fútbol o sin pronóstico", () => {
    expect(
      platformGameToSportOutlook({
        ...SAMPLE_NBA_GAME,
        league: asLeagueId("liga-mx"),
        sport: "football",
      }),
    ).toBeNull();
    expect(
      platformGameToSportOutlook({
        ...SAMPLE_NBA_GAME,
        hasForecast: false,
      }),
    ).toBeNull();
    expect(
      platformGameToSportOutlook({
        ...SAMPLE_NBA_GAME,
        projection: null,
      }),
    ).toBeNull();
  });
});
