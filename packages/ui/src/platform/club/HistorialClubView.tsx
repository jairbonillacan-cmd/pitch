"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { canonicalGameHref } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreKpiStrip,
  SofascoreTable,
  SofascoreTabs,
  SofascoreValueCell,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { LeagueBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { DailyResultsCalendar } from "../components/DailyResultsCalendar";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { usePlatformActions, usePlatformCore } from "../platform-provider";
import { buildModelDailyCalendar } from "../record-stats";
import type { MatchPick, PlatformGame } from "../types";
import { DailyParlaysResultsSection } from "./DailyParlaysResultsSection";
import { formatShortIsoDay, formatSignedPctValue } from "./record/PublicRecordSections";
import {
  classifyMarketFamily,
  computePickEvPct,
  getAuditStatusMeta,
  resolveCapturedBookLabel,
  resolveFinishedPickAuditStatus,
  type AuditPickStatus,
  type MarketFamilyTag,
} from "./record/record-audit-helpers";

type OutcomeFilter = "all" | AuditPickStatus;
type BreakdownTab = "league" | "market";

const FT_PAGE_SIZE = 12;
const BREAKDOWN_PAGE_SIZE = 8;

const HISTORIAL_VIEW_TABS: readonly SofascoreTabItem[] = [
  { id: "list", label: "Lista" },
  { id: "calendar", label: "Calendario" },
];

const BREAKDOWN_TABS: readonly SofascoreTabItem[] = [
  { id: "league", label: "Por liga" },
  { id: "market", label: "Por mercado" },
];

interface Rate {
  key: string;
  label: string;
  hits: number;
  total: number;
}

interface AuditRate extends Rate {
  readonly leagueId?: PlatformGame["league"];
  readonly logoUrl?: string;
  readonly pushes?: number;
  readonly avgEvPct?: number | null;
}

const pct = (hits: number, total: number) => (total > 0 ? (hits / total) * 100 : 0);

export function groupRates<T>(
  items: readonly T[],
  keyOf: (t: T) => { key: string; label: string },
  hit: (t: T) => boolean,
): Rate[] {
  const m = new Map<string, Rate>();
  for (const it of items) {
    const { key, label } = keyOf(it);
    const r = m.get(key) ?? { key, label, hits: 0, total: 0 };
    r.total += 1;
    if (hit(it)) r.hits += 1;
    m.set(key, r);
  }
  return Array.from(m.values()).sort((a, b) => b.total - a.total);
}

interface AuditedFinishedGame {
  readonly game: PlatformGame;
  readonly pick: MatchPick | undefined;
  readonly auditStatus: AuditPickStatus;
  readonly family: MarketFamilyTag;
  readonly evPct: number | null;
  readonly bookLabel: string | null;
  readonly href: string;
}

export function HistorialClubView(): React.JSX.Element {
  const uid = useId();
  const leagueSelectId = `${uid}-hist-league`;
  const marketSelectId = `${uid}-hist-market`;
  const { dataset, oddsFormat, userTimezone } = usePlatformCore();
  const { navigateTo } = usePlatformActions();
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [league, setLeague] = useState("all");
  const [marketFamily, setMarketFamily] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>("league");
  const [showAllBreakdown, setShowAllBreakdown] = useState(false);
  const [shown, setShown] = useState(FT_PAGE_SIZE);

  const leagueLogoByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of dataset.leagues) {
      if (item.logoUrl) map.set(item.league, item.logoUrl);
    }
    return map;
  }, [dataset.leagues]);

  const finishedAudited = useMemo<AuditedFinishedGame[]>(
    () =>
      dataset.games
        .filter((g) => g.status === "FT")
        .sort((a, b) => Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc))
        .map((game) => {
          const pick = game.picks[0];
          const auditStatus = resolveFinishedPickAuditStatus(pick, game.score);
          const family: MarketFamilyTag = pick
            ? classifyMarketFamily({
                market: pick.market,
                marketGroup: pick.marketGroup,
                pickLabel: pick.label,
              })
            : { key: "sin_pick", label: "Sin pick publicado", shortLabel: "Sin pick" };
          const evPct = pick ? computePickEvPct(pick.p, pick.marketDecimal) : null;
          const bookLabel = resolveCapturedBookLabel(pick);
          const href = canonicalGameHref(game.league, game);
          return { game, pick, auditStatus, family, evPct, bookLabel, href };
        }),
    [dataset.games],
  );

  const scoped = useMemo(
    () => finishedAudited.filter((item) => league === "all" || item.game.league === league),
    [finishedAudited, league],
  );

  const familyFilterOptions = useMemo(() => {
    const counts = new Map<string, { key: string; shortLabel: string; count: number }>();
    for (const item of scoped) {
      const cur = counts.get(item.family.key) ?? {
        key: item.family.key,
        shortLabel: item.family.shortLabel,
        count: 0,
      };
      cur.count += 1;
      counts.set(item.family.key, cur);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [scoped]);

  const familyScoped = useMemo(
    () =>
      marketFamily === "all"
        ? scoped
        : scoped.filter((item) => item.family.key === marketFamily),
    [marketFamily, scoped],
  );

  const statusCounts = useMemo(() => {
    let won = 0;
    let lost = 0;
    let push = 0;
    let pending = 0;
    for (const item of familyScoped) {
      if (item.auditStatus === "won") won += 1;
      else if (item.auditStatus === "lost") lost += 1;
      else if (item.auditStatus === "push") push += 1;
      else pending += 1;
    }
    return { won, lost, push, pending };
  }, [familyScoped]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const listed = useMemo(
    () =>
      familyScoped.filter((item) => {
        if (outcome !== "all" && item.auditStatus !== outcome) return false;
        if (!normalizedQuery) return true;
        const haystack =
          `${item.game.home.name} ${item.game.away.name} ${item.game.leagueLabel} ${item.pick?.label ?? ""} ${item.family.label}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    [familyScoped, normalizedQuery, outcome],
  );

  const decidedScoped = useMemo(
    () => scoped.filter((item) => item.auditStatus === "won" || item.auditStatus === "lost"),
    [scoped],
  );

  const scopedStatusCounts = useMemo(() => {
    let won = 0;
    let lost = 0;
    let push = 0;
    let pending = 0;
    for (const item of scoped) {
      if (item.auditStatus === "won") won += 1;
      else if (item.auditStatus === "lost") lost += 1;
      else if (item.auditStatus === "push") push += 1;
      else pending += 1;
    }
    return { won, lost, push, pending };
  }, [scoped]);

  const evSummary = useMemo(() => {
    let evSum = 0;
    let evCount = 0;
    let fairSum = 0;
    let fairCount = 0;
    for (const item of scoped) {
      if (item.evPct !== null) {
        evSum += item.evPct;
        evCount += 1;
      }
      if (item.pick && Number.isFinite(item.pick.fairDecimal) && item.pick.fairDecimal > 1) {
        fairSum += item.pick.fairDecimal;
        fairCount += 1;
      }
    }
    return {
      avgEvPct: evCount > 0 ? Math.round((evSum / evCount) * 10) / 10 : null,
      evCount,
      avgFairDecimal: fairCount > 0 ? Math.round((fairSum / fairCount) * 100) / 100 : null,
    };
  }, [scoped]);

  const recent = useMemo(() => scoped.slice(0, 10), [scoped]);
  const recentWon = useMemo(
    () => recent.filter((item) => item.auditStatus === "won").length,
    [recent],
  );
  const recentDecided = useMemo(
    () => recent.filter((item) => item.auditStatus === "won" || item.auditStatus === "lost").length,
    [recent],
  );

  const byLeague = useMemo<AuditRate[]>(() => {
    const map = new Map<
      string,
      {
        key: string;
        leagueId: PlatformGame["league"];
        label: string;
        hits: number;
        total: number;
        pushes: number;
        countAll: number;
        evSum: number;
        evCount: number;
      }
    >();
    for (const item of finishedAudited) {
      const cur = map.get(item.game.league) ?? {
        key: item.game.league,
        leagueId: item.game.league,
        label: item.game.leagueLabel,
        hits: 0,
        total: 0,
        pushes: 0,
        countAll: 0,
        evSum: 0,
        evCount: 0,
      };
      cur.countAll += 1;
      if (item.auditStatus === "won") {
        cur.hits += 1;
        cur.total += 1;
      } else if (item.auditStatus === "lost") {
        cur.total += 1;
      } else if (item.auditStatus === "push") {
        cur.pushes += 1;
      }
      if (item.evPct !== null) {
        cur.evSum += item.evPct;
        cur.evCount += 1;
      }
      map.set(item.game.league, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.countAll - a.countAll)
      .map((r) => ({
        key: r.key,
        leagueId: r.leagueId,
        logoUrl: leagueLogoByKey.get(r.key),
        label: r.label,
        hits: r.hits,
        total: r.total,
        pushes: r.pushes,
        avgEvPct: r.evCount > 0 ? Math.round((r.evSum / r.evCount) * 10) / 10 : null,
      }));
  }, [finishedAudited, leagueLogoByKey]);

  const byMarketFamily = useMemo<AuditRate[]>(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        hits: number;
        total: number;
        pushes: number;
        evSum: number;
        evCount: number;
      }
    >();
    for (const item of scoped) {
      for (const pick of item.game.picks) {
        const st = resolveFinishedPickAuditStatus(pick, item.game.score);
        if (st === "pending") continue;
        const fam = classifyMarketFamily({
          market: pick.market,
          marketGroup: pick.marketGroup,
          pickLabel: pick.label,
        });
        const cur = map.get(fam.key) ?? {
          key: fam.key,
          label: fam.label,
          hits: 0,
          total: 0,
          pushes: 0,
          evSum: 0,
          evCount: 0,
        };
        if (st === "won") {
          cur.hits += 1;
          cur.total += 1;
        } else if (st === "lost") {
          cur.total += 1;
        } else if (st === "push") {
          cur.pushes += 1;
        }
        const ev = computePickEvPct(pick.p, pick.marketDecimal);
        if (ev !== null) {
          cur.evSum += ev;
          cur.evCount += 1;
        }
        map.set(fam.key, cur);
      }
    }
    return Array.from(map.values())
      .filter((r) => r.total > 0 || r.pushes > 0)
      .map((r) => ({
        key: r.key,
        label: r.label,
        hits: r.hits,
        total: r.total,
        pushes: r.pushes,
        avgEvPct: r.evCount > 0 ? Math.round((r.evSum / r.evCount) * 10) / 10 : null,
      }))
      .sort((a, b) => b.total + (b.pushes ?? 0) - (a.total + (a.pushes ?? 0)));
  }, [scoped]);

  const buildModelCalendar = useCallback(
    (ym: string) =>
      buildModelDailyCalendar(
        decidedScoped
          .filter((item): item is AuditedFinishedGame & { pick: MatchPick } => Boolean(item.pick))
          .map((item) => {
            const g = item.game;
            const scoreText = g.score ? `${g.score.home}–${g.score.away}` : "FT";
            return {
              id: g.id,
              kickoffUtc: g.kickoffUtc,
              label: `${g.home.shortName} ${scoreText} ${g.away.shortName}`,
              subtitle: `${g.leagueLabel} · ${item.family.shortLabel} · ${item.pick.label}`,
              hit: item.auditStatus === "won",
              href: item.href,
            };
          }),
        ym || undefined,
        { timeZone: userTimezone || "America/Mexico_City" },
      ),
    [decidedScoped, userTimezone],
  );

  const hitPct = pct(scopedStatusCounts.won, decidedScoped.length);

  const kpiItems = useMemo<readonly SofascoreKpiItem[]>(
    () => [
      {
        id: "ft",
        label: "Partidos revisados",
        value: String(scoped.length),
        delta:
          league === "all"
            ? `${byLeague.length} ligas · ${decidedScoped.length} calificados`
            : `${decidedScoped.length} calificados`,
      },
      {
        id: "hit",
        label: "Acierto global",
        value: decidedScoped.length > 0 ? `${hitPct.toFixed(1)} %` : "—",
        delta: `${scopedStatusCounts.won}G – ${scopedStatusCounts.lost}P${scopedStatusCounts.push > 0 ? ` · ${scopedStatusCounts.push} Push` : ""}`,
        tone: decidedScoped.length > 0 && hitPct >= 55 ? "positive" : "default",
      },
      {
        id: "recent",
        label: `Últimos ${recent.length}`,
        value: recentDecided > 0 ? `${recentWon}/${recentDecided}` : "—",
        delta:
          recentDecided > 0
            ? `${Math.round((recentWon / recentDecided) * 100)} % reciente`
            : "Sin cierres",
        tone:
          recentDecided > 0 && recentWon / recentDecided >= 0.55 ? "positive" : "default",
      },
      {
        id: "ev",
        label: evSummary.avgEvPct !== null ? "Ventaja media" : "Momio justo medio",
        value:
          evSummary.avgEvPct !== null
            ? formatSignedPctValue(evSummary.avgEvPct)
            : evSummary.avgFairDecimal !== null
              ? formatOddsValue(evSummary.avgFairDecimal, oddsFormat)
              : "—",
        delta:
          evSummary.avgEvPct !== null
            ? `${evSummary.evCount} con cuota de casa`
            : "Promedio calibrado",
        tone:
          evSummary.avgEvPct !== null && evSummary.avgEvPct > 0 ? "positive" : "default",
      },
    ],
    [
      byLeague.length,
      decidedScoped.length,
      evSummary.avgEvPct,
      evSummary.avgFairDecimal,
      evSummary.evCount,
      hitPct,
      league,
      oddsFormat,
      recent.length,
      recentDecided,
      recentWon,
      scoped.length,
      scopedStatusCounts.lost,
      scopedStatusCounts.push,
      scopedStatusCounts.won,
    ],
  );

  const effectiveBreakdownTab: BreakdownTab =
    league !== "all" || byLeague.length <= 1 ? "market" : breakdownTab;

  const activeBreakdownRows =
    effectiveBreakdownTab === "league" ? byLeague : byMarketFamily;
  const visibleBreakdownRows = showAllBreakdown
    ? activeBreakdownRows
    : activeBreakdownRows.slice(0, BREAKDOWN_PAGE_SIZE);

  const visibleHistoryRows = useMemo(() => listed.slice(0, shown), [listed, shown]);

  const historyColumns = useMemo<readonly SofascoreTableColumn<AuditedFinishedGame>[]>(
    () => [
      {
        key: "match",
        header: "Partido",
        sticky: true,
        render: (item) => {
          const g = item.game;
          const scoreText = g.score ? `${g.score.home}–${g.score.away}` : "FT";
          return (
            <div className="pl-hist-ed-match">
              <a
                href={item.href}
                className="pl-hist-ed-match-link"
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  e.stopPropagation();
                  navigateTo(item.href);
                }}
              >
                <LeagueBadge
                  league={g.league}
                  label={g.leagueLabel}
                  logoUrl={leagueLogoByKey.get(g.league)}
                  size={15}
                />
                <span className="truncate">{g.home.shortName}</span>
                <span className="pl-hist-score-flat num">{scoreText}</span>
                <span className="truncate">{g.away.shortName}</span>
              </a>
              <span className="pl-hist-ed-meta num">
                {g.leagueLabel} · {formatShortIsoDay(g.kickoffUtc.slice(0, 10))}
              </span>
            </div>
          );
        },
      },
      {
        key: "pick",
        header: "Pick publicado",
        render: (item) => (
          <div className="space-y-0.5 min-w-0">
            <strong className="block text-xs font-bold truncate">
              {item.pick ? item.pick.label : "Sin pick publicado"}
            </strong>
            <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
              {item.family.shortLabel}
            </span>
          </div>
        ),
      },
      {
        key: "value",
        header: "Prob. / Cuota",
        numeric: true,
        render: (item) =>
          item.pick ? (
            <SofascoreValueCell
              probPct={item.pick.p * 100}
              fairLabel={formatOddsValue(item.pick.fairDecimal, oddsFormat)}
              bestBookLabel={item.pick.marketDecimal !== null ? (item.bookLabel ?? "Casa") : null}
              bestOddsLabel={
                item.pick.marketDecimal !== null
                  ? formatOddsValue(item.pick.marketDecimal, oddsFormat)
                  : null
              }
              evPct={item.evPct}
            />
          ) : (
            <span className="num" style={{ color: "var(--pl-text-muted)" }}>
              —
            </span>
          ),
      },
      {
        key: "status",
        header: "Resultado",
        align: "end",
        render: (item) => {
          const st = getAuditStatusMeta(item.auditStatus);
          return (
            <span
              className={`pl-hist-outcome-tag is-${item.auditStatus}`}
              data-audit-status={item.auditStatus}
            >
              <MaestroIcon name={st.icon} size={11} />
              <span>{st.label}</span>
            </span>
          );
        },
      },
    ],
    [leagueLogoByKey, navigateTo, oddsFormat],
  );

  const hasActiveFilters =
    league !== "all" ||
    marketFamily !== "all" ||
    outcome !== "all" ||
    searchQuery.trim().length > 0;

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/historial">
        <div className="pl-rec pl-hist-page">
          <header className="pl-hist-header">
            <div className="pl-hist-header-copy">
              <h1 className="pl-rec-title [text-wrap:balance]">Resultados</h1>
              <p className="pl-rec-sub [text-wrap:pretty]">
                Picks publicados antes del inicio y calificados con el marcador oficial. Todos los
                partidos terminados permanecen visibles.
              </p>
            </div>
            <div className="pl-hist-header-controls">
              <label htmlFor={leagueSelectId} className="sr-only">
                Filtrar resultados por liga
              </label>
              <select
                id={leagueSelectId}
                className="pl-rec-select pl-hist-select"
                value={league}
                onChange={(e) => {
                  setLeague(e.target.value);
                  setMarketFamily("all");
                  setShowAllBreakdown(false);
                  setShown(FT_PAGE_SIZE);
                }}
              >
                <option value="all">Todas las ligas ({finishedAudited.length})</option>
                {byLeague.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                    {r.total > 0 ? ` · ${pct(r.hits, r.total).toFixed(0)} %` : ""}
                  </option>
                ))}
              </select>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOutcome("all");
                    setLeague("all");
                    setMarketFamily("all");
                    setSearchQuery("");
                    setShown(FT_PAGE_SIZE);
                  }}
                >
                  Limpiar
                </Button>
              ) : null}
            </div>
          </header>

          <SofascoreKpiStrip items={kpiItems} className="pl-rec-kpi-strip" />

          <div className="pl-hist-workspace">
            <div className="pl-hist-main">
              <SofascoreCard
                id={`${uid}-settled-ft`}
                title={
                  viewMode === "calendar"
                    ? "Calendario mensual"
                    : `Partidos terminados · ${listed.length}`
                }
                meta={
                  <div data-historial-view-toggle="">
                    <SofascoreTabs
                      items={HISTORIAL_VIEW_TABS}
                      value={viewMode}
                      onChange={(next) => setViewMode(next === "calendar" ? "calendar" : "list")}
                      variant="segmented"
                      ariaLabel="Modo de vista de resultados"
                    />
                  </div>
                }
              >
                <div className="space-y-3">
                  {viewMode === "calendar" ? (
                    <DailyResultsCalendar
                      buildMonth={buildModelCalendar}
                      mode="model"
                      onNavigateItem={navigateTo}
                    />
                  ) : (
                    <>
                      <div
                        className="pl-hist-status-bar num"
                        role="group"
                        aria-label="Filtrar por estado de liquidación"
                        data-historial-status-filter=""
                      >
                        {(
                          [
                            ["all", "Todos", familyScoped.length],
                            ["won", "Ganados", statusCounts.won],
                            ["lost", "Perdidos", statusCounts.lost],
                            ["push", "Push", statusCounts.push],
                            ["pending", "Pendientes", statusCounts.pending],
                          ] as const
                        )
                          .filter(([id, , count]) => id === "all" || id === "won" || id === "lost" || count > 0)
                          .map(([id, label, count]) => (
                            <button
                              key={id}
                              type="button"
                              className="pl-hist-status-tab"
                              aria-pressed={outcome === id}
                              data-status-filter={id}
                              onClick={() => {
                                setOutcome(id);
                                setShown(FT_PAGE_SIZE);
                              }}
                            >
                              <span>{label}</span>
                              <span className="pl-hist-status-count num">{count}</span>
                            </button>
                          ))}
                      </div>

                      <div className="pl-hist-toolbar">
                        <div className="pl-hist-search-wrap">
                          <SofascoreFilterBar
                            searchValue={searchQuery}
                            onSearchChange={(next) => {
                              setSearchQuery(next);
                              setShown(FT_PAGE_SIZE);
                            }}
                            searchPlaceholder="Buscar equipo, liga o pick…"
                            resultCount={listed.length}
                          />
                        </div>
                        {familyFilterOptions.length > 1 ? (
                          <div className="pl-hist-market-wrap" data-historial-family-filter="">
                            <label htmlFor={marketSelectId} className="sr-only">
                              Filtrar por tipo de mercado
                            </label>
                            <select
                              id={marketSelectId}
                              className="pl-rec-select pl-hist-select"
                              value={marketFamily}
                              onChange={(e) => {
                                setMarketFamily(e.target.value);
                                setShown(FT_PAGE_SIZE);
                              }}
                            >
                              <option value="all">Todos los mercados</option>
                              {familyFilterOptions.map((opt) => (
                                <option key={opt.key} value={opt.key}>
                                  {opt.shortLabel} ({opt.count})
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                      </div>

                      <SofascoreTable
                        caption="Historial auditable de partidos finalizados (FT) con pick principal, momio justo, casa y resultado"
                        columns={historyColumns}
                        rows={visibleHistoryRows}
                        rowKey={(item) => item.game.id}
                        emptyState={
                          <SofascoreEmptyState
                            title="Sin partidos con ese filtro"
                            description="Prueba limpiando la búsqueda o eligiendo otro resultado o liga."
                            actionLabel="Limpiar filtros"
                            onAction={() => {
                              setOutcome("all");
                              setLeague("all");
                              setMarketFamily("all");
                              setSearchQuery("");
                              setShown(FT_PAGE_SIZE);
                            }}
                          />
                        }
                      />

                      {listed.length > shown ? (
                        <div className="flex justify-center pt-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShown((n) => n + FT_PAGE_SIZE)}
                          >
                            Ver más ({listed.length - shown})
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </SofascoreCard>
            </div>

            <aside className="pl-hist-rail" aria-label="Parlays y desglose de rendimiento">
              <DailyParlaysResultsSection
                games={dataset.games}
                oddsFormat={oddsFormat}
                timeZone={userTimezone || "America/Mexico_City"}
                compact
              />

              {scoped.length > 0 && activeBreakdownRows.length > 0 ? (
                <SofascoreCard
                  id={`${uid}-breakdown`}
                  title="Rendimiento"
                  meta={
                    league === "all" && byLeague.length > 1 ? (
                      <SofascoreTabs
                        items={BREAKDOWN_TABS}
                        value={effectiveBreakdownTab}
                        onChange={(next) => {
                          setBreakdownTab(next === "market" ? "market" : "league");
                          setShowAllBreakdown(false);
                        }}
                        variant="segmented"
                        ariaLabel="Agrupación del rendimiento"
                      />
                    ) : (
                      <span>{activeBreakdownRows.length} mercados</span>
                    )
                  }
                >
                  <div className="space-y-3">
                    <div className="pl-hist-breakdown-list">
                      {visibleBreakdownRows.map((row) => {
                        const rateVal = pct(row.hits, row.total);
                        const barColor =
                          row.total === 0
                            ? "var(--pl-text-muted)"
                            : rateVal >= 55
                              ? "var(--pl-success)"
                              : rateVal < 45
                                ? "var(--pl-warning)"
                                : "var(--pl-brand)";
                        const isClickableLeague = effectiveBreakdownTab === "league" && row.leagueId;
                        const content = (
                          <>
                            <div className="pl-hist-breakdown-top">
                              <span className="pl-hist-breakdown-name">
                                {row.leagueId ? (
                                  <LeagueBadge
                                    league={row.leagueId}
                                    label={row.label}
                                    logoUrl={row.logoUrl}
                                    size={16}
                                  />
                                ) : null}
                                <span className="truncate">{row.label}</span>
                              </span>
                              <span className="pl-hist-breakdown-nums num">
                                <strong>{row.total > 0 ? `${rateVal.toFixed(0)} %` : "—"}</strong>
                                <span className="pl-hist-breakdown-rec">
                                  {row.hits}/{row.total}
                                </span>
                              </span>
                            </div>
                            <span className="pl-hist-breakdown-bar" aria-hidden="true">
                              <span
                                style={{
                                  inlineSize: `${Math.min(100, Math.max(0, rateVal))}%`,
                                  background: barColor,
                                }}
                              />
                            </span>
                          </>
                        );
                        return isClickableLeague ? (
                          <button
                            key={row.key}
                            type="button"
                            className="pl-hist-breakdown-row is-interactive"
                            aria-pressed={league === row.key}
                            onClick={() => {
                              setLeague(league === row.key ? "all" : row.key);
                              setMarketFamily("all");
                              setShowAllBreakdown(false);
                              setShown(FT_PAGE_SIZE);
                            }}
                          >
                            {content}
                          </button>
                        ) : (
                          <div key={row.key} className="pl-hist-breakdown-row">
                            {content}
                          </div>
                        );
                      })}
                    </div>

                    {activeBreakdownRows.length > BREAKDOWN_PAGE_SIZE ? (
                      <div className="flex justify-center">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowAllBreakdown((v) => !v)}
                        >
                          {showAllBreakdown
                            ? "Mostrar menos"
                            : `Ver todas (${activeBreakdownRows.length - BREAKDOWN_PAGE_SIZE} más)`}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </SofascoreCard>
              ) : null}
            </aside>
          </div>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
