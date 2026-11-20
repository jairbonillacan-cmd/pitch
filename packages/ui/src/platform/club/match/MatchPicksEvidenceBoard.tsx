"use client";

import React, { useMemo, useState } from "react";
import { PBar } from "../../../sports";
import { isPickUnlocked } from "../../access-guard";
import { resolvePreferredBookQuote } from "../../bookmakers";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  MATCH_PICK_GROUP_LABELS,
  MATCH_PICK_GROUP_ORDER,
  buildEnrichedMatchPicks,
  type EnrichedMatchPick,
  type MatchPickMarketGroupKey,
} from "../../match-evidence";
import {
  useIsPickInParlay,
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import type {
  MatchIntelligenceV5View,
  MatchPick,
  PlatformGame,
  PlatformMarketRow,
} from "../../types";
import {
  BetBuilderDrawer,
  BetBuilderQuickButton,
  BookmakerComparePill,
  EvidenceWindowPills,
  classifyOddsMovement,
  computeExpectedValuePct,
  extractEvidenceWindows,
} from "../picks";

type SortKey = "recomendados" | "tasa" | "valor" | "prob" | "movimiento";

function EvidenceParlayButton({ pick }: { readonly pick: MatchPick }): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const inParlay = useIsPickInParlay(pick.id);
  return (
    <button
      type="button"
      className={`pl-home-parlay-btn is-sm min-h-11 sm:min-h-9 ${inParlay ? "is-on" : ""}`.trim()}
      aria-pressed={inParlay}
      aria-label={`${inParlay ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}`}
      onClick={() => (inParlay ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
    >
      <MaestroIcon name={inParlay ? "check" : "plus"} size={13} />
      <span>{inParlay ? "En parlay" : "Parlay"}</span>
    </button>
  );
}

interface ResolvedEvidenceItem extends EnrichedMatchPick {
  readonly effectiveHouseDecimal: number | null;
  readonly effectiveHouseLabel: string | null;
  readonly effectiveOpenDecimal: number | null;
  readonly effectiveMoveDir: "shortening" | "drifting" | "stable" | null;
  readonly effectiveCapturedAtUtc: string | null;
  readonly effectiveValuePct: number | null;
  readonly effectiveEdgePts: number | null;
  readonly movementScore: number;
}

/**
 * Tablero accionable de Picks agrupados por mercado con columna de Evidencia real (ADR-054).
 * Estilo editorial plano sobre tokens `--pl-*`: filtros rápidos por familia, píldoras
 * multi-ventana (`L5 / L10 / L20 / H2H` + `xG`), comparativa de casas con `Valor +X.X %`
 * y movimiento de línea (`Steam` / `↓ Bajando` / `↑ Subiendo`), más Bet Builder 1-clic.
 */
export function MatchPicksEvidenceBoard({
  game,
  markets,
  v5 = null,
}: {
  readonly game: PlatformGame;
  readonly markets: readonly PlatformMarketRow[];
  readonly v5?: MatchIntelligenceV5View | null;
}): React.JSX.Element {
  const { viewerRole, oddsFormat, preferredBooks, hasAccountSession, upgradeHref } =
    usePlatformCore();
  const { openComposer, navigateTo, setSelectedTipsterPickId, pushToast } = usePlatformActions();

  const [marketFilter, setMarketFilter] = useState<MatchPickMarketGroupKey | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("recomendados");
  const [onlyValue, setOnlyValue] = useState<boolean>(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [builderPick, setBuilderPick] = useState<MatchPick | null>(null);

  const enriched = useMemo<ResolvedEvidenceItem[]>(() => {
    const base = buildEnrichedMatchPicks(game, markets, v5);
    const marketByKey = new Map<string, PlatformMarketRow>();
    for (const m of markets) {
      marketByKey.set(`${m.market}::${m.selection}`, m);
    }

    return base.map((item) => {
      const matchedRow = item.pick.market
        ? marketByKey.get(`${item.pick.market}::${item.pick.selectionKey}`)
        : undefined;
      const quotes = item.pick.bookQuotes ?? matchedRow?.bookQuotes;
      const prefQuote = resolvePreferredBookQuote(quotes, preferredBooks);
      const effectiveHouseDecimal =
        prefQuote?.decimal ?? item.houseDecimal ?? matchedRow?.currentDecimal ?? null;
      const effectiveHouseLabel =
        prefQuote?.bookLabel ?? item.houseBookLabel ?? matchedRow?.quoteBookLabel ?? null;
      const effectiveOpenDecimal =
        prefQuote?.openingDecimal ?? matchedRow?.openDecimal ?? null;
      const effectiveMoveDir =
        prefQuote?.movementDirection ?? matchedRow?.movementDirection ?? null;
      const effectiveCapturedAtUtc =
        prefQuote?.capturedAtUtc ??
        item.pick.marketCapturedAtUtc ??
        matchedRow?.quoteCapturedAtUtc ??
        null;

      const effectiveValuePct = computeExpectedValuePct(item.pick.p, effectiveHouseDecimal);
      const effectiveEdgePts =
        effectiveHouseDecimal !== null && effectiveHouseDecimal > 1
          ? Math.round((item.pick.p - 1 / effectiveHouseDecimal) * 1000) / 10
          : item.edgePts;

      const mv = classifyOddsMovement(
        effectiveOpenDecimal,
        effectiveHouseDecimal,
        effectiveMoveDir,
      );
      const movementScore = !mv
        ? 0
        : mv.kind === "steam"
          ? 100 + Math.abs(mv.deltaPct ?? 8)
          : mv.kind === "shortening"
            ? 50 + Math.abs(mv.deltaPct ?? 2)
            : mv.kind === "drifting"
              ? 10 + Math.abs(mv.deltaPct ?? 1)
              : 0;

      return {
        ...item,
        pick: quotes && !item.pick.bookQuotes ? { ...item.pick, bookQuotes: quotes } : item.pick,
        effectiveHouseDecimal,
        effectiveHouseLabel,
        effectiveOpenDecimal,
        effectiveMoveDir,
        effectiveCapturedAtUtc,
        effectiveValuePct,
        effectiveEdgePts,
        movementScore,
      };
    });
  }, [game, markets, preferredBooks, v5]);

  const availableGroups = useMemo(() => {
    const counts = new Map<MatchPickMarketGroupKey, number>();
    for (const item of enriched) {
      counts.set(item.groupKey, (counts.get(item.groupKey) ?? 0) + 1);
    }
    return MATCH_PICK_GROUP_ORDER.filter((k) => (counts.get(k) ?? 0) > 0).map((k) => ({
      key: k,
      label: MATCH_PICK_GROUP_LABELS[k],
      count: counts.get(k) ?? 0,
    }));
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (marketFilter !== "all") {
      list = list.filter((item) => item.groupKey === marketFilter);
    }
    if (onlyValue) {
      list = list.filter((item) => item.effectiveValuePct !== null && item.effectiveValuePct > 0);
    }
    return list.slice().sort((a, b) => {
      if (sortBy === "tasa") {
        return (b.evidenceAvgPct ?? -1) - (a.evidenceAvgPct ?? -1) || b.pick.p - a.pick.p;
      }
      if (sortBy === "valor") {
        return (
          (b.effectiveValuePct ?? -999) - (a.effectiveValuePct ?? -999) ||
          b.pick.p - a.pick.p
        );
      }
      if (sortBy === "movimiento") {
        return (
          b.movementScore - a.movementScore ||
          (b.effectiveValuePct ?? -999) - (a.effectiveValuePct ?? -999) ||
          b.pick.p - a.pick.p
        );
      }
      if (sortBy === "prob") {
        return b.pick.p - a.pick.p;
      }
      // recomendados: picks principales del modelo primero, luego mayor probabilidad/valor
      if (a.isPrimaryModelPick !== b.isPrimaryModelPick) {
        return a.isPrimaryModelPick ? -1 : 1;
      }
      return (
        (b.effectiveValuePct ?? -50) * 0.25 +
        b.pick.p * 100 -
        ((a.effectiveValuePct ?? -50) * 0.25 + a.pick.p * 100)
      );
    });
  }, [enriched, marketFilter, onlyValue, sortBy]);

  const grouped = useMemo(() => {
    const map = new Map<MatchPickMarketGroupKey, ResolvedEvidenceItem[]>();
    for (const item of filtered) {
      const arr = map.get(item.groupKey) ?? [];
      arr.push(item);
      map.set(item.groupKey, arr);
    }
    return MATCH_PICK_GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({
      key: k,
      label: MATCH_PICK_GROUP_LABELS[k],
      items: map.get(k)!,
    }));
  }, [filtered]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasAnyValue = enriched.some(
    (i) => i.effectiveValuePct !== null && i.effectiveValuePct > 0,
  );
  const canTipsterFeature =
    (viewerRole === "tipster" || viewerRole === "admin") && game.status !== "FT";

  if (enriched.length === 0) {
    return (
      <section className="glass-card glass-ring rounded-2xl p-5 text-sm" data-empty-forecast="">
        <p className="m-0" style={{ color: "var(--pl-text-muted)" }}>
          Aún no hay selecciones publicadas para este partido.
        </p>
      </section>
    );
  }

  return (
    <section className="pl-ev-board space-y-3.5 min-w-0" data-picks="" data-evidence-board="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-extrabold">Picks y evidencia del modelo</h2>
          <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
            Evidencia real por ventana, probabilidad Spacetime, momio justo y comparativa de casas.
          </p>
        </div>
        <span className="pl-pill text-xs num">
          {filtered.length} {filtered.length === 1 ? "selección" : "selecciones"}
        </span>
      </div>

      {/* Barra de filtros planos horizontales por mercado */}
      <div className="pl-ev-filters" role="group" aria-label="Filtrar picks por mercado y criterio">
        <button
          type="button"
          className={`pl-ev-filter-pill ${marketFilter === "all" ? "is-on" : ""}`.trim()}
          aria-pressed={marketFilter === "all"}
          onClick={() => setMarketFilter("all")}
        >
          Todos <span className="pl-ev-filter-count num">({enriched.length})</span>
        </button>
        {availableGroups.map((g) => (
          <button
            key={g.key}
            type="button"
            className={`pl-ev-filter-pill ${marketFilter === g.key ? "is-on" : ""}`.trim()}
            aria-pressed={marketFilter === g.key}
            onClick={() => setMarketFilter(g.key)}
          >
            <span>{g.label}</span>
            <span className="pl-ev-filter-count num">{g.count}</span>
          </button>
        ))}

        <span className="pl-ev-filter-sep" aria-hidden="true" />

        <label className="pl-ev-sort-wrap">
          <span className="sr-only">Ordenar picks por</span>
          <select
            className="pl-ev-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            aria-label="Ordenar selecciones"
          >
            <option value="recomendados">Recomendados</option>
            <option value="valor">Valor real EV+</option>
            <option value="prob">Probabilidad Spacetime</option>
            <option value="movimiento">Movimiento de línea</option>
            <option value="tasa">Mayor tasa real</option>
          </select>
        </label>

        {hasAnyValue ? (
          <button
            type="button"
            className={`pl-ev-filter-pill ${onlyValue ? "is-on" : ""}`.trim()}
            aria-pressed={onlyValue}
            onClick={() => setOnlyValue((v) => !v)}
          >
            Solo EV+
          </button>
        ) : null}
      </div>

      {grouped.length === 0 ? (
        <div className="glass-card glass-ring rounded-2xl p-5 text-sm space-y-2">
          <p className="m-0" style={{ color: "var(--pl-text-muted)" }}>
            Ninguna selección coincide con este filtro.
          </p>
          <button
            type="button"
            className="pl-btn-glass text-xs min-h-11 px-3"
            onClick={() => {
              setMarketFilter("all");
              setOnlyValue(false);
            }}
          >
            Mostrar todas
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <div
                key={group.key}
                className="pl-ev-group glass-card glass-ring"
                data-evidence-group={group.key}
              >
                <button
                  type="button"
                  className="pl-ev-group-head"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(group.key)}
                >
                  <span className="pl-ev-group-title">
                    <strong>{group.label}</strong>
                    <span className="pl-ev-group-count num">
                      {group.items.length} {group.items.length === 1 ? "pick" : "picks"}
                    </span>
                  </span>
                  <MaestroIcon
                    name="chevronDown"
                    size={15}
                    className={`pl-ev-group-chev${isCollapsed ? " is-collapsed" : ""}`}
                  />
                </button>

                {!isCollapsed ? (
                  <div className="pl-ev-rows" role="list" aria-label={group.label}>
                    {group.items.map((item) => {
                      const unlocked = isPickUnlocked(item.pick, game.status, viewerRole);
                      const isFinished = game.status === "FT";
                      const windows = unlocked
                        ? extractEvidenceWindows({
                            game,
                            pick: item.pick,
                            bullets: item.evidence,
                            v5,
                          })
                        : [];

                      return (
                        <article
                          key={item.id}
                          role="listitem"
                          className="pl-ev-row"
                          data-evidence-pick={item.id}
                        >
                          {/* Columna 1: Pick + probabilidad */}
                          <div className="pl-ev-col-pick">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="pl-ev-cat">{item.pick.categoryLabel}</span>
                              {item.isPrimaryModelPick ? (
                                <span className="pl-pill pl-pill--brand text-[10px]">Modelo</span>
                              ) : null}
                            </div>
                            {unlocked ? (
                              <>
                                <strong className="pl-ev-label">{item.pick.label}</strong>
                                <div className="pl-ev-prob-inline num">
                                  <strong
                                    style={{
                                      color:
                                        item.pick.p >= 0.65
                                          ? "var(--pl-success)"
                                          : "var(--pl-text)",
                                    }}
                                  >
                                    {(item.pick.p * 100).toFixed(1)} %
                                  </strong>
                                  <PBar p={item.pick.p} lead={item.pick.p >= 0.65} />
                                </div>
                              </>
                            ) : (
                              <div className="space-y-1">
                                <strong className="pl-ev-label locked-redact">
                                  Selección reservada Pase PitchLab Ultra
                                </strong>
                                <button
                                  type="button"
                                  className="pl-acct-text-link text-xs min-h-11 sm:min-h-9 inline-flex items-center"
                                  onClick={() => navigateTo(upgradeHref)}
                                >
                                  {hasAccountSession
                                    ? "Activar Pase Ultra"
                                    : "Probar 7 días gratis"}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Columna 2: Evidencia multi-ventana + detalle verificable */}
                          <div className="pl-ev-col-evidence space-y-2">
                            {unlocked ? (
                              <>
                                {windows.length > 0 ? (
                                  <EvidenceWindowPills windows={windows} size="sm" />
                                ) : null}
                                <ul className="pl-ev-bullets" aria-label="Evidencia del pick">
                                  {item.evidence.map((b, bIdx) => (
                                    <li key={`${item.id}-ev-${bIdx}`} className="pl-ev-bullet">
                                      <span
                                        className={`pl-ev-dot is-${b.tone}`}
                                        aria-hidden="true"
                                      />
                                      <span className="pl-ev-bullet-text">{b.label}</span>
                                      {b.ratePct !== null ? (
                                        <strong className={`pl-ev-bullet-pct num is-${b.tone}`}>
                                          {b.ratePct} %
                                        </strong>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                                Evidencia histórica y tasas reales disponibles con Pase PitchLab Ultra.
                              </p>
                            )}
                          </div>

                          {/* Columna 3: Momio justo vs Casa + Bet Builder / Parlay */}
                          <div className="pl-ev-col-odds">
                            {unlocked ? (
                              <>
                                <BookmakerComparePill
                                  probability={item.pick.p}
                                  fairDecimal={item.pick.fairDecimal}
                                  houseDecimal={item.effectiveHouseDecimal}
                                  houseBookLabel={item.effectiveHouseLabel}
                                  openingDecimal={item.effectiveOpenDecimal}
                                  movementDirection={item.effectiveMoveDir}
                                  capturedAtUtc={item.effectiveCapturedAtUtc}
                                  bookQuotes={item.pick.bookQuotes}
                                  oddsFormat={oddsFormat}
                                  variant="box"
                                  showMultiBookQuotes
                                  edgePtsOverride={item.effectiveEdgePts}
                                />

                                {!isFinished ? (
                                  <div className="pl-ev-actions">
                                    <EvidenceParlayButton pick={item.pick} />
                                    <BetBuilderQuickButton
                                      pick={item.pick}
                                      onInspect={setBuilderPick}
                                      compact
                                    />
                                    <button
                                      type="button"
                                      className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-3"
                                      onClick={() => openComposer(item.pick)}
                                    >
                                      Sellar
                                    </button>
                                    {canTipsterFeature ? (
                                      <button
                                        type="button"
                                        className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-2.5"
                                        title="Usar como Pick abierto semanal"
                                        aria-label={`Usar ${item.pick.label} como Pick abierto semanal`}
                                        onClick={() => {
                                          setSelectedTipsterPickId(item.pick.id);
                                          pushToast(
                                            `«${item.pick.label}» asignado como tu Pick abierto semanal.`,
                                            "success",
                                          );
                                        }}
                                      >
                                        <MaestroIcon name="crown" size={13} />
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <span className="pl-pill text-xs">
                                <MaestroIcon name="lock" size={12} />
                                <span>Ultra</span>
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {builderPick ? (
        <BetBuilderDrawer
          open={Boolean(builderPick)}
          pick={builderPick}
          game={game}
          onClose={() => setBuilderPick(null)}
        />
      ) : null}
    </section>
  );
}
