import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId, asMarketKey, type LiveMatchDetail } from "@pitchlab/contracts";
import {
  BOOKMAKER_OPTIONS,
  parseManualOddsInput,
  resolvePreferredBookQuote,
  sanitizePreferredBooks,
} from "../src/platform/bookmakers";
import { DailyResultsCalendar } from "../src/platform/components/DailyResultsCalendar";
import { LivePicksTrackerStrip } from "../src/platform/components/LivePicksTrackerStrip";
import { HistorialClubView } from "../src/platform/club/HistorialClubView";
import { PicksFinderClubView } from "../src/platform/club/PicksFinderView";
import { computeLivePickProgress } from "../src/platform/live/live-pick-progress";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";
import {
  buildModelDailyCalendar,
  buildMonthlyRecordCalendar,
  shiftYearMonth,
} from "../src/platform/record-stats";
import { makeStoryMatch } from "../src/platform/story-fixtures";
import type { JournalEntry } from "../src/platform/types";

const DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura 2026",
    roundLabel: "Jornada 17",
    generatedAt: "2026-11-17T12:00:00Z",
    games: [
      {
        ...makeStoryMatch({
          id: "lmx-caz-mty",
          league: "liga-mx",
          leagueLabel: "Liga MX",
          sport: "football",
          status: "NS",
          homeSlug: "cruz-azul",
          homeName: "Cruz Azul",
          homeCode: "CAZ",
          awaySlug: "monterrey",
          awayName: "Monterrey",
          awayCode: "MTY",
          x12: [0.54, 0.25, 0.21],
          proj: { home: 1.9, away: 1.1, total: 3.0 },
        }),
        marketGroups: [
          {
            group: "Resultado",
            rows: [
              {
                market: asMarketKey("h2h"),
                selection: "home",
                label: "Cruz Azul gana",
                p: 0.54,
                fairOdds: 1.85,
              },
            ],
          },
        ],
      },
    ],
  },
]);

describe("Nuevas funciones en gemini-dos (sin simplificación de UX/UI)", () => {
  it("construye el calendario mensual lun…dom con unidades netas y conteo de abiertos sin truncar", () => {
    const grid = buildMonthlyRecordCalendar(
      [
        {
          id: "e1",
          status: "won",
          units: 2,
          userDecimal: 2.2,
          fairDecimal: 2.0,
          clvPct: 5,
          leagueLabel: "Liga MX",
          pickLabel: "Cruz Azul gana",
          origin: "Spacetime Suite",
          settledAtIso: "2026-11-14T20:00:00Z",
        },
        {
          id: "e2",
          status: "lost",
          units: 1,
          userDecimal: 1.9,
          fairDecimal: 1.85,
          clvPct: 1,
          leagueLabel: "NFL",
          pickLabel: "KC gana",
          origin: "Spacetime Suite",
          settledAtIso: "2026-11-15T20:00:00Z",
        },
        {
          id: "e3",
          status: "pending",
          units: 1.5,
          userDecimal: 1.95,
          fairDecimal: 1.82,
          clvPct: 3,
          leagueLabel: "Premier League",
          pickLabel: "Más de 2.5 goles",
          origin: "Spacetime Suite",
          sealedAtIso: "2026-11-17T16:00:00Z",
        },
      ],
      "2026-11",
      { nowIso: "2026-11-17T18:00:00Z", timeZone: "America/Mexico_City" },
    );

    expect(grid.yearMonth).toBe("2026-11");
    expect(grid.monthLabel).toBe("Noviembre 2026");
    expect(grid.weeks[0]![0]!.dateIso).toBe("2026-10-26");
    expect(grid.summary.wonCount).toBe(1);
    expect(grid.summary.lostCount).toBe(1);
    expect(grid.summary.openCount).toBe(1);
    expect(grid.summary.netUnits).toBeCloseTo(1.4, 2);
    expect(shiftYearMonth("2026-11", 2)).toBe("2027-01");

    const html = renderToStaticMarkup(
      <DailyResultsCalendar
        buildMonth={() => grid}
        initialYearMonth="2026-11"
        todayYearMonth="2026-11"
        todayDateIso="2026-11-17"
      />,
    );
    expect(html).toContain('role="grid"');
    expect(html).toContain("+2.4u");
    expect(html).toContain("−1.0u");
    expect(html).toContain("1 abierto");
  });

  it("construye el calendario de resultados del motor con porcentaje diario de aciertos", () => {
    const modelGrid = buildModelDailyCalendar(
      [
        {
          id: "g1",
          kickoffUtc: "2026-11-16T20:00:00Z",
          label: "CAZ 2–1 MTY",
          subtitle: "Liga MX · CAZ gana",
          hit: true,
        },
        {
          id: "g2",
          kickoffUtc: "2026-11-16T22:00:00Z",
          label: "AME 0–0 TIG",
          subtitle: "Liga MX · Más de 2.5",
          hit: false,
        },
      ],
      "2026-11",
      { nowIso: "2026-11-17T18:00:00Z", timeZone: "America/Mexico_City" },
    );
    expect(modelGrid.summary.wonCount).toBe(1);
    expect(modelGrid.summary.lostCount).toBe(1);
  });

  it("calcula el progreso en vivo de picks abiertos (goles, córners y tarjetas) y renderiza <progress>", () => {
    const baseEntry: JournalEntry = {
      id: "j-live-1",
      pickId: "lmx-caz-mty__p1",
      gameId: "lmx-caz-mty",
      leagueLabel: "Liga MX",
      matchLabel: "Cruz Azul vs Monterrey",
      pickLabel: "Más de 2.5 goles",
      origin: "Spacetime Suite",
      units: 1,
      userDecimal: 1.95,
      fairDecimal: 1.8,
      clvPct: 4.5,
      status: "pending",
      sealedAt: "17/11/2026 12:00",
      sealedAtIso: "2026-11-17T18:00:00Z",
    };

    const sbEntry = {
      gameId: "lmx-caz-mty",
      league: "liga-mx" as const,
      phase: "live" as const,
      clock: "58",
      minute: 58,
      score: { home: 2, away: 0 },
      htScore: { home: 1, away: 0 },
      redCards: null,
      kickoffUtc: "2026-11-17T20:00:00Z",
    };

    const goalsProg = computeLivePickProgress({
      entry: baseEntry,
      game: DATASET.games[0],
      scoreboardEntry: sbEntry,
      detail: null,
    });
    expect(goalsProg).not.toBeNull();
    expect(goalsProg?.currentValue).toBe(2);
    expect(goalsProg?.targetValue).toBe(3);
    expect(goalsProg?.statusText).toBe("Falta 1 gol");
    expect(goalsProg?.progressRatioLabel).toBe("2 / 2.5 goles");

    const pluralGoalsProg = computeLivePickProgress({
      entry: { ...baseEntry, pickLabel: "Más de 3.5 goles" },
      game: DATASET.games[0],
      scoreboardEntry: sbEntry,
      detail: null,
    });
    expect(pluralGoalsProg?.statusText).toBe("Faltan 2 goles");

    const detailWithStats: LiveMatchDetail = {
      gameId: "lmx-caz-mty",
      generatedAt: "2026-11-17T22:04:00Z",
      sourceFetchedAt: "2026-11-17T22:04:00Z",
      entry: sbEntry,
      incidents: [],
      stats: {
        home: {
          xg: 1.4,
          shots: 10,
          shotsOnTarget: 5,
          corners: 5,
          possessionPct: 58,
          fouls: 7,
          yellowCards: 1,
          redCards: 0,
          offsides: 1,
          bigChances: 2,
        },
        away: {
          xg: 0.7,
          shots: 6,
          shotsOnTarget: 2,
          corners: 3,
          possessionPct: 42,
          fouls: 9,
          yellowCards: 2,
          redCards: 0,
          offsides: 2,
          bigChances: 0,
        },
      },
      xgEstimated: false,
      momentum: [],
      xgTimeline: [],
      shots: [],
      nextPollSeconds: 30,
      notice: null,
      attribution: "Bzzoiro",
    };

    const cornersProg = computeLivePickProgress({
      entry: { ...baseEntry, pickLabel: "Más de 8.5 córners" },
      game: DATASET.games[0],
      scoreboardEntry: sbEntry,
      detail: detailWithStats,
    });
    expect(cornersProg?.statusText).toBe("Falta 1 córner");
    expect(cornersProg?.progressRatioLabel).toBe("8 / 8.5 córners");
    expect(cornersProg?.currentValue).toBe(8);
    expect(cornersProg?.targetValue).toBe(9);

    const stripHtml = renderToStaticMarkup(
      <LivePicksTrackerStrip
        journal={[baseEntry]}
        games={DATASET.games}
        overrideScoreboard={[sbEntry]}
      />,
    );
    expect(stripHtml).toContain("<progress");
    expect(stripHtml).toContain('value="2"');
    expect(stripHtml).toContain('max="3"');
  });

  it("normaliza las casas autorizadas (incluyendo MX/LATAM) y convierte momios manuales americanos y decimales", () => {
    expect(BOOKMAKER_OPTIONS.length).toBeGreaterThanOrEqual(15);
    expect(sanitizePreferredBooks(["BET365", "williamhill", "betcris", "BetMGM", "casa_falsa"])).toEqual([
      "bet365",
      "william_hill",
      "betcris",
      "betmgm",
    ]);

    const best = resolvePreferredBookQuote(
      [
        { book: "codere", bookLabel: "Codere", decimal: 1.9, capturedAtUtc: "2026-11-17T10:00:00Z" },
        { book: "bet365", bookLabel: "Bet365", decimal: 2.05, capturedAtUtc: "2026-11-17T10:00:00Z" },
        { book: "pinnacle", bookLabel: "Pinnacle", decimal: 2.12, capturedAtUtc: "2026-11-17T10:00:00Z" },
      ],
      ["codere", "bet365"],
    );
    expect(best?.book).toBe("bet365");
    expect(best?.decimal).toBe(2.05);

    expect(parseManualOddsInput("-110")).toBeCloseTo(1.909, 2);
    expect(parseManualOddsInput("+125")).toBeCloseTo(2.25, 2);
    expect(parseManualOddsInput("1.95")).toBeCloseTo(1.95, 2);
    expect(parseManualOddsInput("abc")).toBeNull();
  });

  it("expone el rail derecho de filtros, selector de casas y comparador manual en Explorar picks y Lista|Calendario en Historial", () => {
    const finderHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <PicksFinderClubView />
      </PlatformProvider>,
    );
    expect(finderHtml).toContain('data-picks-filter-rail=""');
    expect(finderHtml).toContain('data-picks-only-recommended=""');
    expect(finderHtml).toContain("data-quick-book=");
    expect(finderHtml).toContain("data-open-manual-odds=");

    const histHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <HistorialClubView />
      </PlatformProvider>,
    );
    expect(histHtml).toContain('data-historial-view-toggle=""');
  });
});
