/**
 * Lógica de apuestas/bankroll — reconstrucción del módulo del shell
 * (AV, AVX, BRK de touchiq.com.mx). Categoría: OBSERVADO.
 */
import { dec } from "./stats.js";

export type BetStatus = "p" | "w" | "l" | "v"; // pendiente / ganó / perdió / nula

export interface BetLeg {
  l: string; // etiqueta del pick
  m: string; // mercado
  sp: string; // deporte/liga
  t?: string;
  p: number; // probabilidad del modelo
  d: number | null; // cuota decimal
}

export interface Bet {
  id: string;
  ts: number;
  legs: BetLeg[];
  p: number;
  d: number;
  stake: number;
  u: number; // % del bank
  st: BetStatus;
}

export interface BankConfig {
  start: number; // bankroll inicial (default 1000)
  th: number; // umbral para apostar 10% (default 0.6)
}

/** Ganancia neta de una apuesta según su estado. */
export const profit = (b: Bet): number =>
  b.st === "w" ? b.stake * (b.d - 1) : b.st === "l" ? -b.stake : 0;

/** Bankroll actual: inicial + neto de las resueltas, con piso 0. */
export const curBank = (bets: Bet[], cfg: BankConfig): number =>
  Math.max(0, cfg.start + bets.reduce((acc, b) => acc + profit(b), 0));

/**
 * Sizing del original: 10% del bank si el modelo da ≥ th y hay valor;
 * 5% si hay valor con confianza menor; 0 ("No apostar") si EV ≤ 0 o falta cuota.
 */
export const unitOf = (p: number, d: number | null, th: number): number =>
  d && p * d - 1 > 0 ? (p >= th ? 10 : 5) : 0;

/** EV = prob × cuota − 1. */
export const ev = (p: number, d: number | null): number | null => (d ? p * d - 1 : null);

/** Probabilidades implícitas sin margen ("casa N%") a partir de grupos de cuotas complementarias. */
export const noVig = (
  groups: [string, (number | null)[]][],
): { p: Record<string, number>; mg: [string, number][] } => {
  const r: Record<string, number> = {};
  const mg: [string, number][] = [];
  groups.forEach(([name, ds]) => {
    if (!ds.every((d) => d)) return;
    const s = ds.reduce((acc, d) => acc + 1 / (d as number), 0);
    ds.forEach((d, i) => {
      r[name + ":" + i] = 1 / (d as number) / s;
    });
    mg.push([name, s - 1]);
  });
  return { p: r, mg };
};

export const typ = (b: Bet): string =>
  b.legs.length > 1
    ? "Parlay"
    : / gana \+ /.test(b.legs[0]?.l ?? "")
      ? "Combinada (gana + over)"
      : / o empate|^Empate o /.test(b.legs[0]?.l ?? "")
        ? "Doble oportunidad"
        : "Sencilla";

export interface RoiRow {
  k: string;
  n: number;
  w: number;
  roi: number;
}

/** Desglose de ROI agrupado (por liga o por tipo de apuesta) — función `BRK` del original. */
export function roiBy(bets: Bet[], keyFn: (b: Bet) => string): RoiRow[] {
  const S = bets.filter((b) => b.st === "w" || b.st === "l");
  const m: Record<string, Bet[]> = {};
  S.forEach((b) => {
    const k = keyFn(b);
    (m[k] = m[k] || []).push(b);
  });
  return Object.entries(m)
    .map(([k, L]) => {
      const w = L.filter((b) => b.st === "w").length;
      const st = L.reduce((acc, b) => acc + b.stake, 0);
      const net = L.reduce((acc, b) => acc + profit(b), 0);
      return { k, n: L.length, w, roi: st ? net / st : 0 };
    })
    .sort((a, b) => b.n - a.n);
}

/** Cuota justa sin margen para combinadas del original (×1.05 simple, ×1.10 combinada cb_). */
export const fairDefault = (p: number, combined: boolean): number =>
  1 / (p * (combined ? 1.1 : 1.05));

export { dec };
