import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  asLeagueId,
  asMarketKey,
  asTeamId,
  formatOddsCaptureEs,
  type DataHealthReport,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import { AdminDataHealthSection } from "../src/platform/club/AdminDataHealthSection";
import { MatchMarketsGrid } from "../src/platform/club/match/MatchMarketsGrid";
import { PreMatchModule } from "../src/platform/club/match/PreMatchModule";
import { MatchOutlookStrip } from "../src/platform/components/MatchOutlookStrip";
import { MultiPickRow } from "../src/platform/components/MatchTicketCard";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";
import type { MatchOutlookSummary, PlatformMarketRow } from "../src/platform/types";

describe("Hora de captura de momios y panel «Salud de datos»", () => {
  it("muestra la hora exacta de captura en CDMX (24 h) en MatchOutlookStrip, MatchMarketsGrid y MultiPickRow", () => {
    const capturedIso = "2026-11-14T18:30:00Z"; // 12:30 en America/Mexico_City
    const expectedStamp = formatOddsCaptureEs(capturedIso);
    expect(expectedStamp).toContain("12:30");

    const outlook: MatchOutlookSummary = {
      generatedAtUtc: capturedIso,
      mostLikely: { label: "Gana Monterrey", p: 0.51, fairDecimal: 1.96 },
      scorelines: [],
      quality: { flag: "ok", coveragePct: 90 },
      hasRecentQuote: true,
      latestQuote: {
        bookLabel: "Pinnacle",
        capturedAtUtc: capturedIso,
      },
    };

    const stripHtml = renderToStaticMarkup(
      <MatchOutlookStrip outlook={outlook} oddsFormat="decimal" />,
    );
    expect(stripHtml).toContain("Pinnacle");
    expect(stripHtml).toMatch(new RegExp(`datetime="${capturedIso}"`, "i"));
    expect(stripHtml).toContain(expectedStamp);

    const rows: PlatformMarketRow[] = [
      {
        group: "Resultado 1X2",
        market: "1x2",
        selection: "home",
        label: "Monterrey gana",
        p: 0.51,
        fairDecimal: 1.96,
        fairAmerican: -104,
        openDecimal: null,
        currentDecimal: 2.08,
        quoteBookLabel: "Pinnacle",
        quoteCapturedAtUtc: capturedIso,
        edgePts: null,
        cardCategory: "resultado",
        cardTitle: "Resultado 1X2",
        isMostLikely: true,
      },
    ];

    const gridHtml = renderToStaticMarkup(
      <MatchMarketsGrid
        sport="football"
        markets={rows}
        oddsFormat="decimal"
        watermark="PL-TEST"
      />,
    );
    expect(gridHtml).toContain("Casa 2.08");
    expect(gridHtml).toMatch(new RegExp(`datetime="${capturedIso}"`, "i"));
    expect(gridHtml).toContain(expectedStamp);

    // También propaga marketCapturedAtUtc a los picks cuando hay mercado vigente en Spacetime
    const matchFixture: MatchAnalysis = {
      id: "test-capture-game",
      league: asLeagueId("liga-mx"),
      leagueLabel: "Liga MX",
      sport: "football",
      round: "Jornada 16",
      day: "2026-11-15",
      dayLabel: "domingo, 15 de noviembre",
      kickoffUtc: "2026-11-15T23:00:00Z",
      kickoffLocal: "17:00",
      venue: "Estadio BBVA",
      status: "NS",
      home: { slug: "monterrey", name: "Monterrey", shortName: "Monterrey", code: "MTY", record: "15 PJ" },
      away: { slug: "queretaro", name: "Querétaro", shortName: "Querétaro", code: "QRO", record: "15 PJ" },
      projection: { home: 1.8, away: 1.0, total: 2.8 },
      x12: [0.58, 0.22, 0.2],
      marketGroups: [
        {
          group: "Resultado",
          rows: [
            { market: asMarketKey("h2h"), selection: "home", label: "Monterrey gana", p: 0.58, fairOdds: 1.72 },
            { market: asMarketKey("h2h"), selection: "draw", label: "Empate", p: 0.22, fairOdds: 4.55 },
            { market: asMarketKey("h2h"), selection: "away", label: "Querétaro gana", p: 0.2, fairOdds: 5.0 },
          ],
        },
      ],
      outcomes: [
        { key: "home", label: "Monterrey gana", probability: 0.58 },
        { key: "draw", label: "Empate", probability: 0.22 },
        { key: "away", label: "Querétaro gana", probability: 0.2 },
      ],
      factors: [],
      trace: [],
      injuries: {
        home: [
          {
            teamId: asTeamId("liga-mx.monterrey"),
            player: "Germán Berterame",
            position: "DEL",
            status: "Duda",
            detail: "Sobrecarga muscular",
            reportedAt: capturedIso,
          },
        ],
        away: [],
      },
    };

    const dataset = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura 2026",
        roundLabel: "Jornada 16",
        generatedAt: capturedIso,
        games: [matchFixture],
        spacetime: {
          "test-capture-game": {
            engineName: "PitchLab Tachyon v3.0",
            sportsEngineName: "PitchLab Tachyon v3.0",
            probs: { home: 0.58, draw: 0.22, away: 0.2 },
            market: {
              bookLabel: "Pinnacle · 14 nov",
              asOfUtc: capturedIso,
              overround: 1.024,
              noVig: { home: 0.49, draw: 0.26, away: 0.25 },
              odds: { home: 2.05, draw: 3.75, away: 3.9 },
            },
            value: [],
            expectedTotal: 2.8,
            expectedMargin: 0.8,
            drivers: [],
            availability: {
              homeInjured: 1,
              awayInjured: 0,
              homeMissingValuePct: null,
              awayMissingValuePct: null,
            },
            stadium: { name: "Estadio BBVA", elevationM: 515 },
          },
        },
      },
    ]);

    const game = dataset.games[0]!;
    const h2hPick = game.picks.find(
      (p) => p.selectionKey === "home" || p.marketDecimal !== null,
    );
    expect(h2hPick?.marketCapturedAtUtc).toBe(capturedIso);
    expect(h2hPick?.marketBookLabel).toBe("Pinnacle");

    // Verifica que las bajas nominales de injuries.json aparezcan en «Antes del partido»
    expect(game.preGame.absences.some((a) => a.player === "Germán Berterame")).toBe(true);

    const pickAndPreMatchHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <div>
          {h2hPick ? <MultiPickRow pick={h2hPick} gameStatus="NS" /> : null}
          <PreMatchModule
            game={game}
            now={new Date("2026-11-15T20:00:00Z")}
            timeZone="America/Mexico_City"
          />
        </div>
      </PlatformProvider>,
    );
    expect(pickAndPreMatchHtml).toMatch(new RegExp(`datetime="${capturedIso}"`, "i"));
    expect(pickAndPreMatchHtml).toContain("Germán Berterame");
  });

  it("renderiza el panel «Salud de datos» con estado de workflows, último error, matriz de ligas y alineaciones apagadas", () => {
    const emptyDataset = buildPlatformDataset([]);
    const report: DataHealthReport = {
      schemaVersion: 1,
      generatedAtUtc: "2026-11-14T18:00:00Z",
      overallStatus: "critical",
      thresholdsHours: {
        calendario: 30,
        calendarioMatchday: 12,
        bajas: 36,
        momios: 36,
        momiosHardExpire: 72,
        alineaciones: null,
      },
      workflows: [
        {
          workflowId: "odds-refresh",
          label: "Actualización continua de momios",
          workflowFile: ".github/workflows/odds-refresh.yml",
          status: "failed",
          lastRunAtUtc: "2026-11-14T17:55:00Z",
          lastSuccessAtUtc: "2026-11-13T18:00:00Z",
          durationMs: 1420,
          cadenceLabel: "Multi-régimen pre-partido",
          lastError: {
            message: "The Odds API devolvió HTTP 429",
            failingSinceUtc: "2026-11-14T15:00:00Z",
            source: "the_odds_api",
          },
        },
        {
          workflowId: "pre-mvp-snapshot",
          label: "Calendario, resultados y bajas",
          workflowFile: ".github/workflows/pre-mvp-snapshot.yml",
          status: "ok",
          lastRunAtUtc: "2026-11-14T16:30:00Z",
          lastSuccessAtUtc: "2026-11-14T16:30:00Z",
          durationMs: 1769,
          cadenceLabel: "Diario 11:00 UTC + días de partido",
          lastError: null,
        },
      ],
      leagues: [
        {
          league: asLeagueId("nfl"),
          leagueLabel: "NFL",
          cells: {
            calendario: {
              dataType: "calendario",
              status: "ok",
              updatedAtUtc: "2026-11-14T14:00:00Z",
              ageHours: 4.0,
              maxHours: 30,
              sourceLabel: "nflverse",
              recordsCount: 14,
              lastError: null,
            },
            bajas: {
              dataType: "bajas",
              status: "ok",
              updatedAtUtc: "2026-11-14T16:30:00Z",
              ageHours: 1.5,
              maxHours: 36,
              sourceLabel: "nflverse-cc-by-4.0",
              recordsCount: 160,
              lastError: null,
            },
            momios: {
              dataType: "momios",
              status: "stale",
              updatedAtUtc: "2026-11-12T16:00:00Z",
              ageHours: 50.0,
              maxHours: 36,
              sourceLabel: "the_odds_api",
              recordsCount: 0,
              lastError: {
                message: "Cuota vencida (> 36 h)",
                failingSinceUtc: "2026-11-14T04:00:00Z",
              },
            },
            alineaciones: {
              dataType: "alineaciones",
              status: "disabled",
              updatedAtUtc: null,
              ageHours: null,
              maxHours: null,
              sourceLabel: "Apagado (sin fuente verificada)",
              recordsCount: 0,
              note: "Ranura preparada · apagada hasta verificar fuente oficial",
              lastError: null,
            },
          },
        },
      ],
      activeIncidents: [
        {
          incidentKey: "workflow::odds-refresh",
          kind: "workflow_failure",
          severity: "critical",
          targetLabel: "Workflow Momios automáticos",
          workflowId: "odds-refresh",
          message: "The Odds API devolvió HTTP 429",
          failingSinceUtc: "2026-11-14T15:00:00Z",
          lastSeenAtUtc: "2026-11-14T17:55:00Z",
          emailedAtUtc: "2026-11-14T15:00:05Z",
          occurrences: 3,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <AdminDataHealthSection dataset={emptyDataset} storyReport={report} />,
    );

    expect(html).toContain("Salud de datos");
    expect(html).toContain("Actualización continua de momios");
    expect(html).toContain("The Odds API devolvió HTTP 429");
    expect(html).toContain("aviso enviado");
    expect(html).toContain("nflverse-cc-by-4.0");
    expect(html).toContain("160 reg.");
    expect(html).toContain("Apagado");
    expect(html).toContain('data-cell-status="disabled"');
  });
});
