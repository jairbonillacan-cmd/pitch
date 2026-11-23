"use client";

import React, { useMemo, useState } from "react";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { formatOddsValue } from "../../access-guard";
import { sanitizeInternalHref } from "../../navigation-helpers";
import {
  useOptionalPlatformActions,
  useOptionalPlatformCore,
} from "../../platform-provider";
import type { MatchPick, MatchPlayerPickItem, OddsFormat } from "../../types";
import { PersonAvatar } from "../team/PersonAvatar";

export interface MatchPlayerPicksBoardProps {
  readonly picks: readonly MatchPlayerPickItem[];
  readonly allowFull: boolean;
  readonly compact?: boolean;
  readonly hideTeamFilter?: boolean;
  readonly homeLabel?: string;
  readonly awayLabel?: string;
  readonly oddsFormat?: OddsFormat;
  readonly upgradeHref?: string;
  readonly hasAccountSession?: boolean;
  readonly parlayPickIds?: ReadonlySet<string>;
  readonly sealedPickIds?: ReadonlySet<string>;
  readonly onToggleParlay?: (pick: MatchPick) => void;
  readonly onSealPick?: (pick: MatchPick) => void;
  readonly onNavigate?: (href: string) => void;
  readonly onPrefetch?: (href: string) => void;
}

type DirectionFilter = "all" | "over" | "under";
type TeamSideFilter = "all" | "home" | "away";

export function filterPlayerPicks(
  picks: readonly MatchPlayerPickItem[],
  filters: {
    readonly direction: DirectionFilter;
    readonly metric: string;
    readonly team: TeamSideFilter;
    readonly hideTeamFilter?: boolean;
  },
): readonly MatchPlayerPickItem[] {
  return picks.filter((item) => {
    if (filters.direction !== "all" && item.direction !== filters.direction) return false;
    if (filters.metric !== "all" && item.marketKey !== filters.metric) return false;
    if (!filters.hideTeamFilter && filters.team !== "all" && item.teamSide !== filters.team) {
      return false;
    }
    return true;
  });
}

export function MatchPlayerPicksBoard({
  picks,
  allowFull,
  compact = false,
  hideTeamFilter = false,
  homeLabel = "Local",
  awayLabel = "Visita",
  oddsFormat: oddsFormatProp,
  upgradeHref: upgradeHrefProp,
  hasAccountSession: hasAccountSessionProp,
  parlayPickIds,
  sealedPickIds,
  onToggleParlay,
  onSealPick,
  onNavigate,
  onPrefetch,
}: MatchPlayerPicksBoardProps): React.JSX.Element {
  const core = useOptionalPlatformCore();
  const actions = useOptionalPlatformActions();

  const oddsFormat = oddsFormatProp ?? core?.oddsFormat ?? "american";
  const upgradeHref = upgradeHrefProp ?? core?.upgradeHref ?? "/precio";
  const hasAccountSession = hasAccountSessionProp ?? core?.hasAccountSession ?? false;

  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [metricFilter, setMetricFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<TeamSideFilter>("all");

  const navigateSafe = (href: string): void => {
    if (onNavigate) {
      onNavigate(href);
      return;
    }
    actions?.navigateTo(href);
  };

  const prefetchSafe = (href: string): void => {
    if (onPrefetch) {
      onPrefetch(href);
      return;
    }
    actions?.prefetchRoute(href);
  };

  const handleToggleParlay = (pick: MatchPick, inParlay: boolean): void => {
    if (onToggleParlay) {
      onToggleParlay(pick);
      return;
    }
    if (inParlay) {
      actions?.removePickFromParlay(pick.id);
    } else {
      actions?.addPickToParlay(pick);
    }
  };

  const handleSealPick = (pick: MatchPick): void => {
    if (onSealPick) {
      onSealPick(pick);
      return;
    }
    actions?.openComposer(pick);
  };

  const availableMetrics = useMemo(() => {
    const counts = new Map<string, { readonly label: string; readonly count: number }>();
    for (const item of picks) {
      const existing = counts.get(item.marketKey);
      counts.set(item.marketKey, {
        label: existing?.label ?? item.marketLabel,
        count: (existing?.count ?? 0) + 1,
      });
    }
    return Array.from(counts.entries()).map(([key, info]) => ({
      key,
      label: info.label,
      count: info.count,
    }));
  }, [picks]);

  const hasBothTeams = useMemo(() => {
    const hasHome = picks.some((item) => item.teamSide === "home");
    const hasAway = picks.some((item) => item.teamSide === "away");
    return hasHome && hasAway;
  }, [picks]);

  const hasOverUnderOptions = useMemo(() => {
    const hasOver = picks.some((item) => item.direction === "over");
    const hasUnder = picks.some((item) => item.direction === "under");
    return { hasOver, hasUnder };
  }, [picks]);

  const filteredPicks = useMemo(
    () =>
      filterPlayerPicks(picks, {
        direction: directionFilter,
        metric: metricFilter,
        team: teamFilter,
        hideTeamFilter,
      }),
    [directionFilter, hideTeamFilter, metricFilter, picks, teamFilter],
  );

  if (!allowFull) {
    return (
      <section
        className="glass-card glass-ring rounded-2xl p-5 space-y-3"
        data-player-picks-locked=""
      >
        <div className="flex items-center gap-2">
          <MaestroIcon name="lock" size={16} />
          <h3 className="m-0 text-sm font-bold" style={{ color: "var(--pl-text)" }}>
            Picks de jugadores disponibles con Pase PitchLab Ultra
          </h3>
        </div>
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          Probabilidades por jugador, tasas reales L5/L10/L20, filtro Más de / Menos de y registro directo en Bitácora.
        </p>
        <a
          href={upgradeHref}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            navigateSafe(upgradeHref);
          }}
          className="pl-btn-accent text-xs min-h-10 px-3.5 inline-flex items-center gap-1.5 no-underline"
        >
          <MaestroIcon name="unlock" size={13} />
          <span>{hasAccountSession ? "Activar Pase Ultra" : "Pase PitchLab Ultra"}</span>
        </a>
      </section>
    );
  }

  if (picks.length === 0) {
    return (
      <section className="glass-card glass-ring rounded-2xl p-5 text-sm" data-player-picks-empty="">
        <p className="m-0" style={{ color: "var(--pl-text-muted)" }}>
          No hay picks de jugadores disponibles todavía para este encuentro.
        </p>
      </section>
    );
  }

  return (
    <div
      className={`pl-mdp-pp-shell${compact ? " is-compact" : ""}`}
      data-player-picks-board=""
    >
      <div className="pl-mdp-pp-main">
        {filteredPicks.length === 0 ? (
          <div className="p-5 text-center space-y-3" data-player-picks-filtered-empty="">
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Ningún pick de jugador coincide con los filtros seleccionados.
            </p>
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-10 px-3"
              onClick={() => {
                setDirectionFilter("all");
                setMetricFilter("all");
                setTeamFilter("all");
              }}
            >
              Mostrar todos
            </button>
          </div>
        ) : (
          <div className="pl-mdp-table-scroll">
            <table className="pl-mdp-pp-table">
              <caption className="sr-only">Picks individuales de jugadores y evidencia</caption>
              <thead>
                <tr>
                  <th scope="col">Pick</th>
                  <th scope="col">Apuesta</th>
                  <th scope="col">Evidencia</th>
                  <th scope="col" className="text-right">
                    Cuotas
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPicks.map((item) => {
                  const safeHref = sanitizeInternalHref(item.playerHref);
                  const inParlay = parlayPickIds?.has(item.pick.id) ?? false;
                  const isSealed = sealedPickIds?.has(item.pick.id) ?? false;

                  return (
                    <tr
                      key={item.id}
                      className="pl-mdp-pp-row"
                      data-player-pick={item.id}
                      data-player-metric={item.marketKey}
                    >
                      <td>
                        <div className="pl-mdp-pp-player-cell">
                          <PersonAvatar
                            photoKey={item.photoKey}
                            fallbackPhotoKey={item.fallbackPhotoKey}
                            role="player"
                            size={34}
                          />
                          <div className="pl-mdp-pp-player-meta">
                            {safeHref && !hideTeamFilter ? (
                              <a
                                href={safeHref}
                                onPointerEnter={() => prefetchSafe(safeHref)}
                                onClick={(e) => {
                                  if (
                                    e.metaKey ||
                                    e.ctrlKey ||
                                    e.shiftKey ||
                                    e.altKey ||
                                    e.button !== 0
                                  ) {
                                    return;
                                  }
                                  e.preventDefault();
                                  navigateSafe(safeHref);
                                }}
                                className="pl-mdp-pp-player-name pl-team-link no-underline"
                              >
                                {item.playerName}
                              </a>
                            ) : (
                              <strong className="pl-mdp-pp-player-name">{item.playerName}</strong>
                            )}
                            <span className="pl-mdp-pp-player-sub">
                              <span>{item.teamName}</span>
                              {item.positionLabel ? <span>· {item.positionLabel}</span> : null}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="pl-mdp-pp-bet-cell">
                        <strong className="pl-mdp-pp-selection">{item.selectionLabel}</strong>
                        <span className="pl-mdp-pp-market-tag">
                          {item.marketLabel} · {(item.p * 100).toFixed(0)} %
                        </span>
                      </td>

                      <td>
                        {item.evidenceBullets.length > 0 ? (
                          <ul className="pl-mdp-pp-ev-list">
                            {item.evidenceBullets.map((b, bIdx) => (
                              <li key={`${item.id}-ev-${bIdx}`} className="pl-mdp-pp-ev-item">
                                <span>{b.label}</span>
                                {b.ratePct !== null ? (
                                  <strong className={`pl-mdp-pp-ev-rate is-${b.tone} num`}>
                                    {b.ratePct} %
                                  </strong>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                            Datos de plantilla
                          </span>
                        )}
                      </td>

                      <td className="pl-mdp-pp-odds-cell">
                        <div className="pl-mdp-pp-odds-stack num">
                          <div className="pl-mdp-pp-odds-row">
                            <span className="pl-mdp-pp-odds-chip is-fair" title="Momio justo">
                              {formatOddsValue(item.fairDecimal, oddsFormat)}
                            </span>
                            {item.marketDecimal ? (
                              <span className="pl-mdp-pp-odds-chip">
                                {item.marketBookLabel ?? "Casa"}{" "}
                                {formatOddsValue(item.marketDecimal, oddsFormat)}
                              </span>
                            ) : null}
                            {item.evPct !== null && item.evPct > 0 ? (
                              <span className="pl-mdp-pp-ev-badge">
                                +{item.evPct.toFixed(1)} % EV
                              </span>
                            ) : null}
                          </div>

                          <div className="pl-mdp-pp-actions">
                            <button
                              type="button"
                              className={`pl-home-parlay-btn is-sm ${inParlay ? "is-on" : ""}`.trim()}
                              aria-pressed={inParlay}
                              onClick={() => handleToggleParlay(item.pick, inParlay)}
                            >
                              <MaestroIcon name={inParlay ? "check" : "plus"} size={13} />
                              <span>{inParlay ? "En parlay" : "Parlay"}</span>
                            </button>
                            <button
                              type="button"
                              className={`pl-home-md-action-btn ${isSealed ? "is-done" : ""}`.trim()}
                              disabled={isSealed}
                              onClick={() => handleSealPick(item.pick)}
                            >
                              <MaestroIcon name={isSealed ? "check" : "add-to-record"} size={13} />
                              <span>{isSealed ? "Sellado" : "Sellar"}</span>
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <aside className="pl-mdp-pp-rail" aria-label="Filtros de picks de jugadores" data-player-picks-rail="">
        <div className="pl-mdp-rail-group">
          <h4 className="pl-mdp-rail-title">Dirección</h4>
          <div className="pl-mdp-rail-pills">
            {(
              [
                { id: "all", label: "Todos" },
                ...(hasOverUnderOptions.hasOver || picks.length > 0
                  ? [{ id: "over", label: "Más de" } as const]
                  : []),
                { id: "under", label: "Menos de" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`pl-mdp-rail-btn ${directionFilter === opt.id ? "is-active" : ""}`.trim()}
                aria-pressed={directionFilter === opt.id}
                data-pp-dir={opt.id}
                onClick={() => setDirectionFilter(opt.id)}
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pl-mdp-rail-group">
          <h4 className="pl-mdp-rail-title">Métrica</h4>
          <div className="pl-mdp-rail-pills">
            <button
              type="button"
              className={`pl-mdp-rail-btn ${metricFilter === "all" ? "is-active" : ""}`.trim()}
              aria-pressed={metricFilter === "all"}
              data-pp-metric="all"
              onClick={() => setMetricFilter("all")}
            >
              <span>Todas</span>
              <span className="num">{picks.length}</span>
            </button>
            {availableMetrics.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`pl-mdp-rail-btn ${metricFilter === m.key ? "is-active" : ""}`.trim()}
                aria-pressed={metricFilter === m.key}
                data-pp-metric={m.key}
                onClick={() => setMetricFilter(m.key)}
              >
                <span>{m.label}</span>
                <span className="num">{m.count}</span>
              </button>
            ))}
          </div>
        </div>

        {!hideTeamFilter && hasBothTeams ? (
          <div className="pl-mdp-rail-group">
            <h4 className="pl-mdp-rail-title">Equipo</h4>
            <div className="pl-mdp-rail-pills">
              {(
                [
                  { id: "all", label: "Ambos" },
                  { id: "home", label: homeLabel },
                  { id: "away", label: awayLabel },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`pl-mdp-rail-btn ${teamFilter === opt.id ? "is-active" : ""}`.trim()}
                  aria-pressed={teamFilter === opt.id}
                  data-pp-team={opt.id}
                  onClick={() => setTeamFilter(opt.id)}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
