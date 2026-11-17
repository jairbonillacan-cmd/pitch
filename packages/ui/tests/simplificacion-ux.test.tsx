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
import { CompactMatchRow } from "../src/platform/components/CompactMatchRow";
import { DailyResultsCalendar } from "../src/platform/components/DailyResultsCalendar";
import { DualStatComparisonCard } from "../src/platform/components/DualStatComparisonCard";
import { LivePicksTrackerStrip } from "../src/platform/components/LivePicksTrackerStrip";
import { LensGlowOrbs } from "../src/platform/components/MaestroPrimitives";
import { HomeClubView } from "../src/platform/club/home/HomeClubView";
import { LeagueHubClubView, MatchStudioClubView } from "../src/platform/club/CoreMatchViews";
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

describe("Simplificación UX/UI y nuevas funciones", () => {
  it("convierte LensGlowOrbs en un no-op limpio en modo sólido", () => {
    const html = renderToStaticMarkup(<LensGlowOrbs primaryColor="var(--pl-brand)" />);
    expect(html).toBe("");
  });

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
    // Nov 1 2026 es domingo -> la primera celda del lunes es 2026-10-26
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
    expect(html).toContain("1 ab.");
    expect(html).not.toContain("pendie");
  });

  it("construye el calendario de Resultados del motor sin inventar unidades de apuesta", () => {
    const modelGrid = buildModelDailyCalendar(
      [
        {
          id: "m1",
          kickoffUtc: "2026-11-14T19:00:00Z",
          label: "Arsenal 2–0 Chelsea",
          subtitle: "Premier League · Arsenal gana",
          hit: true,
        },
        {
          id: "m2",
          kickoffUtc: "2026-11-14T21:00:00Z",
          label: "Lazio 1–1 Lecce",
          subtitle: "Serie A · Lazio gana",
          hit: false,
        },
      ],
      "2026-11",
      { nowIso: "2026-11-17T18:00:00Z" },
    );
    expect(modelGrid.summary.settledCount).toBe(2);
    expect(modelGrid.summary.wonCount).toBe(1);
    expect(modelGrid.summary.lostCount).toBe(1);
    expect(modelGrid.summary.netUnits).toBe(0);
  });

  it("calcula el progreso en vivo de picks abiertos para goles, córners y ambos anotan y renderiza <progress>", () => {
    const baseEntry: JournalEntry = {
      id: "j1",
      pickId: "p1",
      gameId: "lmx-caz-mty",
      leagueLabel: "Liga MX",
      matchLabel: "Cruz Azul vs Monterrey",
      pickLabel: "Más de 2.5 goles",
      origin: "Spacetime Suite",
      units: 1,
      userDecimal: 1.95,
      fairDecimal: 1.8,
      clvPct: 4,
      status: "pending",
      sealedAt: "17/11/2026",
    };

    const sbEntry = {
      gameId: "lmx-caz-mty",
      league: "liga-mx",
      phase: "live" as const,
      clock: "64",
      minute: 64,
      score: { home: 2, away: 0 },
      htScore: { home: 1, away: 0 },
      redCards: null,
      kickoffUtc: "2026-11-17T21:00:00Z",
    };

    const goalsProg = computeLivePickProgress({
      entry: baseEntry,
      game: DATASET.games[0],
      scoreboardEntry: sbEntry,
    });
    expect(goalsProg?.statusText).toBe("Van 2 de 3 goles");
    expect(goalsProg?.currentValue).toBe(2);
    expect(goalsProg?.targetValue).toBe(3);

    const detailWithStats: LiveMatchDetail = {
      gameId: "lmx-caz-mty",
      generatedAt: "2026-11-17T22:04:00Z",
      sourceFetchedAt: "2026-11-17T22:04:00Z",
      entry: sbEntry,
      incidents: [],
      stats: {
        home: {
          xg: 1.6,
          shots: 11,
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
    expect(cornersProg?.statusText).toBe("Van 8 de 9 córners");
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

  it("renderiza CompactMatchRow y DualStatComparisonCard con atributos accesibles y estado seleccionado", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <CompactMatchRow
          game={DATASET.games[0]!}
          selected
          homeForm={["G", "E", "G", "P", "G"]}
          awayForm={["P", "G", "E", "G", "G"]}
        />
        <DualStatComparisonCard
          dataCountCard="goals"
          label="Goles esperados"
          badgeText="Total 3.0"
          homeLabel="Cruz Azul"
          awayLabel="Monterrey"
          homeValueText="1.9"
          awayValueText="1.1"
          homeNumeric={1.9}
          awayNumeric={1.1}
        />
      </PlatformProvider>,
    );
    expect(html).toContain('data-game-card="lmx-caz-mty"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain("Agregar al parlay");
    expect(html).toContain('data-count-card="goals"');
    expect(html).toContain("Total 3.0");
  });

  it("normaliza las 9 casas autorizadas de Bzzoiro y convierte momios manuales americanos y decimales", () => {
    expect(BOOKMAKER_OPTIONS).toHaveLength(9);
    expect(sanitizePreferredBooks(["BET365", "williamhill", "casa_falsa"])).toEqual([
      "bet365",
      "william_hill",
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

  it("integra tira de momios 1·X·2 en CompactMatchRow, Inicio Maestro-Detalle, Hub de Liga y Ficha de Partido con insignias Pronto", () => {
    const inlineHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <CompactMatchRow game={DATASET.games[0]!} showInlineOdds />
      </PlatformProvider>,
    );
    expect(inlineHtml).toContain('data-inline-odds=""');

    const homeHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <HomeClubView initialToday="2026-11-17" liveBoardOverride={null} />
      </PlatformProvider>,
    );
    expect(homeHtml).toContain('data-odds-switch=""');
    expect(homeHtml).toContain('data-regulation-odds=""');
    expect(homeHtml).toContain("Ver partido ·");

    const leagueHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <LeagueHubClubView leagueId={asLeagueId("liga-mx")} />
      </PlatformProvider>,
    );
    expect(leagueHtml).toContain("pl-season-progress-bar");
    expect(leagueHtml).toContain('data-league-featured-match="lmx-caz-mty"');
    expect(leagueHtml).toContain("Eliminatorias · Pronto");

    const studioHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <MatchStudioClubView leagueId={asLeagueId("liga-mx")} gameId="lmx-caz-mty" />
      </PlatformProvider>,
    );
    expect(studioHtml).toContain('data-studio-reg-odds=""');
    expect(studioHtml).toContain("Pizarra táctica 2D y Mapa de calor");
  });
});
