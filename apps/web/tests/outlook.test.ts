import { describe, expect, it } from "vitest";
import { findOutlook, outlookDetailFor } from "../src/server/outlook";

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
    const detail = outlookDetailFor(unionLeipzig);
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
  });

  it("resume lo más probable, 3 marcadores y la calidad de datos", () => {
    const { outlook } = outlookDetailFor(unionLeipzig)!;
    expect(outlook.mostLikely?.label).toBe("Gana 1. FC Union Berlin");
    expect(outlook.scorelines).toHaveLength(3);
    expect(outlook.scorelines[0]!.p).toBeGreaterThanOrEqual(outlook.scorelines[1]!.p);
    expect(outlook.quality.coveragePct).toBeGreaterThanOrEqual(0);
    expect(outlook.quality.coveragePct).toBeLessThanOrEqual(100);
    expect(["ok", "low_coverage", "fallback_base_rate"]).toContain(outlook.quality.flag);
    // Sin captura legal < 72 h, ningún mercado trae cuota de casa.
    expect(outlook.hasRecentQuote).toBe(false);
  });

  it("NFL: ganador sin marcadores exactos", () => {
    const detail = outlookDetailFor({
      league: "nfl",
      home: { name: "Buffalo Bills" },
      away: { name: "Minnesota Vikings" },
    });
    expect(detail).not.toBeNull();
    expect(detail!.markets.every((r) => r.group === "Ganador")).toBe(true);
    expect(detail!.outlook.scorelines).toEqual([]);
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
      expect(g.x12[0]).toBeCloseTo(p("home"), 3);
      expect(g.x12[1]).toBeCloseTo(p("draw"), 3);
      expect(g.x12[2]).toBeCloseTo(p("away"), 3);
      expect(g.spacetime?.outlookDriven ?? true).toBe(true);
      expect(g.spacetime?.market ?? null).toBeNull();
      // Cada pick usa una probabilidad publicada por v3.2 para ese mercado.
      const published = new Set(
        o.markets.flatMap((m) => m.selections.map((s) => s.p.toFixed(6))).concat(o.topScorelines.map((s) => s.p.toFixed(6))),
      );
      for (const pk of g.picks) expect(published.has(pk.p.toFixed(6))).toBe(true);
      expect(g.picks.every((pk) => pk.category !== "valor")).toBe(true);
    }
  }, 120_000);

  it("NFL: el ganador viene de v3.2 y el resto de mercados sigue del snapshot", async () => {
    const { buildServerRawPlatformDataset } = await import("../src/server/platform-data");
    const { findOutlook: find } = await import("../src/server/outlook");
    const nfl = buildServerRawPlatformDataset().games.filter((g) => g.league === "nfl" && g.status !== "FT" && find(g));
    expect(nfl.length).toBeGreaterThan(0);
    for (const g of nfl) {
      const ml = find(g)!.marketsByKey.moneyline!.selections;
      const home = ml.find((s) => s.selection === "home")!.p;
      const away = ml.find((s) => s.selection === "away")!.p;
      expect(g.x12[0]).toBeCloseTo(home / (home + away), 3);
      expect(g.x12[1]).toBe(0);
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
