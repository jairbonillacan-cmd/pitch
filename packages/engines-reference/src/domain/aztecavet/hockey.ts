/**
 * Motor NHL — reconstrucción fiel del motor observable de aztecavet.com
 * (nhl.html, bloque `const T=`…`function model()`).
 * Pipeline: build() (prior 250/82 con freno K=15 + forma reciente 30% de los
 *   últimos 5 juegos cuando el equipo lleva ≥7) → eff() (lesiones/noticias con
 *   impacto en goles; porteros pesan más) → model0() (Pitágoras 2.15 → Log5 →
 *   localía .525 → Poisson sin corrección de empate → 15 mercados → pick).
 * Sin corrección Dixon-Coles (el hockey tiene OT); auditorías usan la tabla SA
 * (build solo con resultados previos al día auditado, sin noticias del día).
 * Categoría: OBSERVADO (paridad 1:1 contra el oráculo verbatim, 61+11 juegos).
 */
import { half, dec } from "../stats.js";
import { NHL } from "./constants.js";
import { pois, over } from "./football.js";
import type {
  Market, NhlDayRow, NhlGame, NhlInjury, NhlModel, NhlResult, NhlStanding, NhlTeams, OddsMap,
} from "./types.js";

export interface HockeyInput {
  teams: NhlTeams;
  results: NhlResult[];
  audit: NhlResult[];
  news: NhlInjury[];
  schedule: NhlDayRow[];
  odds: OddsMap;
}

/** Clave de partido del original: "NHL:fecha:local-visitante". */
export const nhlKey = (g: { dl?: string; h: string; a: string }): string =>
  "NHL:" + (g.dl || "sim") + ":" + g.h + "-" + g.a;

export const NHL_GROUPS: [string, string[]][] = [
  ["ML", ["mlh", "mla"]],
  ["±1.5", ["plf", "pld"]],
  ["total", ["ov", "un"]],
  ["60 min", ["rh", "rd", "ra"]],
  ["total local", ["tho", "thu"]],
  ["total visita", ["tao", "tau"]],
  ["ambos anotan", ["by", "bn"]],
];

export const NHL_PXIDS = ["mlh", "mla", "plf", "pld", "ov", "un"];

export class HockeyEngine {
  readonly T: NhlTeams;
  readonly R: NhlResult[];
  readonly AUD: NhlResult[];
  readonly D: NhlDayRow[];
  readonly SIM: { k: string; h: string; a: string };
  private readonly N: NhlInjury[];
  private readonly odds: OddsMap;
  private ed: Record<string, { f?: number; a?: number }> = {};
  S: Record<string, NhlStanding> & { LG: number } = {} as never;
  SA: Record<string, NhlStanding> & { LG: number } = {} as never;

  constructor(input: HockeyInput) {
    this.T = input.teams;
    this.R = input.results;
    this.AUD = input.audit;
    this.N = input.news;
    this.D = input.schedule;
    this.odds = input.odds;
    this.SIM = { k: "sim", h: "COL", a: "CAR" };
    this.rebuild();
  }

  setTeam(k: string, f?: number, a?: number): void {
    this.ed[k] = this.ed[k] || {};
    this.ed[k].f = f ?? this.ed[k].f;
    this.ed[k].a = a ?? this.ed[k].a;
  }

  setNews(id: string, patch: Partial<Pick<NhlInjury, "st" | "i">>): void {
    const x = this.N.find((w) => w.id === id);
    if (!x) return;
    if (patch.st != null) x.st = patch.st;
    if (patch.i != null) x.i = patch.i;
  }

  setSim(h: string, a: string): void {
    this.SIM.h = h;
    this.SIM.a = a;
  }

  /** Fuerza por equipo: baseline 25-26 mezclado con el juego a juego 26-27 (freno K). */
  private build0(rows: NhlResult[]): Record<string, NhlStanding> {
    const c: Record<string, { n: number; f: number; a: number }> = {};
    Object.keys(this.T).forEach((k) => (c[k] = { n: 0, f: 0, a: 0 }));
    rows.forEach(([h, a, x, y]) => {
      c[h]!.n++;
      c[h]!.f += x;
      c[h]!.a += y;
      c[a]!.n++;
      c[a]!.f += y;
      c[a]!.a += x;
    });
    const o: Record<string, NhlStanding> = {};
    let sum = 0;
    Object.keys(this.T).forEach((k) => {
      const e = this.ed[k] || {};
      const gf = e.f ?? this.T[k]![1];
      const ga = e.a ?? this.T[k]![2];
      const kn = gf > 0 && ga > 0;
      const pf = (kn ? gf : NHL.PRIOR) / NHL.GAMES;
      const pa = (kn ? ga : NHL.PRIOR) / NHL.GAMES;
      const n = c[k]!.n;
      const w = n / (n + NHL.K);
      o[k] = {
        rs: pf * (1 - w) + (n ? c[k]!.f / n : 0) * w,
        ra: pa * (1 - w) + (n ? c[k]!.a / n : 0) * w,
        n,
        kn,
        gf: kn ? gf : "",
        ga: kn ? ga : "",
      };
      sum += o[k].rs;
    });
    (o as unknown as { LG: number }).LG = sum / 32;
    return o as Record<string, NhlStanding> & { LG: number };
  }

  /** build + forma reciente: los últimos 5 juegos pesan FORMW cuando lleva ≥7. */
  private buildWithForm(rows: NhlResult[]): Record<string, NhlStanding> & { LG: number } {
    const o = this.build0(rows) as Record<string, NhlStanding> & { LG: number };
    const L: Record<string, [number, number][]> = {};
    rows.forEach(([h, a, x, y]) => {
      (L[h] = L[h] || []).push([x, y]);
      (L[a] = L[a] || []).push([y, x]);
    });
    Object.keys(L).forEach((k) => {
      const g = L[k]!;
      if (!o[k] || g.length < 7) return;
      const r = g.slice(-5);
      const f = r.reduce((s, z) => s + z[0], 0) / 5;
      const a2 = r.reduce((s, z) => s + z[1], 0) / 5;
      o[k].rs = o[k].rs * (1 - NHL.FORMW) + f * NHL.FORMW;
      o[k].ra = o[k].ra * (1 - NHL.FORMW) + a2 * NHL.FORMW;
      o[k].f5 = [f, a2];
    });
    return o;
  }

  rebuild(): void {
    this.S = this.buildWithForm(this.R.concat(this.AUD));
    this.SA = this.buildWithForm(this.R);
  }

  /** Tablas expuestas para la UI y los tests. */
  get tables() { return { S: this.S, SA: this.SA }; }

  /** % de juegos del equipo que superaron la línea (consistencia para combos). */
  OVR(t: string, L: number): number | null {
    const g = this.R.concat(this.AUD).filter((z) => z[0] === t || z[1] === t);
    if (g.length < 3) return null;
    return g.filter((z) => z[2] + z[3] > L).length / g.length;
  }

  /** Fuerza efectiva con noticias aplicadas (si nn, sin noticias del día). */
  private eff(t: string, SS: Record<string, NhlStanding> & { LG: number }, nn: boolean) {
    const s = SS[t]!;
    let rs = s.rs;
    let ra = s.ra;
    const nt: [string, boolean][] = [];
    if (!nn)
      this.N.forEach((x) => {
        if (x.t === t && x.st > 0) {
          const d = x.i * x.st;
          if (x.r === "gf") rs -= d;
          else ra += d;
          nt.push([x.n, x.st < 1]);
        }
      });
    return { rs: Math.max(rs, 1.5), ra: Math.max(ra, 1.5), nt };
  }

  model0(h: string, a: string, SS: Record<string, NhlStanding> & { LG: number }, nn: boolean): NhlModel {
    const NG = NHL.NG;
    const H = this.eff(h, SS, nn);
    const A = this.eff(a, SS, nn);
    const LG = SS.LG;
    const py = (t: { rs: number; ra: number }) =>
      Math.pow(t.rs, NHL.E) / (Math.pow(t.rs, NHL.E) + Math.pow(t.ra, NHL.E));
    const x = py(H);
    const y = py(A);
    const pn = (x - x * y) / (x + y - 2 * x * y);
    const o = (pn / (1 - pn)) * (NHL.HFA / (1 - NHL.HFA));
    const pH = 0.5 + NHL.SHR * (o / (1 + o) - 0.5);
    const lh = (H.rs * A.ra) / LG;
    const la = (A.rs * H.ra) / LG;
    const tot = lh + la;
    const ph = pois(lh, NG);
    const pa = pois(la, NG);
    let w = 0, d = 0, l = 0, m2h = 0, m2a = 0;
    for (let i = 0; i < NG; i++)
      for (let j = 0; j < NG; j++) {
        const p = ph[i]! * pa[j]!;
        if (i > j) w += p;
        else if (i === j) d += p;
        else l += p;
        if (i - j >= 2) m2h += p;
        if (j - i >= 2) m2a += p;
      }
    const line = half(tot);
    const lH = half(lh);
    const lA = half(la);
    const fav: "h" | "a" = pH >= 0.5 ? "h" : "a";
    const plf = fav === "h" ? m2h : m2a;
    const fn = fav === "h" ? h : a;
    const dn = fav === "h" ? a : h;
    const pO = over(tot, line, NG);
    const O: Market[] = [
      { id: "mlh", l: h + " gana (ML)", p: pH, f: (p, q) => p > q },
      { id: "mla", l: a + " gana (ML)", p: 1 - pH, f: (p, q) => q > p },
      { id: "plf", l: fn + " −1.5", p: plf, f: (p, q) => (fav === "h" ? p - q >= 2 : q - p >= 2) },
      { id: "pld", l: dn + " +1.5", p: 1 - plf, f: (p, q) => (fav === "h" ? !(p - q >= 2) : !(q - p >= 2)) },
      { id: "ov", l: "Over " + line, p: pO, f: (p, q) => p + q > line },
      { id: "un", l: "Under " + line, p: 1 - pO, f: (p, q) => p + q < line },
      { id: "rh", l: h + " 60 min", p: w, g: 1, f: (p, q) => p > q },
      { id: "rd", l: "Empate 60 min", p: d, g: 1, f: (p, q) => p === q },
      { id: "ra", l: a + " 60 min", p: l, g: 1, f: (p, q) => q > p },
      { id: "tho", l: h + " Over " + lH, p: over(lh, lH, NG), g: 1, f: (p) => p > lH },
      { id: "thu", l: h + " Under " + lH, p: 1 - over(lh, lH, NG), g: 1, f: (p) => p < lH },
      { id: "tao", l: a + " Over " + lA, p: over(la, lA, NG), g: 1, f: (p, q) => q > lA },
      { id: "tau", l: a + " Under " + lA, p: 1 - over(la, lA, NG), g: 1, f: (p, q) => q < lA },
      { id: "by", l: "Ambos anotan: Sí", p: (1 - Math.exp(-lh)) * (1 - Math.exp(-la)), g: 1, f: (p, q) => p > 0 && q > 0 },
      { id: "bn", l: "Ambos anotan: No", p: 1 - (1 - Math.exp(-lh)) * (1 - Math.exp(-la)), g: 1, f: (p, q) => !(p > 0 && q > 0) },
    ];
    const by = (id: string): Market => O.find((z) => z.id === id) as Market;
    const dom: "h" | "a" | null =
      H.rs > A.rs && H.ra < A.ra ? "h" : A.rs > H.rs && A.ra < H.ra ? "a" : null;
    let cp: Market;
    let ct: string;
    if (dom && by(dom === "h" ? "mlh" : "mla").p >= 0.52) {
      cp = by(dom === "h" ? "mlh" : "mla");
      ct = "ML · DOMINA EN ATAQUE Y DEFENSA";
    } else if (Math.max(pH, 1 - pH) >= 0.58) {
      cp = by(pH >= 0.5 ? "mlh" : "mla");
      ct = "ML FAVORITO (sin dominio total)";
    } else {
      cp = [by("pld"), by("ov"), by("un")].reduce((m, z) => (z.p > m.p ? z : m));
      ct = "SIN VENTAJA CLARA · opción más segura";
    }
    return {
      O, cp, ct, dom, lh, la, tot, H, A, x, y, pn, pH,
      notes: [...H.nt.map((z) => [h, z[0], z[1]] as [string, string, boolean]),
        ...A.nt.map((z) => [a, z[0], z[1]] as [string, string, boolean])],
    };
  }

  /** Combinada condicional (matriz con empate repartido) + filtro de consistencia OVR. */
  private COMBOS(g: { h: string; a: string }, m: NhlModel) {
    const fh = m.pH >= 0.5;
    const pF = fh ? m.pH : 1 - m.pH;
    if (pF < 0.65) return null;
    const fc = fh ? g.h : g.a;
    const big = m.tot >= 5.8;
    const L = big ? 5.5 : 4.5;
    const M = this.cmbOT(pois(m.lh, NHL.NG), pois(m.la, NHL.NG));
    const fs = fh ? (i: number, j: number) => i > j : (i: number, j: number) => j > i;
    const c = this.cmbBuild(M, fs, pF, fc, [{ id: "cb_o" + L, l: "Over " + L, f: (i, j) => i + j > L }])[0] as { id: string; l: string; p: number; f: (p: number, q: number) => boolean };
    const orr = this.OVR(fc, L);
    if (orr != null && orr < 0.5) return null;
    return {
      c,
      why: `${fc} gana ${(pF * 100).toFixed(1)}% pero paga poco (justa ${(1 / pF).toFixed(2)}). Over ${L} porque el partido proyecta ${m.tot.toFixed(2)} goles${big ? "" : " (para Over 5.5 pide 5.8+ proyectados)"}.`,
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

  model(g: { h: string; a: string; dl?: string }, SS: Record<string, NhlStanding> & { LG: number }, nn: boolean): NhlModel {
    const m = this.model0(g.h, g.a, SS, nn);
    try {
      const C = this.COMBOS(g, m);
      if (C && C.c && C.c.p >= NHL.CMIN) {
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

  bestOf(g: { dl?: string; h: string; a: string }, m: NhlModel) {
    let b: { o: Market; ev: number; d: number } | null = null;
    const gk = nhlKey(g);
    m.O.forEach((o) => {
      const d = dec(this.odds[gk + "|" + o.id]);
      if (d) {
        const ev = o.p * d - 1;
        if (ev >= FB_EVMIN && (!b || ev > b.ev)) b = { o, ev, d };
      }
    });
    return b;
  }

  NOB(g: { dl?: string; h: string; a: string; aud?: boolean }): boolean {
    if (g.aud) return false;
    const gk = nhlKey(g) + "|";
    return Object.keys(this.odds).some((k) => k.startsWith(gk) && dec(this.odds[k]));
  }
}

// EV mínima compartida con el boleto (EVMIN=.04 del shell original).
const FB_EVMIN = 0.04;
