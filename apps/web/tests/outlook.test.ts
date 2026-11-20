import { describe, expect, it } from "vitest";
import {
  applyOutlookWithMatchOutlook,
  findOutlook,
  outlookDetailFor,
  outlookDetailFromMatchOutlook,
} from "../src/server/outlook";

const unionLeipzig = {
  league: "bundesliga",
  home: { name: "1. FC Union Berlin" },
  away: { name: "RB Leipzig" },
};

describe("panorama v3.2 en la ficha del partido", () => {
  it("empareja por liga y nombres de equipo de la app", () => {
    const o = findOutlook(unionLeipzig);
    expect(o?.homeTeam).toBe("1.FC Unión Berlín");
    expect(o?.awayTeam).toBe("RB Leipzig");
    expect(findOutlook({ ...unionLeipzig, league: "serie-a" })).toBeNull();
    expect(findOutlook({ league: "bundesliga", home: { name: "Equipo X" }, away: { name: "RB Leipzig" } })).toBeNull();
  });

  it("mapea Premier League al código del motor", () => {
    const o = findOutlook({ league: "premier-league", home: { name: "Arsenal" }, away: { name: "Chelsea" } });
    // Puede no haber Arsenal–Chelsea esta jornada; si lo hay, debe venir de la liga epl.
    if (o) expect(o.league).toBe("epl");
  });

  it("arma filas con momio justo, sin cuota de casa inventada y con nombres de la app", () => {
    const expiredNow = Date.parse("2030-01-01T00:00:00Z");
    const detail = outlookDetailFor(unionLeipzig, expiredNow);
    expect(detail).not.toBeNull();
    const rows = detail!.markets;
    expect(rows.length).toBeGreaterThanOrEqual(11 * 2);
    for (const r of rows) {
      expect(r.p).toBeGreaterThan(0);
      expect(r.p).toBeLessThan(1);
      expect(r.fairDecimal).toBeGreaterThan(1);
      expect(r.currentDecimal).toBeNull();
      expect(r.edgePts).toBeNull();
      expect(r.label).not.toContain("Unión Berlín");
    }
    const x12 = rows.filter((r) => r.market === "1x2");
    expect(x12.map((r) => r.selection)).toEqual(["home", "draw", "away"]);
    expect(x12.reduce((s, r) => s + r.p, 0)).toBeCloseTo(1, 6);
    expect(rows.some((r) => r.group === "Doble oportunidad")).toBe(true);
    expect(rows.some((r) => r.group === "Hándicap asiático")).toBe(true);
    // Mercados derivados de Punto 5: goles por equipo, 1er tiempo y top 6 de marcadores.
    expect(rows.some((r) => r.market === "team_goals_home" && r.isDerived)).toBe(true);
    expect(rows.some((r) => r.market === "team_goals_away" && r.isDerived)).toBe(true);
    expect(rows.some((r) => r.market === "ht_1x2" && r.isDerived)).toBe(true);
    expect(rows.some((r) => r.market === "ht_totals" && r.isDerived)).toBe(true);
    expect(rows.filter((r) => r.market === "correct_score" && r.isDerived)).toHaveLength(6);
  });

  it("resume lo más probable, 6 marcadores y la calidad de datos", () => {
    const expiredNow = Date.parse("2030-01-01T00:00:00Z");
    const { outlook } = outlookDetailFor(unionLeipzig, expiredNow)!;
    expect(outlook.mostLikely?.label).toBe("Gana 1. FC Union Berlin");
    expect(outlook.scorelines).toHaveLength(6);
    expect(outlook.scorelines[0]!.p).toBeGreaterThanOrEqual(outlook.scorelines[1]!.p);
    expect(outlook.quality.coveragePct).toBeGreaterThanOrEqual(0);
    expect(outlook.quality.coveragePct).toBeLessThanOrEqual(100);
    expect(["ok", "low_coverage", "fallback_base_rate"]).toContain(outlook.quality.flag);
    // Sin captura legal < 72 h, ningún mercado trae cuota de casa.
    expect(outlook.hasRecentQuote).toBe(false);
  });

  it("NFL: ganador v3.2 más hándicap y totales derivados, sin marcadores exactos", () => {
    const detail = outlookDetailFor({
      league: "nfl",
      home: { name: "Buffalo Bills" },
      away: { name: "Minnesota Vikings" },
    });
    expect(detail).not.toBeNull();
    expect(detail!.markets.some((r) => r.group === "Ganador" && !r.isDerived)).toBe(true);
    expect(detail!.markets.some((r) => r.cardCategory === "handicap" && r.isDerived)).toBe(true);
    expect(detail!.markets.some((r) => r.cardCategory === "goles" && r.isDerived)).toBe(true);
    expect(detail!.outlook.scorelines).toEqual([]);
  });

  it("deriva goles por equipo y 1er tiempo para partidos de selecciones fuera del outlook v3.2", async () => {
    const { buildDerivedFootballFallbackRows } = await import("../src/server/outlook-derived-rows");
    const rows = buildDerivedFootballFallbackRows(
      {
        home: { name: "México" },
        away: { name: "Canadá" },
        projection: { home: 1.55, away: 1.15, total: 2.7 },
      },
      false,
    );
    expect(rows.some((r) => r.market === "team_goals_home" && r.isDerived)).toBe(true);
    expect(rows.some((r) => r.market === "team_goals_away" && r.isDerived)).toBe(true);
    expect(rows.some((r) => r.market === "ht_1x2" && r.isDerived)).toBe(true);
    expect(rows.some((r) => r.market === "ht_totals" && r.isDerived)).toBe(true);
  });
});

describe("dataset del Club sobre el panorama v3.2", () => {
  it("Inicio, Picks y landing leen las probabilidades v3.2 del partido", async () => {
    const { buildServerRawPlatformDataset } = await import("../src/server/platform-data");
    const { findOutlook: find } = await import("../src/server/outlook");
    const games = buildServerRawPlatformDataset().games.filter((g) => g.status !== "FT");
    const football = games.filter((g) => g.sport === "football" && find(g));
    // Cuántos hay depende de la jornada en los snapshots; lo que importa es que cada uno use v3.2.
    expect(football.length).toBeGreaterThan(0);
    for (const g of football) {
      const o = find(g)!;
      const x = o.marketsByKey["1x2"]!.selections;
      const p = (s: string) => x.find((v) => v.selection === s)!.p;
      expect(g.x12).not.toBeNull();
      expect(g.x12![0]).toBeCloseTo(p("home"), 3);
      expect(g.x12![1]).toBeCloseTo(p("draw"), 3);
      expect(g.x12![2]).toBeCloseTo(p("away"), 3);
      expect(g.spacetime?.outlookDriven ?? true).toBe(true);
      if (!o.marketsByKey["1x2"]?.market) {
        expect(g.spacetime?.market ?? null).toBeNull();
      }
      // Cada pick usa una probabilidad publicada por v3.2 para ese mercado.
      const published = new Set(
        o.markets.flatMap((m) => m.selections.map((s) => s.p.toFixed(6))).concat(o.topScorelines.map((s) => s.p.toFixed(6))),
      );
      for (const pk of g.picks) expect(published.has(pk.p.toFixed(6))).toBe(true);
      expect(g.picks.every((pk) => pk.category !== "valor")).toBe(true);
    }
  }, 120_000);

  it("NFL: conserva el modelo v2 del snapshot cuando v3.2 tiene low_coverage sin mercado sharp y aplica v3.2 cuando hay mercado o cobertura ok", async () => {
    const { buildServerRawPlatformDataset } = await import("../src/server/platform-data");
    const { findOutlook: find } = await import("../src/server/outlook");
    const { loadLeagueSnapshotEnvelope } = await import("../src/server/snapshots");
    const snapGames = loadLeagueSnapshotEnvelope("nfl").data?.games ?? [];
    const nflDataset = buildServerRawPlatformDataset().games.filter((g) => g.league === "nfl" && g.status !== "FT");
    expect(nflDataset.length).toBeGreaterThan(0);

    const nflWithOutlook = nflDataset.filter((g) => Boolean(find(g)));
    for (const g of nflWithOutlook) {
      const o = find(g)!;
      const snap = snapGames.find((s) => s.id === g.id);
      const ml = o.marketsByKey.moneyline!.selections;
      const home = ml.find((s) => s.selection === "home")!.p;
      const away = ml.find((s) => s.selection === "away")!.p;
      expect(g.x12).not.toBeNull();
      expect(g.x12![1]).toBe(0);

      const hasSharp = ml.some((s) => s.dataQuality?.sharpMarketAvailable);
      if (o.dataQuality.flag === "ok" || hasSharp) {
        expect(g.x12![0]).toBeCloseTo(home / (home + away), 3);
      } else if (snap?.x12) {
        expect(g.x12![0]).toBeCloseTo(snap.x12[0], 3);
        expect(g.x12![2]).toBeCloseTo(snap.x12[2], 3);
      }
    }

    // Verificación determinista independiente de la rotación semanal entre snapshots v2 y v3.2.
    const nflSample = snapGames.find((g) => g.status !== "FT" && g.x12 && g.x12[0] > 0 && g.x12[2] > 0);
    const baseOutlook = find({
      league: "nfl",
      home: { name: "Buffalo Bills" },
      away: { name: "Minnesota Vikings" },
    });
    expect(nflSample).toBeDefined();
    expect(baseOutlook?.marketsByKey.moneyline).toBeDefined();

    if (nflSample && baseOutlook?.marketsByKey.moneyline) {
      const lowCovOutlook = {
        ...baseOutlook,
        dataQuality: { ...baseOutlook.dataQuality, flag: "low_coverage" as const },
        marketsByKey: {
          ...baseOutlook.marketsByKey,
          moneyline: {
            ...baseOutlook.marketsByKey.moneyline,
            market: null,
            selections: baseOutlook.marketsByKey.moneyline.selections.map((s) => ({
              ...s,
              dataQuality: { ...(s.dataQuality ?? baseOutlook.dataQuality), sharpMarketAvailable: false },
            })),
          },
        },
      };
      const preserved = applyOutlookWithMatchOutlook(nflSample, null, lowCovOutlook, Date.parse("2030-01-01T00:00:00Z"));
      expect(preserved.match.x12![0]).toBeCloseTo(nflSample.x12![0], 3);
      expect(preserved.match.x12![2]).toBeCloseTo(nflSample.x12![2], 3);

      const okOutlook = {
        ...lowCovOutlook,
        dataQuality: { ...baseOutlook.dataQuality, flag: "ok" as const, coverageRatio: 0.9 },
      };
      const overridden = applyOutlookWithMatchOutlook(nflSample, null, okOutlook, Date.parse("2030-01-01T00:00:00Z"));
      const oml = okOutlook.marketsByKey.moneyline.selections;
      const oh = oml.find((s) => s.selection === "home")!.p;
      const oa = oml.find((s) => s.selection === "away")!.p;
      expect(overridden.match.x12![0]).toBeCloseTo(oh / (oh + oa), 3);
      expect(overridden.match.x12![2]).toBeCloseTo(oa / (oh + oa), 3);
    }
  }, 120_000);
});

describe("confianza sobre el panorama v3.2", () => {
  it("se explica por factor y el puntaje sale de esos factores", async () => {
    const { outlookConfidence, findOutlook } = await import("../src/server/outlook");
    const game = {
      league: "bundesliga",
      home: { name: "1. FC Union Berlin", record: "11 PJ · 1.3 goles/p" },
      away: { name: "RB Leipzig", record: "11 PJ · 1.9 goles/p" },
    };
    const o = findOutlook(game)!;
    const c = outlookConfidence(o, game as never, 0.444);
    expect(c.factors).toHaveLength(3);
    const weighted = c.factors!.reduce((s, f) => s + f.value * f.weight, 0);
    expect(c.score).toBe(Math.round(weighted * 100));
    expect(["alta", "media", "baja"]).toContain(c.level);
    expect(c.reasons.length).toBeGreaterThan(0);
  });
});

describe("vigencia < 72 h y hora de captura en panorama v3.2", () => {
  it("expone cuota y hora de captura cuando la cotización tiene menos de 72 h y la oculta al vencer", async () => {
    const baseOutlook = findOutlook(unionLeipzig)!;
    const capturedAtUtc = "2026-11-14T18:20:00Z";
    const freshNowMs = Date.parse("2026-11-14T18:50:00Z"); // 30 min después (< 72 h)
    const expiredNowMs = Date.parse("2026-11-17T19:00:00Z"); // > 72 h después

    const marketQuote = {
      book: "pinnacle",
      tsCaptured: capturedAtUtc,
      overround: 1.028,
      oddsBySelection: { home: 2.38, draw: 3.4, away: 3.05 },
    };

    const withQuote = {
      ...baseOutlook,
      markets: baseOutlook.markets.map((m) =>
        m.marketKey === "1x2" ? { ...m, market: marketQuote } : m,
      ),
      marketsByKey: {
        ...baseOutlook.marketsByKey,
        "1x2": baseOutlook.marketsByKey["1x2"]
          ? { ...baseOutlook.marketsByKey["1x2"], market: marketQuote }
          : undefined,
      },
    };

    const freshDetail = outlookDetailFromMatchOutlook(withQuote, unionLeipzig, {
      nowMs: freshNowMs,
    })!;
    expect(freshDetail.outlook.hasRecentQuote).toBe(true);
    expect(freshDetail.outlook.latestQuote).toEqual({
      bookLabel: "Pinnacle",
      capturedAtUtc,
    });
    const x12Fresh = freshDetail.markets.filter((r) => r.market === "1x2");
    expect(x12Fresh.map((r) => r.currentDecimal)).toEqual([2.38, 3.4, 3.05]);
    expect(x12Fresh.every((r) => r.quoteBookLabel === "Pinnacle")).toBe(true);
    expect(x12Fresh.every((r) => r.quoteCapturedAtUtc === capturedAtUtc)).toBe(true);
    expect(x12Fresh.every((r) => r.edgePts === null)).toBe(true);

    const expiredDetail = outlookDetailFromMatchOutlook(withQuote, unionLeipzig, {
      nowMs: expiredNowMs,
    })!;
    expect(expiredDetail.outlook.hasRecentQuote).toBe(false);
    expect(expiredDetail.outlook.latestQuote).toBeNull();
    expect(expiredDetail.markets.every((r) => r.currentDecimal === null)).toBe(true);
    expect(expiredDetail.markets.every((r) => (r.quoteBookLabel ?? null) === null)).toBe(true);
    expect(expiredDetail.markets.every((r) => (r.quoteCapturedAtUtc ?? null) === null)).toBe(true);

    const { loadLeagueSnapshotEnvelope } = await import("../src/server/snapshots");
    const sampleMatch = loadLeagueSnapshotEnvelope("bundesliga").data?.games.find(
      (g) => g.status !== "FT",
    );
    if (sampleMatch) {
      const dummySignal = {
        engineName: "PitchLab Tachyon v3.0",
        sportsEngineName: "PitchLab Tachyon v3.0",
        outlookDriven: true,
        probs: { home: 0.44, draw: 0.27, away: 0.29 },
        market: null,
        value: [],
        expectedTotal: 2.7,
        expectedMargin: 0.3,
        drivers: [],
        availability: {
          homeInjured: 0,
          awayInjured: 0,
          homeMissingValuePct: null,
          awayMissingValuePct: null,
        },
        stadium: null,
      };
      const appliedFresh = applyOutlookWithMatchOutlook(
        sampleMatch,
        dummySignal as never,
        withQuote,
        freshNowMs,
      );
      expect(appliedFresh.signal?.market).not.toBeNull();
      expect(appliedFresh.signal?.market?.asOfUtc).toBe(capturedAtUtc);
      expect(appliedFresh.signal?.market?.bookLabel).toContain("Pinnacle");
      expect(appliedFresh.signal?.market?.odds).toEqual({
        home: 2.38,
        draw: 3.4,
        away: 3.05,
      });
      expect(appliedFresh.signal?.value).toEqual([]);

      const appliedExpired = applyOutlookWithMatchOutlook(
        sampleMatch,
        dummySignal as never,
        withQuote,
        expiredNowMs,
      );
      expect(appliedExpired.signal?.market).toBeNull();
    }
  });

  it("conserva los mercados de conteos (corners_total, fouls_total, yellow_total) al aplicar panorama v3.2", () => {
    const detailOutlook = outlookDetailFor(unionLeipzig);
    expect(detailOutlook).not.toBeNull();
    const o = findOutlook(unionLeipzig)!;
    const matchWithCounts = {
      id: "bl-test-counts",
      league: "bundesliga" as never,
      leagueLabel: "Bundesliga",
      sport: "football" as const,
      round: "Jornada 11",
      day: "2030-11-14",
      dayLabel: "sábado",
      kickoffUtc: "2030-11-14T14:30:00Z",
      kickoffLocal: "08:30",
      venue: "Alte Försterei",
      status: "NS" as const,
      home: { slug: "union-berlin", name: "1. FC Union Berlin", shortName: "Union Berlin", code: "FCU", record: "10 PJ" },
      away: { slug: "rb-leipzig", name: "RB Leipzig", shortName: "Leipzig", code: "RBL", record: "10 PJ" },
      x12: [0.3, 0.25, 0.45] as [number, number, number],
      outcomes: [
        { key: "home", label: "Union Berlin gana", probability: 0.3 },
        { key: "draw", label: "Empate", probability: 0.25 },
        { key: "away", label: "Leipzig gana", probability: 0.45 },
      ],
      marketGroups: [
        {
          group: "Tiros de esquina 9.5",
          rows: [{ market: "corners_total" as never, selection: "over", label: "Más de 9.5", line: 9.5, p: 0.54, fairOdds: 1.85 }],
        },
        {
          group: "Faltas 22.5",
          rows: [{ market: "fouls_total" as never, selection: "under", label: "Menos de 22.5", line: 22.5, p: 0.55, fairOdds: 1.82 }],
        },
        {
          group: "Tarjetas amarillas 4.5",
          rows: [{ market: "yellow_total" as never, selection: "over", label: "Más de 4.5", line: 4.5, p: 0.52, fairOdds: 1.92 }],
        },
      ],
      counts: {
        corners: { home: 4.9, away: 4.8, total: 9.7, line: 9.5, pOver: 0.54, sample: { home: 10, away: 10 } },
        fouls: { home: 11.2, away: 10.9, total: 22.1, line: 22.5, pOver: 0.45, sample: { home: 10, away: 10 } },
        yellow: { home: 2.3, away: 2.3, total: 4.6, line: 4.5, pOver: 0.52, sample: { home: 10, away: 10 } },
      },
      factors: [],
      trace: [],
    };
    const enriched = applyOutlookWithMatchOutlook(matchWithCounts, null, o);
    const markets = (enriched.match.marketGroups ?? []).flatMap((g) => g.rows.map((r) => r.market));
    expect(markets).toContain("corners_total");
    expect(markets).toContain("fouls_total");
    expect(markets).toContain("yellow_total");
    expect(enriched.match.counts?.corners?.total).toBeCloseTo(9.7, 2);
  });
});
