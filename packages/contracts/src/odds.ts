/**
 * Funciones puras de cuotas y probabilidad implícita (SHARED_CONTRACTS.md §5).
 */

/**
 * Convierte una cadena de cuota decimal ("2.10" o "2,10") o americana ("+110", "-150", "−150")
 * a cuota decimal (> 1). Devuelve null si el formato no es válido.
 */
export function parseOdds(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).trim().replace("−", "-").replace(",", ".");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  if (/^[+-]/.test(cleaned) || Math.abs(num) >= 100) {
    if (Math.abs(num) < 100) return null;
    return num > 0 ? 1 + num / 100 : 1 + 100 / Math.abs(num);
  }
  return num > 1 ? num : null;
}

/** Probabilidad implícita bruta (1 / d) a partir de una cuota decimal (> 1). */
export function implied(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new Error(`Cuota decimal inválida: ${decimalOdds}`);
  }
  return 1 / decimalOdds;
}

/** Cuota justa decimal (1 / p) a partir de una probabilidad en (0, 1). */
export function fairOdds(p: number): number {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) {
    throw new Error(`Probabilidad fuera de rango (0,1): ${p}`);
  }
  return 1 / p;
}

/** Convierte cuota americana (|a| >= 100) a decimal. */
export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || Math.abs(american) < 100) {
    throw new Error(`Cuota americana inválida: ${american}`);
  }
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

/** Convierte cuota decimal (> 1) a cuota americana redondeada. */
export function decimalToAmerican(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new Error(`Cuota decimal inválida: ${decimalOdds}`);
  }
  if (decimalOdds >= 2) {
    return Math.round((decimalOdds - 1) * 100);
  }
  return Math.round(-100 / (decimalOdds - 1));
}

/** Normalización multiplicativa sin margen (no-vig) de un conjunto de cuotas decimales. */
export function noVigMultiplicative(decimalPrices: number[]): number[] {
  if (decimalPrices.length === 0) return [];
  const rawImplied = decimalPrices.map(implied);
  const sum = rawImplied.reduce((a, b) => a + b, 0);
  return rawImplied.map((p) => p / sum);
}
