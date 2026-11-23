import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import {
  buildOfficialDailyParlay,
  buildPersonalQuickParlay,
  buildTargetOddsParlay,
  DAILY_PARLAY_MODE_SPECS,
  DAILY_PARLAY_STYLE_SPECS,
  gradeOfficialDailyParlays,
  resolveOfficialParlayDay,
} from "../src/platform/daily-parlay";
import { PlatformProvider } from "../src/platform/platform-provider";
import { redactDatasetForVisitor } from "../src/platform/access-guard";
import { ShareTicketModal } from "../src/platform/components/PlatformOverlays";
import { winningContentFromEntry } from "../src/platform/components/WinningTicketDialog";
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
    expect(parlaysHtml).toContain("Generador automático");
    expect(parlaysHtml).toContain("Armar a mano");
    expect(parlaysHtml).toContain("Cuota meta");
    expect(parlaysHtml).toContain("~5.0×");
    expect(parlaysHtml).toContain("Todas las ligas");
    expect(parlaysHtml).not.toContain("data-personal-parlay-quickbar");
  });

  it("buildTargetOddsParlay busca líneas alternativas (JAX -7.5 vs ML 1.21) cumpliendo piso >= 52 % y rango 3.0–7.0 cerca de 5.0", () => {
    const nflSundayMatch = (opts: {
      id: string;
      home: string;
      away: string;
      x12: [number, number, number];
      proj: { home: number; away: number; total: number };
      marketGroups: MatchAnalysis["marketGroups"];
    }): MatchAnalysis => ({
      id: opts.id,
      league: asLeagueId("nfl"),
      leagueLabel: "NFL",
      sport: "american-football",
      round: "Semana 10",
      day: "2026-11-15",
      dayLabel: "domingo",
      kickoffUtc: "2026-11-15T18:00:00Z",
      kickoffLocal: "12:00",
      venue: "Estadio NFL",
      status: "NS",
      home: { slug: `${opts.id}-h`, name: opts.home, shortName: opts.home, code: opts.home.slice(0, 3).toUpperCase(), record: "6G-3P" },
      away: { slug: `${opts.id}-a`, name: opts.away, shortName: opts.away, code: opts.away.slice(0, 3).toUpperCase(), record: "7G-2P" },
      x12: opts.x12,
      projection: opts.proj,
      outcomes: [
        { key: "home", label: `${opts.home} gana`, probability: opts.x12[0], fairOdds: { decimal: Math.round((1 / opts.x12[0]) * 100) / 100, american: 150 } },
        { key: "away", label: `${opts.away} gana`, probability: opts.x12[2], fairOdds: { decimal: Math.round((1 / opts.x12[2]) * 100) / 100, american: -180 } },
      ],
      marketGroups: opts.marketGroups,
      factors: [{ label: "Forma", detail: "OK", impact: "+1", value: "OK" }],
      trace: [],
      confidence: { score: 80, level: "alta", reasons: [] },
    });

    const sundayDataset = buildPlatformDataset([
      {
        league: asLeagueId("nfl"),
        leagueLabel: "NFL",
        sport: "american-football",
        season: "2026",
        roundLabel: "Semana 10",
        generatedAt: "2026-11-15T10:00:00Z",
        games: [
          nflSundayMatch({
            id: "nfl-kc-atl",
            home: "Atlanta",
            away: "Kansas City",
            x12: [0.348, 0, 0.652],
            proj: { home: 20, away: 24.3, total: 44.3 },
            marketGroups: [
              {
                group: "Ganador",
                rows: [
                  { market: asMarketKey("h2h"), selection: "away", label: "Kansas City gana", p: 0.652, fairOdds: 1.53 },
                  { market: asMarketKey("h2h"), selection: "home", label: "Atlanta gana", p: 0.348, fairOdds: 2.87 },
                ],
              },
            ],
          }),
          nflSundayMatch({
            id: "nfl-hou-cle",
            home: "Cleveland",
            away: "Houston",
            x12: [0.385, 0, 0.615],
            proj: { home: 19.5, away: 23, total: 42.5 },
            marketGroups: [
              {
                group: "Ganador",
                rows: [
                  { market: asMarketKey("h2h"), selection: "away", label: "Houston gana", p: 0.615, fairOdds: 1.63 },
                  { market: asMarketKey("h2h"), selection: "home", label: "Cleveland gana", p: 0.385, fairOdds: 2.6 },
                ],
              },
            ],
          }),
          nflSundayMatch({
            id: "nfl-sf-dal",
            home: "Dallas",
            away: "San Francisco",
            x12: [0.339, 0, 0.661],
            proj: { home: 20.5, away: 25, total: 45.5 },
            marketGroups: [
              {
                group: "Ganador",
                rows: [
                  { market: asMarketKey("h2h"), selection: "away", label: "San Francisco gana", p: 0.661, fairOdds: 1.51 },
                  { market: asMarketKey("h2h"), selection: "home", label: "Dallas gana", p: 0.339, fairOdds: 2.95 },
                ],
              },
            ],
          }),
          nflSundayMatch({
            id: "nfl-jax-ten",
            home: "Tennessee",
            away: "Jacksonville",
            x12: [0.171, 0, 0.829],
            proj: { home: 16, away: 26.5, total: 42.5 },
            marketGroups: [
              {
                group: "Ganador",
                rows: [
                  { market: asMarketKey("h2h"), selection: "away", label: "Jacksonville gana", p: 0.829, fairOdds: 1.21 },
                  { market: asMarketKey("h2h"), selection: "home", label: "Tennessee gana", p: 0.171, fairOdds: 5.85 },
                ],
              },
              {
                group: "Hándicap alternativo -7.5",
                rows: [
                  { market: asMarketKey("spreads"), selection: "away_-7.5", label: "JAX -7.5", line: -7.5, p: 0.608, fairOdds: 1.64 },
                  { market: asMarketKey("spreads"), selection: "home_7.5", label: "TEN +7.5", line: 7.5, p: 0.392, fairOdds: 2.55 },
                ],
              },
            ],
          }),
        ],
      },
    ]);

    const res = buildTargetOddsParlay({
      games: sundayDataset.games,
      dayId: "2026-11-15",
      legCount: 4,
      minLegProbability: 0.52,
      minLegDecimal: 1.35,
      targetRange: { min: 3.0, target: 5.0, max: 7.0 },
      scope: { kind: "league", league: asLeagueId("nfl") },
    });

    expect(res.status).toBe("ready");
    expect(res.legs).toHaveLength(4);
    expect(res.legs.every((l) => l.pick.p >= 0.52)).toBe(true);
    expect(res.legs.every((l) => l.pick.fairDecimal >= 1.35)).toBe(true);
    expect(res.legs.some((l) => l.pick.label === "JAX -7.5")).toBe(true);
    expect(res.legs.some((l) => l.pick.label === "Jacksonville gana")).toBe(false);
    expect(res.fairDecimal).toBeGreaterThanOrEqual(3.0);
    expect(res.fairDecimal).toBeLessThanOrEqual(7.0);
    expect(res.hasCapturedBookOdds).toBe(false);

    // Determinismo si cambia el orden de partidos/picks
    const reversed = shuffleGamesAndPicks(sundayDataset.games);
    const resRev = buildTargetOddsParlay({
      games: reversed,
      dayId: "2026-11-15",
      legCount: 4,
      minLegProbability: 0.52,
      minLegDecimal: 1.35,
      targetRange: { min: 3.0, target: 5.0, max: 7.0 },
      scope: { kind: "league", league: asLeagueId("nfl") },
    });
    expect(resRev.legs.map((l) => l.pick.id)).toEqual(res.legs.map((l) => l.pick.id));

    // Preserva piso honesto si no se alcanza el rango objetivo sin romper >= 52 %
    const impossibleHigh = buildTargetOddsParlay({
      games: sundayDataset.games,
      dayId: "2026-11-15",
      legCount: 4,
      minLegProbability: 0.52,
      minLegDecimal: 1.35,
      targetRange: { min: 15.0, target: 20.0, max: 25.0 },
      scope: { kind: "league", league: asLeagueId("nfl") },
    });
    expect(impossibleHigh.status).toBe("insufficient");
    expect(impossibleHigh.emptyReason).toMatch(/52 %/);

    // Modo 4 en OfficialDailyParlayCard + PersonalParlayQuickBar con Cuota meta ~5.0×
    const officialObjetivo = buildOfficialDailyParlay({
      dayId: "2026-11-15",
      games: sundayDataset.games,
      risk: "objetivo",
      scope: { kind: "league", league: asLeagueId("nfl") },
    });
    expect(officialObjetivo.status).toBe("ready");
    expect(officialObjetivo.legs).toHaveLength(4);

    const quickTarget = buildPersonalQuickParlay({
      games: sundayDataset.games,
      legCount: 4,
      risk: "medio",
      targetPreset: "5x",
      scope: { kind: "league", league: asLeagueId("nfl") },
    });
    expect(quickTarget.status).toBe("ready");
    expect(quickTarget.fairDecimal).toBeGreaterThanOrEqual(3.0);

    // UI de OfficialDailyParlayCard renderiza jerarquía numerada, Más probable, sin En casa falso
    const cardHtml = renderToStaticMarkup(
      <PlatformProvider dataset={sundayDataset} initialRole="member">
        <OfficialDailyParlayCard
          games={sundayDataset.games}
          selectedDay="2026-11-15"
          today="2026-11-15"
          initialMode="objetivo"
          activeLeague={asLeagueId("nfl")}
        />
      </PlatformProvider>,
    );
    expect(cardHtml).toContain(DAILY_PARLAY_MODE_SPECS.objetivo.label);
    expect(cardHtml).toContain("Más probable");
    expect(cardHtml).toContain("JAX -7.5");
    expect(cardHtml).toContain("Momio justo combinado");
    expect(cardHtml).toContain("Cargar a mi parlay");
    expect(cardHtml).toContain("Abrir en armador");
    expect(cardHtml).not.toContain("Compartir tarjeta");
    expect(cardHtml).not.toContain("En casa");

    // ShareTicketModal renderiza lista multi-pata para tarjeta oficial y sella picks individuales pre-kickoff
    const shareMultiHtml = renderToStaticMarkup(
      <PlatformProvider
        dataset={sundayDataset}
        initialRole="member"
        initialShareTicket={{
          kind: "parlay",
          title: "Parlay objetivo ~5.0× · NFL",
          subtitle: "4 selecciones, ≥ 52 % cada una",
          leagueLabel: "NFL",
          pickLabel: officialObjetivo.legs.map((l) => l.pick.label).join(" + "),
          probability: officialObjetivo.combinedProbability,
          fairDecimal: officialObjetivo.fairDecimal,
          marketDecimal: officialObjetivo.fairDecimal,
          units: 1,
          gameStatus: "NS",
          revealLegs: true,
          legs: officialObjetivo.legs.map((l) => ({
            label: l.pick.label,
            matchLabel: `${l.pick.matchLabel} · ${l.pick.kickoffLocal}`,
            p: l.pick.p,
            fairDecimal: l.pick.fairDecimal,
          })),
        }}
      >
        <ShareTicketModal />
      </PlatformProvider>,
    );
    expect(shareMultiHtml).toContain("data-share-multi-legs");
    expect(shareMultiHtml).toContain("JAX -7.5");
    expect(shareMultiHtml).toContain("Más probable");

    const sealedPickHtml = renderToStaticMarkup(
      <PlatformProvider
        dataset={sundayDataset}
        initialRole="member"
        initialShareTicket={{
          kind: "pick",
          title: "Chiefs @ Falcons",
          subtitle: "NFL · 12:00",
          leagueLabel: "NFL",
          pickLabel: "Kansas City gana",
          probability: 0.652,
          fairDecimal: 1.53,
          marketDecimal: 1.53,
          units: 1,
          gameStatus: "NS",
        }}
      >
        <ShareTicketModal />
      </PlatformProvider>,
    );
    expect(sealedPickHtml).toContain("data-sealed-prekickoff");
    expect(sealedPickHtml).not.toContain("Kansas City gana");

    const settledLostParlayHtml = renderToStaticMarkup(
      <PlatformProvider
        dataset={sundayDataset}
        initialRole="member"
        initialShareTicket={{
          kind: "parlay",
          title: "Parlay · 2 selecciones",
          subtitle: "Parlay liquidado · Mi récord PitchLab",
          leagueLabel: "Multi-Liga",
          pickLabel: "SF -3.5 · DET Over 47.5",
          legs: [
            {
              label: "San Francisco -3.5",
              matchLabel: "SF vs MIN · FT 24–20",
              p: null,
              fairDecimal: null,
              status: "won",
              scoreLabel: "24–20",
            },
            {
              label: "Más de 47.5 pts",
              matchLabel: "DET vs TB · FT 16–20",
              p: null,
              fairDecimal: null,
              status: "lost",
              scoreLabel: "16–20",
            },
          ],
          revealLegs: true,
          settlementStatus: "lost",
          netUnits: -1,
          legSummaryLabel: "1/2 cumplidas",
          sealedAtLabel: "22 nov",
          bookLabel: "Bet365",
          probability: 0.38,
          fairDecimal: 2.63,
          marketDecimal: 2.75,
          units: 1,
          gameStatus: "FT",
        }}
      >
        <ShareTicketModal />
      </PlatformProvider>,
    );
    expect(settledLostParlayHtml).toContain("data-share-multi-legs");
    expect(settledLostParlayHtml).toContain("Perdido");
    expect(settledLostParlayHtml).toContain("Cumplida");
    expect(settledLostParlayHtml).toContain("Fallada");
    expect(settledLostParlayHtml).toContain("−1.00u");
    expect(settledLostParlayHtml).not.toContain("NaN");
    expect(settledLostParlayHtml).not.toContain("null");
    expect(settledLostParlayHtml).not.toContain("Resultado final verificado");

    const wonParlayWinning = winningContentFromEntry(
      {
        id: "j-parlay-won",
        pickId: "p-parlay-won",
        gameId: "g1",
        leagueLabel: "Multi-Liga",
        matchLabel: "Parlay · 2 selecciones",
        pickLabel: "SF -3.5 · Over 47.5 pts",
        origin: "Propio",
        pickKind: "parlay",
        parlayLegs: [
          {
            gameId: "g1",
            pickId: "p1",
            leagueLabel: "NFL",
            matchLabel: "SF vs MIN · FT 24–14",
            pickLabel: "San Francisco -3.5",
          },
          {
            gameId: "g2",
            pickId: "p2",
            leagueLabel: "NBA",
            matchLabel: "BOS vs NYK · FT 118–110",
            pickLabel: "Más de 218.5 pts",
          },
        ],
        units: 1,
        userDecimal: 3.1,
        fairDecimal: 2.9,
        status: "won",
        sealedAt: "22 nov",
      },
      "9:16",
      "socio",
      "REF12",
    );
    expect(wonParlayWinning.kind).toBe("parlay");
    expect(wonParlayWinning.legs).toEqual([
      "SF vs MIN · FT 24–14: San Francisco -3.5",
      "BOS vs NYK · FT 118–110: Más de 218.5 pts",
    ]);

    expect(redactDatasetForVisitor(sundayDataset).games[3]?.parlayCandidates ?? []).toEqual([]);
  });
});
