import { describe, expect, it } from "vitest";
import { createNbaTracker, createNhlTracker, regulationScore, restDays, type UsGame } from "../src/index.js";

const g = (date: string, home: string, away: string, hs: number, as: number, extra: Partial<UsGame> = {}): UsGame => ({
  date,
  season: "2025-26",
  home,
  away,
  homeScore: hs,
  awayScore: as,
  ...extra,
});

describe("descanso", () => {
  it("0 días = back-to-back; null si no hay partido previo", () => {
    expect(restDays("2026-01-01", "2026-01-02")).toBe(0);
    expect(restDays("2026-01-01", "2026-01-04")).toBe(2);
    expect(restDays(undefined, "2026-01-04")).toBeNull();
  });
});

describe("NBA", () => {
  it("con ratings iguales el local es favorito y el back-to-back resta", () => {
    const t = createNbaTracker({ wellRested: 0, altitudeBonus: 0 });
    const fresh = t.predict({ date: "2026-01-10", season: "2025-26", home: "A", away: "B" });
    expect(fresh.pHome).toBeGreaterThan(0.5);
    t.update(g("2026-01-09", "A", "C", 110, 110));
    const tired = t.predict({ date: "2026-01-10", season: "2025-26", home: "A", away: "B" });
    expect(tired.restHome).toBe(0);
    expect(tired.pHome).toBeLessThan(fresh.pHome);
  });

  it("aprende del margen y regresa a la media al cambiar de temporada", () => {
    const t = createNbaTracker();
    for (let i = 0; i < 20; i++) t.update(g(`2026-01-${String(i + 1).padStart(2, "0")}`, "A", "B", 125, 100));
    const net = t.ratings().A!.net;
    expect(net).toBeGreaterThan(5);
    t.predict({ date: "2026-10-20", season: "2026-27", home: "A", away: "B" });
    expect(t.ratings().A!.net).toBeLessThan(net);
  });

  it("Denver tiene bono de altitud en casa", () => {
    const t = createNbaTracker();
    const den = t.predict({ date: "2026-01-10", season: "2025-26", home: "Denver Nuggets", away: "B" });
    const other = t.predict({ date: "2026-01-10", season: "2025-26", home: "A", away: "B" });
    expect(den.expectedMargin).toBeGreaterThan(other.expectedMargin);
  });
});

describe("NHL", () => {
  it("el gol de tiempo extra no cuenta como tiempo regular", () => {
    expect(regulationScore(g("2026-01-01", "A", "B", 3, 2, { overtime: true }))).toEqual({ home: 2, away: 2 });
    expect(regulationScore(g("2026-01-01", "A", "B", 2, 3, { shootout: true }))).toEqual({ home: 2, away: 2 });
    expect(regulationScore(g("2026-01-01", "A", "B", 4, 1))).toEqual({ home: 4, away: 1 });
  });

  it("la probabilidad suma empate de regulación resuelto en tiempo extra", () => {
    const t = createNhlTracker({ overtimeTilt: 0 });
    const p = t.predict({ date: "2026-01-10", season: "2025-26", home: "A", away: "B" });
    expect(p.pRegulationDraw).toBeGreaterThan(0.15);
    expect(p.pHome).toBeCloseTo(p.pHomeRegulation + p.pRegulationDraw / 2, 6);
    expect(p.pHome).toBeGreaterThan(0.5);
  });

  it("un equipo que anota más sube su tasa", () => {
    const t = createNhlTracker();
    const before = t.predict({ date: "2026-01-01", season: "2025-26", home: "A", away: "B" }).expectedHome;
    for (let i = 0; i < 10; i++) t.update(g(`2026-01-${String(i + 2).padStart(2, "0")}`, "A", "C", 6, 1));
    const after = t.predict({ date: "2026-02-01", season: "2025-26", home: "A", away: "B" }).expectedHome;
    expect(after).toBeGreaterThan(before);
  });
});
