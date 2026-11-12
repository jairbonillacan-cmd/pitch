/**
 * Motor de props de jugadores — reconstrucción de page_nfl_s3.js (touchiq.com.mx).
 * Proyección: ritmo del jugador (con freno de 2 juegos hacia el promedio de su posición)
 * × defensa rival (mitad del exceso vs promedio de liga).
 * Categoría: OBSERVADO (fórmulas idénticas; datos PJ/DF de Pro-Football-Reference al 19 oct).
 */
import { phi, poisCDF, half } from "./stats.js";
import type { DefenseRow, PlayerRow, PropMarket } from "./types.js";

export interface PropsPrior {
  PRI: Record<"QB" | "RB" | "WR" | "TE", Record<string, number>>;
  LIGA: { LGP: number; LGR: number; LGS: number };
}

/** Freno del original (PK2=2): promedio ponderado hacia el prior de posición. */
export const shr = (tot: number, g: number, pr: number): number => (tot + pr * 2) / (g + 2);

/** Factor defensivo: mitad del exceso de la defensa rival vs el promedio de liga. */
export const fct = (v: number, lg: number): number => 1 + 0.5 * (v / lg - 1);

/** Encuentra al rival de un equipo en los juegos futuros (D sin auditados). */
export const oppOf = (
  t: string,
  days: { aud?: boolean; h: string; a: string }[][],
): string | null => {
  for (const d of days) {
    for (const g of d) {
      if (g.aud) continue;
      if (g.h === t) return g.a;
      if (g.a === t) return g.h;
    }
  }
  return null;
};

/** Construye los mercados de props de un jugador contra la defensa `o`. */
export function pmk(p: PlayerRow, o: string | null, df: Record<string, DefenseRow>, prior: PropsPrior): PropMarket[] {
  const { PRI, LIGA } = prior;
  const d = o ? df[o] : undefined;
  const pr = PRI[p.pos] ?? PRI.WR;
  const fP = d ? fct(d[2] / d[0], LIGA.LGP) : 1;
  const fR = d ? fct(d[3] / d[0], LIGA.LGR) : 1;
  const fS = d ? fct(d[1] / d[0], LIGA.LGS) : 1;
  const M: PropMarket[] = [];
  const nrm = (id: string, lab: string, mu: number, sd: number) => M.push({ id, lab, mu, sd, kind: "n" });
  const poi = (id: string, lab: string, mu: number) => M.push({ id, lab, mu, kind: "p" });

  if (p.pos === "QB") {
    nrm("py", "Yardas de pase", shr(p.py, p.g, pr.py) * fP, 62);
    poi("ptd", "TD de pase", shr(p.ptd, p.g, pr.ptd) * fS);
    const ry = shr(p.ry, p.g, pr.ry) * fR;
    if (ry >= 18) nrm("ry", "Yardas por tierra", ry, Math.max(12, 0.55 * ry));
  } else if (p.pos === "RB") {
    const ry = shr(p.ry, p.g, pr.ry) * fR;
    nrm("ry", "Yardas por tierra", ry, Math.max(15, 0.45 * ry));
    if (p.rec != null && p.rec / p.g >= 1.5) {
      poi("rec", "Recepciones", shr(p.rec, p.g, pr.rec) * fP);
      nrm(
        "rcy",
        "Yardas por recepción",
        shr(p.rcy ?? 0, p.g, pr.rcy) * fP,
        Math.max(10, 0.6 * shr(p.rcy ?? 0, p.g, pr.rcy)),
      );
    }
    M.push({ id: "td", lab: "Anota TD", mu: shr(p.rtd + p.rctd, p.g, pr.td) * fS, kind: "td" });
  } else {
    const y = shr(p.rcy ?? 0, p.g, pr.rcy) * fP;
    nrm("rcy", "Yardas por recepción", y, Math.max(14, 0.55 * y));
    poi("rec", "Recepciones", shr(p.rec ?? 0, p.g, pr.rec) * fP);
    M.push({ id: "td", lab: "Anota TD", mu: shr(p.rctd, p.g, pr.td) * fS, kind: "td" });
  }
  return M;
}

/** Línea por defecto del original: TD 0.5, recepciones round(μ)−0.5, yardas half(μ). */
export function pline(p: PlayerRow, m: PropMarket, cache: Record<string, number>): number {
  const k = p.t + "|" + p.n + "|" + m.id;
  if (cache[k] != null) return cache[k];
  if (m.kind === "td") return 0.5;
  if (m.kind === "p") return Math.max(0.5, Math.round(m.mu) - 0.5);
  return half(m.mu);
}

/** P(> línea) según el tipo: TD Poisson ≥1, recepciones Poisson acumulada, yardas normal. */
export function pprob(m: PropMarket, L: number): number {
  if (m.kind === "td") return 1 - Math.exp(-m.mu);
  if (m.kind === "p") return 1 - poisCDF(Math.floor(L), m.mu);
  return 1 - phi((L - m.mu) / (m.sd ?? 1));
}

/** Línea alternativa con P(over)≈0.68 (Poisson) o redondeada a .5 (yardas). */
export function safeAlt(m: PropMarket): number | null {
  if (m.kind === "td") return null;
  if (m.kind === "p") {
    let L = Math.floor(m.mu) - 0.5;
    while (L > 0.5 && 1 - poisCDF(Math.floor(L), m.mu) < 0.68) L -= 1;
    return L >= 0.5 ? L : null;
  }
  const L = Math.floor((m.mu - 0.5 * (m.sd ?? 1)) / 5) * 5 + 0.5;
  return L > 0 ? L : null;
}
