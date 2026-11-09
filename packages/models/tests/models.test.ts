import { describe, expect, it } from "vitest";
import {
  fitDixonColes,
  fitNflRatings,
  makeRng,
  normalCdf,
  poissonPmf,
  predictFootball,
  predictNfl,
  scoreMatrix,
  type FootballMatchRow,
} from "../src/index.js";

/** Genera una liga sintética con fuerzas conocidas y muestreo determinista. */
function syntheticFootballLeague(): {
  matches: FootballMatchRow[];
  attack: Record<string, number>;
} {
  const teams = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const attack: Record<string, number> = {};
  teams.forEach((t, i) => {
    attack[t] = 1.6 - i * 0.16;
  });
  const defense: Record<string, number> = {};
  teams.forEach((t, i) => {
    defense[t] = 0.65 + i * 0.09;
  });

  const rng = makeRng("synthetic-league-v1");
  const samplePoisson = (lambda: number): number => {
    const pmf = poissonPmf(Math.min(lambda, 8), 12);
    const u = rng();
    let acc = 0;
    for (let k = 0; k < pmf.length; k++) {
      acc += pmf[k]!;
      if (u <= acc) return k;
    }
    return pmf.length - 1;
  };

  const matches: FootballMatchRow[] = [];
  const dates = ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"];
  let round = 0;
  for (const date of dates) {
    for (let i = 0; i < teams.length; i++) {
      for (let j = 0; j < teams.length; j++) {
        if (i === j) continue;
        const home = teams[i]!;
        const away = teams[j]!;
        matches.push({
          date,
          home,
          away,
          homeGoals: samplePoisson(1.35 * attack[home]! * defense[away]! * 1.2),
          awayGoals: samplePoisson(1.35 * attack[away]! * defense[home]!),
        });
      }
    }
    round++;
  }
  void round;
  return { matches, attack };
}

describe("fútbol v2 — Dixon-Coles", () => {
  it("estima ataque/defensa y converge", () => {
    const { matches } = syntheticFootballLeague();
    const model = fitDixonColes(matches, { referenceDate: "2026-09-20" });

    expect(model.matches).toBe(matches.length);
    expect(model.converged).toBe(true);
    expect(model.homeAdvantage).toBeGreaterThan(1);
    expect(model.homeAdvantage).toBeLessThan(1.6);
    expect(model.baseRate).toBeGreaterThan(1);
    expect(model.baseRate).toBeLessThan(2);

    // El orden de ataque estimado debe seguir al orden real.
    expect(model.attack.a!).toBeGreaterThan(model.attack.h!);
    expect(model.attack.b!).toBeGreaterThan(model.attack.g!);
  });

  it("es determinista", () => {
    const { matches } = syntheticFootballLeague();
    const a = fitDixonColes(matches, { referenceDate: "2026-09-20" });
    const b = fitDixonColes(matches, { referenceDate: "2026-09-20" });
    expect(a.attack).toEqual(b.attack);
    expect(a.rho).toBe(b.rho);
    expect(a.homeAdvantage).toBe(b.homeAdvantage);
  });

  it("las probabilidades suman 1 y respetan la jerarquía de goles", () => {
    const { matches } = syntheticFootballLeague();
    const model = fitDixonColes(matches, { referenceDate: "2026-09-20" });
    const prediction = predictFootball(model, "a", "h");

    const sum =
      prediction.probabilities.home +
      prediction.probabilities.draw +
      prediction.probabilities.away;
    expect(sum).toBeCloseTo(1, 6);
    expect(prediction.probabilities.home).toBeGreaterThan(prediction.probabilities.away);

    const over15 = prediction.totals.find((t) => t.line === 1.5)!;
    const over25 = prediction.totals.find((t) => t.line === 2.5)!;
    const over35 = prediction.totals.find((t) => t.line === 3.5)!;
    expect(over15.over).toBeGreaterThan(over25.over);
    expect(over25.over).toBeGreaterThan(over35.over);
    expect(over25.over + over25.under).toBeCloseTo(1, 9);
  });

  it("publica intervalos de incertidumbre coherentes", () => {
    const { matches } = syntheticFootballLeague();
    const model = fitDixonColes(matches, { referenceDate: "2026-09-20" });
    const prediction = predictFootball(model, "a", "b");

    expect(prediction.intervals.homeWin[0]).toBeLessThanOrEqual(
      prediction.intervals.homeWin[1],
    );
    expect(prediction.intervals.total[0]).toBeLessThan(prediction.intervals.total[1]);
    expect(prediction.intervals.total[0]).toBeGreaterThan(0);
  });

  it("la matriz de marcadores está normalizada", () => {
    const matrix = scoreMatrix(1.6, 1.1, -0.08, 11);
    const total = matrix.flat().reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(matrix.every((row) => row.every((v) => v >= 0))).toBe(true);
  });

  it("sin datos devuelve un modelo neutro en vez de romperse", () => {
    const model = fitDixonColes([]);
    expect(model.matches).toBe(0);
    expect(model.attack).toEqual({});
    const prediction = predictFootball(model, "a", "b");
    expect(Number.isFinite(prediction.lambdaHome)).toBe(true);
  });
});

describe("NFL v2 — ratings ridge", () => {
  function syntheticNfl() {
    const teams = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const strength: Record<string, number> = {};
    teams.forEach((t, i) => {
      strength[t] = 8 - i * 2;
    });
    const rng = makeRng("synthetic-nfl-v1");
    const jitter = () => (rng() - 0.5) * 8;

    const rows = [];
    for (let week = 1; week <= 8; week++) {
      for (let i = 0; i < teams.length; i += 2) {
        const home = teams[i]!;
        const away = teams[i + 1]!;
        rows.push({
          week,
          date: `2026-09-${String(7 + week).padStart(2, "0")}`,
          home,
          away,
          homeScore: Math.round(23 + strength[home]! + 1.5 - strength[away]! * 0.5 + jitter()),
          awayScore: Math.round(23 + strength[away]! - 1.5 - strength[home]! * 0.5 + jitter()),
        });
      }
    }
    return rows;
  }

  it("estima ratings ajustados por rival y converge", () => {
    const rows = syntheticNfl();
    const model = fitNflRatings(rows);

    expect(model.games).toBe(rows.length);
    expect(model.converged).toBe(true);
    expect(model.offense.A!).toBeGreaterThan(model.offense.H!);
    expect(model.sigmaMargin).toBeGreaterThan(0);
    expect(model.sigmaTotal).toBeGreaterThan(0);
    expect(model.intercept).toBeGreaterThan(15);
    expect(model.intercept).toBeLessThan(32);
  });

  it("es determinista y produce probabilidades válidas", () => {
    const rows = syntheticNfl();
    const a = fitNflRatings(rows);
    const b = fitNflRatings(rows);
    expect(a.offense).toEqual(b.offense);

    const prediction = predictNfl(a, "A", "H");
    expect(prediction.pHome).toBeGreaterThan(0.5);
    expect(prediction.pHome + prediction.pAway).toBeCloseTo(1, 9);
    expect(prediction.spread.home + prediction.spread.away).toBeCloseTo(1, 9);
    expect(prediction.totals.over + prediction.totals.under).toBeCloseTo(1, 9);
    expect(prediction.totals.line % 0.5).toBe(0);
  });

  it("la localía desaparece en campo neutral", () => {
    const rows = syntheticNfl();
    const model = fitNflRatings(rows);
    const home = predictNfl(model, "A", "A");
    const neutral = predictNfl(model, "A", "A", { neutralSite: true });
    expect(home.margin).toBeGreaterThan(neutral.margin);
  });

  it("converge con una muestra grande de varias temporadas", () => {
    const teams = Array.from({ length: 32 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`);
    const strength: Record<string, number> = {};
    teams.forEach((team, i) => {
      strength[team] = 8 - (i % 16) * 0.9;
    });
    const rng = makeRng("synthetic-nfl-large");
    const jitter = () => (rng() - 0.5) * 8;

    const rows = [];
    for (let season = 0; season < 2; season++) {
      for (let week = 1; week <= 10; week++) {
        for (let i = 0; i < teams.length; i += 2) {
          const home = teams[i]!;
          const away = teams[i + 1]!;
          rows.push({
            week,
            date: `2025-09-${String(7 + week).padStart(2, "0")}`,
            home,
            away,
            homeScore: Math.round(23 + strength[home]! + 1.5 - strength[away]! * 0.5 + jitter()),
            awayScore: Math.round(23 + strength[away]! - 1.5 - strength[home]! * 0.5 + jitter()),
          });
        }
      }
    }

    const model = fitNflRatings(rows);
    expect(rows.length).toBe(320);
    expect(model.converged).toBe(true);
    expect(model.intercept).toBeGreaterThan(15);
    expect(model.intercept).toBeLessThan(32);
    expect(model.sigmaMargin).toBeLessThan(40);
    expect(model.sigmaTotal).toBeLessThan(40);
  });

  it("sin datos devuelve un modelo neutro en vez de romperse", () => {
    const model = fitNflRatings([]);
    expect(model.games).toBe(0);
    const prediction = predictNfl(model, "A", "B");
    expect(Number.isFinite(prediction.margin)).toBe(true);
  });
});

describe("utilidades numéricas", () => {
  it("normalCdf reproduce valores conocidos", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("poissonPmf suma 1", () => {
    const pmf = poissonPmf(1.7, 20);
    expect(pmf.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
  });
});
