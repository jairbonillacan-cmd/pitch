const TZ = "America/Mexico_City";

export function formatLongDate(date: Date, withYear = false): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: TZ,
  }).format(date);
}

export function firstName(displayName: string | null | undefined): string | undefined {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || undefined;
}

export function formatOdds(decimal: number, format: "american" | "decimal"): string {
  if (format === "decimal") return decimal.toFixed(2);
  const safe = Math.max(1.02, decimal);
  const american = safe >= 2 ? Math.round((safe - 1) * 100) : Math.round(-100 / (safe - 1));
  return american > 0 ? `+${american}` : `${american}`;
}

export function formatPoints(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toFixed(1)} pts`;
}
