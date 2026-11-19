/**
 * Catálogo informativo de casas de referencia (cero enlaces de afiliado, conforme a PRODUCT.md).
 * Permite al socio filtrar qué casas usa como referencia frente al Momio Justo del modelo.
 */
import type { BookQuoteItem } from "./types";

export interface BookmakerOption {
  readonly id: string;
  readonly label: string;
  readonly regionHint: string;
}

export const BOOKMAKER_OPTIONS: readonly BookmakerOption[] = [
  { id: "caliente_mx", label: "Caliente", regionHint: "MX" },
  { id: "codere", label: "Codere", regionHint: "MX" },
  { id: "bet365", label: "Bet365", regionHint: "MX / Global" },
  { id: "betcris", label: "Betcris", regionHint: "MX / LatAm" },
  { id: "novibet", label: "Novibet", regionHint: "MX / LatAm" },
  { id: "betway", label: "Betway", regionHint: "MX / Global" },
  { id: "playdoit", label: "Playdoit", regionHint: "MX" },
  { id: "pinnacle", label: "Pinnacle", regionHint: "Referencia" },
  { id: "betmgm", label: "BetMGM", regionHint: "US" },
  { id: "bwin", label: "Bwin", regionHint: "Global" },
  { id: "william_hill", label: "William Hill", regionHint: "Global" },
  { id: "unibet", label: "Unibet", regionHint: "Global" },
  { id: "draftkings", label: "DraftKings", regionHint: "US" },
  { id: "fanduel", label: "FanDuel", regionHint: "US" },
  { id: "betonline", label: "BetOnline", regionHint: "Global" },
] as const;

export const ALLOWED_BOOKMAKER_IDS: ReadonlySet<string> = new Set(
  BOOKMAKER_OPTIONS.map((b) => b.id),
);

export const DEFAULT_PREFERRED_BOOKS: readonly string[] = ["codere", "bet365", "pinnacle"];

export const BOOKMAKER_LABEL_BY_ID: Readonly<Record<string, string>> = Object.fromEntries([
  ...BOOKMAKER_OPTIONS.map((b) => [b.id, b.label]),
  ["caliente_mx", "Caliente"],
  ["williamhill", "William Hill"],
  ["william-hill", "William Hill"],
  ["betonlineag", "BetOnline"],
]);

export function normalizeBookKey(raw: string): string {
  const clean = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (clean === "williamhill") return "william_hill";
  if (clean === "betonlineag") return "betonline";
  return clean;
}

export function formatCanonicalBookLabel(bookSlug: string): string {
  const clean = normalizeBookKey(bookSlug);
  if (BOOKMAKER_LABEL_BY_ID[clean]) return BOOKMAKER_LABEL_BY_ID[clean]!;
  if (!clean) return "Casa";
  return clean
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sanitizePreferredBooks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PREFERRED_BOOKS];
  const valid = Array.from(
    new Set(
      raw
        .filter((x): x is string => typeof x === "string")
        .map((x) => normalizeBookKey(x))
        .filter((x) => ALLOWED_BOOKMAKER_IDS.has(x)),
    ),
  );
  return valid.length > 0 ? valid : [...DEFAULT_PREFERRED_BOOKS];
}

export function computeEdgePts(p: number, decimal: number | null): number | null {
  if (decimal === null || !Number.isFinite(decimal) || decimal <= 1) return null;
  return Math.round((p - 1 / decimal) * 1000) / 10;
}

/**
 * Elige la mejor cuota disponible dentro de las casas seleccionadas por el socio.
 * Si ninguna casa preferida tiene captura vigente pero sí hay una cuota verificada de otra casa,
 * usa la mejor cuota disponible como respaldo transparente.
 */
export function resolvePreferredBookQuote(
  quotes: readonly BookQuoteItem[] | undefined,
  preferredBooks?: readonly string[],
): BookQuoteItem | null {
  if (!quotes || quotes.length === 0) return null;
  const activeSet =
    preferredBooks && preferredBooks.length > 0
      ? new Set(preferredBooks.map((b) => normalizeBookKey(b)))
      : ALLOWED_BOOKMAKER_IDS;

  const matching = quotes
    .filter((q) => activeSet.has(normalizeBookKey(q.book)))
    .slice()
    .sort((a, b) => b.decimal - a.decimal || b.capturedAtUtc.localeCompare(a.capturedAtUtc));

  if (matching[0]) return matching[0];

  const fallback = quotes
    .slice()
    .sort((a, b) => b.decimal - a.decimal || b.capturedAtUtc.localeCompare(a.capturedAtUtc));
  return fallback[0] ?? null;
}

/**
 * Convierte un momio escrito por el usuario (americano `-110` / `+125` o decimal `1.95`)
 * a cuota decimal válida (`> 1.01`), o `null` si aún no es válido.
 */
export function parseManualOddsInput(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  if (cleaned.startsWith("+") || cleaned.startsWith("-") || Math.abs(num) >= 100) {
    if (num >= 100) return Math.round((1 + num / 100) * 1000) / 1000;
    if (num <= -100) return Math.round((1 + 100 / Math.abs(num)) * 1000) / 1000;
    return null;
  }
  if (num > 1.01 && num <= 500) {
    return Math.round(num * 1000) / 1000;
  }
  return null;
}
