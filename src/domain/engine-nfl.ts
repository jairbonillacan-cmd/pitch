/**
 * Motor NFL — reconstrucción fiel del motor observable de touchiq.com.mx.
 * Pipeline: build() → eff() (lesiones) → model0() (Pitágoras→Log5→localía→curvas normales).
 * Verificado offline contra la UI viva: WAS@LAR 67.8%, LAC@HOU 66.2%, SEA −3.5 66.2%,
 * IND +5.5 65.5%, etiquetas de regla idénticas (ver tests/domain/golden.test.ts).
 * Categoría: OBSERVADO (algoritmo idéntico; el original ejecuta estas mismas fórmulas en el cliente).
 */
import { phi, iphi, half } from "./stats.js";
import type { Injury, Market, Model, NflTeams, ResultRow, Standings, TeamStrength } from "./types.js";

export interface NflConstants {
  E: number; // exponente de Pitágoras (2.37)
  HFA: number; // ventaja de local (0.55)
  K: number; // freno de temporada (6)
  NG: number; // rejilla de puntaje (0..75)
  SDM: number; // σ del margen (13.4)
  SDT: number; // σ del total (13.3)
  SDP: number; // σ de team totals (9.5)
  LGPF: number; // PF promedio de liga por temporada (fallback)
  NEUT: string[]; // juegos en campo neutral (Londres)
}

export interface EngineInput {
  teams: NflTeams;
  results: ResultRow[]; // temporada regular jugada
  audit: ResultRow[]; // juegos auditados de la semana actual
  injuries: Injury[];
  constants: NflConstants;
}

/** Overrides manuales de PF/PA por equipo (el original mantiene `ed={}` vacío). */
export type Overrides = Record<string, { f?: number; a?: number }>;

export class NflEngine {
  private readonly teams: NflTeams;
  private readonly inj: Injury[];
  private readonly c: NflConstants;
  private ed: Overrides = {};
  private S: Standings | null = null;
  private SA: Standings | null = null;

  constructor(input: EngineInput) {
    this.teams = input.teams;
    this.inj = input.injuries;
    this.c = input.constants;
    this.rebuild(input.results, input.audit);
  }

  /** Fuerza por equipo: mezcla del baseline de temporada 2025 con el juego a juego de 2026 (freno K). */
  private build(rows: ResultRow[]): Standings {
    const { teams, c } = this;
    const acc: Record<string, { n: number; f: number; a: number }> = {};
    Object.keys(teams).forEach((k) => (acc[k] = { n: 0, f: 0, a: 0 }));
    rows.forEach(([h, a, x, y]) => {
      const ch = acc[h];
      const ca = acc[a];
      if (!ch || !ca) return;
      ch.n++;
      ch.f += x;
      ch.a += y;
      ca.n++;
      ca.f += y;
      ca.a += x;
    });
    const o: Record<string, TeamStrength> = {};
    let sum = 0;
    Object.keys(teams).forEach((k) => {
      const e = this.ed[k] ?? {};
      const gf = e.f ?? teams[k][1];
      const ga = e.a ?? teams[k][2];
      const kn = gf > 0 && ga > 0;
      const pf = (kn ? gf : c.LGPF) / 17;
      const pa = (kn ? ga : c.LGPF) / 17;
      const n = acc[k].n;
      const w = n / (n + c.K);
      o[k] = {
        rs: pf * (1 - w) + (n ? acc[k].f / n : 0) * w,
        ra: pa * (1 - w) + (n ? acc[k].a / n : 0) * w,
        n,
        kn,
        gf: kn ? gf : "",
        ga: kn ? ga : "",
      };
      sum += o[k].rs;
    });
    const st = o as Standings;
    st.LG = sum / 32;
    return st;
  }

  /** Dos tablas: S incluye los juegos auditados; SA es "los datos que había antes". */
  rebuild(results: ResultRow[], audit: ResultRow[]): void {
    this.S = this.build(results.concat(audit));
    this.SA = this.build(results);
  }

  /** Fuerza efectiva: aplica lesiones (impacto×estatus) con piso de 8 puntos. */
  eff(t: string, SS: Standings, nn: boolean): TeamStrength {
    const s = SS[t] as TeamStrength;
    let rs = s.rs;
    let ra = s.ra;
    const nt: [string, boolean][] = [];
    if (!nn) {
      this.inj.forEach((x) => {
        if (x.t === t && x.st > 0) {
          const d = x.i * x.st;
          if (x.r === "gf") rs -= d;
          else ra += d;
          nt.push([x.n, x.st < 1]);
        }
      });
    }
    return { ...s, rs: Math.max(rs, 8), ra: Math.max(ra, 8), nt };
  }

  /** El modelo completo de un juego: mercados, probabilidades y pick. */
  model0(h: string, a: string, SS: Standings, nn: boolean): Model {
    const c = this.c;
    const H = this.eff(h, SS, nn);
    const A = this.eff(a, SS, nn);
    const LG = SS.LG as number;
    const py = (t: TeamStrength) => Math.pow(t.rs, c.E) / (Math.pow(t.rs, c.E) + Math.pow(t.ra, c.E));
    const hf = c.NEUT.includes(h + "-" + a) ? 0.5 : c.HFA;
    const x = py(H);
    const y = py(A);
    const pn = (x - x * y) / (x + y - 2 * x * y);
    const oddsRatio = (pn / (1 - pn)) * (hf / (1 - hf));
    const pH = oddsRatio / (1 + oddsRatio);

    const tot = (H.rs * A.ra) / LG + (A.rs * H.ra) / LG;
    const mu = c.SDM * iphi(pH);
    const lh = tot / 2 + mu / 2;
    const la = tot / 2 - mu / 2;

    const fav = pH >= 0.5 ? "h" : "a";
    const fn = fav === "h" ? h : a;
    const dn = fav === "h" ? a : h;
    const mf = Math.abs(mu);
    let L = half(mf);
    if (L < 1.5) L = 1.5;
    const cov = (l: number) => 1 - phi((l - mf) / c.SDM);
    const line = half(tot);
    const pO = 1 - phi((line - tot) / c.SDT);
    const lH = half(lh);
    const lA = half(la);
    const tt = (l: number, mean: number) => 1 - phi((l - mean) / c.SDP);
    const ff = (p: number, q: number) => (fav === "h" ? p - q : q - p);

    const O: Market[] = [
      { id: "mlh", l: h + " gana (ML)", p: pH, f: (p, q) => p > q },
      { id: "mla", l: a + " gana (ML)", p: 1 - pH, f: (p, q) => q > p },
      { id: "plf", l: fn + " −" + L, p: cov(L), f: (p, q) => ff(p, q) > L },
      { id: "pld", l: dn + " +" + L, p: 1 - cov(L), f: (p, q) => ff(p, q) < L },
      { id: "ov", l: "Over " + line, p: pO, f: (p, q) => p + q > line },
      { id: "un", l: "Under " + line, p: 1 - pO, f: (p, q) => p + q < line },
      { id: "tho", l: h + " Over " + lH, p: tt(lH, lh), g: 1, f: (p) => p > lH },
      { id: "thu", l: h + " Under " + lH, p: 1 - tt(lH, lh), g: 1, f: (p) => p < lH },
      { id: "tao", l: a + " Over " + lA, p: tt(lA, la), g: 1, f: (p, q) => q > lA },
      { id: "tau", l: a + " Under " + lA, p: 1 - tt(lA, la), g: 1, f: (p, q) => q < lA },
      { id: "a3f", l: fn + " −3.5", p: cov(3.5), g: 1, f: (p, q) => ff(p, q) > 3.5 },
      { id: "a3d", l: dn + " +3.5", p: 1 - cov(3.5), g: 1, f: (p, q) => ff(p, q) < 3.5 },
      { id: "a7f", l: fn + " −7.5", p: cov(7.5), g: 1, f: (p, q) => ff(p, q) > 7.5 },
      { id: "a7d", l: dn + " +7.5", p: 1 - cov(7.5), g: 1, f: (p, q) => ff(p, q) < 7.5 },
    ];

    const dom = H.rs > A.rs && H.ra < A.ra ? "h" : A.rs > H.rs && A.ra < H.ra ? "a" : null;
    const by = (id: string) => O.find((z) => z.id === id) ?? null;
    const pF = Math.max(pH, 1 - pH);
    let cp: Market | null;
    let ct: string;
    if (pF >= 0.72) {
      let x2 = half(mf - c.SDM * iphi(0.62));
      if (x2 < 1.5) x2 = 1.5;
      const o: Market = { id: "hf", l: fn + " −" + x2, p: cov(x2), f: (p, q) => ff(p, q) > x2 };
      O.push(o);
      cp = o;
      ct = "FAVORITO CLARO · GANA POR " + Math.ceil(x2) + " O MÁS";
    } else if (pF >= 0.58) {
      cp = by(pH >= 0.5 ? "mlh" : "mla");
      ct = dom ? "ML · DOMINA EN OFENSIVA Y DEFENSIVA" : "ML · FAVORITO";
    } else {
      const xd = half(mf + c.SDM * iphi(0.65));
      const o: Market = { id: "hd", l: dn + " +" + xd, p: 1 - cov(xd), f: (p, q) => ff(p, q) < xd };
      O.push(o);
      cp = o;
      ct = "JUEGO PAREJO · PUNTOS AL NO FAVORITO";
    }
    return {
      O, cp, ct, dom, lh, la, tot, H, A, x, y, pn, pH, mu, L, line,
      notes: [...(H.nt ?? []).map((z) => [h, ...z] as [string, string, boolean]),
              ...(A.nt ?? []).map((z) => [a, ...z] as [string, string, boolean])],
    };
  }

  /** Modelo con datos completos de la semana (incluye auditados en la fuerza). */
  model(h: string, a: string): Model {
    return this.model0(h, a, this.S as Standings, false);
  }

  /** Modelo de auditoría: sin el juego propio en la fuerza y sin lesiones (modo auditoría). */
  modelAudit(h: string, a: string): Model {
    return this.model0(h, a, this.SA as Standings, true);
  }

  get standings(): Standings {
    return this.S as Standings;
  }
}
