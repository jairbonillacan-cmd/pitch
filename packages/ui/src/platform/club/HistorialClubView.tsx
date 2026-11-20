"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { canonicalGameHref } from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { CalibrationCurveChart } from "../components/CalibrationCurveChart";
import { CalibrationHonestyLab } from "../components/CalibrationHonestyLab";
import { DailyResultsCalendar } from "../components/DailyResultsCalendar";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import {
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import { buildModelDailyCalendar } from "../record-stats";
import type { MatchPick, PlatformGame } from "../types";
import { DailyParlaysResultsSection } from "./DailyParlaysResultsSection";
import { formatSignedPctValue } from "./record/PublicRecordSections";
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

interface Rate {
  key: string;
  label: string;
  hits: number;
  total: number;
}

interface AuditRate extends Rate {
  pushes?: number;
  avgEvPct?: number | null;
}

const pct = (hits: number, total: number) => (total > 0 ? (hits / total) * 100 : 0);

/** Acierto agrupado por una clave, de más a menos partidos. */
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

function RateBars({
  title,
  rates,
  renderIcon,
}: {
  title: string;
  rates: readonly AuditRate[];
  renderIcon?: (r: AuditRate) => React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="pl-hist-card glass-card glass-ring" aria-label={title}>
      <h2 className="pl-cortex-label">{title}</h2>
      <ul className="pl-hist-bars" role="list">
        {rates.map((r) => {
          const v = pct(r.hits, r.total);
          const barColor =
            r.total === 0
              ? "var(--pl-text-muted)"
              : v >= 55
                ? "var(--pl-success)"
                : v < 45
                  ? "var(--pl-warning)"
                  : "var(--pl-brand)";
          return (
            <li key={r.key}>
              <span className="pl-hist-bar-label">
                {renderIcon?.(r)}
                <span className="min-w-0 flex flex-col">
                  <span className="truncate">{r.label}</span>
                  {typeof r.avgEvPct === "number" && Number.isFinite(r.avgEvPct) ? (
                    <small
                      className="text-[10.5px] font-semibold num truncate"
                      style={{
                        color: r.avgEvPct > 0 ? "var(--pl-success)" : "var(--pl-text-muted)",
                      }}
                    >
                      EV {formatSignedPctValue(r.avgEvPct)}
                    </small>
                  ) : null}
                </span>
              </span>
              <span className="pl-hist-bar-track" aria-hidden="true">
                <span style={{ width: `${v}%`, background: barColor }} />
                <i style={{ left: "50%" }} />
              </span>
              <span className="pl-hist-bar-value num">
                <strong>{r.total > 0 ? `${v.toFixed(0)} %` : "—"}</strong>
                <small>
                  {r.hits}/{r.total}
                  {r.pushes && r.pushes > 0 ? ` · ${r.pushes}P` : ""}
                </small>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-[11px] [text-wrap:pretty]" style={{ color: "var(--pl-text-muted)" }}>
        La línea marca 50 %. Los empates de línea (Push) no distorsionan el porcentaje de acierto.
      </p>
    </section>
  );
}

interface AuditedFinishedGame {
  readonly game: PlatformGame;
  readonly pick: MatchPick | undefined;
  readonly auditStatus: AuditPickStatus;
  readonly family: MarketFamilyTag;
  readonly evPct: number | null;
  readonly bookLabel: string | null;
}

const DAY_FMT = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Mexico_City",
});

/**
 * Resultados auditables: muestra el 100 % de los partidos finalizados (FT) sin ocultamiento,
 * con estado claro (Ganado / Perdido / Push / Pendiente), desglose por familia de mercado,
 * EV+ real y casa de apuestas cuando hay cuota capturada.
 */
export function HistorialClubView(): React.JSX.Element {
  const uid = useId();
  const leagueSelectId = `${uid}-hist-league`;
  const { dataset, oddsFormat, userTimezone } = usePlatformCore();
  const { navigateTo } = usePlatformActions();
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [league, setLeague] = useState("all");
  const [marketFamily, setMarketFamily] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [shown, setShown] = useState(20);

  // Cero ocultamiento: incluye TODOS los partidos finalizados (FT) ordenados del más reciente al más antiguo.
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
          return { game, pick, auditStatus, family, evPct, bookLabel };
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

  const listed = useMemo(
    () =>
      familyScoped.filter(
        (item) => outcome === "all" || item.auditStatus === outcome,
      ),
    [familyScoped, outcome],
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

  const recent = scoped.slice(0, 10);

  const byLeague = useMemo<AuditRate[]>(() => {
    const map = new Map<string, { key: string; label: string; hits: number; total: number; pushes: number; countAll: number }>();
    for (const item of finishedAudited) {
      const cur = map.get(item.game.league) ?? {
        key: item.game.league,
        label: item.game.leagueLabel,
        hits: 0,
        total: 0,
        pushes: 0,
        countAll: 0,
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
      map.set(item.game.league, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.countAll - a.countAll)
      .map(({ key, label, hits, total, pushes }) => ({ key, label, hits, total, pushes }));
  }, [finishedAudited]);

  const byMarketFamily = useMemo<AuditRate[]>(() => {
    const map = new Map<
      string,
      { key: string; label: string; hits: number; total: number; pushes: number; evSum: number; evCount: number }
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

  const days = useMemo(() => {
    const m = new Map<string, AuditedFinishedGame[]>();
    for (const item of listed.slice(0, shown)) {
      const k = item.game.kickoffUtc.slice(0, 10);
      const list = m.get(k) ?? [];
      list.push(item);
      m.set(k, list);
    }
    return Array.from(m.entries());
  }, [listed, shown]);

  const buildModelCalendar = useCallback(
    (ym: string) =>
      buildModelDailyCalendar(
        decidedScoped
          .filter((item) => Boolean(item.pick))
          .map((item) => {
            const g = item.game;
            const pk = item.pick!;
            const scoreText = g.score ? `${g.score.home}–${g.score.away}` : "FT";
            return {
              id: g.id,
              kickoffUtc: g.kickoffUtc,
              label: `${g.home.shortName} ${scoreText} ${g.away.shortName}`,
              subtitle: `${g.leagueLabel} · ${item.family.shortLabel} · ${pk.label}`,
              hit: item.auditStatus === "won",
              href: canonicalGameHref(g.league, g),
            };
          }),
        ym || undefined,
        { timeZone: userTimezone || "America/Mexico_City" },
      ),
    [decidedScoped, userTimezone],
  );

  const calibrationSamples = useMemo(
    () =>
      decidedScoped
        .filter((item) => item.pick && Number.isFinite(item.pick.p))
        .map((item) => ({
          p: item.pick!.p,
          hit: item.auditStatus === "won",
        })),
    [decidedScoped],
  );

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/historial">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold [text-wrap:balance]">
              Resultados
            </h1>
            <p
              className="m-0 text-sm max-w-2xl [text-wrap:pretty]"
              style={{ color: "var(--pl-text-secondary)" }}
            >
              Cada pick principal se publica antes del partido y se audita con el marcador oficial.
              Todos los partidos finalizados (FT) permanecen visibles: ganados, perdidos, push y
              pendientes.
            </p>
          </div>
          <div className="pl-finder-select">
            <label htmlFor={leagueSelectId}>Liga</label>
            <select
              id={leagueSelectId}
              className="glass-input min-h-11 text-base sm:text-sm"
              value={league}
              onChange={(e) => {
                setLeague(e.target.value);
                setMarketFamily("all");
                setShown(20);
              }}
            >
              <option value="all">Todas</option>
              {byLeague.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        <section className="pl-hist-kpis" aria-label="Resumen auditable de resultados">
          <div className="pl-hist-kpi glass-card glass-ring">
            <span>Finalizados (FT)</span>
            <strong className="num">{scoped.length}</strong>
            <small className="num">
              {league === "all"
                ? `${byLeague.length} ligas · ${decidedScoped.length} decididos`
                : `${decidedScoped.length} decididos`}
              {scopedStatusCounts.push > 0 ? ` · ${scopedStatusCounts.push} Push` : ""}
              {scopedStatusCounts.pending > 0 ? ` · ${scopedStatusCounts.pending} Pend.` : ""}
            </small>
          </div>

          <div className="pl-hist-kpi glass-card glass-ring">
            <span>Pick principal ganado</span>
            <strong
              className="num"
              style={{
                color:
                  decidedScoped.length > 0 && pct(scopedStatusCounts.won, decidedScoped.length) >= 55
                    ? "var(--pl-success)"
                    : "var(--pl-text)",
              }}
            >
              {decidedScoped.length > 0
                ? `${pct(scopedStatusCounts.won, decidedScoped.length).toFixed(1)} %`
                : "—"}
            </strong>
            <small className="num">
              {scopedStatusCounts.won}G – {scopedStatusCounts.lost}P
              {scopedStatusCounts.push > 0 ? ` · ${scopedStatusCounts.push} Push` : ""}
            </small>
          </div>

          <div className="pl-hist-kpi glass-card glass-ring">
            <span>{evSummary.avgEvPct !== null ? "EV medio capturado" : "Momio justo medio"}</span>
            <strong
              className="num"
              style={{
                color:
                  evSummary.avgEvPct !== null
                    ? evSummary.avgEvPct > 0
                      ? "var(--pl-success)"
                      : "var(--pl-warning)"
                    : "var(--pl-text)",
              }}
            >
              {evSummary.avgEvPct !== null
                ? formatSignedPctValue(evSummary.avgEvPct)
                : evSummary.avgFairDecimal !== null
                  ? formatOddsValue(evSummary.avgFairDecimal, oddsFormat)
                  : "—"}
            </strong>
            <small className="num">
              {evSummary.avgEvPct !== null
                ? `${evSummary.evCount} con cuota de casa`
                : "Solo probabilidades calibradas"}
            </small>
          </div>

          <div className="pl-hist-kpi glass-card glass-ring">
            <span>Últimos {recent.length} FT</span>
            <span
              className="pl-hist-streak"
              aria-label={`Últimos resultados: ${recent
                .map((item) => getAuditStatusMeta(item.auditStatus).spoken)
                .join(", ")}`}
            >
              {recent.map((item) => {
                const st = getAuditStatusMeta(item.auditStatus);
                const sqClass =
                  item.auditStatus === "won"
                    ? "is-hit"
                    : item.auditStatus === "lost"
                      ? "is-miss"
                      : "";
                return (
                  <span
                    key={item.game.id}
                    className={`pl-hist-sq ${sqClass}`.trim()}
                    style={
                      !sqClass
                        ? {
                            background: "var(--pl-surface-elevated)",
                            color:
                              item.auditStatus === "pending"
                                ? "var(--pl-info)"
                                : "var(--pl-text-muted)",
                            border: "1px solid var(--pl-border)",
                          }
                        : undefined
                    }
                    aria-hidden="true"
                  >
                    <MaestroIcon name={st.icon} size={11} />
                  </span>
                );
              })}
            </span>
          </div>
        </section>

        {byLeague.length > 1 ? (
          <div className="pl-hist-league-pills" role="group" aria-label="Filtrar resultados por liga">
            <button
              type="button"
              className={`pl-hist-league-pill min-h-11 sm:min-h-9 ${league === "all" ? "is-on" : ""}`.trim()}
              aria-pressed={league === "all"}
              onClick={() => {
                setLeague("all");
                setMarketFamily("all");
                setShown(20);
              }}
            >
              Todas <span className="num">{finishedAudited.length}</span>
            </button>
            {byLeague.slice(0, 10).map((r) => (
              <button
                key={r.key}
                type="button"
                className={`pl-hist-league-pill min-h-11 sm:min-h-9 ${league === r.key ? "is-on" : ""}`.trim()}
                aria-pressed={league === r.key}
                onClick={() => {
                  setLeague(r.key);
                  setMarketFamily("all");
                  setShown(20);
                }}
              >
                <LeagueBadge
                  league={r.key as PlatformGame["league"]}
                  label={r.label}
                  logoUrl={dataset.leagues.find((l) => l.league === r.key)?.logoUrl}
                  size={15}
                />
                <span>{r.label}</span>
                <span className="num">
                  {r.total > 0 ? `${pct(r.hits, r.total).toFixed(0)}%` : "FT"}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <DailyParlaysResultsSection games={dataset.games} oddsFormat={oddsFormat} />

        {calibrationSamples.length > 0 ? (
          <CalibrationCurveChart samples={calibrationSamples} />
        ) : null}

        <CalibrationHonestyLab oddsFormat={oddsFormat} settledCount={decidedScoped.length} />

        {scoped.length > 0 ? (
          <div className="pl-hist-grid">
            {league === "all" && byLeague.length > 1 ? (
              <RateBars
                title="Acierto por liga"
                rates={byLeague}
                renderIcon={(r) => (
                  <LeagueBadge
                    league={r.key as PlatformGame["league"]}
                    label={r.label}
                    logoUrl={dataset.leagues.find((l) => l.league === r.key)?.logoUrl}
                    size={16}
                  />
                )}
              />
            ) : null}
            {byMarketFamily.length > 0 ? (
              <RateBars title="Acierto por familia de mercado" rates={byMarketFamily} />
            ) : null}
          </div>
        ) : null}

        <section className="space-y-3" aria-label="Partidos finalizados auditados">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {viewMode === "list" ? (
              <div
                className="flex flex-wrap items-center gap-1.5 num"
                role="group"
                aria-label="Filtrar por estado de liquidación"
                data-historial-status-filter=""
              >
                {(
                  [
                    ["all", `Todos · ${familyScoped.length}`],
                    ["won", `Ganados · ${statusCounts.won}`],
                    ["lost", `Perdidos · ${statusCounts.lost}`],
                    ["push", `Push · ${statusCounts.push}`],
                    ["pending", `Pendientes · ${statusCounts.pending}`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`pl-hist-league-pill min-h-11 sm:min-h-9 ${outcome === id ? "is-on" : ""}`.trim()}
                    aria-pressed={outcome === id}
                    data-status-filter={id}
                    onClick={() => {
                      setOutcome(id);
                      setShown(20);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <h2 className="m-0 text-base font-extrabold [text-wrap:balance]">
                Calendario mensual de resultados
              </h2>
            )}

            <div
              className="seg-well"
              role="group"
              aria-label="Modo de vista de resultados"
              data-historial-view-toggle=""
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

          {viewMode === "list" && familyFilterOptions.length > 1 ? (
            <div
              className="pl-hist-league-pills num"
              role="group"
              aria-label="Filtrar resultados por familia de mercado"
              data-historial-family-filter=""
            >
              <button
                type="button"
                className={`pl-hist-league-pill min-h-11 sm:min-h-9 ${marketFamily === "all" ? "is-on" : ""}`.trim()}
                aria-pressed={marketFamily === "all"}
                onClick={() => {
                  setMarketFamily("all");
                  setShown(20);
                }}
              >
                Todas las familias
              </button>
              {familyFilterOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`pl-hist-league-pill min-h-11 sm:min-h-9 ${marketFamily === opt.key ? "is-on" : ""}`.trim()}
                  aria-pressed={marketFamily === opt.key}
                  onClick={() => {
                    setMarketFamily(opt.key);
                    setShown(20);
                  }}
                >
                  <span>{opt.shortLabel}</span>
                  <span>{opt.count}</span>
                </button>
              ))}
            </div>
          ) : null}

          {viewMode === "calendar" ? (
            <div className="glass-card glass-ring rounded-2xl p-4 sm:p-5">
              <DailyResultsCalendar
                buildMonth={buildModelCalendar}
                mode="model"
                onNavigateItem={navigateTo}
              />
            </div>
          ) : days.length === 0 ? (
            <p className="m-0 text-sm [text-wrap:pretty]" style={{ color: "var(--pl-text-muted)" }}>
              Todavía no hay partidos finalizados con ese filtro.
            </p>
          ) : (
            days.map(([day, items]) => {
              const rawDayLabel = DAY_FMT.format(new Date(`${day}T18:00:00Z`));
              const dayLabel = rawDayLabel.charAt(0).toUpperCase() + rawDayLabel.slice(1);
              return (
                <div key={day} className="space-y-2">
                  <h3 className="pl-home-day-head m-0">{dayLabel}</h3>
                  <ul className="pl-hist-list" role="list">
                    {items.map(({ game: g, pick, auditStatus, family, evPct, bookLabel }) => {
                      const statusMeta = getAuditStatusMeta(auditStatus);
                      const href = canonicalGameHref(g.league, g);
                      const chipClass =
                        auditStatus === "won" || auditStatus === "lost"
                          ? statusMeta.histChipClass
                          : `${statusMeta.pillClass} text-xs`;

                      return (
                        <li key={g.id}>
                          <a
                            href={href}
                            className="pl-hist-row glass-card glass-ring"
                            data-audit-status={auditStatus}
                            onClick={(e) => {
                              e.preventDefault();
                              navigateTo(href);
                            }}
                          >
                            <LeagueBadge
                              league={g.league}
                              label={g.leagueLabel}
                              logoUrl={g.leagueLogoUrl}
                              size={18}
                            />

                            <span className="pl-hist-match">
                              <strong className="pl-hist-match-line">
                                <TeamBadge
                                  league={g.league}
                                  slug={g.home.slug}
                                  name={g.home.name}
                                  logoUrl={g.home.logoUrl}
                                  size={18}
                                />
                                <span className="truncate">{g.home.shortName}</span>
                                <span className="pl-hist-score-pill num">
                                  {g.score ? `${g.score.home}–${g.score.away}` : "FT"}
                                </span>
                                <span className="truncate">{g.away.shortName}</span>
                                <TeamBadge
                                  league={g.league}
                                  slug={g.away.slug}
                                  name={g.away.name}
                                  logoUrl={g.away.logoUrl}
                                  size={18}
                                />
                              </strong>

                              <span
                                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs num"
                                style={{ color: "var(--pl-text-muted)" }}
                              >
                                <span className="font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                                  {pick ? pick.label : "Sin pick principal publicado"}
                                </span>
                                <span>· {family.shortLabel}</span>
                                {pick ? (
                                  <>
                                    <span>· {(pick.p * 100).toFixed(0)} %</span>
                                    <span>
                                      · Justo {formatOddsValue(pick.fairDecimal, oddsFormat)}
                                    </span>
                                  </>
                                ) : null}
                                {pick && pick.marketDecimal !== null ? (
                                  <span>
                                    · {bookLabel ?? "Casa"}{" "}
                                    {formatOddsValue(pick.marketDecimal, oddsFormat)}
                                  </span>
                                ) : null}
                                {evPct !== null ? (
                                  <span
                                    className="font-bold"
                                    style={{
                                      color:
                                        evPct > 0
                                          ? "var(--pl-success)"
                                          : "var(--pl-text-muted)",
                                    }}
                                  >
                                    · EV {formatSignedPctValue(evPct)}
                                  </span>
                                ) : null}
                              </span>
                            </span>

                            <span className={`${chipClass} shrink-0`}>
                              <MaestroIcon name={statusMeta.icon} size={12} />
                              <span>{statusMeta.label}</span>
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}

          {listed.length > shown ? (
            <div className="flex justify-center">
              <button
                type="button"
                className="pl-btn-glass text-sm min-h-11 px-5"
                onClick={() => setShown((n) => n + 20)}
              >
                Ver más ({listed.length - shown})
              </button>
            </div>
          ) : null}
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
