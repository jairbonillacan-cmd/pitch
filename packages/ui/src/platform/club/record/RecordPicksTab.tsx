"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { parseStrictFiniteNumber, type LivePhase } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreTabs,
  type SofascoreTabItem,
} from "../../../components/ui/primitives";
import { TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import {
  LivePickProgressBar,
  type LiveAsianPickState,
  type LivePickLineupAlert,
} from "../../atomic";
import { DailyResultsCalendar } from "../../components/DailyResultsCalendar";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { MatchTicketCard } from "../../components/MatchTicketCard";
import { ConfirmActionDialog } from "../../components/PlatformOverlays";
import { useSafeEffect, useVisibilityPolling } from "../../hooks";
import { computeLivePickProgress } from "../../live/live-pick-progress";
import {
  useOptionalPlatformActions,
  useOptionalPlatformCore,
  type ShareTicketPayload,
} from "../../platform-provider";
import { buildMonthlyRecordCalendar } from "../../record-stats";
import type {
  JournalEntry,
  JournalParlayLegResult,
  MatchPick,
  OddsFormat,
  PlatformGame,
} from "../../types";
import { shortDateLabel } from "../home/home-model";
import { formatSignedPctValue, formatSignedUnits } from "./PublicRecordSections";
import {
  auditStatusFromJournal,
  classifyMarketFamily,
  computeJournalEntryEvPct,
  computeJournalSettlementUnits,
  getAuditStatusMeta,
  resolveCapturedBookLabel,
  type AuditPickStatus,
} from "./record-audit-helpers";

type PickStatusFilter = "all" | AuditPickStatus;
type PickKindFilter = "all" | "single" | "parlay";
type RecordViewMode = "list" | "calendar";

const PICKS_PAGE_SIZE = 15;

const RECORD_VIEW_TABS: readonly SofascoreTabItem[] = [
  { id: "list", label: "Lista" },
  { id: "calendar", label: "Calendario" },
];

const ORIGIN_SHORT_LABEL: Record<string, string> = {
  "Spacetime Suite": "Modelo",
  "Parlay Combinado": "Parlay",
  "Player Prop": "Prop",
  Propio: "Propio",
};

export interface LiveTrackedPickLegSnapshot {
  readonly pickId: string;
  readonly gameId: string;
  readonly phase: LivePhase;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly clockLabel: string;
  readonly actualValue: number;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly direction: "over" | "under" | "handicap";
  readonly projectedFinal: number | null;
  readonly asianState: LiveAsianPickState | null;
  readonly starterAlert: LivePickLineupAlert;
  readonly starterAlertDetail: string | null;
}

export interface LiveTrackedPickSnapshot {
  readonly id: string;
  readonly pickId: string;
  readonly gameId: string;
  readonly pickKind: "single" | "parlay";
  readonly phase: LivePhase;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly href: string | null;
  readonly clockLabel: string;
  readonly actualValue: number;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly direction: "over" | "under" | "handicap";
  readonly projectedFinal: number | null;
  readonly asianState: LiveAsianPickState | null;
  readonly starterAlert: LivePickLineupAlert;
  readonly starterAlertDetail: string | null;
  readonly legs: readonly LiveTrackedPickLegSnapshot[];
}

interface ParsedLivePicksResponse {
  readonly nextPollSeconds: number | null;
  readonly items: readonly LiveTrackedPickSnapshot[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLivePhase(raw: unknown): LivePhase {
  if (
    raw === "scheduled" ||
    raw === "live" ||
    raw === "halftime" ||
    raw === "final" ||
    raw === "penalties" ||
    raw === "postponed" ||
    raw === "cancelled" ||
    raw === "unknown"
  ) {
    return raw;
  }
  return "unknown";
}

function isLivePhaseOrAlertActive(
  phase: LivePhase,
  starterAlert: LivePickLineupAlert,
): boolean {
  return (
    phase === "live" ||
    phase === "halftime" ||
    phase === "penalties" ||
    starterAlert === "titular_en_banca"
  );
}

function isActiveLiveTrackedPick(item: LiveTrackedPickSnapshot): boolean {
  return isLivePhaseOrAlertActive(item.phase, item.starterAlert);
}

function parseDirection(raw: unknown): "over" | "under" | "handicap" {
  if (raw === "under" || raw === "handicap") return raw;
  return "over";
}

function parseAsianState(raw: unknown): LiveAsianPickState | null {
  if (
    raw === "won_full" ||
    raw === "won_half" ||
    raw === "push" ||
    raw === "lost_half" ||
    raw === "lost_full"
  ) {
    return raw;
  }
  return null;
}

function parseStarterAlert(raw: unknown): LivePickLineupAlert {
  return raw === "titular_en_banca" ? "titular_en_banca" : null;
}

function parseLiveLeg(raw: unknown): LiveTrackedPickLegSnapshot | null {
  if (!isPlainRecord(raw)) return null;
  const pickId = typeof raw.pickId === "string" ? raw.pickId : "";
  const gameId = typeof raw.gameId === "string" ? raw.gameId : "";
  const pickLabel = typeof raw.pickLabel === "string" ? raw.pickLabel : "";
  const matchLabel = typeof raw.matchLabel === "string" ? raw.matchLabel : "";
  const clockLabel = typeof raw.clockLabel === "string" ? raw.clockLabel : "En vivo";
  const actualValue = parseStrictFiniteNumber(raw.actualValue);
  const targetLine = parseStrictFiniteNumber(raw.targetLine);
  if (!pickId || !pickLabel || actualValue === null || targetLine === null) return null;
  const unitLabel = typeof raw.unitLabel === "string" && raw.unitLabel.length > 0 ? raw.unitLabel : "unid.";
  const projectedFinal = parseStrictFiniteNumber(raw.projectedFinal);
  return {
    pickId,
    gameId,
    phase: parseLivePhase(raw.phase),
    matchLabel,
    pickLabel,
    clockLabel,
    actualValue,
    targetLine,
    unitLabel,
    direction: parseDirection(raw.direction),
    projectedFinal,
    asianState: parseAsianState(raw.asianState),
    starterAlert: parseStarterAlert(raw.starterAlert),
    starterAlertDetail: typeof raw.starterAlertDetail === "string" ? raw.starterAlertDetail : null,
  };
}

function parseLiveTrackedPicksPayload(raw: unknown): ParsedLivePicksResponse | null {
  if (!isPlainRecord(raw) || !Array.isArray(raw.items)) return null;
  const parsedPoll = parseStrictFiniteNumber(raw.nextPollSeconds);
  const items: LiveTrackedPickSnapshot[] = [];

  for (const entry of raw.items) {
    if (!isPlainRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id : "";
    const pickId = typeof entry.pickId === "string" ? entry.pickId : id;
    const gameId = typeof entry.gameId === "string" ? entry.gameId : "";
    const pickLabel = typeof entry.pickLabel === "string" ? entry.pickLabel : "";
    const matchLabel = typeof entry.matchLabel === "string" ? entry.matchLabel : "";
    const clockLabel = typeof entry.clockLabel === "string" ? entry.clockLabel : "En vivo";
    const actualValue = parseStrictFiniteNumber(entry.actualValue);
    const targetLine = parseStrictFiniteNumber(entry.targetLine);
    if (!id || !pickLabel || actualValue === null || targetLine === null) continue;
    const unitLabel =
      typeof entry.unitLabel === "string" && entry.unitLabel.length > 0 ? entry.unitLabel : "unid.";
    const projectedFinal = parseStrictFiniteNumber(entry.projectedFinal);
    const legs: LiveTrackedPickLegSnapshot[] = [];
    if (Array.isArray(entry.legs)) {
      for (const legRaw of entry.legs) {
        const parsedLeg = parseLiveLeg(legRaw);
        if (parsedLeg) legs.push(parsedLeg);
      }
    }
    items.push({
      id,
      pickId,
      gameId,
      pickKind: entry.pickKind === "parlay" ? "parlay" : "single",
      phase: parseLivePhase(entry.phase),
      matchLabel,
      pickLabel,
      href: typeof entry.href === "string" && entry.href.startsWith("/") ? entry.href : null,
      clockLabel,
      actualValue,
      targetLine,
      unitLabel,
      direction: parseDirection(entry.direction),
      projectedFinal,
      asianState: parseAsianState(entry.asianState),
      starterAlert: parseStarterAlert(entry.starterAlert),
      starterAlertDetail:
        typeof entry.starterAlertDetail === "string" ? entry.starterAlertDetail : null,
      legs,
    });
  }

  return {
    nextPollSeconds: parsedPoll !== null && parsedPoll > 0 ? parsedPoll : null,
    items,
  };
}

export function isParlayJournalEntry(entry: JournalEntry): boolean {
  return (
    entry.pickKind === "parlay" ||
    entry.origin === "Parlay Combinado" ||
    (Array.isArray(entry.parlayLegs) && entry.parlayLegs.length > 0)
  );
}

interface ResolvedLegDisplay {
  readonly key: string;
  readonly gameId?: string;
  readonly pickId?: string;
  readonly index: number;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly marketFamilyShort: string;
  readonly p: number | null;
  readonly fairDecimal: number | null;
  readonly closingDecimal: number | null;
  readonly clvPct: number | null;
  readonly scoreLabel: string | null;
  readonly status: AuditPickStatus;
}

function resolveParlayLegsForDisplay(
  entry: JournalEntry,
  gameById: ReadonlyMap<string, PlatformGame>,
): ResolvedLegDisplay[] {
  const resultByKey = new Map<string, JournalParlayLegResult>();
  for (const r of entry.parlayLegResults ?? []) {
    resultByKey.set(`${r.gameId}::${r.pickId}`, r);
    resultByKey.set(r.pickId, r);
  }
  const fallbackStatus: AuditPickStatus =
    entry.status === "won" ? "won" : entry.status === "void" ? "push" : "pending";

  if (Array.isArray(entry.parlayLegs) && entry.parlayLegs.length > 0) {
    return entry.parlayLegs.map((leg, i) => {
      const res =
        resultByKey.get(`${leg.gameId}::${leg.pickId}`) ?? resultByKey.get(leg.pickId);
      const status: AuditPickStatus = res
        ? auditStatusFromJournal(res.status)
        : fallbackStatus;
      const linkedGame = gameById.get(leg.gameId);
      const scoreLabel =
        res && Number.isFinite(res.homeScore) && Number.isFinite(res.awayScore)
          ? `${res.homeScore}–${res.awayScore}`
          : linkedGame?.status === "FT" && linkedGame.score
            ? `${linkedGame.score.home}–${linkedGame.score.away}`
            : null;
      const pickLabel = leg.pickLabel ?? leg.selection ?? leg.pickId;
      const family = classifyMarketFamily({
        market: leg.market,
        pickLabel,
      });

      return {
        key: `${leg.gameId}-${leg.pickId}-${i}`,
        gameId: leg.gameId,
        pickId: leg.pickId,
        index: i + 1,
        leagueLabel: leg.leagueLabel ?? entry.leagueLabel,
        matchLabel: leg.matchLabel ?? `Pierna ${i + 1}`,
        pickLabel,
        marketFamilyShort: family.shortLabel,
        p:
          typeof leg.p === "number" && Number.isFinite(leg.p) && leg.p > 0 && leg.p < 1
            ? leg.p
            : null,
        fairDecimal:
          typeof leg.fairDecimal === "number" && Number.isFinite(leg.fairDecimal)
            ? leg.fairDecimal
            : null,
        closingDecimal:
          res && typeof res.closingDecimal === "number" && Number.isFinite(res.closingDecimal)
            ? res.closingDecimal
            : null,
        clvPct:
          res && typeof res.clvPct === "number" && Number.isFinite(res.clvPct)
            ? res.clvPct
            : null,
        scoreLabel,
        status,
      };
    });
  }

  const parts = entry.pickLabel
    .split(/\s+\+\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((label, i) => ({
    key: `${entry.id}-legacy-${i}`,
    index: i + 1,
    leagueLabel: entry.leagueLabel,
    matchLabel: `Pierna ${i + 1}`,
    pickLabel: label,
    marketFamilyShort: classifyMarketFamily({ pickLabel: label }).shortLabel,
    p: null,
    fairDecimal: null,
    closingDecimal: null,
    clvPct: null,
    scoreLabel: null,
    status: fallbackStatus,
  }));
}

function ParlayLegsList({
  legs,
  oddsFormat,
  liveLegs,
}: {
  legs: readonly ResolvedLegDisplay[];
  oddsFormat: OddsFormat;
  liveLegs?: readonly LiveTrackedPickLegSnapshot[];
}): React.JSX.Element {
  const liveLegIndex = useMemo(() => {
    const byComposite = new Map<string, LiveTrackedPickLegSnapshot>();
    const byPickId = new Map<string, LiveTrackedPickLegSnapshot>();
    const byLabel = new Map<string, LiveTrackedPickLegSnapshot>();
    for (const item of liveLegs ?? []) {
      if (!isLivePhaseOrAlertActive(item.phase, item.starterAlert)) continue;
      if (item.gameId && item.pickId) {
        byComposite.set(`${item.gameId}::${item.pickId}`, item);
      }
      if (item.pickId && !byPickId.has(item.pickId)) {
        byPickId.set(item.pickId, item);
      }
      const normLabel = item.pickLabel.toLowerCase();
      if (normLabel && !byLabel.has(normLabel)) {
        byLabel.set(normLabel, item);
      }
    }
    return { byComposite, byPickId, byLabel };
  }, [liveLegs]);

  return (
    <ul className="pl-rec-parlay-legs" role="list">
      {legs.map((leg) => {
        const st = getAuditStatusMeta(leg.status);
        const liveLeg =
          (leg.gameId && leg.pickId
            ? liveLegIndex.byComposite.get(`${leg.gameId}::${leg.pickId}`)
            : undefined) ??
          (leg.pickId ? liveLegIndex.byPickId.get(leg.pickId) : undefined) ??
          (!leg.gameId && !leg.pickId
            ? liveLegIndex.byLabel.get(leg.pickLabel.toLowerCase())
            : undefined) ??
          null;
        return (
          <li key={leg.key} className="pl-rec-parlay-leg">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="text-[11px] font-extrabold num"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  #{leg.index}
                </span>
                <strong className="text-xs font-bold">{leg.pickLabel}</strong>
                <span className="pl-pill text-[10px]">{leg.marketFamilyShort}</span>
                {leg.scoreLabel ? (
                  <span className="pl-hist-score-pill num text-[11px]">FT {leg.scoreLabel}</span>
                ) : null}
              </div>
              <span
                className="block text-[11px] truncate"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {leg.leagueLabel} · {leg.matchLabel}
              </span>
              {liveLeg ? (
                <div className="pt-1">
                  <LivePickProgressBar
                    pickLabel={liveLeg.pickLabel}
                    matchLabel={liveLeg.matchLabel}
                    clockLabel={liveLeg.clockLabel}
                    actualValue={liveLeg.actualValue}
                    targetLine={liveLeg.targetLine}
                    unitLabel={liveLeg.unitLabel}
                    direction={liveLeg.direction}
                    projectedFinal={liveLeg.projectedFinal}
                    asianState={liveLeg.asianState}
                    starterAlert={liveLeg.starterAlert}
                    starterAlertDetail={liveLeg.starterAlertDetail}
                    compact
                  />
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 num">
              {leg.p !== null ? (
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  {(leg.p * 100).toFixed(0)} %
                </span>
              ) : null}
              {leg.fairDecimal !== null ? (
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  Justo {formatOddsValue(leg.fairDecimal, oddsFormat)}
                </span>
              ) : null}
              {leg.closingDecimal !== null ? (
                <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                  Cierre {formatOddsValue(leg.closingDecimal, oddsFormat)}
                </span>
              ) : null}
              {leg.clvPct !== null ? (
                <span
                  className="text-[11px] font-bold"
                  style={{
                    color: leg.clvPct >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
                  }}
                >
                  CLV {formatSignedPctValue(leg.clvPct)}
                </span>
              ) : null}
              <span className={st.pillClass} data-audit-status={st.status}>
                <MaestroIcon name={st.icon} size={11} />
                <span>{st.label}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RecordPicksTab({
  journal,
  oddsFormat,
  watchedGames,
  suggestedUpcoming,
  onToggleWatchlist,
  onNavigateHome,
  onOpenWinningEntry,
  onOpenShareTicket,
  onClearWatchlist,
  overrideLiveTrackedPicks,
}: {
  journal: readonly JournalEntry[];
  oddsFormat: OddsFormat;
  watchedGames: readonly PlatformGame[];
  suggestedUpcoming: readonly PlatformGame[];
  onToggleWatchlist: (gameId: string) => void;
  onNavigateHome: () => void;
  onOpenWinningEntry: (entry: JournalEntry) => void;
  onOpenShareTicket: (payload: ShareTicketPayload) => void;
  onClearWatchlist?: () => void;
  overrideLiveTrackedPicks?: readonly LiveTrackedPickSnapshot[];
}): React.JSX.Element {
  const uid = useId();
  const [statusFilter, setStatusFilter] = useState<PickStatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<PickKindFilter>("all");
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [expandedParlayIds, setExpandedParlayIds] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<RecordViewMode>("list");
  const [shown, setShown] = useState<number>(PICKS_PAGE_SIZE);
  const [confirmClearWatchOpen, setConfirmClearWatchOpen] = useState(false);

  const [serverLiveItems, setServerLiveItems] = useState<readonly LiveTrackedPickSnapshot[]>([]);
  const [serverPollSeconds, setServerPollSeconds] = useState<number | null>(null);
  const [livePollBlocked, setLivePollBlocked] = useState<boolean>(false);

  const optCore = useOptionalPlatformCore();
  const optActions = useOptionalPlatformActions();
  const userTz = optCore?.userTimezone ?? "America/Mexico_City";
  const allGames = optCore?.dataset.games ?? watchedGames;
  const hasAccountSessionAuth = Boolean(optCore?.hasAccountSessionAuth);

  const gameById = useMemo(() => new Map(allGames.map((g) => [g.id, g])), [allGames]);

  const pickById = useMemo(() => {
    const map = new Map<string, MatchPick>();
    for (const g of allGames) {
      for (const pk of g.picks) {
        map.set(pk.id, pk);
      }
      for (const cand of g.parlayCandidates ?? []) {
        if (!map.has(cand.id)) map.set(cand.id, cand);
      }
    }
    return map;
  }, [allGames]);

  const hasPendingEntries = useMemo(
    () => journal.some((entry) => entry.status === "pending"),
    [journal],
  );

  const canPollServerLive = Boolean(
    hasAccountSessionAuth && !overrideLiveTrackedPicks && !livePollBlocked,
  );

  const fetchServerLivePicks = useCallback(async (signal?: AbortSignal) => {
    if (typeof fetch !== "function") return;
    try {
      const response = await fetch("/api/me/live-picks", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        setLivePollBlocked(true);
        setServerLiveItems([]);
        setServerPollSeconds(null);
        return;
      }
      if (!response.ok) return;
      const raw: unknown = await response.json().catch(() => null);
      if (signal?.aborted) return;
      const parsed = parseLiveTrackedPicksPayload(raw);
      if (!parsed) return;
      setServerLiveItems(parsed.items);
      setServerPollSeconds(parsed.nextPollSeconds);
    } catch (err) {
      void err;
    }
  }, []);

  useSafeEffect(() => {
    if (!canPollServerLive) return;
    const controller = new AbortController();
    void fetchServerLivePicks(controller.signal);
    return () => {
      controller.abort();
    };
  }, [canPollServerLive, fetchServerLivePicks]);

  const pollIntervalMs = useMemo(() => {
    if (!canPollServerLive) return null;
    if (serverPollSeconds !== null) {
      return Math.max(15, Math.min(120, serverPollSeconds)) * 1000;
    }
    if (serverLiveItems.length > 0 || hasPendingEntries) {
      return 30_000;
    }
    return null;
  }, [canPollServerLive, hasPendingEntries, serverLiveItems.length, serverPollSeconds]);

  useVisibilityPolling(
    () => fetchServerLivePicks(),
    pollIntervalMs,
    canPollServerLive,
  );

  const localFallbackLiveItems = useMemo<readonly LiveTrackedPickSnapshot[]>(() => {
    if (overrideLiveTrackedPicks || serverLiveItems.length > 0) return [];
    const out: LiveTrackedPickSnapshot[] = [];
    for (const entry of journal) {
      if (entry.status !== "pending") continue;
      const linkedGame = gameById.get(entry.gameId);
      if (!linkedGame || linkedGame.status !== "LIVE") continue;
      const progress = computeLivePickProgress({ entry, game: linkedGame });
      if (!progress) continue;
      const targetLine = progress.targetValue ?? 1;
      const actualValue = progress.currentValue ?? 0;
      const isUnder =
        entry.pickLabel.toLowerCase().includes("menos de") ||
        entry.pickLabel.toLowerCase().includes("under");
      out.push({
        id: entry.id,
        pickId: entry.pickId,
        gameId: entry.gameId,
        pickKind: isParlayJournalEntry(entry) ? "parlay" : "single",
        phase: "live",
        matchLabel: entry.matchLabel,
        pickLabel: entry.pickLabel,
        href: progress.href ?? null,
        clockLabel: `${progress.scoreLabel} · ${progress.clockLabel}`,
        actualValue,
        targetLine,
        unitLabel: linkedGame.sport === "football" ? "goles" : "pts",
        direction: isUnder ? "under" : "over",
        projectedFinal: null,
        asianState: null,
        starterAlert: null,
        starterAlertDetail: null,
        legs: [],
      });
    }
    return out;
  }, [gameById, journal, overrideLiveTrackedPicks, serverLiveItems.length]);

  const activeLiveTrackedPicks = useMemo<readonly LiveTrackedPickSnapshot[]>(() => {
    const source = overrideLiveTrackedPicks
      ? overrideLiveTrackedPicks
      : serverLiveItems.length > 0
        ? serverLiveItems
        : localFallbackLiveItems;
    return source.filter(isActiveLiveTrackedPick);
  }, [localFallbackLiveItems, overrideLiveTrackedPicks, serverLiveItems]);

  const liveTrackByKey = useMemo(() => {
    const map = new Map<string, LiveTrackedPickSnapshot>();
    for (const item of activeLiveTrackedPicks) {
      map.set(item.id, item);
      map.set(item.pickId, item);
    }
    return map;
  }, [activeLiveTrackedPicks]);

  const toggleParlayExpanded = useCallback((id: string) => {
    setExpandedParlayIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const buildCalendarMonth = useCallback(
    (ym: string) =>
      buildMonthlyRecordCalendar(journal, ym || undefined, {
        timeZone: userTz,
        includeNetUnits: true,
      }),
    [journal, userTz],
  );

  const enrichedJournal = useMemo(
    () =>
      journal.map((item) => {
        const isParlay = isParlayJournalEntry(item);
        const linkedGame = gameById.get(item.gameId);
        const linkedPick = pickById.get(item.pickId);
        const auditStatus = auditStatusFromJournal(item.status);
        const family = classifyMarketFamily({
          market: linkedPick?.market ?? item.parlayLegs?.[0]?.market,
          marketGroup: linkedPick?.marketGroup,
          pickLabel: item.pickLabel,
          origin: item.origin,
          isParlay,
        });
        const evPct = computeJournalEntryEvPct(item);
        const netUnits = computeJournalSettlementUnits(item);
        const bookLabel = resolveCapturedBookLabel(linkedPick);
        const finalScore =
          linkedGame?.status === "FT" && linkedGame.score
            ? `${linkedGame.score.home}–${linkedGame.score.away}`
            : null;
        const isFinishedMatch = linkedGame?.status === "FT";
        const legs = isParlay ? resolveParlayLegsForDisplay(item, gameById) : [];
        const liveProgress =
          auditStatus === "pending"
            ? (liveTrackByKey.get(item.id) ?? liveTrackByKey.get(item.pickId) ?? null)
            : null;

        return {
          item,
          isParlay,
          auditStatus,
          family,
          evPct,
          netUnits,
          bookLabel,
          finalScore,
          isFinishedMatch,
          legs,
          liveProgress,
        };
      }),
    [gameById, journal, liveTrackByKey, pickById],
  );

  const parlayCount = useMemo(
    () => enrichedJournal.filter((r) => r.isParlay).length,
    [enrichedJournal],
  );
  const singleCount = enrichedJournal.length - parlayCount;

  const kindFiltered = useMemo(() => {
    if (kindFilter === "parlay") return enrichedJournal.filter((r) => r.isParlay);
    if (kindFilter === "single") return enrichedJournal.filter((r) => !r.isParlay);
    return enrichedJournal;
  }, [enrichedJournal, kindFilter]);

  const familyOptions = useMemo(() => {
    const counts = new Map<string, { key: string; shortLabel: string; count: number }>();
    for (const r of kindFiltered) {
      const cur = counts.get(r.family.key) ?? {
        key: r.family.key,
        shortLabel: r.family.shortLabel,
        count: 0,
      };
      cur.count += 1;
      counts.set(r.family.key, cur);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [kindFiltered]);

  const familyFiltered = useMemo(() => {
    if (familyFilter === "all") return kindFiltered;
    return kindFiltered.filter((r) => r.family.key === familyFilter);
  }, [familyFilter, kindFiltered]);

  const statusCounts = useMemo(() => {
    let won = 0;
    let lost = 0;
    let push = 0;
    let pending = 0;
    for (const r of familyFiltered) {
      if (r.auditStatus === "won") won += 1;
      else if (r.auditStatus === "lost") lost += 1;
      else if (r.auditStatus === "push") push += 1;
      else pending += 1;
    }
    return { won, lost, push, pending };
  }, [familyFiltered]);

  const statusFilterButtons: ReadonlyArray<readonly [PickStatusFilter, string]> = useMemo(() => {
    const items: Array<readonly [PickStatusFilter, string]> = [
      ["all", `Estado: Todos · ${familyFiltered.length}`],
      ["won", `Ganados · ${statusCounts.won}`],
      ["lost", `Perdidos · ${statusCounts.lost}`],
    ];
    if (statusCounts.push > 0) {
      items.push(["push", `Push · ${statusCounts.push}`]);
    }
    items.push(["pending", `Pendientes · ${statusCounts.pending}`]);
    return items;
  }, [
    familyFiltered.length,
    statusCounts.lost,
    statusCounts.pending,
    statusCounts.push,
    statusCounts.won,
  ]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return familyFiltered;
    return familyFiltered.filter((r) => r.auditStatus === statusFilter);
  }, [familyFiltered, statusFilter]);

  const visibleRows = useMemo(() => filtered.slice(0, shown), [filtered, shown]);

  const openTicketAction = useCallback(
    (entry: JournalEntry, isParlay: boolean) => {
      if (entry.status === "won") {
        onOpenWinningEntry(entry);
        return;
      }
      onOpenShareTicket({
        kind: isParlay ? "parlay" : "pick",
        title: entry.matchLabel,
        subtitle: `${entry.leagueLabel} · Mi récord PitchLab`,
        leagueLabel: entry.leagueLabel,
        pickLabel: entry.pickLabel,
        probability: Math.min(0.88, Math.max(0.05, 1 / entry.fairDecimal)),
        fairDecimal: entry.fairDecimal,
        marketDecimal: entry.userDecimal,
        units: entry.units,
        gameStatus: entry.status === "pending" ? "NS" : "FT",
        pickSlug: entry.pickId,
      });
    },
    [onOpenShareTicket, onOpenWinningEntry],
  );

  const handleConfirmClearWatchlist = useCallback(() => {
    if (onClearWatchlist) {
      onClearWatchlist();
      return;
    }
    for (const g of watchedGames) {
      onToggleWatchlist(g.id);
    }
  }, [onClearWatchlist, onToggleWatchlist, watchedGames]);

  return (
    <div className="pl-rec-stack">
      {activeLiveTrackedPicks.length > 0 ? (
        <div data-live-picks-tracker="">
          <SofascoreCard
            id={`${uid}-live-tracker`}
            title={`Tus picks en vivo (${activeLiveTrackedPicks.length})`}
            meta={
              <span className="inline-flex items-center gap-1.5">
                <span className="live-dot" aria-hidden="true" />
                <span>En tiempo real</span>
              </span>
            }
          >
            <div className="pl-rec-live-grid">
              {activeLiveTrackedPicks.map((live) => {
                const barNode = (
                  <LivePickProgressBar
                    pickLabel={live.pickLabel}
                    matchLabel={live.matchLabel}
                    clockLabel={live.clockLabel}
                    actualValue={live.actualValue}
                    targetLine={live.targetLine}
                    unitLabel={live.unitLabel}
                    direction={live.direction}
                    projectedFinal={live.projectedFinal}
                    asianState={live.asianState}
                    starterAlert={live.starterAlert}
                    starterAlertDetail={live.starterAlertDetail}
                  />
                );
                if (live.href) {
                  return (
                    <a
                      key={live.id}
                      href={live.href}
                      className="pl-rec-live-link"
                      onClick={(e) => {
                        if (!optActions?.navigateTo) return;
                        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                          return;
                        }
                        e.preventDefault();
                        optActions.navigateTo(live.href ?? "");
                      }}
                    >
                      {barNode}
                    </a>
                  );
                }
                return <div key={live.id}>{barNode}</div>;
              })}
            </div>
          </SofascoreCard>
        </div>
      ) : null}

      <SofascoreCard
        id="pl-rec-picks"
        title={`Picks sellados (${journal.length})`}
        meta={
          <div data-record-view-toggle="">
            <SofascoreTabs
              items={RECORD_VIEW_TABS}
              value={viewMode}
              onChange={(next) => setViewMode(next === "calendar" ? "calendar" : "list")}
              variant="segmented"
              ariaLabel="Modo de vista de picks"
            />
          </div>
        }
      >
        <div className="space-y-3">
          <p className="pl-rec-card-meta [text-wrap:pretty]">
            Sellados antes del arranque · registro inmutable sin edición ni borrado · simples y
            parlays pierna por pierna
          </p>

          {viewMode === "list" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="pl-rec-filter-row num"
                  role="group"
                  aria-label="Filtrar por tipo de boleto"
                  data-record-kind-filter=""
                >
                  {(
                    [
                      ["all", `Todos · ${journal.length}`],
                      ["single", `Simples · ${singleCount}`],
                      ["parlay", `Parlays · ${parlayCount}`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className="pl-rec-chip"
                      aria-pressed={kindFilter === key}
                      data-kind-filter={key}
                      onClick={() => {
                        setKindFilter(key);
                        setFamilyFilter("all");
                        setShown(PICKS_PAGE_SIZE);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div
                  className="pl-rec-filter-row num"
                  role="group"
                  aria-label="Filtrar picks por estado de liquidación"
                  data-record-status-filter=""
                >
                  {statusFilterButtons.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className="pl-rec-chip"
                      aria-pressed={statusFilter === key}
                      data-status-filter={key}
                      onClick={() => {
                        setStatusFilter(key);
                        setShown(PICKS_PAGE_SIZE);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {familyOptions.length > 1 ? (
                <div
                  className="pl-rec-filter-row num"
                  role="group"
                  aria-label="Filtrar picks por familia de mercado"
                  data-record-family-filter=""
                >
                  <button
                    type="button"
                    className="pl-rec-chip"
                    aria-pressed={familyFilter === "all"}
                    onClick={() => {
                      setFamilyFilter("all");
                      setShown(PICKS_PAGE_SIZE);
                    }}
                  >
                    Todas las familias
                  </button>
                  {familyOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className="pl-rec-chip"
                      aria-pressed={familyFilter === opt.key}
                      onClick={() => {
                        setFamilyFilter(opt.key);
                        setShown(PICKS_PAGE_SIZE);
                      }}
                    >
                      {opt.shortLabel} · {opt.count}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {viewMode === "calendar" ? (
            <DailyResultsCalendar buildMonth={buildCalendarMonth} mode="units" />
          ) : filtered.length === 0 ? (
            <SofascoreEmptyState
              title={
                journal.length === 0
                  ? "Todavía no sellas ningún pick"
                  : kindFilter === "parlay" && parlayCount === 0
                    ? "Todavía no sellas ningún parlay"
                    : "No tienes picks en este filtro"
              }
              description={
                journal.length === 0
                  ? "Elige un partido de hoy para registrar tu primer pick sellado antes del arranque."
                  : kindFilter === "parlay" && parlayCount === 0
                    ? "Ármalo en la pestaña Parlays y séllalo antes del arranque."
                    : "Prueba cambiando el filtro de estado, tipo o familia de mercado."
              }
              actionLabel={journal.length === 0 ? "Ver partidos de hoy" : undefined}
              onAction={journal.length === 0 ? onNavigateHome : undefined}
            />
          ) : (
            <div className="space-y-3">
              <div
                className="pl-sf-table-wrap pl-rec-ledger-wrap"
                tabIndex={0}
                role="region"
                aria-label="Tabla de picks sellados en Mi récord"
                data-pl-sf-table=""
              >
                <table className="pl-sf-table pl-rec-ledger-table">
                  <caption className="sr-only">
                    Registro auditable e inmutable de picks sellados con momio capturado, EV, CLV y
                    estado final
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="pl-sf-th">
                        Corte
                      </th>
                      <th scope="col" className="pl-sf-th is-sticky-col">
                        Partido, mercado y pick
                      </th>
                      <th scope="col" className="pl-sf-th">
                        Familia
                      </th>
                      <th scope="col" className="pl-sf-th is-end num">
                        Unid.
                      </th>
                      <th scope="col" className="pl-sf-th is-end num">
                        Momio / Casa
                      </th>
                      <th scope="col" className="pl-sf-th is-end num">
                        EV / CLV
                      </th>
                      <th scope="col" className="pl-sf-th is-end">
                        Estado
                      </th>
                      <th scope="col" className="pl-sf-th is-end">
                        Boleto
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const {
                        item,
                        isParlay,
                        auditStatus,
                        family,
                        evPct,
                        netUnits,
                        bookLabel,
                        finalScore,
                        isFinishedMatch,
                        legs,
                        liveProgress,
                      } = row;
                      const statusMeta = getAuditStatusMeta(auditStatus);
                      const expanded = Boolean(expandedParlayIds[item.id]);
                      const wonLegs = legs.filter((l) => l.status === "won").length;
                      const lostLegs = legs.filter((l) => l.status === "lost").length;
                      const pushLegs = legs.filter((l) => l.status === "push").length;
                      const legPct =
                        legs.length > 0 ? Math.round((wonLegs / legs.length) * 100) : 0;
                      const deskPanelId = `${uid}-desk-legs-${item.id}`;

                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            className="pl-sf-tr pl-rec-ledger-tr"
                            data-record-row={isParlay ? "parlay" : "single"}
                            data-audit-status={auditStatus}
                          >
                            <td
                              className="pl-sf-td text-xs num whitespace-nowrap"
                              data-label="Corte"
                              style={{ color: "var(--pl-text-muted)" }}
                            >
                              {item.sealedAt}
                            </td>
                            <th
                              scope="row"
                              className="pl-sf-td is-sticky-col pl-rec-ledger-main"
                              data-label="Pick"
                            >
                              {isParlay ? (
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="pl-pill pl-pill--brand num text-[11px]">
                                      Parlay · {legs.length} piernas
                                    </span>
                                    <span
                                      className="text-xs font-bold num"
                                      style={{
                                        color:
                                          lostLegs > 0
                                            ? "var(--pl-danger)"
                                            : "var(--pl-text-secondary)",
                                      }}
                                    >
                                      {wonLegs}/{legs.length} cumplidas
                                      {pushLegs > 0 ? ` · ${pushLegs} push` : ""}
                                    </span>
                                    <button
                                      type="button"
                                      className="pl-rec-leg-toggle"
                                      aria-expanded={expanded}
                                      aria-controls={deskPanelId}
                                      data-parlay-legs-toggle={item.id}
                                      onClick={() => toggleParlayExpanded(item.id)}
                                    >
                                      <span>{expanded ? "Ocultar piernas" : "Ver piernas"}</span>
                                      <MaestroIcon
                                        name="chevronDown"
                                        size={13}
                                        style={{
                                          transform: expanded ? "rotate(180deg)" : undefined,
                                          transition: "transform 160ms ease",
                                        }}
                                      />
                                    </button>
                                  </div>
                                  <div className="pl-rec-parlay-progress" aria-hidden="true">
                                    <span
                                      className={`pl-rec-parlay-progress-fill ${lostLegs > 0 ? "is-lost" : ""}`.trim()}
                                      style={{ width: `${legPct}%` }}
                                    />
                                  </div>
                                  <strong className="block font-bold text-xs sm:text-sm">
                                    {item.pickLabel}
                                  </strong>
                                  {item.note ? (
                                    <span
                                      className="block text-xs font-normal"
                                      style={{ color: "var(--pl-text-muted)" }}
                                    >
                                      “{item.note}”
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <strong className="font-bold">{item.pickLabel}</strong>
                                    {finalScore ? (
                                      <span className="pl-hist-score-pill num text-[11px]">
                                        FT {finalScore}
                                      </span>
                                    ) : isFinishedMatch && auditStatus === "pending" ? (
                                      <span className="pl-pill text-[10px]">FT · liquidando</span>
                                    ) : null}
                                  </div>
                                  <span
                                    className="block text-xs font-normal"
                                    style={{ color: "var(--pl-text-muted)" }}
                                  >
                                    {item.leagueLabel} · {item.matchLabel}
                                    {item.note ? ` — “${item.note}”` : ""}
                                  </span>
                                </div>
                              )}

                              {liveProgress ? (
                                <div className="pt-2">
                                  <LivePickProgressBar
                                    pickLabel={liveProgress.pickLabel}
                                    matchLabel={liveProgress.matchLabel}
                                    clockLabel={liveProgress.clockLabel}
                                    actualValue={liveProgress.actualValue}
                                    targetLine={liveProgress.targetLine}
                                    unitLabel={liveProgress.unitLabel}
                                    direction={liveProgress.direction}
                                    projectedFinal={liveProgress.projectedFinal}
                                    asianState={liveProgress.asianState}
                                    starterAlert={liveProgress.starterAlert}
                                    starterAlertDetail={liveProgress.starterAlertDetail}
                                    compact
                                  />
                                </div>
                              ) : null}
                            </th>
                            <td className="pl-sf-td" data-label="Familia">
                              <div className="inline-flex flex-col items-start gap-0.5">
                                <span className="pl-pill text-[11px]">{family.shortLabel}</span>
                                <span
                                  className="text-[11px]"
                                  style={{ color: "var(--pl-text-muted)" }}
                                >
                                  {ORIGIN_SHORT_LABEL[item.origin] ?? item.origin}
                                </span>
                              </div>
                            </td>
                            <td
                              className="pl-sf-td is-end num font-bold whitespace-nowrap"
                              data-label="Unid."
                            >
                              {item.units.toFixed(2)}u
                            </td>
                            <td
                              className="pl-sf-td is-end num whitespace-nowrap"
                              data-label="Momio / Casa"
                            >
                              <span className="font-bold">
                                {formatOddsValue(item.userDecimal, oddsFormat)}
                              </span>
                              <span
                                className="block text-xs"
                                style={{ color: "var(--pl-text-muted)" }}
                              >
                                Justo {formatOddsValue(item.fairDecimal, oddsFormat)}
                              </span>
                              {bookLabel ? (
                                <span
                                  className="block text-[11px] font-semibold"
                                  style={{ color: "var(--pl-text-secondary)" }}
                                >
                                  {bookLabel}
                                </span>
                              ) : null}
                            </td>
                            <td
                              className="pl-sf-td is-end num whitespace-nowrap"
                              data-label="EV / CLV"
                            >
                              <span
                                className="font-bold"
                                style={{
                                  color:
                                    evPct !== null && evPct > 0
                                      ? "var(--pl-success)"
                                      : item.clvPct >= 0
                                        ? "var(--pl-success)"
                                        : "var(--pl-warning)",
                                }}
                              >
                                {evPct !== null
                                  ? `EV ${formatSignedPctValue(evPct)}`
                                  : `CLV ${formatSignedPctValue(item.clvPct)}`}
                              </span>
                              <span
                                className="block text-[11px]"
                                style={{ color: "var(--pl-text-muted)" }}
                              >
                                CLV {formatSignedPctValue(item.clvPct)}
                                {typeof item.closingDecimal === "number" &&
                                Number.isFinite(item.closingDecimal) &&
                                item.closingDecimal > 1
                                  ? ` · Cierre ${formatOddsValue(item.closingDecimal, oddsFormat)}`
                                  : ""}
                              </span>
                            </td>
                            <td
                              className="pl-sf-td is-end whitespace-nowrap"
                              data-label="Estado"
                            >
                              <div className="inline-flex flex-col items-end gap-0.5">
                                <span className={statusMeta.pillClass}>
                                  <MaestroIcon name={statusMeta.icon} size={11} />
                                  <span>{statusMeta.label}</span>
                                </span>
                                {netUnits !== null ? (
                                  <span
                                    className={`text-[11px] font-bold num ${
                                      netUnits > 0
                                        ? "pl-rec-pos"
                                        : netUnits < 0
                                          ? "pl-rec-neg"
                                          : ""
                                    }`}
                                    style={
                                      netUnits === 0
                                        ? { color: "var(--pl-text-muted)" }
                                        : undefined
                                    }
                                  >
                                    {formatSignedUnits(netUnits)}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="pl-sf-td is-end" data-label="Boleto">
                              <Button
                                variant={item.status === "won" ? "primary" : "secondary"}
                                size="sm"
                                aria-label={`Compartir boleto ${item.pickLabel}`}
                                onClick={() => openTicketAction(item, isParlay)}
                              >
                                <MaestroIcon name="share" size={13} />
                                <span>{item.status === "won" ? "Boleto" : "Compartir"}</span>
                              </Button>
                            </td>
                          </tr>
                          {isParlay && expanded ? (
                            <tr
                              id={deskPanelId}
                              className="pl-rec-parlay-legs-row"
                              data-parlay-legs-panel={item.id}
                            >
                              <td colSpan={8} className="pl-sf-td">
                                <ParlayLegsList
                                  legs={legs}
                                  oddsFormat={oddsFormat}
                                  liveLegs={liveProgress?.legs}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filtered.length > shown ? (
                <div className="flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShown((prev) => prev + PICKS_PAGE_SIZE)}
                  >
                    Ver más ({filtered.length - shown})
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </SofascoreCard>

      <SofascoreCard
        id="pl-rec-watch"
        title={`Partidos en vigilancia (${watchedGames.length})`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            {watchedGames.length >= 2 ? (
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                data-clear-watchlist-trigger=""
                onClick={() => setConfirmClearWatchOpen(true)}
              >
                <MaestroIcon name="trash" size={13} />
                <span>Limpiar vigilancia</span>
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={onNavigateHome}>
              <span>Explorar jornada</span>
              <MaestroIcon name="chevronRight" size={14} />
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="pl-rec-card-meta [text-wrap:pretty]">
            Te avisamos si surge valor nuevo en estos partidos antes del arranque.
          </p>

          {watchedGames.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {watchedGames.map((g) => (
                <MatchTicketCard key={g.id} game={g} />
              ))}
            </div>
          ) : null}

          {suggestedUpcoming.length > 0 ? (
            <div className="space-y-2 pt-1">
              <span
                className="block text-xs font-bold"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {watchedGames.length === 0
                  ? "Vigila partidos próximos:"
                  : "Agregar más partidos a vigilancia:"}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {suggestedUpcoming.map((g) => (
                  <div key={g.id} className="pl-rec-watch-suggest">
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamBadge
                        league={g.league}
                        slug={g.home.slug}
                        name={g.home.name}
                        logoUrl={g.home.logoUrl}
                        size={20}
                      />
                      <div className="min-w-0">
                        <strong className="block text-xs font-bold truncate">
                          {g.home.shortName} vs {g.away.shortName}
                        </strong>
                        <span
                          className="block text-xs num truncate"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {g.leagueLabel} · {shortDateLabel(g.dayId)} · {g.kickoffLocal}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onToggleWatchlist(g.id)}
                    >
                      <MaestroIcon name="bell" size={13} />
                      <span>+ Vigilar</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SofascoreCard>

      <ConfirmActionDialog
        open={confirmClearWatchOpen}
        title={`¿Limpiar ${watchedGames.length} partidos en vigilancia?`}
        description="Se quitarán todos los partidos de tu lista de vigilancia. Podrás volver a seguirlos cuando quieras; tus picks sellados no se ven afectados."
        confirmLabel="Limpiar vigilancia"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={handleConfirmClearWatchlist}
        onCancel={() => setConfirmClearWatchOpen(false)}
      />
    </div>
  );
}
