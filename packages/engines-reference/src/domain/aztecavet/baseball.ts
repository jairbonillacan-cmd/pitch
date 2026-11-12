/**
 * Motor MLB — reconstrucción fiel del motor observable de aztecavet.com
 * (mlb.html, bloque `const LG=4.40`…`function model()`).
 * Pipeline: base() (RS/RA por juego + ERA del bullpen) → eff() (bateadores
 *   clave fuera + regresión bayesiana del abridor: ERA_reg = (ERA·IP +
 *   ERA_equipo·80)/(IP+80), factor 1+.55·(ERA_reg/ERA_eq−1) sobre RA) →
 *   model0() (Pitágoras 1.83 → Log5 → localía .54 → aproximación NORMAL con
 *   σ=3√2 para totales y run line ±1.5 → 6 mercados → pick de mayor prob.).
 * Las auditorías (timeline completo de playoffs) usan nn=true: sin ajustes del
 * día. Categoría: OBSERVADO (paridad 1:1 contra el oráculo verbatim, 17 juegos).
 */
import { half, dec, phi } from "../stats.js";
import { MLB } from "./constants.js";
import { pois } from "./football.js";
import type {
  Market, MlbBatter, MlbDayRow, MlbModel, MlbPitcher, MlbTeams, MlbTimelineGame, OddsMap,
} from "./types.js";

export interface BaseballInput {
  teams: MlbTeams;
  pitchers: MlbPitcher[];
  batters: MlbBatter[];
  timeline: MlbDayRow[];
  odds: OddsMap;
}

/** Clave de partido del original: "MLB:fecha:local-visitante[:serie]". */
export const mlbKey = (g: { dl?: string; h: string; a: string; s?: string }): string =>
  "MLB:" + (g.dl || "sim") + ":" + g.h + "-" + g.a + (g.s ? ":" + g.s : "");

export const MLB_GROUPS: [string, string[]][] = [
  ["ganador", ["h", "a"]],
  ["total", ["ov", "un"]],
  ["±1.5", ["plf", "pld"]],
];

export const MLB_PXIDS = ["h", "a", "ov", "un", "plf", "pld"];

export class BaseballEngine {
  readonly T: MlbTeams;
  readonly PL: Record<string, MlbPitcher>;
  readonly BT: MlbBatter[];
  readonly D: MlbDayRow[];
  readonly GM: Record<string, MlbDayRow[1][number] | { k: string; h: string; a: string; dl: string; sp: [string | null, string | null]; t: string; s?: string }> = {};
  readonly SIM: { k: string; h: string; a: string; sp: [string | null, string | null] };
  private readonly odds: OddsMap;
  private ed: Record<string, { rs?: number; ra?: number }> = {};

  constructor(input: BaseballInput) {
    this.T = input.teams;
    this.PL = {};
    input.pitchers.forEach((p) => (this.PL[p.id] = p));
    this.BT = input.batters;
    this.odds = input.odds;
    this.D = input.timeline.map((d) => [
      d[0] as string,
      (d[1] as MlbTimelineGame[]).map((g0) => {
        const g = g0 as MlbDayRow[1][number] & { aud?: boolean; k?: string; dl?: string };
        g.sp = g.sp || [null, null];
        g.k = "0-" + d[1].indexOf(g0);
        g.dl = d[0].replace(/^Hoy · /, "");
        if (g.sc) g.aud = true;
        return g;
      }),
    ]);
    this.SIM = { k: "sim", h: "MIL", a: "LAD", sp: [null, null] };
    this.D.forEach((d) => d[1].forEach((g) => (this.GM[g.k as string] = g)));
    this.GM.sim = this.SIM as never;
  }

  setTeam(k: string, rs?: number, ra?: number): void {
    this.ed[k] = this.ed[k] || {};
    this.ed[k].rs = rs ?? this.ed[k].rs;
    this.ed[k].ra = ra ?? this.ed[k].ra;
  }

  /** Ajuste del abridor: regresión ERA hacia el ERA del cuerpo de pitcheo. */
  private eff(t: string, sp: string | null, nn: boolean): { rs: number; ra: number; nt: string[] } {
    const b = this.base(t);
    let rs = b.rs;
    let ra = b.ra;
    const nt: string[] = [];
    if (nn) return { rs, ra, nt };
    this.BT.filter((x) => x.t === t && x.out).forEach((x) => {
      rs -= x.i;
      nt.push(x.n + " fuera (−" + x.i.toFixed(2) + " R)");
    });
    const p = sp && this.PL[sp];
    if (p && p.era != null && p.era !== ("" as never) && p.ip > 0) {
      const reg = (p.era * p.ip + b.era * MLB.ERA_PRIOR_IP) / (p.ip + MLB.ERA_PRIOR_IP);
      const f = 1 + MLB.ERA_FACTOR * (reg / b.era - 1);
      ra *= f;
      nt.push(p.n + " · ERA " + (+p.era).toFixed(2) + " (" + (f >= 1 ? "+" : "") + ((f - 1) * 100).toFixed(0) + "% RA)");
    }
    return { rs, ra, nt };
  }

  private base(k: string): { rs: number; ra: number; era: number } {
    return {
      rs: this.ed[k]?.rs ?? this.T[k]![1],
      ra: this.ed[k]?.ra ?? this.T[k]![2],
      era: this.T[k]![3],
    };
  }

  model0(h: string, a: string, sh: string | null, sa: string | null, nn: boolean): MlbModel {
    const H = this.eff(h, sh, nn);
    const A = this.eff(a, sa, nn);
    const py = (t: { rs: number; ra: number }) =>
      Math.pow(t.rs, MLB.EX) / (Math.pow(t.rs, MLB.EX) + Math.pow(t.ra, MLB.EX));
    const x = py(H);
    const y = py(A);
    const pn = (x - x * y) / (x + y - 2 * x * y);
    const o = (pn / (1 - pn)) * (MLB.HFA / (1 - MLB.HFA));
    const pH = 0.5 + MLB.SHR * (o / (1 + o) - 0.5);
    const gh = (H.rs * A.ra) / MLB.LG;
    const ga = (A.rs * H.ra) / MLB.LG;
    const tot = gh + ga;
    let line = Math.round(tot * 2) / 2;
    if (Number.isInteger(line)) line += 0.5;
    const pO = 1 - phi((line - tot) / MLB.SD);
    const homeFav = pH >= 0.5;
    const df = homeFav ? gh - ga : ga - gh;
    const pc = 1 - phi((1.5 - df) / MLB.SD);
    const fav = homeFav ? h : a;
    const dog = homeFav ? a : h;
    const O: Market[] = [
      { id: "h", l: h + " gana", p: pH, f: (xh, ya) => xh > ya },
      { id: "a", l: a + " gana", p: 1 - pH, f: (xh, ya) => ya > xh },
      { id: "ov", l: "Over " + line, p: pO, f: (xh, ya) => xh + ya > line },
      { id: "un", l: "Under " + line, p: 1 - pO, f: (xh, ya) => xh + ya < line },
      { id: "plf", l: fav + " −1.5", p: pc, f: (xh, ya) => (homeFav ? xh - ya >= 2 : ya - xh >= 2) },
      { id: "pld", l: dog + " +1.5", p: 1 - pc, f: (xh, ya) => (homeFav ? !(xh - ya >= 2) : !(ya - xh >= 2)) },
    ];
    return {
      O, opts: O, gh, ga, tot, line, H, A, x, y, pH,
      pick: O.reduce((m, o2) => (o2.p > m.p ? o2 : m)),
      notes: [...H.nt, ...A.nt],
    };
  }

  /** Combinada condicional del favorito claro (Over 7.5/6.5). */
  private COMBOS(g: { h: string; a: string }, m: MlbModel) {
    const fh = m.pH >= 0.5;
    const pF = fh ? m.pH : 1 - m.pH;
    if (pF < 0.65) return null;
    const fc = fh ? g.h : g.a;
    const big = m.tot >= 8;
    const L = big ? 7.5 : 6.5;
    const M = this.cmbOT(pois(m.gh, MLB.NG), pois(m.ga, MLB.NG));
    const fs = fh ? (i: number, j: number) => i > j : (i: number, j: number) => j > i;
    const c = this.cmbBuild(M, fs, pF, fc, [{ id: "cb_o" + L, l: "Over " + L, f: (i, j) => i + j > L }])[0] as { id: string; l: string; p: number; f: (p: number, q: number) => boolean };
    return {
      c,
      why: `${fc} gana ${(pF * 100).toFixed(1)}% pero paga poco (justa ${(1 / pF).toFixed(2)}). Over ${L} porque el juego proyecta ${m.tot.toFixed(2)} carreras${big ? "" : " (para Over 7.5 pide 8.0+ proyectadas)"}.`,
    };
  }

  private cmbBuild(
    M: number[][], fs: (i: number, j: number) => boolean, pF: number, fav: string,
    cands: { id: string; l: string; f: (i: number, j: number) => boolean; full?: string }[],
  ) {
    let pw = 0;
    const n = M.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) if (fs(i, j)) pw += M[i]![j]!;
    if (!pw) return [];
    return cands
      .map((c) => {
        let pj = 0;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) if (fs(i, j) && c.f(i, j)) pj += M[i]![j]!;
        return {
          id: c.id, l: c.full ?? fav + " gana + " + c.l, p: (pF * pj) / pw,
          f: (x: number, y: number) => fs(x, y) && c.f(x, y),
        };
      })
      .filter((c) => c.p > 0.05);
  }

  private cmbOT(P: number[], Q: number[]): number[][] {
    const n = P.length + 1;
    const M: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < P.length; i++)
      for (let j = 0; j < Q.length; j++) {
        const v = P[i]! * Q[j]!;
        if (i !== j) M[i]![j]! += v;
        else {
          M[i + 1]![j]! += v / 2;
          M[i]![j + 1]! += v / 2;
        }
      }
    return M;
  }

  model(g: { h: string; a: string }, sp: [string | null, string | null], nn: boolean): MlbModel {
    const m = this.model0(g.h, g.a, sp[0], sp[1], nn);
    try {
      const C = this.COMBOS(g, m);
      if (C && C.c && C.c.p >= MLB.CMIN) {
        m.O.push(C.c as Market);
        m.cp = C.c as Market;
        m.pick = C.c as Market;
        m.ct = "FAVORITO CLARO · GANA + GOLES";
        m.why = C.why;
      }
    } catch {
      /* el original traga errores aquí */
    }
    return m;
  }

  bestOf(g: { dl?: string; h: string; a: string; s?: string; aud?: boolean }, m: MlbModel) {
    let b: { o: Market; ev: number; d: number } | null = null;
    const gk = mlbKey(g);
    m.O.forEach((o) => {
      const d = dec(this.odds[gk + "|" + o.id]);
      if (d) {
        const ev = o.p * d - 1;
        if (ev >= 0.04 && (!b || ev > b.ev)) b = { o, ev, d };
      }
    });
    return b;
  }

  NOB(g: { dl?: string; h: string; a: string; s?: string; aud?: boolean }): boolean {
    if (g.aud) return false;
    const gk = mlbKey(g) + "|";
    return Object.keys(this.odds).some((k) => k.startsWith(gk) && dec(this.odds[k]));
  }
}
