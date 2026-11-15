import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  asLeagueId,
  asMarketKey,
  asTeamId,
  LeagueSnapshotSchema,
  snapshotToMatchAnalyses,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import { redactDatasetForVisitor } from "../src/platform/access-guard";
import { groupMatchesByDayAndLeague } from "../src/platform/club/home/home-model";
import { MatchStudioClubView } from "../src/platform/club/CoreMatchViews";
import { normalizeMatchTab } from "../src/platform/club/match/match-tab";
import { MatchList } from "../src/platform/components/MatchList";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";

const row = (market: string, selection: string, label: string, p: number, line?: number) => ({
  market: asMarketKey(market),
  selection,
  label,
  ...(line !== undefined ? { line } : {}),
  p,
  fairOdds: 1 / p,
});

function buildRichMatch(extra: Partial<MatchAnalysis> = {}): MatchAnalysis {
  return {
    id: "test-ficha-qro-mty",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 16",
    day: "2030-11-14",
    dayLabel: "sábado, 14 de noviembre",
    kickoffUtc: "2030-11-14T23:00:00Z",
    kickoffLocal: "17:00",
    venue: "Estadio Corregidora",
    status: "NS",
    home: {
      slug: "queretaro",
      name: "Querétaro",
      shortName: "Querétaro",
      code: "QRO",
      record: "15 PJ · 1.2 goles/p",
    },
    away: {
      slug: "monterrey",
      name: "Rayados de Monterrey",
      shortName: "Monterrey",
      code: "MTY",
      record: "15 PJ · 1.7 goles/p",
    },
    projection: { home: 1.41, away: 1.55, total: 2.96 },
    x12: [0.34, 0.26, 0.4],
    outcomes: [
      { key: "home", label: "Querétaro gana", probability: 0.34 },
      { key: "draw", label: "Empate", probability: 0.26 },
      { key: "away", label: "Monterrey gana", probability: 0.4 },
    ],
    marketGroups: [
      {
        group: "Resultado",
        rows: [
          row("h2h", "home", "Querétaro gana", 0.34),
          row("h2h", "draw", "Empate", 0.26),
          row("h2h", "away", "Monterrey gana", 0.4),
        ],
      },
      {
        group: "Goles totales",
        rows: [
          row("totals", "over_2.5", "Más de 2.5", 0.57, 2.5),
          row("totals", "under_2.5", "Menos de 2.5", 0.43, 2.5),
        ],
      },
      {
        group: "Tiros de esquina 10.5",
        rows: [
          row("corners_total", "over", "Más de 10.5", 0.53, 10.5),
          row("corners_total", "under", "Menos de 10.5", 0.47, 10.5),
        ],
      },
      {
        group: "Faltas 21.5",
        rows: [
          row("fouls_total", "over", "Más de 21.5", 0.55, 21.5),
          row("fouls_total", "under", "Menos de 21.5", 0.45, 21.5),
        ],
      },
      {
        group: "Tarjetas amarillas 3.5",
        rows: [
          row("yellow_total", "over", "Más de 3.5", 0.59, 3.5),
          row("yellow_total", "under", "Menos de 3.5", 0.41, 3.5),
        ],
      },
    ],
    counts: {
      corners: { home: 5.4, away: 5.3, total: 10.7, line: 10.5, pOver: 0.53, sample: { home: 12, away: 12 } },
      fouls: { home: 11.8, away: 10.1, total: 21.9, line: 21.5, pOver: 0.55, sample: { home: 12, away: 12 } },
      yellow: { home: 2.1, away: 1.9, total: 4.0, line: 3.5, pOver: 0.59, sample: { home: 12, away: 12 } },
    },
    factors: [
      {
        label: "Forma local",
        detail: "",
        impact: "",
        value: "G-E-P-G-G · 3-1",
        sub: "8 goles a favor · 5 en contra",
      },
      {
        label: "Forma visitante",
        detail: "",
        impact: "",
        value: "P-G-G-E-G · 3-1",
        sub: "9 goles a favor · 6 en contra",
      },
    ],
    trace: [],
    headToHead: [
      { date: "2026-04-12", home: "Monterrey", away: "Querétaro", homeGoals: 2, awayGoals: 1 },
    ],
    restDays: { home: 6, away: 7 },
    injuries: {
      home: [
        {
          teamId: asTeamId("liga-mx.queretaro"),
          player: "J. Gómez",
          position: "DEF",
          status: "Duda",
          detail: "Sobrecarga muscular",
          reportedAt: "2030-11-14T12:00:00Z",
        },
      ],
      away: [],
    },
    ...extra,
  };
}

const MATCH = buildRichMatch();
const DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura",
    roundLabel: "Jornada 16",
    generatedAt: "2030-11-13T18:00:00Z",
    games: [MATCH],
    standings: [
      {
        teamId: "liga-mx.monterrey",
        name: "Rayados de Monterrey",
        shortName: "Monterrey",
        code: "MTY",
        played: 15,
        won: 6,
        drawn: 3,
        lost: 6,
        goalsFor: 24,
        goalsAgainst: 21,
        points: 21,
      },
      {
        teamId: "liga-mx.queretaro",
        name: "Querétaro",
        shortName: "Querétaro",
        code: "QRO",
        played: 15,
        won: 5,
        drawn: 5,
        lost: 5,
        goalsFor: 18,
        goalsAgainst: 19,
        points: 20,
      },
    ],
  },
]);

describe("propagación de counts y goalLine desde snapshots y contracts", () => {
  it("snapshotToMatchAnalyses y buildPlatformDataset conservan counts, corners/fouls/yellow y goalLine", () => {
    const parsed = LeagueSnapshotSchema.parse({
      schemaVersion: 1,
      league: "liga-mx",
      season: "liga-mx-2026",
      seasonLabel: "Apertura",
      periodLabel: "Jornada 16",
      updatedAt: "2030-11-13T18:00:00Z",
      source: "test",
      provenance: "derived",
      isDemo: false,
      teamRates: {},
      standings: [],
      games: [
        {
          id: "liga-mx-2026-j16-qro-mty",
          league: "liga-mx",
          season: "liga-mx-2026",
          round: "Jornada 16",
          startTime: "2030-11-14T23:00:00Z",
          venue: "Estadio Corregidora",
          status: "scheduled",
          neutralSite: false,
          home: { id: "liga-mx.queretaro", league: "liga-mx", name: "Querétaro", shortName: "Querétaro", code: "QRO" },
          away: { id: "liga-mx.monterrey", league: "liga-mx", name: "Rayados de Monterrey", shortName: "Monterrey", code: "MTY" },
        },
      ],
      analyses: {
        "liga-mx-2026-j16-qro-mty": {
          game: "liga-mx-2026-j16-qro-mty",
          model: {
            id: "pitchlab-tachyon",
            version: "3.0",
            status: "published",
            label: "PitchLab",
          },
          projection: { home: 1.41, away: 1.55, total: 2.96 },
          x12: [0.34, 0.26, 0.4],
          marketGroups: MATCH.marketGroups,
          probabilities: [
            { market: "h2h", selection: "home", p: 0.34, fairOdds: 2.94 },
            { market: "h2h", selection: "draw", p: 0.26, fairOdds: 3.85 },
            { market: "h2h", selection: "away", p: 0.4, fairOdds: 2.5 },
          ],
          counts: MATCH.counts,
          factors: [{ key: "form", label: "Forma", value: "3-1-1" }],
          steps: ["1", "2", "3", "4", "5", "6"],
          inputsAsOf: "2030-11-13T18:00:00Z",
          publishedAt: "2030-11-13T18:00:00Z",
          source: "test",
        },
      },
    });
    const { matches } = snapshotToMatchAnalyses(parsed);
    expect(matches[0]?.counts?.corners?.total).toBeCloseTo(10.7, 2);

    const ds = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura",
        roundLabel: "Jornada 16",
        generatedAt: "2030-11-13T18:00:00Z",
        games: matches,
        standings: [],
      },
    ]);
    const g = ds.games[0]!;
    expect(g.counts?.corners?.home).toBeCloseTo(5.4, 2);
    expect(g.counts?.fouls?.away).toBeCloseTo(10.1, 2);
    expect(g.counts?.yellow?.total).toBeCloseTo(4.0, 2);
    expect(g.goalLine).toEqual({ line: 2.5, pOver: 0.57 });
    expect(g.markets.some((m) => m.market === "corners_total")).toBe(true);
    expect(g.markets.some((m) => m.market === "fouls_total")).toBe(true);
    expect(g.markets.some((m) => m.market === "yellow_total")).toBe(true);
  });

  it("redactDatasetForVisitor oculta counts, goalLine y proyección de partidos no desbloqueados", () => {
    const weeklyPromoMatch = buildRichMatch({
      id: "mx-weekly-promo",
      home: { slug: "america", name: "América", shortName: "América", code: "AME", record: "15 PJ" },
      away: { slug: "chivas", name: "Guadalajara", shortName: "Chivas", code: "GDL", record: "15 PJ" },
    });
    const lockedMatch = buildRichMatch({
      id: "mx-locked-only",
      home: { slug: "toluca", name: "Toluca", shortName: "Toluca", code: "TOL", record: "15 PJ" },
      away: { slug: "necaxa", name: "Necaxa", shortName: "Necaxa", code: "NEC", record: "15 PJ" },
      x12: [0.35, 0.3, 0.35],
    });
    const threeGamesDs = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura",
        roundLabel: "Jornada 16",
        generatedAt: "2030-11-13T18:00:00Z",
        games: [MATCH, weeklyPromoMatch, lockedMatch],
        standings: [],
      },
    ]);
    const redacted = redactDatasetForVisitor(threeGamesDs);
    const locked = redacted.games.find((g) => g.id === "mx-locked-only")!;
    expect(locked.counts).toBeUndefined();
    expect(locked.goalLine).toBeNull();
    expect(locked.markets).toHaveLength(0);
  });
});

describe("Ficha rediseñada en 3 pestañas accesibles", () => {
  it("normaliza ?tab= incluyendo respaldo a enlaces previos", () => {
    expect(normalizeMatchTab(undefined)).toBe("resumen");
    expect(normalizeMatchTab("resumen")).toBe("resumen");
    expect(normalizeMatchTab("numeros")).toBe("numeros");
    expect(normalizeMatchTab(["números"])).toBe("numeros");
    expect(normalizeMatchTab("mercados")).toBe("numeros");
    expect(normalizeMatchTab("contexto")).toBe("contexto");
  });

  it("renderiza role=tablist sin aria-controls, con 3 paneles en HTML y hidden en los inactivos", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <MatchStudioClubView
          leagueId={asLeagueId("liga-mx")}
          gameId={MATCH.id}
          initialTab="numeros"
        />
      </PlatformProvider>,
    );
    const tablistHtml = html.match(/<div class="pl-match-tabs"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(tablistHtml).toContain('role="tablist"');
    expect(tablistHtml).not.toContain("aria-controls=");
    expect(html).toContain('id="pl-match-tab-resumen"');
    expect(html).toContain('id="pl-match-tab-numeros"');
    expect(html).toContain('id="pl-match-tab-contexto"');
    expect(html).toContain('id="pl-match-panel-numeros"');
    expect(html).toContain('aria-selected="true"');

    // Paneles resumen y contexto deben estar hidden cuando initialTab="numeros"
    expect(html).toMatch(/id="pl-match-panel-resumen"[^>]*hidden=""/);
    expect(html).toMatch(/id="pl-match-panel-contexto"[^>]*hidden=""/);

    // Contenido de las 3 pestañas presente en el árbol inicial
    expect(html).toContain("Pronóstico del partido");
    expect(html).toContain("Cortex IA");
    expect(html).toContain("Factores del partido");
    expect(html).toContain("Goles esperados");
    expect(html).toContain("Córners esperados");
    expect(html).toContain("Faltas esperadas");
    expect(html).toContain("Amarillas esperadas");
    expect(html).toContain("Tiros de esquina 10.5");
    expect(html).toContain("Tabla de posiciones");
    expect(html).toContain("Bajas y disponibilidad");
    expect(html).toContain("J. Gómez");
    expect(html).toContain("Monterrey llega con +1 día extra de descanso");
    expect(html).not.toMatch(/Poisson|Dixon-Coles|sigma|matriz|tipstar/i);
  });

  it("respeta fullAccess para visitantes bloqueados sin filtrar conteos ni bajas", () => {
    const weeklyPromo = buildRichMatch({
      id: "mx-weekly-promo-2",
      home: { slug: "america", name: "América", shortName: "América", code: "AME", record: "15 PJ" },
      away: { slug: "chivas", name: "Guadalajara", shortName: "Chivas", code: "GDL", record: "15 PJ" },
    });
    const gated = buildRichMatch({
      id: "mx-gated",
      home: { slug: "toluca", name: "Toluca", shortName: "Toluca", code: "TOL", record: "15 PJ" },
      away: { slug: "necaxa", name: "Necaxa", shortName: "Necaxa", code: "NEC", record: "15 PJ" },
      x12: [0.35, 0.3, 0.35],
    });
    const gatedDs = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura",
        roundLabel: "Jornada 16",
        generatedAt: "2030-11-13T18:00:00Z",
        games: [MATCH, weeklyPromo, gated],
        standings: [],
      },
    ]);
    const redacted = redactDatasetForVisitor(gatedDs);
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={redacted} initialRole="visitor">
        <MatchStudioClubView
          leagueId={asLeagueId("liga-mx")}
          gameId="mx-gated"
          initialTab="numeros"
        />
      </PlatformProvider>,
    );
    expect(html).toContain("Pase PitchLab Ultra");
    expect(html).not.toContain("10.7");
    expect(html).not.toContain("21.9");
    expect(html).not.toContain("J. Gómez");
  });
});

describe("Lista de partidos agrupada por día y liga", () => {
  it("muestra día, liga, hora, equipos, barra 1X2, línea de goles y pista de córners/faltas cuando hay counts", () => {
    const groups = groupMatchesByDayAndLeague(DATASET.games);
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <MatchList groups={groups} today="2030-11-14" />
      </PlatformProvider>,
    );
    expect(html).toContain("Jueves 14 de noviembre · hoy");
    expect(html).toContain("Liga MX");
    expect(html).toContain("17:00");
    expect(html).toContain("Querétaro");
    expect(html).toContain("Rayados de Monterrey");
    expect(html).toContain("Línea 2.5 goles · 57% +");
    expect(html).toContain("Córners 10.7 · Faltas 21.9");
  });

  it("omite la pista de counts cuando un partido no tiene counts ni inventa números", () => {
    const withoutCounts = buildRichMatch({ id: "mx-sin-counts", counts: undefined });
    const ds = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura",
        roundLabel: "Jornada 16",
        generatedAt: "2030-11-13T18:00:00Z",
        games: [withoutCounts],
        standings: [],
      },
    ]);
    const groups = groupMatchesByDayAndLeague(ds.games);
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={ds} initialRole="member">
        <MatchList groups={groups} />
      </PlatformProvider>,
    );
    expect(html).toContain("Línea 2.5 goles");
    expect(html).not.toContain("data-counts-hint");
    expect(html).not.toContain("Córners");
  });
});
