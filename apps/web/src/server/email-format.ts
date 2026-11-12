/** Formato de fechas, momios y nombres para los correos (español de México). */

const TZ = "America/Mexico_City";

/** «14 de noviembre» (con año si `withYear`). */
export function formatLongDate(date: Date, withYear = false): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: TZ,
  }).format(date);
}

/** Primer nombre para el saludo; undefined si no hay. */
export function firstName(displayName: string | null | undefined): string | undefined {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || undefined;
}

/** Momio decimal → «-130», «+150» o «1.82», según el formato que eligió la persona. */
export function formatOdds(decimal: number, format: "american" | "decimal"): string {
  if (format === "decimal") return decimal.toFixed(2);
  const safe = Math.max(1.02, decimal);
  const american = safe >= 2 ? Math.round((safe - 1) * 100) : Math.round(-100 / (safe - 1));
  return american > 0 ? `+${american}` : `${american}`;
}

/** «+3.2 pts» o «−1.4 pts». */
export function formatPoints(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toFixed(1)} pts`;
}
