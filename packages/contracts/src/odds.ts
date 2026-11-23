import { parseStrictFiniteNumber } from "./branded";

export function parseOdds(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).trim().replace("−", "-").replace(",", ".");
  if (!cleaned) return null;
  const num = parseStrictFiniteNumber(cleaned);
  if (num === null) return null;
  if (/^[+-]/.test(cleaned) || Math.abs(num) >= 100) {
    if (Math.abs(num) < 100) return null;
    return num > 0 ? 1 + num / 100 : 1 + 100 / Math.abs(num);
  }
  return num > 1 ? num : null;
}

export function implied(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new Error(`Cuota decimal inválida: ${decimalOdds}`);
  }
  return 1 / decimalOdds;
}

export function fairOdds(p: number): number {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) {
    throw new Error(`Probabilidad fuera de rango (0,1): ${p}`);
  }
  return 1 / p;
}

export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || Math.abs(american) < 100) {
    throw new Error(`Cuota americana inválida: ${american}`);
  }
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new Error(`Cuota decimal inválida: ${decimalOdds}`);
  }
  if (decimalOdds >= 2) {
    return Math.round((decimalOdds - 1) * 100);
  }
  return Math.round(-100 / (decimalOdds - 1));
}

export function noVigMultiplicative(decimalPrices: number[]): number[] {
  if (decimalPrices.length === 0) return [];
  const rawImplied = decimalPrices.map(implied);
  const sum = rawImplied.reduce((a, b) => a + b, 0);
  return rawImplied.map((p) => p / sum);
}
