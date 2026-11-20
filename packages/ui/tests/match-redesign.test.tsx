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

describe("Ficha rediseñada en 5 pestañas accesibles", () => {
  it("normaliza ?tab= incluyendo Análisis IA, ¿Dónde está el dinero? y respaldo a enlaces previos", () => {
    expect(normalizeMatchTab(undefined)).toBe("resumen");
    expect(normalizeMatchTab("resumen")).toBe("resumen");
    expect(normalizeMatchTab("ia")).toBe("ia");
    expect(normalizeMatchTab("analisis")).toBe("ia");
    expect(normalizeMatchTab("cortex")).toBe("ia");
    expect(normalizeMatchTab("numeros")).toBe("numeros");
    expect(normalizeMatchTab(["números"])).toBe("numeros");
    expect(normalizeMatchTab("mercados")).toBe("numeros");
    expect(normalizeMatchTab("dinero")).toBe("dinero");
    expect(normalizeMatchTab("money")).toBe("dinero");
    expect(normalizeMatchTab("contexto")).toBe("contexto");
  });

  it("renderiza role=tablist con 5 pestañas sin aria-controls y hidden en los paneles inactivos", () => {
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
    expect(html).toContain('id="pl-match-tab-ia"');
    expect(html).toContain('id="pl-match-tab-numeros"');
    expect(html).toContain('id="pl-match-tab-dinero"');
    expect(html).toContain('id="pl-match-tab-contexto"');
    expect(html).toContain('id="pl-match-panel-ia"');
    expect(html).toContain('id="pl-match-panel-numeros"');
    expect(html).toContain('id="pl-match-panel-dinero"');
    expect(html).toContain('aria-selected="true"');

    // Paneles resumen, ia, dinero y contexto deben estar hidden cuando initialTab="numeros"
    expect(html).toMatch(/id="pl-match-panel-resumen"[^>]*hidden=""/);
    expect(html).toMatch(/id="pl-match-panel-ia"[^>]*hidden=""/);
    expect(html).toMatch(/id="pl-match-panel-dinero"[^>]*hidden=""/);
    expect(html).toMatch(/id="pl-match-panel-contexto"[^>]*hidden=""/);

    // Contenido de las 5 pestañas presente en el árbol inicial
    expect(html).toContain("Pronóstico del partido");
    expect(html).toContain("Análisis IA");
    expect(html).toContain("Cortex IA");
    expect(html).toContain("Factores del partido");
    expect(html).toContain("Goles esperados");
    expect(html).toContain("¿Dónde está el dinero?");
    expect(html).toContain("Comparativa de cuotas y valor");
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

  it("renderiza Pronóstico de Cortex IA y Análisis de IA editorial con probabilidades, momios justos y resultado FT sin fugas", () => {
    const preMatchHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <MatchStudioClubView
          leagueId={asLeagueId("liga-mx")}
          gameId={MATCH.id}
        />
      </PlatformProvider>,
    );
    expect(preMatchHtml).toContain("Pronóstico de Cortex IA");
    expect(preMatchHtml).toContain("Goles esperados");
    expect(preMatchHtml).toContain("Total de goles");
    expect(preMatchHtml).toContain("Más de 2.5 goles");
    expect(preMatchHtml).toContain("Margen esperado");
    expect(preMatchHtml).toContain("Probabilidad de victoria");
    expect(preMatchHtml).toContain("1 · Querétaro");
    expect(preMatchHtml).toContain("X · Empate");
    expect(preMatchHtml).toContain("2 · Rayados de Monterrey");
    expect(preMatchHtml).toContain("Análisis de IA");
    expect(preMatchHtml).toContain("Con los números del modelo");
    expect(preMatchHtml).toContain("Resumen");
    expect(preMatchHtml).toContain("Goles y ritmo");
    expect(preMatchHtml).toContain("A tener en cuenta");
    expect(preMatchHtml).toContain("Pronóstico estadístico de Cortex IA. No garantiza resultados.");
    expect(preMatchHtml).not.toMatch(/Poisson|Dixon-Coles|sigma|matriz|tipstar/i);

    const ftMatch = buildRichMatch({
      id: "ft-check-mty",
      status: "FT",
      score: { home: 1, away: 2 },
      marketGroups: [
        ...(MATCH.marketGroups ?? []),
        {
          group: "Ambos anotan",
          rows: [
            row("btts", "yes", "Sí", 0.63),
            row("btts", "no", "No", 0.37),
          ],
        },
      ],
    });
    const ftDataset = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura",
        roundLabel: "Jornada 16",
        generatedAt: "2030-11-15T06:00:00Z",
        games: [ftMatch],
        standings: [],
      },
    ]);
    const ftHtml = renderToStaticMarkup(
      <PlatformProvider dataset={ftDataset} initialRole="member">
        <MatchStudioClubView
          leagueId={asLeagueId("liga-mx")}
          gameId="ft-check-mty"
        />
      </PlatformProvider>,
    );
    expect(ftHtml).toContain("Ambos anotan · Sí");
    expect(ftHtml).toContain("Resultado real del partido · 1–2");
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

describe("Rediseño de ficha de partido: breadcrumb, árbitro y riel rápido", () => {
  it("muestra ruta del encuentro, estadio, árbitro asignado y ordena el riel lateral (momento -> eventos -> picks -> cuotas)", () => {
    const withRef = buildRichMatch({ id: "mx-con-ref", referee: "Hector Martinez" });
    const ds = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura",
        roundLabel: "Jornada 16",
        generatedAt: "2030-11-13T18:00:00Z",
        games: [withRef],
        standings: [],
      },
    ]);
    const targetGame = ds.games[0]!;
    targetGame.picks = [
      { ...targetGame.picks[0]!, label: "Ambos anotan: Sí" },
      ...targetGame.picks.slice(0, 2),
    ];
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={ds} initialRole="member">
        <MatchStudioClubView leagueId={asLeagueId("liga-mx")} gameId="mx-con-ref" />
      </PlatformProvider>,
    );
    expect(html).toContain('aria-label="Ruta del partido"');
    expect(html).toContain("Estadio Corregidora");
    expect(html).toContain("data-match-referee");
    expect(html).toContain("Hector Martinez");
    expect(html).toContain("pl-match-layout");
    expect(html).toContain("pl-match-rail");
    expect(html).toContain("Tiempo reglamentario");
    expect(html).toContain("pl-match-workspace");

    const idxMomentum = html.indexOf("data-rail-momentum");
    const idxEvents = html.indexOf("data-rail-events");
    const idxPicks = html.indexOf("data-rail-picks");
    const idxOdds = html.indexOf('id="rail-odds-heading"');
    expect(idxMomentum).toBeGreaterThan(-1);
    expect(idxEvents).toBeGreaterThan(idxMomentum);
    expect(idxPicks).toBeGreaterThan(idxEvents);
    expect(idxOdds).toBeGreaterThan(idxPicks);

    const picksSlice = html.slice(idxPicks, idxOdds);
    expect(picksSlice).toContain("Ambos anotan: Sí");
    expect(picksSlice).not.toContain("pl-match-rail-pick-label truncate");
  });

  it("muestra periodos en eventos del riel en vivo sin duplicar timeline en Resumen", async () => {
    const { STORY_INCIDENTS, STORY_STATS } = await import(
      "../src/platform/live/live-story-data"
    );
    const liveMatch = buildRichMatch({ id: "mx-en-vivo", referee: "Hector Martinez" });
    const ds = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura",
        roundLabel: "Jornada 16",
        generatedAt: "2030-11-13T18:00:00Z",
        games: [liveMatch],
        standings: [],
      },
    ]);
    const liveDetailOverride = {
      gameId: "mx-en-vivo",
      generatedAt: "2030-11-14T20:14:00Z",
      sourceFetchedAt: "2030-11-14T20:14:00Z",
      entry: {
        gameId: "mx-en-vivo",
        league: "liga-mx",
        phase: "live" as const,
        clock: "84",
        minute: 84,
        score: { home: 2, away: 2 },
        htScore: { home: 1, away: 0 },
        redCards: { home: 0, away: 1 },
        referee: "Hector Martinez",
        kickoffUtc: "2030-11-14T23:00:00Z",
      },
      incidents: STORY_INCIDENTS,
      ...STORY_STATS,
      nextPollSeconds: null,
      notice: null,
      attribution: "Datos en vivo PitchLab",
    };
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={ds} initialRole="member">
        <MatchStudioClubView
          leagueId={asLeagueId("liga-mx")}
          gameId="mx-en-vivo"
          initialTab="resumen"
          liveDetailOverride={liveDetailOverride}
        />
      </PlatformProvider>,
    );
    expect(html).toContain("1.º tiempo");
    expect(html).toContain("1 – 0");
    expect(html).toContain("2.º tiempo");
    expect(html).toContain("pl-rail-event-score");
    expect(html).toContain("Jugador 9");
    expect(html).toContain("pl-rail-card-mark--yellow");
    expect(html).not.toContain("pl-live-timeline");
  });

  it("muestra estado honesto cuando no hay árbitro confirmado y respeta candado de visitante en el riel", () => {
    const lockedMatch = buildRichMatch({ id: "test-ficha-locked-3" });
    const threeGames = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura",
        roundLabel: "Jornada 16",
        generatedAt: "2030-11-13T18:00:00Z",
        games: [
          buildRichMatch({ id: "test-ficha-hero-1" }),
          buildRichMatch({ id: "test-ficha-weekly-2" }),
          lockedMatch,
        ],
        standings: [],
      },
    ]);
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={redactDatasetForVisitor(threeGames)} initialRole="visitor">
        <MatchStudioClubView leagueId={asLeagueId("liga-mx")} gameId="test-ficha-locked-3" />
      </PlatformProvider>,
    );
    expect(html).toContain("Árbitro por confirmar");
    expect(html).toContain("Cuotas justas y probabilidades de mercado reservadas para Pase PitchLab Ultra.");
  });

  it("muestra estado finalizado (FT) con Árbitro no reportado y cruce Ida/Agregado en eliminatoria real", () => {
    const ftMatch = buildRichMatch({
      id: "test-ficha-ft",
      status: "FT",
      score: { home: 2, away: 1 },
    });
    const knockoutMatch = buildRichMatch({
      id: "test-ficha-vuelta",
      round: "Cuartos de final · Vuelta",
      score: { home: 1, away: 1 },
      headToHead: [
        { date: "2030-11-08", home: "Monterrey", away: "Querétaro", homeGoals: 2, awayGoals: 1 },
      ],
    });
    const ds = buildPlatformDataset([
      {
        league: asLeagueId("liga-mx"),
        leagueLabel: "Liga MX",
        sport: "football",
        season: "Apertura",
        roundLabel: "Cuartos de final · Vuelta",
        generatedAt: "2030-11-13T18:00:00Z",
        games: [ftMatch, knockoutMatch],
        standings: [],
      },
    ]);
    const ftHtml = renderToStaticMarkup(
      <PlatformProvider dataset={ds} initialRole="member">
        <MatchStudioClubView leagueId={asLeagueId("liga-mx")} gameId="test-ficha-ft" />
      </PlatformProvider>,
    );
    expect(ftHtml).toContain("Finalizado · FT");
    expect(ftHtml).toContain("Marcador final");
    expect(ftHtml).toContain("Árbitro no reportado");

    const koHtml = renderToStaticMarkup(
      <PlatformProvider dataset={ds} initialRole="member">
        <MatchStudioClubView leagueId={asLeagueId("liga-mx")} gameId="test-ficha-vuelta" />
      </PlatformProvider>,
    );
    expect(koHtml).toContain("pl-rail-leg");
    expect(koHtml).toContain("Ida");
    expect(koHtml).toContain("Agregado");
  });
});
