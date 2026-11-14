import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import {
  buildOfficialDailyParlay,
  buildPersonalQuickParlay,
  DAILY_PARLAY_STYLE_SPECS,
  gradeOfficialDailyParlays,
  resolveOfficialParlayDay,
} from "../src/platform/daily-parlay";
import { PlatformProvider } from "../src/platform/platform-provider";
import { redactDatasetForVisitor } from "../src/platform/access-guard";
import { HomeClubView } from "../src/platform/club/home/HomeClubView";
import { OfficialDailyParlayCard } from "../src/platform/club/home/OfficialDailyParlayCard";
import { HistorialClubView } from "../src/platform/club/HistorialClubView";
import { ParlayBuilderClubView } from "../src/platform/club/ParlayAndQuantViews";
import type { PlatformGame } from "../src/platform/types";

function makeMatch(opts: {
  id: string;
  league: "liga-mx" | "premier-league" | "laliga" | "nfl";
  leagueLabel: string;
  sport: "football" | "american-football";
  day: string;
  kickoffUtc: string;
  status: "NS" | "FT";
  homeName: string;
  awayName: string;
  x12: [number, number, number];
  proj: { home: number; away: number; total: number };
  score?: { home: number; away: number };
}): MatchAnalysis {
  const isNfl = opts.sport === "american-football";
  return {
    id: opts.id,
    league: asLeagueId(opts.league),
    leagueLabel: opts.leagueLabel,
    sport: opts.sport,
    round: isNfl ? "Semana 11" : "Jornada 16",
    day: opts.day,
    dayLabel: opts.day,
    kickoffUtc: opts.kickoffUtc,
    kickoffLocal: "19:00",
    venue: isNfl ? "Estadio NFL" : "Estadio Fútbol",
    status: opts.status,
    score: opts.score,
    home: {
      slug: `${opts.id}-home`,
      name: opts.homeName,
      shortName: opts.homeName,
      code: opts.homeName.slice(0, 3).toUpperCase(),
      record: "8G-2P",
    },
    away: {
      slug: `${opts.id}-away`,
      name: opts.awayName,
      shortName: opts.awayName,
      code: opts.awayName.slice(0, 3).toUpperCase(),
      record: "4G-6P",
    },
    projection: opts.proj,
    x12: opts.x12,
    outcomes: isNfl
      ? [
          {
            key: "home",
            label: `${opts.homeName} gana`,
            probability: opts.x12[0],
            fairOdds: { decimal: Math.round((1 / opts.x12[0]) * 100) / 100, american: -150 },
          },
          {
            key: "away",
            label: `${opts.awayName} gana`,
            probability: opts.x12[2],
            fairOdds: { decimal: Math.round((1 / opts.x12[2]) * 100) / 100, american: 140 },
          },
        ]
      : [
          {
            key: "home",
            label: `${opts.homeName} gana`,
            probability: opts.x12[0],
            fairOdds: { decimal: Math.round((1 / opts.x12[0]) * 100) / 100, american: -150 },
          },
          {
            key: "draw",
            label: "Empate",
            probability: opts.x12[1],
            fairOdds: { decimal: Math.round((1 / opts.x12[1]) * 100) / 100, american: 280 },
          },
          {
            key: "away",
            label: `${opts.awayName} gana`,
            probability: opts.x12[2],
            fairOdds: { decimal: Math.round((1 / opts.x12[2]) * 100) / 100, american: 350 },
          },
        ],
    marketGroups: [
      {
        group: isNfl ? "Ganador" : "Resultado",
        rows: [
          {
            market: asMarketKey("h2h"),
            selection: "home",
            label: `${opts.homeName} gana`,
            p: opts.x12[0],
            fairOdds: Math.round((1 / opts.x12[0]) * 100) / 100,
          },
        ],
      },
    ],
    factors: [
      { label: "Forma", detail: "Estable", impact: "+1", value: "OK" },
    ],
    trace: [],
    confidence: { score: 80, level: "alta", reasons: [] },
    restDays: { home: 6, away: 5 },
  };
}

function buildTestDataset() {
  return buildPlatformDataset([
    {
      league: asLeagueId("liga-mx"),
      leagueLabel: "Liga MX",
      sport: "football",
      season: "Apertura 2026",
      roundLabel: "Jornada 16",
      generatedAt: "2026-11-14T10:00:00Z",
      games: [
        makeMatch({
          id: "lmx-1",
          league: "liga-mx",
          leagueLabel: "Liga MX",
          sport: "football",
          day: "2026-11-14",
          kickoffUtc: "2026-11-14T18:00:00Z",
          status: "NS",
          homeName: "América",
          awayName: "Atlas",
          x12: [0.76, 0.14, 0.1],
          proj: { home: 2.3, away: 0.7, total: 3.0 },
        }),
        makeMatch({
          id: "lmx-2",
          league: "liga-mx",
          leagueLabel: "Liga MX",
          sport: "football",
          day: "2026-11-14",
          kickoffUtc: "2026-11-14T20:00:00Z",
          status: "NS",
          homeName: "Cruz Azul",
          awayName: "Necaxa",
          x12: [0.74, 0.16, 0.1],
          proj: { home: 2.2, away: 0.8, total: 3.0 },
        }),
        makeMatch({
          id: "lmx-3",
          league: "liga-mx",
          leagueLabel: "Liga MX",
          sport: "football",
          day: "2026-11-14",
          kickoffUtc: "2026-11-14T22:00:00Z",
          status: "NS",
          homeName: "Monterrey",
          awayName: "León",
          x12: [0.63, 0.22, 0.15],
          proj: { home: 1.9, away: 1.0, total: 2.9 },
        }),
        makeMatch({
          id: "lmx-ft-1",
          league: "liga-mx",
          leagueLabel: "Liga MX",
          sport: "football",
          day: "2026-11-08",
          kickoffUtc: "2026-11-08T18:00:00Z",
          status: "FT",
          homeName: "América",
          awayName: "Mazatlán",
          x12: [0.78, 0.13, 0.09],
          proj: { home: 2.4, away: 0.6, total: 3.0 },
          score: { home: 3, away: 0 },
        }),
        makeMatch({
          id: "lmx-ft-2",
          league: "liga-mx",
          leagueLabel: "Liga MX",
          sport: "football",
          day: "2026-11-08",
          kickoffUtc: "2026-11-08T20:00:00Z",
          status: "FT",
          homeName: "Tigres",
          awayName: "Santos",
          x12: [0.75, 0.15, 0.1],
          proj: { home: 2.1, away: 0.7, total: 2.8 },
          score: { home: 2, away: 0 },
        }),
      ],
    },
    {
      league: asLeagueId("nfl"),
      leagueLabel: "NFL",
      sport: "american-football",
      season: "Temporada 2026",
      roundLabel: "Semana 11",
      generatedAt: "2026-11-14T10:00:00Z",
      games: [
        makeMatch({
          id: "nfl-1",
          league: "nfl",
          leagueLabel: "NFL",
          sport: "american-football",
          day: "2026-11-14",
          kickoffUtc: "2026-11-14T21:00:00Z",
          status: "NS",
          homeName: "Chiefs",
          awayName: "Raiders",
          x12: [0.75, 0, 0.25],
          proj: { home: 28, away: 17, total: 45 },
        }),
        makeMatch({
          id: "nfl-2",
          league: "nfl",
          leagueLabel: "NFL",
          sport: "american-football",
          day: "2026-11-14",
          kickoffUtc: "2026-11-14T23:00:00Z",
          status: "NS",
          homeName: "Lions",
          awayName: "Bears",
          x12: [0.64, 0, 0.36],
          proj: { home: 27, away: 20, total: 47 },
        }),
        makeMatch({
          id: "nfl-3",
          league: "nfl",
          leagueLabel: "NFL",
          sport: "american-football",
          day: "2026-11-14",
          kickoffUtc: "2026-11-15T01:00:00Z",
          status: "NS",
          homeName: "Ravens",
          awayName: "Browns",
          x12: [0.58, 0, 0.42],
          proj: { home: 25, away: 21, total: 46 },
        }),
        makeMatch({
          id: "nfl-ft-1",
          league: "nfl",
          leagueLabel: "NFL",
          sport: "american-football",
          day: "2026-11-08",
          kickoffUtc: "2026-11-08T18:00:00Z",
          status: "FT",
          homeName: "Eagles",
          awayName: "Giants",
          x12: [0.76, 0, 0.24],
          proj: { home: 28, away: 16, total: 44 },
          score: { home: 27, away: 13 },
        }),
        makeMatch({
          id: "nfl-ft-2",
          league: "nfl",
          leagueLabel: "NFL",
          sport: "american-football",
          day: "2026-11-08",
          kickoffUtc: "2026-11-08T21:00:00Z",
          status: "FT",
          homeName: "Bills",
          awayName: "Jets",
          x12: [0.66, 0, 0.34],
          proj: { home: 24, away: 18, total: 42 },
          score: { home: 17, away: 20 },
        }),
      ],
    },
  ]);
}

function shuffleGamesAndPicks(games: readonly PlatformGame[]): PlatformGame[] {
  return [...games]
    .reverse()
    .map((g) => ({ ...g, picks: [...g.picks].reverse() }));
}

describe("Parlay oficial del día y generador personal (Punto 4)", () => {
  it("es 100% determinista ante distinto orden de partidos o picks en todos los estilos", () => {
    const dataset = buildTestDataset();
    const reversed = shuffleGamesAndPicks(dataset.games);

    for (const risk of ["conservador", "medio", "arriesgado"] as const) {
      const a = buildOfficialDailyParlay({
        dayId: "2026-11-14",
        games: dataset.games,
        risk,
        viewerRole: "member",
      });
      const b = buildOfficialDailyParlay({
        dayId: "2026-11-14",
        games: reversed,
        risk,
        viewerRole: "member",
      });

      expect(a.status).toBe("ready");
      expect(a.legs.map((l) => l.pick.id)).toEqual(b.legs.map((l) => l.pick.id));
      expect(a.combinedProbability).toBeCloseTo(b.combinedProbability, 12);
      expect(a.fairDecimal).toBe(b.fairDecimal);
    }
  });

  it("no cambia cuando partidos del día empiezan o terminan: es el mismo que se califica", () => {
    const dataset = buildTestDataset();
    const dayGames = dataset.games.filter((g) => g.dayId === "2026-11-14");
    const [first] = [...dayGames].sort((x, y) => x.kickoffUtc.localeCompare(y.kickoffUtc));
    const finishedFirst = dataset.games.map((g) =>
      g.id === first!.id ? { ...g, status: "FT" as const, score: { home: 2, away: 0 } } : g,
    );
    for (const risk of ["conservador", "medio", "arriesgado"] as const) {
      const morning = buildOfficialDailyParlay({ dayId: "2026-11-14", games: dataset.games, risk });
      const afternoon = buildOfficialDailyParlay({ dayId: "2026-11-14", games: finishedFirst, risk });
      expect(afternoon.legs.map((l) => l.pick.id)).toEqual(morning.legs.map((l) => l.pick.id));
      const graded = gradeOfficialDailyParlays(finishedFirst).find((d) => d.dayId === "2026-11-14");
      const entry = graded?.entries.find((e) => e.risk === risk);
      expect(entry?.parlay.legs.map((l) => l.pick.id)).toEqual(morning.legs.map((l) => l.pick.id));
    }
  });

  it("respeta umbrales de probabilidad, número de selecciones, 1 pick por partido y 1/p", () => {
    const dataset = buildTestDataset();

    const cons = buildOfficialDailyParlay({
      dayId: "2026-11-14",
      games: dataset.games,
      risk: "conservador",
    });
    expect(cons.status).toBe("ready");
    expect(cons.legs.length).toBeGreaterThanOrEqual(DAILY_PARLAY_STYLE_SPECS.conservador.minLegs);
    expect(cons.legs.length).toBeLessThanOrEqual(DAILY_PARLAY_STYLE_SPECS.conservador.maxLegs);
    expect(cons.legs.every((l) => l.pick.p >= 0.7)).toBe(true);
    expect(new Set(cons.legs.map((l) => l.pick.gameId)).size).toBe(cons.legs.length);

    const med = buildOfficialDailyParlay({
      dayId: "2026-11-14",
      games: dataset.games,
      risk: "medio",
    });
    expect(med.status).toBe("ready");
    expect(med.legs.length).toBeGreaterThanOrEqual(3);
    expect(med.legs.length).toBeLessThanOrEqual(4);
    expect(med.legs.every((l) => l.pick.p >= 0.55)).toBe(true);
    expect(new Set(med.legs.map((l) => l.pick.gameId)).size).toBe(med.legs.length);

    const arr = buildOfficialDailyParlay({
      dayId: "2026-11-14",
      games: dataset.games,
      risk: "arriesgado",
    });
    expect(arr.status).toBe("ready");
    expect(arr.legs.length).toBeGreaterThanOrEqual(4);
    expect(arr.legs.length).toBeLessThanOrEqual(6);
    expect(new Set(arr.legs.map((l) => l.pick.gameId)).size).toBe(arr.legs.length);

    const expectedProb = arr.legs.reduce((acc, l) => acc * l.pick.p, 1);
    expect(arr.combinedProbability).toBeCloseTo(expectedProb, 12);
    expect(arr.fairDecimal).toBe(Math.max(1.01, Math.round((1 / expectedProb) * 100) / 100));
  });

  it("devuelve estado vacío honesto cuando faltan selecciones que cumplan la regla", () => {
    const dataset = buildTestDataset();
    const singleGameOnly = dataset.games.filter((g) => g.id === "lmx-1");
    const cons = buildOfficialDailyParlay({
      dayId: "2026-11-14",
      games: singleGameOnly,
      risk: "conservador",
    });
    expect(cons.status).toBe("insufficient");
    expect(cons.legs).toHaveLength(0);
    expect(cons.emptyReason).toMatch(/selecci/i);

    const med = buildOfficialDailyParlay({
      dayId: "2026-11-14",
      games: singleGameOnly,
      risk: "medio",
    });
    expect(med.status).toBe("insufficient");
  });

  it("no expone picks pagados redactados al visitante", () => {
    const dataset = redactDatasetForVisitor(buildTestDataset());
    const consVisitor = buildOfficialDailyParlay({
      dayId: "2026-11-14",
      games: dataset.games,
      risk: "conservador",
      viewerRole: "visitor",
    });
    expect(consVisitor.legs.every((l) => !l.pick.isRedacted)).toBe(true);
  });

  it("califica automáticamente los parlays oficiales cuando terminan los partidos (FT)", () => {
    const dataset = buildTestDataset();
    const days = gradeOfficialDailyParlays(dataset.games);
    const ftDay = days.find((d) => d.dayId === "2026-11-08");
    expect(ftDay).toBeDefined();
    expect(ftDay!.finishedGamesCount).toBe(4);

    const consEntry = ftDay!.entries.find((e) => e.risk === "conservador")!;
    expect(consEntry.parlay.status).toBe("ready");
    expect(consEntry.parlay.legs.length).toBeGreaterThanOrEqual(2);
    expect(["hit", "miss"]).toContain(consEntry.outcome);

    const arrEntry = ftDay!.entries.find((e) => e.risk === "arriesgado")!;
    expect(arrEntry.parlay.status).toBe("ready");
    expect(arrEntry.parlay.legs).toHaveLength(4);
    expect(arrEntry.outcome).toBe("miss");
    expect(arrEntry.missLegs).toBeGreaterThan(0);
  });

  it("filtra correctamente en el generador personal por todo, deporte o liga (2 a 6 picks)", () => {
    const dataset = buildTestDataset();
    expect(resolveOfficialParlayDay(dataset.games, "proximos", "2026-11-10")).toBe("2026-11-14");

    const allSix = buildPersonalQuickParlay({
      games: dataset.games,
      legCount: 6,
      risk: "medio",
      scope: { kind: "all" },
    });
    expect(allSix.status).toBe("ready");
    expect(allSix.legs).toHaveLength(6);

    const futbolOnly = buildPersonalQuickParlay({
      games: dataset.games,
      legCount: 3,
      risk: "conservador",
      scope: { kind: "sport", sport: "futbol" },
    });
    expect(futbolOnly.status).toBe("ready");
    expect(futbolOnly.legs.every((l) => l.pick.league === "liga-mx")).toBe(true);

    const nflOnly = buildPersonalQuickParlay({
      games: dataset.games,
      legCount: 3,
      risk: "arriesgado",
      scope: { kind: "league", league: asLeagueId("nfl") },
    });
    expect(nflOnly.status).toBe("ready");
    expect(nflOnly.legs.every((l) => l.pick.league === "nfl")).toBe(true);

    const emptyLeague = buildPersonalQuickParlay({
      games: dataset.games,
      legCount: 3,
      risk: "medio",
      scope: { kind: "league", league: asLeagueId("bundesliga") },
    });
    expect(emptyLeague.status).toBe("insufficient");
    expect(emptyLeague.legs).toHaveLength(0);
  });

  it("renderiza Parlay del día (con estado vacío), Historial calificado y Generador personal sin jerga prohibida", () => {
    const dataset = buildTestDataset();

    const homeHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <HomeClubView />
      </PlatformProvider>,
    );
    expect(homeHtml).toContain("Parlay del día");
    expect(homeHtml).toContain("Conservador");
    expect(homeHtml).toContain("Arriesgado");
    expect(homeHtml).toContain("Momio justo");
    expect(homeHtml).not.toMatch(/Poisson|Dixon-Coles|sigma|matriz|tipstar/i);

    const emptyDailyHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <OfficialDailyParlayCard
          games={dataset.games.filter((g) => g.id === "lmx-1")}
          selectedDay="2026-11-14"
          today="2026-11-14"
        />
      </PlatformProvider>,
    );
    expect(emptyDailyHtml).toContain("Sin datos suficientes");

    const histHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <HistorialClubView />
      </PlatformProvider>,
    );
    expect(histHtml).toContain("Parlays oficiales del día");
    expect(histHtml).toMatch(/Cumplido|No cumplido/);

    const parlaysHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <ParlayBuilderClubView />
      </PlatformProvider>,
    );
    expect(parlaysHtml).toContain("Generador personal");
    expect(parlaysHtml).toContain("Arma tu parlay en un toque");
    expect(parlaysHtml).toContain("Todas las ligas");
  });
});
