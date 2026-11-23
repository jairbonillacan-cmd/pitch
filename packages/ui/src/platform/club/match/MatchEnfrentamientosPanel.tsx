"use client";

import React, { useMemo, useRef, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { TeamBadge } from "../../../sports";
import type {
  MatchEnfrentamientosData,
  TeamRankingMetricRow,
} from "../../types";

export interface MatchEnfrentamientosPanelProps {
  readonly enfrentamientos: MatchEnfrentamientosData | null | undefined;
  readonly league: LeagueId | string;
  readonly homeName: string;
  readonly homeSlug: string;
  readonly homeLogoUrl?: string | null;
  readonly awayName: string;
  readonly awaySlug: string;
  readonly awayLogoUrl?: string | null;
  readonly compact?: boolean;
}

type TeamSideMode = "attack" | "defense";
type HistoryTabKey = "home" | "h2h" | "away";

function formatMetricVal(val: number, unit: string): string {
  const rounded = unit === "%" ? String(Math.round(val)) : val.toFixed(2);
  return unit ? `${rounded} ${unit}` : rounded;
}

export function buildEnfrentamientosRankingRows(
  rankings: MatchEnfrentamientosData["rankings"],
  homeMode: TeamSideMode,
  awayMode: TeamSideMode,
): ReadonlyArray<{
  readonly id: string;
  readonly metricLabel: string;
  readonly homeVal: string | null;
  readonly homeRank: number | null;
  readonly awayVal: string | null;
  readonly awayRank: number | null;
}> {
  if (!rankings) return [];
  const homeList: readonly TeamRankingMetricRow[] =
    homeMode === "attack" ? rankings.attack : rankings.defense;
  const awayList: readonly TeamRankingMetricRow[] =
    awayMode === "attack" ? rankings.attack : rankings.defense;
  const maxLen = Math.max(homeList.length, awayList.length);
  const merged: Array<{
    readonly id: string;
    readonly metricLabel: string;
    readonly homeVal: string | null;
    readonly homeRank: number | null;
    readonly awayVal: string | null;
    readonly awayRank: number | null;
  }> = [];

  for (let i = 0; i < maxLen; i += 1) {
    const hm = homeList[i] ?? null;
    const am = awayList[i] ?? null;
    const metricLabel =
      hm && am && hm.key !== am.key
        ? `${hm.label} vs ${am.label}`
        : (hm?.label ?? am?.label ?? "");
    merged.push({
      id: `${homeMode}-${awayMode}-${i}`,
      metricLabel,
      homeVal: hm ? formatMetricVal(hm.homeValue, hm.unit) : null,
      homeRank: hm ? hm.homeRank : null,
      awayVal: am ? formatMetricVal(am.awayValue, am.unit) : null,
      awayRank: am ? am.awayRank : null,
    });
  }
  return merged;
}

export function filterEnfrentamientosHistory<
  T extends { readonly isHomeForFocus: boolean; readonly isSameCompetition: boolean },
>(
  rows: readonly T[],
  filters: { readonly onlyFocusHomeVenue: boolean; readonly onlySameCompetition: boolean },
): readonly T[] {
  return rows.filter((row) => {
    if (filters.onlyFocusHomeVenue && !row.isHomeForFocus) return false;
    if (filters.onlySameCompetition && !row.isSameCompetition) return false;
    return true;
  });
}

function resultLetterEs(result: "W" | "D" | "L"): string {
  if (result === "W") return "G";
  if (result === "L") return "P";
  return "E";
}

export function MatchEnfrentamientosPanel({
  enfrentamientos,
  league,
  homeName,
  homeSlug,
  homeLogoUrl,
  awayName,
  awaySlug,
  awayLogoUrl,
  compact = false,
}: MatchEnfrentamientosPanelProps): React.JSX.Element {
  const [homeMode, setHomeMode] = useState<TeamSideMode>("attack");
  const [awayMode, setAwayMode] = useState<TeamSideMode>("attack");
  const defaultTab: HistoryTabKey =
    (enfrentamientos?.h2h.length ?? 0) > 0 ? "h2h" : "home";
  const [historyTab, setHistoryTab] = useState<HistoryTabKey>(defaultTab);
  const [onlyFocusHomeVenue, setOnlyFocusHomeVenue] = useState<boolean>(false);
  const [onlySameCompetition, setOnlySameCompetition] = useState<boolean>(false);
  const [showAllRows, setShowAllRows] = useState<boolean>(false);
  const tabRefs = useRef<Partial<Record<HistoryTabKey, HTMLButtonElement | null>>>({});

  const rankings = enfrentamientos?.rankings ?? null;

  const rankingRows = useMemo(
    () => buildEnfrentamientosRankingRows(rankings, homeMode, awayMode),
    [awayMode, homeMode, rankings],
  );

  const activeSourceRows = useMemo(() => {
    if (!enfrentamientos) return [];
    if (historyTab === "home") return enfrentamientos.homeRecent;
    if (historyTab === "away") return enfrentamientos.awayRecent;
    return enfrentamientos.h2h;
  }, [enfrentamientos, historyTab]);

  const filteredHistory = useMemo(
    () =>
      filterEnfrentamientosHistory(activeSourceRows, {
        onlyFocusHomeVenue,
        onlySameCompetition,
      }),
    [activeSourceRows, onlyFocusHomeVenue, onlySameCompetition],
  );

  if (!enfrentamientos) {
    return (
      <section className="glass-card glass-ring rounded-2xl p-5 text-sm" data-enfrentamientos-empty="">
        <p className="m-0" style={{ color: "var(--pl-text-muted)" }}>
          Aún no hay métricas ni historial previo suficiente para comparar estos equipos.
        </p>
      </section>
    );
  }

  const visibleHistory = showAllRows ? filteredHistory : filteredHistory.slice(0, 10);
  const tabOrder: readonly { readonly id: HistoryTabKey; readonly label: string }[] = [
    { id: "home", label: homeName },
    { id: "h2h", label: "H2H" },
    { id: "away", label: awayName },
  ];

  const handleTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    currentId: HistoryTabKey,
  ): void => {
    const idx = tabOrder.findIndex((t) => t.id === currentId);
    if (idx < 0) return;
    let nextIdx = -1;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabOrder.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabOrder.length) % tabOrder.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabOrder.length - 1;
    if (nextIdx >= 0 && tabOrder[nextIdx]) {
      e.preventDefault();
      const target = tabOrder[nextIdx]!.id;
      setHistoryTab(target);
      setShowAllRows(false);
      tabRefs.current[target]?.focus();
    }
  };

  return (
    <div className="pl-mdp-enf-stack" data-match-enfrentamientos-panel="">
      <section className="pl-mdp-card" data-enfrentamientos-rankings="">
        <div className="pl-mdp-card-head">
          <h3 className="pl-mdp-card-title">Clasificación de equipos</h3>
          {rankings ? (
            <span className="pl-pill text-xs num">
              Entre {rankings.leagueSize} equipos
            </span>
          ) : null}
        </div>

        {rankingRows.length === 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Clasificación ofensiva y defensiva no disponible para esta competición.
          </p>
        ) : (
          <div className="pl-mdp-table-scroll">
            <table className="pl-mdp-rank-table">
              <caption className="sr-only">
                Comparativa ofensiva y defensiva entre {homeName} y {awayName}
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <TeamBadge
                          league={league}
                          slug={homeSlug}
                          name={homeName}
                          logoUrl={homeLogoUrl ?? undefined}
                          size={18}
                        />
                        <span className="truncate">{homeName}</span>
                      </span>
                      <div className="pl-mdp-mode-toggle" role="group" aria-label={`Modo de ${homeName}`}>
                        <button
                          type="button"
                          className={`pl-mdp-mode-btn ${homeMode === "attack" ? "is-active" : ""}`.trim()}
                          aria-pressed={homeMode === "attack"}
                          onClick={() => setHomeMode("attack")}
                        >
                          Ataque
                        </button>
                        <button
                          type="button"
                          className={`pl-mdp-mode-btn ${homeMode === "defense" ? "is-active" : ""}`.trim()}
                          aria-pressed={homeMode === "defense"}
                          onClick={() => setHomeMode("defense")}
                        >
                          Defensa
                        </button>
                      </div>
                    </div>
                  </th>
                  <th scope="col">Métrica</th>
                  <th scope="col">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <TeamBadge
                          league={league}
                          slug={awaySlug}
                          name={awayName}
                          logoUrl={awayLogoUrl ?? undefined}
                          size={18}
                        />
                        <span className="truncate">{awayName}</span>
                      </span>
                      <div className="pl-mdp-mode-toggle" role="group" aria-label={`Modo de ${awayName}`}>
                        <button
                          type="button"
                          className={`pl-mdp-mode-btn ${awayMode === "attack" ? "is-active" : ""}`.trim()}
                          aria-pressed={awayMode === "attack"}
                          onClick={() => setAwayMode("attack")}
                        >
                          Ataque
                        </button>
                        <button
                          type="button"
                          className={`pl-mdp-mode-btn ${awayMode === "defense" ? "is-active" : ""}`.trim()}
                          aria-pressed={awayMode === "defense"}
                          onClick={() => setAwayMode("defense")}
                        >
                          Defensa
                        </button>
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankingRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.homeVal !== null ? (
                        <span className="pl-mdp-rank-cell num">
                          <strong>{row.homeVal}</strong>
                          {row.homeRank !== null ? (
                            <span className={`pl-mdp-rank-badge ${row.homeRank <= 3 ? "is-top" : ""}`.trim()}>
                              {row.homeRank}.º
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <th scope="row">{row.metricLabel}</th>
                    <td>
                      {row.awayVal !== null ? (
                        <span className="pl-mdp-rank-cell num">
                          <strong>{row.awayVal}</strong>
                          {row.awayRank !== null ? (
                            <span className={`pl-mdp-rank-badge ${row.awayRank <= 3 ? "is-top" : ""}`.trim()}>
                              {row.awayRank}.º
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pl-mdp-card" data-enfrentamientos-partidos="">
        <div className="pl-mdp-card-head">
          <h3 className="pl-mdp-card-title">Partidos</h3>
          <span className="pl-pill text-xs num">{filteredHistory.length}</span>
        </div>

        <div className="pl-mdp-filters-bar">
          <div
            role="tablist"
            aria-label="Historial de partidos"
            className="pl-mdp-switcher"
          >
            {tabOrder.map((tab) => {
              const selected = historyTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  data-enf-tab={tab.id}
                  className={`pl-mdp-switcher-btn ${selected ? "is-active" : ""}`.trim()}
                  onClick={() => {
                    setHistoryTab(tab.id);
                    setShowAllRows(false);
                  }}
                  onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="pl-mdp-checks">
            <label className="pl-mdp-check-label">
              <input
                type="checkbox"
                checked={onlyFocusHomeVenue}
                onChange={(e) => setOnlyFocusHomeVenue(e.target.checked)}
                data-enf-filter-venue=""
              />
              <span>En {historyTab === "away" ? awayName : homeName}</span>
            </label>
            <label className="pl-mdp-check-label">
              <input
                type="checkbox"
                checked={onlySameCompetition}
                onChange={(e) => setOnlySameCompetition(e.target.checked)}
                data-enf-filter-comp=""
              />
              <span>Esta competencia</span>
            </label>
          </div>
        </div>

        {visibleHistory.length === 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Sin partidos registrados con los filtros seleccionados.
          </p>
        ) : (
          <ul className="pl-mdp-match-history-list">
            {visibleHistory.map((m) => (
              <li key={m.id} className="pl-mdp-match-history-row" data-enf-row="">
                <span className="num text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {m.dateIso.slice(0, 10)}
                </span>
                <div className="pl-mdp-match-history-teams">
                  <span className="truncate font-semibold" style={{ color: "var(--pl-text)" }}>
                    {m.homeTeam} vs {m.awayTeam}
                  </span>
                  {!compact ? (
                    <span className="pl-mdp-match-history-comp truncate">{m.competitionLabel}</span>
                  ) : null}
                </div>
                <strong className="num text-sm" style={{ color: "var(--pl-text)" }}>
                  {m.homeScore} – {m.awayScore}
                </strong>
                <span
                  className={`pl-mdp-result-pill is-${m.resultForFocus}`}
                  aria-label={`Resultado ${resultLetterEs(m.resultForFocus)}`}
                >
                  {resultLetterEs(m.resultForFocus)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {filteredHistory.length > 10 ? (
          <div className="flex justify-center">
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-10 px-3.5 num"
              onClick={() => setShowAllRows((prev) => !prev)}
            >
              {showAllRows ? "Ver menos" : `Ver todos (${filteredHistory.length})`}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
