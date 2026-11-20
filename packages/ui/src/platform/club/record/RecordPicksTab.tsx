"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { DailyResultsCalendar } from "../../components/DailyResultsCalendar";
import { LivePicksTrackerStrip } from "../../components/LivePicksTrackerStrip";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { MatchTicketCard } from "../../components/MatchTicketCard";
import { ConfirmActionDialog } from "../../components/PlatformOverlays";
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

const ORIGIN_SHORT_LABEL: Record<string, string> = {
  "Spacetime Suite": "Modelo",
  "Parlay Combinado": "Parlay",
  "Player Prop": "Prop",
  Propio: "Propio",
};

export function isParlayJournalEntry(entry: JournalEntry): boolean {
  return (
    entry.pickKind === "parlay" ||
    entry.origin === "Parlay Combinado" ||
    (Array.isArray(entry.parlayLegs) && entry.parlayLegs.length > 0)
  );
}

interface ResolvedLegDisplay {
  readonly key: string;
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
        resultByKey.get(`${leg.gameId}::${leg.pickId}`) ??
        resultByKey.get(leg.pickId);
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
        index: i + 1,
        leagueLabel: leg.leagueLabel ?? entry.leagueLabel,
        matchLabel: leg.matchLabel ?? `Pierna ${i + 1}`,
        pickLabel,
        marketFamilyShort: family.shortLabel,
        p: typeof leg.p === "number" && Number.isFinite(leg.p) && leg.p > 0 && leg.p < 1 ? leg.p : null,
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

  // Respaldo legible para parlays antiguos sin arreglo `parlayLegs`
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
}: {
  legs: readonly ResolvedLegDisplay[];
  oddsFormat: OddsFormat;
}): React.JSX.Element {
  return (
    <ul className="pl-rec-parlay-legs" role="list">
      {legs.map((leg) => {
        const st = getAuditStatusMeta(leg.status);
        return (
          <li key={leg.key} className="pl-rec-parlay-leg">
            <div className="min-w-0 flex-1 space-y-0.5">
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
                  <span className="pl-hist-score-pill num text-[11px]">
                    FT {leg.scoreLabel}
                  </span>
                ) : null}
              </div>
              <span
                className="block text-[11px] truncate"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {leg.leagueLabel} · {leg.matchLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 num">
              {leg.p !== null ? (
                <span className="text-[11px] font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                  {(leg.p * 100).toFixed(0)} %
                </span>
              ) : null}
              {leg.fairDecimal !== null ? (
                <span className="text-xs font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
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
                  style={{ color: leg.clvPct >= 0 ? "var(--pl-success)" : "var(--pl-warning)" }}
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
}): React.JSX.Element {
  const uid = useId();
  const [statusFilter, setStatusFilter] = useState<PickStatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<PickKindFilter>("all");
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [expandedParlayIds, setExpandedParlayIds] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<RecordViewMode>("list");
  const [confirmClearWatchOpen, setConfirmClearWatchOpen] = useState(false);

  const optCore = useOptionalPlatformCore();
  const optActions = useOptionalPlatformActions();
  const userTz = optCore?.userTimezone ?? "America/Mexico_City";
  const allGames = optCore?.dataset.games ?? watchedGames;

  const gameById = useMemo(
    () => new Map(allGames.map((g) => [g.id, g])),
    [allGames],
  );

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
        };
      }),
    [gameById, journal, pickById],
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
  }, [familyFiltered.length, statusCounts.lost, statusCounts.pending, statusCounts.push, statusCounts.won]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return familyFiltered;
    return familyFiltered.filter((r) => r.auditStatus === statusFilter);
  }, [familyFiltered, statusFilter]);

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
      <LivePicksTrackerStrip
        journal={journal}
        games={allGames}
        onNavigate={optActions?.navigateTo}
      />

      <section className="pl-rec-card glass-card glass-ring" aria-labelledby="pl-rec-picks-heading">
        <div className="pl-rec-card-head">
          <div className="min-w-0">
            <h2 id="pl-rec-picks-heading" className="pl-rec-card-title [text-wrap:balance]">
              Picks sellados ({journal.length})
            </h2>
            <p className="pl-rec-card-meta [text-wrap:pretty]">
              Sellados antes del arranque · registro inmutable sin edición ni borrado · simples y
              parlays pierna por pierna
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="seg-well"
              role="group"
              aria-label="Modo de vista de picks"
              data-record-view-toggle=""
            >
              <button
                type="button"
                className="seg-btn text-xs min-h-11 sm:min-h-9"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                Lista
              </button>
              <button
                type="button"
                className="seg-btn text-xs min-h-11 sm:min-h-9"
                aria-pressed={viewMode === "calendar"}
                onClick={() => setViewMode("calendar")}
              >
                Calendario
              </button>
            </div>
          </div>
        </div>

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
                    className="pl-rec-chip min-h-11 sm:min-h-9"
                    aria-pressed={kindFilter === key}
                    data-kind-filter={key}
                    onClick={() => {
                      setKindFilter(key);
                      setFamilyFilter("all");
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
                    className="pl-rec-chip min-h-11 sm:min-h-9"
                    aria-pressed={statusFilter === key}
                    data-status-filter={key}
                    onClick={() => setStatusFilter(key)}
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
                  className="pl-rec-chip min-h-11 sm:min-h-9"
                  aria-pressed={familyFilter === "all"}
                  onClick={() => setFamilyFilter("all")}
                >
                  Todas las familias
                </button>
                {familyOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className="pl-rec-chip min-h-11 sm:min-h-9"
                    aria-pressed={familyFilter === opt.key}
                    onClick={() => setFamilyFilter(opt.key)}
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
          <div className="py-6 text-center space-y-3">
            <p className="pl-rec-hint [text-wrap:pretty]">
              {journal.length === 0
                ? "Todavía no sellas ningún pick. Elige un partido de hoy para registrar el primero."
                : kindFilter === "parlay" && parlayCount === 0
                  ? "Todavía no sellas ningún parlay. Ármalo en la pestaña Parlays y séllalo antes del arranque."
                  : "No tienes picks en este filtro."}
            </p>
            {journal.length === 0 ? (
              <button
                type="button"
                className="pl-rec-btn pl-rec-btn--primary min-h-11"
                onClick={onNavigateHome}
              >
                <span>Ver partidos de hoy</span>
                <MaestroIcon name="chevronRight" size={14} />
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Escritorio (>= md): tabla semántica con cabecera accesible y cero truncamiento */}
            <div
              className="hidden md:block pl-table-region"
              tabIndex={0}
              role="region"
              aria-label="Tabla de picks sellados en Mi récord"
            >
              <table className="w-full text-left border-collapse text-sm">
                <caption className="sr-only">
                  Registro auditable de picks sellados con momio capturado, EV, CLV y estado final
                </caption>
                <thead>
                  <tr
                    className="hairline-b text-xs"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    <th scope="col" className="py-2.5 pr-3">
                      Corte
                    </th>
                    <th scope="col" className="py-2.5 pr-3">
                      Partido, mercado y pick
                    </th>
                    <th scope="col" className="py-2.5 px-2">
                      Familia
                    </th>
                    <th scope="col" className="py-2.5 px-2 text-right">
                      Unid.
                    </th>
                    <th scope="col" className="py-2.5 px-2 text-right">
                      Momio / Casa
                    </th>
                    <th scope="col" className="py-2.5 px-2 text-right">
                      EV / CLV
                    </th>
                    <th scope="col" className="py-2.5 px-2 text-right">
                      Estado
                    </th>
                    <th scope="col" className="py-2.5 pl-2 text-right">
                      Boleto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
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
                    } = row;
                    const statusMeta = getAuditStatusMeta(auditStatus);
                    const expanded = Boolean(expandedParlayIds[item.id]);
                    const wonLegs = legs.filter((l) => l.status === "won").length;
                    const lostLegs = legs.filter((l) => l.status === "lost").length;
                    const pushLegs = legs.filter((l) => l.status === "push").length;
                    const legPct = legs.length > 0 ? Math.round((wonLegs / legs.length) * 100) : 0;
                    const deskPanelId = `${uid}-desk-legs-${item.id}`;

                    return (
                      <React.Fragment key={item.id}>
                        <tr
                          className="hairline-b row-hover"
                          data-record-row={isParlay ? "parlay" : "single"}
                          data-audit-status={auditStatus}
                        >
                          <td
                            className="py-3 pr-3 text-xs num whitespace-nowrap"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {item.sealedAt}
                          </td>
                          <th scope="row" className="py-3 pr-3 font-normal">
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
                                    className="pl-rec-leg-toggle min-h-8"
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
                                    className="block text-xs"
                                    style={{ color: "var(--pl-text-muted)" }}
                                  >
                                    “{item.note}”
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <strong className="font-bold">{item.pickLabel}</strong>
                                  {finalScore ? (
                                    <span className="pl-hist-score-pill num text-[11px]">
                                      FT {finalScore}
                                    </span>
                                  ) : isFinishedMatch && auditStatus === "pending" ? (
                                    <span className="pl-pill text-[10px]">
                                      FT · liquidando
                                    </span>
                                  ) : null}
                                </div>
                                <span
                                  className="block text-xs"
                                  style={{ color: "var(--pl-text-muted)" }}
                                >
                                  {item.leagueLabel} · {item.matchLabel}
                                  {item.note ? ` — “${item.note}”` : ""}
                                </span>
                              </div>
                            )}
                          </th>
                          <td className="py-3 px-2">
                            <div className="flex flex-col items-start gap-1">
                              <span className="pl-pill text-[11px]">{family.shortLabel}</span>
                              <span
                                className="text-[11px]"
                                style={{ color: "var(--pl-text-muted)" }}
                              >
                                {ORIGIN_SHORT_LABEL[item.origin] ?? item.origin}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right num font-bold whitespace-nowrap">
                            {item.units.toFixed(2)}u
                          </td>
                          <td className="py-3 px-2 text-right num whitespace-nowrap">
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
                          <td className="py-3 px-2 text-right num whitespace-nowrap">
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
                          <td className="py-3 px-2 text-right whitespace-nowrap">
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
                          <td className="py-3 pl-2 text-right">
                            <button
                              type="button"
                              className={`${item.status === "won" ? "pl-btn-primary" : "pl-btn-glass"} px-2.5 min-h-9 text-xs inline-flex items-center`}
                              aria-label={`Compartir boleto ${item.pickLabel}`}
                              onClick={() => openTicketAction(item, isParlay)}
                            >
                              <MaestroIcon name="share" size={13} />
                              {item.status === "won" ? <span className="ml-1">Boleto</span> : null}
                            </button>
                          </td>
                        </tr>
                        {isParlay && expanded ? (
                          <tr
                            id={deskPanelId}
                            className="hairline-b pl-rec-parlay-legs-row"
                            data-parlay-legs-panel={item.id}
                          >
                            <td colSpan={8} className="py-2.5 px-3">
                              <ParlayLegsList legs={legs} oddsFormat={oddsFormat} />
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Móvil (< md): filas editoriales planas apiladas con 0 px overflow y objetivos >= 44 px */}
            <ul className="md:hidden m-0 p-0 list-none space-y-2.5" role="list">
              {filtered.map((row) => {
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
                } = row;
                const statusMeta = getAuditStatusMeta(auditStatus);
                const expanded = Boolean(expandedParlayIds[item.id]);
                const wonLegs = legs.filter((l) => l.status === "won").length;
                const lostLegs = legs.filter((l) => l.status === "lost").length;
                const pushLegs = legs.filter((l) => l.status === "push").length;
                const legPct = legs.length > 0 ? Math.round((wonLegs / legs.length) * 100) : 0;
                const mobPanelId = `${uid}-mob-legs-${item.id}`;

                return (
                  <li
                    key={item.id}
                    className="rounded-2xl p-3.5 space-y-2.5 min-w-0"
                    style={{
                      background: "var(--pl-surface)",
                      border: "1px solid var(--pl-border)",
                    }}
                    data-record-row-mobile={isParlay ? "parlay" : "single"}
                    data-audit-status={auditStatus}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="pl-pill text-[11px]">{family.shortLabel}</span>
                          <span
                            className="text-[11px] num"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {item.sealedAt}
                          </span>
                          {finalScore ? (
                            <span className="pl-hist-score-pill num text-[11px]">
                              FT {finalScore}
                            </span>
                          ) : isFinishedMatch && auditStatus === "pending" ? (
                            <span className="pl-pill text-[10px]">FT · liquidando</span>
                          ) : null}
                        </div>
                        <strong className="block text-sm font-bold break-words">
                          {item.pickLabel}
                        </strong>
                        <span
                          className="block text-xs truncate"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {item.leagueLabel} · {item.matchLabel}
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className={statusMeta.pillClass}>
                          <MaestroIcon name={statusMeta.icon} size={11} />
                          <span>{statusMeta.label}</span>
                        </span>
                        {netUnits !== null ? (
                          <span
                            className={`text-xs font-bold num ${
                              netUnits > 0 ? "pl-rec-pos" : netUnits < 0 ? "pl-rec-neg" : ""
                            }`}
                            style={netUnits === 0 ? { color: "var(--pl-text-muted)" } : undefined}
                          >
                            {formatSignedUnits(netUnits)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {isParlay ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="pl-pill pl-pill--brand num text-[11px]">
                            Parlay · {legs.length} piernas
                          </span>
                          <span
                            className="text-xs font-bold num"
                            style={{
                              color:
                                lostLegs > 0 ? "var(--pl-danger)" : "var(--pl-text-secondary)",
                            }}
                          >
                            {wonLegs}/{legs.length} cumplidas
                            {pushLegs > 0 ? ` · ${pushLegs} push` : ""}
                          </span>
                        </div>
                        <div className="pl-rec-parlay-progress" aria-hidden="true">
                          <span
                            className={`pl-rec-parlay-progress-fill ${lostLegs > 0 ? "is-lost" : ""}`.trim()}
                            style={{ width: `${legPct}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    <dl className="m-0 grid grid-cols-3 gap-2 pt-2 hairline-t num text-xs">
                      <div className="min-w-0">
                        <dt className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                          Unid.
                        </dt>
                        <dd className="m-0 font-bold">{item.units.toFixed(2)}u</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                          {bookLabel ?? "Tu momio"}
                        </dt>
                        <dd className="m-0 font-bold">
                          {formatOddsValue(item.userDecimal, oddsFormat)}
                        </dd>
                        <dd
                          className="m-0 text-[11px]"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          Justo {formatOddsValue(item.fairDecimal, oddsFormat)}
                        </dd>
                      </div>
                      <div className="min-w-0 text-right">
                        <dt className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                          EV / CLV
                        </dt>
                        <dd
                          className="m-0 font-bold"
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
                            ? formatSignedPctValue(evPct)
                            : formatSignedPctValue(item.clvPct)}
                        </dd>
                        <dd
                          className="m-0 text-[11px]"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          CLV {formatSignedPctValue(item.clvPct)}
                        </dd>
                      </div>
                    </dl>

                    {item.note ? (
                      <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        “{item.note}”
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {isParlay ? (
                        <button
                          type="button"
                          className="pl-rec-leg-toggle min-h-11 px-3.5 text-xs"
                          aria-expanded={expanded}
                          aria-controls={mobPanelId}
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
                      ) : (
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {ORIGIN_SHORT_LABEL[item.origin] ?? item.origin}
                        </span>
                      )}

                      <button
                        type="button"
                        className={`${item.status === "won" ? "pl-btn-primary" : "pl-btn-glass"} px-3.5 min-h-11 text-xs inline-flex items-center gap-1.5`}
                        aria-label={`Compartir boleto ${item.pickLabel}`}
                        onClick={() => openTicketAction(item, isParlay)}
                      >
                        <MaestroIcon name="share" size={14} />
                        <span>{item.status === "won" ? "Boleto" : "Compartir"}</span>
                      </button>
                    </div>

                    {isParlay && expanded ? (
                      <div id={mobPanelId} className="pt-2 hairline-t">
                        <ParlayLegsList legs={legs} oddsFormat={oddsFormat} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* Partidos en vigilancia */}
      <section className="pl-rec-card glass-card glass-ring" aria-labelledby="pl-rec-watch-heading">
        <div className="pl-rec-card-head">
          <div className="min-w-0">
            <h2 id="pl-rec-watch-heading" className="pl-rec-card-title flex items-center gap-2">
              <MaestroIcon
                name="bell"
                size={16}
                style={{ color: "var(--pl-brand)" }}
              />
              <span>Partidos en vigilancia ({watchedGames.length})</span>
            </h2>
            <p className="pl-rec-card-meta [text-wrap:pretty]">
              Te avisamos si surge valor nuevo en estos partidos antes del arranque.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {watchedGames.length >= 2 ? (
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-3"
                data-clear-watchlist-trigger=""
                onClick={() => setConfirmClearWatchOpen(true)}
              >
                <MaestroIcon name="trash" size={13} />
                <span>Limpiar vigilancia</span>
              </button>
            ) : null}
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-3"
              onClick={onNavigateHome}
            >
              <span>Explorar jornada</span>
              <MaestroIcon name="chevronRight" size={14} />
            </button>
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
                <div
                  key={g.id}
                  className="glass-ring rounded-xl p-3 flex items-center justify-between gap-2 min-w-0"
                  style={{ background: "var(--pl-surface-elevated)" }}
                >
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
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-3 shrink-0"
                    onClick={() => onToggleWatchlist(g.id)}
                  >
                    <MaestroIcon name="bell" size={13} />
                    <span>+ Vigilar</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

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
