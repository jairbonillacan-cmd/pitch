/**
 * Motor NCAA — reconstrucción de page_ncaa_s1.js (touchiq.com.mx).
 * Diferencias verificadas vs NFL: T guarda PROMEDIOS por juego + conferencia;
 * build() usa `(avg·G + LGP·K + pts)/(G + K + n)` con K=3 y ajuste de fuerza de
 * conferencia (rs×cf, ra÷cf); SDM=15.5; pick solo moneyline con umbral 55%;
 * sin combinadas ("los marcadores colegiales son muy disparejos", comentario original).
 * Categoría: OBSERVADO (build/model0 leídos del código; regla del pick parcialmente
 * inferida de la UI — ver docs/16-limitations.md).
 */
import { phi, iphi, half } from "./stats.js";
import type { Injury, Market, Model, ResultRow, Standings, TeamStrength } from "./types.js";

export interface NcaaConstants {
  E: number;
  HFA: number; // 0.56
  K: number; // 3
  SHR: number; // encoge pH hacia 50% (0.85)
  SDM: number; // 15.5
  SDT: number; // 15
  SDP: number; // 11
  NG: number; // 96
  CONF: Record<string, number>; // multiplicador por conferencia (default 0.9)
  NEUT: string[]; // juegos en campo neutral
}

export interface NcaaTeams {
  [code: string]: [string, number, number, number, string]; // nombre, PF/j, PA/j, JJ, conf
}

export interface NcaaInput {
  teams: NcaaTeams;
  results: ResultRow[];
  audit?: ResultRow[]; // resultados auditados de la semana (se suman a la fuerza S)
  injuries: Injury[];
  constants: NcaaConstants;
  lgp: number; // promedio de puntos por equipo/juego en NCAA
}

export class NcaaEngine {
  private readonly teams: NcaaTeams;
  private readonly inj: Injury[];
  private readonly c: NcaaConstants;
  private readonly lgp: number;
  private S: Standings | null = null;
  private SA: Standings | null = null;

  constructor(input: NcaaInput) {
    this.teams = input.teams;
    this.inj = input.injuries;
    this.c = input.constants;
    this.lgp = input.lgp;
    this.rebuild(input.results, input.audit ?? []);
  }

  rebuild(results: ResultRow[], audit: ResultRow[]): void {
    this.S = this.build(results.concat(audit));
    this.SA = this.build(results);
  }

  /** Modo auditoría: fuerza sin los juegos auditados y sin lesiones (igual que el original). */
  modelAudit(h: string, a: string): Model {
    return this.model0(h, a, this.SA as Standings, true);
  }

  private build(rows: ResultRow[]): Standings {
    const { teams, c, lgp } = this;
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
    const ks = Object.keys(teams);
    ks.forEach((k) => {
      const t = teams[k];
      const G = t[3];
      const cf = c.CONF[t[4]] ?? 0.9;
      const n = acc[k].n;
      const rs = (t[1] * G + lgp * c.K + acc[k].f) / (G + c.K + n);
      const ra = (t[2] * G + lgp * c.K + acc[k].a) / (G + c.K + n);
      o[k] = { rs: rs * cf, ra: ra / cf, n: G + n, kn: true, gf: t[1], ga: t[2] };
      sum += o[k].rs;
    });
    const st = o as Standings;
    st.LG = sum / ks.length;
    return st;
  }

  private eff(t: string, SS: Standings, nn: boolean): TeamStrength {
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

  model0(h: string, a: string, SS: Standings, nn: boolean): Model {
    const c = this.c;
    const H = this.eff(h, SS, nn);
    const A = this.eff(a, SS, nn);
    const LG = SS.LG as number;
    const py = (t: TeamStrength) => Math.pow(t.rs, c.E) / (Math.pow(t.rs, c.E) + Math.pow(t.ra, c.E));
    const x = py(H);
    const y = py(A);
    const pn = (x - x * y) / (x + y - 2 * x * y);
    const oddsRatio = (pn / (1 - pn)) * (c.HFA / (1 - c.HFA));
    // NCAA: encoge la probabilidad hacia 50% con SHR (a diferencia del NFL que la usa directa)
    const pH = 0.5 + c.SHR * (oddsRatio / (1 + oddsRatio) - 0.5);
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
    // Regla del pick NCAA (OBSERVADA en el código original)
    let cp: Market | null;
    let ct: string;
    const mlDom = dom ? by(O, dom === "h" ? "mlh" : "mla") : null;
    if (mlDom && mlDom.p >= 0.52) {
      cp = mlDom;
      ct = "ML · DOMINA EN OFENSIVA Y DEFENSIVA";
    } else if (Math.max(pH, 1 - pH) >= 0.58) {
      cp = by(O, pH >= 0.5 ? "mlh" : "mla");
      ct = "ML FAVORITO (sin dominio total)";
    } else {
      cp = [by(O, pH >= 0.5 ? "mlh" : "mla"), by(O, "pld"), by(O, "ov"), by(O, "un")]
        .reduce<Market | null>((m, z) => (z && (!m || z.p > m.p) ? z : m), null);
      ct = cp?.id.startsWith("ml") ? "FAVORITO LIGERO · PARTIDO PAREJO" : "SIN VENTAJA CLARA · opción más segura";
    }
    return {
      O, cp, ct, dom, lh, la, tot, H, A, x, y, pn, pH, mu, L, line,
      notes: [...(H.nt ?? []).map((z) => [h, ...z] as [string, string, boolean]),
              ...(A.nt ?? []).map((z) => [a, ...z] as [string, string, boolean])],
    };
  }

  model(h: string, a: string): Model {
    return this.model0(h, a, this.S as Standings, false);
  }
}

const by = (O: Market[], id: string): Market | null => O.find((z) => z.id === id) ?? null;
