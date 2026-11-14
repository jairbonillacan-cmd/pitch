import { useMemo, useState } from "react";
import { parseUserOdds } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { edgeAgainstBook } from "../OddsCompareView";
import type {
  MarketCardCategory,
  OddsFormat,
  PlatformMarketRow,
} from "../../types";

export interface MatchMarketsGridProps {
  readonly sport: "football" | "american-football";
  readonly markets: readonly PlatformMarketRow[];
  readonly oddsFormat: OddsFormat;
  readonly watermark: string;
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
  "handicap",
  "marcador",
  "primer_tiempo",
];

function categoryHeading(
  category: MarketCardCategory,
  sport: "football" | "american-football",
): string {
  switch (category) {
    case "resultado":
      return "Resultado";
    case "goles":
      return sport === "american-football" ? "Totales" : "Goles";
    case "handicap":
      return "Hándicap";
    case "marcador":
      return "Marcador";
    case "primer_tiempo":
      return "1er tiempo";
  }
}

function inferCardCategory(row: PlatformMarketRow): MarketCardCategory {
  if (row.cardCategory) return row.cardCategory;
  const m = row.market.toLowerCase();
  const g = row.group.toLowerCase();
  if (m === "correct_score" || g.includes("marcador")) return "marcador";
  if (m.startsWith("ht_") || g.includes("1er tiempo")) return "primer_tiempo";
  if (
    m === "handicap" ||
    m === "spread" ||
    m.startsWith("ah_") ||
    g.includes("hándicap") ||
    g.includes("handicap")
  ) {
    return "handicap";
  }
  if (
    m === "1x2" ||
    m === "moneyline" ||
    m === "double_chance" ||
    m === "dnb" ||
    m === "h2h" ||
    g.includes("resultado") ||
    g.includes("ganador") ||
    g.includes("doble oportunidad") ||
    g.includes("empate no acción")
  ) {
    return "resultado";
  }
  return "goles";
}

function rowStableKey(row: PlatformMarketRow, index: number): string {
  return `${row.market}:${row.selection}:${row.cardTitle ?? row.group}:${index}`;
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
 * Resultado · Goles · Hándicap · Marcador · 1er tiempo.
 * Resalta la opción más probable por tarjeta, respeta formato de momio del socio,
 * bloqueos de acceso, marca de agua e insignia «Derivado del motor».
 */
export function MatchMarketsGrid({
  sport,
  markets,
  oddsFormat,
  watermark,
  locked = false,
  canSeal = true,
  isFinished = false,
  sealedKeys,
  globalHouseOddRaw = "",
  houseOddsByKey,
  onHouseOddChange,
  onSealRow,
}: MatchMarketsGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | MarketCardCategory
  >("all");

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

  if (locked || markets.length === 0) {
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

  const availableCategories = CATEGORY_ORDER.filter(
    (cat) => (grouped.get(cat)?.length ?? 0) > 0,
  );
  const activeFilter =
    selectedCategory === "all" || availableCategories.includes(selectedCategory)
      ? selectedCategory
      : "all";
  const visibleCategories =
    activeFilter === "all" ? availableCategories : [activeFilter];

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

              <div className="pl-mkt-grid">
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

                    <div className="pl-mkt-rows">
                      {card.rows.map(({ row, key, isMostLikely }) => {
                        const pct = Math.round(row.p * 1000) / 10;
                        const fairText = formatOddsValue(
                          row.fairDecimal,
                          oddsFormat,
                        );
                        const rawHouse = houseOddsByKey?.[key] ?? "";
                        const effectiveRaw = rawHouse.trim() || globalHouseOddRaw.trim();
                        const houseDecimal =
                          (effectiveRaw ? parseUserOdds(effectiveRaw) : null) ??
                          row.currentDecimal;
                        const edgePts =
                          houseDecimal != null
                            ? edgeAgainstBook(row.p, houseDecimal)
                            : row.edgePts;
                        const isSealed = sealedKeys?.has(key) ?? false;

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
                                <span
                                  className="pl-mkt-row-fair num"
                                  title="Momio justo del modelo"
                                >
                                  Justo {fairText}
                                </span>
                              </div>
                            </div>

                            <div className="pl-mkt-bar" aria-hidden="true">
                              <span
                                style={{
                                  width: `${Math.min(100, Math.max(4, pct))}%`,
                                }}
                              />
                            </div>

                            {(onHouseOddChange || onSealRow) && !isFinished ? (
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
    </div>
  );
}
