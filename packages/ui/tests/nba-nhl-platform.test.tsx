import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId, snapshotToMatchAnalyses, type LeagueSnapshot } from "@pitchlab/contracts";
import { redactDatasetForVisitor } from "../src/platform/access-guard";
import {
  LeagueHubClubView,
  MatchStudioClubView,
} from "../src/platform/club/CoreMatchViews";
import { HomeClubView } from "../src/platform/club/home/HomeClubView";
import {
  SimAccumulator,
  mulberry32,
  playMatch,
  simulateScore,
} from "../src/platform/club/match/simulation";
import { ConfidenceChip } from "../src/platform/components/ConfidenceChip";
import { HomeMatchCard } from "../src/platform/components/HomeMatchCard";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";

function readSnapshot(league: "nba" | "nhl"): LeagueSnapshot {
  const file = path.resolve(__dirname, `../../../data/snapshots/${league}/latest.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as LeagueSnapshot;
}

describe("Simulación multi-deporte NBA y NHL", () => {
  it("simula basquetbol sin empates y en 4 cuartos", () => {
    const acc = new SimAccumulator("basketball");
    const rng = mulberry32(42);
    const input = { sport: "basketball" as const, homeExpected: 115.8, awayExpected: 109.0, pHome: 0.7 };
    for (let i = 0; i < 200; i += 1) {
      const res = simulateScore(input, rng);
      expect(res.home).not.toBe(res.away);
      acc.add(res);
    }
    const summary = acc.summary();
    expect(summary.draw).toBe(0);
    expect(summary.home + summary.away).toBeCloseTo(1, 5);
    expect(summary.totals[0]!.label).toBe("<180");
    expect(playMatch(input, mulberry32(9)).length).toBe(4);
  });

  it("simula hockey con desempate en prórroga/penales y 3 períodos", () => {
    const acc = new SimAccumulator("ice-hockey");
    const rng = mulberry32(77);
    const input = { sport: "ice-hockey" as const, homeExpected: 2.64, awayExpected: 3.01, pHome: 0.44 };
    for (let i = 0; i < 200; i += 1) {
      const res = simulateScore(input, rng);
      expect(res.home).not.toBe(res.away);
      acc.add(res);
    }
    const summary = acc.summary();
    expect(summary.draw).toBe(0);
    expect(summary.totals[8]!.label).toBe("8+");
    expect(playMatch(input, mulberry32(13)).length).toBe(3);
  });
});

describe("Dataset, estado vacío y vistas NBA y NHL con snapshots reales", () => {
  const nbaSnap = readSnapshot("nba");
  const nhlSnap = readSnapshot("nhl");

  const dataset = buildPlatformDataset([
    {
      league: asLeagueId("nba"),
      leagueLabel: "NBA",
      sport: "basketball",
      season: "2026-27",
      roundLabel: "",
      generatedAt: nbaSnap.updatedAt,
      games: snapshotToMatchAnalyses(nbaSnap).matches,
      standings: [],
    },
    {
      league: asLeagueId("nhl"),
      leagueLabel: "NHL",
      sport: "ice-hockey",
      season: "2026-27",
      roundLabel: "",
      generatedAt: nhlSnap.updatedAt,
      games: snapshotToMatchAnalyses(nhlSnap).matches,
      standings: [],
    },
  ]);

  const nbaScheduled = dataset.games.find(
    (g) => g.league === "nba" && g.status !== "FT" && g.hasForecast !== false,
  )!;
  const nhlScheduled = dataset.games.find(
    (g) => g.league === "nhl" && g.status !== "FT" && g.hasForecast !== false,
  )!;
  const emptyForecastGame = dataset.games.find(
    (g) => (g.league === "nba" || g.league === "nhl") && g.hasForecast === false,
  )!;

  it("construye picks y mercados reales sin empate en NBA/NHL y respeta análisis faltantes", () => {
    expect(nbaScheduled).toBeDefined();
    expect(nhlScheduled).toBeDefined();
    expect(emptyForecastGame).toBeDefined();

    for (const g of [nbaScheduled, nhlScheduled]) {
      expect(g.x12?.[1]).toBe(0);
      expect(g.picks.length).toBeGreaterThan(0);
      expect(g.picks.some((p) => /empate/i.test(p.label))).toBe(false);
      expect(g.markets.some((m) => /empate/i.test(m.label))).toBe(false);
    }

    expect(
      nhlScheduled.factors.some((f) => /tiempo extra/i.test(f.label) && /penales/i.test(f.sub ?? "")),
    ).toBe(true);

    expect(emptyForecastGame.x12).toBeNull();
    expect(emptyForecastGame.projection).toBeNull();
    expect(emptyForecastGame.confidenceScore).toBeNull();
    expect(emptyForecastGame.confidenceLevel).toBeNull();
    expect(emptyForecastGame.picks).toEqual([]);

    const redacted = redactDatasetForVisitor(dataset);
    const redactedEmpty = redacted.games.find((g) => g.id === emptyForecastGame.id)!;
    expect(redactedEmpty.x12).toBeNull();
    expect(redactedEmpty.confidenceScore).toBeNull();
  });

  it("renderiza Inicio, Hub, Ficha NBA, Ficha NHL y estado vacío honesto sin errores", () => {
    const homeHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <HomeClubView />
      </PlatformProvider>,
    );
    expect(homeHtml).toContain("Basquetbol");
    expect(homeHtml).toContain("Hockey");
    expect(homeHtml).toContain("NBA");
    expect(homeHtml).toContain("NHL");
    expect(homeHtml).toContain("Ver partido ·");

    const nbaHubHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <LeagueHubClubView leagueId={nbaScheduled.league} />
      </PlatformProvider>,
    );
    expect(nbaHubHtml).toContain(nbaScheduled.home.name);
    expect(nbaHubHtml).toContain("NBA");
    expect(nbaHubHtml).toContain('id="pl-league-tab-tabla"');
    expect(nbaHubHtml).toContain('id="pl-league-tab-noticias"');
    expect(nbaHubHtml).toContain('data-league-news=""');

    // Aun si llegan partidos FT de un día pasado después de los próximos, los chips respetan orden cronológico.
    const pastFtNba = {
      ...nbaScheduled,
      id: "nba-past-ft-day",
      dayId: "2026-11-14",
      dayLabel: "sábado, 14 de noviembre",
      kickoffUtc: "2026-11-14T23:00:00Z",
      status: "FT" as const,
      score: { home: 110, away: 102 },
    };
    const orderedHubHtml = renderToStaticMarkup(
      <PlatformProvider dataset={{ ...dataset, games: [...dataset.games, pastFtNba] }} initialRole="member">
        <LeagueHubClubView leagueId={nbaScheduled.league} />
      </PlatformProvider>,
    );
    const chip14 = orderedHubHtml.indexOf("sábado, 14 de noviembre (FT)");
    const chip15 = orderedHubHtml.indexOf("domingo, 15 de noviembre");
    expect(chip14).toBeGreaterThan(-1);
    expect(chip15).toBeGreaterThan(chip14);

    const nbaStudioHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <MatchStudioClubView leagueId={nbaScheduled.league} gameId={nbaScheduled.id} />
      </PlatformProvider>,
    );
    expect(nbaStudioHtml).toContain(nbaScheduled.home.name);
    expect(nbaStudioHtml).toContain("Puntos esperados");
    expect(nbaStudioHtml).not.toContain('aria-label="Empate"');
    const scoreIdx = nbaStudioHtml.indexOf("data-match-studio");
    const resumenTabIdx = nbaStudioHtml.indexOf('id="pl-match-tab-resumen"');
    const iaTabIdx = nbaStudioHtml.indexOf('id="pl-match-tab-ia"');
    const aiIdx = nbaStudioHtml.indexOf('data-cortex-card=""');
    expect(scoreIdx).toBeGreaterThan(-1);
    expect(resumenTabIdx).toBeGreaterThan(scoreIdx);
    expect(iaTabIdx).toBeGreaterThan(resumenTabIdx);
    expect(aiIdx).toBeGreaterThan(iaTabIdx);

    const nhlStudioHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <MatchStudioClubView leagueId={nhlScheduled.league} gameId={nhlScheduled.id} />
      </PlatformProvider>,
    );
    expect(nhlStudioHtml).toContain(nhlScheduled.home.name);
    expect(nhlStudioHtml).toContain("Tiempo extra");
    expect(nhlStudioHtml).toContain("se define en tiempo extra o penales");

    // Partido con pronóstico/confianza ausentes (programado sin análisis).
    const noForecastScheduled = {
      ...nbaScheduled,
      id: "nba-no-forecast-test",
      status: "NS" as const,
      hasForecast: false,
      x12: null,
      projection: null,
      confidenceScore: null,
      confidenceLevel: null,
      confidenceDetail: undefined,
      preGame: emptyForecastGame.preGame,
      picks: [],
      markets: [],
    };
    const emptyDs = {
      ...dataset,
      games: [noForecastScheduled],
    };
    const emptyCardHtml = renderToStaticMarkup(
      <PlatformProvider dataset={emptyDs} initialRole="member">
        <HomeMatchCard game={noForecastScheduled} />
        <ConfidenceChip game={noForecastScheduled} />
      </PlatformProvider>,
    );
    expect(emptyCardHtml).toContain("Sin pronóstico publicado");
    expect(emptyCardHtml).toContain("Sin confianza");
    expect(emptyCardHtml).not.toContain("Activar Pase");
    expect(emptyCardHtml).not.toContain("Pase PitchLab Ultra");

    const emptyStudioHtml = renderToStaticMarkup(
      <PlatformProvider dataset={emptyDs} initialRole="member">
        <MatchStudioClubView leagueId={noForecastScheduled.league} gameId={noForecastScheduled.id} />
      </PlatformProvider>,
    );
    expect(emptyStudioHtml).toContain("Sin pronóstico");
    expect(emptyStudioHtml).toContain("Sin lectura publicada");
    expect(emptyStudioHtml).toContain("Aún no hay picks publicados");
    expect(emptyStudioHtml).not.toContain("Simulador del partido");
  });
});
