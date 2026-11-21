import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import {
  badgeFactsFromEntries,
  computeBadges,
  redundantProfileBadgeIds,
} from "../src/platform/badges";
import { RecordPicksTab, isParlayJournalEntry } from "../src/platform/club/record/RecordPicksTab";
import { ParlayBuilderClubView } from "../src/platform/club/ParlayAndQuantViews";
import { ConfirmActionDialog } from "../src/platform/components/PlatformOverlays";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";
import type { JournalEntry } from "../src/platform/types";

function buildParlayDataset() {
  const mkMatch = (id: string, home: string, away: string): MatchAnalysis => ({
    id,
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 16",
    day: "2030-11-14",
    dayLabel: "jueves",
    kickoffUtc: "2030-11-14T23:00:00Z",
    kickoffLocal: "17:00",
    venue: "Estadio Azteca",
    status: "NS",
    home: { slug: home.toLowerCase(), name: home, shortName: home, code: home.slice(0, 3).toUpperCase(), record: "8G-3E-4P" },
    away: { slug: away.toLowerCase(), name: away, shortName: away, code: away.slice(0, 3).toUpperCase(), record: "5G-4E-6P" },
    x12: [0.55, 0.25, 0.2],
    projection: { home: 1.9, away: 0.9, total: 2.8 },
    outcomes: [
      { key: "home", label: `${home} gana`, probability: 0.55 },
      { key: "draw", label: "Empate", probability: 0.25 },
      { key: "away", label: `${away} gana`, probability: 0.2 },
    ],
    marketGroups: [
      {
        group: "Resultado",
        rows: [
          { market: asMarketKey("1x2"), selection: "home", label: `${home} gana`, p: 0.55, fairOdds: 1.82 },
        ],
      },
      {
        group: "Totales",
        rows: [
          { market: asMarketKey("totals"), selection: "over_2_5", label: "Más de 2.5 goles", p: 0.57, fairOdds: 1.75 },
        ],
      },
    ],
    factors: [],
    trace: [],
  });
  return buildPlatformDataset([
    {
      league: asLeagueId("liga-mx"),
      leagueLabel: "Liga MX",
      sport: "football",
      season: "Apertura",
      roundLabel: "Jornada 16",
      generatedAt: "2030-11-13T18:00:00Z",
      games: [
        mkMatch("mx-p1", "América", "Pumas"),
        mkMatch("mx-p2", "Tigres", "León"),
        mkMatch("mx-p3", "Toluca", "Atlas"),
      ],
      standings: [],
    },
  ]);
}

describe("ADR-054 · Pulido nativo, parlays unificados, Mi récord pierna por pierna e insignias", () => {
  it("computeBadges consolida la familia Top al nivel más alto ganado (mensual supera semanal)", () => {
    const both = computeBadges(
      badgeFactsFromEntries([], { topTenWeeks: 3, topTenMonthly: true }),
      new Date("2026-11-20T12:00:00Z"),
    );
    const topBadges = both.filter((b) => b.family === "top");
    expect(topBadges).toHaveLength(1);
    expect(topBadges[0]?.id).toBe("top-10-mensual");
    expect(topBadges[0]?.earned).toBe(true);

    const weeklyOnly = computeBadges(
      badgeFactsFromEntries([], { topTenWeeks: 2, topTenMonthly: false }),
      new Date("2026-11-20T12:00:00Z"),
    );
    const topWeekly = weeklyOnly.filter((b) => b.family === "top");
    expect(topWeekly).toHaveLength(1);
    expect(topWeekly[0]?.id).toBe("top-10-semanal");
    expect(topWeekly[0]?.label).toContain("×2");
  });

  it("redundantProfileBadgeIds excluye tipster-verificado solo para tipsters", () => {
    expect(redundantProfileBadgeIds(true)).toEqual(["tipster-verificado"]);
    expect(redundantProfileBadgeIds(false)).toEqual([]);
  });

  it("RecordPicksTab renderiza filtros Simples/Parlays y tarjeta de parlay pierna por pierna", () => {
    const singleEntry: JournalEntry = {
      id: "j-1",
      pickId: "p-1",
      gameId: "g-1",
      leagueLabel: "Liga MX",
      matchLabel: "América vs Cruz Azul",
      pickLabel: "América gana",
      origin: "Spacetime Suite",
      units: 1,
      userDecimal: 1.95,
      fairDecimal: 1.85,
      clvPct: 2.8,
      status: "won",
      pickKind: "single",
      sealedAt: "20 nov, 12:00",
    };
    const parlayEntry: JournalEntry = {
      id: "j-parlay-1",
      pickId: "parlay:p-1+p-2+p-3",
      gameId: "g-1",
      leagueLabel: "Combinada Multi-Liga",
      matchLabel: "3 selecciones",
      pickLabel: "América gana + Más de 2.5 goles + Arsenal o Empate",
      origin: "Parlay Combinado",
      units: 1,
      userDecimal: 4.5,
      fairDecimal: 4.1,
      clvPct: 2.1,
      status: "pending",
      pickKind: "parlay",
      parlayLegs: [
        {
          pickId: "p-1",
          gameId: "g-1",
          leagueLabel: "Liga MX",
          matchLabel: "América vs Cruz Azul",
          pickLabel: "América gana",
          market: "1x2",
          selection: "home",
          line: null,
          p: 0.56,
          fairDecimal: 1.79,
        },
        {
          pickId: "p-2",
          gameId: "g-2",
          leagueLabel: "Premier League",
          matchLabel: "Arsenal vs Chelsea",
          pickLabel: "Más de 2.5 goles",
          market: "totals",
          selection: "over",
          line: 2.5,
          p: 0.61,
          fairDecimal: 1.64,
        },
        {
          pickId: "p-3",
          gameId: "g-3",
          leagueLabel: "LaLiga",
          matchLabel: "Real Madrid vs Sevilla",
          pickLabel: "Real Madrid o Empate",
          market: "double_chance",
          selection: "1X",
          line: null,
          p: 0.78,
          fairDecimal: 1.28,
        },
      ],
      parlayLegResults: [
        {
          gameId: "g-1",
          pickId: "p-1",
          status: "won",
          homeScore: 2,
          awayScore: 1,
          settledAt: "2026-11-20T21:00:00Z",
        },
      ],
      sealedAt: "20 nov, 12:15",
    };

    expect(isParlayJournalEntry(singleEntry)).toBe(false);
    expect(isParlayJournalEntry(parlayEntry)).toBe(true);

    const html = renderToStaticMarkup(
      <RecordPicksTab
        journal={[singleEntry, parlayEntry]}
        oddsFormat="decimal"
        watchedGames={[]}
        suggestedUpcoming={[]}
        onToggleWatchlist={() => undefined}
        onNavigateHome={() => undefined}
        onOpenWinningEntry={() => undefined}
        onOpenShareTicket={() => undefined}
      />,
    );

    expect(html).toContain("data-record-kind-filter");
    expect(html).toContain("Simples · 1");
    expect(html).toContain("Parlays · 1");
    expect(html).toContain("Parlay · 3 piernas");
    expect(html).toContain("1/3 cumplidas");
    expect(html).toContain("Ver piernas");
  });

  it("ParlayBuilderClubView unifica el flujo en pestañas Automático / Armar a mano sin duplicar QuickBar", () => {
    const dataset = buildParlayDataset();
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <ParlayBuilderClubView />
      </PlatformProvider>,
    );
    expect(html).toContain("data-parlay-mode-tabs");
    expect(html).toContain("Automático");
    expect(html).toContain("Armar a mano");
    expect(html).toContain("Cuota meta");
    expect(html).toContain("Todas las ligas");
    expect(html).not.toContain("data-personal-parlay-quickbar");
  });

  it("ConfirmActionDialog pone foco seguro en Cancelar y renderiza acción destructiva explícita", () => {
    const html = renderToStaticMarkup(
      <ConfirmActionDialog
        open
        title="¿Vaciar parlay de 3 selecciones?"
        description="Se quitarán todas las selecciones."
        confirmLabel="Vaciar boleto"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("¿Vaciar parlay de 3 selecciones?");
    expect(html).toContain("Cancelar");
    expect(html).toContain("Vaciar boleto");
  });
});
