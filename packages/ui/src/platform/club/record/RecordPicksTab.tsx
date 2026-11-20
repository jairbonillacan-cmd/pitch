"use client";

import React, { useCallback, useMemo, useState } from "react";
import { TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { DailyResultsCalendar } from "../../components/DailyResultsCalendar";
import { LivePicksTrackerStrip } from "../../components/LivePicksTrackerStrip";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { MatchTicketCard } from "../../components/MatchTicketCard";
import { shortDateLabel } from "../home/home-model";
import { useOptionalPlatformCore, type ShareTicketPayload } from "../../platform-provider";
import { buildMonthlyRecordCalendar } from "../../record-stats";
import type { JournalEntry, OddsFormat, PlatformGame } from "../../types";

type PickFilter = "all" | "open" | "closed";
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
  key: string;
  leagueLabel: string;
  matchLabel: string;
  pickLabel: string;
  fairDecimal: number | null;
  status: "pending" | "won" | "lost" | "void";
}

function resolveParlayLegsForDisplay(entry: JournalEntry): ResolvedLegDisplay[] {
  const resultByKey = new Map<string, "pending" | "won" | "lost" | "void">();
  for (const r of entry.parlayLegResults ?? []) {
    resultByKey.set(`${r.gameId}::${r.pickId}`, r.status);
    resultByKey.set(r.pickId, r.status);
  }
  if (Array.isArray(entry.parlayLegs) && entry.parlayLegs.length > 0) {
    return entry.parlayLegs.map((leg, i) => {
      const status =
        resultByKey.get(`${leg.gameId}::${leg.pickId}`) ??
        resultByKey.get(leg.pickId) ??
        (entry.status === "won" ? "won" : entry.status === "void" ? "void" : "pending");
      return {
        key: `${leg.gameId}-${leg.pickId}-${i}`,
        leagueLabel: leg.leagueLabel ?? entry.leagueLabel,
        matchLabel: leg.matchLabel ?? `Pierna ${i + 1}`,
        pickLabel: leg.pickLabel ?? leg.selection ?? leg.pickId,
        fairDecimal:
          typeof leg.fairDecimal === "number" && Number.isFinite(leg.fairDecimal)
            ? leg.fairDecimal
            : null,
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
    leagueLabel: entry.leagueLabel,
    matchLabel: `Pierna ${i + 1}`,
    pickLabel: label,
    fairDecimal: null,
    status: entry.status === "won" ? "won" : entry.status === "void" ? "void" : "pending",
  }));
}

function legStatusMeta(status: "pending" | "won" | "lost" | "void"): {
  label: string;
  pillClass: string;
} {
  if (status === "won") return { label: "Cumplido", pillClass: "pl-pill pl-pill--success" };
  if (status === "lost") return { label: "No cumplido", pillClass: "pl-pill pl-pill--danger" };
  if (status === "void") return { label: "Nulo", pillClass: "pl-pill" };
  return { label: "Abierto", pillClass: "pl-pill pl-pill--info" };
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
}: {
  journal: readonly JournalEntry[];
  oddsFormat: OddsFormat;
  watchedGames: readonly PlatformGame[];
  suggestedUpcoming: readonly PlatformGame[];
  onToggleWatchlist: (gameId: string) => void;
  onNavigateHome: () => void;
  onOpenWinningEntry: (entry: JournalEntry) => void;
  onOpenShareTicket: (payload: ShareTicketPayload) => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState<PickFilter>("all");
  const [kindFilter, setKindFilter] = useState<PickKindFilter>("all");
  const [expandedParlayIds, setExpandedParlayIds] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<RecordViewMode>("list");
  const optCore = useOptionalPlatformCore();
  const userTz = optCore?.userTimezone ?? "America/Mexico_City";
  const allGames = optCore?.dataset.games ?? watchedGames;

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

  const parlayCount = useMemo(
    () => journal.filter((item) => isParlayJournalEntry(item)).length,
    [journal],
  );
  const singleCount = journal.length - parlayCount;

  const kindFiltered = useMemo(() => {
    if (kindFilter === "parlay") return journal.filter((item) => isParlayJournalEntry(item));
    if (kindFilter === "single") return journal.filter((item) => !isParlayJournalEntry(item));
    return journal;
  }, [journal, kindFilter]);

  const openCount = useMemo(
    () => kindFiltered.filter((item) => item.status === "pending").length,
    [kindFiltered],
  );
  const closedCount = kindFiltered.length - openCount;

  const filtered = useMemo(() => {
    if (filter === "open") return kindFiltered.filter((item) => item.status === "pending");
    if (filter === "closed") return kindFiltered.filter((item) => item.status !== "pending");
    return kindFiltered;
  }, [filter, kindFiltered]);

  return (
    <div className="pl-rec-stack">
      <LivePicksTrackerStrip journal={journal} games={allGames} />

      <section className="pl-rec-card glass-card glass-ring" aria-labelledby="pl-rec-picks-heading">
        <div className="pl-rec-card-head">
          <div>
            <h2 id="pl-rec-picks-heading" className="pl-rec-card-title">
              Picks sellados ({journal.length})
            </h2>
            <p className="pl-rec-card-meta">
              Sellados antes del arranque · simples y parlays pierna por pierna sin edición posterior
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
                className="seg-btn text-xs min-h-10"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                Lista
              </button>
              <button
                type="button"
                className="seg-btn text-xs min-h-10"
                aria-pressed={viewMode === "calendar"}
                onClick={() => setViewMode("calendar")}
              >
                Calendario
              </button>
            </div>

            {viewMode === "list" ? (
              <>
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
                      onClick={() => setKindFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="pl-rec-filter-row num" role="group" aria-label="Filtrar picks por estado">
                  {(
                    [
                      ["all", `Estado: Todos · ${kindFiltered.length}`],
                      ["open", `Abiertos · ${openCount}`],
                      ["closed", `Cerrados · ${closedCount}`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className="pl-rec-chip"
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {viewMode === "calendar" ? (
          <DailyResultsCalendar buildMonth={buildCalendarMonth} mode="units" />
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="pl-rec-hint">
              {journal.length === 0
                ? "Todavía no sellas ningún pick. Elige un partido de hoy para registrar el primero."
                : kindFilter === "parlay" && parlayCount === 0
                  ? "Todavía no sellas ningún parlay. Ármalo en la pestaña Parlays y séllalo antes del arranque."
                  : "No tienes picks en este filtro."}
            </p>
            {journal.length === 0 ? (
              <button
                type="button"
                className="pl-rec-btn pl-rec-btn--primary"
                onClick={onNavigateHome}
              >
                <span>Ver partidos de hoy</span>
                <MaestroIcon name="chevronRight" size={14} />
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className="pl-table-region"
            tabIndex={0}
            role="region"
            aria-label="Tabla de picks sellados en Mi récord"
          >
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr
                  className="hairline-b text-xs"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  <th scope="col" className="py-2.5 pr-3">
                    Corte
                  </th>
                  <th scope="col" className="py-2.5 pr-3">
                    Partido y pick
                  </th>
                  <th scope="col" className="py-2.5 px-2">
                    Origen
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    Unid.
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    Tu momio
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    Ventaja
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
                {filtered.map((item) => {
                  const isParlay = isParlayJournalEntry(item);
                  const legs = isParlay ? resolveParlayLegsForDisplay(item) : [];
                  const expanded = Boolean(expandedParlayIds[item.id]);
                  const wonLegs = legs.filter((l) => l.status === "won").length;
                  const lostLegs = legs.filter((l) => l.status === "lost").length;
                  const legPct = legs.length > 0 ? Math.round((wonLegs / legs.length) * 100) : 0;

                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hairline-b row-hover" data-record-row={isParlay ? "parlay" : "single"}>
                        <td
                          className="py-3 pr-3 text-xs num"
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
                                <span className="text-xs font-bold num" style={{ color: lostLegs > 0 ? "var(--pl-danger)" : "var(--pl-text-secondary)" }}>
                                  {wonLegs}/{legs.length} cumplidas
                                </span>
                                <button
                                  type="button"
                                  className="pl-rec-leg-toggle"
                                  aria-expanded={expanded}
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
                                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                                  “{item.note}”
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <>
                              <strong className="block font-bold">{item.pickLabel}</strong>
                              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                                {item.leagueLabel} · {item.matchLabel}
                                {item.note ? ` — “${item.note}”` : ""}
                              </span>
                            </>
                          )}
                        </th>
                        <td className="py-3 px-2">
                          <span className="pl-pill">
                            {ORIGIN_SHORT_LABEL[item.origin] ?? item.origin}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right num font-bold">
                          {item.units.toFixed(2)}u
                        </td>
                        <td className="py-3 px-2 text-right num">
                          <span className="font-bold">
                            {formatOddsValue(item.userDecimal, oddsFormat)}
                          </span>
                          <span
                            className="block text-xs"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            Justo {formatOddsValue(item.fairDecimal, oddsFormat)}
                          </span>
                        </td>
                        <td
                          className="py-3 px-2 text-right num font-bold"
                          style={{
                            color:
                              item.clvPct >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
                          }}
                        >
                          {item.clvPct >= 0
                            ? `+${item.clvPct.toFixed(1)}`
                            : item.clvPct.toFixed(1)}{" "}
                          %
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span
                            className={
                              item.status === "won"
                                ? "pl-pill pl-pill--success"
                                : item.status === "lost"
                                  ? "pl-pill pl-pill--danger"
                                  : item.status === "void"
                                    ? "pl-pill"
                                    : "pl-pill pl-pill--info"
                            }
                          >
                            {item.status === "won"
                              ? "Cumplido"
                              : item.status === "lost"
                                ? "No cumplido"
                                : item.status === "void"
                                  ? "Nulo"
                                  : "Abierto"}
                          </span>
                        </td>
                        <td className="py-3 pl-2 text-right">
                          <button
                            type="button"
                            className={`${item.status === "won" ? "pl-btn-primary" : "pl-btn-glass"} px-2.5 min-h-10 sm:min-h-8 text-xs inline-flex items-center`}
                            aria-label={`Compartir boleto ${item.pickLabel}`}
                            onClick={() =>
                              item.status === "won"
                                ? onOpenWinningEntry(item)
                                : onOpenShareTicket({
                                    kind: isParlay ? "parlay" : "pick",
                                    title: item.matchLabel,
                                    subtitle: `${item.leagueLabel} · Mi récord PitchLab`,
                                    leagueLabel: item.leagueLabel,
                                    pickLabel: item.pickLabel,
                                    probability: Math.min(
                                      0.88,
                                      Math.max(0.05, 1 / item.fairDecimal),
                                    ),
                                    fairDecimal: item.fairDecimal,
                                    marketDecimal: item.userDecimal,
                                    units: item.units,
                                    gameStatus: item.status === "pending" ? "NS" : "FT",
                                    pickSlug: item.pickId,
                                  })
                            }
                          >
                            <MaestroIcon name="share" size={13} />
                            {item.status === "won" ? <span className="ml-1">Boleto</span> : null}
                          </button>
                        </td>
                      </tr>
                      {isParlay && expanded ? (
                        <tr className="hairline-b pl-rec-parlay-legs-row" data-parlay-legs-panel={item.id}>
                          <td colSpan={8} className="py-2.5 px-3">
                            <ul className="pl-rec-parlay-legs" role="list">
                              {legs.map((leg) => {
                                const st = legStatusMeta(leg.status);
                                return (
                                  <li key={leg.key} className="pl-rec-parlay-leg">
                                    <div className="min-w-0 flex-1">
                                      <strong className="block text-xs font-bold truncate">
                                        {leg.pickLabel}
                                      </strong>
                                      <span className="block text-[11px] truncate" style={{ color: "var(--pl-text-muted)" }}>
                                        {leg.leagueLabel} · {leg.matchLabel}
                                      </span>
                                    </div>
                                    {leg.fairDecimal !== null ? (
                                      <span className="text-xs num font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                                        Justo {formatOddsValue(leg.fairDecimal, oddsFormat)}
                                      </span>
                                    ) : null}
                                    <span className={st.pillClass}>{st.label}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Partidos en vigilancia */}
      <section className="pl-rec-card glass-card glass-ring" aria-labelledby="pl-rec-watch-heading">
        <div className="pl-rec-card-head">
          <div>
            <h2 id="pl-rec-watch-heading" className="pl-rec-card-title flex items-center gap-2">
              <MaestroIcon
                name="bell"
                size={16}
                style={{ color: "var(--pl-brand)" }}
              />
              <span>Partidos en vigilancia ({watchedGames.length})</span>
            </h2>
            <p className="pl-rec-card-meta">
              Te avisamos si surge valor nuevo en estos partidos antes del arranque.
            </p>
          </div>
          <button
            type="button"
            className="pl-btn-glass text-xs min-h-8 px-3"
            onClick={onNavigateHome}
          >
            <span>Explorar jornada</span>
            <MaestroIcon name="chevronRight" size={14} />
          </button>
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
                  className="glass-ring rounded-xl p-3 flex items-center justify-between gap-2"
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
                    className="pl-btn-glass text-xs min-h-8 px-2.5 shrink-0"
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
    </div>
  );
}
