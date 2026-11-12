/**
 * Motor de fútbol — reconstrucción fiel del motor observable de aztecavet.com
 * (fb.html, bloque `const LG0=`…`function model()`).
 * Pipeline: base() (shrink bayesiano + fase 2026-27 ×3) → rate() (escala UEFA)
 *   → inj() (bajas con impacto) → model0() (Pitágoras 1.7 → Log5 → localía .54
 *   → tilt por bisección → Poisson con corrección Dixon-Coles τ → 18 mercados
 *   → pick jerárquico + combinadas condicionales).
 * Categoría: OBSERVADO (algoritmo idéntico; parado 1:1 en tests de paridad
 * contra el oráculo extraído verbatim del bundle, sobre los 183 partidos).
 */
import { half, dec } from "../stats.js";
import { BET, FB } from "./constants.js";
import type {
  FbAnyGame, FbAuditGame, FbComp, FbInjury, FbModel, FbTeam, FbTeamRow, Market, OddsMap, Overrides,
} from "./types.js";

export function teamsFromRows(rows: FbTeamRow[]): Record<string, FbTeam> {
  const TM: Record<string, FbTeam> = {};
  rows.forEach((t) => {
    TM[t[0]] = {
      c: t[0], n: t[1], lg: t[2], gf: t[3], ga: t[4], gp: t[5],
      cur: t[6] as [number, number, number] | 0,
      fl: t[7], comps: t[8].split(","),
    };
  });
  return TM;
}

/** Poisson pmf 0..NG-1 (rejilla del original). */
export const pois = (l: number, NG: number): number[] => {
  const a: number[] = [];
  let p = Math.exp(-l);
  a.push(p);
  for (let k = 1; k < NG; k++) {
    p *= l / k;
    a.push(p);
  }
  return a;
};

/** P(total > línea) con la pmf del original (suma hasta floor(línea)). */
export const over = (l: number, line: number, NG: number): number => {
  const a = pois(l, NG);
  let c = 0;
  for (let k = 0; k <= Math.floor(line); k++) c += a[k]!;
  return 1 - c;
};

/** Share de victorias condicional (sin empates) de la matriz Poisson independiente. */
function shr(lh: number, la: number, NG: number): number {
  const p = pois(lh, NG);
  const q = pois(la, NG);
  let w = 0;
  let l = 0;
  for (let i = 0; i < NG; i++)
    for (let j = 0; j < NG; j++) {
      if (i > j) w += p[i]! * q[j]!;
      else if (i < j) l += p[i]! * q[j]!;
    }
  return w / (w + l);
}

/** Ajusta los goles (multiplicador exponencial por bisección, 16 iter.) hasta que el share condicional respete el objetivo Log5+localía. */
function tilt(lh: number, la: number, t: number, NG: number): [number, number] {
  let lo = -1.5;
  let hi = 1.5;
  for (let k = 0; k < 16; k++) {
    const m = (lo + hi) / 2;
    if (shr(lh * Math.exp(m), la * Math.exp(-m), NG) < t) lo = m;
    else hi = m;
  }
  const d = (lo + hi) / 2;
  return [lh * Math.exp(d), la * Math.exp(-d)];
}

export interface FootballInput {
  teams: FbTeamRow[];
  fixtures: Record<string, [string, FbAnyGame[]][]>;
  comps: Record<string, FbComp>;
  injuries: FbInjury[];
  odds: OddsMap;
}

/** Clave de partido del original: "FB:comp:fecha:local-visitante". */
export const fbKey = (g: { cp?: string; dl?: string; h: string; a: string }): string =>
  "FB:" + (g.cp || "") + ":" + (g.dl || "") + ":" + g.h + "-" + g.a;

/** Grupos de mercados complementarios para el noVig ("Margen casa X"). */
export const FB_GROUPS: [string, string[]][] = [
  ["1X2", ["h", "d", "a"]],
  ["total", ["ov", "un"]],
  ["±1.5", ["plf", "pld"]],
  ["O/U 3.5", ["o35", "u35"]],
  ["ambos anotan", ["by", "bn"]],
  ["total local", ["tho", "thu"]],
  ["total visita", ["tao", "tau"]],
];

export class FootballEngine {
  readonly TM: Record<string, FbTeam>;
  readonly COMPS: Record<string, FbComp>;
  readonly GM: Record<string, FbAnyGame & { k: string; dl: string; cp: string; aud: boolean }> = {};
  readonly SIMS: Record<string, { k: string; h: string; a: string; cp: string; t: string }> = {};
  readonly CK: string[];
  readonly DD: Record<string, [string, (FbAnyGame & { k: string; dl: string; cp: string; aud: boolean })][]>;
  private readonly NW: FbInjury[];
  private readonly odds: OddsMap;
  private ed: Overrides = {};

  constructor(input: FootballInput) {
    this.TM = teamsFromRows(input.teams);
    this.COMPS = input.comps;
    this.NW = input.injuries;
    this.odds = input.odds;
    this.CK = Object.keys(input.fixtures);
    const DD: typeof this.DD = {};
    this.CK.forEach((c) =>
      (input.fixtures[c] ?? []).forEach((dayRow, i) => {
        const games = dayRow[1] as (FbAnyGame & { k: string; dl: string; cp: string; aud: boolean })[];
        games.forEach((g, j) => {
          g.k = c + i + "-" + j;
          g.dl = (dayRow[0] as string).replace(/^Hoy · /, "");
          g.cp = c;
          if ("sc" in g && (g as FbAuditGame).sc) g.aud = true;
          const arr = (DD[c] ??= []);
          arr[i] = arr[i] ?? ([dayRow[0] as string, [] as (FbAnyGame & { k: string })[]] as unknown as typeof arr[number]);
          (arr[i]![1] as unknown as (FbAnyGame & { k: string })[]).push(g);
          this.GM[g.k] = g;
        });
      }),
    );
    this.CK.forEach((c) => {
      const C = this.COMPS[c]!;
      this.SIMS[c] = { k: "sim" + c, h: C.sim[0], a: C.sim[1], cp: c, t: "Simulación" };
    });
    this.CK.forEach((c) => {
      this.GM[this.SIMS[c]!.k] = this.SIMS[c] as never;
    });
    this.DD = DD;
  }

  /** Overrides manuales de GF/J y GC/J (pestaña Equipos; `ed` del original). */
  setOverride(c: string, rs?: number, ra?: number): void {
    this.ed[c] = this.ed[c] || { rs: 0, ra: 0 };
    this.ed[c].rs = rs ?? this.ed[c].rs;
    this.ed[c].ra = ra ?? this.ed[c].ra;
  }

  /** Baja editable (pestaña Bajas): estado 0/.5/1 e impacto goles/juego. */
  setInjury(id: string, patch: Partial<Pick<FbInjury, "st" | "i">>): void {
    const x = this.NW.find((w) => w.id === id);
    if (!x) return;
    if (patch.st != null) x.st = patch.st;
    if (patch.i != null) x.i = patch.i;
  }

  /** Tasa base con freno bayesiano K=6; la fase 2026-27 entra con peso ×3. */
  private base(c: string, useCur: boolean): { rs: number; ra: number; lg: number } {
    const t = this.TM[c]!;
    const lg = FB.LG0[t.lg as keyof typeof FB.LG0];
    const e = this.ed[c];
    if (e) return { rs: e.rs!, ra: e.ra!, lg };
    if (!t.gp && !(useCur && t.cur)) return { rs: lg, ra: lg, lg };
    let F = t.gf;
    let A = t.ga;
    let G = t.gp;
    if (useCur && t.cur) {
      F += 3 * (t.cur as [number, number, number])[0];
      A += 3 * (t.cur as [number, number, number])[1];
      G += 3 * (t.cur as [number, number, number])[2];
    }
    return { rs: (F + FB.K * lg) / (G + FB.K), ra: (A + FB.K * lg) / (G + FB.K), lg };
  }

  /** Escala a Copa: normaliza por la liga doméstica y aplica su fuerza. */
  private rate(c: string, comp: string, useCur: boolean): { rs: number; ra: number } {
    const b = this.base(c, useCur);
    if (comp !== "UCL" && comp !== "UEL") return { rs: b.rs, ra: b.ra };
    const s = FB.STR[this.TM[c]!.lg as keyof typeof FB.STR];
    return { rs: (b.rs / b.lg) * s * FB.LGU, ra: (b.ra / b.lg) / s * FB.LGU };
  }

  /** Bajas: resta ataque (gf) o suma defensa (ga) según impacto × estado. */
  private inj(t: string, r: { rs: number; ra: number }, au: boolean): { rs: number; ra: number } {
    if (au) return r;
    let rs = r.rs;
    let ra = r.ra;
    this.NW.forEach((x) => {
      if (x.t === t && x.st > 0) {
        const d = x.i * x.st;
        if (x.r === "gf") rs -= d;
        else ra += d;
      }
    });
    return { rs: Math.max(rs, 0.3), ra: Math.max(ra, 0.3) };
  }

  model0(h: string, a: string, comp: string, au: boolean): FbModel {
    const NG = FB.NG;
    const H = this.inj(h, this.rate(h, comp, !au), au);
    const A = this.inj(a, this.rate(a, comp, !au), au);
    const LG = comp === "UCL" || comp === "UEL" ? FB.LGU : FB.LG0[this.COMPS[comp]!.lg as keyof typeof FB.LG0];
    const py = (t: { rs: number; ra: number }) =>
      Math.pow(t.rs, FB.E) / (Math.pow(t.rs, FB.E) + Math.pow(t.ra, FB.E));
    const x = py(H);
    const y = py(A);
    const pn = (x - x * y) / (x + y - 2 * x * y);
    const o = (pn / (1 - pn)) * (FB.HFA / (1 - FB.HFA));
    const share = 0.5 + FB.SHR * (o / (1 + o) - 0.5);
    const [lh0, la0] = tilt((H.rs * A.ra) / LG, (A.rs * H.ra) / LG, share, NG);
    const lh = lh0;
    const la = la0;
    const tot = lh + la;
    const P = pois(lh, NG);
    const Q = pois(la, NG);
    const rho = comp === "MX" ? FB.RHO_MX : FB.RHO;
    const tau = (i: number, j: number): number =>
      i === 0 && j === 0 ? 1 - lh * la * rho
        : i === 0 && j === 1 ? 1 + lh * rho
          : i === 1 && j === 0 ? 1 + la * rho
            : i === 1 && j === 1 ? 1 - rho
              : 1;
    let w = 0, d = 0, l = 0, m2h = 0, m2a = 0;
    for (let i = 0; i < NG; i++)
      for (let j = 0; j < NG; j++) {
        const p = P[i]! * Q[j]! * tau(i, j);
        if (i > j) w += p;
        else if (i === j) d += p;
        else l += p;
        if (i - j >= 2) m2h += p;
        if (j - i >= 2) m2a += p;
      }
    const line = half(tot);
    const lH = half(lh);
    const lA = half(la);
    const favH = w >= l;
    const plf = favH ? m2h : m2a;
    const fn = favH ? h : a;
    const dn = favH ? a : h;
    const pO = over(tot, line, NG);
    const bt = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
    const O: Market[] = [
      { id: "h", l: h + " gana", p: w, f: (p, q) => p > q },
      { id: "d", l: "Empate", p: d, f: (p, q) => p === q },
      { id: "a", l: a + " gana", p: l, f: (p, q) => q > p },
      { id: "ov", l: "Over " + line, p: pO, f: (p, q) => p + q > line },
      { id: "un", l: "Under " + line, p: 1 - pO, f: (p, q) => p + q < line },
      { id: "plf", l: fn + " −1.5", p: plf, f: (p, q) => (favH ? p - q >= 2 : q - p >= 2) },
      { id: "pld", l: dn + " +1.5", p: 1 - plf, f: (p, q) => (favH ? !(p - q >= 2) : !(q - p >= 2)) },
      { id: "dc1x", l: h + " o empate", p: w + d, g: 1, f: (p, q) => p >= q },
      { id: "dcx2", l: "Empate o " + a, p: d + l, g: 1, f: (p, q) => q >= p },
      { id: "dc12", l: h + " o " + a + " (sin empate)", p: w + l, g: 1, f: (p, q) => p !== q },
      { id: "o15", l: "Over 1.5", p: over(tot, 1.5, NG), g: 1, f: (p, q) => p + q > 1.5 },
      { id: "u35", l: "Under 3.5", p: 1 - over(tot, 3.5, NG), g: 1, f: (p, q) => p + q < 3.5 },
      { id: "o35", l: "Over 3.5", p: over(tot, 3.5, NG), g: 1, f: (p, q) => p + q > 3.5 },
      { id: "tho", l: h + " Over " + lH, p: over(lh, lH, NG), g: 1, f: (p) => p > lH },
      { id: "thu", l: h + " Under " + lH, p: 1 - over(lh, lH, NG), g: 1, f: (p) => p < lH },
      { id: "tao", l: a + " Over " + lA, p: over(la, lA, NG), g: 1, f: (p, q) => q > lA },
      { id: "tau", l: a + " Under " + lA, p: 1 - over(la, lA, NG), g: 1, f: (p, q) => q < lA },
      { id: "by", l: "Ambos anotan: Sí", p: bt, g: 1, f: (p, q) => p > 0 && q > 0 },
      { id: "bn", l: "Ambos anotan: No", p: 1 - bt, g: 1, f: (p, q) => !(p > 0 && q > 0) },
    ];
    const by = (id: string): Market => O.find((z) => z.id === id) as Market;
    const dom: "h" | "a" | null =
      H.rs > A.rs && H.ra < A.ra ? "h" : A.rs > H.rs && A.ra < H.ra ? "a" : null;
    let cp: Market;
    let ct: string;
    if (dom && by(dom).p >= 0.42) {
      cp = by(dom);
      ct = "GANA · DOMINA EN ATAQUE Y DEFENSA";
    } else if (dom) {
      cp = by(dom === "h" ? "dc1x" : "dcx2");
      ct = "DOMINA, PERO PARTIDO CERRADO · DOBLE OPORTUNIDAD";
    } else {
      const fv = by(favH ? "h" : "a");
      if (fv.p >= 0.5) {
        cp = fv;
        ct = "FAVORITO (sin dominio total)";
      } else {
        const dc = by(favH ? "dc1x" : "dcx2");
        if (dc.p >= 0.65) {
          cp = dc;
          ct = "SIN VENTAJA CLARA · OPCIÓN MÁS SEGURA";
        } else {
          cp = by("u35");
          ct = "SIN VENTAJA CLARA · TOTAL MÁS SEGURO";
        }
      }
    }
    // Empate probable: doble oportunidad en lugar del ganador directo.
    if (d >= FB.DRAW && (cp.id === "h" || cp.id === "a")) {
      cp = by(cp.id === "h" ? "dc1x" : "dcx2");
      ct = "EMPATE PROBABLE (" + (d * 100).toFixed(0) + "%) · DOBLE OPORTUNIDAD";
    }
    // DC sola paga poco: se combina con Over 1.5 si sigue siendo muy probable.
    let wy = "";
    if (cp.id === "dc1x" || cp.id === "dcx2") {
      const hs = cp.id === "dc1x";
      const dc = cp;
      let pj = 0;
      for (let i = 0; i < NG; i++)
        for (let j = 0; j < NG; j++)
          if ((hs ? i >= j : j >= i) && i + j >= 2) pj += P[i]! * Q[j]! * tau(i, j);
      if (pj >= FB.DCO) {
        const c: Market = {
          id: "dco15",
          l: dc.l + " + Over 1.5",
          p: pj,
          g: 1,
          f: (p, q) => (hs ? p >= q : q >= p) && p + q > 1.5,
        };
        O.push(c);
        cp = c;
        ct = "DOBLE OPORTUNIDAD + GOLES · EMPATE " + (d * 100).toFixed(0) + "%";
        wy = dc.l + " tiene " + (dc.p * 100).toFixed(0) + "% pero paga muy poco (justa " +
          (1 / dc.p).toFixed(2) + "). Le sumo Over 1.5 porque el partido proyecta " +
          tot.toFixed(2) + " goles: la combinada sigue en " + (pj * 100).toFixed(0) + "% y sube la cuota.";
      }
    }
    return { why: wy || undefined, O, cp, ct, dom, lh, la, tot, H, A, x, y, share, w, d, l, line, fav: by(favH ? "h" : "a") };
  }

  /** Combinada condicional del mismo partido: P(fav gana) × P(B | fav gana). */
  private cmbBuild(
    M: number[][], fs: (i: number, j: number) => boolean, pF: number, fav: string,
    cands: { id: string; l: string; f: (i: number, j: number) => boolean; full?: string }[],
  ): { id: string; l: string; p: number; f: (p: number, q: number) => boolean }[] {
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
          id: c.id,
          l: c.full || fav + " gana + " + c.l,
          p: (pF * pj) / pw,
          f: (x: number, y: number) => fs(x, y) && c.f(x, y),
        };
      })
      .filter((c) => c.p > 0.05);
  }

  /** Reparte el empate entre 1-0/0-1 para construir la matriz de combinadas. */
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

  /** Regla "FAVORITO CLARO · GANA + GOLES": la combinada ES el pick (Over 2.5/1.5). */
  private COMBOS(
    g: { h: string; a: string }, m: FbModel,
  ): { c: { id: string; l: string; p: number; f: (p: number, q: number) => boolean }; why: string } | null {
    const fh = m.fav.id === "h";
    const pF = m.fav.p;
    if (pF < 0.62 || m.d >= FB.DRAW) return null;
    const fc = fh ? g.h : g.a;
    const t = this.TM[fc]!;
    const gf =
      t.cur && (t.cur as [number, number, number])[2] >= 3
        ? (t.cur as [number, number, number])[0] / (t.cur as [number, number, number])[2]
        : t.gp
          ? t.gf / t.gp
          : null;
    const big = m.tot >= 2.6 || (gf != null && gf >= 3);
    const L = big ? 2.5 : 1.5;
    const P = pois(m.lh, FB.NG);
    const Q = pois(m.la, FB.NG);
    const M = P.map((p) => Q.map((q) => p * q));
    const fs = fh ? (i: number, j: number) => i > j : (i: number, j: number) => j > i;
    const c = this.cmbBuild(M, fs, pF, fc, [{ id: "cb_o" + L, l: "Over " + L, f: (i, j) => i + j > L }])[0] as { id: string; l: string; p: number; f: (p: number, q: number) => boolean };
    return {
      c,
      why: `${fc} gana ${(pF * 100).toFixed(1)}% pero paga poco (justa ${(1 / pF).toFixed(2)}). Over ${L} porque el partido proyecta ${m.tot.toFixed(2)} goles${gf != null ? ` y ${fc} promedia ${gf.toFixed(1)} goles a favor por partido` : ""}${big ? "" : " (para Over 2.5 pide 2.6+ proyectados o que el favorito promedie 3.0+ a favor)"}.`,
    };
  }

  /** Modelo completo = model0 + regla de combinada del favorito claro. */
  model(h: string, a: string, comp: string, au: boolean): FbModel {
    const m = this.model0(h, a, comp, au);
    try {
      const C = this.COMBOS({ h, a }, m);
      if (C && C.c && C.c.p >= FB.CMIN) {
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

  /** Mejor mercado con valor (EV ≥ +4%) entre las cuotas escritas por el usuario. */
  bestOf(
    g: { cp?: string; dl?: string; h: string; a: string }, m: FbModel,
  ): { o: Market; ev: number; d: number } | null {
    let b: { o: Market; ev: number; d: number } | null = null;
    const gk = fbKey(g);
    m.O.forEach((o) => {
      const d = dec(this.odds[gk + "|" + o.id]);
      if (d) {
        const ev = o.p * d - 1;
        if (ev >= BET.EVMIN && (!b || ev > b.ev)) b = { o, ev, d };
      }
    });
    return b;
  }

  /** ¿El usuario escribió cuotas y ninguna le saca 4% a la casa? ("SIN VALOR"). */
  NOB(g: { cp?: string; dl?: string; h: string; a: string; aud?: boolean }): boolean {
    if (g.aud) return false;
    const gk = fbKey(g) + "|";
    return Object.keys(this.odds).some((k) => k.startsWith(gk) && dec(this.odds[k]));
  }
}
