import React, { memo, useMemo, useState } from "react";
import type { PlatformSport } from "@pitchlab/contracts";
import { parseUserOdds } from "../../../sports";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  useIsPickInParlay,
  useOptionalPlatformActions,
  useOptionalPlatformCore,
  usePlatformActions,
} from "../../platform-provider";
import { edgeAgainstBook } from "../OddsCompareView";
import type {
  MarketCardCategory,
  MatchPick,
  OddsFormat,
  PlatformGame,
  PlatformMarketRow,
} from "../../types";
import {
  BetBuilderDrawer,
  BetBuilderQuickButton,
  BookmakerComparePill,
  EvidenceWindowPills,
  extractEvidenceWindows,
} from "../picks";

export interface MatchMarketsGridProps {
  readonly sport: PlatformSport;
  readonly markets: readonly PlatformMarketRow[];
  readonly oddsFormat: OddsFormat;
  readonly watermark: string;
  readonly game?: PlatformGame;
  readonly locked?: boolean;
  readonly canSeal?: boolean;
  readonly isFinished?: boolean;
  readonly sealedKeys?: ReadonlySet<string>;
  readonly globalHouseOddRaw?: string;
  readonly houseOddsByKey?: Readonly<Record<string, string>>;
  readonly onHouseOddChange?: (rowKey: string, value: string) => void;
  readonly onSealRow?: (row: PlatformMarketRow, rowKey: string) => void;
}

const CATEGORY_ORDER: readonly MarketCardCategory[] = [
  "resultado",
  "goles",
  "conteos",
  "handicap",
  "marcador",
  "primer_tiempo",
];

function categoryHeading(
  category: MarketCardCategory,
  sport: PlatformSport,
): string {
  switch (category) {
    case "resultado":
      return "Resultado";
    case "goles":
      return sport === "football" ? "Goles" : "Totales";
    case "conteos":
      return "Córners y conteos";
    case "handicap":
      return "Hándicap";
    case "marcador":
      return "Marcador";
    case "primer_tiempo":
      return sport === "baseball" ? "Primeras 5 entradas" : "Mitades (1T y 2T)";
  }
}

function inferCardCategory(row: PlatformMarketRow): MarketCardCategory {
  if (row.cardCategory) return row.cardCategory;
  const m = row.market.toLowerCase();
  const g = row.group.toLowerCase();
  if (
    m === "corners_total" ||
    m === "corners_team" ||
    m === "fouls_total" ||
    m === "yellow_total" ||
    m === "cards_total" ||
    m === "shots_total" ||
    m === "shots_on_target" ||
    m === "sot_total" ||
    m === "red_cards" ||
    m === "booking_points" ||
    m.startsWith("player_props") ||
    m === "nba_player_props" ||
    g.includes("esquina") ||
    g.includes("córner") ||
    g.includes("corner") ||
    g.includes("faltas") ||
    g.includes("amarillas") ||
    g.includes("tarjeta") ||
    g.includes("remates") ||
    g.includes("tiros") ||
    g.includes("jugador")
  ) {
    return "conteos";
  }
  if (m === "correct_score" || g.includes("marcador")) return "marcador";
  if (
    m.startsWith("ht_") ||
    m.startsWith("2h_") ||
    m === "half_time_result" ||
    m === "second_half_result" ||
    m === "mlb_f5" ||
    g.includes("1er tiempo") ||
    g.includes("2do tiempo") ||
    g.includes("5 entradas")
  ) {
    return "primer_tiempo";
  }
  if (
    m === "handicap" ||
    m === "asian_handicap" ||
    m === "spread" ||
    m === "spreads" ||
    m === "nba_spread" ||
    m === "nfl_spread" ||
    m === "mlb_run_line" ||
    m === "nhl_puck_line" ||
    m === "nhl_puckline" ||
    m.startsWith("ah_") ||
    g.includes("hándicap") ||
    g.includes("handicap") ||
    g.includes("spread") ||
    g.includes("run line") ||
    g.includes("puck line")
  ) {
    return "handicap";
  }
  if (
    m === "1x2" ||
    m === "moneyline" ||
    m === "nba_moneyline" ||
    m === "mlb_moneyline" ||
    m === "nhl_moneyline" ||
    m === "nfl_moneyline" ||
    m === "double_chance" ||
    m === "dnb" ||
    m === "h2h" ||
    m === "nfl_ot" ||
    m === "win_to_nil" ||
    m.startsWith("combo_1x2") ||
    g.includes("resultado") ||
    g.includes("ganador") ||
    g.includes("doble oportunidad") ||
    g.includes("empate no acción") ||
    g.includes("tiempo extra")
  ) {
    return "resultado";
  }
  return "goles";
}

function rowStableKey(row: PlatformMarketRow, index: number): string {
  return `${row.market}:${row.selection}:${row.cardTitle ?? row.group}:${index}`;
}

function buildPickFromMarketRow(
  game: PlatformGame,
  row: PlatformMarketRow,
  rowKey: string,
): MatchPick {
  const existing = game.picks.find(
    (p) =>
      (p.market === row.market && p.selectionKey === row.selection) ||
      p.label.toLowerCase() === row.label.toLowerCase(),
  );
  if (existing) return existing;

  const sel = row.selection.toLowerCase();
  const lbl = row.label.toLowerCase();
  const mkt = row.market.toLowerCase();
  const conflictGroup: MatchPick["conflictGroup"] =
    mkt.includes("btts")
      ? sel.includes("no") || lbl.includes("no")
        ? "btts_no"
        : "btts_yes"
      : sel.includes("over") || lbl.includes("más de")
        ? "over_total"
        : sel.includes("under") || lbl.includes("menos de")
          ? "under_total"
          : sel === "home" || sel.startsWith("home_")
            ? "home_side"
            : sel === "away" || sel.startsWith("away_")
              ? "away_side"
              : sel === "draw"
                ? "draw_side"
                : "independent";

  return {
    id: `${game.id}__mkt__${rowKey}`,
    gameId: game.id,
    league: game.league,
    leagueLabel: game.leagueLabel,
    matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
    kickoffLocal: game.kickoffLocal,
    gameStatus: game.status,
    slotIndex: 40,
    category: "tactico",
    categoryLabel: row.group,
    risk: row.p >= 0.68 ? "conservador" : row.p >= 0.54 ? "medio" : "arriesgado",
    engineKey: "geodesic",
    engineName: "Motor Spacetime",
    marketGroup: row.group,
    selectionKey: row.selection,
    market: row.market,
    ...(typeof row.line === "number" ? { line: row.line } : {}),
    conflictGroup,
    label: row.label,
    rationale: `${row.group} · probabilidad calibrada ${(row.p * 100).toFixed(1)} %.`,
    p: row.p,
    fairDecimal: row.fairDecimal,
    fairAmerican: row.fairAmerican,
    marketDecimal: row.currentDecimal,
    marketAmerican: null,
    marketBookLabel: row.quoteBookLabel ?? null,
    marketCapturedAtUtc: row.quoteCapturedAtUtc ?? null,
    bookQuotes: row.bookQuotes,
    edgePts: row.edgePts,
    confidenceScore: game.confidenceScore,
    suggestedUnits: 1.0,
  };
}

/**
 * Controles 1-clic de Parlay y Bet Builder; solo se montan cuando existe `<PlatformProvider>`.
 */
function MarketRowParlayControls({
  pick,
  onInspect,
}: {
  readonly pick: MatchPick;
  readonly onInspect: (pick: MatchPick) => void;
}): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const inParlay = useIsPickInParlay(pick.id);

  return (
    <span className="pl-mkt-builder-group">
      <button
        type="button"
        className={`pl-home-parlay-btn is-sm min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 ${inParlay ? "is-on" : ""}`.trim()}
        aria-pressed={inParlay}
        aria-label={`${inParlay ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}`}
        onClick={() => (inParlay ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
      >
        <MaestroIcon name={inParlay ? "check" : "plus"} size={12} />
        <span>{inParlay ? "En parlay" : "Parlay"}</span>
      </button>
      <BetBuilderQuickButton pick={pick} onInspect={onInspect} compact />
    </span>
  );
}

interface MarketCardGroup {
  readonly id: string;
  readonly title: string;
  readonly category: MarketCardCategory;
  readonly isDerived: boolean;
  readonly rows: readonly {
    readonly row: PlatformMarketRow;
    readonly key: string;
    readonly isMostLikely: boolean;
  }[];
}

/**
 * Vista agrupada de mercados del partido:
 * Resultado · Goles · Córners y conteos · Hándicap · Marcador · Mitades.
 * Integra `BookmakerComparePill` (`Momio justo` vs casa, `Valor +X.X %`, movimiento),
 * `EvidenceWindowPills` (`L5 / H2H / xG`) y acción 1-clic de Bet Builder / Parlay
 * manteniendo compatibilidad 100 % standalone (sin exigir `<PlatformProvider>`).
 */
export const MatchMarketsGrid = memo(function MatchMarketsGrid({
  sport,
  markets,
  oddsFormat,
  watermark,
  game,
  locked = false,
  canSeal = true,
  isFinished = false,
  sealedKeys,
  globalHouseOddRaw = "",
  houseOddsByKey,
  onHouseOddChange,
  onSealRow,
}: MatchMarketsGridProps) {
  const optionalCore = useOptionalPlatformCore();
  const optionalActions = useOptionalPlatformActions();
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | MarketCardCategory
  >("all");
  const [builderPick, setBuilderPick] = useState<MatchPick | null>(null);

  // Resolver el partido cuando el grid vive dentro de PlatformProvider sin prop `game` explícito
  const resolvedGame = useMemo<PlatformGame | null>(() => {
    if (game) return game;
    if (!optionalCore || markets.length === 0) return null;
    const first = markets[0];
    if (!first) return null;
    const byRef = optionalCore.dataset.games.find(
      (g) => g.markets === markets || g.markets.includes(first),
    );
    if (byRef) return byRef;
    const labelsBlob = markets
      .slice(0, 8)
      .map((m) => m.label.toLowerCase())
      .join(" ");
    return (
      optionalCore.dataset.games.find(
        (g) =>
          g.sport === sport &&
          labelsBlob.includes(g.home.shortName.toLowerCase()) &&
          labelsBlob.includes(g.away.shortName.toLowerCase()),
      ) ?? null
    );
  }, [game, markets, optionalCore, sport]);

  const grouped = useMemo(() => {
    const cardsById = new Map<
      string,
      {
        title: string;
        category: MarketCardCategory;
        isDerived: boolean;
        items: Array<{ row: PlatformMarketRow; key: string }>;
      }
    >();

    markets.forEach((row, index) => {
      const category = inferCardCategory(row);
      const title = row.cardTitle?.trim() || row.group;
      const cardId = `${category}::${title}`;
      const existing = cardsById.get(cardId);
      const item = { row, key: rowStableKey(row, index) };
      if (existing) {
        existing.isDerived = existing.isDerived || Boolean(row.isDerived);
        existing.items.push(item);
      } else {
        cardsById.set(cardId, {
          title,
          category,
          isDerived: Boolean(row.isDerived),
          items: [item],
        });
      }
    });

    const cardsByCategory = new Map<MarketCardCategory, MarketCardGroup[]>();
    for (const cat of CATEGORY_ORDER) {
      cardsByCategory.set(cat, []);
    }

    for (const [id, entry] of cardsById) {
      const hasExplicitLeader = entry.items.some(
        (item) => item.row.isMostLikely === true,
      );
      let topIdx = 0;
      if (!hasExplicitLeader) {
        for (let i = 1; i < entry.items.length; i += 1) {
          if (entry.items[i]!.row.p > entry.items[topIdx]!.row.p) {
            topIdx = i;
          }
        }
      }
      const rows = entry.items.map((item, idx) => ({
        row: item.row,
        key: item.key,
        isMostLikely: hasExplicitLeader
          ? item.row.isMostLikely === true
          : idx === topIdx,
      }));

      cardsByCategory.get(entry.category)!.push({
        id,
        title: entry.title,
        category: entry.category,
        isDerived: entry.isDerived,
        rows,
      });
    }

    return cardsByCategory;
  }, [markets]);

  if (locked) {
    return (
      <div
        className="glass-card glass-ring rounded-2xl p-5"
        data-watermark={watermark}
      >
        <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
          Los mercados de este partido están disponibles con Pase PitchLab Ultra.
        </p>
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div
        className="glass-card glass-ring rounded-2xl p-5"
        data-empty-markets=""
        data-watermark={watermark}
      >
        <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
          Este partido aún no tiene mercados publicados en el corte vigente.
        </p>
      </div>
    );
  }

  const availableCategories = CATEGORY_ORDER.filter(
    (cat) => (grouped.get(cat)?.length ?? 0) > 0,
  );
  const activeFilter =
    selectedCategory === "all" || availableCategories.includes(selectedCategory)
      ? selectedCategory
      : "all";
  const visibleCategories =
    activeFilter === "all" ? availableCategories : [activeFilter];

  const canUseBuilder = Boolean(optionalActions && resolvedGame && !isFinished);

  return (
    <div className="pl-mkt-wrap" data-watermark={watermark}>
      <div className="pl-mkt-toolbar">
        <div
          className="seg-well"
          role="group"
          aria-label="Filtrar mercados por categoría"
        >
          <button
            type="button"
            className="seg-btn"
            aria-pressed={activeFilter === "all"}
            onClick={() => setSelectedCategory("all")}
          >
            Todos ({markets.length})
          </button>
          {availableCategories.map((cat) => {
            const count =
              grouped
                .get(cat)
                ?.reduce((sum, card) => sum + card.rows.length, 0) ?? 0;
            return (
              <button
                key={cat}
                type="button"
                className="seg-btn"
                aria-pressed={activeFilter === cat}
                onClick={() => setSelectedCategory(cat)}
              >
                {categoryHeading(cat, sport)} ({count})
              </button>
            );
          })}
        </div>
        <span className="pl-mkt-watermark num" title="Identificador de sesión">
          {watermark}
        </span>
      </div>

      <div className="pl-mkt-sections">
        {visibleCategories.map((cat) => {
          const cards = grouped.get(cat) ?? [];
          if (cards.length === 0) return null;
          const headingId = `mkt-cat-${cat}`;
          return (
            <section
              key={cat}
              className="pl-mkt-section"
              aria-labelledby={headingId}
            >
              <header className="pl-mkt-section-head">
                <h3 id={headingId} className="pl-mkt-section-title">
                  {categoryHeading(cat, sport)}
                </h3>
                <span className="pl-mkt-section-count num">
                  {cards.length} {cards.length === 1 ? "tarjeta" : "tarjetas"}
                </span>
              </header>

              <div className="pl-mkt-grid" data-card-count={cards.length}>
                {cards.map((card) => (
                  <article
                    key={card.id}
                    className="pl-mkt-card glass-card glass-ring"
                  >
                    <header className="pl-mkt-card-head">
                      <h4 className="pl-mkt-card-title">{card.title}</h4>
                      {card.isDerived ? (
                        <span className="pl-mkt-derived-badge">
                          Derivado del motor
                        </span>
                      ) : null}
                    </header>

                    <div className="pl-mkt-rows" data-row-count={card.rows.length}>
                      {card.rows.map(({ row, key, isMostLikely }) => {
                        const pct = Math.round(row.p * 1000) / 10;
                        const rawHouse = houseOddsByKey?.[key] ?? "";
                        const effectiveRaw = rawHouse.trim() || globalHouseOddRaw.trim();
                        const parsedManual = effectiveRaw ? parseUserOdds(effectiveRaw) : null;
                        const houseDecimal = parsedManual ?? row.currentDecimal;
                        const edgePts =
                          houseDecimal != null
                            ? edgeAgainstBook(row.p, houseDecimal)
                            : row.edgePts;
                        const isSealed = sealedKeys?.has(key) ?? false;

                        const rowPick =
                          resolvedGame !== null
                            ? buildPickFromMarketRow(resolvedGame, row, key)
                            : null;
                        const rowWindows =
                          resolvedGame && rowPick
                            ? extractEvidenceWindows({
                                game: resolvedGame,
                                pick: rowPick,
                              }).slice(0, 3)
                            : [];

                        return (
                          <div
                            key={key}
                            className="pl-mkt-row"
                            data-most-likely={isMostLikely ? "true" : "false"}
                          >
                            <div className="pl-mkt-row-main">
                              <div className="pl-mkt-row-label-wrap">
                                <span className="pl-mkt-row-label">
                                  {row.label}
                                </span>
                                {isMostLikely ? (
                                  <span className="pl-mkt-top-pill">
                                    Más probable
                                  </span>
                                ) : null}
                              </div>

                              <div className="pl-mkt-row-metrics">
                                <span className="pl-mkt-row-prob num">
                                  {pct.toFixed(1)} %
                                </span>

                                <BookmakerComparePill
                                  probability={row.p}
                                  fairDecimal={row.fairDecimal}
                                  houseDecimal={effectiveRaw ? parsedManual : row.currentDecimal}
                                  houseBookLabel={
                                    effectiveRaw
                                      ? "Tu momio"
                                      : (row.quoteBookLabel ?? null)
                                  }
                                  openingDecimal={effectiveRaw ? null : row.openDecimal}
                                  movementDirection={
                                    effectiveRaw ? null : (row.movementDirection ?? null)
                                  }
                                  capturedAtUtc={
                                    effectiveRaw ? null : (row.quoteCapturedAtUtc ?? null)
                                  }
                                  bookQuotes={effectiveRaw ? undefined : row.bookQuotes}
                                  oddsFormat={oddsFormat}
                                  variant="inline"
                                  showCasaPrefix={!effectiveRaw}
                                  showMultiBookQuotes={!effectiveRaw}
                                  showCaptureStamp={!effectiveRaw}
                                />
                              </div>

                              {rowWindows.length > 0 ? (
                                <EvidenceWindowPills
                                  windows={rowWindows}
                                  size="sm"
                                  ariaLabel={`Evidencia para ${row.label}`}
                                />
                              ) : null}
                            </div>

                            <div className="pl-mkt-bar" aria-hidden="true">
                              <span
                                style={{
                                  width: `${Math.min(100, Math.max(4, pct))}%`,
                                }}
                              />
                            </div>

                            {(onHouseOddChange || onSealRow || canUseBuilder) && !isFinished ? (
                              <div className="pl-mkt-row-actions">
                                {onHouseOddChange ? (
                                  <label className="pl-mkt-house-field">
                                    <span className="sr-only">
                                      Tu momio para {row.label}
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="-110, +150 o 1.91"
                                      value={rawHouse}
                                      onChange={(e) =>
                                        onHouseOddChange(key, e.target.value)
                                      }
                                      className="pl-mkt-house-input num"
                                    />
                                  </label>
                                ) : null}

                                {edgePts !== null ? (
                                  <span
                                    className="pl-mkt-edge num"
                                    data-positive={
                                      edgePts > 0 ? "true" : "false"
                                    }
                                  >
                                    {edgePts > 0 ? `+${edgePts}` : edgePts} pts
                                  </span>
                                ) : null}

                                {canUseBuilder && rowPick ? (
                                  <MarketRowParlayControls
                                    pick={rowPick}
                                    onInspect={setBuilderPick}
                                  />
                                ) : null}

                                {onSealRow && canSeal ? (
                                  <button
                                    type="button"
                                    className="pl-mkt-seal-btn"
                                    disabled={isSealed}
                                    onClick={() => onSealRow(row, key)}
                                  >
                                    {isSealed ? "Sellado" : "Sellar"}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {canUseBuilder && builderPick ? (
        <BetBuilderDrawer
          open={Boolean(builderPick)}
          pick={builderPick}
          game={resolvedGame}
          onClose={() => setBuilderPick(null)}
        />
      ) : null}
    </div>
  );
});
