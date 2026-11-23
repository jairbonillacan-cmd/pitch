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
  type MatchPickMarketGroupKey,
  type PickEvidenceBullet,
} from "../../match-evidence";
import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  catalogEvidenceToWindowItems,
  catalogPickItemToMatchPick,
  type CatalogCategoryKey,
  type MarketFamilyId,
  type MatchPicksCatalog,
  type PickSettlementStatus,
} from "../../picks-catalog";
import {
  isConservativeChalkPick,
  partitionPlayableAndConservative,
  scorePlayablePick,
} from "../../pick-quality-ranker";
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
  type EvidenceWindowItem,
} from "../picks";

type SortKey = "recomendados" | "tasa" | "valor" | "prob" | "movimiento";
type BoardGroupKey = MatchPickMarketGroupKey | CatalogCategoryKey;

function settlementBadgeLabel(status: PickSettlementStatus): string {
  if (status === "hit") return "Acertado";
  if (status === "miss") return "Fallado";
  if (status === "push") return "Push";
  return "Pendiente";
}

function EvidenceParlayButton({ pick }: { readonly pick: MatchPick }): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const inParlay = useIsPickInParlay(pick.id);
  return (
    <button
      type="button"
      className={`pl-home-parlay-btn is-sm min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 ${inParlay ? "is-on" : ""}`.trim()}
      aria-pressed={inParlay}
      aria-label={`${inParlay ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}`}
      onClick={() => (inParlay ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
    >
      <MaestroIcon name={inParlay ? "check" : "plus"} size={13} />
      <span>{inParlay ? "En parlay" : "Parlay"}</span>
    </button>
  );
}

interface ResolvedEvidenceItem {
  readonly id: string;
  readonly pick: MatchPick;
  readonly groupKey: BoardGroupKey;
  readonly groupLabel: string;
  readonly isPrimaryModelPick: boolean;
  readonly evidence: readonly PickEvidenceBullet[];
  readonly evidenceAvgPct: number | null;
  readonly houseDecimal: number | null;
  readonly houseBookLabel: string | null;
  readonly valuePct: number | null;
  readonly edgePts: number | null;
  readonly effectiveHouseDecimal: number | null;
  readonly effectiveHouseLabel: string | null;
  readonly effectiveOpenDecimal: number | null;
  readonly effectiveMoveDir: "shortening" | "drifting" | "stable" | null;
  readonly effectiveCapturedAtUtc: string | null;
  readonly effectiveValuePct: number | null;
  readonly effectiveEdgePts: number | null;
  readonly movementScore: number;
  readonly catalogWindows?: readonly EvidenceWindowItem[];
  readonly settlement?: PickSettlementStatus;
  readonly familyId?: MarketFamilyId;
  readonly market?: string | null;
  readonly label?: string | null;
  readonly decimal?: number | null;
  readonly evPct?: number | null;
}

export function MatchPicksEvidenceBoard({
  game,
  markets,
  v5 = null,
  catalog = null,
}: {
  readonly game: PlatformGame;
  readonly markets: readonly PlatformMarketRow[];
  readonly v5?: MatchIntelligenceV5View | null;
  readonly catalog?: MatchPicksCatalog | null;
}): React.JSX.Element {
  const { viewerRole, oddsFormat, preferredBooks, hasAccountSession, upgradeHref } =
    usePlatformCore();
  const { openComposer, navigateTo, setSelectedTipsterPickId, pushToast } = usePlatformActions();

  const [marketFilter, setMarketFilter] = useState<BoardGroupKey | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("recomendados");
  const [onlyValue, setOnlyValue] = useState<boolean>(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [builderPick, setBuilderPick] = useState<MatchPick | null>(null);

  const useCatalog = Boolean(catalog && catalog.picks.length > 0);
  const groupOrder: readonly BoardGroupKey[] = useCatalog
    ? CATALOG_CATEGORY_ORDER
    : MATCH_PICK_GROUP_ORDER;

  const enriched = useMemo<ResolvedEvidenceItem[]>(() => {
    const marketByKey = new Map<string, PlatformMarketRow>();
    for (const m of markets) {
      marketByKey.set(`${m.market}::${m.selection}`, m);
      if (m.market === "h2h") {
        marketByKey.set(`1x2::${m.selection}`, m);
      } else if (m.market === "1x2") {
        marketByKey.set(`h2h::${m.selection}`, m);
      }
    }

    if (useCatalog && catalog) {
      return catalog.picks.map((catItem, idx): ResolvedEvidenceItem => {
        const pick = catalogPickItemToMatchPick(catItem, game, idx);
        if (catItem.isRedacted) {
          return {
            id: catItem.id,
            pick,
            groupKey: catItem.category,
            groupLabel: CATALOG_CATEGORY_LABELS[catItem.category],
            isPrimaryModelPick: false,
            evidence: [],
            evidenceAvgPct: null,
            houseDecimal: null,
            houseBookLabel: null,
            valuePct: null,
            edgePts: null,
            effectiveHouseDecimal: null,
            effectiveHouseLabel: null,
            effectiveOpenDecimal: null,
            effectiveMoveDir: null,
            effectiveCapturedAtUtc: null,
            effectiveValuePct: null,
            effectiveEdgePts: null,
            movementScore: 0,
            catalogWindows: [],
            settlement: catItem.settlement,
            familyId: catItem.family,
          };
        }

        const matchedRow = marketByKey.get(`${catItem.family}::${catItem.selectionKey}`);
        const quotes = pick.bookQuotes ?? matchedRow?.bookQuotes;
        const prefQuote = resolvePreferredBookQuote(quotes, preferredBooks);
        const effectiveHouseDecimal =
          prefQuote?.decimal ?? catItem.pricing.marketDecimal ?? matchedRow?.currentDecimal ?? null;
        const effectiveHouseLabel =
          prefQuote?.bookLabel ??
          catItem.pricing.marketBookLabel ??
          matchedRow?.quoteBookLabel ??
          null;
        const effectiveOpenDecimal =
          prefQuote?.openingDecimal ?? matchedRow?.openDecimal ?? null;
        const effectiveMoveDir =
          prefQuote?.movementDirection ?? matchedRow?.movementDirection ?? null;
        const effectiveCapturedAtUtc =
          prefQuote?.capturedAtUtc ??
          catItem.pricing.marketCapturedAtUtc ??
          matchedRow?.quoteCapturedAtUtc ??
          null;

        const effectiveValuePct =
          prefQuote != null
            ? computeExpectedValuePct(pick.p, effectiveHouseDecimal)
            : (catItem.pricing.evPct ?? computeExpectedValuePct(pick.p, effectiveHouseDecimal));
        const effectiveEdgePts =
          prefQuote != null && effectiveHouseDecimal !== null && effectiveHouseDecimal > 1
            ? Math.round((pick.p - 1 / effectiveHouseDecimal) * 1000) / 10
            : (catItem.pricing.edgePts ??
                (effectiveHouseDecimal !== null && effectiveHouseDecimal > 1
                  ? Math.round((pick.p - 1 / effectiveHouseDecimal) * 1000) / 10
                  : null));

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

        const catalogWindows = catalogEvidenceToWindowItems(catItem.evidence, catItem.sport);

        return {
          id: catItem.id,
          pick: quotes && !pick.bookQuotes ? { ...pick, bookQuotes: quotes } : pick,
          groupKey: catItem.category,
          groupLabel: CATALOG_CATEGORY_LABELS[catItem.category],
          isPrimaryModelPick: catItem.isPrimaryModelPick,
          evidence: catItem.evidence.bullets,
          evidenceAvgPct: catItem.evidence.avgObservedRatePct,
          houseDecimal: catItem.pricing.marketDecimal,
          houseBookLabel: catItem.pricing.marketBookLabel,
          valuePct: catItem.pricing.evPct,
          edgePts: catItem.pricing.edgePts,
          effectiveHouseDecimal,
          effectiveHouseLabel,
          effectiveOpenDecimal,
          effectiveMoveDir,
          effectiveCapturedAtUtc,
          effectiveValuePct,
          effectiveEdgePts,
          movementScore,
          catalogWindows,
          settlement: catItem.settlement,
          familyId: catItem.family,
        };
      });
    }

    const base = buildEnrichedMatchPicks(game, markets, v5);

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
        market: item.pick.market ?? null,
        label: item.pick.label,
        decimal: effectiveHouseDecimal ?? item.pick.fairDecimal,
        evPct: effectiveValuePct,
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
  }, [catalog, game, markets, preferredBooks, useCatalog, v5]);

  const availableGroups = useMemo(() => {
    const counts = new Map<BoardGroupKey, number>();
    const labels = new Map<BoardGroupKey, string>();
    for (const item of enriched) {
      counts.set(item.groupKey, (counts.get(item.groupKey) ?? 0) + 1);
      if (!labels.has(item.groupKey)) {
        labels.set(item.groupKey, item.groupLabel);
      }
    }
    return groupOrder
      .filter((k) => (counts.get(k) ?? 0) > 0)
      .map((k) => ({
        key: k,
        label: labels.get(k) ?? k,
        count: counts.get(k) ?? 0,
      }));
  }, [enriched, groupOrder]);

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
      const aPrimaryPlayable =
        a.isPrimaryModelPick &&
        !isConservativeChalkPick(
          a.pick.market,
          a.pick.label,
          a.effectiveHouseDecimal ?? a.pick.fairDecimal,
          a.effectiveValuePct,
        );
      const bPrimaryPlayable =
        b.isPrimaryModelPick &&
        !isConservativeChalkPick(
          b.pick.market,
          b.pick.label,
          b.effectiveHouseDecimal ?? b.pick.fairDecimal,
          b.effectiveValuePct,
        );
      if (aPrimaryPlayable !== bPrimaryPlayable) {
        return aPrimaryPlayable ? -1 : 1;
      }
      const bScore = scorePlayablePick({
        market: b.pick.market,
        label: b.pick.label,
        p: b.pick.p,
        decimal: b.effectiveHouseDecimal ?? b.pick.fairDecimal,
        evPct: b.effectiveValuePct,
        evidenceAvgPct: b.evidenceAvgPct,
      });
      const aScore = scorePlayablePick({
        market: a.pick.market,
        label: a.pick.label,
        p: a.pick.p,
        decimal: a.effectiveHouseDecimal ?? a.pick.fairDecimal,
        evPct: a.effectiveValuePct,
        evidenceAvgPct: a.evidenceAvgPct,
      });
      return bScore - aScore || b.pick.p - a.pick.p;
    });
  }, [enriched, marketFilter, onlyValue, sortBy]);

  const isMatchFinished = game.status === "FT";
  const partitionedFiltered = useMemo<{
    readonly playable: readonly ResolvedEvidenceItem[];
    readonly conservative: readonly ResolvedEvidenceItem[];
  }>(
    () =>
      marketFilter === "all"
        ? partitionPlayableAndConservative(filtered, { preserveAll: isMatchFinished })
        : { playable: filtered, conservative: [] },
    [filtered, isMatchFinished, marketFilter],
  );

  const grouped = useMemo(() => {
    const map = new Map<BoardGroupKey, ResolvedEvidenceItem[]>();
    const labels = new Map<BoardGroupKey, string>();
    for (const item of partitionedFiltered.playable) {
      const arr = map.get(item.groupKey) ?? [];
      arr.push(item);
      map.set(item.groupKey, arr);
      if (!labels.has(item.groupKey)) {
        labels.set(item.groupKey, item.groupLabel);
      }
    }
    return groupOrder
      .filter((k) => map.has(k))
      .map((k) => ({
        key: k,
        label: labels.get(k) ?? k,
        items: map.get(k)!,
      }));
  }, [groupOrder, partitionedFiltered.playable]);

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

  const renderEvidencePickRow = (item: (typeof filtered)[number]) => {
    const unlocked = isPickUnlocked(item.pick, game.status, viewerRole);
    const isFinished = game.status === "FT";
    const windows = unlocked
      ? item.catalogWindows && item.catalogWindows.length > 0
        ? item.catalogWindows
        : extractEvidenceWindows({
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
        data-market-family={item.familyId ?? item.pick.market ?? ""}
      >
        <div className="pl-ev-col-pick">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="pl-ev-cat">{item.pick.categoryLabel}</span>
            {unlocked && item.isPrimaryModelPick ? (
              <span className="pl-pill pl-pill--brand text-[10px]">Modelo</span>
            ) : null}
            {isFinished && unlocked && item.settlement ? (
              <span className="pl-pill text-[10px]" data-settlement={item.settlement}>
                {settlementBadgeLabel(item.settlement)}
              </span>
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
                className="pl-acct-text-link text-xs min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 inline-flex items-center"
                onClick={() => navigateTo(upgradeHref)}
              >
                {hasAccountSession
                  ? "Activar Pase Ultra"
                  : "Probar 7 días gratis"}
              </button>
            </div>
          )}
        </div>

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
                    className="pl-btn-glass text-xs min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 px-3"
                    onClick={() => openComposer(item.pick)}
                  >
                    Sellar
                  </button>
                  {canTipsterFeature ? (
                    <button
                      type="button"
                      className="pl-btn-glass text-xs min-w-11 min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-w-0 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 px-2.5"
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
  };

  return (
    <section
      className="pl-ev-board space-y-3.5 min-w-0"
      data-picks=""
      data-evidence-board=""
      data-catalog-source={useCatalog ? "server-catalog" : "legacy"}
    >
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
                    {group.items.map(renderEvidencePickRow)}
                  </div>
                ) : null}
              </div>
            );
          })}
          {partitionedFiltered.conservative.length > 0 ? (
            <details
              className="pl-ev-conservative-details"
              data-ev-conservative-picks=""
              open={isMatchFinished || undefined}
            >
              <summary className="pl-ev-conservative-summary">
                <span>Conservadores / para combinar</span>
                <span className="pl-pill text-[11px] num">
                  {partitionedFiltered.conservative.length}
                </span>
              </summary>
              <div className="pl-ev-rows mt-2" role="list" aria-label="Picks conservadores">
                {partitionedFiltered.conservative.map(renderEvidencePickRow)}
              </div>
            </details>
          ) : null}
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
