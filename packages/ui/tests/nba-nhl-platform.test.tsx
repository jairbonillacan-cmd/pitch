import { Writable } from "node:stream";
import React from "react";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

async function renderHtmlAsync(element: React.ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      },
    });
    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(writable);
      },
      onError(err) {
        reject(err);
      },
    });
    writable.on("finish", () =>
      resolve(Buffer.concat(chunks).toString("utf8").replace(/<!--\s*-->/g, "")),
    );
    writable.on("error", reject);
  });
}
import {
  LeagueSnapshotSchema,
  asLeagueId,
  snapshotToMatchAnalyses,
  type LeagueSnapshot,
} from "@pitchlab/contracts";
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
import type { PlatformDataset, PlatformGame } from "../src/platform/types";

const FROZEN_NOW = new Date("2026-11-15T18:00:00Z");

function buildNbaSnapshotFixture(): LeagueSnapshot {
  return LeagueSnapshotSchema.parse({
    schemaVersion: 1,
    league: "nba",
    season: "nba-2026-27",
    seasonLabel: "Temporada 2026-27",
    periodLabel: "14 nov – 17 nov",
    updatedAt: "2026-11-15T14:00:00.000Z",
    source: "bzzoiro",
    provenance: "derived",
    isDemo: false,
    teamRates: {
      "nba.new-orleans-pelicans": {
        teamId: "nba.new-orleans-pelicans",
        name: "New Orleans Pelicans",
        shortName: "Pelicans",
        code: "NOP",
        forPerGame: 109.2,
        againstPerGame: 114.6,
        gamesPlayed: 12,
        adjustedFor: 109.2,
        adjustedAgainst: 114.6,
      },
      "nba.denver-nuggets": {
        teamId: "nba.denver-nuggets",
        name: "Denver Nuggets",
        shortName: "Nuggets",
        code: "DEN",
        forPerGame: 117.4,
        againstPerGame: 111.8,
        gamesPlayed: 12,
        adjustedFor: 117.4,
        adjustedAgainst: 111.8,
      },
      "nba.phoenix-suns": {
        teamId: "nba.phoenix-suns",
        name: "Phoenix Suns",
        shortName: "Suns",
        code: "PHX",
        forPerGame: 112.3,
        againstPerGame: 113.1,
        gamesPlayed: 11,
        adjustedFor: 112.3,
        adjustedAgainst: 113.1,
      },
      "nba.los-angeles-lakers": {
        teamId: "nba.los-angeles-lakers",
        name: "Los Angeles Lakers",
        shortName: "Lakers",
        code: "LAL",
        forPerGame: 116.0,
        againstPerGame: 111.5,
        gamesPlayed: 13,
        adjustedFor: 116.0,
        adjustedAgainst: 111.5,
      },
      "nba.boston-celtics": {
        teamId: "nba.boston-celtics",
        name: "Boston Celtics",
        shortName: "Celtics",
        code: "BOS",
        forPerGame: 118.1,
        againstPerGame: 108.4,
        gamesPlayed: 12,
        adjustedFor: 118.1,
        adjustedAgainst: 108.4,
      },
      "nba.miami-heat": {
        teamId: "nba.miami-heat",
        name: "Miami Heat",
        shortName: "Heat",
        code: "MIA",
        forPerGame: 110.5,
        againstPerGame: 111.0,
        gamesPlayed: 12,
        adjustedFor: 110.5,
        adjustedAgainst: 111.0,
      },
    },
    games: [
      {
        id: "nba-2026-11-15-den-nop",
        league: "nba",
        season: "nba-2026-27",
        startTime: "2026-11-15T00:00:00.000Z",
        status: "final",
        home: {
          id: "nba.new-orleans-pelicans",
          league: "nba",
          name: "New Orleans Pelicans",
          shortName: "Pelicans",
          code: "NOP",
        },
        away: {
          id: "nba.denver-nuggets",
          league: "nba",
          name: "Denver Nuggets",
          shortName: "Nuggets",
          code: "DEN",
        },
        neutralSite: false,
        result: {
          home: 108,
          away: 116,
          observedAt: "2026-11-15T03:00:00.000Z",
          source: "bzzoiro",
        },
      },
      {
        id: "nba-2026-11-15-lal-phx",
        league: "nba",
        season: "nba-2026-27",
        startTime: "2026-11-15T20:00:00.000Z",
        status: "scheduled",
        home: {
          id: "nba.phoenix-suns",
          league: "nba",
          name: "Phoenix Suns",
          shortName: "Suns",
          code: "PHX",
        },
        away: {
          id: "nba.los-angeles-lakers",
          league: "nba",
          name: "Los Angeles Lakers",
          shortName: "Lakers",
          code: "LAL",
        },
        neutralSite: false,
      },
      {
        id: "nba-2026-11-16-mia-bos",
        league: "nba",
        season: "nba-2026-27",
        startTime: "2026-11-17T00:30:00.000Z",
        status: "scheduled",
        home: {
          id: "nba.boston-celtics",
          league: "nba",
          name: "Boston Celtics",
          shortName: "Celtics",
          code: "BOS",
        },
        away: {
          id: "nba.miami-heat",
          league: "nba",
          name: "Miami Heat",
          shortName: "Heat",
          code: "MIA",
        },
        neutralSite: false,
      },
    ],
    analyses: {
      "nba-2026-11-15-lal-phx": {
        game: "nba-2026-11-15-lal-phx",
        model: {
          id: "pitchlab-ratings-nba",
          version: "1.0.0",
          status: "candidate",
          label: "Modelo PitchLab · en validación",
        },
        projection: {
          home: 112.3,
          away: 116.0,
          total: 228.3,
          margin: -3.7,
        },
        x12: [0.388, 0, 0.612],
        probabilities: [
          { market: "h2h", selection: "Suns gana", p: 0.388, fairOdds: 2.577 },
          { market: "h2h", selection: "Lakers gana", p: 0.612, fairOdds: 1.634 },
        ],
        marketGroups: [
          {
            group: "Ganador",
            rows: [
              { market: "h2h", selection: "home", label: "Suns gana", p: 0.388, fairOdds: 2.577 },
              { market: "h2h", selection: "away", label: "Lakers gana", p: 0.612, fairOdds: 1.634 },
            ],
          },
          {
            group: "Spread PHX +3.5",
            rows: [
              { market: "spreads", selection: "home", label: "PHX cubre", line: 3.5, p: 0.494, fairOdds: 2.024 },
              { market: "spreads", selection: "away", label: "LAL cubre", line: -3.5, p: 0.506, fairOdds: 1.976 },
            ],
          },
          {
            group: "Total 228.5",
            rows: [
              { market: "totals", selection: "over", label: "Más", line: 228.5, p: 0.535, fairOdds: 1.869 },
              { market: "totals", selection: "under", label: "Menos", line: 228.5, p: 0.465, fairOdds: 2.151 },
            ],
          },
          {
            group: "Puntos por equipo",
            rows: [
              { market: "team_totals", selection: "home_over", label: "PHX más de 112.5", line: 112.5, p: 0.494, fairOdds: 2.024 },
              { market: "team_totals", selection: "away_over", label: "LAL más de 115.5", line: 115.5, p: 0.525, fairOdds: 1.905 },
            ],
          },
        ],
        factors: [
          { key: "home_projection", label: "Local", value: "112.3 pts proyectados", detail: "11 partidos esta temporada" },
          { key: "away_projection", label: "Visitante", value: "116.0 pts proyectados", detail: "13 partidos esta temporada" },
          { key: "rest", label: "Descanso", value: "PHX: 1 día de descanso", detail: "LAL: 2 días de descanso" },
        ],
        steps: [
          "Sincronizando NBA · corte 15 nov 2026, 14:00",
          "Ataque y defensa actualizados partido a partido",
          "Localía y descanso incluidos",
          "Proyección 112.3 – 116.0 · margen -3.7",
          "Simulando escenarios de margen y total",
          "8 mercados listos",
        ],
        inputsAsOf: "2026-11-15T14:00:00.000Z",
        publishedAt: "2026-11-15T14:00:00.000Z",
        source: "pitchlab",
        picks: [
          { profile: "intermedia", market: "h2h", selection: "away", label: "Lakers gana", p: 0.612, fairOdds: 1.634 },
          { profile: "arriesgada", market: "team_totals", selection: "away_over", label: "LAL más de 115.5", line: 115.5, p: 0.525, fairOdds: 1.905 },
        ],
        confidence: { score: 56, level: "media", reasons: ["Muestra suficiente"] },
        insights: {
          why: [
            "Lakers gana en 61 % de los escenarios, por 3.7 puntos en promedio.",
            "Se esperan 228.3 pts: 112.3 de Suns y 116.0 de Lakers.",
          ],
        },
      },
    },
    standings: [
      {
        teamId: "nba.los-angeles-lakers",
        name: "Los Angeles Lakers",
        shortName: "Lakers",
        code: "LAL",
        played: 16,
        won: 13,
        drawn: 0,
        lost: 3,
        goalsFor: 1934,
        goalsAgainst: 1831,
        points: 26,
        conference: "Oeste",
        division: "Pacífico",
        winPct: 0.813,
        gamesBehind: "-",
        seed: 1,
        form: ["W", "W", "W", "W", "L"],
      },
      {
        teamId: "nba.boston-celtics",
        name: "Boston Celtics",
        shortName: "Celtics",
        code: "BOS",
        played: 15,
        won: 11,
        drawn: 0,
        lost: 4,
        goalsFor: 1771,
        goalsAgainst: 1626,
        points: 22,
        conference: "Este",
        division: "Atlántico",
        winPct: 0.733,
        gamesBehind: "1.0",
        seed: 1,
        form: ["W", "L", "W", "W", "W"],
      },
    ],
  });
}

function buildNhlSnapshotFixture(): LeagueSnapshot {
  return LeagueSnapshotSchema.parse({
    schemaVersion: 1,
    league: "nhl",
    season: "nhl-2026-27",
    seasonLabel: "Temporada 2026-27",
    periodLabel: "14 nov – 17 nov",
    updatedAt: "2026-11-15T14:00:00.000Z",
    source: "bzzoiro",
    provenance: "derived",
    isDemo: false,
    teamRates: {
      "nhl.carolina-hurricanes": {
        teamId: "nhl.carolina-hurricanes",
        name: "Carolina Hurricanes",
        shortName: "Hurricanes",
        code: "CAR",
        forPerGame: 4.14,
        againstPerGame: 2.24,
        gamesPlayed: 21,
        adjustedFor: 4.14,
        adjustedAgainst: 2.24,
      },
      "nhl.seattle-kraken": {
        teamId: "nhl.seattle-kraken",
        name: "Seattle Kraken",
        shortName: "Kraken",
        code: "SEA",
        forPerGame: 2.85,
        againstPerGame: 3.15,
        gamesPlayed: 20,
        adjustedFor: 2.85,
        adjustedAgainst: 3.15,
      },
      "nhl.philadelphia-flyers": {
        teamId: "nhl.philadelphia-flyers",
        name: "Philadelphia Flyers",
        shortName: "Flyers",
        code: "PHI",
        forPerGame: 2.64,
        againstPerGame: 2.95,
        gamesPlayed: 21,
        adjustedFor: 2.64,
        adjustedAgainst: 2.95,
      },
      "nhl.edmonton-oilers": {
        teamId: "nhl.edmonton-oilers",
        name: "Edmonton Oilers",
        shortName: "Oilers",
        code: "EDM",
        forPerGame: 3.31,
        againstPerGame: 2.68,
        gamesPlayed: 20,
        adjustedFor: 3.31,
        adjustedAgainst: 2.68,
      },
    },
    games: [
      {
        id: "nhl-2026-11-14-sea-car",
        league: "nhl",
        season: "nhl-2026-27",
        startTime: "2026-11-14T18:00:00.000Z",
        status: "final",
        home: {
          id: "nhl.carolina-hurricanes",
          league: "nhl",
          name: "Carolina Hurricanes",
          shortName: "Hurricanes",
          code: "CAR",
        },
        away: {
          id: "nhl.seattle-kraken",
          league: "nhl",
          name: "Seattle Kraken",
          shortName: "Kraken",
          code: "SEA",
        },
        neutralSite: false,
        result: {
          home: 5,
          away: 1,
          observedAt: "2026-11-14T21:00:00.000Z",
          source: "bzzoiro",
        },
      },
      {
        id: "nhl-2026-11-16-edm-phi",
        league: "nhl",
        season: "nhl-2026-27",
        startTime: "2026-11-16T00:00:00.000Z",
        status: "scheduled",
        home: {
          id: "nhl.philadelphia-flyers",
          league: "nhl",
          name: "Philadelphia Flyers",
          shortName: "Flyers",
          code: "PHI",
        },
        away: {
          id: "nhl.edmonton-oilers",
          league: "nhl",
          name: "Edmonton Oilers",
          shortName: "Oilers",
          code: "EDM",
        },
        neutralSite: false,
      },
    ],
    analyses: {
      "nhl-2026-11-16-edm-phi": {
        game: "nhl-2026-11-16-edm-phi",
        model: {
          id: "pitchlab-ratings-nhl",
          version: "1.0.0",
          status: "candidate",
          label: "Modelo PitchLab · en validación",
        },
        projection: {
          home: 2.64,
          away: 3.01,
          total: 5.65,
          margin: -0.37,
        },
        x12: [0.439, 0, 0.561],
        probabilities: [
          { market: "h2h", selection: "Flyers gana", p: 0.439, fairOdds: 2.278 },
          { market: "h2h", selection: "Oilers gana", p: 0.561, fairOdds: 1.783 },
        ],
        marketGroups: [
          {
            group: "Ganador (incluye tiempo extra)",
            rows: [
              { market: "h2h", selection: "home", label: "Flyers gana", p: 0.439, fairOdds: 2.278 },
              { market: "h2h", selection: "away", label: "Oilers gana", p: 0.561, fairOdds: 1.783 },
            ],
          },
          {
            group: "Puck line PHI +1.5",
            rows: [
              { market: "spreads", selection: "home", label: "PHI cubre", line: 1.5, p: 0.689, fairOdds: 1.451 },
              { market: "spreads", selection: "away", label: "EDM cubre", line: -1.5, p: 0.311, fairOdds: 3.215 },
            ],
          },
          {
            group: "Total 5.5",
            rows: [
              { market: "totals", selection: "over", label: "Más", line: 5.5, p: 0.531, fairOdds: 1.883 },
              { market: "totals", selection: "under", label: "Menos", line: 5.5, p: 0.469, fairOdds: 2.132 },
            ],
          },
          {
            group: "Goles por equipo",
            rows: [
              { market: "team_totals", selection: "home_over", label: "PHI más de 2.5", line: 2.5, p: 0.518, fairOdds: 1.931 },
              { market: "team_totals", selection: "away_over", label: "EDM más de 2.5", line: 2.5, p: 0.578, fairOdds: 1.730 },
            ],
          },
        ],
        factors: [
          { key: "home_projection", label: "Local", value: "2.64 goles proyectados", detail: "21 partidos esta temporada" },
          { key: "away_projection", label: "Visitante", value: "3.01 goles proyectados", detail: "20 partidos esta temporada" },
          { key: "rest", label: "Descanso", value: "PHI: 3 días de descanso", detail: "EDM: 3 días de descanso" },
          { key: "overtime", label: "Tiempo extra", value: "17 % de llegar empatados al final", detail: "se define en tiempo extra o penales" },
        ],
        steps: [
          "Sincronizando NHL · corte 15 nov 2026, 14:00",
          "Ataque y defensa actualizados partido a partido",
          "Goles de tiempo regular separados del tiempo extra",
          "Proyección 2.64 – 3.01 · margen -0.37",
          "Simulando marcadores y tiempo extra",
          "8 mercados listos",
        ],
        inputsAsOf: "2026-11-15T14:00:00.000Z",
        publishedAt: "2026-11-15T14:00:00.000Z",
        source: "pitchlab",
        picks: [
          { profile: "intermedia", market: "h2h", selection: "away", label: "Oilers gana", p: 0.561, fairOdds: 1.783 },
          { profile: "conservadora", market: "spreads", selection: "home", label: "PHI cubre", line: 1.5, p: 0.689, fairOdds: 1.451 },
        ],
        confidence: { score: 48, level: "baja", reasons: ["Partido parejo", "Muestra suficiente"] },
        insights: {
          why: [
            "Oilers gana en 56 % de los escenarios.",
            "Se esperan 5.65 goles: 2.64 de Flyers y 3.01 de Oilers.",
          ],
        },
      },
    },
    standings: [
      {
        teamId: "nhl.edmonton-oilers",
        name: "Edmonton Oilers",
        shortName: "Oilers",
        code: "EDM",
        played: 23,
        won: 17,
        drawn: 0,
        lost: 3,
        goalsFor: 92,
        goalsAgainst: 62,
        points: 37,
        conference: "Oeste",
        division: "Pacífico",
        otLosses: 3,
        winPct: 0.739,
        seed: 1,
        form: ["W", "W", "W", "W", "W"],
      },
    ],
  });
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

describe("Dataset, estado vacío y vistas NBA y NHL con fixtures deterministas", () => {
  let dataset: PlatformDataset;
  let nbaScheduled: PlatformGame;
  let nhlScheduled: PlatformGame;
  let emptyForecastGame: PlatformGame;

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);

    const nbaSnap = buildNbaSnapshotFixture();
    const nhlSnap = buildNhlSnapshotFixture();

    dataset = buildPlatformDataset([
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

    nbaScheduled = dataset.games.find(
      (g) => g.league === "nba" && g.status !== "FT" && g.hasForecast !== false,
    )!;
    nhlScheduled = dataset.games.find(
      (g) => g.league === "nhl" && g.status !== "FT" && g.hasForecast !== false,
    )!;
    emptyForecastGame = dataset.games.find(
      (g) => (g.league === "nba" || g.league === "nhl") && g.hasForecast === false,
    )!;
  });

  afterAll(() => {
    vi.useRealTimers();
  });

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

  it("renderiza Inicio, Hub, Ficha NBA, Ficha NHL y estado vacío honesto sin errores", async () => {
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

    const nbaStudioHtml = await renderHtmlAsync(
      <PlatformProvider dataset={dataset} initialRole="member">
        <MatchStudioClubView leagueId={nbaScheduled.league} gameId={nbaScheduled.id} initialTab="ia" />
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

    const nhlStudioHtml = await renderHtmlAsync(
      <PlatformProvider dataset={dataset} initialRole="member">
        <MatchStudioClubView leagueId={nhlScheduled.league} gameId={nhlScheduled.id} initialTab="ia" />
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

    const emptyResumenHtml = await renderHtmlAsync(
      <PlatformProvider dataset={emptyDs} initialRole="member">
        <MatchStudioClubView leagueId={noForecastScheduled.league} gameId={noForecastScheduled.id} />
      </PlatformProvider>,
    );
    expect(emptyResumenHtml).toContain("Sin pronóstico");
    expect(emptyResumenHtml).toContain("Aún no hay selecciones publicadas");
    expect(emptyResumenHtml).not.toContain("Simulador del partido");

    const emptyStudioHtml = await renderHtmlAsync(
      <PlatformProvider dataset={emptyDs} initialRole="member">
        <MatchStudioClubView leagueId={noForecastScheduled.league} gameId={noForecastScheduled.id} initialTab="ia" />
      </PlatformProvider>,
    );
    expect(emptyStudioHtml).toContain("Sin pronóstico");
    expect(emptyStudioHtml).toContain("Sin lectura publicada");
    expect(emptyStudioHtml).not.toContain("Simulador del partido");

    const finishedEmpty = {
      ...noForecastScheduled,
      id: "nba-empty-forecast-ft",
      status: "FT" as const,
      score: { home: 108, away: 116 },
    };
    const finishedEmptyDs = {
      ...dataset,
      games: [finishedEmpty],
    };
    const finishedEmptyResumenHtml = await renderHtmlAsync(
      <PlatformProvider dataset={finishedEmptyDs} initialRole="visitor">
        <MatchStudioClubView leagueId={finishedEmpty.league} gameId={finishedEmpty.id} />
      </PlatformProvider>,
    );
    expect(finishedEmptyResumenHtml).toContain("108");
    expect(finishedEmptyResumenHtml).toContain("116");
    expect(finishedEmptyResumenHtml).toContain("Aún no hay selecciones publicadas");
    expect(finishedEmptyResumenHtml).not.toContain("Simulador del partido");

    const finishedEmptyStudioHtml = await renderHtmlAsync(
      <PlatformProvider dataset={finishedEmptyDs} initialRole="visitor">
        <MatchStudioClubView leagueId={finishedEmpty.league} gameId={finishedEmpty.id} initialTab="ia" />
      </PlatformProvider>,
    );
    expect(finishedEmptyStudioHtml).toContain("108");
    expect(finishedEmptyStudioHtml).toContain("116");
    expect(finishedEmptyStudioHtml).toContain("Sin pronóstico");
    expect(finishedEmptyStudioHtml).toContain("Sin lectura publicada");
    expect(finishedEmptyStudioHtml).not.toContain("Simulador del partido");
  });
});
