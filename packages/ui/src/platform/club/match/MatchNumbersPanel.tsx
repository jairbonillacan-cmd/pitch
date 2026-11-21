"use client";

import React, { useMemo } from "react";
import { sportScoringUnit, type CountProjection } from "@pitchlab/contracts";
import { TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { AtomicStatComparisonBar } from "../../atomic/AtomicStatComparisonBar";
import { EarlyPayoutStrip } from "../../components/EarlyPayoutStrip";
import { EpistemicBandStrip } from "../../components/EpistemicBandStrip";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { MatchOutlookStrip } from "../../components/MatchOutlookStrip";
import type {
  MatchIntelligenceV5View,
  MatchOutlookSummary,
  OddsFormat,
  PlatformGame,
  PlatformMarketRow,
} from "../../types";
import { MatchMarketsGrid } from "./MatchMarketsGrid";
import { MatchSimulator } from "./MatchSimulator";

export interface MatchNumbersPanelProps {
  readonly game: PlatformGame;
  readonly markets: readonly PlatformMarketRow[];
  readonly oddsFormat: OddsFormat;
  readonly watermark: string;
  readonly unlocked: boolean;
  readonly isFinished: boolean;
  readonly canSeal: boolean;
  readonly outlook?: MatchOutlookSummary | null;
  readonly v5?: MatchIntelligenceV5View | null;
  readonly sealedKeys: ReadonlySet<string>;
  readonly globalHouseOddRaw: string;
  readonly houseOddsByKey: Readonly<Record<string, string>>;
  readonly onGlobalHouseOddChange: (next: string) => void;
  readonly onHouseOddChange: (rowKey: string, value: string) => void;
  readonly onSealRow: (row: PlatformMarketRow, rowKey: string) => void;
}

interface MetricCardItem {
  readonly key: "goals" | "corners" | "fouls" | "yellow" | "sot" | "shots";
  readonly title: string;
  readonly homeNum: number | null;
  readonly awayNum: number | null;
  readonly homeValue: string;
  readonly awayValue: string;
  readonly digits: number;
  readonly totalValue: string;
  readonly lineSummary?: string;
  readonly marketRows: readonly PlatformMarketRow[];
}

const COUNT_MARKET_META = [
  {
    key: "corners" as const,
    market: "corners_total",
    title: "Córners esperados",
    unit: "córners",
  },
  {
    key: "fouls" as const,
    market: "fouls_total",
    title: "Faltas esperadas",
    unit: "faltas",
  },
  {
    key: "yellow" as const,
    market: "yellow_total",
    title: "Amarillas esperadas",
    unit: "amarillas",
  },
] as const;

function formatLineSummary(
  count: CountProjection | undefined,
  rows: readonly PlatformMarketRow[],
  oddsFormat: OddsFormat,
  unit: string,
): string | undefined {
  if (count) {
    return `Línea ${count.line.toFixed(1)} ${unit} · ${Math.round(count.pOver * 100)} % más`;
  }
  const overRow = rows.find((r) => r.selection === "over" || r.label.toLowerCase().includes("más"));
  if (!overRow) return undefined;
  return `${overRow.label}: ${Math.round(overRow.p * 100)} % (${formatOddsValue(overRow.fairDecimal, oddsFormat)})`;
}

/**
 * Pestaña «Números» de la ficha del partido:
 * goles (o puntos), córners, faltas y tarjetas amarillas esperadas por equipo,
 * líneas de `corners_total` / `fouls_total` / `yellow_total`, mercados completos y simulador.
 */
export function MatchNumbersPanel({
  game,
  markets,
  oddsFormat,
  watermark,
  unlocked,
  isFinished,
  canSeal,
  outlook,
  v5 = null,
  sealedKeys,
  globalHouseOddRaw,
  houseOddsByKey,
  onGlobalHouseOddChange,
  onHouseOddChange,
  onSealRow,
}: MatchNumbersPanelProps): React.JSX.Element {
  const isNfl = game.sport !== "football";
  const unit = sportScoringUnit(game.sport);
  const decimals = unit.decimals;
  const canReadNumbers = unlocked || isFinished;

  const cards = useMemo<MetricCardItem[]>(() => {
    if (!canReadNumbers) return [];
    const items: MetricCardItem[] = [];

    const goalRows = markets.filter((r) => r.market === "totals");
    if (!game.projection && !(isFinished && game.score)) return items;
    const proj = game.projection ?? { home: 0, away: 0, total: 0 };
    const goalTotal =
      isFinished && game.score
        ? `${game.score.home + game.score.away}`
        : proj.total.toFixed(decimals);
    const goalHome =
      isFinished && game.score
        ? `${game.score.home}`
        : proj.home.toFixed(decimals);
    const goalAway =
      isFinished && game.score
        ? `${game.score.away}`
        : proj.away.toFixed(decimals);
    const homeNum = isFinished && game.score ? game.score.home : proj.home;
    const awayNum = isFinished && game.score ? game.score.away : proj.away;

    items.push({
      key: "goals",
      title: unit.plural === "puntos" ? "Puntos esperados" : "Goles esperados",
      homeNum,
      awayNum,
      homeValue: goalHome,
      awayValue: goalAway,
      digits: isFinished && game.score ? 0 : decimals,
      totalValue: goalTotal,
      lineSummary: game.goalLine
        ? `Línea ${game.goalLine.line} · ${Math.round(game.goalLine.pOver * 100)} % más (${formatOddsValue(1 / Math.max(game.goalLine.pOver, 0.01), oddsFormat)})`
        : undefined,
      marketRows: goalRows.slice(0, 2),
    });

    if (!isNfl) {
      const v5Mic = v5?.microCounts;
      const v5ByKey: Record<"corners" | "fouls" | "yellow", { home: number; away: number; total: number } | undefined> = {
        corners: v5Mic?.corners,
        fouls: v5Mic?.fouls,
        yellow: v5Mic?.yellowCards,
      };
      for (const meta of COUNT_MARKET_META) {
        const count = game.counts?.[meta.key];
        const v5Fallback = v5ByKey[meta.key];
        const marketRows = markets.filter((r) => r.market === meta.market);
        if (!count && !v5Fallback && marketRows.length === 0) continue;

        const homeVal = count ? count.home : v5Fallback?.home;
        const awayVal = count ? count.away : v5Fallback?.away;
        const totalVal = count ? count.total : v5Fallback?.total;

        items.push({
          key: meta.key,
          title: meta.title,
          homeNum: homeVal ?? null,
          awayNum: awayVal ?? null,
          homeValue: homeVal !== undefined ? homeVal.toFixed(1) : "—",
          awayValue: awayVal !== undefined ? awayVal.toFixed(1) : "—",
          digits: 1,
          totalValue: totalVal !== undefined ? totalVal.toFixed(1) : "Ver línea",
          lineSummary: formatLineSummary(count, marketRows, oddsFormat, meta.unit),
          marketRows,
        });
      }

      if (v5Mic?.shotsOnTarget) {
        const sotRows = markets.filter((r) => r.market === "sot_total");
        items.push({
          key: "sot",
          title: "Remates a puerta",
          homeNum: v5Mic.shotsOnTarget.home,
          awayNum: v5Mic.shotsOnTarget.away,
          homeValue: v5Mic.shotsOnTarget.home.toFixed(1),
          awayValue: v5Mic.shotsOnTarget.away.toFixed(1),
          digits: 1,
          totalValue: v5Mic.shotsOnTarget.total.toFixed(1),
          lineSummary: formatLineSummary(undefined, sotRows, oddsFormat, "remates a puerta"),
          marketRows: sotRows,
        });
      }
    }

    return items;
  }, [canReadNumbers, decimals, game.counts, game.goalLine, game.projection, game.score, isFinished, isNfl, markets, oddsFormat, v5]);

  const hasCountMetrics = cards.some((card) => card.key !== "goals");
  const hasSimulator =
    !isFinished &&
    unlocked &&
    Boolean(game.projection && game.x12 && game.hasForecast !== false);
  const pairNumbersWithSim = canReadNumbers && cards.length === 1 && hasSimulator;

  const expectedSection = (
    <section
      className="glass-card glass-ring rounded-2xl p-5 space-y-4 h-full"
      data-numbers-expected=""
      data-card-count={cards.length}
      aria-labelledby="num-expected-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="num-expected-heading" className="m-0 text-lg font-extrabold">
          Números esperados por equipo
        </h2>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5">
            <TeamBadge league={game.league} slug={game.home.slug} name={game.home.name} size={18} decorative />
            <span>{game.home.shortName}</span>
          </span>
          <span style={{ color: "var(--pl-text-muted)" }}>vs</span>
          <span className="inline-flex items-center gap-1.5">
            <span>{game.away.shortName}</span>
            <TeamBadge league={game.league} slug={game.away.slug} name={game.away.name} size={18} decorative />
          </span>
        </div>
      </div>

      {!canReadNumbers ? (
        <div className="pl-num-locked" data-numbers-locked="">
          <MaestroIcon name="lock" size={16} />
          <div>
            <p className="m-0 text-sm font-bold">
              Goles, córners, faltas y tarjetas esperadas reservadas
            </p>
            <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
              Activa tu Pase PitchLab Ultra para desbloquear la proyección por equipo y los mercados de conteos.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="pl-num-grid" data-card-count={cards.length}>
            {cards.map((card) => (
              <article key={card.key} className="pl-num-card" data-count-card={card.key}>
                <header className="pl-num-card-head">
                  <h3 className="m-0 text-sm font-extrabold">{card.title}</h3>
                  <span className="pl-pill pl-pill--brand num text-xs">
                    Total {card.totalValue}
                  </span>
                </header>

                <AtomicStatComparisonBar
                  label=""
                  homeValue={card.homeNum}
                  awayValue={card.awayNum}
                  homeDisplay={card.homeValue}
                  awayDisplay={card.awayValue}
                  homeLabel={game.home.shortName}
                  awayLabel={game.away.shortName}
                  digits={card.digits}
                  variant="compact"
                  showTeamLabels
                />

                {card.lineSummary ? (
                  <p className="pl-num-line num m-0">{card.lineSummary}</p>
                ) : null}

                {card.marketRows.length > 0 ? (
                  <ul className="pl-num-rows num" role="list">
                    {card.marketRows.map((row, rowIdx) => (
                      <li key={`${row.market}-${row.selection}-${row.line ?? "base"}-${rowIdx}`}>
                        <span>{row.label}</span>
                        <strong>
                          {Math.round(row.p * 100)} % · {formatOddsValue(row.fairDecimal, oddsFormat)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>

          {!isNfl && !hasCountMetrics ? (
            <p className="pl-num-empty m-0 text-xs" data-no-counts="">
              Córners, faltas y tarjetas esperadas se muestran cuando ambos clubes acumulan historial reciente suficiente en la liga.
            </p>
          ) : null}

          {v5?.microCounts &&
          (v5.microCounts.redCardMatchProb !== undefined ||
            v5.microCounts.bookingPointsMean !== undefined) ? (
            <div
              className="flex flex-wrap items-center gap-2 pt-1 text-xs num"
              data-v5-discipline-pills=""
            >
              {v5.microCounts.redCardMatchProb !== undefined ? (
                <span className="pl-pill text-xs">
                  Tarjeta roja:{" "}
                  <strong>{(v5.microCounts.redCardMatchProb * 100).toFixed(1)} %</strong>
                </span>
              ) : null}
              {v5.microCounts.bookingPointsMean !== undefined ? (
                <span className="pl-pill text-xs">
                  Puntos por tarjeta esp.:{" "}
                  <strong>{v5.microCounts.bookingPointsMean.toFixed(1)}</strong>
                </span>
              ) : null}
              {v5.microCounts.shots ? (
                <span className="pl-pill text-xs">
                  Remates totales esp.:{" "}
                  <strong>{v5.microCounts.shots.total.toFixed(1)}</strong>
                </span>
              ) : null}
            </div>
          ) : null}

          {v5?.nflSpecials ? (
            <div
              className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs num"
              data-v5-nfl-specials=""
            >
              <div
                className="rounded-xl p-3"
                style={{
                  background: "var(--pl-surface-elevated)",
                  border: "1px solid var(--pl-border)",
                }}
              >
                <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                  Tiempo extra (OT)
                </span>
                <strong className="text-sm font-extrabold">
                  {(v5.nflSpecials.pOvertime * 100).toFixed(1)} %
                </strong>{" "}
                <span style={{ color: "var(--pl-text-muted)" }}>
                  · justo {formatOddsValue(v5.nflSpecials.fairOvertimeDecimal, oddsFormat)}
                </span>
              </div>
              <div
                className="rounded-xl p-3"
                style={{
                  background: "var(--pl-surface-elevated)",
                  border: "1px solid var(--pl-border)",
                }}
              >
                <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                  Margen exacto ±3 pts
                </span>
                <strong className="text-sm font-extrabold">
                  {((v5.nflSpecials.pExactPlus3 + v5.nflSpecials.pExactMinus3) * 100).toFixed(1)} %
                </strong>
                <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                  +3 ({(v5.nflSpecials.pExactPlus3 * 100).toFixed(1)} %) · −3 (
                  {(v5.nflSpecials.pExactMinus3 * 100).toFixed(1)} %)
                </span>
              </div>
              <div
                className="rounded-xl p-3"
                style={{
                  background: "var(--pl-surface-elevated)",
                  border: "1px solid var(--pl-border)",
                }}
              >
                <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                  Margen esperado local
                </span>
                <strong className="text-sm font-extrabold">
                  {v5.nflSpecials.expectedMargin >= 0 ? "+" : ""}
                  {v5.nflSpecials.expectedMargin.toFixed(1)} pts
                </strong>
              </div>
            </div>
          ) : null}

          {v5?.multisportSpecials && v5.multisportSpecials.highlights.length > 0 ? (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs num"
              data-v5-multisport-specials={v5.multisportSpecials.sport}
            >
              {v5.multisportSpecials.highlights.map((h) => (
                <div
                  key={h.label}
                  className="rounded-xl p-3"
                  style={{
                    background: "var(--pl-surface-elevated)",
                    border: "1px solid var(--pl-border)",
                  }}
                >
                  <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                    {h.label}
                  </span>
                  <strong className="block text-sm font-extrabold mt-0.5">{h.value}</strong>
                  {h.sub ? (
                    <span className="block text-[11px] mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
                      {h.sub}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );

  return (
    <div className="pl-num-wrap">
      {pairNumbersWithSim ? (
        <div className="pl-num-duo">
          <div className="min-w-0">{expectedSection}</div>
          <section aria-label="Simulador de escenarios" className="min-w-0">
            <MatchSimulator game={game} />
          </section>
        </div>
      ) : (
        expectedSection
      )}

      <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-extrabold">Mercados del partido</h2>
            <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
              Probabilidad y momio justo de cada mercado. Escribe el momio de tu casa para ver si tiene ventaja.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="studio-market-odds-input" className="text-xs font-bold">
              Probar momio:
            </label>
            <input
              id="studio-market-odds-input"
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              autoCorrect="off"
              spellCheck={false}
              value={globalHouseOddRaw}
              onChange={(e) => onGlobalHouseOddChange(e.target.value)}
              placeholder="Ej. -110 o 2.05"
              className="glass-input px-3 py-1.5 text-base sm:text-xs font-bold num min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 w-36"
            />
            {globalHouseOddRaw ? (
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 px-3 sm:px-2.5"
                onClick={() => onGlobalHouseOddChange("")}
              >
                Limpiar
              </button>
            ) : null}
          </div>
        </div>

        {outlook && markets.length > 0 ? (
          <MatchOutlookStrip outlook={outlook} oddsFormat={oddsFormat} />
        ) : null}

        {canReadNumbers && v5 ? (
          <div className="space-y-3" data-v5-outlook-strips="">
            <EpistemicBandStrip
              homeLabel={game.home.shortName}
              awayLabel={game.away.shortName}
              homeBand={v5.epistemic.home}
              drawBand={v5.epistemic.draw ?? null}
              awayBand={v5.epistemic.away}
              oddsFormat={oddsFormat}
            />
            {v5.earlyPayout ? (
              <EarlyPayoutStrip
                homeLabel={game.home.shortName}
                awayLabel={game.away.shortName}
                earlyPayout={v5.earlyPayout}
                oddsFormat={oddsFormat}
              />
            ) : null}
          </div>
        ) : null}

        <MatchMarketsGrid
          sport={game.sport}
          markets={markets}
          oddsFormat={oddsFormat}
          watermark={watermark}
          locked={!unlocked && !isFinished}
          isFinished={isFinished}
          canSeal={canSeal}
          sealedKeys={sealedKeys}
          globalHouseOddRaw={globalHouseOddRaw}
          houseOddsByKey={houseOddsByKey}
          onHouseOddChange={onHouseOddChange}
          onSealRow={onSealRow}
        />
      </section>

      {hasSimulator && !pairNumbersWithSim ? (
        <section aria-label="Simulador de escenarios">
          <MatchSimulator game={game} />
        </section>
      ) : null}
    </div>
  );
}
