import { describe, expect, it } from "vitest";
import {
  isConservativeChalkPick,
  isDoubleChancePick,
  partitionPlayableAndConservative,
  scorePlayablePick,
  selectHeadlineMatchPick,
} from "../src/platform/pick-quality-ranker";

describe("pick-quality-ranker (Q2 playable value priority)", () => {
  it("detecta Doble oportunidad y momios conservadores < 1.45", () => {
    expect(isDoubleChancePick("double_chance", "Real Sociedad o empate")).toBe(true);
    expect(isDoubleChancePick("totals_over_2_5", "Más de 2.5 goles")).toBe(false);
    expect(isConservativeChalkPick("double_chance", "Real Sociedad o empate", 1.25)).toBe(true);
    expect(isConservativeChalkPick("totals_1_5", "Más de 1.5 goles", 1.27)).toBe(true);
    expect(isConservativeChalkPick("btts", "Ambos anotan — Sí", 1.78)).toBe(false);
  });

  it("prioriza picks jugables (1.55–2.60) con valor real sobre -400 o empate", () => {
    const chalk = {
      id: "dc",
      market: "double_chance",
      label: "Real Sociedad o empate (X2)",
      p: 0.8,
      fairDecimal: 1.25,
    };
    const playable = {
      id: "btts",
      market: "btts",
      label: "Ambos anotan — Sí",
      p: 0.56,
      fairDecimal: 1.78,
      marketDecimal: 1.9,
    };
    const moneyline = {
      id: "ml",
      market: "1x2",
      label: "Real Sociedad gana",
      p: 0.52,
      fairDecimal: 1.92,
      marketDecimal: 1.95,
    };

    const chosen = selectHeadlineMatchPick([chalk, moneyline, playable]);
    expect(chosen?.id).toBe("btts");
    expect(chosen?.id).not.toBe("dc");
    expect(
      scorePlayablePick({ market: playable.market, label: playable.label, p: playable.p, decimal: 1.9, evPct: 6.4 }),
    ).toBeGreaterThan(
      scorePlayablePick({ market: chalk.market, label: chalk.label, p: chalk.p, decimal: 1.25 }),
    );
  });

  it("separa jugables de conservadores preservando respaldo si todos fueran conservadores", () => {
    const split = partitionPlayableAndConservative([
      { id: "1", market: "btts", label: "Ambos anotan — Sí", decimal: 1.85 },
      { id: "2", market: "double_chance", label: "Chivas o empate", decimal: 1.32 },
      { id: "3", market: "totals_1_5", label: "Más de 1.5 goles", decimal: 1.28 },
    ]);
    expect(split.playable.map((x) => x.id)).toEqual(["1"]);
    expect(split.conservative.map((x) => x.id)).toEqual(["2", "3"]);

    const allChalk = partitionPlayableAndConservative([
      { id: "c1", market: "double_chance", label: "1X", decimal: 1.25 },
    ]);
    expect(allChalk.playable.map((x) => x.id)).toEqual(["c1"]);
    expect(allChalk.conservative).toEqual([]);
  });
});
