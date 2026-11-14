import { describe, expect, it } from "vitest";
import { decodeForensicTag, encodeForensicTag, getSessionWatermark } from "../src/platform/access-guard";
import { edgeAgainstBook } from "../src/platform/club/OddsCompareView";
import { groupRates } from "../src/platform/club/HistorialClubView";
import { parseForm } from "../src/platform/club/match/MatchContextPanel";
import { mulberry32, SimAccumulator, simulateScore } from "../src/platform/club/match/simulation";

describe("marca contra filtraciones", () => {
  it("usa la identidad real del socio, no una fija", () => {
    expect(getSessionWatermark("member", { handle: "lupita_mx", referralCode: "LUPI-2611" })).toBe("@lupita_mx · LUPI-2611");
    expect(getSessionWatermark("member", { handle: "lupita_mx" })).toBe("@lupita_mx");
    expect(getSessionWatermark("member", null)).toBe("PITCHLAB · SOCIO BETA");
    expect(getSessionWatermark("visitor", null)).toBe("PITCHLAB · VISTA PREVIA");
  });

  it("la huella invisible viaja con el texto y se recupera", () => {
    const tag = encodeForensicTag("@lupita_mx · LUPI-2611");
    expect(tag.replace(/[​‌⁠]/g, "")).toBe("");
    expect(decodeForensicTag(`Pick: Querétaro o empate${tag}`)).toBe("@lupita_mx · LUPI-2611");
    expect(decodeForensicTag("texto sin huella")).toBeNull();
  });
});

describe("simulador del partido", () => {
  it("fútbol: 10,000 corridas se acercan al 1X2 de Poisson", () => {
    const rng = mulberry32(42);
    const acc = new SimAccumulator("football");
    const input = { sport: "football" as const, homeExpected: 1.53, awayExpected: 1.41, pHome: 0.53 };
    for (let i = 0; i < 10_000; i++) acc.add(simulateScore(input, rng));
    const s = acc.summary();
    expect(s.runs).toBe(10_000);
    expect(s.home + s.draw + s.away).toBeCloseTo(1, 10);
    // Poisson puro con esas λ: ~40 % local, ~25 % empate, ~35 % visita.
    expect(s.home).toBeGreaterThan(0.36);
    expect(s.home).toBeLessThan(0.44);
    expect(s.draw).toBeGreaterThan(0.21);
    expect(s.draw).toBeLessThan(0.29);
    expect(s.topScores[0]!.share).toBeGreaterThan(s.topScores[4]!.share);
  });

  it("NFL: nunca termina empatado", () => {
    const rng = mulberry32(7);
    const acc = new SimAccumulator("american-football");
    const input = { sport: "american-football" as const, homeExpected: 23.8, awayExpected: 22.6, pHome: 0.55 };
    for (let i = 0; i < 2_000; i++) acc.add(simulateScore(input, rng));
    expect(acc.summary().draw).toBe(0);
  });
});

describe("contexto, resultados y momios", () => {
  it("lee la forma reciente", () => {
    expect(parseForm("P-G-G-G-G · 4-1")).toEqual(["P", "G", "G", "G", "G"]);
    expect(parseForm("W-D-L")).toEqual(["G", "E", "P"]);
  });

  it("agrupa el acierto de más a menos partidos", () => {
    const rates = groupRates(
      [
        { l: "mx", hit: true },
        { l: "mx", hit: false },
        { l: "mx", hit: true },
        { l: "nfl", hit: true },
      ],
      (x) => ({ key: x.l, label: x.l }),
      (x) => x.hit,
    );
    expect(rates).toEqual([
      { key: "mx", label: "mx", hits: 2, total: 3 },
      { key: "nfl", label: "nfl", hits: 1, total: 1 },
    ]);
  });

  it("ventaja contra el momio de tu casa en puntos", () => {
    expect(edgeAgainstBook(0.6, 1.8)).toBe(4.4);
    expect(edgeAgainstBook(0.5, 1.8)).toBe(-5.6);
  });
});
