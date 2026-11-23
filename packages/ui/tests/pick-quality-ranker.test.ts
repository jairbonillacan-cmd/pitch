import fc from "fast-check";
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

  it("propiedad fast-check: jamas oculta picks en partidos FT ni picks liquidados", () => {
    const arbPick = fc.record({
      id: fc.uuid(),
      market: fc.constantFrom("btts", "double_chance", "totals_1_5", "1x2", "totals_over_2_5"),
      label: fc.constantFrom(
        "Ambos anotan — Sí",
        "Real Sociedad o empate (X2)",
        "Más de 1.5 goles",
        "Gana Barcelona",
        "Más de 2.5 goles",
      ),
      decimal: fc.double({ min: 1.08, max: 4.5, noNaN: true, noDefaultInfinity: true }),
      evPct: fc.option(fc.double({ min: -8, max: 18, noNaN: true, noDefaultInfinity: true }), {
        nil: null,
      }),
      isSettled: fc.boolean(),
      gameStatus: fc.constantFrom("NS", "FT"),
    });

    fc.assert(
      fc.property(fc.array(arbPick, { minLength: 1, maxLength: 20 }), (picks) => {
        const preserved = partitionPlayableAndConservative(picks, { preserveAll: true });
        expect(preserved.conservative).toEqual([]);
        expect(preserved.playable).toHaveLength(picks.length);

        const regular = partitionPlayableAndConservative(picks);
        expect(regular.playable.length + regular.conservative.length).toBe(picks.length);
        for (const hidden of regular.conservative) {
          expect(hidden.isSettled).toBe(false);
          expect(hidden.gameStatus).not.toBe("FT");
        }
      }),
      { numRuns: 150 },
    );
  });

  it("propiedad fast-check: scorePlayablePick es finito y prefiere rango 1.55-2.60 sobre chalk < 1.45", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.4, max: 0.65, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1.55, max: 2.6, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1.08, max: 1.4, noNaN: true, noDefaultInfinity: true }),
        (pVal, playableDec, chalkDec) => {
          const sPlayable = scorePlayablePick({
            market: "btts",
            label: "Ambos anotan — Sí",
            p: pVal,
            decimal: playableDec,
            evPct: 2.5,
          });
          const sChalk = scorePlayablePick({
            market: "double_chance",
            label: "Equipo o empate (1X)",
            p: 0.8,
            decimal: chalkDec,
            evPct: 0.5,
          });
          expect(Number.isFinite(sPlayable)).toBe(true);
          expect(Number.isFinite(sChalk)).toBe(true);
          expect(sPlayable).toBeGreaterThan(sChalk);
        },
      ),
      { numRuns: 150 },
    );
  });
});
