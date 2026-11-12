/**
 * PICK DEL DÍA y PARLAY DEL DÍA — reconstrucción del sistema de recomendación
 * observable de aztecavet.com (secciones PDX/PXlegs/openParlay de fb.html y
 * nhl.html; MLB no lo ejecuta: temporada terminada).
 * Scoring: sin valor → −1; con valor → 2+p; p<.55 → −.5; p>.72 → penalización
 * .72−2(p−.72); resto → p. Parlay: mercados 60–80%, top 3 (cuota de respaldo
 * ≈ justa × 1/(1.05|1.10)), TOP 5 alternativo.
 * Categoría: OBSERVADO (paridad 1:1 contra el oráculo verbatim).
 */
import { dec } from "../stats.js";

export interface PickCandidate {
  g: unknown;
  pk: { id: string; l: string; p: number }; // pick del modelo o mejor valor
  b: { o: { id: string; l: string; p: number }; ev: number; d: number } | null;
  nob: boolean;
}

export interface PickLeg {
  g: unknown;
  o: { id: string; l: string; p: number };
  k: string;
  real: boolean;
  d: number;
}

/** Puntaje del pick del día (idéntico al original). */
export function scorePick(z: PickCandidate): number {
  return z.nob ? -1 : z.b ? 2 + z.pk.p : z.pk.p < 0.55 ? -0.5 : z.pk.p > 0.72 ? 0.72 - 2 * (z.pk.p - 0.72) : z.pk.p;
}

/** Elegibles de parlay: mercados 60–80% (lista blanca o combinadas cb_). */
export function parlayLegs(
  L: PickCandidate[],
  oddsOf: (k: string) => string | undefined,
  keyOf: (z: PickCandidate, o: { id: string }) => string,
  pxids: string[],
): PickLeg[] {
  const legs = L
    .filter((z) => !z.nob)
    .map((z) => {
      let o = z.b ? z.b.o : null;
      if (!o) {
        const c = (z as unknown as { m: { O: { id: string; p: number }[] } }).m.O
          .filter((x) => (pxids.includes(x.id) || /^cb_/.test(x.id)) && x.p >= 0.6 && x.p <= 0.8)
          .sort((x, y) => y.p - x.p);
        o = (c[0] ?? null) as typeof o;
      }
      if (!o || o.p < 0.6 || o.p > 0.8) return null;
      const k = keyOf(z, o);
      const d = dec(oddsOf(k));
      return {
        g: z.g,
        o,
        k,
        real: !!d,
        d: d || 1 / (o.p * (/^cb_|^dco/.test(o.id) ? 1.1 : 1.05)),
      } as PickLeg;
    })
    .filter(Boolean) as PickLeg[];
  return legs
    .sort((a, b) => b.o.p - a.o.p)
    .slice(0, 5);
}

/** Totales de un parlay: probabilidad y cuota producto. */
export const parlayOdds = (L: PickLeg[]): { p: number; d: number } => ({
  p: L.reduce((a, z) => a * z.o.p, 1),
  d: L.reduce((a, z) => a * z.d, 1),
});

/** Cuota decimal → americana (formato del original). */
export const amer = (d: number): string =>
  d >= 2 ? "+" + Math.round((d - 1) * 100) : "-" + Math.round(100 / (d - 1));
