"use client";

import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  canonicalGameHref,
  isLivePhaseActive,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { LeagueBadge, PBar } from "../../sports";
import { formatOddsValue, isPickUnlocked } from "../access-guard";
import {
  normalizeBookKey,
  parseManualOddsInput,
  resolvePreferredBookQuote,
} from "../bookmakers";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useSheetSwipeDismiss } from "../components/use-sheet-swipe-dismiss";
import {
  computeLivePickProgress,
  type LivePickProgressItem,
} from "../live/live-pick-progress";
import { liveMatchStore, useLiveScoreboard } from "../live/live-store";
import {
  useIsPickInParlay,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import {
  MAX_SAVED_SCREENER_VIEWS,
  sliderStepToOdds,
  smoothOddsWeight,
  type SavedScreenerView,
  type ScreenerBandFilter,
  type ScreenerKindFilter,
  type ScreenerSortKey,
  type ScreenerSportFilter,
  type ScreenerWindowFilter,
} from "../screener-views";
import type {
  JournalEntry,
  MatchPick,
  OddsFormat,
  PlatformGame,
  PlatformMarketRow,
} from "../types";
import { addDays, matchesSportFilter, todayId } from "./home/home-model";
import {
  BetBuilderDrawer,
  BetBuilderQuickButton,
  BookmakerComparePill,
  EvidenceWindowPills,
  NonLinearOddsSlider,
  SavedViewsBar,
  classifyOddsMovement,
  computeExpectedValuePct,
  extractEvidenceWindows,
  type EvidenceWindowItem,
  type OddsMovementInfo,
} from "./picks";

type Band = ScreenerBandFilter;
type GroupMode = "match" | "market" | "flat";
type TimingMode = "upcoming" | "live";
type ScreenerSortExtended = "ev" | "p" | "movimiento" | "hora" | "relevancia" | "momio";
type QuickPreset = "todos" | "probables" | "valor" | "goles" | "conteos";
type MarketFamilyFilter =
  | "all"
  | "resultado"
  | "goles"
  | "ambos"
  | "handicap"
  | "conteos"
  | "props"
  | "nba"
  | "mlb"
  | "nhl"
  | "nfl";

const SPORT_OPTIONS: ReadonlyArray<{ id: ScreenerSportFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "futbol", label: "Fútbol" },
  { id: "nba", label: "NBA" },
  { id: "mlb", label: "MLB" },
  { id: "nhl", label: "NHL" },
  { id: "nfl", label: "NFL" },
];

const WINDOW_OPTIONS: ReadonlyArray<{ id: ScreenerWindowFilter; label: string }> = [
  { id: "all", label: "Toda la agenda" },
  { id: "today", label: "Hoy" },
  { id: "next48h", label: "Próx. 48 h" },
];

const BANDS: ReadonlyArray<{ id: Band; label: string; hint: string }> = [
  { id: "all", label: "Todas", hint: "" },
  { id: "alta", label: "≥ 70 %", hint: "70 % o más" },
  { id: "media", label: "55–69 %", hint: "55 a 69 %" },
  { id: "baja", label: "< 55 %", hint: "menos de 55 %" },
];

const MARKET_FAMILIES: ReadonlyArray<{ id: MarketFamilyFilter; label: string }> = [
  { id: "all", label: "Todos los mercados" },
  { id: "resultado", label: "Resultado (1X2 / DC / DNB)" },
  { id: "goles", label: "Goles y totales" },
  { id: "ambos", label: "Ambos anotan y portería" },
  { id: "handicap", label: "Hándicaps y spreads" },
  { id: "conteos", label: "Córners, tiros y tarjetas" },
  { id: "props", label: "Props Jugador" },
  { id: "nba", label: "NBA (ML / Spread / Props)" },
  { id: "mlb", label: "MLB (ML / Run Line / F5)" },
  { id: "nhl", label: "NHL (ML / Puck Line)" },
  { id: "nfl", label: "NFL (ML / Spread / Totales)" },
];

const MARKET_FAMILY_SHORT_LABELS: Readonly<Record<Exclude<MarketFamilyFilter, "all">, string>> = {
  resultado: "Resultado",
  goles: "Goles y totales",
  ambos: "Ambos anotan y portería",
  handicap: "Hándicaps y spreads",
  conteos: "Córners, tiros y tarjetas",
  props: "Props de jugador",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  nfl: "NFL",
};

const QUICK_BOOKS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "pinnacle", label: "Pinnacle" },
  { id: "bet365", label: "Bet365" },
  { id: "codere", label: "Codere" },
  { id: "betcris", label: "Betcris" },
  { id: "caliente_mx", label: "Caliente" },
  { id: "draftkings", label: "DraftKings" },
  { id: "fanduel", label: "FanDuel" },
];

const QUICK_CHIPS: ReadonlyArray<{ id: QuickPreset; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "probables", label: "Muy probables (≥ 70 %)" },
  { id: "valor", label: "Valor EV+" },
  { id: "goles", label: "Goles y totales" },
  { id: "conteos", label: "Córners y tarjetas" },
];

const GROUP_MODES: ReadonlyArray<{ id: GroupMode; label: string }> = [
  { id: "match", label: "Por partido" },
  { id: "market", label: "Por mercado" },
  { id: "flat", label: "Lista plana" },
];

const EXTENDED_SYNTH_MARKETS = new Set([
  "corners_total",
  "corners_team",
  "shots_total",
  "shots_on_target",
  "sot_total",
  "fouls_total",
  "cards_total",
  "yellow_total",
  "asian_handicap",
  "double_chance",
  "dnb",
  "clean_sheet",
  "clean_sheet_home",
  "clean_sheet_away",
  "win_to_nil",
  "team_totals",
  "mlb_f5",
  "mlb_run_line",
  "nhl_puck_line",
  "nhl_puckline",
  "nba_spread",
  "nba_totals",
  "nba_player_props",
  "nfl_spread",
  "nfl_totals",
  "player_props_football",
]);

function normText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function primaryFamilyOf(
  pick: MatchPick,
  game: PlatformGame,
): Exclude<MarketFamilyFilter, "all"> {
  const m = normText(pick.market ?? "");
  const g = normText(`${pick.market ?? ""} ${pick.marketGroup} ${pick.label}`);

  if (
    m.includes("player_prop") ||
    m.startsWith("player_") ||
    g.includes("prop jugador") ||
    g.includes("props jugador") ||
    g.includes("jugador:") ||
    g.includes("asistencia") ||
    g.includes("rebotes") ||
    g.includes("triples")
  ) {
    return "props";
  }
  if (
    m.includes("corner") ||
    m.includes("shot") ||
    m.includes("sot") ||
    m.includes("foul") ||
    m.includes("card") ||
    m.includes("yellow") ||
    g.includes("corner") ||
    g.includes("tiros") ||
    g.includes("remate") ||
    g.includes("tarjeta") ||
    g.includes("amarilla") ||
    g.includes("falta")
  ) {
    return "conteos";
  }
  if (
    m.includes("btts") ||
    m.includes("clean_sheet") ||
    g.includes("ambos anotan") ||
    g.includes("porteria a cero")
  ) {
    return "ambos";
  }
  if (
    m.includes("handicap") ||
    m.startsWith("ah_") ||
    m.includes("spread") ||
    m.includes("run_line") ||
    m.includes("puck") ||
    g.includes("handicap") ||
    g.includes("spread") ||
    g.includes("run line") ||
    g.includes("puck line") ||
    /[+-]\d+(?:\.\d+)?/.test(pick.label)
  ) {
    return "handicap";
  }
  if (
    m.includes("total") ||
    m === "ou" ||
    g.includes("total") ||
    g.includes("goles") ||
    g.includes("puntos") ||
    g.includes("mas de") ||
    g.includes("menos de")
  ) {
    return "goles";
  }
  if (game.sport === "basketball") return "nba";
  if (game.sport === "baseball") return "mlb";
  if (game.sport === "ice-hockey") return "nhl";
  if (game.sport === "american-football") return "nfl";
  return "resultado";
}

function matchesMarketFamily(
  pick: MatchPick,
  game: PlatformGame,
  filter: MarketFamilyFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "nba") return game.sport === "basketball" || (pick.market ?? "").startsWith("nba_");
  if (filter === "mlb") return game.sport === "baseball" || (pick.market ?? "").startsWith("mlb_");
  if (filter === "nhl") return game.sport === "ice-hockey" || (pick.market ?? "").startsWith("nhl_");
  if (filter === "nfl") {
    return game.sport === "american-football" || (pick.market ?? "").startsWith("nfl_");
  }
  const fam = primaryFamilyOf(pick, game);
  if (filter === "resultado") {
    const m = normText(pick.market ?? "");
    const g = normText(`${pick.marketGroup} ${pick.label}`);
    return (
      fam === "resultado" ||
      m.includes("moneyline") ||
      m === "1x2" ||
      m === "h2h" ||
      m === "double_chance" ||
      m === "dnb" ||
      m === "half_time_result" ||
      m === "second_half_result" ||
      m === "win_to_nil" ||
      m.startsWith("combo_1x2") ||
      g.includes("gana") ||
      g.includes("empate")
    );
  }
  return fam === filter;
}

function toSavedKind(filter: MarketFamilyFilter): ScreenerKindFilter {
  if (
    filter === "resultado" ||
    filter === "goles" ||
    filter === "conteos" ||
    filter === "ambos" ||
    filter === "handicap"
  ) {
    return filter;
  }
  return "all";
}

function toSavedSort(sort: ScreenerSortExtended): ScreenerSortKey {
  if (sort === "ev") return "ventaja";
  if (sort === "movimiento") return "ventaja";
  return sort;
}

function bandOf(p: number): Exclude<Band, "all"> {
  return p >= 0.7 ? "alta" : p >= 0.55 ? "media" : "baja";
}

function marketRowToScreenerPick(game: PlatformGame, m: PlatformMarketRow, idx: number): MatchPick {
  const sel = m.selection.toLowerCase();
  const lbl = m.label.toLowerCase();
  const conflictGroup: MatchPick["conflictGroup"] =
    m.market.includes("btts")
      ? sel.includes("no") || lbl.includes("no")
        ? "btts_no"
        : "btts_yes"
      : sel.includes("under") || lbl.includes("menos de")
        ? "under_total"
        : sel.includes("over") || lbl.includes("más de")
          ? "over_total"
          : sel === "home"
            ? "home_side"
            : sel === "away"
              ? "away_side"
              : sel === "draw"
                ? "draw_side"
                : "independent";

  return {
    id: `${game.id}__scr__${m.market}__${m.selection}__${m.line ?? idx}`,
    gameId: game.id,
    league: game.league,
    leagueLabel: game.leagueLabel,
    matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
    kickoffLocal: game.kickoffLocal,
    gameStatus: game.status,
    slotIndex: 30 + idx,
    category: "tactico",
    categoryLabel: m.group,
    risk: m.p >= 0.7 ? "conservador" : m.p >= 0.55 ? "medio" : "arriesgado",
    engineKey: "tachyon",
    engineName: "PitchLab Spacetime v5.1",
    marketGroup: m.group,
    selectionKey: m.selection,
    market: m.market,
    ...(typeof m.line === "number" ? { line: m.line } : {}),
    conflictGroup,
    label: m.label,
    rationale: `${m.group} · probabilidad calibrada ${(m.p * 100).toFixed(1)} %.`,
    p: m.p,
    fairDecimal: m.fairDecimal,
    fairAmerican: m.fairAmerican,
    marketDecimal: m.currentDecimal,
    marketAmerican: null,
    marketBookLabel: m.quoteBookLabel ?? null,
    marketCapturedAtUtc: m.quoteCapturedAtUtc ?? null,
    bookQuotes: m.bookQuotes,
    edgePts: m.edgePts,
    confidenceScore: game.confidenceScore,
    suggestedUnits: 1.0,
    result: null,
  };
}

interface ScreenerItem {
  readonly game: PlatformGame;
  readonly pick: MatchPick;
  readonly isLiveGame: boolean;
  readonly liveEntry?: LiveScoreboardEntry;
  readonly liveProgress: LivePickProgressItem | null;
  readonly family: Exclude<MarketFamilyFilter, "all">;
  readonly houseDecimal: number | null;
  readonly houseLabel: string | null;
  readonly openDecimal: number | null;
  readonly movementDir: "shortening" | "drifting" | "stable" | null;
  readonly movement: OddsMovementInfo | null;
  readonly movementScore: number;
  readonly capturedAtUtc: string | null;
  readonly valuePct: number | null;
  readonly edgePts: number | null;
  readonly evidenceWindows: readonly EvidenceWindowItem[];
}

function ParlayToggle({ pick }: { readonly pick: MatchPick }): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const on = useIsPickInParlay(pick.id);
  return (
    <button
      type="button"
      className={`pl-home-parlay-btn min-h-11 sm:min-h-9 ${on ? "is-on" : ""}`.trim()}
      aria-pressed={on}
      aria-label={`${on ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}, ${pick.matchLabel}`}
      onClick={() => (on ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
    >
      <MaestroIcon name={on ? "check" : "plus"} size={13} />
      <span>{on ? "En parlay" : "Parlay"}</span>
    </button>
  );
}

interface ScreenerPickRowProps {
  readonly item: ScreenerItem;
  readonly unlocked: boolean;
  readonly oddsFormat: OddsFormat;
  readonly showMatchMeta: boolean;
  readonly manualRaw: string;
  readonly isManualOpen: boolean;
  readonly onOpenManual: (pickId: string) => void;
  readonly onManualChange: (pickId: string, value: string) => void;
  readonly onOpenBuilder: (pick: MatchPick, game: PlatformGame) => void;
  readonly onOpenSeal: (pick: MatchPick) => void;
  readonly onPrefetch: (href: string) => void;
  readonly onNavigate: (href: string) => void;
}

const ScreenerPickRow = memo(function ScreenerPickRow({
  item,
  unlocked,
  oddsFormat,
  showMatchMeta,
  manualRaw,
  isManualOpen,
  onOpenManual,
  onManualChange,
  onOpenBuilder,
  onOpenSeal,
  onPrefetch,
  onNavigate,
}: ScreenerPickRowProps): React.JSX.Element {
  const { game, pick, liveProgress, evidenceWindows } = item;
  const href = canonicalGameHref(game.league, game);
  const manualDec = parseManualOddsInput(manualRaw);
  const effectiveHouseDec = manualDec ?? item.houseDecimal;
  const effectiveHouseLabel = manualDec !== null ? "Tu momio" : item.houseLabel;

  const progressPct =
    liveProgress &&
    liveProgress.currentValue !== null &&
    liveProgress.targetValue !== null &&
    liveProgress.targetValue > 0
      ? Math.max(4, Math.min(100, Math.round((liveProgress.currentValue / liveProgress.targetValue) * 100)))
      : null;

  return (
    <article className="pl-scr-row" role="listitem" data-screener-pick={pick.id}>
      {/* Columna 1: Pick, partido (si aplica), probabilidad y barra en vivo */}
      <div className="pl-scr-col-pick">
        {showMatchMeta ? (
          <div className="pl-scr-match-meta">
            <LeagueBadge
              league={game.league}
              label={game.leagueLabel}
              logoUrl={game.leagueLogoUrl}
              size={14}
            />
            <span className="truncate">
              {game.home.shortName} vs {game.away.shortName}
            </span>
            <span className="pl-scr-meta-sep" aria-hidden="true">·</span>
            <span className="num shrink-0">
              {liveProgress ? (
                <span className="pl-scr-live-badge">
                  {liveProgress.scoreLabel} · {liveProgress.clockLabel}
                </span>
              ) : (
                `${game.dayLabel} ${game.kickoffLocal}`
              )}
            </span>
          </div>
        ) : null}

        <div className="pl-scr-pick-head">
          <span className="pl-scr-cat-tag">{pick.categoryLabel}</span>
          <strong className={`pl-scr-pick-title ${unlocked ? "" : "locked-redact"}`.trim()}>
            {unlocked ? pick.label : "Pick reservado Pase PitchLab Ultra"}
          </strong>
        </div>

        <div className="pl-scr-prob-row num">
          <strong
            className="pl-scr-prob-val"
            style={{
              color: unlocked && pick.p >= 0.7 ? "var(--pl-success)" : "var(--pl-text)",
            }}
          >
            {unlocked ? `${(pick.p * 100).toFixed(1)} %` : "—"}
          </strong>
          {unlocked ? <PBar p={pick.p} lead={pick.p >= 0.7} /> : null}
        </div>

        {/* Barra plana en vivo actual / línea */}
        {unlocked && liveProgress ? (
          <div className="pl-scr-live-prog" data-live-progress-bar="">
            <div className="pl-scr-live-prog-head num">
              <span className="pl-scr-live-ratio">
                {liveProgress.progressRatioLabel ?? liveProgress.statusText}
              </span>
              <span
                className={`pl-scr-live-status is-${liveProgress.tone}`}
              >
                {liveProgress.lineReached ? "✓ " : ""}
                {liveProgress.statusText}
              </span>
            </div>
            {progressPct !== null ? (
              <div
                className="pl-scr-live-bar-track"
                role="progressbar"
                aria-valuenow={liveProgress.currentValue ?? 0}
                aria-valuemin={0}
                aria-valuemax={liveProgress.targetValue ?? 1}
                aria-label={`${pick.label}: ${liveProgress.progressRatioLabel ?? liveProgress.statusText}`}
              >
                <span
                  className={`pl-scr-live-bar-fill is-${liveProgress.tone}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Columna 2: Evidencia multi-ventana */}
      <div className="pl-scr-col-evidence">
        {unlocked ? (
          evidenceWindows.length > 0 ? (
            <EvidenceWindowPills windows={evidenceWindows} size="sm" />
          ) : (
            <span className="pl-scr-ev-fallback">
              {pick.rationale ? pick.rationale.slice(0, 72) : "Modelo calibrado Spacetime"}
            </span>
          )
        ) : (
          <span className="pl-scr-ev-fallback">Evidencia disponible con Pase Ultra</span>
        )}
      </div>

      {/* Columna 3: Momio justo vs mejor casa + EV+ + Movimiento */}
      <div className="pl-scr-col-odds">
        {unlocked ? (
          <BookmakerComparePill
            probability={pick.p}
            fairDecimal={pick.fairDecimal}
            houseDecimal={effectiveHouseDec}
            houseBookLabel={effectiveHouseLabel}
            openingDecimal={manualDec !== null ? null : item.openDecimal}
            movementDirection={manualDec !== null ? null : item.movementDir}
            capturedAtUtc={manualDec !== null ? null : item.capturedAtUtc}
            bookQuotes={manualDec !== null ? undefined : pick.bookQuotes}
            oddsFormat={oddsFormat}
            variant="compact"
            showMultiBookQuotes={false}
          />
        ) : (
          <span className="pl-pill text-xs">
            <MaestroIcon name="lock" size={12} />
            <span>Ultra</span>
          </span>
        )}
      </div>

      {/* Columna 4: Acciones 1-clic */}
      <div className="pl-scr-col-actions">
        {unlocked ? (
          <>
            <BetBuilderQuickButton
              pick={pick}
              onInspect={(pk) => onOpenBuilder(pk, game)}
              compact
            />
            {!item.isLiveGame ? <ParlayToggle pick={pick} /> : null}
            {!item.isLiveGame ? (
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-2.5"
                onClick={() => onOpenSeal(pick)}
              >
                Sellar
              </button>
            ) : null}
            {isManualOpen ? (
              <label className="inline-flex items-center">
                <span className="sr-only">Tu momio para {pick.label}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder={oddsFormat === "american" ? "-110" : "1.91"}
                  value={manualRaw}
                  onChange={(e) => onManualChange(pick.id, e.target.value)}
                  data-manual-odds-input={pick.id}
                  className="pl-scr-manual-input num"
                />
              </label>
            ) : (
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-2.5"
                data-open-manual-odds={pick.id}
                onClick={() => onOpenManual(pick.id)}
              >
                Mi momio
              </button>
            )}
          </>
        ) : null}
        <a
          href={href}
          className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-2.5 inline-flex items-center gap-1"
          onPointerEnter={() => onPrefetch(href)}
          onTouchStart={() => onPrefetch(href)}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(href);
          }}
        >
          <span>Partido</span>
          <MaestroIcon name="arrowRight" size={12} />
        </a>
      </div>
    </article>
  );
});

const INITIAL_VISIBLE_PICKS = 12;
const PICKS_PAGE_STEP = 16;

function MobileFiltersSheet({
  resultCount,
  onReset,
  onClose,
  children,
}: {
  readonly resultCount: number;
  readonly onReset: () => void;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const swipe = useSheetSwipeDismiss({
    onDismiss: () => onCloseRef.current(),
    scrollContainerRef: scrollRef,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const closeDialogSafely = () => {
      if (typeof dialog.close === "function" && dialog.open) {
        try {
          dialog.returnValue = "";
          dialog.close();
          return;
        } catch (err) {
          void err;
        }
      }
      if (dialog.hasAttribute("open")) {
        dialog.removeAttribute("open");
      }
    };

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      } else if (typeof dialog.show === "function") {
        try {
          dialog.show();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
    }

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };

    const handleClose = () => {
      if (dialog.open) return;
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== "Escape") return;
      if (!dialog.open && !dialog.hasAttribute("open")) return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleEscape);

    let cleanupLightDismiss: (() => void) | undefined;
    if (
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype)
    ) {
      const isOutside = (e: PointerEvent) => {
        if (e.target !== dialog) return false;
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          if (typeof dialog.close === "function" && dialog.open) {
            try {
              dialog.close();
              return;
            } catch (err) {
              void err;
            }
          }
          dialog.removeAttribute("open");
          onCloseRef.current();
        }
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      cleanupLightDismiss?.();
      closeDialogSafely();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className="pl-scr-filter-sheet"
      data-mobile-filters-sheet=""
      style={swipe.sheetStyle}
    >
      <div className="pl-scr-sheet-shell">
        <div className="pl-scr-sheet-drag" {...swipe.handleProps}>
          <span className="pl-bottom-sheet-handle" aria-hidden="true" />
          <div className="pl-scr-sheet-head">
            <h2 id={titleId} className="m-0 text-base font-extrabold">
              Filtros del buscador
            </h2>
            <button
              type="button"
              className="pl-btn-glass pl-bb-close-btn"
              aria-label="Cerrar filtros"
              autoFocus
              onClick={onClose}
            >
              <MaestroIcon name="x" size={16} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="pl-scr-sheet-scroll">
          {children}
        </div>

        <footer className="pl-scr-sheet-footer">
          <button
            type="button"
            className="pl-btn-glass min-h-11 px-4 text-xs"
            onClick={onReset}
          >
            Limpiar
          </button>
          <button
            type="button"
            className="pl-btn-primary min-h-11 flex-1 text-xs num"
            onClick={onClose}
          >
            Ver {resultCount} {resultCount === 1 ? "pick" : "picks"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

/**
 * Screener editorial de Picks (`/app/picks`) en Desktop (terminal editorial con `@container`)
 * y Mobile (tarjetas táctiles `>= 44 px` + bottom sheet nativo con `useSheetSwipeDismiss`).
 * Incluye agrupación `Por partido / Por mercado / Lista plana`, ordenación por `EV+ / Probabilidad /
 * Movimiento / Inicio`, conmutador `Próximos / En vivo` con barra `actual / línea` consciente de
 * `document.visibilityState`, filtro de 24+ familias de mercado, selector rápido de casas preferidas,
 * slider no lineal, vistas guardadas con toast `Deshacer` y Bet Builder 1-clic.
 */
export function PicksFinderClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    preferredBooks,
    userTimezone,
    savedScreenerViews,
  } = usePlatformCore();
  const {
    setSavedScreenerViews,
    setPreferredBooks,
    pushToast,
    openComposer,
    navigateTo,
    prefetchRoute,
    requestFullShell,
  } = usePlatformActions();

  useEffect(() => {
    void requestFullShell();
  }, [requestFullShell]);

  // Conciencia de visibilidad de pestaña: cero polling en segundo plano
  const [isPageVisible, setIsPageVisible] = useState<boolean>(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const syncVisibility = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  const [timing, setTiming] = useState<TimingMode>("upcoming");
  const [groupMode, setGroupMode] = useState<GroupMode>("match");
  const [preset, setPreset] = useState<QuickPreset>("todos");
  const [sport, setSport] = useState<ScreenerSportFilter>("all");
  const [windowFilter, setWindowFilter] = useState<ScreenerWindowFilter>("all");
  const [band, setBand] = useState<Band>("all");
  const [family, setFamily] = useState<MarketFamilyFilter>("all");
  const [onlyPositiveEdge, setOnlyPositiveEdge] = useState<boolean>(false);
  const [league, setLeague] = useState<string>("all");
  const [sort, setSort] = useState<ScreenerSortExtended>("ev");
  const [minOddsStep, setMinOddsStep] = useState<number>(0);
  const [maxOddsStep, setMaxOddsStep] = useState<number>(100);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);
  const [shown, setShown] = useState(INITIAL_VISIBLE_PICKS);
  const [manualOddsByPick, setManualOddsByPick] = useState<Record<string, string>>({});
  const [openManualPickId, setOpenManualPickId] = useState<string | null>(null);
  const [builderTarget, setBuilderTarget] = useState<{
    pick: MatchPick;
    game: PlatformGame;
  } | null>(null);

  const hasDatasetLiveGames = useMemo(
    () => dataset.games.some((g) => g.status === "LIVE"),
    [dataset.games],
  );
  // Solo consulta el scoreboard en vivo cuando la pestaña está visible y hace falta
  const liveBoard = useLiveScoreboard((timing === "live" || hasDatasetLiveGames) && isPageVisible);

  const today = useMemo(() => todayId(userTimezone || "America/Mexico_City"), [userTimezone]);
  const plus2Days = useMemo(() => addDays(today, 2), [today]);

  const minOddsVal = useMemo(() => sliderStepToOdds(minOddsStep) ?? 1.01, [minOddsStep]);
  const maxOddsVal = useMemo(() => sliderStepToOdds(maxOddsStep), [maxOddsStep]);

  const preferredBookSet = useMemo(
    () => new Set(preferredBooks.map((b) => normalizeBookKey(b))),
    [preferredBooks],
  );

  const togglePreferredBook = useCallback(
    (bookId: string) => {
      const key = normalizeBookKey(bookId);
      const next = preferredBookSet.has(key)
        ? preferredBooks.filter((b) => normalizeBookKey(b) !== key)
        : [...preferredBooks, key];
      if (next.length === 0) {
        pushToast("Mantén al menos 1 casa de referencia seleccionada.", "warning");
        return;
      }
      setPreferredBooks(next);
    },
    [preferredBookSet, preferredBooks, pushToast, setPreferredBooks],
  );

  const all = useMemo<ScreenerItem[]>(() => {
    const boardEntries = liveBoard.data?.entries ?? [];
    const liveByGameId = new Map<string, LiveScoreboardEntry>(
      boardEntries.map((e) => [e.gameId, e]),
    );
    const out: ScreenerItem[] = [];

    for (const game of dataset.games) {
      if (game.status === "FT") continue;
      const liveEntry = liveByGameId.get(game.id);
      const isLiveGame =
        game.status === "LIVE" || Boolean(liveEntry && isLivePhaseActive(liveEntry.phase));

      const marketByKey = new Map<string, PlatformMarketRow>();
      for (const m of game.markets) {
        marketByKey.set(`${m.market}::${m.selection}`, m);
      }

      const seenIds = new Set<string>();
      const seenLabels = new Set<string>();
      const gamePicks: MatchPick[] = [];

      for (const pk of game.picks) {
        seenIds.add(pk.id);
        seenLabels.add(normText(pk.label));
        gamePicks.push(pk);
      }

      if (game.parlayCandidates) {
        for (const cand of game.parlayCandidates) {
          const lblKey = normText(cand.label);
          if (seenIds.has(cand.id) || seenLabels.has(lblKey)) continue;
          seenIds.add(cand.id);
          seenLabels.add(lblKey);
          gamePicks.push(cand);
        }
      }

      game.markets.forEach((m, idx) => {
        if (!EXTENDED_SYNTH_MARKETS.has(m.market.toLowerCase())) return;
        const lblKey = normText(m.label);
        if (seenLabels.has(lblKey)) return;
        seenLabels.add(lblKey);
        gamePicks.push(marketRowToScreenerPick(game, m, idx));
      });

      const liveDetail = isLiveGame ? liveMatchStore(game.id).getSnapshot().data : null;

      for (const pick of gamePicks) {
        const matchedRow = pick.market
          ? marketByKey.get(`${pick.market}::${pick.selectionKey}`)
          : undefined;
        const quotes = pick.bookQuotes ?? matchedRow?.bookQuotes;
        const prefQuote = resolvePreferredBookQuote(quotes, preferredBooks);
        const houseDecimal = prefQuote?.decimal ?? pick.marketDecimal ?? matchedRow?.currentDecimal ?? null;
        const houseLabel = prefQuote?.bookLabel ?? pick.marketBookLabel ?? matchedRow?.quoteBookLabel ?? null;
        const openDecimal = prefQuote?.openingDecimal ?? matchedRow?.openDecimal ?? null;
        const movementDir = prefQuote?.movementDirection ?? matchedRow?.movementDirection ?? null;
        const capturedAtUtc =
          prefQuote?.capturedAtUtc ??
          pick.marketCapturedAtUtc ??
          matchedRow?.quoteCapturedAtUtc ??
          null;
        const valuePct = computeExpectedValuePct(pick.p, houseDecimal);
        const edgePts =
          houseDecimal !== null && houseDecimal > 1
            ? Math.round((pick.p - 1 / houseDecimal) * 1000) / 10
            : pick.edgePts;

        const movement = classifyOddsMovement(openDecimal, houseDecimal, movementDir);
        const movementScore = !movement
          ? 0
          : movement.kind === "steam"
            ? 100 + Math.abs(movement.deltaPct ?? 8)
            : movement.kind === "shortening"
              ? 50 + Math.abs(movement.deltaPct ?? 2)
              : movement.kind === "drifting"
                ? 10 + Math.abs(movement.deltaPct ?? 1)
                : 0;

        let liveProgress: LivePickProgressItem | null = null;
        if (isLiveGame) {
          const synthEntry: JournalEntry = {
            id: pick.id,
            pickId: pick.id,
            gameId: game.id,
            leagueLabel: game.leagueLabel,
            matchLabel: pick.matchLabel,
            pickLabel: pick.label,
            origin: "Spacetime Suite",
            units: 1,
            userDecimal: houseDecimal ?? pick.fairDecimal,
            fairDecimal: pick.fairDecimal,
            clvPct: 0,
            status: "pending",
            sealedAt: "",
          };
          liveProgress = computeLivePickProgress({
            entry: synthEntry,
            game,
            scoreboardEntry: liveEntry,
            detail: liveDetail,
          });
        }

        const evidenceWindows = extractEvidenceWindows({ game, pick });

        out.push({
          game,
          pick: quotes && !pick.bookQuotes ? { ...pick, bookQuotes: quotes } : pick,
          isLiveGame,
          liveEntry,
          liveProgress,
          family: primaryFamilyOf(pick, game),
          houseDecimal,
          houseLabel,
          openDecimal,
          movementDir,
          movement,
          movementScore,
          capturedAtUtc,
          valuePct,
          edgePts,
          evidenceWindows,
        });
      }
    }
    return out;
  }, [dataset.games, liveBoard.data?.entries, preferredBooks]);

  const timingCounts = useMemo(() => {
    let upcoming = 0;
    let live = 0;
    for (const item of all) {
      if (item.isLiveGame) live += 1;
      else upcoming += 1;
    }
    return { upcoming, live };
  }, [all]);

  const leagues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const { game, isLiveGame } of all) {
      if (timing === "live" ? !isLiveGame : isLiveGame) continue;
      if (sport !== "all" && !matchesSportFilter(game, sport)) continue;
      seen.set(game.league, game.leagueLabel);
    }
    return Array.from(seen.entries());
  }, [all, sport, timing]);

  const applyQuickPreset = (next: QuickPreset) => {
    setActiveViewId(null);
    setPreset(next);
    setShown(INITIAL_VISIBLE_PICKS);
    if (next === "todos") {
      setBand("all");
      setFamily("all");
      setOnlyPositiveEdge(false);
      setSort("ev");
    } else if (next === "probables") {
      setBand("alta");
      setFamily("all");
      setOnlyPositiveEdge(false);
      setSort("p");
    } else if (next === "valor") {
      setBand("all");
      setFamily("all");
      setOnlyPositiveEdge(true);
      setSort("ev");
    } else if (next === "goles") {
      setBand("all");
      setFamily("goles");
      setOnlyPositiveEdge(false);
      setSort("p");
    } else if (next === "conteos") {
      setBand("all");
      setFamily("conteos");
      setOnlyPositiveEdge(false);
      setSort("p");
    }
  };

  const applySavedView = (view: SavedScreenerView) => {
    setActiveViewId(view.id);
    setPreset("todos");
    setSport(view.sport);
    setLeague(view.league);
    setBand(view.band);
    setFamily(view.kind);
    setSort(view.sort === "ventaja" ? "ev" : view.sort);
    setOnlyPositiveEdge(view.onlyPositiveEdge);
    setMinOddsStep(view.minOddsStep);
    setMaxOddsStep(view.maxOddsStep);
    setWindowFilter(view.window);
    setShown(INITIAL_VISIBLE_PICKS);
  };

  const handleSaveView = (cleanName: string): boolean => {
    if (cleanName.length < 2) {
      pushToast("Escribe un nombre corto para tu vista (mínimo 2 caracteres).", "warning");
      return false;
    }
    if (savedScreenerViews.length >= MAX_SAVED_SCREENER_VIEWS) {
      pushToast(`Puedes guardar hasta ${MAX_SAVED_SCREENER_VIEWS} vistas personalizadas.`, "warning");
      return false;
    }
    const newView: SavedScreenerView = {
      id: `sv-${Date.now().toString(36)}`,
      name: cleanName,
      sport,
      league,
      band,
      kind: toSavedKind(family),
      sort: toSavedSort(sort),
      onlyPositiveEdge,
      minOddsStep,
      maxOddsStep,
      window: windowFilter,
    };
    setSavedScreenerViews([newView, ...savedScreenerViews]);
    setActiveViewId(newView.id);
    pushToast(`Vista «${cleanName}» guardada.`, "success");
    return true;
  };

  const handleDeleteSavedView = (viewId: string) => {
    const prevViews = savedScreenerViews;
    const removed = prevViews.find((v) => v.id === viewId);
    const nextViews = prevViews.filter((v) => v.id !== viewId);
    setSavedScreenerViews(nextViews);
    if (activeViewId === viewId) setActiveViewId(null);
    pushToast(
      removed ? `Vista «${removed.name}» eliminada.` : "Vista guardada eliminada.",
      "default",
      removed
        ? {
            actionLabel: "Deshacer",
            onAction: () => {
              setSavedScreenerViews(prevViews);
              setActiveViewId(removed.id);
            },
          }
        : undefined,
    );
  };

  const resetAllFilters = () => {
    setActiveViewId(null);
    setPreset("todos");
    setSport("all");
    setWindowFilter("all");
    setBand("all");
    setFamily("all");
    setOnlyPositiveEdge(false);
    setLeague("all");
    setSort("ev");
    setMinOddsStep(0);
    setMaxOddsStep(100);
    setShown(INITIAL_VISIBLE_PICKS);
  };

  const activeAdvancedCount =
    (sport !== "all" ? 1 : 0) +
    (league !== "all" ? 1 : 0) +
    (windowFilter !== "all" ? 1 : 0) +
    (band !== "all" ? 1 : 0) +
    (family !== "all" ? 1 : 0) +
    (onlyPositiveEdge ? 1 : 0) +
    (minOddsStep > 0 || maxOddsStep < 100 ? 1 : 0);

  const matchesWindow = useCallback(
    (game: PlatformGame): boolean => {
      if (timing === "live") return true;
      if (windowFilter === "all") return true;
      if (windowFilter === "today") return game.dayId === today;
      return game.dayId >= today && game.dayId <= plus2Days;
    },
    [plus2Days, timing, today, windowFilter],
  );

  const matchesOddsRange = useCallback(
    (effectiveDec: number): boolean => {
      if (minOddsStep > 0 && effectiveDec < minOddsVal - 0.001) return false;
      if (maxOddsVal !== null && effectiveDec > maxOddsVal + 0.001) return false;
      return true;
    },
    [maxOddsVal, minOddsStep, minOddsVal],
  );

  const rows = useMemo(() => {
    const filtered = all.filter((item) => {
      if (timing === "live" ? !item.isLiveGame : item.isLiveGame) return false;
      if (sport !== "all" && !matchesSportFilter(item.game, sport)) return false;
      if (league !== "all" && item.game.league !== league) return false;
      if (!matchesWindow(item.game)) return false;
      if (band !== "all" && bandOf(item.pick.p) !== band) return false;
      if (family !== "all" && !matchesMarketFamily(item.pick, item.game, family)) return false;
      if (onlyPositiveEdge) {
        const hasVal = (item.valuePct !== null && item.valuePct > 0) || (item.edgePts !== null && item.edgePts > 0);
        if (!hasVal) return false;
      }
      const effectiveDec = item.houseDecimal ?? item.pick.fairDecimal;
      if (!matchesOddsRange(effectiveDec)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === "ev") {
        return (
          (b.valuePct ?? -999) - (a.valuePct ?? -999) ||
          (b.edgePts ?? -999) - (a.edgePts ?? -999) ||
          b.pick.p - a.pick.p
        );
      }
      if (sort === "movimiento") {
        return (
          b.movementScore - a.movementScore ||
          (b.valuePct ?? -999) - (a.valuePct ?? -999) ||
          b.pick.p - a.pick.p
        );
      }
      if (sort === "hora") {
        return Date.parse(a.game.kickoffUtc) - Date.parse(b.game.kickoffUtc);
      }
      if (sort === "relevancia") {
        const aScore =
          a.pick.p * 0.55 +
          smoothOddsWeight(a.houseDecimal ?? a.pick.fairDecimal) * 0.25 +
          Math.max(0, (a.edgePts ?? 0) / 100) * 0.2;
        const bScore =
          b.pick.p * 0.55 +
          smoothOddsWeight(b.houseDecimal ?? b.pick.fairDecimal) * 0.25 +
          Math.max(0, (b.edgePts ?? 0) / 100) * 0.2;
        return bScore - aScore;
      }
      if (sort === "momio") {
        return (b.houseDecimal ?? b.pick.fairDecimal) - (a.houseDecimal ?? a.pick.fairDecimal);
      }
      return b.pick.p - a.pick.p;
    });
  }, [
    all,
    band,
    family,
    league,
    matchesOddsRange,
    matchesWindow,
    onlyPositiveEdge,
    sort,
    sport,
    timing,
  ]);

  const counts = useMemo(() => {
    const c = { all: 0, alta: 0, media: 0, baja: 0 } as Record<Band, number>;
    for (const item of all) {
      if (timing === "live" ? !item.isLiveGame : item.isLiveGame) continue;
      if (sport !== "all" && !matchesSportFilter(item.game, sport)) continue;
      if (league !== "all" && item.game.league !== league) continue;
      if (!matchesWindow(item.game)) continue;
      if (family !== "all" && !matchesMarketFamily(item.pick, item.game, family)) continue;
      if (onlyPositiveEdge) {
        const hasVal = (item.valuePct !== null && item.valuePct > 0) || (item.edgePts !== null && item.edgePts > 0);
        if (!hasVal) continue;
      }
      const effectiveDec = item.houseDecimal ?? item.pick.fairDecimal;
      if (!matchesOddsRange(effectiveDec)) continue;
      c.all += 1;
      c[bandOf(item.pick.p)] += 1;
    }
    return c;
  }, [all, family, league, matchesOddsRange, matchesWindow, onlyPositiveEdge, sport, timing]);

  const visibleRows = useMemo(() => rows.slice(0, shown), [rows, shown]);

  const groupedByMatch = useMemo(() => {
    const map = new Map<string, { game: PlatformGame; liveEntry?: LiveScoreboardEntry; items: ScreenerItem[] }>();
    for (const item of visibleRows) {
      const existing = map.get(item.game.id);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.game.id, { game: item.game, liveEntry: item.liveEntry, items: [item] });
      }
    }
    return Array.from(map.values());
  }, [visibleRows]);

  const groupedByMarket = useMemo(() => {
    const map = new Map<Exclude<MarketFamilyFilter, "all">, ScreenerItem[]>();
    for (const item of visibleRows) {
      const arr = map.get(item.family) ?? [];
      arr.push(item);
      map.set(item.family, arr);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: MARKET_FAMILY_SHORT_LABELS[key],
      items,
    }));
  }, [visibleRows]);

  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const handleOpenManual = useCallback((pickId: string) => {
    setOpenManualPickId(pickId);
  }, []);

  const handleManualChange = useCallback((pickId: string, value: string) => {
    setManualOddsByPick((prev) => ({ ...prev, [pickId]: value }));
  }, []);

  const handleOpenBuilder = useCallback((pick: MatchPick, game: PlatformGame) => {
    setBuilderTarget({ pick, game });
  }, []);

  const renderFilterControls = (inSheet: boolean) => (
    <div className={`pl-scr-filter-body ${inSheet ? "is-sheet" : ""}`.trim()}>
      {/* Selector rápido de casas preferidas */}
      <div className="pl-scr-books-row">
        <span className="pl-scr-sub-label">Casas de referencia</span>
        <div className="pl-scr-books-pills" role="group" aria-label="Casas preferidas">
          {QUICK_BOOKS.map((book) => {
            const active = preferredBookSet.has(normalizeBookKey(book.id));
            return (
              <button
                key={book.id}
                type="button"
                className={`pl-scr-book-chip ${active ? "is-on" : ""}`.trim()}
                aria-pressed={active}
                data-quick-book={book.id}
                onClick={() => togglePreferredBook(book.id)}
              >
                {book.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Banda de probabilidad + filtro EV+ */}
      <div className="pl-scr-band-row">
        <div className="seg-well" role="group" aria-label="Probabilidad Spacetime">
          {BANDS.map((b) => (
            <button
              key={b.id}
              type="button"
              className="seg-btn text-xs min-h-11 sm:min-h-10"
              aria-pressed={band === b.id}
              title={b.hint || undefined}
              onClick={() => {
                setActiveViewId(null);
                setPreset("todos");
                setBand(b.id);
                setShown(INITIAL_VISIBLE_PICKS);
              }}
            >
              {b.label} <span className="num pl-scr-band-count">{counts[b.id]}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`pl-scr-ev-toggle ${onlyPositiveEdge ? "is-on" : ""}`.trim()}
          aria-pressed={onlyPositiveEdge}
          onClick={() => {
            setActiveViewId(null);
            setOnlyPositiveEdge((v) => !v);
            setShown(INITIAL_VISIBLE_PICKS);
          }}
        >
          Solo EV+ (casa paga más)
        </button>
      </div>

      {/* Selectores: Deporte, Familia de mercado (24+), Liga, Ventana y Ordenación */}
      <div className="pl-scr-selects-grid">
        <label className="pl-scr-field">
          <span>Deporte</span>
          <select
            value={sport}
            onChange={(e) => {
              setActiveViewId(null);
              setSport(e.target.value as ScreenerSportFilter);
              setLeague("all");
              setShown(INITIAL_VISIBLE_PICKS);
            }}
            className="pl-scr-select"
          >
            {SPORT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="pl-scr-field">
          <span>Familia de mercado</span>
          <select
            value={family}
            onChange={(e) => {
              setActiveViewId(null);
              setPreset("todos");
              setFamily(e.target.value as MarketFamilyFilter);
              setShown(INITIAL_VISIBLE_PICKS);
            }}
            className="pl-scr-select"
          >
            {MARKET_FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="pl-scr-field">
          <span>Liga</span>
          <select
            value={league}
            onChange={(e) => {
              setActiveViewId(null);
              setLeague(e.target.value);
              setShown(INITIAL_VISIBLE_PICKS);
            }}
            className="pl-scr-select"
          >
            <option value="all">Todas ({leagues.length})</option>
            {leagues.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {timing === "upcoming" ? (
          <label className="pl-scr-field">
            <span>Agenda</span>
            <select
              value={windowFilter}
              onChange={(e) => {
                setActiveViewId(null);
                setWindowFilter(e.target.value as ScreenerWindowFilter);
                setShown(INITIAL_VISIBLE_PICKS);
              }}
              className="pl-scr-select"
            >
              {WINDOW_OPTIONS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="pl-scr-field">
          <span>Ordenar por</span>
          <select
            value={sort}
            onChange={(e) => {
              setActiveViewId(null);
              setSort(e.target.value as ScreenerSortExtended);
            }}
            className="pl-scr-select"
          >
            <option value="ev">Valor real EV+</option>
            <option value="p">Probabilidad Spacetime</option>
            <option value="movimiento">Movimiento de línea</option>
            <option value="hora">Próximo inicio</option>
            <option value="relevancia">Balance prob. y momio</option>
            <option value="momio">Mayor momio</option>
          </select>
        </label>
      </div>

      {/* Slider no lineal de rango de momios */}
      <NonLinearOddsSlider
        minStep={minOddsStep}
        maxStep={maxOddsStep}
        oddsFormat={oddsFormat}
        compact={inSheet}
        onChange={(nextMin, nextMax) => {
          setActiveViewId(null);
          setMinOddsStep(nextMin);
          setMaxOddsStep(nextMax);
          setShown(INITIAL_VISIBLE_PICKS);
        }}
      />
    </div>
  );

  return (
    <AtmosphereStage activePath="/app/picks">
      <ClubWorkspaceShell activePath="/app/picks">
        <div className="pl-scr-root space-y-3.5">
          {/* Cabecera editorial */}
          <header className="pl-scr-header">
            <div className="min-w-0">
              <h1 className="pl-scr-h1">Explorar picks</h1>
              <p className="pl-scr-lead">
                Buscador cuantitativo con probabilidad Spacetime, evidencia multi-ventana, valor real EV+ y movimiento de línea frente a tus casas.
              </p>
            </div>
            <a
              href="/app/account?tab=prefs#pl-prefs-picks"
              className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-1.5 shrink-0"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app/account?tab=prefs#pl-prefs-picks");
              }}
            >
              <MaestroIcon name="sliders" size={13} />
              <span>Mis casas ({preferredBooks.length})</span>
            </a>
          </header>

          {/* Barra compacta de vistas guardadas (con toast Deshacer al eliminar) */}
          <SavedViewsBar
            views={savedScreenerViews}
            activeViewId={activeViewId}
            onApply={applySavedView}
            onSave={handleSaveView}
            onDelete={handleDeleteSavedView}
          />

          {/* Barra superior de control: Próximos/En vivo + Agrupación + Ordenación rápida */}
          <div className="pl-scr-command-bar">
            <div className="pl-scr-timing-seg" role="group" aria-label="Estado de los partidos" data-screener-timing="">
              <button
                type="button"
                className={`pl-scr-seg-btn ${timing === "upcoming" ? "is-on" : ""}`.trim()}
                aria-pressed={timing === "upcoming"}
                onClick={() => {
                  setTiming("upcoming");
                  setShown(INITIAL_VISIBLE_PICKS);
                }}
              >
                <span>Próximos</span>
                <span className="pl-scr-seg-count num">{timingCounts.upcoming}</span>
              </button>
              <button
                type="button"
                className={`pl-scr-seg-btn ${timing === "live" ? "is-on" : ""}`.trim()}
                aria-pressed={timing === "live"}
                onClick={() => {
                  setTiming("live");
                  setShown(INITIAL_VISIBLE_PICKS);
                }}
              >
                {timingCounts.live > 0 ? <span className="pl-scr-live-dot" aria-hidden="true" /> : null}
                <span>En vivo</span>
                <span className="pl-scr-seg-count num">{timingCounts.live}</span>
              </button>
            </div>

            <div className="pl-scr-group-seg" role="group" aria-label="Modo de agrupación" data-screener-group-mode="">
              {GROUP_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`pl-scr-seg-btn ${groupMode === m.id ? "is-on" : ""}`.trim()}
                  aria-pressed={groupMode === m.id}
                  onClick={() => setGroupMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="pl-scr-command-right">
              <span className="pl-pill text-xs num" data-screener-result-count="">
                {rows.length} {rows.length === 1 ? "pick" : "picks"}
              </span>
              <button
                type="button"
                className="pl-scr-mobile-filter-btn"
                aria-haspopup="dialog"
                aria-expanded={mobileSheetOpen}
                data-mobile-filters-toggle=""
                onClick={() => setMobileSheetOpen(true)}
              >
                <MaestroIcon name="sliders" size={14} />
                <span>Filtros{activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ""}</span>
              </button>
            </div>
          </div>

          {/* Tira horizontal de atajos 1-toque */}
          <div
            className="pl-scr-quick-strip"
            role="group"
            aria-label="Atajos de exploración"
            data-finder-quick-chips=""
          >
            {QUICK_CHIPS.map((chip) => {
              const active = preset === chip.id && activeViewId === null;
              return (
                <button
                  key={chip.id}
                  type="button"
                  data-finder-chip={chip.id}
                  aria-pressed={active}
                  onClick={() => applyQuickPreset(chip.id)}
                  className={`pl-scr-quick-chip ${active ? "is-on" : ""}`.trim()}
                >
                  {chip.label}
                </button>
              );
            })}

            {activeAdvancedCount > 0 ? (
              <button
                type="button"
                className="pl-scr-clear-chip"
                onClick={resetAllFilters}
              >
                <MaestroIcon name="x" size={12} />
                <span>Limpiar ({activeAdvancedCount})</span>
              </button>
            ) : null}
          </div>

          {/* Panel de filtros inline en Tablet/Desktop (>= 768 px) */}
          <section
            id="pl-finder-advanced-panel"
            className="pl-scr-desktop-filters"
            aria-label="Filtros avanzados del buscador"
          >
            {renderFilterControls(false)}
          </section>

          {/* Listado de resultados (Por partido / Por mercado / Lista plana) */}
          {rows.length === 0 ? (
            <div className="pl-scr-empty" data-screener-empty="">
              <p className="m-0 text-sm font-semibold">
                {timing === "live"
                  ? "No hay partidos en vivo con picks activos en este momento."
                  : "No hay picks que coincidan con los filtros seleccionados."}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {timing === "live" ? (
                  <button
                    type="button"
                    className="pl-btn-primary text-xs min-h-11 px-4"
                    onClick={() => setTiming("upcoming")}
                  >
                    Ver próximos picks
                  </button>
                ) : null}
                {activeAdvancedCount > 0 ? (
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-11 px-4"
                    onClick={resetAllFilters}
                  >
                    Quitar filtros
                  </button>
                ) : null}
              </div>
            </div>
          ) : groupMode === "match" ? (
            <div className="pl-scr-groups" data-screener-view="match">
              {groupedByMatch.map(({ game, liveEntry, items }) => {
                const isCollapsed = collapsedGroups.has(`m:${game.id}`);
                const href = canonicalGameHref(game.league, game);
                const liveScore = liveEntry?.score ?? game.score;
                const liveClock = liveEntry?.clock ?? (game.status === "LIVE" ? "En vivo" : null);

                return (
                  <section
                    key={game.id}
                    className="pl-scr-group"
                    data-screener-match-group={game.id}
                  >
                    <header className="pl-scr-group-head">
                      <button
                        type="button"
                        className="pl-scr-group-toggle"
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleGroupCollapse(`m:${game.id}`)}
                      >
                        <LeagueBadge
                          league={game.league}
                          label={game.leagueLabel}
                          logoUrl={game.leagueLogoUrl}
                          size={16}
                        />
                        <div className="pl-scr-group-meta min-w-0">
                          <strong className="pl-scr-group-title truncate">
                            {game.home.shortName} vs {game.away.shortName}
                          </strong>
                          <span className="pl-scr-group-sub num">
                            {game.leagueLabel} ·{" "}
                            {liveScore && liveClock
                              ? `${liveScore.home}–${liveScore.away} · ${liveClock}`
                              : `${game.dayLabel} ${game.kickoffLocal}`}
                          </span>
                        </div>
                        <span className="pl-scr-group-count num">
                          {items.length} {items.length === 1 ? "pick" : "picks"}
                        </span>
                        <MaestroIcon
                          name="chevronDown"
                          size={15}
                          className={`pl-ev-group-chev ${isCollapsed ? "is-collapsed" : ""}`.trim()}
                        />
                      </button>

                      <a
                        href={href}
                        className="pl-scr-group-link min-h-11 sm:min-h-9 inline-flex items-center"
                        onPointerEnter={() => prefetchRoute(href)}
                        onTouchStart={() => prefetchRoute(href)}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(href);
                        }}
                      >
                        <span>Ficha</span>
                        <MaestroIcon name="arrowRight" size={12} />
                      </a>
                    </header>

                    {!isCollapsed ? (
                      <div className="pl-scr-terminal" role="list" aria-label={`Picks de ${game.home.shortName} vs ${game.away.shortName}`}>
                        <div className="pl-scr-terminal-head" aria-hidden="true">
                          <span>Pick y probabilidad</span>
                          <span>Evidencia</span>
                          <span>Cuota y valor</span>
                          <span className="text-right">Acciones</span>
                        </div>
                        {items.map((item) => (
                          <ScreenerPickRow
                            key={item.pick.id}
                            item={item}
                            unlocked={isPickUnlocked(item.pick, item.game.status, viewerRole)}
                            oddsFormat={oddsFormat}
                            showMatchMeta={false}
                            manualRaw={manualOddsByPick[item.pick.id] ?? ""}
                            isManualOpen={openManualPickId === item.pick.id}
                            onOpenManual={handleOpenManual}
                            onManualChange={handleManualChange}
                            onOpenBuilder={handleOpenBuilder}
                            onOpenSeal={openComposer}
                            onPrefetch={prefetchRoute}
                            onNavigate={navigateTo}
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : groupMode === "market" ? (
            <div className="pl-scr-groups" data-screener-view="market">
              {groupedByMarket.map((grp) => {
                const isCollapsed = collapsedGroups.has(`k:${grp.key}`);
                return (
                  <section
                    key={grp.key}
                    className="pl-scr-group"
                    data-screener-market-group={grp.key}
                  >
                    <header className="pl-scr-group-head">
                      <button
                        type="button"
                        className="pl-scr-group-toggle"
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleGroupCollapse(`k:${grp.key}`)}
                      >
                        <strong className="pl-scr-group-title">{grp.label}</strong>
                        <span className="pl-scr-group-count num">
                          {grp.items.length} {grp.items.length === 1 ? "pick" : "picks"}
                        </span>
                        <MaestroIcon
                          name="chevronDown"
                          size={15}
                          className={`pl-ev-group-chev ${isCollapsed ? "is-collapsed" : ""}`.trim()}
                        />
                      </button>
                    </header>

                    {!isCollapsed ? (
                      <div className="pl-scr-terminal" role="list" aria-label={`Picks de ${grp.label}`}>
                        <div className="pl-scr-terminal-head" aria-hidden="true">
                          <span>Partido y pick</span>
                          <span>Evidencia</span>
                          <span>Cuota y valor</span>
                          <span className="text-right">Acciones</span>
                        </div>
                        {grp.items.map((item) => (
                          <ScreenerPickRow
                            key={item.pick.id}
                            item={item}
                            unlocked={isPickUnlocked(item.pick, item.game.status, viewerRole)}
                            oddsFormat={oddsFormat}
                            showMatchMeta
                            manualRaw={manualOddsByPick[item.pick.id] ?? ""}
                            isManualOpen={openManualPickId === item.pick.id}
                            onOpenManual={handleOpenManual}
                            onManualChange={handleManualChange}
                            onOpenBuilder={handleOpenBuilder}
                            onOpenSeal={openComposer}
                            onPrefetch={prefetchRoute}
                            onNavigate={navigateTo}
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <section className="pl-scr-group" data-screener-view="flat">
              <div className="pl-scr-terminal" role="list" aria-label={`${rows.length} picks`}>
                <div className="pl-scr-terminal-head" aria-hidden="true">
                  <span>Partido y pick</span>
                  <span>Evidencia</span>
                  <span>Cuota y valor</span>
                  <span className="text-right">Acciones</span>
                </div>
                {visibleRows.map((item) => (
                  <ScreenerPickRow
                    key={item.pick.id}
                    item={item}
                    unlocked={isPickUnlocked(item.pick, item.game.status, viewerRole)}
                    oddsFormat={oddsFormat}
                    showMatchMeta
                    manualRaw={manualOddsByPick[item.pick.id] ?? ""}
                    isManualOpen={openManualPickId === item.pick.id}
                    onOpenManual={handleOpenManual}
                    onManualChange={handleManualChange}
                    onOpenBuilder={handleOpenBuilder}
                    onOpenSeal={openComposer}
                    onPrefetch={prefetchRoute}
                    onNavigate={navigateTo}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Paginación progresiva (< 1,500 nodos DOM iniciales) */}
          {rows.length > shown ? (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                className="pl-btn-glass text-sm min-h-11 px-5 num"
                onClick={() => setShown((n) => n + PICKS_PAGE_STEP)}
              >
                Ver más ({rows.length - shown})
              </button>
            </div>
          ) : null}
        </div>

        {/* Hoja inferior nativa de filtros avanzados en móvil (montaje condicional ADR-051) */}
        {mobileSheetOpen ? (
          <MobileFiltersSheet
            resultCount={rows.length}
            onReset={resetAllFilters}
            onClose={() => setMobileSheetOpen(false)}
          >
            {renderFilterControls(true)}
          </MobileFiltersSheet>
        ) : null}

        {/* Bet Builder Drawer 1-clic (montaje condicional 0 DOM cuando está cerrado) */}
        {builderTarget ? (
          <BetBuilderDrawer
            open={Boolean(builderTarget)}
            pick={builderTarget.pick}
            game={builderTarget.game}
            onClose={() => setBuilderTarget(null)}
          />
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
