"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import type { LeagueId, PlatformSport } from "@pitchlab/contracts";
import { parseStrictFiniteNumber, sportScoringUnit } from "@pitchlab/contracts";
import { Button } from "../../../components/ui/primitives";
import { TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { DrawerErrorBoundary } from "../../components/DrawerErrorBoundary";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  MarketCategoryIcon,
  type MarketCategoryIconName,
} from "../../components/PackSportIcons";
import { useSheetSwipeDismiss } from "../../components/use-sheet-swipe-dismiss";
import { useAbortableJson, useMediaQuery, useSafeEffect } from "../../hooks";
import type {
  CatalogPickItem,
  PickLabMatchBar,
  PickLabResponsePayload,
} from "../../picks-catalog";
import { useOptionalPlatformCore } from "../../platform-provider";
import type { OddsFormat, PlatformGame } from "../../types";
import { PersonAvatar } from "../team/PersonAvatar";

export interface PickLabCustomSelection {
  readonly metricKey: string;
  readonly direction: "over" | "under";
  readonly line: number;
  readonly label: string;
  readonly oddsDecimal?: number | null;
}

export interface PickEvidenceLabDrawerProps {
  readonly open: boolean;
  readonly pick: CatalogPickItem | null;
  readonly game: PlatformGame | null;
  readonly relatedPicks?: readonly CatalogPickItem[];
  readonly onClose: () => void;
  readonly onSelectRelatedPick?: (pick: CatalogPickItem) => void;
  readonly onAddToParlay?: (pick: CatalogPickItem) => void;
  readonly onSealPick?: (pick: CatalogPickItem, customSpec?: PickLabCustomSelection) => void;
  readonly labDataOverride?: PickLabResponsePayload | null;
}

interface LabMetricOption {
  readonly key: string;
  readonly label: string;
  readonly unitLabel: string;
  readonly defaultLine: number;
  readonly lines: readonly number[];
}

interface LabUiState {
  readonly pickId: string;
  readonly metricKey: string | null;
  readonly direction: "over" | "under" | null;
  readonly line: number | null;
  readonly rivalFilter: string;
  readonly perspective: "for" | "against";
  readonly leagueFilter: string;
  readonly sampleWindow: 5 | 10 | 20;
  readonly venueFilter: "all" | "home" | "away";
  readonly activeBarId: string | null;
  readonly chartTableOpen: boolean;
}

interface LabSeriesSummary {
  readonly hits: number;
  readonly pushes: number;
  readonly misses: number;
  readonly evaluated: number;
  readonly total: number;
  readonly hitRatePct: number | null;
  readonly mean: number | null;
  readonly median: number | null;
}

interface LabHistoryRow {
  readonly id: string;
  readonly dateLabel: string;
  readonly matchLabel: string;
  readonly scoreLabel: string;
  readonly gf: number;
  readonly gc: number;
  readonly result: "W" | "D" | "L";
}

type BarOutcome = "hit" | "push" | "miss";

const FOOTBALL_TEAM_METRICS: readonly LabMetricOption[] = [
  { key: "goals", label: "Goles", unitLabel: "goles", defaultLine: 1.5, lines: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] },
  { key: "corners", label: "Córners", unitLabel: "córners", defaultLine: 4.5, lines: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5] },
  { key: "shots", label: "Tiros", unitLabel: "tiros", defaultLine: 10.5, lines: [6.5, 8.5, 10.5, 12.5, 14.5, 16.5] },
  { key: "shots_on_target", label: "Tiros a puerta", unitLabel: "tiros a puerta", defaultLine: 3.5, lines: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5] },
  { key: "cards", label: "Tarjetas", unitLabel: "tarjetas", defaultLine: 2.5, lines: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] },
  { key: "fouls", label: "Faltas", unitLabel: "faltas", defaultLine: 10.5, lines: [7.5, 9.5, 11.5, 13.5, 15.5] },
];

const FOOTBALL_PLAYER_METRICS: readonly LabMetricOption[] = [
  { key: "shots", label: "Tiros", unitLabel: "tiros", defaultLine: 1.5, lines: [0.5, 1.5, 2.5, 3.5, 4.5] },
  { key: "shots_on_target", label: "Tiros a puerta", unitLabel: "tiros a puerta", defaultLine: 0.5, lines: [0.5, 1.5, 2.5, 3.5] },
  { key: "goal_or_assist", label: "Gol o asistencia", unitLabel: "G+A", defaultLine: 0.5, lines: [0.5, 1.5] },
  { key: "fouls", label: "Faltas", unitLabel: "faltas", defaultLine: 0.5, lines: [0.5, 1.5, 2.5] },
  { key: "cards", label: "Tarjetas", unitLabel: "tarjetas", defaultLine: 0.5, lines: [0.5, 1.5] },
];

const NBA_METRICS: readonly LabMetricOption[] = [
  { key: "PTS", label: "PTS", unitLabel: "pts", defaultLine: 19.5, lines: [9.5, 14.5, 19.5, 24.5, 29.5, 34.5] },
  { key: "REB", label: "REB", unitLabel: "reb", defaultLine: 6.5, lines: [3.5, 5.5, 7.5, 9.5, 11.5] },
  { key: "AST", label: "AST", unitLabel: "ast", defaultLine: 4.5, lines: [2.5, 4.5, 6.5, 8.5, 10.5] },
  { key: "3PM", label: "3PM", unitLabel: "triples", defaultLine: 2.5, lines: [0.5, 1.5, 2.5, 3.5, 4.5] },
];

const MLB_METRICS: readonly LabMetricOption[] = [
  { key: "runs", label: "Carreras", unitLabel: "carreras", defaultLine: 7.5, lines: [5.5, 6.5, 7.5, 8.5, 9.5, 10.5] },
  { key: "f5_runs", label: "Carreras F5", unitLabel: "carreras", defaultLine: 4.5, lines: [2.5, 3.5, 4.5, 5.5] },
];

const NHL_METRICS: readonly LabMetricOption[] = [
  { key: "goals", label: "Goles", unitLabel: "goles", defaultLine: 5.5, lines: [4.5, 5.5, 6.5, 7.5] },
  { key: "shots_on_target", label: "Tiros a puerta", unitLabel: "tiros", defaultLine: 28.5, lines: [24.5, 26.5, 28.5, 30.5, 32.5] },
];

const NFL_METRICS: readonly LabMetricOption[] = [
  { key: "points", label: "Puntos", unitLabel: "pts", defaultLine: 44.5, lines: [38.5, 41.5, 44.5, 47.5, 50.5] },
  { key: "team_points", label: "Puntos equipo", unitLabel: "pts", defaultLine: 21.5, lines: [17.5, 20.5, 23.5, 26.5] },
];

const MAX_AUDITABLE_EV_PCT = 20;

const LAB_METRIC_ICON_MAP: Readonly<Record<string, MarketCategoryIconName>> = {
  goals: "over-under",
  corners: "corners",
  shots: "shots",
  shots_on_target: "shots-on-target",
  cards: "total-cards",
  fouls: "fouls",
  goal_or_assist: "expected-assists",
  PTS: "basketball-points",
  REB: "basketball-rebounds",
  AST: "basketball-assists",
  "3PM": "basketball-three-pointers",
  runs: "baseball-total-runs",
  f5_runs: "baseball-first-five",
  points: "american-football-total-points",
  team_points: "team-goals",
};

const LAB_UNIT_TOKEN_RE =
  /\b(?:goles?|puntos?|pts|carreras?|c[oó]rners?|tiros?(?:\s+a\s+puerta)?|remates?|tarjetas?|amarillas?|faltas?|rebotes?|reb|asistencias?|ast|triples?|3pm|g\+a|atajadas?|yardas?|touchdowns?)\b/i;

const LAB_BARE_OVER_UNDER_RE =
  /(\b(?:m[aá]s\s+de|menos\s+de|over|under)\s+\d+(?:[.,]\d+)?)(?=\s*(?:$|[()·|—,-]))/gi;

function resolveLabMetricIconName(metricKey: string): MarketCategoryIconName | undefined {
  return LAB_METRIC_ICON_MAP[metricKey];
}

function resolveLabUnitForPick(
  family: string,
  sport: PlatformSport,
  statLabel?: string | null,
): string {
  if (statLabel && statLabel.trim().length > 0) {
    return statLabel.trim().toLowerCase();
  }
  const fam = family.toLowerCase();
  if (fam.includes("corner")) return "córners";
  if (fam.includes("shots_on_target") || fam.includes("sot")) return "tiros a puerta";
  if (fam.includes("shot")) return "tiros";
  if (fam.includes("card") || fam.includes("yellow")) return "tarjetas";
  if (fam.includes("foul")) return "faltas";
  return sportScoringUnit(sport).plural;
}

function ensureLabPickLabelUnit(
  label: string,
  family: string,
  sport: PlatformSport,
  statLabel?: string | null,
): string {
  const trimmed = label.trim();
  if (!trimmed || LAB_UNIT_TOKEN_RE.test(trimmed)) return trimmed;
  const unit = resolveLabUnitForPick(family, sport, statLabel);
  return trimmed.replace(LAB_BARE_OVER_UNDER_RE, `$1 ${unit}`);
}

function createInitialUiState(pickId: string): LabUiState {
  return {
    pickId,
    metricKey: null,
    direction: null,
    line: null,
    rivalFilter: "all",
    perspective: "for",
    leagueFilter: "all",
    sampleWindow: 10,
    venueFilter: "all",
    activeBarId: null,
    chartTableOpen: false,
  };
}

function normalizeMetricKey(raw: string, sport?: PlatformSport): string {
  const clean = raw.trim().toLowerCase();
  if (clean === "pts") return "PTS";
  if (clean === "reb") return "REB";
  if (clean === "ast") return "AST";
  if (clean === "3pm") return "3PM";
  if (clean.includes("f5") && clean.includes("run")) return "f5_runs";
  if (
    clean === "runs" ||
    clean === "runs_for" ||
    clean === "total_runs" ||
    clean.includes("run") ||
    clean.includes("carrera")
  ) {
    return "runs";
  }
  if (clean === "team_points" || (clean === "points_for" && sport === "american-football")) {
    return "team_points";
  }
  if (
    clean === "points" ||
    clean === "points_for" ||
    clean === "total_points" ||
    clean.includes("point") ||
    clean.includes("punto")
  ) {
    return sport === "basketball" ? "PTS" : "points";
  }
  if (clean.includes("corner")) return "corners";
  if (clean.includes("sot") || clean.includes("shots_on_target") || clean.includes("puerta")) {
    return "shots_on_target";
  }
  if (clean.includes("shot") || clean.includes("tiro")) return "shots";
  if (clean.includes("card") || clean.includes("tarjeta") || clean.includes("amarilla")) return "cards";
  if (clean.includes("foul") || clean.includes("falta")) return "fouls";
  if (clean.includes("goal_or_assist")) return "goal_or_assist";
  if (clean === "total_goals" || clean.includes("goal") || clean.includes("gol")) return "goals";
  return raw.trim();
}

function inferMetricKeyFromPick(pick: CatalogPickItem): string {
  if (pick.playerMeta) {
    return pick.playerMeta.statKey;
  }
  const family = String(pick.family).toLowerCase();
  const axis = String(pick.axis).toLowerCase();
  const hay = `${family} ${axis} ${pick.familyLabel.toLowerCase()} ${pick.label.toLowerCase()}`;
  if (pick.sport === "basketball") {
    if (hay.includes("reb")) return "REB";
    if (hay.includes("ast")) return "AST";
    if (hay.includes("3pm") || hay.includes("triple")) return "3PM";
    return "PTS";
  }
  if (pick.sport === "baseball") {
    return hay.includes("f5") ? "f5_runs" : "runs";
  }
  if (pick.sport === "american-football") {
    return hay.includes("team") ? "team_points" : "points";
  }
  if (hay.includes("corner") || hay.includes("esquina")) return "corners";
  if (hay.includes("sot") || hay.includes("puerta")) return "shots_on_target";
  if (hay.includes("shot") || hay.includes("tiro")) return "shots";
  if (hay.includes("card") || hay.includes("tarjeta") || hay.includes("amarilla")) return "cards";
  if (hay.includes("foul") || hay.includes("falta")) return "fouls";
  return "goals";
}

function inferDirectionFromPick(pick: CatalogPickItem): "over" | "under" {
  if (pick.direction === "under") return "under";
  if (pick.direction === "over") return "over";
  const lower = pick.label.toLowerCase();
  if (lower.includes("menos de") || lower.includes("under")) return "under";
  return "over";
}

function getMetricCatalog(
  sport: PlatformSport,
  entityKind: "player" | "team" | "match",
  activeKey: string,
  activeLabel: string,
  defaultLine: number,
  availableLines: readonly number[],
): readonly LabMetricOption[] {
  const baseList: readonly LabMetricOption[] =
    sport === "basketball"
      ? NBA_METRICS
      : sport === "baseball"
        ? MLB_METRICS
        : sport === "ice-hockey"
          ? NHL_METRICS
          : sport === "american-football"
            ? NFL_METRICS
            : entityKind === "player"
              ? FOOTBALL_PLAYER_METRICS
              : FOOTBALL_TEAM_METRICS;

  const normalizedActive = normalizeMetricKey(activeKey, sport);
  const exists = baseList.some((opt) => opt.key === normalizedActive);
  if (exists) {
    return baseList.map((opt) => {
      if (opt.key !== normalizedActive) return opt;
      const mergedLines = mergeSortedLines(
        availableLines.length > 0 ? availableLines : opt.lines,
        defaultLine,
      );
      return {
        ...opt,
        label: activeLabel || opt.label,
        defaultLine,
        lines: mergedLines,
      };
    });
  }
  const fallbackLines = mergeSortedLines(
    availableLines.length > 0 ? availableLines : buildCenteredLines(defaultLine),
    defaultLine,
  );
  return [
    {
      key: normalizedActive,
      label: activeLabel || normalizedActive,
      unitLabel: activeLabel.toLowerCase(),
      defaultLine,
      lines: fallbackLines,
    },
    ...baseList,
  ];
}

function buildCenteredLines(center: number): readonly number[] {
  const safe = Number.isFinite(center) && center >= 0 ? center : 1.5;
  const step = safe >= 15 ? 2 : 1;
  const lines: number[] = [];
  for (let i = -2; i <= 3; i += 1) {
    const candidate = Math.round((safe + i * step) * 10) / 10;
    if (candidate >= 0.5) {
      lines.push(candidate);
    }
  }
  return lines.length > 0 ? lines : [0.5, 1.5, 2.5, 3.5];
}

function mergeSortedLines(lines: readonly number[], extraLine: number): readonly number[] {
  const set = new Set<number>();
  for (const val of lines) {
    if (Number.isFinite(val) && val >= 0) {
      set.add(Math.round(val * 10) / 10);
    }
  }
  if (Number.isFinite(extraLine) && extraLine >= 0) {
    set.add(Math.round(extraLine * 10) / 10);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function formatNumeric(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function classifyBarOutcome(
  value: number,
  line: number,
  direction: "over" | "under",
): BarOutcome {
  if (!Number.isFinite(value) || !Number.isFinite(line)) return "miss";
  if (Math.abs(value - line) < 1e-6) return "push";
  if (direction === "over") {
    return value > line ? "hit" : "miss";
  }
  return value < line ? "hit" : "miss";
}

function computeSeriesSummary(
  bars: readonly PickLabMatchBar[],
  line: number,
  direction: "over" | "under",
): LabSeriesSummary {
  const total = bars.length;
  if (total === 0) {
    return {
      hits: 0,
      pushes: 0,
      misses: 0,
      evaluated: 0,
      total: 0,
      hitRatePct: null,
      mean: null,
      median: null,
    };
  }
  let hits = 0;
  let pushes = 0;
  let misses = 0;
  let sum = 0;
  const values: number[] = [];
  for (const bar of bars) {
    const val = Number.isFinite(bar.value) ? bar.value : 0;
    values.push(val);
    sum += val;
    const outcome = classifyBarOutcome(val, line, direction);
    if (outcome === "hit") hits += 1;
    else if (outcome === "push") pushes += 1;
    else misses += 1;
  }
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const rawMedian =
    values.length % 2 === 1
      ? (values[mid] ?? 0)
      : ((values[mid - 1] ?? 0) + (values[mid] ?? 0)) / 2;
  const evaluated = total - pushes;
  return {
    hits,
    pushes,
    misses,
    evaluated,
    total,
    hitRatePct: evaluated > 0 ? Math.round((hits / evaluated) * 100) : null,
    mean: Math.round((sum / total) * 10) / 10,
    median: Math.round(rawMedian * 10) / 10,
  };
}

function toneClassForRate(pct: number | null): string {
  if (pct === null) return "";
  if (pct >= 65) return "is-pos";
  if (pct >= 45) return "is-warn";
  return "is-neg";
}

function deriveHistoryFromBars(
  bars: readonly PickLabMatchBar[],
  entityShort: string,
): readonly LabHistoryRow[] {
  const rows: LabHistoryRow[] = [];
  for (const bar of bars) {
    if (
      typeof bar.gf === "number" &&
      Number.isFinite(bar.gf) &&
      typeof bar.gc === "number" &&
      Number.isFinite(bar.gc)
    ) {
      const result: "W" | "D" | "L" = bar.gf > bar.gc ? "W" : bar.gf < bar.gc ? "L" : "D";
      const matchLabel = bar.isHome
        ? `${entityShort} – ${bar.opponentShort}`
        : `${bar.opponentShort} – ${entityShort}`;
      const scoreLabel = bar.scoreLabel ?? `${bar.gf}–${bar.gc}`;
      rows.push({
        id: bar.id,
        dateLabel: bar.dateLabel,
        matchLabel,
        scoreLabel,
        gf: bar.gf,
        gc: bar.gc,
        result,
      });
    }
  }
  return rows.slice(-8).reverse();
}

function deriveBarsForMetric(
  baseMetricKey: string,
  selectedMetricKey: string,
  perspective: "for" | "against",
  entityKind: "player" | "team" | "match",
  barsFor: readonly PickLabMatchBar[],
  barsAgainst: readonly PickLabMatchBar[],
  sport?: PlatformSport,
): { readonly bars: readonly PickLabMatchBar[]; readonly hasRealSeries: boolean } {
  const rawSeries = perspective === "against" ? barsAgainst : barsFor;
  if (normalizeMetricKey(selectedMetricKey, sport) === normalizeMetricKey(baseMetricKey, sport)) {
    return { bars: rawSeries, hasRealSeries: rawSeries.length > 0 };
  }
  if (normalizeMetricKey(selectedMetricKey, sport) === "goals" && entityKind !== "player") {
    const source = barsFor.length > 0 ? barsFor : barsAgainst;
    const derived: PickLabMatchBar[] = [];
    for (const bar of source) {
      const gf = typeof bar.gf === "number" && Number.isFinite(bar.gf) ? bar.gf : null;
      const gc = typeof bar.gc === "number" && Number.isFinite(bar.gc) ? bar.gc : null;
      if (entityKind === "match") {
        if (gf !== null && gc !== null) {
          derived.push({ ...bar, value: gf + gc });
        }
      } else if (perspective === "against") {
        if (gc !== null) {
          derived.push({ ...bar, value: gc });
        }
      } else if (gf !== null) {
        derived.push({ ...bar, value: gf });
      }
    }
    return { bars: derived, hasRealSeries: derived.length > 0 };
  }
  return { bars: [], hasRealSeries: false };
}

function isPointerOutsideElement(event: PointerEvent, el: HTMLElement | null): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return (
    event.clientX < r.left ||
    event.clientX > r.right ||
    event.clientY < r.top ||
    event.clientY > r.bottom
  );
}

function resultAriaLabel(result: "W" | "D" | "L"): string {
  if (result === "W") return "Victoria";
  if (result === "D") return "Empate";
  return "Derrota";
}

function outcomeStatusText(outcome: BarOutcome, line: number, direction: "over" | "under"): string {
  const lineStr = formatNumeric(line);
  if (outcome === "push") return `Igualó línea ${lineStr} (push)`;
  if (outcome === "hit") {
    return direction === "over" ? `Superó línea ${lineStr}` : `Debajo de línea ${lineStr}`;
  }
  return direction === "over" ? `No alcanzó línea ${lineStr}` : `Superó línea ${lineStr}`;
}

export function PickEvidenceLabDrawer({
  open,
  pick,
  game,
  relatedPicks = [],
  onClose,
  onSelectRelatedPick,
  onAddToParlay,
  onSealPick,
  labDataOverride = null,
}: PickEvidenceLabDrawerProps): React.JSX.Element | null {
  const platformCore = useOptionalPlatformCore();
  const oddsFormat: OddsFormat = platformCore?.oddsFormat ?? "decimal";

  const uid = useId().replace(/:/g, "");
  const titleId = `${uid}-title`;
  const historyCaptionId = `${uid}-history-cap`;
  const chartTableCaptionId = `${uid}-chart-table-cap`;

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isMobileViewport = useMediaQuery("(max-width: 1023px)", false);

  const pickId = pick?.id ?? "";
  const [uiState, setUiState] = useState<LabUiState>(() => createInitialUiState(pickId));
  const [expandedRelatedIds, setExpandedRelatedIds] = useState<Readonly<Record<string, boolean>>>({});

  const activeUi: LabUiState =
    uiState.pickId === pickId ? uiState : createInitialUiState(pickId);

  const updateUi = (updater: (prev: LabUiState) => LabUiState) => {
    setUiState((prev) => {
      const base = prev.pickId === pickId ? prev : createInitialUiState(pickId);
      return updater(base);
    });
  };

  const requestUrl =
    open && pick && !labDataOverride
      ? `/api/picks/lab/${encodeURIComponent(pick.id)}`
      : null;

  const {
    data: fetchedLabData,
    loading: labLoading,
    error: labError,
  } = useAbortableJson<PickLabResponsePayload>(requestUrl, {
    enabled: open && Boolean(pick) && !labDataOverride,
  });

  const resolvedLabData: PickLabResponsePayload | null =
    labDataOverride ??
    (fetchedLabData && pick && fetchedLabData.pick.id === pick.id ? fetchedLabData : null);

  const [settledUrl, setSettledUrl] = useState<string | null>(null);
  const loadingUrlRef = useRef<string | null>(null);

  useSafeEffect(() => {
    if (!requestUrl) {
      loadingUrlRef.current = null;
      setSettledUrl(null);
      return;
    }
    if (typeof fetch !== "function") {
      setSettledUrl(requestUrl);
      return;
    }
    if (labLoading) {
      loadingUrlRef.current = requestUrl;
      return;
    }
    if (loadingUrlRef.current === requestUrl || resolvedLabData !== null) {
      setSettledUrl(requestUrl);
    }
  }, [labLoading, requestUrl, resolvedLabData]);

  const isLabSkeletonVisible =
    !resolvedLabData &&
    (labLoading || (Boolean(requestUrl) && settledUrl !== requestUrl));
  const currentLabError =
    requestUrl && settledUrl === requestUrl && !labLoading ? labError : null;

  const swipe = useSheetSwipeDismiss({
    onDismiss: () => onCloseRef.current(),
    disabled: !open || !isMobileViewport,
    scrollContainerRef: bodyScrollRef,
    dragHandleSelector: ".pl-sheet-drag-zone",
  });

  const isDialogActive = open && Boolean(pickId);

  useSafeEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    let isDisposing = false;

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

    if (!isDialogActive) {
      isDisposing = true;
      closeDialogSafely();
      return undefined;
    }

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
      if (isDisposing || dialog.open) return;
      dialog.returnValue = "";
      onCloseRef.current();
    };

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);

    const handleEscapeFallback = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      if (!dialog.open && !dialog.hasAttribute("open")) return;
      const isNativeModal =
        typeof dialog.matches === "function" ? dialog.matches(":modal") : false;
      if (isNativeModal) return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleEscapeFallback);

    let cleanupLightDismiss: (() => void) | undefined;
    if (
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype)
    ) {
      let pressedOutside = false;
      const isOutsidePanel = (event: PointerEvent): boolean => {
        if (event.target !== dialog) return false;
        return isPointerOutsideElement(event, panelRef.current ?? dialog);
      };
      const onPointerDown = (event: PointerEvent) => {
        pressedOutside = isOutsidePanel(event);
      };
      const onPointerUp = (event: PointerEvent) => {
        if (pressedOutside && isOutsidePanel(event)) {
          pressedOutside = false;
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
          onCloseRef.current();
          return;
        }
        pressedOutside = false;
      };

      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      isDisposing = true;
      window.removeEventListener("keydown", handleEscapeFallback);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      cleanupLightDismiss?.();
      closeDialogSafely();
    };
  }, [isDialogActive]);

  const activePick: CatalogPickItem | null = resolvedLabData?.pick ?? pick;

  const mergedRelatedPicks = useMemo(() => {
    const map = new Map<string, CatalogPickItem>();
    for (const item of resolvedLabData?.relatedPicks ?? []) {
      map.set(item.id, item);
    }
    for (const item of relatedPicks) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    if (activePick) {
      map.delete(activePick.id);
    }
    return Array.from(map.values());
  }, [activePick, relatedPicks, resolvedLabData?.relatedPicks]);

  const baseMetricKey = useMemo(() => {
    const sport = activePick?.sport;
    if (resolvedLabData?.metricKey) return normalizeMetricKey(resolvedLabData.metricKey, sport);
    if (activePick) return normalizeMetricKey(inferMetricKeyFromPick(activePick), sport);
    return "goals";
  }, [activePick, resolvedLabData?.metricKey]);

  const baseMetricLabel =
    resolvedLabData?.metricLabel ??
    activePick?.playerMeta?.statLabel ??
    activePick?.familyLabel ??
    "Métrica";

  const baseDirection: "over" | "under" =
    resolvedLabData?.defaultDirection ??
    (activePick ? inferDirectionFromPick(activePick) : "over");

  const baseLine: number =
    resolvedLabData?.defaultLine ??
    (activePick && typeof activePick.line === "number" && Number.isFinite(activePick.line)
      ? activePick.line
      : 1.5);

  const entityKind: "player" | "team" | "match" =
    resolvedLabData?.entityKind ?? (activePick?.playerMeta ? "player" : "team");

  const metricOptions = useMemo(() => {
    if (!activePick) return FOOTBALL_TEAM_METRICS;
    return getMetricCatalog(
      activePick.sport,
      entityKind,
      baseMetricKey,
      baseMetricLabel,
      baseLine,
      resolvedLabData?.availableLines ?? [],
    );
  }, [activePick, baseLine, baseMetricKey, baseMetricLabel, entityKind, resolvedLabData?.availableLines]);

  const selectedMetricKey = activeUi.metricKey ?? baseMetricKey;
  const activeMetricSpec =
    metricOptions.find((m) => m.key === selectedMetricKey) ?? metricOptions[0]!;
  const selectedDirection: "over" | "under" = activeUi.direction ?? baseDirection;
  const selectedLine: number =
    activeUi.line ??
    (selectedMetricKey === baseMetricKey ? baseLine : activeMetricSpec.defaultLine);

  const rawBarsFor = resolvedLabData?.barsFor ?? [];
  const rawBarsAgainst = resolvedLabData?.barsAgainst ?? [];

  const activeSport = activePick?.sport;

  const { bars: metricBars, hasRealSeries } = useMemo(
    () =>
      deriveBarsForMetric(
        baseMetricKey,
        selectedMetricKey,
        activeUi.perspective,
        entityKind,
        rawBarsFor,
        rawBarsAgainst,
        activeSport,
      ),
    [
      activeSport,
      activeUi.perspective,
      baseMetricKey,
      entityKind,
      rawBarsAgainst,
      rawBarsFor,
      selectedMetricKey,
    ],
  );

  const hasAgainstSeries = useMemo(
    () =>
      deriveBarsForMetric(
        baseMetricKey,
        selectedMetricKey,
        "against",
        entityKind,
        rawBarsFor,
        rawBarsAgainst,
        activeSport,
      ).bars.length > 0,
    [activeSport, baseMetricKey, entityKind, rawBarsAgainst, rawBarsFor, selectedMetricKey],
  );

  const rivalOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const bar of metricBars) {
      if (bar.opponentSlug && !map.has(bar.opponentSlug)) {
        map.set(bar.opponentSlug, bar.opponentName);
      }
    }
    return Array.from(map.entries()).map(([slug, name]) => ({ slug, name }));
  }, [metricBars]);

  const leagueOptions = useMemo(() => {
    const set = new Set<string>();
    for (const bar of metricBars) {
      if (bar.leagueLabel.trim().length > 0) {
        set.add(bar.leagueLabel.trim());
      }
    }
    return Array.from(set);
  }, [metricBars]);

  const filteredBars = useMemo(() => {
    const matching = metricBars.filter((bar) => {
      if (activeUi.rivalFilter !== "all" && bar.opponentSlug !== activeUi.rivalFilter) {
        return false;
      }
      if (activeUi.leagueFilter !== "all" && bar.leagueLabel !== activeUi.leagueFilter) {
        return false;
      }
      if (activeUi.venueFilter === "home" && !bar.isHome) {
        return false;
      }
      if (activeUi.venueFilter === "away" && bar.isHome) {
        return false;
      }
      return true;
    });
    return matching.slice(-activeUi.sampleWindow);
  }, [
    activeUi.leagueFilter,
    activeUi.rivalFilter,
    activeUi.sampleWindow,
    activeUi.venueFilter,
    metricBars,
  ]);

  const seriesSummary = useMemo(
    () => computeSeriesSummary(filteredBars, selectedLine, selectedDirection),
    [filteredBars, selectedDirection, selectedLine],
  );

  const matchedCatalogPick = useMemo(() => {
    if (!activePick) return null;
    if (
      activeUi.perspective === "for" &&
      selectedMetricKey === baseMetricKey &&
      selectedDirection === baseDirection &&
      Math.abs(selectedLine - baseLine) < 1e-6
    ) {
      return activePick;
    }
    if (activeUi.perspective !== "for") return null;
    for (const candidate of mergedRelatedPicks) {
      const candidateMetric = normalizeMetricKey(inferMetricKeyFromPick(candidate), candidate.sport);
      const candidateDir = inferDirectionFromPick(candidate);
      if (
        candidateMetric === selectedMetricKey &&
        candidateDir === selectedDirection &&
        typeof candidate.line === "number" &&
        Math.abs(candidate.line - selectedLine) < 1e-6
      ) {
        return candidate;
      }
    }
    return null;
  }, [
    activePick,
    activeUi.perspective,
    baseDirection,
    baseLine,
    baseMetricKey,
    mergedRelatedPicks,
    selectedDirection,
    selectedLine,
    selectedMetricKey,
  ]);

  if (!open || !activePick) return null;

  const league: LeagueId = resolvedLabData?.league ?? activePick.league;
  const leagueLabel = resolvedLabData?.leagueLabel ?? activePick.leagueLabel;
  const matchLabel = resolvedLabData?.matchLabel ?? activePick.matchLabel;
  const matchParts = matchLabel.split(/\s+vs\.?\s+/i);

  const homeTeam = resolvedLabData?.homeTeam ?? {
    slug: game?.home.slug ?? "local",
    name: game?.home.name ?? matchParts[0]?.trim() ?? "Local",
    shortName: game?.home.shortName ?? game?.home.code ?? (matchParts[0]?.trim().slice(0, 3).toUpperCase() || "LOC"),
  };
  const awayTeam = resolvedLabData?.awayTeam ?? {
    slug: game?.away.slug ?? "visita",
    name: game?.away.name ?? matchParts[1]?.trim() ?? "Visita",
    shortName: game?.away.shortName ?? game?.away.code ?? (matchParts[1]?.trim().slice(0, 3).toUpperCase() || "VIS"),
  };

  const entityName =
    resolvedLabData?.entityName ??
    (activePick.playerMeta
      ? activePick.playerMeta.playerName
      : homeTeam.name);
  const entitySubtitle =
    resolvedLabData?.entitySubtitle ??
    (activePick.playerMeta
      ? `${activePick.playerMeta.teamName} · ${activePick.playerMeta.position} · ${leagueLabel}`
      : `${leagueLabel} · ${activePick.kickoffLocal}`);
  const entityPhotoKey =
    resolvedLabData?.entityPhotoKey ?? activePick.playerMeta?.photoKey ?? null;
  const entityTeamSlug =
    resolvedLabData?.entityTeamSlug ??
    activePick.playerMeta?.teamSlug ??
    (activePick.playerMeta?.teamSide === "away" ? awayTeam.slug : homeTeam.slug);
  const entityShort =
    entityTeamSlug === awayTeam.slug ? awayTeam.shortName : homeTeam.shortName;

  const recentHistory: readonly LabHistoryRow[] =
    resolvedLabData && resolvedLabData.recentHistory.length > 0
      ? resolvedLabData.recentHistory
      : deriveHistoryFromBars(rawBarsFor, entityShort);

  const maxObserved = filteredBars.reduce(
    (acc, bar) => (Number.isFinite(bar.value) && bar.value > acc ? bar.value : acc),
    0,
  );
  const chartCeiling = Math.max(selectedLine * 1.28, maxObserved * 1.12, 1);
  const thresholdPct = Math.max(
    4,
    Math.min(96, Math.round((selectedLine / chartCeiling) * 1000) / 10),
  );
  const yTicks = [
    formatNumeric(Math.round(chartCeiling * 10) / 10),
    formatNumeric(Math.round(chartCeiling * 0.66 * 10) / 10),
    formatNumeric(Math.round(chartCeiling * 0.33 * 10) / 10),
    "0",
  ];

  const inspectedBar =
    filteredBars.find((bar) => bar.id === activeUi.activeBarId) ??
    filteredBars[filteredBars.length - 1] ??
    null;

  const isCustomSpec = matchedCatalogPick === null;
  const builtSelectionLabel = `${selectedDirection === "over" ? "Más de" : "Menos de"} ${formatNumeric(selectedLine)} ${activeMetricSpec.unitLabel}`;
  const displayActivePickLabel = ensureLabPickLabelUnit(
    activePick.label,
    activePick.family,
    activePick.sport,
    activePick.playerMeta?.statLabel ?? null,
  );
  const isFinished = activePick.gameStatus === "FT";
  const isLive = activePick.gameStatus === "LIVE";

  const activePricing = matchedCatalogPick?.pricing ?? null;
  const activeHouseOdds =
    activePricing && activePricing.marketDecimal !== null
      ? formatOddsValue(activePricing.marketDecimal, oddsFormat)
      : null;
  const activeFairOdds = activePricing
    ? formatOddsValue(activePricing.fairOdds, oddsFormat)
    : null;
  const rawActiveEvPct =
    activePricing && activePricing.evPct !== null && Number.isFinite(activePricing.evPct)
      ? activePricing.evPct
      : null;
  const isActiveOutlierEv = rawActiveEvPct !== null && rawActiveEvPct > MAX_AUDITABLE_EV_PCT;
  const activeEvPct =
    rawActiveEvPct !== null && rawActiveEvPct > 0 && !isActiveOutlierEv ? rawActiveEvPct : null;

  const homeLogoUrl = game?.home.logoUrl;
  const awayLogoUrl = game?.away.logoUrl;
  const entityLogoUrl =
    entityTeamSlug === awayTeam.slug ? awayLogoUrl : homeLogoUrl;
  const activeMetricIconName = resolveLabMetricIconName(activeMetricSpec.key);

  const hasActiveFilters =
    activeUi.rivalFilter !== "all" ||
    activeUi.leagueFilter !== "all" ||
    activeUi.venueFilter !== "all" ||
    activeUi.perspective !== "for" ||
    activeUi.sampleWindow !== 10;

  const handleSelectMetric = (option: LabMetricOption) => {
    if (option.key === selectedMetricKey) return;
    if (option.key !== baseMetricKey && onSelectRelatedPick) {
      const relatedMatch = mergedRelatedPicks.find(
        (rel) => normalizeMetricKey(inferMetricKeyFromPick(rel), rel.sport) === option.key,
      );
      if (relatedMatch) {
        onSelectRelatedPick(relatedMatch);
        return;
      }
    }
    updateUi((prev) => ({
      ...prev,
      metricKey: option.key,
      line: option.key === baseMetricKey ? baseLine : option.defaultLine,
      rivalFilter: "all",
      leagueFilter: "all",
      activeBarId: null,
    }));
  };

  const handleStepLine = (delta: number) => {
    const next = Math.max(0.5, Math.round((selectedLine + delta) * 10) / 10);
    updateUi((prev) => ({ ...prev, line: next }));
  };

  const handleResetFilters = () => {
    updateUi((prev) => ({
      ...prev,
      rivalFilter: "all",
      perspective: "for",
      leagueFilter: "all",
      sampleWindow: 10,
      venueFilter: "all",
      activeBarId: null,
    }));
  };

  const handleSeal = () => {
    if (!onSealPick || isFinished) return;
    const targetPick = matchedCatalogPick ?? activePick;
    if (!isCustomSpec) {
      onSealPick(targetPick);
      return;
    }
    const customSpec: PickLabCustomSelection = {
      metricKey: selectedMetricKey,
      direction: selectedDirection,
      line: selectedLine,
      label: `${entityName}: ${builtSelectionLabel}`,
      oddsDecimal: null,
    };
    onSealPick(targetPick, customSpec);
  };

  const handleAddParlay = () => {
    if (!onAddToParlay || isFinished) return;
    onAddToParlay(matchedCatalogPick ?? activePick);
  };

  const toggleExpandedPick = (id: string) => {
    setExpandedRelatedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const statusPillLabel = isLive
    ? "En vivo"
    : isFinished
      ? "Finalizado"
      : "Próximo partido";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className="pl-pick-lab-backdrop"
      data-pick-lab-drawer=""
    >
      <div
        ref={panelRef}
        className="pl-pick-lab-panel"
        style={isMobileViewport ? swipe.sheetStyle : undefined}
      >
        <DrawerErrorBoundary title="Bet Lab temporalmente no disponible" onClose={onClose}>
        <div
          className="pl-pick-lab-drag-zone pl-sheet-drag-zone"
          {...(isMobileViewport ? swipe.handleProps : {})}
        >
          <span className="pl-bottom-sheet-handle" aria-hidden="true" />
          <header className="pl-pick-lab-header">
            <div className="pl-pick-lab-entity">
              {entityKind === "player" ? (
                <PersonAvatar photoKey={entityPhotoKey} role="player" size={44} />
              ) : entityKind === "team" ? (
                <TeamBadge
                  league={league}
                  slug={entityTeamSlug}
                  name={entityName}
                  logoUrl={entityLogoUrl}
                  size={44}
                />
              ) : (
                <span className="inline-flex items-center gap-1 shrink-0" aria-hidden="true">
                  <TeamBadge
                    league={league}
                    slug={homeTeam.slug}
                    name={homeTeam.name}
                    logoUrl={homeLogoUrl}
                    size={30}
                  />
                  <TeamBadge
                    league={league}
                    slug={awayTeam.slug}
                    name={awayTeam.name}
                    logoUrl={awayLogoUrl}
                    size={30}
                  />
                </span>
              )}
              <div className="min-w-0">
                <div className="pl-pick-lab-title-row">
                  <h2 id={titleId} className="pl-pick-lab-title">
                    {entityName}
                  </h2>
                  <span className="pl-pick-lab-family-chip">
                    <MarketCategoryIcon family={activePick.family} size={16} />
                    <span>{displayActivePickLabel}</span>
                  </span>
                </div>
                <p className="pl-pick-lab-subtitle">{entitySubtitle}</p>
              </div>
            </div>

            <div className="pl-pick-lab-match-pill">
              <span className="pl-pick-lab-kpi-eyebrow pl-pick-lab-status-row">
                <MaestroIcon
                  name={isLive ? "live-pulse" : isFinished ? "verified-seal" : "target-picks"}
                  size={13}
                />
                <span>{statusPillLabel}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                <TeamBadge
                  league={league}
                  slug={homeTeam.slug}
                  name={homeTeam.name}
                  logoUrl={homeLogoUrl}
                  size={18}
                />
                <span>{homeTeam.shortName}</span>
                <span aria-hidden="true">vs</span>
                <TeamBadge
                  league={league}
                  slug={awayTeam.slug}
                  name={awayTeam.name}
                  logoUrl={awayLogoUrl}
                  size={18}
                />
                <span>{awayTeam.shortName}</span>
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="pl-pick-lab-close"
              data-pick-lab-close=""
              aria-label="Cerrar Bet Lab"
              autoFocus={!isMobileViewport}
              onClick={onClose}
            >
              <MaestroIcon name="x" size={18} />
            </Button>
          </header>
        </div>

        <div ref={bodyScrollRef} className="pl-pick-lab-body">
          <div className="pl-pick-lab-main">
            <section className="pl-pick-lab-dual-strip">
              <div className="pl-pick-lab-kpi-card is-observed">
                <span className="pl-pick-lab-kpi-eyebrow">
                  Muestra histórica observada · {activeMetricSpec.label}
                </span>
                <div className="pl-pick-lab-kpi-grid num">
                  <div className="pl-pick-lab-kpi-item">
                    <span className="pl-pick-lab-kpi-label">Acierto</span>
                    <strong className={`pl-pick-lab-kpi-val ${toneClassForRate(seriesSummary.hitRatePct)}`.trim()}>
                      {seriesSummary.hitRatePct !== null
                        ? `${seriesSummary.hitRatePct} %`
                        : !isCustomSpec &&
                            !hasRealSeries &&
                            activePick.evidence.avgObservedRatePct !== null
                          ? `${activePick.evidence.avgObservedRatePct} %`
                          : "—"}
                    </strong>
                    <span className="pl-pick-lab-kpi-label">
                      {seriesSummary.total > 0
                        ? `${seriesSummary.hits}/${seriesSummary.evaluated} partidos`
                        : "Sin serie"}
                    </span>
                  </div>
                  <div className="pl-pick-lab-kpi-item">
                    <span className="pl-pick-lab-kpi-label">Promedio</span>
                    <strong className="pl-pick-lab-kpi-val">
                      {seriesSummary.mean !== null ? formatNumeric(seriesSummary.mean) : "—"}
                    </strong>
                  </div>
                  <div className="pl-pick-lab-kpi-item">
                    <span className="pl-pick-lab-kpi-label">Mediana</span>
                    <strong className="pl-pick-lab-kpi-val">
                      {seriesSummary.median !== null ? formatNumeric(seriesSummary.median) : "—"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="pl-pick-lab-kpi-card is-model">
                <span className="pl-pick-lab-kpi-eyebrow">Pronóstico calibrado PitchLab</span>
                {activePricing ? (
                  <div className="pl-pick-lab-kpi-grid num">
                    <div className="pl-pick-lab-kpi-item">
                      <span className="pl-pick-lab-kpi-label">Prob. Spacetime</span>
                      <strong className="pl-pick-lab-kpi-val">
                        {(activePricing.p * 100).toFixed(1)} %
                      </strong>
                    </div>
                    <div className="pl-pick-lab-kpi-item">
                      <span className="pl-pick-lab-kpi-label">Momio justo</span>
                      <strong className="pl-pick-lab-kpi-val">{activeFairOdds}</strong>
                    </div>
                    <div className="pl-pick-lab-kpi-item">
                      <span className="pl-pick-lab-kpi-label">
                        {activePricing.marketBookLabel ?? "Mejor casa"}
                      </span>
                      <strong className="pl-pick-lab-kpi-val">
                        {activeHouseOdds ?? "Sin cuota"}
                      </strong>
                    </div>
                    <div className="pl-pick-lab-kpi-item">
                      <span className="pl-pick-lab-kpi-label">
                        {isActiveOutlierEv ? "Señal" : "EV+"}
                      </span>
                      <strong
                        className={`pl-pick-lab-kpi-val ${activeEvPct !== null ? "is-pos" : ""}`.trim()}
                        data-ev-outlier={isActiveOutlierEv ? "true" : undefined}
                      >
                        {activeEvPct !== null
                          ? `+${activeEvPct.toFixed(1)} %`
                          : isActiveOutlierEv
                            ? "Divergencia"
                            : "—"}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p className="pl-pick-lab-subtitle m-0">
                    Línea manual sin cuota verificada. Mostramos únicamente la muestra histórica
                    observada sin fabricar ventaja esperada.
                  </p>
                )}
              </div>
            </section>

            <section className="pl-pick-lab-filters">
              <div className="pl-pick-lab-filter-group">
                <label htmlFor={`${uid}-rival`} className="pl-pick-lab-filter-label">
                  Rival
                </label>
                <select
                  id={`${uid}-rival`}
                  className="pl-pick-lab-select"
                  value={activeUi.rivalFilter}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    updateUi((prev) => ({ ...prev, rivalFilter: nextVal, activeBarId: null }));
                  }}
                >
                  <option value="all">Todos</option>
                  {rivalOptions.map((rival) => (
                    <option key={rival.slug} value={rival.slug}>
                      {rival.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pl-pick-lab-filter-group">
                <span className="pl-pick-lab-filter-label">Perspectiva</span>
                <div className="pl-pick-lab-seg-group" role="group" aria-label="Perspectiva estadística">
                  <button
                    type="button"
                    className={`pl-pick-lab-seg-btn${activeUi.perspective === "for" ? " is-active" : ""}`}
                    aria-pressed={activeUi.perspective === "for"}
                    onClick={() =>
                      updateUi((prev) => ({
                        ...prev,
                        perspective: "for",
                        rivalFilter: "all",
                        leagueFilter: "all",
                        activeBarId: null,
                      }))
                    }
                  >
                    A favor
                  </button>
                  <button
                    type="button"
                    className={`pl-pick-lab-seg-btn${activeUi.perspective === "against" ? " is-active" : ""}`}
                    aria-pressed={activeUi.perspective === "against"}
                    disabled={!hasAgainstSeries}
                    onClick={() =>
                      updateUi((prev) => ({
                        ...prev,
                        perspective: "against",
                        rivalFilter: "all",
                        leagueFilter: "all",
                        activeBarId: null,
                      }))
                    }
                  >
                    En contra
                  </button>
                </div>
              </div>

              <div className="pl-pick-lab-filter-group">
                <label htmlFor={`${uid}-league`} className="pl-pick-lab-filter-label">
                  Competición
                </label>
                <select
                  id={`${uid}-league`}
                  className="pl-pick-lab-select"
                  value={activeUi.leagueFilter}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    updateUi((prev) => ({ ...prev, leagueFilter: nextVal, activeBarId: null }));
                  }}
                >
                  <option value="all">Todas</option>
                  {leagueOptions.map((comp) => (
                    <option key={comp} value={comp}>
                      {comp}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pl-pick-lab-filter-group">
                <span className="pl-pick-lab-filter-label">Muestra</span>
                <div className="pl-pick-lab-seg-group num" role="group" aria-label="Tamaño de muestra">
                  {([5, 10, 20] as const).map((win) => (
                    <button
                      key={win}
                      type="button"
                      className={`pl-pick-lab-seg-btn${activeUi.sampleWindow === win ? " is-active" : ""}`}
                      aria-pressed={activeUi.sampleWindow === win}
                      onClick={() =>
                        updateUi((prev) => ({ ...prev, sampleWindow: win, activeBarId: null }))
                      }
                    >
                      {`L${win}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pl-pick-lab-filter-group">
                <label htmlFor={`${uid}-venue`} className="pl-pick-lab-filter-label">
                  Localía
                </label>
                <select
                  id={`${uid}-venue`}
                  className="pl-pick-lab-select"
                  value={activeUi.venueFilter}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const nextVenue: "all" | "home" | "away" =
                      raw === "home" || raw === "away" ? raw : "all";
                    updateUi((prev) => ({ ...prev, venueFilter: nextVenue, activeBarId: null }));
                  }}
                >
                  <option value="all">Todos</option>
                  <option value="home">Local</option>
                  <option value="away">Visitante</option>
                </select>
              </div>
            </section>

            <section className="pl-pick-lab-chart" data-pick-lab-chart="">
              <div className="pl-pick-lab-chart-head">
                <div className="min-w-0">
                  <h3 className="pl-pick-lab-side-title pl-pick-lab-chart-title m-0">
                    <MarketCategoryIcon
                      {...(activeMetricIconName ? { name: activeMetricIconName } : {})}
                      family={activePick.family}
                      size={18}
                    />
                    <span>
                      {activeMetricSpec.label}
                      {activeUi.perspective === "against" ? " (en contra)" : ""}
                    </span>
                  </h3>
                  <div className="pl-pick-lab-chart-stats num">
                    <span>
                      Acierto{" "}
                      <strong className={toneClassForRate(seriesSummary.hitRatePct)}>
                        {seriesSummary.hitRatePct !== null ? `${seriesSummary.hitRatePct} %` : "—"}
                      </strong>
                    </span>
                    <span>
                      Promedio{" "}
                      <strong>
                        {seriesSummary.mean !== null ? formatNumeric(seriesSummary.mean) : "—"}
                      </strong>
                    </span>
                    <span>
                      Mediana{" "}
                      <strong>
                        {seriesSummary.median !== null ? formatNumeric(seriesSummary.median) : "—"}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="pl-pick-lab-seg-group num" role="group" aria-label="Ajustar línea objetivo">
                  <button
                    type="button"
                    className="pl-pick-lab-seg-btn"
                    aria-label="Bajar línea en 0.5"
                    disabled={selectedLine <= 0.5}
                    onClick={() => handleStepLine(-0.5)}
                  >
                    −
                  </button>
                  <span className="px-2 text-xs font-extrabold">
                    {selectedDirection === "over" ? "Más de" : "Menos de"} {formatNumeric(selectedLine)}
                  </span>
                  <button
                    type="button"
                    className="pl-pick-lab-seg-btn"
                    aria-label="Subir línea en 0.5"
                    onClick={() => handleStepLine(0.5)}
                  >
                    +
                  </button>
                </div>
              </div>

              {isLabSkeletonVisible ? (
                <div
                  className="pl-pick-lab-skeleton"
                  role="progressbar"
                  aria-label="Cargando serie histórica de partidos"
                  aria-busy="true"
                />
              ) : filteredBars.length > 0 ? (
                <>
                  <div className="pl-pick-lab-plot-wrap">
                    <div
                      className="pl-pick-lab-yaxis num"
                      style={{ height: "var(--pl-pick-lab-track-h, 152px)" }}
                      aria-hidden="true"
                    >
                      {yTicks.map((tick, index) => (
                        <span key={`y-${index}`}>{tick}</span>
                      ))}
                    </div>

                    <div className="pl-pick-lab-plot">
                      <div className="pl-pick-lab-bars">
                        <div
                          style={{
                            position: "absolute",
                            insetInline: 0,
                            top: 5,
                            height: "var(--pl-pick-lab-track-h, 152px)",
                            pointerEvents: "none",
                          }}
                          aria-hidden="true"
                        >
                          <div
                            className="pl-pick-lab-threshold"
                            style={
                              {
                                bottom: `${thresholdPct}%`,
                                "--pl-threshold-bottom": `${thresholdPct}%`,
                              } as React.CSSProperties
                            }
                          >
                            <span className="pl-pick-lab-threshold-tag num">
                              {formatNumeric(selectedLine)}
                            </span>
                          </div>
                        </div>

                        {filteredBars.map((bar) => {
                          const outcome = classifyBarOutcome(
                            bar.value,
                            selectedLine,
                            selectedDirection,
                          );
                          const barPct = Math.max(
                            4,
                            Math.min(100, Math.round((Math.max(0, bar.value) / chartCeiling) * 1000) / 10),
                          );
                          const isSelected = inspectedBar?.id === bar.id;
                          const minuteSuffix =
                            typeof bar.minutesPlayed === "number" &&
                            Number.isFinite(bar.minutesPlayed)
                              ? `, ${Math.round(bar.minutesPlayed)} minutos`
                              : "";
                          const outcomeLabel = outcomeStatusText(
                            outcome,
                            selectedLine,
                            selectedDirection,
                          );

                          return (
                            <div key={bar.id} className="pl-pick-lab-bar-col">
                              <button
                                type="button"
                                className={`pl-pick-lab-bar-btn${isSelected ? " is-selected" : ""}`}
                                aria-pressed={isSelected}
                                data-lab-bar-outcome={outcome}
                                onClick={() =>
                                  updateUi((prev) => ({ ...prev, activeBarId: bar.id }))
                                }
                                onFocus={() =>
                                  updateUi((prev) => ({ ...prev, activeBarId: bar.id }))
                                }
                                onMouseEnter={() =>
                                  updateUi((prev) => ({ ...prev, activeBarId: bar.id }))
                                }
                              >
                                <span
                                  className="pl-pick-lab-bar-track"
                                  style={{ height: "var(--pl-pick-lab-track-h, 152px)" }}
                                >
                                  <span
                                    className={`pl-pick-lab-bar is-${outcome}`}
                                    style={{ height: `${barPct}%` }}
                                  >
                                    <span className="pl-pick-lab-bar-val num">
                                      {formatNumeric(bar.value)}
                                    </span>
                                    <span className="sr-only">
                                      {` ${activeMetricSpec.unitLabel}`}
                                    </span>
                                  </span>
                                </span>
                                <span className="pl-pick-lab-bar-meta">
                                  <TeamBadge
                                    league={league}
                                    slug={bar.opponentSlug}
                                    name={bar.opponentName}
                                    size={20}
                                  />
                                  <span className="num">{bar.dateLabel}</span>
                                  <span>
                                    {bar.isHome ? `vs ${bar.opponentShort}` : `@ ${bar.opponentShort}`}
                                  </span>
                                  <span className="sr-only">
                                    {` (${bar.opponentName}${minuteSuffix}). ${outcomeLabel}.`}
                                  </span>
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {inspectedBar ? (
                    <div className="pl-pick-lab-bar-detail num" data-pick-lab-bar-detail="">
                      <strong>
                        {inspectedBar.isHome ? "vs" : "@"} {inspectedBar.opponentName}
                      </strong>
                      <span>{inspectedBar.dateLabel}</span>
                      <span>{inspectedBar.leagueLabel}</span>
                      <strong>
                        {formatNumeric(inspectedBar.value)} {activeMetricSpec.unitLabel}
                      </strong>
                      {typeof inspectedBar.minutesPlayed === "number" &&
                      Number.isFinite(inspectedBar.minutesPlayed) ? (
                        <span>{Math.round(inspectedBar.minutesPlayed)}&apos;</span>
                      ) : null}
                      {inspectedBar.scoreLabel ? <span>Marcador {inspectedBar.scoreLabel}</span> : null}
                      <span>
                        {outcomeStatusText(
                          classifyBarOutcome(inspectedBar.value, selectedLine, selectedDirection),
                          selectedLine,
                          selectedDirection,
                        )}
                      </span>
                    </div>
                  ) : null}

                  <div className="pl-pick-lab-legend" aria-hidden="true">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="pl-pick-lab-swatch is-hit" />
                      {selectedDirection === "over" ? "Supera línea" : "Debajo de línea"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="pl-pick-lab-swatch is-miss" />
                      Fallo
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="pl-pick-lab-swatch is-push" />
                      Exacto (push)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="pl-pick-lab-swatch is-line" />
                      Línea de apuesta ({formatNumeric(selectedLine)})
                    </span>
                  </div>

                  <details
                    className="pl-atom-disclosure"
                    open={activeUi.chartTableOpen}
                    onToggle={(event) => {
                      const nextOpen = event.currentTarget.open;
                      updateUi((prev) =>
                        prev.chartTableOpen === nextOpen
                          ? prev
                          : { ...prev, chartTableOpen: nextOpen },
                      );
                    }}
                  >
                    <summary className="num">
                      Ver serie partido a partido como tabla ({filteredBars.length})
                    </summary>
                    {activeUi.chartTableOpen ? (
                      <div
                        className="pl-pick-lab-history-wrap"
                        tabIndex={0}
                        role="region"
                        aria-labelledby={chartTableCaptionId}
                      >
                        <table className="pl-pick-lab-history-table">
                          <caption id={chartTableCaptionId} className="sr-only">
                            Serie histórica de {activeMetricSpec.label} para {entityName}
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Fecha</th>
                              <th scope="col">Rival</th>
                              <th scope="col" className="num">
                                {activeMetricSpec.label}
                              </th>
                              <th scope="col" className="num">
                                Min
                              </th>
                              <th scope="col">Resultado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredBars.map((bar) => {
                              const outcome = classifyBarOutcome(
                                bar.value,
                                selectedLine,
                                selectedDirection,
                              );
                              return (
                                <tr key={`tbl-${bar.id}`}>
                                  <th scope="row" className="num">
                                    {bar.dateLabel}
                                  </th>
                                  <td data-label="Rival">
                                    {bar.isHome ? `vs ${bar.opponentName}` : `@ ${bar.opponentName}`}
                                  </td>
                                  <td className="num" data-label={activeMetricSpec.label}>
                                    {formatNumeric(bar.value)}
                                  </td>
                                  <td className="num" data-label="Min">
                                    {typeof bar.minutesPlayed === "number" &&
                                    Number.isFinite(bar.minutesPlayed)
                                      ? `${Math.round(bar.minutesPlayed)}'`
                                      : "—"}
                                  </td>
                                  <td data-label="Resultado">
                                    {outcome === "hit"
                                      ? "Cumplió"
                                      : outcome === "push"
                                        ? "Push"
                                        : "No cumplió"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </details>
                </>
              ) : (
                <div className="pl-pick-lab-fallback" data-pick-lab-fallback="">
                  {hasRealSeries && hasActiveFilters ? (
                    <>
                      <p className="pl-pick-lab-subtitle m-0">
                        Ningún partido de la serie coincide con la combinación actual de filtros.
                      </p>
                      <div>
                        <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                          Restablecer filtros
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="pl-pick-lab-subtitle m-0">
                        {currentLabError
                          ? `${currentLabError} Mostramos las ventanas verificadas disponibles del modelo.`
                          : selectedMetricKey !== baseMetricKey
                            ? `No hay serie partido a partido precargada para ${activeMetricSpec.label}. Selecciona un pick relacionado o vuelve a ${baseMetricLabel}.`
                            : "Sin serie partido a partido disponible para este mercado. Mostramos las ventanas verificadas registradas sin inventar valores."}
                      </p>

                      {activePick.evidence.windows.length > 0 ? (
                        <div className="pl-pick-lab-related-stats num">
                          <ul>
                            {activePick.evidence.windows.map((win) => (
                              <li key={`${win.window}-${win.label}`}>
                                <span>
                                  {win.label} ({win.hits}/{win.sample})
                                </span>
                                <strong className={toneClassForRate(win.ratePct)}>
                                  {win.ratePct} %
                                </strong>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {activePick.evidence.xgSignal ? (
                        <p className="pl-pick-lab-subtitle m-0">
                          {activePick.evidence.xgSignal.summary}
                        </p>
                      ) : null}

                      {activePick.evidence.refereeSignal ? (
                        <p className="pl-pick-lab-subtitle m-0">
                          {activePick.evidence.refereeSignal.summary}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="pl-pick-lab-builder" data-pick-lab-builder="">
              <div className="pl-pick-lab-builder-head">
                <div className="min-w-0">
                  <h3 className="pl-pick-lab-side-title m-0">Arma tu pick</h3>
                  <p className="pl-pick-lab-subtitle m-0">
                    {entityName} · {builtSelectionLabel}
                  </p>
                </div>
                {isCustomSpec ? (
                  <span className="pl-sf-signal-pill is-neutral">
                    Línea manual · sin EV+ simulado
                  </span>
                ) : activeEvPct !== null ? (
                  <span className="pl-sf-signal-pill is-positive num" data-ev-positive="true">
                    EV +{activeEvPct.toFixed(1)} %
                  </span>
                ) : isActiveOutlierEv ? (
                  <span
                    className="pl-sf-signal-pill is-neutral"
                    data-ev-outlier="true"
                    title="Diferencia atípica frente a la cuota capturada; verifica la línea antes de jugar"
                  >
                    <MaestroIcon name="alert-warning" size={12} />
                    <span>Divergencia</span>
                  </span>
                ) : activeFairOdds ? (
                  <span className="pl-sf-signal-pill is-neutral num">
                    Justo {activeFairOdds}
                  </span>
                ) : null}
              </div>

              <div>
                <span className="pl-pick-lab-filter-label">Mercado</span>
                <div className="pl-pick-lab-chip-row" role="group" aria-label="Mercados disponibles">
                  {metricOptions.map((option) => {
                    const isActive = option.key === selectedMetricKey;
                    const optIconName = resolveLabMetricIconName(option.key);
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`pl-pick-lab-chip${isActive ? " is-active" : ""}`}
                        aria-pressed={isActive}
                        onClick={() => handleSelectMetric(option)}
                      >
                        <MarketCategoryIcon
                          {...(optIconName ? { name: optIconName } : {})}
                          family={option.key}
                          size={15}
                        />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pl-pick-lab-line-row">
                <div className="pl-pick-lab-filter-group">
                  <label htmlFor={`${uid}-direction`} className="pl-pick-lab-filter-label">
                    Dirección
                  </label>
                  <select
                    id={`${uid}-direction`}
                    className="pl-pick-lab-select"
                    value={selectedDirection}
                    onChange={(e) => {
                      const nextDir: "over" | "under" =
                        e.target.value === "under" ? "under" : "over";
                      updateUi((prev) => ({ ...prev, direction: nextDir }));
                    }}
                  >
                    <option value="over">Más de</option>
                    <option value="under">Menos de</option>
                  </select>
                </div>

                <div className="pl-pick-lab-filter-group min-w-0 flex-1">
                  <span className="pl-pick-lab-filter-label">Línea</span>
                  <div className="pl-pick-lab-chip-row num" role="group" aria-label="Líneas disponibles">
                    {activeMetricSpec.lines.map((lineOption) => {
                      const parsed = parseStrictFiniteNumber(lineOption);
                      if (parsed === null) return null;
                      const isActive = Math.abs(parsed - selectedLine) < 1e-6;
                      return (
                        <button
                          key={parsed}
                          type="button"
                          className={`pl-pick-lab-chip${isActive ? " is-active" : ""}`}
                          aria-pressed={isActive}
                          onClick={() => updateUi((prev) => ({ ...prev, line: parsed }))}
                        >
                          {formatNumeric(parsed)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pl-pick-lab-actions">
                <Button
                  variant="primary"
                  size="default"
                  data-pick-lab-seal=""
                  disabled={isFinished || !onSealPick}
                  onClick={handleSeal}
                >
                  <MaestroIcon name="check" size={14} />
                  <span className="num">
                    {isFinished
                      ? "Partido finalizado"
                      : activeHouseOdds
                        ? `Sellar pick · ${activeHouseOdds}`
                        : activeFairOdds && !isCustomSpec
                          ? `Sellar pick · ${activeFairOdds}`
                          : "Sellar pick"}
                  </span>
                </Button>

                <Button
                  variant="secondary"
                  size="default"
                  data-pick-lab-parlay=""
                  disabled={isFinished || !onAddToParlay}
                  onClick={handleAddParlay}
                >
                  <MaestroIcon name="plus" size={14} />
                  <span>Parlay</span>
                </Button>
              </div>
            </section>
          </div>

          <aside className="pl-pick-lab-sidebar" aria-label="Picks relacionados e historial reciente">
            <section className="pl-pick-lab-side-card" data-pick-lab-related="">
              <h3 className="pl-pick-lab-side-title">
                Más picks de {entityKind === "match" ? "este partido" : entityName}
              </h3>

              {mergedRelatedPicks.length === 0 ? (
                <p className="pl-pick-lab-subtitle m-0">
                  No hay otros picks adicionales disponibles para este partido.
                </p>
              ) : (
                <ul className="pl-pick-lab-related-list">
                  {mergedRelatedPicks.map((rel) => {
                    const isExpanded = Boolean(expandedRelatedIds[rel.id]);
                    const statsPanelId = `${uid}-rel-stats-${rel.id}`;
                    const relHouse =
                      rel.pricing.marketDecimal !== null
                        ? formatOddsValue(rel.pricing.marketDecimal, oddsFormat)
                        : null;
                    const relFair = formatOddsValue(rel.pricing.fairOdds, oddsFormat);
                    const relRawEv =
                      rel.pricing.evPct !== null && Number.isFinite(rel.pricing.evPct)
                        ? rel.pricing.evPct
                        : null;
                    const relEv =
                      relRawEv !== null && relRawEv > 0 && relRawEv <= MAX_AUDITABLE_EV_PCT
                        ? relRawEv
                        : null;
                    const relDisplayLabel = ensureLabPickLabelUnit(
                      rel.label,
                      rel.family,
                      rel.sport,
                      rel.playerMeta?.statLabel ?? null,
                    );
                    const topBullet = rel.evidence.bullets[0] ?? null;
                    const relTeamSlug =
                      rel.playerMeta?.teamSlug ??
                      (rel.playerMeta?.teamSide === "away" ? awayTeam.slug : entityTeamSlug);
                    const relTeamLogoUrl =
                      relTeamSlug === awayTeam.slug ? awayLogoUrl : homeLogoUrl;

                    return (
                      <li key={rel.id} className="pl-pick-lab-related-card">
                        <button
                          type="button"
                          className="pl-pick-lab-related-select"
                          onClick={() => onSelectRelatedPick?.(rel)}
                          disabled={!onSelectRelatedPick}
                        >
                          <div className="pl-pick-lab-related-top">
                            <span className="inline-flex items-center gap-2 min-w-0">
                              {rel.playerMeta ? (
                                <PersonAvatar
                                  photoKey={rel.playerMeta.photoKey ?? null}
                                  role="player"
                                  size={26}
                                />
                              ) : (
                                <TeamBadge
                                  league={rel.league}
                                  slug={relTeamSlug}
                                  name={entityName}
                                  logoUrl={relTeamLogoUrl}
                                  size={24}
                                />
                              )}
                              <span className="pl-pick-lab-related-meta min-w-0">
                                <strong className="truncate">{relDisplayLabel}</strong>
                                <span className="pl-pick-lab-related-fam truncate">
                                  <MarketCategoryIcon family={rel.family} size={14} />
                                  <span className="truncate">{rel.familyLabel}</span>
                                </span>
                              </span>
                            </span>

                            <span className="pl-pick-lab-related-odds num">
                              <strong>{relHouse ?? relFair}</strong>
                              <span>
                                {relEv !== null
                                  ? `+${relEv.toFixed(1)} % EV`
                                  : `${(rel.pricing.p * 100).toFixed(0)} %`}
                              </span>
                            </span>
                          </div>

                          {topBullet ? (
                            <span className="pl-pick-lab-subtitle num">
                              {topBullet.label}
                              {topBullet.ratePct !== null ? ` · ${topBullet.ratePct} %` : ""}
                            </span>
                          ) : null}
                        </button>

                        <button
                          type="button"
                          className="pl-pick-lab-expand-btn"
                          data-pick-lab-expand-stats={rel.id}
                          aria-expanded={isExpanded}
                          aria-controls={statsPanelId}
                          onClick={() => toggleExpandedPick(rel.id)}
                        >
                          <span>
                            {isExpanded ? "Ocultar estadísticas" : "Expandir estadísticas"}
                            <span className="sr-only"> de {relDisplayLabel}</span>
                          </span>
                          <MaestroIcon
                            name="chevronDown"
                            size={14}
                            className="pl-pick-lab-expand-chevron shrink-0"
                          />
                        </button>

                        {isExpanded ? (
                          <div id={statsPanelId} className="pl-pick-lab-related-stats num">
                            {rel.evidence.windows.length > 0 ? (
                              <ul>
                                {rel.evidence.windows.map((win) => (
                                  <li key={`${rel.id}-${win.window}`}>
                                    <span>
                                      {win.label} · {win.hits}/{win.sample}
                                    </span>
                                    <strong className={toneClassForRate(win.ratePct)}>
                                      {win.ratePct} %
                                    </strong>
                                  </li>
                                ))}
                              </ul>
                            ) : rel.evidence.bullets.length > 0 ? (
                              <ul>
                                {rel.evidence.bullets.map((bullet, idx) => (
                                  <li key={`${rel.id}-b-${idx}`}>
                                    <span>{bullet.label}</span>
                                    {bullet.ratePct !== null ? (
                                      <strong className={toneClassForRate(bullet.ratePct)}>
                                        {bullet.ratePct} %
                                      </strong>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="pl-pick-lab-subtitle m-0">
                                Sin ventanas adicionales registradas para esta selección.
                              </p>
                            )}
                            <p className="pl-pick-lab-subtitle m-0">
                              Spacetime {(rel.pricing.p * 100).toFixed(1)} % · Justo {relFair}
                              {rel.pricing.marketBookLabel && relHouse
                                ? ` · ${rel.pricing.marketBookLabel} ${relHouse}`
                                : ""}
                            </p>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="pl-pick-lab-side-card" data-pick-lab-history="">
              <h3 className="pl-pick-lab-side-title">Historial reciente</h3>
              {recentHistory.length === 0 ? (
                <p className="pl-pick-lab-subtitle m-0">
                  Sin partidos recientes disponibles para mostrar en tabla.
                </p>
              ) : (
                <div
                  className="pl-pick-lab-history-wrap"
                  tabIndex={0}
                  role="region"
                  aria-labelledby={historyCaptionId}
                >
                  <table className="pl-pick-lab-history-table">
                    <caption id={historyCaptionId} className="sr-only">
                      Historial reciente de partidos de {entityName}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Partido</th>
                        <th scope="col">Fecha</th>
                        <th scope="col" className="num">
                          GF
                        </th>
                        <th scope="col" className="num">
                          GC
                        </th>
                        <th scope="col" className="num">
                          Res.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentHistory.map((row) => {
                        const tone =
                          row.result === "W"
                            ? "is-w"
                            : row.result === "D"
                              ? "is-d"
                              : "is-l";
                        return (
                          <tr key={row.id}>
                            <th scope="row">
                              <span>{row.matchLabel}</span>
                            </th>
                            <td className="num" data-label="Fecha">
                              {row.dateLabel}
                            </td>
                            <td className="num" data-label="GF">
                              {row.gf}
                            </td>
                            <td className="num" data-label="GC">
                              {row.gc}
                            </td>
                            <td className="num" data-label="Res.">
                              <span className={`pl-pick-lab-result-badge ${tone}`}>
                                {row.result}
                                <span className="sr-only"> ({resultAriaLabel(row.result)})</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </aside>
        </div>
        </DrawerErrorBoundary>
      </div>
    </dialog>
  );
}
