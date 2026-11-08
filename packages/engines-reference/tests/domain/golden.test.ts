/**
 * Tests dorados: el motor reconstruido debe reproducir EXACTAMENTE los números
 * observados en la UI viva de touchiq.com.mx y en el harness offline
 * (touchiq-analysis/engine/engine-nfl.js). Tolerancia 1e-9 (misma aritmética).
 */
import { describe, expect, it } from "vitest";
import { NflEngine } from "../../src/domain/engine-nfl.js";
import { NcaaEngine } from "../../src/domain/engine-ncaa.js";
import { dec, half, iphi, phi, poisCDF } from "../../src/domain/stats.js";
import { noVig, profit, unitOf, curBank, fairDefault, typ, roiBy } from "../../src/domain/betting.js";
import { fct, shr, pmk, pprob, safeAlt } from "../../src/domain/props.js";
import { nfl, ncaa } from "../../src/data/index.js";
import type { Bet } from "../../src/domain/betting.js";

const engine = new NflEngine({
  teams: nfl.teams,
  results: nfl.results,
  audit: nfl.audit,
  injuries: nfl.injuries,
  constants: nfl.constants,
});

describe("stats base", () => {
  it("phi(0)=0.5 y phi simétrica", () => {
    expect(phi(0)).toBeCloseTo(0.5, 5); // la aprox. AS del original tiene ε≈1.5e-7
    expect(phi(1.96)).toBeGreaterThan(0.97);
    expect(phi(-1.96)).toBeLessThan(0.03);
  });
  it("iphi es inversa de phi", () => {
    for (const p of [0.3, 0.5, 0.62, 0.65, 0.72]) {
      expect(phi(iphi(p))).toBeCloseTo(p, 5);
    }
  });
  it("half siempre deja líneas a .5", () => {
    expect(half(9)).toBe(9.5);
    expect(half(8.3)).toBe(8.5);
    expect(half(6.2)).toBe(6.5);
  });
  it("poisCDF acumula", () => {
    expect(poisCDF(0, 1)).toBeCloseTo(Math.exp(-1), 12);
    expect(poisCDF(1000, 1)).toBeCloseTo(1, 10);
  });
  it("dec acepta decimal y americana", () => {
    expect(dec("2.4")).toBe(2.4);
    expect(dec("2,4")).toBe(2.4);
    expect(dec("-175")).toBeCloseTo(1 + 100 / 175, 12);
    expect(dec("+145")).toBe(2.45);
    expect(dec("1.05")).toBe(1.05);
    expect(dec("0.9")).toBeNull();
    expect(dec("")).toBeNull();
  });
});

describe("motor NFL — números dorados de la UI viva (7 nov 2026)", () => {
  it("WAS vs LAR: pick del día LAR gana (ML) 67.8% ≈1.40", () => {
    const m = engine.model("WAS", "LAR");
    expect(m.pH).toBeCloseTo(0.322, 2);
    const mla = m.O.find((o) => o.id === "mla");
    expect(mla?.p).toBeCloseTo(0.678, 2);
    expect(mla?.l).toBe("LAR gana (ML)");
    expect(m.ct).toBe("ML · DOMINA EN OFENSIVA Y DEFENSIVA");
    // cuota default del pick card: 1/(p·1.05) ≈ 1.40
    expect(fairDefault(mla!.p, false)).toBeCloseTo(1.405, 2);
  });
  it("LAC vs HOU: HOU gana (ML) 66.2% ≈1.44", () => {
    const m = engine.model("LAC", "HOU");
    expect(1 - m.pH).toBeCloseTo(0.662, 2);
    expect(fairDefault(1 - m.pH, false)).toBeCloseTo(1.44, 2);
  });
  it("SEA vs ARI: a3f SEA −3.5 66.2% y pick hf −5.5 (favorito claro ≥72%)", () => {
    const m = engine.model("SEA", "ARI");
    const a3f = m.O.find((o) => o.id === "a3f");
    expect(a3f?.p).toBeCloseTo(0.662, 2);
    expect(m.pH).toBeGreaterThanOrEqual(0.72);
    expect(m.cp?.id).toBe("hf");
    expect(m.ct).toBe("FAVORITO CLARO · GANA POR 6 O MÁS");
  });
  it("IND vs DAL: pick IND +5.5 65.5% (juego parejo)", () => {
    const m = engine.model("IND", "DAL");
    expect(m.cp?.l).toBe("IND +5.5");
    expect(m.cp?.p).toBeCloseTo(0.655, 2);
    expect(m.ct).toBe("JUEGO PAREJO · PUNTOS AL NO FAVORITO");
  });
  it("ATL vs CIN: chip IA 'gana CIN 56%'", () => {
    const m = engine.model("ATL", "CIN");
    expect(1 - m.pH).toBeCloseTo(0.562, 2); // → toFixed(0) = "56%"
  });
  it("mercados completos de WAS@LAR (14 + hf = 15)", () => {
    const m = engine.model("WAS", "LAR");
    const ids = m.O.map((o) => o.id);
    for (const id of ["mlh","mla","plf","pld","ov","un","tho","thu","tao","tau","a3f","a3d","a7f","a7d"]) { // WAS@LAR es rama ML: sin hf
      expect(ids).toContain(id);
    }
    expect(m.O.find((o) => o.id === "plf")?.l).toBe("LAR −6.5");
    expect(m.O.find((o) => o.id === "ov")?.l).toBe("Over 50.5");
    expect(m.tot).toBeCloseTo(49.8, 1);
    expect(m.mu).toBeCloseTo(-6.2, 1);
  });
});

describe("auditoría — modo pre-partido (sin lesiones, sin el juego en la fuerza)", () => {
  it("BAL@JAX: pick almacenado 'JAX −8.5' ✓ con marcador 10-33", () => {
    const m = engine.modelAudit("BAL", "JAX");
    expect(m.pH).toBeCloseTo(0.271, 2); // JAX 72.9% ≥ 72% → favorito claro
    const mla = m.O.find((o) => o.id === "mla");
    expect(mla?.f(10, 33)).toBe(true); // JAX (visitante) ganó 10-33
    const pld = m.O.find((o) => o.id === "pld"); // BAL +L perdió
    expect(pld?.f(10, 33)).toBe(false);
  });
});

describe("NCAA — motor con conferencias", () => {
  it("usa HFA .56, K=3, SDM 15.5 y CONF por fuerza", () => {
    const e = new NcaaEngine({
      teams: ncaa.teams,
      results: ncaa.results,
      injuries: [],
      constants: ncaa.constants,
      lgp: 28,
    });
    const m = e.model("MICH", "MSU");
    expect(m.pH).toBeGreaterThan(0.5); // MICH favorito (pick UI: MICH ML 71.5%)
    expect(m.ct).toMatch(/ML/);
    expect(m.O.every((o) => !/^cb_/.test(o.id))).toBe(true); // sin combinadas
  });
});

describe("betting / bankroll", () => {
  const bet = (over: Partial<Bet>): Bet => ({
    id: "b1", ts: 0, legs: [{ l: "X gana (ML)", m: "ML", sp: "NFL", p: 0.678, d: 1.47 }],
    p: 0.678, d: 1.47, stake: 100, u: 10, st: "p", ...over,
  });
  it("profit por estado", () => {
    expect(profit(bet({ st: "w" }))).toBeCloseTo(47);
    expect(profit(bet({ st: "l" }))).toBe(-100);
    expect(profit(bet({ st: "p" }))).toBe(0);
    expect(profit(bet({ st: "v" }))).toBe(0);
  });
  it("sizing 10/5/0 del original", () => {
    expect(unitOf(0.65, 1.7, 0.6)).toBe(10); // p≥th y EV>0
    expect(unitOf(0.55, 1.9, 0.6)).toBe(5); // valor con confianza menor
    expect(unitOf(0.678, 1.4, 0.6)).toBe(0); // EV≤0 → "No apostar"
    expect(unitOf(0.678, null, 0.6)).toBe(0); // sin cuota
  });
  it("curBank con piso 0", () => {
    expect(curBank([bet({ st: "w" })], { start: 1000, th: 0.6 })).toBe(1047);
    expect(curBank([bet({ st: "l" }), bet({ st: "l" }), bet({ st: "l" }), bet({ st: "l" })],
      { start: 300, th: 0.6 })).toBe(0);
  });
  it("noVig quita el margen (ej. DK: CIN −175 / ATL +145)", () => {
    const { p, mg } = noVig([["ml", [dec("-175"), dec("+145")]]]);
    expect(mg[0][1]).toBeCloseTo(0.0446, 3);
    expect(p["ml:0"]).toBeCloseTo(0.6092, 3);
    expect(p["ml:1"]).toBeCloseTo(0.3908, 3);
  });
  it("typ clasifica como el original", () => {
    expect(typ(bet({}))).toBe("Sencilla");
    expect(typ(bet({ legs: [bet({}).legs[0]!, bet({}).legs[0]!] }))).toBe("Parlay");
  });
  it("roiBy agrupa y ordena", () => {
    const rows = roiBy([bet({ st: "w" }), bet({ st: "l", legs: [bet({}).legs[0]!, bet({}).legs[0]!] })],
      (b) => typ(b));
    expect(rows[0]?.k).toBe("Sencilla");
  });
});

describe("props de jugadores", () => {
  it("fct aplica mitad del exceso vs liga", () => {
    expect(fct(220, 220)).toBe(1);
    expect(fct(330, 220)).toBeCloseTo(1.25);
    expect(fct(110, 220)).toBeCloseTo(0.75);
  });
  it("shr frena hacia el prior (2 juegos)", () => {
    expect(shr(300, 2, 225)).toBeCloseTo((300 + 450) / 4);
  });
  it("pprob por tipo", () => {
    expect(pprob({ id: "td", lab: "", mu: 0.6931, kind: "td" }, 0.5)).toBeCloseTo(0.5, 2);
    expect(pprob({ id: "r", lab: "", mu: 4, kind: "p" }, 3.5)).toBeCloseTo(1 - poisCDF(3, 4), 10);
  });
  it("safeAlt busca P(over)≈0.68 en Poisson", () => {
    const L = safeAlt({ id: "r", lab: "", mu: 4.6, kind: "p" });
    expect(L).not.toBeNull();
    if (L != null) expect(1 - poisCDF(Math.floor(L), 4.6)).toBeGreaterThanOrEqual(0.68);
  });
  it("pmk QB genera yardas de pase + TD de pase con defensa", () => {
    const df = { BUF: [6, 90, 800, 600] as [number, number, number, number] };
    const ms = pmk(
      { t: "MIA", n: "Tua Tagovailoa (QB)", pos: "QB", g: 6, py: 1500, ptd: 10, ry: 8, ryy: 40, rtd: 1, rec: null, rcy: null, rctd: 0, st: 0, note: "" },
      "BUF", df, { PRI: { QB: { py: 225, ptd: 1.4, ry: 15, td: 0.15 }, RB: { ry: 60, rec: 2.5, rcy: 18, td: 0.5 }, WR: { rec: 4.5, rcy: 55, td: 0.35 }, TE: { rec: 3.5, rcy: 38, td: 0.3 } }, LIGA: { LGP: 220, LGR: 110, LGS: 23.1 } },
    );
    expect(ms.map((m) => m.id)).toContain("py");
    expect(ms.map((m) => m.id)).toContain("ptd");
  });
});
