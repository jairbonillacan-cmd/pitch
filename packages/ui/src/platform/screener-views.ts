/**
 * Escala no lineal de momios (101 pasos, 68 % del recorrido en [1.30, 3.00]),
 * ponderación suave C^1 y vistas guardadas multi-deporte para `/app/picks` (ADR-048).
 */

export type ScreenerSportFilter = "all" | "futbol" | "nfl" | "nba" | "nhl" | "mlb";
export type ScreenerBandFilter = "all" | "alta" | "media" | "baja";
export type ScreenerKindFilter =
  | "all"
  | "resultado"
  | "goles"
  | "conteos"
  | "ambos"
  | "handicap";
export type ScreenerSortKey = "p" | "hora" | "momio" | "ventaja" | "relevancia";
export type ScreenerWindowFilter = "all" | "today" | "next48h";

export interface SavedScreenerView {
  readonly id: string;
  readonly name: string;
  readonly sport: ScreenerSportFilter;
  readonly league: string;
  readonly band: ScreenerBandFilter;
  readonly kind: ScreenerKindFilter;
  readonly sort: ScreenerSortKey;
  readonly onlyPositiveEdge: boolean;
  readonly minOddsStep: number;
  readonly maxOddsStep: number;
  readonly window: ScreenerWindowFilter;
}

export const SAVED_SCREENER_VIEWS_STORAGE_KEY = "pl-screener-views-v1";
export const MAX_SAVED_SCREENER_VIEWS = 12;

/**
 * Mapea un paso entero `0..100` a cuota decimal no lineal:
 * - `0..11`: `[1.01, 1.30)` (~0.024)
 * - `12..80`: `[1.30, 3.00]` (resolución fina de `0.025`, 68 % del track)
 * - `81..92`: `(3.00, 6.00]` (`0.25`)
 * - `93..99`: `(6.00, 25.00)` (escala logarítmica)
 * - `100`: `null` (sin tope superior, `"25.00+"`)
 */
export function sliderStepToOdds(step: number): number | null {
  const s = Math.max(0, Math.min(100, Math.round(step)));
  if (s >= 100) return null;
  if (s < 12) return Math.round((1.01 + (0.29 / 12) * s) * 1000) / 1000;
  if (s <= 80) return Math.round((1.3 + 0.025 * (s - 12)) * 1000) / 1000;
  if (s <= 92) return Math.round((3.0 + 0.25 * (s - 80)) * 100) / 100;
  return Math.round(6.0 * Math.pow(25.0 / 6.0, (s - 92) / 8) * 100) / 100;
}

/** Inversa biyectiva de `sliderStepToOdds`. */
export function oddsToSliderStep(odds: number | null | undefined): number {
  if (odds == null || !Number.isFinite(odds) || odds >= 25.0) return 100;
  if (odds <= 1.01) return 0;
  if (odds < 1.3) return Math.round(((odds - 1.01) / 0.29) * 12);
  if (odds <= 3.0) return 12 + Math.round((odds - 1.3) / 0.025);
  if (odds <= 6.0) return 80 + Math.round((odds - 3.0) / 0.25);
  return Math.min(99, 92 + Math.round((8 * Math.log(odds / 6.0)) / Math.log(25.0 / 6.0)));
}

function smoothstep01(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}

/**
 * Ponderación suave C^1 por zona de liquidez de cuota (sin saltos discontinuos).
 * Favorece cuotas ejecutables entre ~1.35 y ~2.80 y atenúa gradualmente extremos.
 */
export function smoothOddsWeight(odds: number): number {
  if (!Number.isFinite(odds) || odds <= 1.01) return 0;
  const rise = smoothstep01((odds - 1.15) / (1.45 - 1.15));
  const decay = 1 - 0.65 * smoothstep01((odds - 2.6) / (6.0 - 2.6));
  return Math.round(rise * decay * 10_000) / 10_000;
}

const VALID_SPORTS = new Set<ScreenerSportFilter>(["all", "futbol", "nfl", "nba", "nhl", "mlb"]);
const VALID_BANDS = new Set<ScreenerBandFilter>(["all", "alta", "media", "baja"]);
const VALID_KINDS = new Set<ScreenerKindFilter>([
  "all",
  "resultado",
  "goles",
  "conteos",
  "ambos",
  "handicap",
]);
const VALID_SORTS = new Set<ScreenerSortKey>(["p", "hora", "momio", "ventaja", "relevancia"]);
const VALID_WINDOWS = new Set<ScreenerWindowFilter>(["all", "today", "next48h"]);

export function sanitizeSavedScreenerViews(raw: unknown): SavedScreenerView[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedScreenerView[] = [];
  const seenIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id =
      typeof obj.id === "string" && obj.id.trim().length >= 2
        ? obj.id.trim().slice(0, 48)
        : "";
    const name =
      typeof obj.name === "string" && obj.name.trim().length >= 2
        ? obj.name.trim().slice(0, 40)
        : "";
    if (!id || !name || seenIds.has(id)) continue;
    seenIds.add(id);

    const sport = VALID_SPORTS.has(obj.sport as ScreenerSportFilter)
      ? (obj.sport as ScreenerSportFilter)
      : "all";
    const league =
      typeof obj.league === "string" && obj.league.trim().length > 0
        ? obj.league.trim().slice(0, 48)
        : "all";
    const band = VALID_BANDS.has(obj.band as ScreenerBandFilter)
      ? (obj.band as ScreenerBandFilter)
      : "all";
    const kind = VALID_KINDS.has(obj.kind as ScreenerKindFilter)
      ? (obj.kind as ScreenerKindFilter)
      : "all";
    const sort = VALID_SORTS.has(obj.sort as ScreenerSortKey)
      ? (obj.sort as ScreenerSortKey)
      : "p";
    const windowVal = VALID_WINDOWS.has(obj.window as ScreenerWindowFilter)
      ? (obj.window as ScreenerWindowFilter)
      : "all";

    const rawMin = typeof obj.minOddsStep === "number" && Number.isFinite(obj.minOddsStep)
      ? Math.max(0, Math.min(99, Math.round(obj.minOddsStep)))
      : 0;
    const rawMax = typeof obj.maxOddsStep === "number" && Number.isFinite(obj.maxOddsStep)
      ? Math.max(1, Math.min(100, Math.round(obj.maxOddsStep)))
      : 100;
    const minOddsStep = Math.min(rawMin, rawMax - 1);
    const maxOddsStep = Math.max(rawMax, minOddsStep + 1);

    out.push({
      id,
      name,
      sport,
      league,
      band,
      kind,
      sort,
      onlyPositiveEdge: Boolean(obj.onlyPositiveEdge),
      minOddsStep,
      maxOddsStep,
      window: windowVal,
    });
    if (out.length >= MAX_SAVED_SCREENER_VIEWS) break;
  }

  return out;
}

export function readSavedScreenerViews(): SavedScreenerView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_SCREENER_VIEWS_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeSavedScreenerViews(JSON.parse(raw));
  } catch (err) {
    void err;
    return [];
  }
}

export function writeSavedScreenerViews(views: readonly SavedScreenerView[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SAVED_SCREENER_VIEWS_STORAGE_KEY,
      JSON.stringify(sanitizeSavedScreenerViews(views)),
    );
  } catch (err) {
    void err;
  }
}
