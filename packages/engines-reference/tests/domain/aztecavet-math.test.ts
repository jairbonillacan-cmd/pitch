/**
 * Pruebas matemáticas de cuotas, boleto/bankroll y picks del día (AztecaVet).
 * Entradas controladas + valores límite; los mensajes y umbrales replican el
 * comportamiento observable del shell original (inline_1) — OBSERVADO.
 */
import { describe, expect, it } from "vitest";
import {
  amer, calibration, curBank, evOf, money, noVigIds, parlayLegs, parlayOdds,
  pct, profit, registerBet, scorePick, slipSummary, unitOf,
  type Bet,
} from "../../src/domain/aztecavet/index.js";

// ---------- dec / cuotas (se reutiliza stats.dec vía bankroll) ----------
describe("Cuotas — decO del original", () => {
  it("acepta decimal con punto o coma y rechaza inválidas", async () => {
    const { dec } = await import("../../src/domain/stats.js");
    expect(dec("2.5")).toBe(2.5);
    expect(dec("2,5")).toBe(2.5);
    expect(dec("1.01")).toBe(1.01);
    expect(dec("1")).toBeNull();
    expect(dec("0.95")).toBeNull();
    expect(dec("")).toBeNull();
    expect(dec("abc")).toBeNull();
  });
  it("convierte americanas ±100 como el original", async () => {
    const { dec } = await import("../../src/domain/stats.js");
    expect(dec("+150")).toBeCloseTo(2.5, 12);
    expect(dec("-120")).toBeCloseTo(1 + 100 / 120, 12);
    expect(dec("150")).toBeCloseTo(2.5, 12); // ≥100 sin signo = positivo
    expect(dec("-100")).toBe(2); // 1+100/100
  });
});

// ---------- unitOf (sizing) ----------
describe("Sizing — solo 5%/10% con EV ≥ +4%", () => {
  const th = 0.6;
  it("10% si p ≥ umbral y EV pasa", () => {
    expect(unitOf(0.65, 1.8, th)).toBe(10); // EV = .17
  });
  it("5% si p < umbral y EV pasa", () => {
    expect(unitOf(0.5, 2.2, th)).toBe(5); // EV = .10
  });
  it("0 (No apostar) si EV < +4%", () => {
    expect(unitOf(0.5, 2.05, th)).toBe(0); // EV = .025
  });
  it("borde exacto EV = +4% SÍ apuesta (>= en el original)", () => {
    expect(unitOf(0.5, 2.08, th)).toBe(5); // EV = .04
  });
  it("0 si falta cuota", () => {
    expect(unitOf(0.9, null, th)).toBe(0);
  });
});

// ---------- EV y formatos ----------
describe("EV y formato monetario", () => {
  it("EV = p·d − 1 y null sin cuota", () => {
    expect(evOf(0.5, 2.3)).toBeCloseTo(0.15, 12);
    expect(evOf(0.5, null)).toBeNull();
  });
  it("money con signo negativo U+2212 y miles es-MX", () => {
    expect(money(1234)).toBe("$1,234");
    expect(money(-50)).toBe("−$50");
  });
  it("pct un decimal", () => expect(pct(0.479)).toBe("47.9%"));
});

// ---------- noVig por id ----------
describe("noVig por id de mercado", () => {
  it("normaliza y reporta el margen por grupo", () => {
    const { p, mg } = noVigIds(
      [["1X2", ["h", "d", "a"]], ["total", ["ov", "un"]]],
      (id) => ({ h: 2.5, d: 3.2, a: 3.1, ov: 1.95, un: 1.95 }[id] ?? null),
    );
    const sum = p.h! + p.d! + p.a!;
    expect(sum).toBeCloseTo(1, 12);
    // proporción: h es el favorito
    expect(p.h!).toBeGreaterThan(p.d!);
    expect(p.h!).toBeGreaterThan(p.a!);
    expect(mg[0]![0]).toBe("1X2");
    expect(mg[0]![1]).toBeCloseTo(1 / 2.5 + 1 / 3.2 + 1 / 3.1 - 1, 12);
    expect(mg[1]![1]).toBeCloseTo(2 / 1.95 - 1, 12); // margen simétrico
    expect(mg.every(([_, v]) => v > 0)).toBe(true);
  });
  it("omite grupos con cuotas incompletas", () => {
    const { p, mg } = noVigIds([["g", ["a", "b"]]], (id) => (id === "a" ? 2 : null));
    expect(Object.keys(p)).toHaveLength(0);
    expect(mg).toHaveLength(0);
  });
});

// ---------- boleto / bankroll ----------
const leg = (p: number, d: number | null, gk = "FB:MX:hoy:NEC-TIJ"): Bet["legs"][number] => ({
  l: "NEC gana", m: "NEC vs TIJ", sp: "Fútbol · Liga MX", t: "hoy", p, d,
});
const mkBet = (over: Partial<Bet> = {}): Bet => ({
  id: "btest", ts: 1730900000000, legs: [leg(0.48, 2.15)],
  p: 0.48, d: 2.15, stake: 50, u: 10, st: "p", ...over,
});

describe("Bankroll — profit/curBank con piso 0", () => {
  it("ganó: stake×(d−1); perdió: −stake; pendiente/nula: 0", () => {
    expect(profit(mkBet({ st: "w" }))).toBeCloseTo(57.5, 12);
    expect(profit(mkBet({ st: "l" }))).toBe(-50);
    expect(profit(mkBet({ st: "p" }))).toBe(0);
    expect(profit(mkBet({ st: "v" }))).toBe(0);
  });
  it("bankroll = inicial + neto, con piso 0", () => {
    const cfg = { start: 1000, th: 0.6 };
    expect(curBank([mkBet({ st: "w", stake: 50 })], cfg)).toBeCloseTo(1057.5, 12);
    expect(curBank([mkBet({ st: "l", stake: 2000 })], cfg)).toBe(0);
  });
});

describe("Boleto — resumen y registro", () => {
  it("sencilla: prob, cuota de la casa, EV y sugerencia", () => {
    const s = slipSummary([{ k: "k1", gk: "g", p: 0.48, d: 2.15 }], "", 0.6);
    expect(s.p).toBeCloseTo(0.48, 12);
    expect(s.dP).toBeCloseTo(2.15, 12);
    expect(s.ev).toBeCloseTo(0.48 * 2.15 - 1, 12);
    expect(s.sug).toBe(0); // EV = +3.2% < +4% ⇒ "No apostar"
    const s2 = slipSummary([{ k: "k1", gk: "g", p: 0.48, d: 2.2 }], "", 0.6);
    expect(s2.sug).toBe(5); // EV = +5.6% ≥ +4% y p=.48 < th=.6 ⇒ 5%
  });
  it("parlay de 2: productos de prob y cuota; cuota opcional manda", () => {
    const s = slipSummary(
      [
        { k: "k1", gk: "g1", p: 0.7, d: 1.5 },
        { k: "k2", gk: "g2", p: 0.6, d: 1.7 },
      ],
      "", 0.6,
    );
    expect(s.n).toBe(2);
    expect(s.p).toBeCloseTo(0.42, 12);
    expect(s.dP).toBeCloseTo(2.55, 12);
    expect(s.allD).toBe(true);
    const s2 = slipSummary(
      [
        { k: "k1", gk: "g1", p: 0.7, d: 1.5 },
        { k: "k2", gk: "g2", p: 0.6, d: 1.7 },
      ],
      "3.0", 0.6,
    );
    expect(s2.d).toBe(3);
    expect(s2.ev).toBeCloseTo(0.42 * 3 - 1, 12);
  });
  it("advertencia de correlación con dos selecciones del mismo partido", () => {
    const s = slipSummary(
      [
        { k: "k1", gk: "g1", p: 0.7, d: 1.5 },
        { k: "k2", gk: "g1", p: 0.6, d: 1.7 },
      ],
      "", 0.6,
    );
    expect(s.corr).toBe(true);
    expect(s.sameMatchGroups).toEqual(["g1"]);
  });
  it("registro: stake = bank×u% redondeado a centavos, estado pendiente", () => {
    const b = registerBet(
      [{ k: "k1", gk: "g1", sp: "Fútbol · Liga MX", m: "NEC vs TIJ", l: "NEC gana", p: 0.479, d: 2.2, t: "hoy" }],
      "", 10, 1000, 1730900000000,
    );
    expect(b).not.toBeNull();
    expect(b!.st).toBe("p");
    expect(b!.stake).toBe(100); // 1000×10%
    expect(b!.p).toBeCloseTo(0.479, 4);
    expect(b!.d).toBeCloseTo(2.2, 3);
    expect(b!.id.startsWith("b")).toBe(true);
  });
  it("registro rechaza sin cuota o sin unit", () => {
    expect(registerBet([{ k: "k", gk: "g", sp: "s", m: "m", l: "l", p: 0.5, d: null, t: "t" }], "", null, 1000, 1)).toBeNull();
  });
});

describe("Calibración — branching exacto del original", () => {
  const bet = (p: number, st: "w" | "l"): Bet => ({
    id: "b" + p + st, ts: 0, legs: [leg(p, 2)], p, d: 2, stake: 10, u: 5, st,
  });
  it("<30 apuestas: 'sobre todo suerte'", () => {
    const bets = Array.from({ length: 10 }, (_, i) => bet(i % 2 ? 0.6 : 0.4, i % 2 ? "w" : "l"));
    expect(calibration(bets)).toContain("menos de 30 apuestas");
  });
  it("≥30 con |Δ|<4pp: 'bien calibrado'", () => {
    const bets: Bet[] = [];
    for (let i = 0; i < 100; i++) bets.push(bet(0.5, i % 2 ? "w" : "l")); // 50% real vs 50% modelo
    expect(calibration(bets)).toContain("bien calibrado");
  });
  it("≥30 acertando más de lo esperado", () => {
    const bets: Bet[] = [];
    for (let i = 0; i < 100; i++) bets.push(bet(0.4, "w")); // 100% vs 40%
    expect(calibration(bets)).toContain("acertando más");
  });
  it("≥30 acertando menos de lo esperado", () => {
    const bets: Bet[] = [];
    for (let i = 0; i < 100; i++) bets.push(bet(0.9, "l")); // 0% vs 90%
    expect(calibration(bets)).toContain("acertando menos");
  });
});

// ---------- Picks del día ----------
describe("PICK DEL DÍA — scoring del original", () => {
  const c = (pk: { id: string; l: string; p: number }, b: { o: { id: string; l: string; p: number }; ev: number; d: number } | null, nob = false) => ({
    g: {}, pk, b, nob,
  });
  it("sin valor → −1; con valor → 2+p", () => {
    expect(scorePick(c({ id: "h", l: "x", p: 0.5 }, null, true))).toBe(-1);
    expect(scorePick(c({ id: "h", l: "x", p: 0.62 }, { o: { id: "h", l: "x", p: 0.62 }, ev: 0.1, d: 2 }))).toBeCloseTo(2.62, 12);
  });
  it("<55% → −.5; >72% → penalización; entre → p", () => {
    expect(scorePick(c({ id: "h", l: "x", p: 0.5 }, null))).toBe(-0.5);
    expect(scorePick(c({ id: "h", l: "x", p: 0.8 }, null))).toBeCloseTo(0.72 - 2 * 0.08, 12);
    expect(scorePick(c({ id: "h", l: "x", p: 0.65 }, null))).toBeCloseTo(0.65, 12);
  });
});

describe("PARLAY DEL DÍA — selección 60–80% y cuota de respaldo", () => {
  const pxids = ["h", "a", "ov", "un"];
  it("elige de m.O el mercado más probable dentro de 60–80%", () => {
    const L = [
      {
        g: {}, nob: false, b: null,
        pk: { id: "h", l: "x gana", p: 0.66 },
        m: { O: [{ id: "h", p: 0.66 }, { id: "ov", p: 0.75 }, { id: "un", p: 0.25 }, { id: "d", p: 0.55 }] },
      },
    ];
    const legs = parlayLegs(L as never, () => undefined, () => "k", pxids);
    expect(legs).toHaveLength(1);
    expect(legs[0]!.o.id).toBe("ov"); // 0.75 > 0.66, ambos en rango
    expect(legs[0]!.real).toBe(false);
    expect(legs[0]!.d).toBeCloseTo(1 / (0.75 * 1.05), 12); // no-cb → ×1.05
  });
  it("respaldo ×1.10 para combinadas cb_/dco", () => {
    const L = [{
      g: {}, nob: false, b: null,
      pk: { id: "cb_o2.5", l: "combinada", p: 0.62 },
      m: { O: [{ id: "cb_o2.5", p: 0.62 }] },
    }];
    const legs = parlayLegs(L as never, () => undefined, () => "k", pxids);
    expect(legs[0]!.d).toBeCloseTo(1 / (0.62 * 1.1), 12);
  });
  it("usa la cuota real cuando existe", () => {
    const L = [{
      g: {}, nob: false, b: null,
      pk: { id: "h", l: "x", p: 0.65 },
      m: { O: [{ id: "h", p: 0.65 }] },
    }];
    const legs = parlayLegs(L as never, () => "1.9", () => "k", pxids);
    expect(legs[0]!.real).toBe(true);
    expect(legs[0]!.d).toBeCloseTo(1.9, 12);
  });
  it("totales del parlay = productos", () => {
    const tot = parlayOdds([
      { g: {}, o: { id: "h", l: "x", p: 0.7 }, k: "k1", real: true, d: 1.5 },
      { g: {}, o: { id: "ov", l: "y", p: 0.6 }, k: "k2", real: true, d: 1.7 },
    ]);
    expect(tot.p).toBeCloseTo(0.42, 12);
    expect(tot.d).toBeCloseTo(2.55, 12);
  });
  it("formato americano del original", () => {
    expect(amer(2.5)).toBe("+150");
    expect(amer(1.5)).toBe("-200");
  });
});
