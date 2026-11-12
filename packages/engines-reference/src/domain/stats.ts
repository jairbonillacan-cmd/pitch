/**
 * Funciones estadísticas base — reconstruidas del comportamiento observable
 * de touchiq.com.mx (motor NFL, page_nfl_s1.js, verificado offline 5/5 contra la UI).
 * Categoría: OBSERVADO (implementación idéntica a la función original documentada).
 */

/** CDF normal estándar (aproximación de Abramowitz-Stegun usada por el original). */
export const phi = (x: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
};

/** Inversa de phi por bisección (50 iteraciones, dominio ±6) — idéntico al original. */
export const iphi = (p: number): number => {
  let lo = -6;
  let hi = 6;
  for (let k = 0; k < 50; k++) {
    const m = (lo + hi) / 2;
    if (phi(m) < p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};

/** CDF Poisson acumulada hasta k con media l. */
export const poisCDF = (k: number, l: number): number => {
  let s = 0;
  let p = Math.exp(-l);
  for (let i = 0; i <= k; i++) {
    s += p;
    p *= l / (i + 1);
  }
  return s;
};

/** Redondeo a línea válida de .5 (el original nunca deja líneas enteras). */
export const half = (x: number): number => {
  let l = Math.round(x * 2) / 2;
  if (Number.isInteger(l)) l += 0.5;
  return l;
};

/**
 * Parser de cuotas: acepta decimal ("2.4" o "2,4") o americana ("−150"/"+120").
 * Americanas: |v|≥100 → 1+v/100 (favorito positivo) o 1+100/−v (negativo).
 * Devuelve null si no es una cuota válida (>1).
 */
export const dec = (s: string | null | undefined): number | null => {
  const v = parseFloat(String(s == null ? "" : s).replace(",", "."));
  if (isNaN(v)) return null;
  if (Math.abs(v) >= 100) return v > 0 ? 1 + v / 100 : 1 + 100 / -v;
  return v > 1 ? v : null;
};
