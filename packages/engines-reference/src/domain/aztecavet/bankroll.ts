/**
 * Boleto, bankroll y reglas de apuesta de aztecavet.com (shell, inline_1).
 * Diferencias observadas frente al módulo genérico betting.ts (touchiq):
 *   • umbral de valor EV ≥ +4% (EVMIN), no >0;
 *   • noVig con claves por id de mercado (no "nombre:i");
 *   • parlay con advertencia de correlación por partido y cuota opcional.
 * Categoría: OBSERVADO (paridad contra el oráculo del shell).
 */
import { dec } from "../stats.js";
import { BET } from "./constants.js";
import type { Bet, BetLeg } from "../betting.js";
import type { SlipPick } from "./types.js";
export type { Bet, BetLeg };

export interface BankConfig {
  start: number;
  th: number;
}

export const money = (v: number): string => (v < 0 ? "−" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("es-MX");
export const pct = (v: number): string => (v * 100).toFixed(1) + "%";

export const profit = (b: Bet): number => (b.st === "w" ? b.stake * (b.d - 1) : b.st === "l" ? -b.stake : 0);
export const curBank = (bets: Bet[], cfg: BankConfig): number =>
  Math.max(0, cfg.start + bets.reduce((a, b) => a + profit(b), 0));

/** Sizing del original: solo 5%/10%; 0 si EV < +4% o falta cuota. */
export const unitOf = (p: number, d: number | null, th: number): number =>
  d && p * d - 1 >= BET.EVMIN ? (p >= th ? BET.UNIT_HIGH : BET.UNIT_LOW) : 0;

export const evOf = (p: number, d: number | null): number | null => (d ? p * d - 1 : null);

/** noVig por id de mercado (AVX.noVig del original). */
export function noVigIds(
  groups: [string, string[]][],
  odd: (id: string) => number | null,
): { p: Record<string, number>; mg: [string, number][] } {
  const r: Record<string, number> = {};
  const mg: [string, number][] = [];
  groups.forEach(([name, ids]) => {
    const ds = ids.map(odd);
    if (ds.every((d): d is number => d != null)) {
      const s = ds.reduce((a, d) => a + 1 / d, 0);
      ids.forEach((id, i) => (r[id] = 1 / (ds[i] as number) / s));
      mg.push([name, s - 1]);
    }
  });
  return { p: r, mg };
}

/** Resumen matemático del boleto (renderSlip del original). */
export interface SlipSummary {
  n: number;
  p: number;
  allD: boolean;
  dP: number | null;
  ov: number | null;
  d: number | null;
  ev: number | null;
  sug: number;
  corr: boolean;
  sameMatchGroups: string[];
}

export function slipSummary(
  slip: { k: string; gk: string; p: number; d: number | null }[],
  ovr: string,
  th: number,
): SlipSummary {
  const L = slip;
  const n = L.length;
  const cnt: Record<string, number> = {};
  L.forEach((x) => (cnt[x.gk] = (cnt[x.gk] || 0) + 1));
  const sameMatchGroups = Object.keys(cnt).filter((k) => (cnt[k] ?? 0) > 1);
  const p = L.reduce((a, x) => a * x.p, 1);
  const allD = L.every((x) => x.d);
  const dP = allD ? L.reduce((a, x) => a * (x.d as number), 1) : null;
  const ov = n > 1 ? dec(ovr) : null;
  const d = ov || dP;
  const ev = d ? p * d - 1 : null;
  const sug = unitOf(p, d, th);
  return { n, p, allD, dP, ov, d, ev, sug, corr: sameMatchGroups.length > 0, sameMatchGroups };
}

/** Registro de apuesta (spreg del original). */
export function registerBet(
  slip: { k: string; gk: string; sp: string; m: string; l: string; p: number; d: number | null; t: string }[],
  ovr: string,
  u: number | null,
  bank: number,
  ts: number,
): Bet | null {
  const L = slip;
  const p = L.reduce((a, x) => a * x.p, 1);
  const dP = L.every((x) => x.d) ? L.reduce((a, x) => a * (x.d as number), 1) : null;
  const d = (L.length > 1 && dec(ovr)) || dP;
  const uu = u != null ? u : unitOf(p, d, BET.TH);
  if (!d || !uu) return null;
  const amt = (bank * uu) / 100;
  return {
    id: "b" + ts.toString(36) + Math.random().toString(36).slice(2, 6),
    ts,
    legs: L.map((x) => ({ l: x.l, m: x.m, sp: x.sp, t: x.t, p: x.p, d: x.d })),
    p: +p.toFixed(4),
    d: +d.toFixed(3),
    stake: Math.round(amt * 100) / 100,
    u: uu,
    st: "p",
  };
}

/** Mensaje de calibración del historial (branching exacto del original). */
export function calibration(bets: Bet[]): string | null {
  const S = bets.filter((b) => b.st === "w" || b.st === "l");
  if (!S.length) return null;
  const W = S.filter((b) => b.st === "w").length;
  const avgP = S.reduce((a, b) => a + b.p, 0) / S.length;
  const real = W / S.length;
  if (S.length < 30)
    return `En tus ${S.length} apuesta${S.length > 1 ? "s" : ""} resuelta${S.length > 1 ? "s" : ""}, el modelo les daba en promedio ${pct(avgP)} de probabilidad y acertaste el ${pct(real)}. Con menos de 30 apuestas la diferencia todavía es sobre todo suerte.`;
  if (Math.abs(real - avgP) < 0.04)
    return `En tus ${S.length} apuestas resueltas, el modelo les daba en promedio ${pct(avgP)} de probabilidad y acertaste el ${pct(real)}. Van bastante parejos: el modelo está bien calibrado contigo.`;
  return real > avgP
    ? `En tus ${S.length} apuestas resueltas, el modelo les daba en promedio ${pct(avgP)} de probabilidad y acertaste el ${pct(real)}. Estás acertando más de lo que el modelo esperaba.`
    : `En tus ${S.length} apuestas resueltas, el modelo les daba en promedio ${pct(avgP)} de probabilidad y acertaste el ${pct(real)}. Estás acertando menos de lo que el modelo esperaba; conviene ser más selectivo.`;
}

/** Clave de almacenamiento del shell. */
export const STORAGE_KEY = "azteca_av";

/** Estado persistido exacto del original (lsSave). */
export interface AvPersisted {
  cfg: BankConfig;
  odds: Record<string, string>;
  slip: SlipPick[];
  bets: Bet[];
}
