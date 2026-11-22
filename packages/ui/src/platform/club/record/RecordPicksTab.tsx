"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { parseStrictFiniteNumber, type LivePhase } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreTabs,
  type SofascoreTabItem,
} from "../../../components/ui/primitives";
import { LeagueBadge, TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import {
  LivePickProgressBar,
  type LiveAsianPickState,
  type LivePickLineupAlert,
} from "../../atomic";
import { DailyResultsCalendar } from "../../components/DailyResultsCalendar";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { MatchTicketCard } from "../../components/MatchTicketCard";
import { MarketCategoryIcon } from "../../components/PackSportIcons";
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
  buildParlayMatchSummary,
  buildParlayPickSummary,
  classifyMarketFamily,
  computeJournalEntryClvPct,
  computeJournalEntryEvPct,
  computeJournalSettlementUnits,
  getAuditStatusMeta,
  normalizePickLabelWithUnit,
  resolveCapturedBookLabel,
  sanitizeJournalDisplayNote,
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

interface LeagueMetaEntry {
  readonly league: PlatformGame["league"];
  readonly logoUrl?: string;
  readonly sport: PlatformGame["sport"];
}

interface ResolvedTeamBadgeInfo {
  readonly slug: string;
  readonly name: string;
  readonly shortName: string;
  readonly logoUrl?: string;
}

interface ResolvedLegDisplay {
  readonly key: string;
  readonly gameId?: string;
  readonly pickId?: string;
  readonly index: number;
  readonly leagueId?: PlatformGame["league"];
  readonly leagueLogoUrl?: string;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly shortMatchLabel: string;
  readonly homeTeam?: ResolvedTeamBadgeInfo;
  readonly awayTeam?: ResolvedTeamBadgeInfo;
  readonly pickLabel: string;
  readonly marketFamilyKey: string;
  readonly marketFamilyShort: string;
  readonly p: number | null;
  readonly fairDecimal: number | null;
  readonly closingDecimal: number | null;
  readonly clvPct: number | null;
  readonly scoreLabel: string | null;
  readonly status: AuditPickStatus;
}

function LegEmblemCluster({
  leagueId,
  leagueLabel,
  leagueLogoUrl,
  homeTeam,
  awayTeam,
  size,
}: {
  leagueId?: PlatformGame["league"];
  leagueLabel: string;
  leagueLogoUrl?: string;
  homeTeam?: ResolvedTeamBadgeInfo;
  awayTeam?: ResolvedTeamBadgeInfo;
  size: number;
}): React.JSX.Element | null {
  if (leagueId && homeTeam && awayTeam) {
    return (
      <span className="pl-rec-badge-pair" aria-hidden="true">
        <TeamBadge
          league={leagueId}
          slug={homeTeam.slug}
          name={homeTeam.name}
          logoUrl={homeTeam.logoUrl || undefined}
          size={size}
        />
        <TeamBadge
          league={leagueId}
          slug={awayTeam.slug}
          name={awayTeam.name}
          logoUrl={awayTeam.logoUrl || undefined}
          size={size}
        />
      </span>
    );
  }
  if (leagueId) {
    return (
      <LeagueBadge
        league={leagueId}
        label={leagueLabel}
        logoUrl={leagueLogoUrl || undefined}
        size={size}
      />
    );
  }
  return null;
}

function resolveParlayLegsForDisplay(
  entry: JournalEntry,
  gameById: ReadonlyMap<string, PlatformGame>,
  leagueMetaByLabel: ReadonlyMap<string, LeagueMetaEntry>,
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
      const leagueLabel = leg.leagueLabel ?? linkedGame?.leagueLabel ?? entry.leagueLabel;
      const leagueMeta = leagueMetaByLabel.get(leagueLabel.trim().toLowerCase());
      const scoreLabel =
        res && Number.isFinite(res.homeScore) && Number.isFinite(res.awayScore)
          ? `${res.homeScore}–${res.awayScore}`
          : linkedGame?.status === "FT" && linkedGame.score
            ? `${linkedGame.score.home}–${linkedGame.score.away}`
            : null;
      const rawPickLabel = leg.pickLabel ?? leg.selection ?? leg.pickId;
      const pickLabel = normalizePickLabelWithUnit({
        pickLabel: rawPickLabel,
        market: leg.market,
        leagueLabel,
        sport: linkedGame?.sport ?? leagueMeta?.sport ?? null,
      });
      const family = classifyMarketFamily({
        market: leg.market,
        pickLabel,
      });
      const fullMatchLabel =
        leg.matchLabel?.trim() ||
        (linkedGame ? `${linkedGame.home.name} vs ${linkedGame.away.name}` : `Pierna ${i + 1}`);
      const shortMatchLabel = linkedGame
        ? `${linkedGame.home.shortName} vs ${linkedGame.away.shortName}`
        : fullMatchLabel;

      return {
        key: `${leg.gameId}-${leg.pickId}-${i}`,
        gameId: leg.gameId,
        pickId: leg.pickId,
        index: i + 1,
        leagueId: linkedGame?.league ?? leagueMeta?.league,
        leagueLogoUrl: linkedGame?.leagueLogoUrl ?? leagueMeta?.logoUrl,
        leagueLabel,
        matchLabel: fullMatchLabel,
        shortMatchLabel,
        homeTeam: linkedGame
          ? {
              slug: linkedGame.home.slug,
              name: linkedGame.home.name,
              shortName: linkedGame.home.shortName,
              logoUrl: linkedGame.home.logoUrl,
            }
          : undefined,
        awayTeam: linkedGame
          ? {
              slug: linkedGame.away.slug,
              name: linkedGame.away.name,
              shortName: linkedGame.away.shortName,
              logoUrl: linkedGame.away.logoUrl,
            }
          : undefined,
        pickLabel,
        marketFamilyKey: family.key,
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
          res &&
          typeof res.clvPct === "number" &&
          Number.isFinite(res.clvPct) &&
          Math.abs(res.clvPct) <= 35
            ? res.clvPct
            : null,
        scoreLabel,
        status,
      };
    });
  }

  const leagueMeta = leagueMetaByLabel.get(entry.leagueLabel.trim().toLowerCase());
  const parts = entry.pickLabel
    .split(/\s+[+·]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((rawPart, i) => {
    const colonIdx = rawPart.indexOf(": ");
    const parsedMatch = colonIdx > 0 ? rawPart.slice(0, colonIdx).trim() : `Pierna ${i + 1}`;
    const parsedPick = colonIdx > 0 ? rawPart.slice(colonIdx + 2).trim() : rawPart;
    const normalizedLabel = normalizePickLabelWithUnit({
      pickLabel: parsedPick,
      leagueLabel: entry.leagueLabel,
      sport: leagueMeta?.sport ?? null,
    });
    const family = classifyMarketFamily({ pickLabel: normalizedLabel });
    return {
      key: `${entry.id}-legacy-${i}`,
      index: i + 1,
      leagueId: leagueMeta?.league,
      leagueLogoUrl: leagueMeta?.logoUrl,
      leagueLabel: entry.leagueLabel,
      matchLabel: parsedMatch,
      shortMatchLabel: parsedMatch,
      pickLabel: normalizedLabel,
      marketFamilyKey: family.key,
      marketFamilyShort: family.shortLabel,
      p: null,
      fairDecimal: null,
      closingDecimal: null,
      clvPct: null,
      scoreLabel: null,
      status: fallbackStatus,
    };
  });
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
                <LegEmblemCluster
                  leagueId={leg.leagueId}
                  leagueLabel={leg.leagueLabel}
                  leagueLogoUrl={leg.leagueLogoUrl}
                  homeTeam={leg.homeTeam}
                  awayTeam={leg.awayTeam}
                  size={18}
                />
                <MarketCategoryIcon family={leg.marketFamilyKey} size={15} />
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
  onNavigatePicks,
  onNavigateParlays,
  onNavigateVerify,
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
  onNavigatePicks?: () => void;
  onNavigateParlays?: () => void;
  onNavigateVerify?: () => void;
  onOpenWinningEntry: (entry: JournalEntry) => void;
  onOpenShareTicket: (payload: ShareTicketPayload) => void;
  onClearWatchlist?: () => void;
  overrideLiveTrackedPicks?: readonly LiveTrackedPickSnapshot[];
}): React.JSX.Element {
  const uid = useId();
  const kindLabelId = `${uid}-kind-label`;
  const statusLabelId = `${uid}-status-label`;
  const familyLabelId = `${uid}-family-label`;
  const tableCaptionId = `${uid}-ledger-caption`;
  const [statusFilter, setStatusFilter] = useState<PickStatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<PickKindFilter>("all");
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [expandedParlayIds, setExpandedParlayIds] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<RecordViewMode>("list");
  const [shown, setShown] = useState<number>(PICKS_PAGE_SIZE);
  const [confirmClearWatchOpen, setConfirmClearWatchOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState<boolean>(() => watchedGames.length > 0);

  const [serverLiveItems, setServerLiveItems] = useState<readonly LiveTrackedPickSnapshot[]>([]);
  const [serverPollSeconds, setServerPollSeconds] = useState<number | null>(null);
  const [livePollBlocked, setLivePollBlocked] = useState<boolean>(false);

  const optCore = useOptionalPlatformCore();
  const optActions = useOptionalPlatformActions();
  const userTz = optCore?.userTimezone ?? "America/Mexico_City";
  const allGames = optCore?.dataset.games ?? watchedGames;
  const hasAccountSessionAuth = Boolean(optCore?.hasAccountSessionAuth);

  const gameById = useMemo(() => new Map(allGames.map((g) => [g.id, g])), [allGames]);

  const leagueMetaByLabel = useMemo(() => {
    const map = new Map<string, LeagueMetaEntry>();
    for (const item of optCore?.dataset.leagues ?? []) {
      map.set(item.label.trim().toLowerCase(), {
        league: item.league,
        logoUrl: item.logoUrl,
        sport: item.sport,
      });
    }
    for (const g of allGames) {
      const key = g.leagueLabel.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          league: g.league,
          logoUrl: g.leagueLogoUrl,
          sport: g.sport,
        });
      }
    }
    return map;
  }, [allGames, optCore?.dataset.leagues]);

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
      const displayPickLabel = normalizePickLabelWithUnit({
        pickLabel: entry.pickLabel,
        leagueLabel: entry.leagueLabel,
        sport: linkedGame.sport,
      });
      const isUnder =
        displayPickLabel.toLowerCase().includes("menos de") ||
        displayPickLabel.toLowerCase().includes("under");
      out.push({
        id: entry.id,
        pickId: entry.pickId,
        gameId: entry.gameId,
        pickKind: isParlayJournalEntry(entry) ? "parlay" : "single",
        phase: "live",
        matchLabel: entry.matchLabel,
        pickLabel: displayPickLabel,
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

  const enrichedJournal = useMemo(
    () =>
      journal.map((item) => {
        const isParlay = isParlayJournalEntry(item);
        const linkedGame = gameById.get(item.gameId);
        const linkedPick = pickById.get(item.pickId);
        const singleLeagueMeta = leagueMetaByLabel.get(item.leagueLabel.trim().toLowerCase());
        const auditStatus = auditStatusFromJournal(item.status);
        const legs = isParlay
          ? resolveParlayLegsForDisplay(item, gameById, leagueMetaByLabel)
          : [];
        const displayPickLabel = isParlay
          ? buildParlayPickSummary(legs) || item.pickLabel
          : normalizePickLabelWithUnit({
              pickLabel: item.pickLabel,
              market: linkedPick?.market,
              leagueLabel: item.leagueLabel,
              sport: linkedGame?.sport ?? singleLeagueMeta?.sport ?? null,
            });
        const displayMatchLabel = isParlay
          ? buildParlayMatchSummary(legs)
          : linkedGame
            ? `${linkedGame.home.shortName} vs ${linkedGame.away.shortName}`
            : item.matchLabel;
        const displayNote = sanitizeJournalDisplayNote(item.note);
        const family = classifyMarketFamily({
          market: linkedPick?.market ?? item.parlayLegs?.[0]?.market,
          marketGroup: linkedPick?.marketGroup,
          pickLabel: displayPickLabel,
          origin: item.origin,
          isParlay,
        });
        const evPct = computeJournalEntryEvPct(item);
        const credibleClvPct = computeJournalEntryClvPct(item);
        const netUnits = computeJournalSettlementUnits(item);
        const bookLabel = resolveCapturedBookLabel(linkedPick);
        const finalScore =
          linkedGame?.status === "FT" && linkedGame.score
            ? `${linkedGame.score.home}–${linkedGame.score.away}`
            : null;
        const isFinishedMatch = linkedGame?.status === "FT";
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
          credibleClvPct,
          netUnits,
          bookLabel,
          finalScore,
          isFinishedMatch,
          legs,
          liveProgress,
          linkedGame,
          singleLeagueMeta,
          displayPickLabel,
          displayMatchLabel,
          displayNote,
        };
      }),
    [gameById, journal, leagueMetaByLabel, liveTrackByKey, pickById],
  );

  const buildCalendarMonth = useCallback(
    (ym: string) =>
      buildMonthlyRecordCalendar(
        enrichedJournal.map((row) => ({
          ...row.item,
          pickLabel: row.displayPickLabel,
          matchLabel: row.displayMatchLabel,
        })),
        ym || undefined,
        {
          timeZone: userTz,
          includeNetUnits: true,
        },
      ),
    [enrichedJournal, userTz],
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

  const kindFilterButtons: ReadonlyArray<readonly [PickKindFilter, string]> = useMemo(() => {
    const showCounts = journal.length > 0;
    return [
      ["all", showCounts ? `Todos · ${journal.length}` : "Todos"],
      ["single", showCounts ? `Simples · ${singleCount}` : "Simples"],
      ["parlay", showCounts ? `Parlays · ${parlayCount}` : "Parlays"],
    ];
  }, [journal.length, parlayCount, singleCount]);

  const statusFilterButtons: ReadonlyArray<readonly [PickStatusFilter, string]> = useMemo(() => {
    const showCounts = journal.length > 0;
    const items: Array<readonly [PickStatusFilter, string]> = [
      ["all", showCounts ? `Todos · ${familyFiltered.length}` : "Todos"],
      ["won", showCounts ? `Ganados · ${statusCounts.won}` : "Ganados"],
      ["lost", showCounts ? `Perdidos · ${statusCounts.lost}` : "Perdidos"],
    ];
    if (statusCounts.push > 0) {
      items.push(["push", `Push · ${statusCounts.push}`]);
    }
    items.push(["pending", showCounts ? `Pendientes · ${statusCounts.pending}` : "Pendientes"]);
    return items;
  }, [
    familyFiltered.length,
    journal.length,
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

  const goToPicks = useCallback(() => {
    if (onNavigatePicks) {
      onNavigatePicks();
      return;
    }
    if (optActions?.navigateTo) {
      optActions.navigateTo("/app/picks");
      return;
    }
    onNavigateHome();
  }, [onNavigateHome, onNavigatePicks, optActions]);

  const goToParlays = useCallback(() => {
    if (onNavigateParlays) {
      onNavigateParlays();
      return;
    }
    if (optActions?.navigateTo) {
      optActions.navigateTo("/app/parlays");
      return;
    }
    onNavigateHome();
  }, [onNavigateHome, onNavigateParlays, optActions]);

  const handleOpenVerify = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      if (onNavigateVerify) {
        event.preventDefault();
        onNavigateVerify();
        return;
      }
      if (optActions?.navigateTo) {
        event.preventDefault();
        optActions.navigateTo("/verificacion");
      }
    },
    [onNavigateVerify, optActions],
  );

  const openTicketAction = useCallback(
    (entry: JournalEntry, isParlay: boolean, displayMatchLabel: string, displayPickLabel: string) => {
      const normalizedEntry: JournalEntry = {
        ...entry,
        matchLabel: displayMatchLabel,
        pickLabel: displayPickLabel,
        note: sanitizeJournalDisplayNote(entry.note) ?? undefined,
      };
      if (entry.status === "won") {
        onOpenWinningEntry(normalizedEntry);
        return;
      }
      onOpenShareTicket({
        kind: isParlay ? "parlay" : "pick",
        title: displayMatchLabel,
        subtitle: `${entry.leagueLabel} · Mi récord PitchLab`,
        leagueLabel: entry.leagueLabel,
        pickLabel: displayPickLabel,
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
                <MaestroIcon name="live-pulse" size={14} />
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
          {viewMode === "list" ? (
            <div className="space-y-2.5">
              <div className="pl-rec-filter-bar">
                <div className="pl-rec-filter-group">
                  <span id={kindLabelId} className="pl-rec-filter-label">
                    Tipo
                  </span>
                  <div
                    className="pl-rec-segmented num"
                    role="group"
                    aria-labelledby={kindLabelId}
                    data-record-kind-filter=""
                  >
                    {kindFilterButtons.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className="pl-rec-seg-btn"
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
                </div>

                <div className="pl-rec-filter-group">
                  <span id={statusLabelId} className="pl-rec-filter-label">
                    Estado
                  </span>
                  <div
                    className="pl-rec-segmented num"
                    role="group"
                    aria-labelledby={statusLabelId}
                    data-record-status-filter=""
                  >
                    {statusFilterButtons.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className="pl-rec-seg-btn"
                        aria-pressed={statusFilter === key}
                        data-status-filter={key}
                        onClick={() => {
                          setStatusFilter(key);
                          setShown(PICKS_PAGE_SIZE);
                        }}
                      >
                        {key === "push" ? <MaestroIcon name="push-void" size={12} /> : null}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {familyOptions.length > 1 ? (
                <div className="pl-rec-filter-group">
                  <span id={familyLabelId} className="pl-rec-filter-label">
                    Mercado
                  </span>
                  <div
                    className="pl-rec-filter-row num"
                    role="group"
                    aria-labelledby={familyLabelId}
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
                      Todos
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
                        <MarketCategoryIcon family={opt.key} size={14} />
                        <span>
                          {opt.shortLabel} · {opt.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {viewMode === "calendar" ? (
            <DailyResultsCalendar buildMonth={buildCalendarMonth} mode="units" />
          ) : filtered.length === 0 ? (
            <div className="pl-sf-empty pl-rec-empty-state" data-pl-sf-empty="">
              <span className="pl-rec-empty-icon" aria-hidden="true">
                <MaestroIcon
                  name={kindFilter === "parlay" && parlayCount === 0 ? "layers" : "target-picks"}
                  size={28}
                />
              </span>
              <p className="pl-sf-empty-title">
                {journal.length === 0
                  ? "Todavía no sellas ningún pick"
                  : kindFilter === "parlay" && parlayCount === 0
                    ? "Todavía no sellas ningún parlay"
                    : "No tienes picks en este filtro"}
              </p>
              <p className="pl-sf-empty-desc [text-wrap:pretty]">
                {journal.length === 0
                  ? "Sella tu primer pick o combina 2 a 6 selecciones antes del arranque para llevar registro inmutable y seguimiento en vivo."
                  : kindFilter === "parlay" && parlayCount === 0
                    ? "Combina selecciones en Parlays y séllalo antes del arranque con desglose pierna por pierna."
                    : "Prueba cambiando el filtro de tipo, estado o mercado."}
              </p>
              <div className="pl-rec-empty-actions">
                {journal.length === 0 ? (
                  <>
                    <Button variant="primary" size="sm" onClick={goToPicks}>
                      <MaestroIcon name="target-picks" size={14} />
                      <span>Ir a Picks</span>
                    </Button>
                    <Button variant="secondary" size="sm" onClick={goToParlays}>
                      <MaestroIcon name="layers" size={14} />
                      <span>Armar parlay</span>
                    </Button>
                  </>
                ) : kindFilter === "parlay" && parlayCount === 0 ? (
                  <Button variant="primary" size="sm" onClick={goToParlays}>
                    <MaestroIcon name="layers" size={14} />
                    <span>Armar parlay</span>
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setKindFilter("all");
                      setStatusFilter("all");
                      setFamilyFilter("all");
                      setShown(PICKS_PAGE_SIZE);
                    }}
                  >
                    Mostrar todos
                  </Button>
                )}
              </div>
              {journal.length === 0 ? (
                <a
                  href="/verificacion"
                  className="pl-rec-verify-link"
                  onClick={handleOpenVerify}
                >
                  <MaestroIcon name="verified-seal" size={13} />
                  <span>Cómo funciona la verificación SHA-256</span>
                </a>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className="pl-sf-table-wrap pl-rec-ledger-wrap"
                tabIndex={0}
                role="region"
                aria-labelledby={tableCaptionId}
                data-pl-sf-table=""
              >
                <table className="pl-sf-table pl-rec-ledger-table">
                  <caption id={tableCaptionId} className="sr-only">
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
                        credibleClvPct,
                        netUnits,
                        bookLabel,
                        finalScore,
                        isFinishedMatch,
                        legs,
                        liveProgress,
                        linkedGame,
                        singleLeagueMeta,
                        displayPickLabel,
                        displayMatchLabel,
                        displayNote,
                      } = row;
                      const statusMeta = getAuditStatusMeta(auditStatus);
                      const expanded = Boolean(expandedParlayIds[item.id]);
                      const wonLegs = legs.filter((l) => l.status === "won").length;
                      const lostLegs = legs.filter((l) => l.status === "lost").length;
                      const pushLegs = legs.filter((l) => l.status === "push").length;
                      const legPct =
                        legs.length > 0 ? Math.round((wonLegs / legs.length) * 100) : 0;
                      const deskPanelId = `${uid}-desk-legs-${item.id}`;
                      const previewLegs = legs.slice(0, 3);
                      const hiddenPreviewCount = Math.max(0, legs.length - previewLegs.length);
                      const hasClosingOdds =
                        typeof item.closingDecimal === "number" &&
                        Number.isFinite(item.closingDecimal) &&
                        item.closingDecimal > 1;

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
                                  <ul className="pl-rec-parlay-preview" role="list">
                                    {previewLegs.map((leg) => {
                                      const legMeta = getAuditStatusMeta(leg.status);
                                      return (
                                        <li key={leg.key} className="pl-rec-parlay-preview-item">
                                          <LegEmblemCluster
                                            leagueId={leg.leagueId}
                                            leagueLabel={leg.leagueLabel}
                                            leagueLogoUrl={leg.leagueLogoUrl}
                                            homeTeam={leg.homeTeam}
                                            awayTeam={leg.awayTeam}
                                            size={15}
                                          />
                                          <MarketCategoryIcon
                                            family={leg.marketFamilyKey}
                                            size={14}
                                          />
                                          <span className="pl-rec-parlay-preview-text">
                                            <span className="pl-rec-parlay-preview-match">
                                              {leg.shortMatchLabel}
                                            </span>
                                            <span
                                              aria-hidden="true"
                                              className="pl-rec-parlay-preview-sep"
                                            >
                                              ·
                                            </span>
                                            <strong className="pl-rec-parlay-preview-pick">
                                              {leg.pickLabel}
                                            </strong>
                                          </span>
                                          {leg.status !== "pending" ? (
                                            <span
                                              className={`${legMeta.histChipClass} num`}
                                              title={legMeta.spoken}
                                            >
                                              {legMeta.shortLabel}
                                            </span>
                                          ) : null}
                                        </li>
                                      );
                                    })}
                                    {hiddenPreviewCount > 0 ? (
                                      <li className="pl-rec-parlay-preview-more num">
                                        +{hiddenPreviewCount}{" "}
                                        {hiddenPreviewCount === 1
                                          ? "pierna adicional"
                                          : "piernas adicionales"}
                                      </li>
                                    ) : null}
                                  </ul>
                                  {displayNote ? (
                                    <span
                                      className="block text-xs font-normal"
                                      style={{ color: "var(--pl-text-muted)" }}
                                    >
                                      “{displayNote}”
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <LegEmblemCluster
                                      leagueId={linkedGame?.league ?? singleLeagueMeta?.league}
                                      leagueLabel={item.leagueLabel}
                                      leagueLogoUrl={
                                        linkedGame?.leagueLogoUrl ?? singleLeagueMeta?.logoUrl
                                      }
                                      homeTeam={
                                        linkedGame
                                          ? {
                                              slug: linkedGame.home.slug,
                                              name: linkedGame.home.name,
                                              shortName: linkedGame.home.shortName,
                                              logoUrl: linkedGame.home.logoUrl,
                                            }
                                          : undefined
                                      }
                                      awayTeam={
                                        linkedGame
                                          ? {
                                              slug: linkedGame.away.slug,
                                              name: linkedGame.away.name,
                                              shortName: linkedGame.away.shortName,
                                              logoUrl: linkedGame.away.logoUrl,
                                            }
                                          : undefined
                                      }
                                      size={16}
                                    />
                                    <strong className="font-bold">{displayPickLabel}</strong>
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
                                    {item.leagueLabel} · {displayMatchLabel}
                                    {displayNote ? ` — “${displayNote}”` : ""}
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
                              <div className="pl-rec-family-cell">
                                <span className="pl-pill text-[11px]">
                                  <MarketCategoryIcon family={family.key} size={13} />
                                  <span>{family.shortLabel}</span>
                                </span>
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
                              {evPct !== null ? (
                                <>
                                  <span
                                    className="font-bold"
                                    style={{
                                      color:
                                        evPct > 0
                                          ? "var(--pl-success)"
                                          : evPct < 0
                                            ? "var(--pl-warning)"
                                            : "var(--pl-text-secondary)",
                                    }}
                                  >
                                    EV {formatSignedPctValue(evPct)}
                                  </span>
                                  {credibleClvPct !== null || hasClosingOdds ? (
                                    <span
                                      className="block text-[11px]"
                                      style={{ color: "var(--pl-text-muted)" }}
                                    >
                                      {credibleClvPct !== null
                                        ? `CLV ${formatSignedPctValue(credibleClvPct)}`
                                        : ""}
                                      {credibleClvPct !== null && hasClosingOdds ? " · " : ""}
                                      {hasClosingOdds && item.closingDecimal
                                        ? `Cierre ${formatOddsValue(item.closingDecimal, oddsFormat)}`
                                        : ""}
                                    </span>
                                  ) : null}
                                </>
                              ) : credibleClvPct !== null ? (
                                <>
                                  <span
                                    className="font-bold"
                                    style={{
                                      color:
                                        credibleClvPct >= 0
                                          ? "var(--pl-success)"
                                          : "var(--pl-warning)",
                                    }}
                                  >
                                    CLV {formatSignedPctValue(credibleClvPct)}
                                  </span>
                                  {hasClosingOdds && item.closingDecimal ? (
                                    <span
                                      className="block text-[11px]"
                                      style={{ color: "var(--pl-text-muted)" }}
                                    >
                                      Cierre {formatOddsValue(item.closingDecimal, oddsFormat)}
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span style={{ color: "var(--pl-text-muted)" }}>—</span>
                              )}
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
                                aria-label={`Compartir boleto ${displayPickLabel}`}
                                onClick={() =>
                                  openTicketAction(
                                    item,
                                    isParlay,
                                    displayMatchLabel,
                                    displayPickLabel,
                                  )
                                }
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

              <div className="pl-rec-ledger-footer">
                {filtered.length > shown ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShown((prev) => prev + PICKS_PAGE_SIZE)}
                  >
                    Ver más ({filtered.length - shown})
                  </Button>
                ) : (
                  <span className="pl-rec-card-meta">
                    Mostrando {visibleRows.length} de {filtered.length} sellados
                  </span>
                )}
                <a
                  href="/verificacion"
                  className="pl-rec-verify-link"
                  onClick={handleOpenVerify}
                >
                  <MaestroIcon name="verified-seal" size={13} />
                  <span>Auditar huella SHA-256 en /verificacion</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </SofascoreCard>

      <details
        id="pl-rec-watch"
        className="pl-sf-card pl-rec-watch-details"
        data-pl-sf-card=""
        open={watchOpen}
        onToggle={(event) => setWatchOpen(event.currentTarget.open)}
      >
        <summary className="pl-rec-watch-summary">
          <MaestroIcon name="chevronRight" size={14} className="pl-rec-watch-chevron" />
          <span className="pl-rec-watch-title">Partidos en vigilancia</span>
          <span className="pl-pill num">{watchedGames.length}</span>
          <span className="pl-rec-watch-hint">Avisos de valor antes del arranque</span>
        </summary>

        <div className="pl-sf-card-body pl-rec-watch-body">
          <div className="pl-rec-watch-toolbar">
            <p className="pl-rec-card-meta [text-wrap:pretty]">
              Te avisamos si surge valor nuevo en estos partidos antes del arranque.
            </p>
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
          </div>

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
                        logoUrl={g.home.logoUrl || undefined}
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
      </details>

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
