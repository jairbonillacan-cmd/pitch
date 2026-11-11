/**
 * A28 (Ola 1 · Agente A1) — Contrato canónico de `odds_snapshots`, validación de calidad,
 * detección de huecos `> 60 min` y resolución estricta de cuota de cierre sin margen.
 *
 * Paridad exacta (`|Δ| < 1e-12`) con `services/ingest/odds_snapshots.py` y consumo en
 * solo lectura de `src/domain/prediction/devig.ts`.
 */

import {
  devig,
  devig2Way,
  devigAdaptive1X2,
  InvalidOddsError,
  MAX_OVERROUND,
  MIN_OVERROUND,
  overround,
  type AdaptiveDevigOptions,
  type DevigMethod,
} from "./devig";

/** Las 11 columnas requeridas del contrato `odds_snapshots`. */
export const REQUIRED_ODDS_SNAPSHOT_COLUMNS = [
  "event_id",
  "sport",
  "league",
  "market",
  "line",
  "selection",
  "book",
  "price_decimal",
  "ts_captured",
  "ts_event_start",
  "source",
] as const;

/** Clave natural exacta de deduplicación. */
export const DEDUP_NATURAL_KEY_COLUMNS = [
  "event_id",
  "market",
  "line",
  "selection",
  "book",
  "ts_captured",
  "source",
] as const;

/** Columnas de agrupación para detección de huecos temporales entre capturas consecutivas. */
export const GAP_GROUP_COLUMNS = ["event_id", "market", "line", "book"] as const;

/** Rango cerrado aceptado para cuotas decimales `[1.01, 1000.0]`. */
export const MIN_PRICE_DECIMAL = 1.01;
export const MAX_PRICE_DECIMAL = 1000.0;

/** Umbral máximo en minutos antes de reportar hueco entre snapshots consecutivos (`> 60 min`). */
export const MAX_GAP_MINUTES = 60.0;

/** Orden estricto de resolución de cierre sharp en `scraped_ws` (jamás casas recreativas). */
export const SHARP_SCRAPED_FALLBACK_ORDER = ["pinnacle", "smarkets"] as const;

/** Ventana máxima (ms) para inferir `close` en `historical_fd` cuando `snapshot_stage` no viene informado. */
const HISTORICAL_CLOSE_MAX_DELTA_MS = 3_600_000;

export type OddsSource = "scraped_ws" | "historical_fd";
export type SnapshotStage = "open" | "intraday" | "close";

/** Esquema exacto de una fila en `odds_snapshots.parquet` (+ `snapshot_stage` auxiliar opcional). */
export interface OddsSnapshotRow {
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line: number | null;
  readonly selection: string;
  readonly book: string;
  readonly price_decimal: number;
  readonly ts_captured: string;
  readonly ts_event_start: string;
  readonly source: OddsSource;
  readonly snapshot_stage?: SnapshotStage;
}

export interface ValidationStats {
  readonly n_raw: number;
  readonly n_missing_required: number;
  readonly n_out_of_range: number;
  readonly n_post_kickoff_discarded: number;
  readonly n_duplicates_removed: number;
  readonly n_valid: number;
}

export interface ValidationResult {
  readonly rows: OddsSnapshotRow[];
  readonly stats: ValidationStats;
}

export interface SnapshotGap {
  readonly event_id: string;
  readonly source: OddsSource;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line: number | null;
  readonly book: string;
  readonly n_captures: number;
  readonly prev_ts_captured: string;
  readonly next_ts_captured: string;
  readonly gap_minutes: number;
}

export interface ClosingSelectionQuote {
  readonly price_decimal: number;
  readonly p_novig: number;
  readonly price_novig: number;
}

export type ClosingMissingReason =
  | "empty_input"
  | "missing_pinnacle_close"
  | "missing_pinnacle_and_smarkets"
  | "incomplete_or_implausible_overround";

export interface ClosingMarketResolution {
  readonly event_id: string;
  readonly source: OddsSource;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line: number | null;
  readonly ts_event_start: string;
  readonly closing_missing: boolean;
  readonly closing_book: "pinnacle" | "smarkets" | null;
  readonly ts_closing: string | null;
  readonly missing_reason: ClosingMissingReason | null;
  readonly closing_overround: number | null;
  readonly selections: Readonly<Record<string, ClosingSelectionQuote>>;
}

export interface DevigClosingResult {
  readonly market: string;
  readonly method: DevigMethod;
  readonly overround: number;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly fair_prices: Readonly<Record<string, number>>;
}

export interface ResolveClosingOptions {
  readonly devigMethod?: DevigMethod;
  readonly adaptiveOptions?: AdaptiveDevigOptions;
}

const MARKET_REQUIRED_SELECTIONS: Readonly<Record<string, readonly string[]>> = {
  "1x2": ["home", "draw", "away"],
  moneyline: ["home", "away"],
  ah: ["home", "away"],
  spread: ["home", "away"],
  totals: ["over", "under"],
};

const VALID_SOURCES = new Set<string>(["scraped_ws", "historical_fd"]);
const VALID_STAGES = new Set<string>(["open", "intraday", "close"]);

/** Valida que una cuota decimal sea finita y esté en `[1.01, 1000.0]`. */
export function isValidPriceDecimal(price: unknown): price is number {
  return (
    typeof price === "number" &&
    Number.isFinite(price) &&
    price >= MIN_PRICE_DECIMAL &&
    price <= MAX_PRICE_DECIMAL
  );
}

/** Normaliza `line` colapsando `undefined`/`NaN`/`±Infinity` a `null` y `-0` a `0`. */
export function normalizeLine(line: number | null | undefined): number | null {
  if (line === null || line === undefined || typeof line !== "number" || !Number.isFinite(line)) {
    return null;
  }
  return Object.is(line, -0) || line === 0 ? 0 : line;
}

function serializeLineKey(line: number | null): string {
  return line === null ? "__NULL__" : String(line);
}

/** Convierte un timestamp ISO-8601 a epoch ms UTC, o `null` si es inválido. */
export function parseUtcEpochMs(isoTimestamp: unknown): number | null {
  if (typeof isoTimestamp !== "string" || isoTimestamp.trim() === "") {
    return null;
  }
  const ms = Date.parse(isoTimestamp.trim());
  return Number.isFinite(ms) ? ms : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Calcula las probabilidades y cuotas decimales justas (`1 / p_novig`) sin margen para un mercado,
 * delegando toda la matemática de desvigorización en `src/domain/prediction/devig.ts`.
 */
export function devigClosingMarket(
  selectionPrices: Readonly<Record<string, number>>,
  market: string,
  method: DevigMethod = "power",
  options?: AdaptiveDevigOptions,
): DevigClosingResult {
  const mNorm = market.trim().toLowerCase();
  const reqSels = MARKET_REQUIRED_SELECTIONS[mNorm];
  if (!reqSels) {
    throw new InvalidOddsError(`mercado no soportado para de-vig: ${market}`);
  }

  const oddsArr: number[] = [];
  for (const sel of reqSels) {
    const p = selectionPrices[sel];
    if (!isValidPriceDecimal(p)) {
      throw new InvalidOddsError(`cuota inválida o faltante para selección '${sel}': ${String(p)}`);
    }
    oddsArr.push(p);
  }

  const sumImplied = overround(oddsArr) + 1;
  if (sumImplied < MIN_OVERROUND || sumImplied > MAX_OVERROUND) {
    throw new InvalidOddsError(
      `Σ(1/cuota) implausible (${sumImplied.toFixed(4)}); se acepta [${MIN_OVERROUND}, ${MAX_OVERROUND}]`,
    );
  }

  let probsArr: readonly number[];
  if (reqSels.length === 3) {
    if (method === "adaptive" && options !== undefined) {
      const res = devigAdaptive1X2([oddsArr[0]!, oddsArr[1]!, oddsArr[2]!], options);
      probsArr = [res.pHome, res.pDraw, res.pAway];
    } else {
      probsArr = devig(oddsArr, method);
    }
  } else {
    const res2 = devig2Way(oddsArr[0]!, oddsArr[1]!, method, options);
    probsArr = [res2.pHome, res2.pAway];
  }

  const probabilities: Record<string, number> = {};
  const fairPrices: Record<string, number> = {};
  for (let i = 0; i < reqSels.length; i += 1) {
    const sel = reqSels[i]!;
    const prob = probsArr[i]!;
    probabilities[sel] = prob;
    fairPrices[sel] = 1 / prob;
  }

  return {
    market: mNorm,
    method,
    overround: sumImplied - 1,
    probabilities,
    fair_prices: fairPrices,
  };
}

/**
 * Valida las 11 columnas requeridas, descarta fuera de rango `[1.01, 1000.0]`,
 * descarta capturas post-kickoff (`ts_captured > ts_event_start`) y deduplica exactamente por:
 * `(event_id, market, line, selection, book, ts_captured, source)`.
 */
export function validateAndDeduplicateSnapshots(rows: readonly OddsSnapshotRow[]): ValidationResult {
  const nRaw = rows.length;
  let nMissingRequired = 0;
  let nOutOfRange = 0;
  let nPostKickoff = 0;
  let nDuplicates = 0;

  const seenKeys = new Set<string>();
  const validRows: Array<{ row: OddsSnapshotRow; tsStartMs: number; tsCapMs: number }> = [];

  for (const r of rows) {
    if (
      !r ||
      !isNonEmptyString(r.event_id) ||
      !isNonEmptyString(r.sport) ||
      !isNonEmptyString(r.league) ||
      !isNonEmptyString(r.market) ||
      !isNonEmptyString(r.selection) ||
      !isNonEmptyString(r.book) ||
      !isNonEmptyString(r.source) ||
      !VALID_SOURCES.has(r.source.trim())
    ) {
      nMissingRequired += 1;
      continue;
    }

    const tsCapMs = parseUtcEpochMs(r.ts_captured);
    const tsStartMs = parseUtcEpochMs(r.ts_event_start);
    if (tsCapMs === null || tsStartMs === null) {
      nMissingRequired += 1;
      continue;
    }

    if (r.line !== null && r.line !== undefined && (typeof r.line !== "number" || Number.isNaN(r.line) || !Number.isFinite(r.line))) {
      // Igual que en Python (`pd.to_numeric(..., errors="coerce")`), `NaN`/`Infinity` en `line` se normaliza a `null`
    }

    if (!isValidPriceDecimal(r.price_decimal)) {
      nOutOfRange += 1;
      continue;
    }

    if (tsCapMs > tsStartMs) {
      nPostKickoff += 1;
      continue;
    }

    const eventId = r.event_id.trim();
    const sport = r.sport.trim();
    const league = r.league.trim();
    const market = r.market.trim().toLowerCase();
    const line = normalizeLine(r.line);
    const selection = r.selection.trim().toLowerCase();
    const book = r.book.trim().toLowerCase();
    const source = r.source.trim() as OddsSource;

    let stage: SnapshotStage;
    if (r.snapshot_stage && VALID_STAGES.has(r.snapshot_stage)) {
      stage = r.snapshot_stage;
    } else if (source === "scraped_ws") {
      stage = "intraday";
    } else {
      stage = tsStartMs - tsCapMs <= HISTORICAL_CLOSE_MAX_DELTA_MS ? "close" : "open";
    }

    const dedupKey = [
      eventId,
      market,
      serializeLineKey(line),
      selection,
      book,
      String(tsCapMs),
      source,
    ].join("\u001f");

    if (seenKeys.has(dedupKey)) {
      nDuplicates += 1;
      continue;
    }
    seenKeys.add(dedupKey);

    validRows.push({
      tsStartMs,
      tsCapMs,
      row: {
        event_id: eventId,
        sport,
        league,
        market,
        line,
        selection,
        book,
        price_decimal: r.price_decimal,
        ts_captured: r.ts_captured.trim(),
        ts_event_start: r.ts_event_start.trim(),
        source,
        snapshot_stage: stage,
      },
    });
  }

  validRows.sort((a, b) => {
    if (a.row.source !== b.row.source) return a.row.source < b.row.source ? -1 : 1;
    if (a.tsStartMs !== b.tsStartMs) return a.tsStartMs - b.tsStartMs;
    if (a.row.event_id !== b.row.event_id) return a.row.event_id < b.row.event_id ? -1 : 1;
    if (a.row.market !== b.row.market) return a.row.market < b.row.market ? -1 : 1;
    if (a.row.book !== b.row.book) return a.row.book < b.row.book ? -1 : 1;
    if (a.tsCapMs !== b.tsCapMs) return a.tsCapMs - b.tsCapMs;
    return a.row.selection < b.row.selection ? -1 : a.row.selection > b.row.selection ? 1 : 0;
  });

  return {
    rows: validRows.map((item) => item.row),
    stats: {
      n_raw: nRaw,
      n_missing_required: nMissingRequired,
      n_out_of_range: nOutOfRange,
      n_post_kickoff_discarded: nPostKickoff,
      n_duplicates_removed: nDuplicates,
      n_valid: validRows.length,
    },
  };
}

/**
 * Detecta huecos estrictamente mayores a `maxGapMinutes` (`> 60 min`) entre snapshots consecutivos
 * de una misma `(event_id, market, line, book)` cuando existen `>= 2` capturas distintas.
 */
export function detectSnapshotGaps(
  rows: readonly OddsSnapshotRow[],
  maxGapMinutes = MAX_GAP_MINUTES,
): SnapshotGap[] {
  interface CapturePoint {
    readonly tsMs: number;
    readonly tsIso: string;
    readonly source: OddsSource;
    readonly sport: string;
    readonly league: string;
    readonly event_id: string;
    readonly market: string;
    readonly line: number | null;
    readonly book: string;
  }

  const bySeries = new Map<string, Map<number, CapturePoint>>();

  for (const r of rows) {
    const tsMs = parseUtcEpochMs(r.ts_captured);
    if (tsMs === null) continue;
    const eventId = r.event_id.trim();
    const market = r.market.trim().toLowerCase();
    const line = normalizeLine(r.line);
    const book = r.book.trim().toLowerCase();
    const seriesKey = [eventId, market, serializeLineKey(line), book].join("\u001f");

    let tsMap = bySeries.get(seriesKey);
    if (!tsMap) {
      tsMap = new Map<number, CapturePoint>();
      bySeries.set(seriesKey, tsMap);
    }
    if (!tsMap.has(tsMs)) {
      tsMap.set(tsMs, {
        tsMs,
        tsIso: r.ts_captured.trim(),
        source: r.source,
        sport: r.sport.trim(),
        league: r.league.trim(),
        event_id: eventId,
        market,
        line,
        book,
      });
    }
  }

  const gaps: SnapshotGap[] = [];
  const sortedSeriesKeys = Array.from(bySeries.keys()).sort();

  for (const sKey of sortedSeriesKeys) {
    const pts = Array.from(bySeries.get(sKey)!.values()).sort((a, b) => a.tsMs - b.tsMs);
    if (pts.length < 2) continue;

    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1]!;
      const curr = pts[i]!;
      const gapMin = (curr.tsMs - prev.tsMs) / 60_000;
      if (gapMin > maxGapMinutes + 1e-9) {
        gaps.push({
          event_id: curr.event_id,
          source: curr.source,
          sport: curr.sport,
          league: curr.league,
          market: curr.market,
          line: curr.line,
          book: curr.book,
          n_captures: pts.length,
          prev_ts_captured: prev.tsIso,
          next_ts_captured: curr.tsIso,
          gap_minutes: gapMin,
        });
      }
    }
  }

  return gaps;
}

function resolveSingleMarketGroup(
  groupRows: readonly OddsSnapshotRow[],
  options?: ResolveClosingOptions,
): ClosingMarketResolution {
  const first = groupRows[0]!;
  const eventId = first.event_id.trim();
  const source = first.source;
  const sport = first.sport.trim();
  const league = first.league.trim();
  const market = first.market.trim().toLowerCase();
  const line = normalizeLine(first.line);
  const tsEventStart = first.ts_event_start.trim();
  const method: DevigMethod = options?.devigMethod ?? "power";

  const candidateBooks: ReadonlyArray<"pinnacle" | "smarkets"> =
    source === "historical_fd" ? ["pinnacle"] : SHARP_SCRAPED_FALLBACK_ORDER;

  const defaultMissingReason: ClosingMissingReason =
    source === "historical_fd" ? "missing_pinnacle_close" : "missing_pinnacle_and_smarkets";

  let sawSharpCandidateWithBadMarket = false;

  for (const targetBook of candidateBooks) {
    const eligible: Array<{ row: OddsSnapshotRow; tsCapMs: number }> = [];

    for (const r of groupRows) {
      const bookNorm = r.book.trim().toLowerCase();
      if (bookNorm !== targetBook) continue;
      if (!isValidPriceDecimal(r.price_decimal)) continue;

      const tsCapMs = parseUtcEpochMs(r.ts_captured);
      const tsStartMs = parseUtcEpochMs(r.ts_event_start);
      if (tsCapMs === null || tsStartMs === null) continue;
      if (tsCapMs > tsStartMs) continue;

      if (source === "historical_fd") {
        // Regla humana estricta: en `historical_fd`, ÚNICAMENTE el snapshot `close` de Pinnacle.
        if (r.snapshot_stage !== undefined && VALID_STAGES.has(r.snapshot_stage)) {
          if (r.snapshot_stage !== "close") continue;
        } else if (tsStartMs - tsCapMs > HISTORICAL_CLOSE_MAX_DELTA_MS) {
          continue;
        }
      }

      eligible.push({ row: r, tsCapMs });
    }

    if (eligible.length === 0) continue;

    let maxTsMs = -Infinity;
    let maxTsIso = "";
    for (const item of eligible) {
      if (item.tsCapMs > maxTsMs) {
        maxTsMs = item.tsCapMs;
        maxTsIso = item.row.ts_captured.trim();
      }
    }

    const latestPrices: Record<string, number> = {};
    for (const item of eligible) {
      if (item.tsCapMs === maxTsMs) {
        latestPrices[item.row.selection.trim().toLowerCase()] = item.row.price_decimal;
      }
    }

    try {
      const devigged = devigClosingMarket(latestPrices, market, method, options?.adaptiveOptions);
      const selectionsOut: Record<string, ClosingSelectionQuote> = {};
      for (const [sel, rawPrice] of Object.entries(latestPrices)) {
        const pNovig = devigged.probabilities[sel];
        const fairPrice = devigged.fair_prices[sel];
        if (pNovig !== undefined && fairPrice !== undefined) {
          selectionsOut[sel] = {
            price_decimal: rawPrice,
            p_novig: pNovig,
            price_novig: fairPrice,
          };
        }
      }
      return {
        event_id: eventId,
        source,
        sport,
        league,
        market,
        line,
        ts_event_start: tsEventStart,
        closing_missing: false,
        closing_book: targetBook,
        ts_closing: maxTsIso,
        missing_reason: null,
        closing_overround: devigged.overround,
        selections: selectionsOut,
      };
    } catch {
      sawSharpCandidateWithBadMarket = true;
    }
  }

  return {
    event_id: eventId,
    source,
    sport,
    league,
    market,
    line,
    ts_event_start: tsEventStart,
    closing_missing: true,
    closing_book: null,
    ts_closing: null,
    missing_reason: sawSharpCandidateWithBadMarket
      ? "incomplete_or_implausible_overround"
      : defaultMissingReason,
    closing_overround: null,
    selections: {},
  };
}

/**
 * Resuelve la cuota de cierre sharp y las probabilidades/cuotas sin margen para un único mercado.
 */
export function resolveClosingMarket(
  rows: readonly OddsSnapshotRow[],
  options?: ResolveClosingOptions,
): ClosingMarketResolution {
  if (rows.length === 0) {
    return {
      event_id: "",
      source: "historical_fd",
      sport: "",
      league: "",
      market: "",
      line: null,
      ts_event_start: "",
      closing_missing: true,
      closing_book: null,
      ts_closing: null,
      missing_reason: "empty_input",
      closing_overround: null,
      selections: {},
    };
  }
  return resolveSingleMarketGroup(rows, options);
}

/**
 * Resuelve la cuota de cierre sharp para todos los mercados `(event_id, source, market, line)`
 * presentes en `rows`, preservando orden determinista.
 */
export function resolveClosingSnapshots(
  rows: readonly OddsSnapshotRow[],
  options?: ResolveClosingOptions,
): ClosingMarketResolution[] {
  const groups = new Map<string, { tsStartMs: number; list: OddsSnapshotRow[] }>();

  for (const r of rows) {
    if (!r || !isNonEmptyString(r.event_id) || !isNonEmptyString(r.market) || !isNonEmptyString(r.source)) {
      continue;
    }
    const line = normalizeLine(r.line);
    const key = [
      r.event_id.trim(),
      r.source,
      r.market.trim().toLowerCase(),
      serializeLineKey(line),
    ].join("\u001f");

    let entry = groups.get(key);
    if (!entry) {
      entry = {
        tsStartMs: parseUtcEpochMs(r.ts_event_start) ?? 0,
        list: [],
      };
      groups.set(key, entry);
    }
    entry.list.push(r);
  }

  const orderedEntries = Array.from(groups.entries()).sort((a, b) => {
    const [keyA, valA] = a;
    const [keyB, valB] = b;
    const srcA = valA.list[0]!.source;
    const srcB = valB.list[0]!.source;
    if (srcA !== srcB) return srcA < srcB ? -1 : 1;
    if (valA.tsStartMs !== valB.tsStartMs) return valA.tsStartMs - valB.tsStartMs;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  return orderedEntries.map(([, entry]) => resolveSingleMarketGroup(entry.list, options));
}
