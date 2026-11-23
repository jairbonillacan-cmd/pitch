"use client";

import React, { useId, useMemo, useState } from "react";
import {
  canonicalGameHref,
  formatOddsCaptureEs,
  isBlockedMarketQuoteBook,
  isLeagueActiveInWindow,
  isPermittedMarketQuoteBook,
  isSafePublicLabel,
  type LeagueId,
} from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreKpiStrip,
  SofascoreSignalPair,
  SofascoreTable,
  SofascoreTabs,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { TeamBadge, parseUserOdds } from "../../sports";
import { decimalToAmericanInt, formatOddsValue, isPickUnlocked } from "../access-guard";
import { AtomicOddsChip, type OddsMovementDirection } from "../atomic";
import {
  ALLOWED_BOOKMAKER_IDS,
  BOOKMAKER_OPTIONS,
  computeDeVigProbs,
  computeMarketOverroundPct,
  normalizeBookKey,
  resolvePreferredBookQuote,
  type BookmakerOption,
} from "../bookmakers";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useSafeEffect } from "../hooks";
import { setActiveSharedTransition } from "../navigation-helpers";
import {
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { BookQuoteItem, MatchPick, OddsFormat, PlatformGame } from "../types";
import { partitionPriorityBookmakers } from "./account/account-helpers";
import { todayId } from "./home/home-model";
import {
  classifyOddsMovement,
  computeExpectedValuePct,
  type OddsMovementKind,
} from "./picks/BookmakerComparePill";

const INITIAL_MATRIX_ROWS = 18;
const MAX_QUOTE_AGE_MS = 72 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 6 * 60 * 60 * 1000;
const MAX_MATRIX_BOOKS = 3;
const MAX_SHARP_EV_PCT = 18;
const MAX_SOFT_EV_PCT = 22;
const MAX_DEVIG_PROB_DIVERGENCE = 0.12;
const SHARP_BOOK_PRIORITY: readonly string[] = [
  "pinnacle",
  "betcris",
  "betonline",
  "betonlineag",
];

function isSharpOddsBook(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const key = normalizeBookKey(raw);
  if (key.length === 0) return false;
  return SHARP_BOOK_PRIORITY.some((token) => key.includes(token));
}

function isPermittedBookKey(raw: string): boolean {
  const key = normalizeBookKey(raw);
  return key.length > 0 && isPermittedMarketQuoteBook(key) && ALLOWED_BOOKMAKER_IDS.has(key);
}

function isSafeBookLabel(label: string | null | undefined): boolean {
  if (typeof label !== "string") return false;
  const trimmed = label.trim();
  if (trimmed.length === 0) return false;
  if (!isSafePublicLabel(trimmed)) return false;
  const primary = trimmed.split(/[·|]/)[0]?.trim() ?? trimmed;
  return (
    !isBlockedMarketQuoteBook(primary, trimmed) &&
    isPermittedMarketQuoteBook(primary, trimmed)
  );
}

function normalizeMarketFamilyForDeVig(rawMarket: string | undefined): string {
  const m = (rawMarket ?? "").trim().toLowerCase();
  if (m === "h2h" || m === "1x2" || m === "moneyline" || m === "ml") return "1x2";
  if (m === "btts") return "btts";
  if (m === "dnb" || m === "draw_no_bet") return "dnb";
  if (m === "totals" || m.startsWith("totals_") || m.endsWith("_totals")) return "totals";
  if (m === "spread" || m === "spreads" || m === "handicap" || m === "asian_handicap") {
    return "spread";
  }
  return m;
}

function normalizeSelectionForDeVig(market: string, rawSelection: string): string {
  const s = rawSelection.trim().toLowerCase();
  if (market === "1x2" || market === "dnb" || market === "spread") {
    if (s === "1" || s === "home" || s.startsWith("home_")) return "home";
    if (s === "x" || s === "draw") return "draw";
    if (s === "2" || s === "away" || s.startsWith("away_")) return "away";
  }
  if (market === "btts") {
    if (s === "yes" || s === "si" || s === "sí") return "yes";
    if (s === "no") return "no";
  }
  if (market === "totals") {
    if (s === "over" || s.startsWith("over_")) return "over";
    if (s === "under" || s.startsWith("under_")) return "under";
  }
  return s;
}

function resolveSameBookDeVigForPick(
  game: PlatformGame,
  pk: MatchPick,
  anchorMs: number,
): number | null {
  const market = normalizeMarketFamilyForDeVig(pk.market);
  const sel = normalizeSelectionForDeVig(market, pk.selectionKey);
  const line = typeof pk.line === "number" && Number.isFinite(pk.line) ? pk.line : null;

  let legSpecs: ReadonlyArray<{ readonly sel: string; readonly line: number | null }> | null = null;
  if (market === "1x2") {
    const hasDraw = game.markets.some(
      (r) =>
        normalizeMarketFamilyForDeVig(r.market) === "1x2" &&
        normalizeSelectionForDeVig("1x2", r.selection) === "draw",
    );
    legSpecs = hasDraw
      ? [
          { sel: "home", line: null },
          { sel: "draw", line: null },
          { sel: "away", line: null },
        ]
      : [
          { sel: "home", line: null },
          { sel: "away", line: null },
        ];
  } else if (market === "btts") {
    legSpecs = [
      { sel: "yes", line: null },
      { sel: "no", line: null },
    ];
  } else if (market === "dnb") {
    legSpecs = [
      { sel: "home", line: null },
      { sel: "away", line: null },
    ];
  } else if (market === "totals") {
    if (line === null) return null;
    legSpecs = [
      { sel: "over", line },
      { sel: "under", line },
    ];
  } else if (market === "spread") {
    if (line === null) return null;
    const opp = line === 0 ? 0 : -line;
    if (sel === "home") {
      legSpecs = [
        { sel: "home", line },
        { sel: "away", line: opp },
      ];
    } else if (sel === "away") {
      legSpecs = [
        { sel: "home", line: opp },
        { sel: "away", line },
      ];
    }
  }
  if (!legSpecs) return null;
  const targetIdx = legSpecs.findIndex(
    (sp) =>
      sp.sel === sel &&
      (sp.line === null || (line !== null && Math.abs(sp.line - line) < 0.01)),
  );
  if (targetIdx < 0) return null;

  const legBookMaps = legSpecs.map((spec) => {
    const map = new Map<string, number>();
    const row = game.markets.find((r) => {
      if (normalizeMarketFamilyForDeVig(r.market) !== market) return false;
      if (normalizeSelectionForDeVig(market, r.selection) !== spec.sel) return false;
      if (spec.line === null) return true;
      return typeof r.line === "number" && Number.isFinite(r.line) && Math.abs(r.line - spec.line) < 0.01;
    });
    if (!row) return map;
    const fresh = filterFreshPermittedQuotes(row.bookQuotes, anchorMs);
    for (const q of fresh) {
      const bk = normalizeBookKey(q.book);
      if (bk && !map.has(bk)) map.set(bk, q.decimal);
    }
    if (
      map.size === 0 &&
      row.currentDecimal !== null &&
      Number.isFinite(row.currentDecimal) &&
      row.currentDecimal > 1.01 &&
      isSafeBookLabel(row.quoteBookLabel) &&
      isFreshQuoteStamp(row.quoteCapturedAtUtc, anchorMs)
    ) {
      const bk = normalizeBookKey(row.quoteBookLabel ?? "");
      if (bk) map.set(bk, row.currentDecimal);
    }
    return map;
  });

  if (legBookMaps.some((m) => m.size === 0)) return null;
  const firstMap = legBookMaps[0]!;
  const commonBooks: string[] = [];
  for (const bk of firstMap.keys()) {
    if (legBookMaps.every((m) => m.has(bk))) commonBooks.push(bk);
  }
  if (commonBooks.length === 0) return null;
  commonBooks.sort((a, b) => {
    const pa = SHARP_BOOK_PRIORITY.findIndex((t) => a.includes(t));
    const pb = SHARP_BOOK_PRIORITY.findIndex((t) => b.includes(t));
    const ra = pa >= 0 ? pa : 99;
    const rb = pb >= 0 ? pb : 99;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  const chosenBook = commonBooks[0]!;
  const decimals = legBookMaps.map((m) => m.get(chosenBook)!);
  const probs = computeDeVigProbs(decimals);
  if (!probs) return null;
  const pDeVig = probs[targetIdx];
  return typeof pDeVig === "number" && Number.isFinite(pDeVig) ? pDeVig : null;
}

function computeGuardedOddsEvaluation(
  p: number,
  decimal: number | null,
  bookKeyOrLabel: string | null | undefined,
  deVigProb: number | null,
): { readonly evPct: number | null; readonly edgePts: number | null } {
  if (decimal === null || !Number.isFinite(decimal) || decimal <= 1.01) {
    return { evPct: null, edgePts: null };
  }
  if (deVigProb !== null && Math.abs(p - deVigProb) > MAX_DEVIG_PROB_DIVERGENCE) {
    return { evPct: null, edgePts: null };
  }
  const rawEv = computeExpectedValuePct(p, decimal);
  const evLimit = isSharpOddsBook(bookKeyOrLabel) ? MAX_SHARP_EV_PCT : MAX_SOFT_EV_PCT;
  if (rawEv === null || rawEv > evLimit) {
    return { evPct: null, edgePts: null };
  }
  return {
    evPct: rawEv,
    edgePts: edgeAgainstBook(p, decimal),
  };
}

function isFreshQuoteStamp(
  capturedAtUtc: string | null | undefined,
  anchorMs: number,
): boolean {
  if (!capturedAtUtc || !Number.isFinite(anchorMs)) return false;
  const capturedMs = Date.parse(capturedAtUtc);
  if (!Number.isFinite(capturedMs)) return false;
  const ageMs = anchorMs - capturedMs;
  return ageMs >= -MAX_FUTURE_SKEW_MS && ageMs <= MAX_QUOTE_AGE_MS;
}

function resolveAnchorMs(
  serverNowUtc: string | null | undefined,
  generatedAt: string | null | undefined,
): number {
  const serverMs = serverNowUtc ? Date.parse(serverNowUtc) : Number.NaN;
  if (Number.isFinite(serverMs)) {
    return serverMs;
  }
  const generatedMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (Number.isFinite(generatedMs)) {
    return generatedMs;
  }
  return Number.NaN;
}

function resolveAnchorDayId(
  anchorUtc: string | null | undefined,
  games: readonly PlatformGame[],
  timeZone: string,
): string {
  const parsedMs = anchorUtc ? Date.parse(anchorUtc) : Number.NaN;
  if (Number.isFinite(parsedMs)) {
    return todayId(timeZone, new Date(parsedMs));
  }
  const firstActive = games.find((game) => game.status !== "FT" && game.dayId.length >= 10);
  if (firstActive) {
    return firstActive.dayId.slice(0, 10);
  }
  return "2026-01-01";
}

function signedAmerican(dec: number): string {
  const a = decimalToAmericanInt(dec);
  return a > 0 ? `+${a}` : `−${Math.abs(a)}`;
}

export function edgeAgainstBook(p: number, bookDecimal: number): number {
  if (
    !Number.isFinite(p) ||
    !Number.isFinite(bookDecimal) ||
    bookDecimal <= 1 ||
    p <= 0 ||
    p >= 1
  ) {
    return 0;
  }
  return Math.round((p - 1 / bookDecimal) * 1000) / 10;
}

export interface MarketDirectionBadge {
  readonly kind: Exclude<OddsMovementKind, "stable">;
  readonly label: "STEAM" | "Acortando" | "Derivando";
  readonly arrow: "↓↓" | "↓" | "↑";
  readonly pillClass: string;
  readonly deltaPct: number | null;
}

export function describeMarketDirection(
  openingDecimal: number | null | undefined,
  currentDecimal: number | null | undefined,
  explicitDirection?: "shortening" | "drifting" | "stable" | null,
): MarketDirectionBadge | null {
  const movement = classifyOddsMovement(openingDecimal, currentDecimal, explicitDirection);
  if (!movement || movement.kind === "stable") return null;
  if (movement.kind === "steam") {
    return {
      kind: "steam",
      label: "STEAM",
      arrow: "↓↓",
      pillClass: "pl-pill--warning",
      deltaPct: movement.deltaPct,
    };
  }
  if (movement.kind === "shortening") {
    return {
      kind: "shortening",
      label: "Acortando",
      arrow: "↓",
      pillClass: "pl-pill--brand",
      deltaPct: movement.deltaPct,
    };
  }
  return {
    kind: "drifting",
    label: "Derivando",
    arrow: "↑",
    pillClass: "pl-pill--info",
    deltaPct: movement.deltaPct,
  };
}

function hasValidSpacetimeAnchor(pk: MatchPick): boolean {
  return (
    !pk.isRedacted &&
    Number.isFinite(pk.p) &&
    pk.p > 0.01 &&
    pk.p < 0.995 &&
    Number.isFinite(pk.fairDecimal) &&
    pk.fairDecimal > 1.01
  );
}

interface ResolvedReferenceQuote {
  readonly decimal: number;
  readonly bookKey: string;
  readonly bookLabel: string;
  readonly capturedAtUtc: string | null;
  readonly openingDecimal: number | null;
  readonly movementDirection: "shortening" | "drifting" | "stable" | null;
}

function filterFreshPermittedQuotes(
  quotes: readonly BookQuoteItem[] | undefined,
  anchorMs: number,
): BookQuoteItem[] {
  if (!quotes || quotes.length === 0) return [];
  return quotes.filter(
    (q) =>
      Number.isFinite(q.decimal) &&
      q.decimal > 1.01 &&
      isPermittedBookKey(q.book) &&
      isSafeBookLabel(q.bookLabel) &&
      isFreshQuoteStamp(q.capturedAtUtc, anchorMs),
  );
}

function resolvePickReferenceQuote(
  pk: MatchPick,
  freshQuotes: readonly BookQuoteItem[],
  selectedBookTag: string,
  preferredBooks: readonly string[],
  anchorMs: number,
): ResolvedReferenceQuote | null {
  if (selectedBookTag === "manual") return null;

  if (selectedBookTag !== "all" && freshQuotes.length > 0) {
    const targetBook = normalizeBookKey(selectedBookTag);
    const exact = freshQuotes.find((q) => normalizeBookKey(q.book) === targetBook);
    if (exact) {
      return {
        decimal: exact.decimal,
        bookKey: normalizeBookKey(exact.book),
        bookLabel: exact.bookLabel,
        capturedAtUtc: exact.capturedAtUtc,
        openingDecimal: exact.openingDecimal ?? null,
        movementDirection: exact.movementDirection ?? null,
      };
    }
  }

  const preferred = resolvePreferredBookQuote(freshQuotes, preferredBooks);
  if (preferred) {
    return {
      decimal: preferred.decimal,
      bookKey: normalizeBookKey(preferred.book),
      bookLabel: preferred.bookLabel,
      capturedAtUtc: preferred.capturedAtUtc,
      openingDecimal: preferred.openingDecimal ?? null,
      movementDirection: preferred.movementDirection ?? null,
    };
  }

  if (
    pk.marketDecimal !== null &&
    Number.isFinite(pk.marketDecimal) &&
    pk.marketDecimal > 1.01 &&
    isFreshQuoteStamp(pk.marketCapturedAtUtc, anchorMs) &&
    isSafeBookLabel(pk.marketBookLabel)
  ) {
    const label = pk.marketBookLabel!.trim();
    return {
      decimal: pk.marketDecimal,
      bookKey: normalizeBookKey(label),
      bookLabel: label,
      capturedAtUtc: pk.marketCapturedAtUtc ?? null,
      openingDecimal: null,
      movementDirection: null,
    };
  }

  return null;
}

function resolveCellMovement(quote: BookQuoteItem): OddsMovementDirection {
  const dir = describeMarketDirection(
    quote.openingDecimal,
    quote.decimal,
    quote.movementDirection,
  );
  return dir ? dir.kind : "stable";
}

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

interface OddsMatrixRow {
  readonly id: string;
  readonly game: PlatformGame;
  readonly pick: MatchPick;
  readonly matchHref: string;
  readonly freshQuotes: readonly BookQuoteItem[];
  readonly quotesByBook: ReadonlyMap<string, BookQuoteItem>;
  readonly refQuote: ResolvedReferenceQuote | null;
  readonly latestCapturedAtUtc: string | null;
  readonly manualRaw: string;
  readonly manualDec: number | null;
  readonly manualInvalid: boolean;
  readonly activeDec: number | null;
  readonly deVigProb: number | null;
  readonly evPct: number | null;
  readonly edgePts: number | null;
  readonly direction: MarketDirectionBadge | null;
}

function ConverterCard(): React.JSX.Element {
  const idBase = useId();
  const [rawA, setRawA] = useState("");
  const [rawB, setRawB] = useState("");

  const decA = rawA.trim() ? parseUserOdds(rawA) : null;
  const decB = rawB.trim() ? parseUserOdds(rawB) : null;
  const overroundPct = decA && decB ? computeMarketOverroundPct([decA, decB]) : null;
  const devig = decA && decB ? computeDeVigProbs([decA, decB]) : null;
  const rawAInvalid = Boolean(rawA.trim() && !decA);
  const rawBInvalid = Boolean(rawB.trim() && !decB);

  return (
    <SofascoreCard title="Convertidor y margen real" density="compact">
      <div className="pl-mc-conv-body">
        <div className="pl-mc-conv-fields">
          <label className="pl-mc-field" htmlFor={`${idBase}-side-a`}>
            <span className="pl-mc-field-label">Lado A (tu momio)</span>
            <input
              id={`${idBase}-side-a`}
              className="pl-mc-input num"
              inputMode="decimal"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={rawAInvalid ? "true" : undefined}
              placeholder="−110, +150 o 1.91"
              value={rawA}
              onChange={(e) => setRawA(e.target.value)}
            />
          </label>
          <label className="pl-mc-field" htmlFor={`${idBase}-side-b`}>
            <span className="pl-mc-field-label">Lado B (opcional, ver margen)</span>
            <input
              id={`${idBase}-side-b`}
              className="pl-mc-input num"
              inputMode="decimal"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={rawBInvalid ? "true" : undefined}
              placeholder="−110 o 1.91"
              value={rawB}
              onChange={(e) => setRawB(e.target.value)}
            />
          </label>
        </div>

        <dl className="pl-mc-conv-out num" aria-live="polite">
          <div>
            <dt>Americano</dt>
            <dd>{decA ? signedAmerican(decA) : "—"}</dd>
          </div>
          <div>
            <dt>Decimal</dt>
            <dd>{decA ? decA.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt>{devig ? "Prob. limpia" : "Implícita"}</dt>
            <dd>
              {devig
                ? `${(devig[0]! * 100).toFixed(1)} %`
                : decA
                  ? `${((1 / decA) * 100).toFixed(1)} %`
                  : "—"}
            </dd>
          </div>
        </dl>

        {overroundPct !== null && devig ? (
          <div className="pl-mc-vig-strip num" data-converter-overround="" aria-live="polite">
            <span>
              Comisión implícita:{" "}
              <strong className={overroundPct > 6 ? "is-high" : undefined}>
                {overroundPct.toFixed(1)} %
              </strong>
            </span>
            <span>
              Sin margen: {(devig[0]! * 100).toFixed(1)} % / {(devig[1]! * 100).toFixed(1)} %
            </span>
          </div>
        ) : null}

        {rawAInvalid || rawBInvalid ? (
          <p className="pl-mc-error-note" role="alert">
            Escribe un momio válido, como −110, +150 o 1.91.
          </p>
        ) : null}
      </div>
    </SofascoreCard>
  );
}

export function OddsCompareClubView(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, preferredBooks, userTimezone } = usePlatformCore();
  const {
    navigateTo,
    prefetchRoute,
    addPickToParlay,
    removePickFromParlay,
    requestFullShell,
    setOddsFormat,
    pushToast,
  } = usePlatformActions();
  const { parlayLegs } = useParlayState();

  const [league, setLeague] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedBookTag, setSelectedBookTag] = useState<string>("all");
  const [onlyEvPositive, setOnlyEvPositive] = useState<boolean>(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [visibleLimit, setVisibleLimit] = useState<number>(INITIAL_MATRIX_ROWS);

  useSafeEffect(() => {
    void requestFullShell();
  }, [requestFullShell]);

  const timeZone = userTimezone || "America/Mexico_City";
  const anchorDayId = useMemo(
    () => resolveAnchorDayId(dataset.serverNowUtc ?? dataset.generatedAt, dataset.games, timeZone),
    [dataset.games, dataset.generatedAt, dataset.serverNowUtc, timeZone],
  );
  const anchorMs = useMemo(
    () => resolveAnchorMs(dataset.serverNowUtc, dataset.generatedAt),
    [dataset.generatedAt, dataset.serverNowUtc],
  );

  const parlayIds = useMemo(() => new Set(parlayLegs.map((leg) => leg.pick.id)), [parlayLegs]);

  const permittedPreferredBooks = useMemo(
    () => preferredBooks.map((b) => normalizeBookKey(b)).filter((key) => isPermittedBookKey(key)),
    [preferredBooks],
  );

  const availableBooks = useMemo<readonly BookmakerOption[]>(() => {
    const cleanOptions = BOOKMAKER_OPTIONS.filter((opt) => isPermittedBookKey(opt.id));
    const { priorityMx, others } = partitionPriorityBookmakers(cleanOptions);
    const orderedCatalog = [...priorityMx, ...others];
    const prefSet = new Set(permittedPreferredBooks);
    const preferredMatches = orderedCatalog.filter((opt) => prefSet.has(normalizeBookKey(opt.id)));
    const remainder = orderedCatalog.filter((opt) => !prefSet.has(normalizeBookKey(opt.id)));
    return [...preferredMatches, ...remainder].slice(0, 6);
  }, [permittedPreferredBooks]);

  const matrixBooks = useMemo<readonly BookmakerOption[]>(() => {
    if (selectedBookTag === "manual") return [];
    if (selectedBookTag !== "all") {
      const exact = availableBooks.find(
        (opt) => normalizeBookKey(opt.id) === normalizeBookKey(selectedBookTag),
      );
      return exact ? [exact] : availableBooks.slice(0, MAX_MATRIX_BOOKS);
    }
    return availableBooks.slice(0, MAX_MATRIX_BOOKS);
  }, [availableBooks, selectedBookTag]);

  const activeLeagues = useMemo(() => {
    const map = new Map<LeagueId, { label: string; count: number }>();
    for (const game of dataset.games) {
      if (game.status === "FT") continue;
      if (!isLeagueActiveInWindow(dataset.games, game.league, anchorDayId, 30)) continue;
      const existing = map.get(game.league);
      if (existing) existing.count += 1;
      else map.set(game.league, { label: game.leagueLabel, count: 1 });
    }
    return Array.from(map.entries());
  }, [anchorDayId, dataset.games]);

  const leagueTabItems = useMemo<readonly SofascoreTabItem[]>(
    () => [
      { id: "all", label: "Todas", count: activeLeagues.reduce((acc, [, meta]) => acc + meta.count, 0) },
      ...activeLeagues.slice(0, 10).map(([id, meta]) => ({
        id,
        label: meta.label,
        count: meta.count,
      })),
    ],
    [activeLeagues],
  );

  const filteredGames = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    return dataset.games
      .filter((game) => {
        if (game.status === "FT") return false;
        if (!isLeagueActiveInWindow(dataset.games, game.league, anchorDayId, 30)) return false;
        if (league !== "all" && game.league !== league) return false;
        if (!q) return true;
        if (
          normalizeSearch(game.home.name).includes(q) ||
          normalizeSearch(game.away.name).includes(q) ||
          normalizeSearch(game.leagueLabel).includes(q)
        ) {
          return true;
        }
        return game.picks.some((pk) => normalizeSearch(pk.label).includes(q));
      })
      .sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc));
  }, [anchorDayId, dataset.games, league, searchQuery]);

  const allMatrixRows = useMemo<readonly OddsMatrixRow[]>(() => {
    const q = normalizeSearch(searchQuery);
    const rows: OddsMatrixRow[] = [];

    for (const game of filteredGames) {
      const matchHref = canonicalGameHref(game.league, game);
      const gameMatchesSearch =
        !q ||
        normalizeSearch(game.home.name).includes(q) ||
        normalizeSearch(game.away.name).includes(q) ||
        normalizeSearch(game.leagueLabel).includes(q);

      for (const pk of game.picks) {
        if (!isPickUnlocked(pk, game.status, viewerRole) || !hasValidSpacetimeAnchor(pk)) {
          continue;
        }
        if (!gameMatchesSearch && !normalizeSearch(pk.label).includes(q)) {
          continue;
        }

        const freshQuotes = filterFreshPermittedQuotes(pk.bookQuotes, anchorMs);
        const quotesByBook = new Map<string, BookQuoteItem>();
        let latestCapturedAtUtc: string | null = null;
        let latestCapturedMs = -Infinity;

        for (const quote of freshQuotes) {
          const key = normalizeBookKey(quote.book);
          const prev = quotesByBook.get(key);
          if (!prev || quote.decimal > prev.decimal) {
            quotesByBook.set(key, quote);
          }
          const stampMs = Date.parse(quote.capturedAtUtc);
          if (Number.isFinite(stampMs) && stampMs > latestCapturedMs) {
            latestCapturedMs = stampMs;
            latestCapturedAtUtc = quote.capturedAtUtc;
          }
        }

        const refQuote = resolvePickReferenceQuote(
          pk,
          freshQuotes,
          selectedBookTag,
          permittedPreferredBooks,
          anchorMs,
        );

        if (!latestCapturedAtUtc && refQuote?.capturedAtUtc) {
          latestCapturedAtUtc = refQuote.capturedAtUtc;
        }

        const manualRaw = inputs[pk.id] ?? "";
        const manualDec = manualRaw.trim() ? parseUserOdds(manualRaw) : null;
        const manualInvalid = Boolean(manualRaw.trim() && !manualDec);
        const activeDec = manualDec ?? refQuote?.decimal ?? null;
        const activeBook = manualDec !== null ? null : (refQuote?.bookKey ?? refQuote?.bookLabel ?? null);
        const deVigProb = resolveSameBookDeVigForPick(game, pk, anchorMs);
        const guardedEval = computeGuardedOddsEvaluation(pk.p, activeDec, activeBook, deVigProb);
        const evPct = guardedEval.evPct;
        const edgePts = guardedEval.edgePts;
        const direction = refQuote
          ? describeMarketDirection(
              refQuote.openingDecimal,
              refQuote.decimal,
              refQuote.movementDirection,
            )
          : null;

        rows.push({
          id: `${game.id}:${pk.id}`,
          game,
          pick: pk,
          matchHref,
          freshQuotes,
          quotesByBook,
          refQuote,
          latestCapturedAtUtc,
          manualRaw,
          manualDec,
          manualInvalid,
          activeDec,
          deVigProb,
          evPct,
          edgePts,
          direction,
        });
      }
    }

    return rows;
  }, [
    anchorMs,
    filteredGames,
    inputs,
    permittedPreferredBooks,
    searchQuery,
    selectedBookTag,
    viewerRole,
  ]);

  const displayedRows = useMemo(
    () => (onlyEvPositive ? allMatrixRows.filter((row) => row.evPct !== null && row.evPct > 0) : allMatrixRows),
    [allMatrixRows, onlyEvPositive],
  );

  const visibleRows = useMemo(
    () => displayedRows.slice(0, visibleLimit),
    [displayedRows, visibleLimit],
  );

  const stats = useMemo(() => {
    let evaluated = 0;
    let positiveEv = 0;
    let manualCount = 0;
    for (const row of allMatrixRows) {
      if (row.manualDec !== null) manualCount += 1;
      if (row.activeDec !== null) evaluated += 1;
      if (row.evPct !== null && row.evPct > 0) positiveEv += 1;
    }
    return {
      activeGames: filteredGames.length,
      totalMarkets: allMatrixRows.length,
      evaluated,
      positiveEv,
      manualCount,
    };
  }, [allMatrixRows, filteredGames.length]);

  const kpiItems = useMemo<readonly SofascoreKpiItem[]>(
    () => [
      { id: "games", label: "Partidos activos", value: String(stats.activeGames) },
      { id: "markets", label: "Mercados", value: String(stats.totalMarkets) },
      { id: "evaluated", label: "Con cuota vigente", value: String(stats.evaluated) },
      {
        id: "ev-plus",
        label: "Valor EV+",
        value: String(stats.positiveEv),
        tone: stats.positiveEv > 0 ? "positive" : "default",
      },
    ],
    [stats],
  );

  const handleClearManualInputs = () => {
    const prevInputs = inputs;
    setInputs({});
    pushToast("Momios manuales limpiados.", "default", {
      actionLabel: "Deshacer",
      onAction: () => setInputs(prevInputs),
    });
  };

  const handleResetFilters = () => {
    setLeague("all");
    setSearchQuery("");
    setSelectedBookTag("all");
    setOnlyEvPositive(false);
    setVisibleLimit(INITIAL_MATRIX_ROWS);
  };

  const tableColumns = useMemo<readonly SofascoreTableColumn<OddsMatrixRow>[]>(() => {
    const cols: SofascoreTableColumn<OddsMatrixRow>[] = [
      {
        key: "market",
        header: "Mercado",
        sticky: true,
        render: (row) => {
          const captureLabel = row.latestCapturedAtUtc
            ? formatOddsCaptureEs(row.latestCapturedAtUtc)
            : null;
          return (
            <div className="pl-mc-market-cell" data-odds-pick-row={row.pick.id}>
              <a
                href={row.matchHref}
                onPointerEnter={() => prefetchRoute(row.matchHref)}
                onTouchStart={() => prefetchRoute(row.matchHref)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  setActiveSharedTransition(e.currentTarget.closest("tr"), "pl-match-hero");
                  navigateTo(row.matchHref);
                }}
                className="pl-mc-match-link"
              >
                <TeamBadge
                  league={row.game.league}
                  slug={row.game.home.slug}
                  name={row.game.home.name}
                  logoUrl={row.game.home.logoUrl}
                  size={16}
                />
                <span className="pl-mc-match-title">
                  {row.game.home.shortName} vs {row.game.away.shortName}
                </span>
              </a>
              <strong className="pl-mc-pick-label">{row.pick.label}</strong>
              <span className="pl-mc-pick-meta num">
                <span>{row.game.leagueLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{row.game.kickoffLocal}</span>
                {captureLabel && row.latestCapturedAtUtc ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <time dateTime={row.latestCapturedAtUtc} data-quote-captured="">
                      {captureLabel}
                    </time>
                  </>
                ) : null}
              </span>
            </div>
          );
        },
      },
      {
        key: "fair",
        header: "Momio justo",
        numeric: true,
        render: (row) => (
          <div className="pl-mc-fair-cell num" data-quote-model-linked="true">
            <strong className="pl-mc-fair-odds">
              {formatOddsValue(row.pick.fairDecimal, oddsFormat)}
            </strong>
            <span className="pl-mc-fair-prob">{(row.pick.p * 100).toFixed(1)} %</span>
          </div>
        ),
      },
    ];

    for (const book of matrixBooks) {
      const bookKey = normalizeBookKey(book.id);
      cols.push({
        key: `book-${bookKey}`,
        header: book.label,
        numeric: true,
        render: (row) => {
          const quote = row.quotesByBook.get(bookKey);
          if (!quote) {
            return (
              <span className="pl-mc-empty-cell" aria-label={`Sin cuota de ${book.label}`}>
                —
              </span>
            );
          }
          const cellEv = computeGuardedOddsEvaluation(
            row.pick.p,
            quote.decimal,
            quote.book || quote.bookLabel,
            row.deVigProb,
          ).evPct;
          const cellMove = resolveCellMovement(quote);
          const isBest =
            row.refQuote !== null &&
            row.refQuote.bookKey === bookKey &&
            Math.abs(row.refQuote.decimal - quote.decimal) < 0.001;

          return (
            <AtomicOddsChip
              variant="cell"
              compact
              fairDecimal={row.pick.fairDecimal}
              marketDecimal={quote.decimal}
              openingDecimal={quote.openingDecimal ?? null}
              movement={cellMove}
              oddsFormat={oddsFormat}
              valuePct={cellEv}
              highlight={isBest}
            />
          );
        },
      });
    }

    cols.push(
      {
        key: "manual-ev",
        header: "Tu casa / Valor",
        numeric: true,
        render: (row) => {
          const inputId = `odds-input-${row.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const placeholder = row.refQuote
            ? formatOddsValue(row.refQuote.decimal, oddsFormat)
            : oddsFormat === "decimal"
              ? "1.95"
              : "−110";
          const showSourceBook =
            row.manualDec === null &&
            row.refQuote !== null &&
            !matrixBooks.some((b) => normalizeBookKey(b.id) === row.refQuote?.bookKey);

          return (
            <div className="pl-mc-eval-cell num">
              <label htmlFor={inputId} className="sr-only">
                Tu momio para {row.pick.label}
              </label>
              <input
                id={inputId}
                className="pl-mc-input pl-mc-input--cell num"
                inputMode="decimal"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={row.manualInvalid ? "true" : undefined}
                placeholder={placeholder}
                value={row.manualRaw}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setInputs((prev) => ({ ...prev, [row.pick.id]: nextVal }));
                }}
              />
              <div
                className="pl-mc-eval-readout"
                aria-live="polite"
                data-market-direction={row.direction?.kind}
              >
                {row.manualInvalid ? (
                  <span className="pl-mc-edge-note is-danger">Inválido</span>
                ) : row.evPct !== null && row.edgePts !== null ? (
                  <>
                    {row.evPct > 0 ? (
                      <>
                        <span
                          className="pl-sf-signal-pill is-compact is-positive num"
                          data-ev-positive="true"
                        >
                          {`Valor +${row.evPct.toFixed(1)} %`}
                        </span>
                        <SofascoreSignalPair
                          evPct={null}
                          movement={row.direction?.kind ?? null}
                          compact
                        />
                      </>
                    ) : (
                      <SofascoreSignalPair
                        evPct={row.evPct}
                        movement={row.direction?.kind ?? null}
                        compact
                      />
                    )}
                    <span className={`pl-mc-edge-note ${row.edgePts >= 0 ? "is-pos" : ""}`.trim()}>
                      {`${row.edgePts >= 0 ? "+" : ""}${row.edgePts.toFixed(1)} pts`}
                      {row.manualDec !== null
                        ? " · Manual"
                        : showSourceBook && row.refQuote
                          ? ` · ${row.refQuote.bookLabel}`
                          : ""}
                    </span>
                  </>
                ) : (
                  <span className="pl-mc-edge-note">—</span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        key: "parlay",
        header: "Parlay",
        align: "end",
        render: (row) => {
          const inParlay = parlayIds.has(row.pick.id);
          return (
            <Button
              variant={inParlay ? "primary" : "secondary"}
              size="icon-sm"
              aria-pressed={inParlay}
              aria-label={
                inParlay
                  ? `Quitar ${row.pick.label} del parlay`
                  : `Agregar ${row.pick.label} al parlay`
              }
              onClick={() => {
                if (inParlay) removePickFromParlay(row.pick.id);
                else addPickToParlay(row.pick);
              }}
            >
              <MaestroIcon name={inParlay ? "check" : "plus"} size={14} />
            </Button>
          );
        },
      },
    );

    return cols;
  }, [
    addPickToParlay,
    matrixBooks,
    navigateTo,
    oddsFormat,
    parlayIds,
    prefetchRoute,
    removePickFromParlay,
  ]);

  const formatTabItems = useMemo<readonly SofascoreTabItem[]>(
    () => [
      { id: "american", label: "Americano" },
      { id: "decimal", label: "Decimal" },
    ],
    [],
  );

  return (
    <AtmosphereStage activePath="/app/momios">
      <ClubWorkspaceShell activePath="/app/momios">
        <div className="pl-mc-page" data-odds-spacetime-anchored="v5.1">
          <header className="pl-mc-hero">
            <div className="pl-mc-hero-copy">
              <div className="pl-mc-title-row">
                <h1 className="pl-mc-title">Compara tu momio</h1>
                <span className="pl-mc-anchor-tag num">Spacetime v5.1</span>
              </div>
              <p className="pl-mc-subtitle">
                Matriz multi-casa anclada al momio justo de PitchLab. Captura el momio de tu casa o
                contrasta cuotas vigentes (≤ 72 h) con señal de movimiento y valor esperado.
              </p>
            </div>
            <div className="pl-mc-hero-actions">
              <SofascoreTabs
                variant="segmented"
                ariaLabel="Formato de momios"
                items={formatTabItems}
                value={oddsFormat}
                onChange={(next) => {
                  const resolved: OddsFormat = next === "decimal" ? "decimal" : "american";
                  setOddsFormat(resolved);
                }}
              />
              {stats.manualCount > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearManualInputs}
                  className="num"
                >
                  Limpiar ({stats.manualCount})
                </Button>
              ) : null}
            </div>
          </header>

          <SofascoreKpiStrip items={kpiItems} />

          <div className="pl-mc-filter-stack">
            <SofascoreFilterBar
              className="pl-mc-odds-filter-bar"
              searchValue={searchQuery}
              onSearchChange={(next) => {
                setSearchQuery(next);
                setVisibleLimit(INITIAL_MATRIX_ROWS);
              }}
              searchPlaceholder="Buscar equipo, mercado o liga…"
              resultCount={displayedRows.length}
              trailing={
                <Button
                  variant={onlyEvPositive ? "primary" : "secondary"}
                  size="sm"
                  aria-pressed={onlyEvPositive}
                  onClick={() => {
                    setOnlyEvPositive((prev) => !prev);
                    setVisibleLimit(INITIAL_MATRIX_ROWS);
                  }}
                >
                  Solo EV+
                </Button>
              }
            >
              {availableBooks.length > 0 ? (
                <div
                  className="pl-mc-books-row"
                  role="group"
                  aria-label="Casas visibles en la matriz"
                >
                  <span className="pl-mc-books-label">Casas:</span>
                  <button
                    type="button"
                    className={`pl-mc-chip-btn ${selectedBookTag === "all" ? "is-active" : ""}`.trim()}
                    aria-pressed={selectedBookTag === "all"}
                    onClick={() => setSelectedBookTag("all")}
                  >
                    Preferidas
                  </button>
                  <button
                    type="button"
                    className={`pl-mc-chip-btn ${selectedBookTag === "manual" ? "is-active" : ""}`.trim()}
                    aria-pressed={selectedBookTag === "manual"}
                    onClick={() => setSelectedBookTag("manual")}
                  >
                    Solo manual
                  </button>
                  {availableBooks.map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      className={`pl-mc-chip-btn ${selectedBookTag === book.id ? "is-active" : ""}`.trim()}
                      aria-pressed={selectedBookTag === book.id}
                      onClick={() => setSelectedBookTag(book.id)}
                    >
                      {book.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </SofascoreFilterBar>

            {activeLeagues.length > 0 ? (
              <SofascoreTabs
                variant="underline"
                ariaLabel="Filtrar matriz por liga activa"
                items={leagueTabItems}
                value={league}
                onChange={(nextLeague) => {
                  setLeague(nextLeague);
                  setVisibleLimit(INITIAL_MATRIX_ROWS);
                }}
              />
            ) : null}
          </div>

          <div className="pl-mc-odds-layout">
            <div className="pl-mc-odds-main">
              <SofascoreCard
                title="Matriz de momios"
                meta={`${visibleRows.length} de ${displayedRows.length} mercados`}
                className="pl-mc-matrix-card"
              >
                <SofascoreTable
                  caption="Matriz multi-casa anclada al momio justo de Spacetime v5.1"
                  columns={tableColumns}
                  rows={visibleRows}
                  rowKey={(row) => row.id}
                  density="compact"
                  className="pl-mc-matrix-table"
                  emptyState={
                    <SofascoreEmptyState
                      title="Sin mercados con ese filtro"
                      description="Cambia de liga, desactiva Solo EV+ o limpia el texto de búsqueda."
                      actionLabel="Restablecer filtros"
                      onAction={handleResetFilters}
                    />
                  }
                />

                {displayedRows.length > 0 ? (
                  <div className="pl-mc-table-footer">
                    <p className="pl-mc-table-summary num">
                      Mostrando {visibleRows.length} de {displayedRows.length} mercados evaluables
                    </p>
                    {displayedRows.length > visibleLimit ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="num"
                        onClick={() => setVisibleLimit((prev) => prev + INITIAL_MATRIX_ROWS)}
                      >
                        Cargar más ({displayedRows.length - visibleLimit} restantes)
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </SofascoreCard>
            </div>

            <aside className="pl-mc-odds-side">
              <ConverterCard />
              <SofascoreCard title="Cómo leer la matriz" density="compact">
                <ul className="pl-mc-guide-list">
                  <li>
                    <strong>Momio justo:</strong> inverso de la probabilidad calibrada Spacetime
                    v5.1, sin comisión de casa.
                  </li>
                  <li>
                    <strong>Valor EV+:</strong> cuota vigente por encima del momio justo, con valor
                    esperado matemático positivo.
                  </li>
                  <li>
                    <strong>Movimiento:</strong> Steam indica caída acelerada; ↓ bajando muestra
                    dinero a favor y ↑ subiendo cuota en alza.
                  </li>
                  <li>
                    Cuotas informativas con sello horario vigente (≤ 72 h), sin enlaces de afiliado
                    ni garantías de resultado.
                  </li>
                </ul>
              </SofascoreCard>
            </aside>
          </div>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export { OddsCompareClubView as OddsCompareView };
