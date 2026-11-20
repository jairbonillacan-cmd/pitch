import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import {
  buildEnrichedMatchPicks,
  classifyPickGroup,
} from "../src/platform/match-evidence";
import { MatchPicksEvidenceBoard } from "../src/platform/club/match/MatchPicksEvidenceBoard";
import { HomeMatchCard } from "../src/platform/components/HomeMatchCard";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";

function buildEvidenceDataset() {
  const match: MatchAnalysis = {
    id: "test-adr054-ev-1",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 16",
    day: "2030-11-14",
    dayLabel: "jueves",
    kickoffUtc: "2030-11-14T23:00:00Z",
    kickoffLocal: "17:00",
    venue: "Estadio Corregidora",
    referee: "César Ramos",
    status: "NS",
    home: { slug: "queretaro", name: "Querétaro", shortName: "Querétaro", code: "QRO", record: "5G-5E-5P" },
    away: { slug: "monterrey", name: "Rayados de Monterrey", shortName: "Monterrey", code: "MTY", record: "6G-3E-6P" },
    x12: [0.34, 0.26, 0.4],
    projection: { home: 1.4, away: 1.6, total: 3.0 },
    outcomes: [
      { key: "home", label: "Querétaro gana", probability: 0.34 },
      { key: "draw", label: "Empate", probability: 0.26 },
      { key: "away", label: "Monterrey gana", probability: 0.4 },
    ],
    marketGroups: [
      {
        group: "Resultado",
        rows: [
          { market: asMarketKey("1x2"), selection: "home", label: "Querétaro", p: 0.34, fairOdds: 2.94 },
          { market: asMarketKey("1x2"), selection: "draw", label: "Empate", p: 0.26, fairOdds: 3.85 },
          { market: asMarketKey("1x2"), selection: "away", label: "Monterrey", p: 0.4, fairOdds: 2.5 },
        ],
      },
      {
        group: "Totales",
        rows: [
          { market: asMarketKey("totals"), selection: "over_2_5", label: "Más de 2.5 goles", p: 0.58, fairOdds: 1.72 },
        ],
      },
      {
        group: "Ambos anotan",
        rows: [
          { market: asMarketKey("btts"), selection: "yes", label: "Ambos anotan: Sí", p: 0.62, fairOdds: 1.61 },
        ],
      },
    ],
    factors: [
      { label: "Forma local", detail: "", impact: "", value: "G-E-G-P-G · 3-1", sub: "8 goles a favor" },
      { label: "Forma visitante", detail: "", impact: "", value: "G-G-P-E-G · 3-1", sub: "9 goles a favor" },
    ],
    trace: [],
    headToHead: [
      { date: "2026-04-12", home: "Monterrey", away: "Querétaro", homeGoals: 2, awayGoals: 1 },
      { date: "2025-09-20", home: "Querétaro", away: "Monterrey", homeGoals: 2, awayGoals: 2 },
      { date: "2025-02-08", home: "Monterrey", away: "Querétaro", homeGoals: 3, awayGoals: 1 },
    ],
  };
  return buildPlatformDataset([
    {
      league: asLeagueId("liga-mx"),
      leagueLabel: "Liga MX",
      sport: "football",
      season: "Apertura",
      roundLabel: "Jornada 16",
      generatedAt: "2030-11-13T18:00:00Z",
      games: [match],
      standings: [],
    },
  ]);
}

describe("ADR-054 · Evidencia verificable en picks (ScoutPicks/Bzzoiro) y retiro de Conf. N", () => {
  it("classifyPickGroup agrupa mercados en las 5 categorías editoriales", () => {
    expect(classifyPickGroup({ market: "1x2", label: "Local gana", marketGroup: "Resultado" })).toBe("resultado");
    expect(classifyPickGroup({ market: "double_chance", label: "Local o Empate", marketGroup: "Doble oportunidad" })).toBe("resultado");
    expect(classifyPickGroup({ market: "totals", label: "Más de 2.5 goles", marketGroup: "Totales" })).toBe("goles");
    expect(classifyPickGroup({ market: "btts", label: "Ambos anotan: Sí", marketGroup: "Ambos anotan" })).toBe("ambos");
    expect(classifyPickGroup({ market: "corners_total", label: "Más de 9.5 córners", marketGroup: "Córners" })).toBe("conteos");
    expect(classifyPickGroup({ market: "handicap", label: "Local -1.5", marketGroup: "Hándicap" })).toBe("otros");
  });

  it("buildEnrichedMatchPicks adjunta evidencia real verificable (H2H / forma / proyección)", () => {
    const dataset = buildEvidenceDataset();
    const game = dataset.games[0]!;
    const enriched = buildEnrichedMatchPicks(game, game.markets);
    expect(enriched.length).toBeGreaterThan(0);
    for (const item of enriched) {
      expect(item.evidence.length).toBeGreaterThan(0);
      expect(["resultado", "goles", "ambos", "conteos", "otros"]).toContain(item.groupKey);
    }
  });

  it("MatchPicksEvidenceBoard renderiza secciones agrupadas, barra de filtros y columna de Evidencia sin Conf. N", () => {
    const dataset = buildEvidenceDataset();
    const game = dataset.games[0]!;
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <MatchPicksEvidenceBoard game={game} markets={game.markets} />
      </PlatformProvider>,
    );
    expect(html).toContain("data-evidence-board");
    expect(html).toContain("Picks y evidencia del modelo");
    expect(html).toContain("Evidencia");
    expect(html).toContain("Momio justo");
    expect(html).toContain("3/3 · últimos enfrentamientos H2H");
    expect(html).not.toContain("Conf.");
    expect(html).not.toContain("Datos completos");
    expect(html).not.toContain("Datos parciales");
  });

  it("HomeMatchCard no renderiza Conf. N ni chips de cobertura de datos", () => {
    const dataset = buildEvidenceDataset();
    const game = dataset.games[0]!;
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <HomeMatchCard game={game} />
      </PlatformProvider>,
    );
    expect(html).not.toContain("data-confidence-chip");
    expect(html).not.toContain("Conf.");
    expect(html).not.toContain("Datos completos");
    expect(html).not.toContain("Datos parciales");
  });
});
