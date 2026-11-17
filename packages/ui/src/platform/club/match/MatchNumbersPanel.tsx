"use client";

import React, { useMemo } from "react";
import { sportScoringUnit, type CountProjection } from "@pitchlab/contracts";
import { TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { DualStatComparisonCard } from "../../components/DualStatComparisonCard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { MatchOutlookStrip } from "../../components/MatchOutlookStrip";
import type {
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
  readonly sealedKeys: ReadonlySet<string>;
  readonly globalHouseOddRaw: string;
  readonly houseOddsByKey: Readonly<Record<string, string>>;
  readonly onGlobalHouseOddChange: (next: string) => void;
  readonly onHouseOddChange: (rowKey: string, value: string) => void;
  readonly onSealRow: (row: PlatformMarketRow, rowKey: string) => void;
}

interface MetricCardItem {
  readonly key: "goals" | "corners" | "fouls" | "yellow";
  readonly title: string;
  readonly subtitle: string;
  readonly homeValue: string;
  readonly awayValue: string;
  readonly homeSharePct: number;
  readonly totalValue: string;
  readonly lineSummary?: string;
  readonly marketRows: readonly PlatformMarketRow[];
}

const COUNT_MARKET_META = [
  {
    key: "corners" as const,
    market: "corners_total",
    title: "Córners esperados",
    subtitle: "Tiros de esquina por equipo",
    unit: "córners",
  },
  {
    key: "fouls" as const,
    market: "fouls_total",
    title: "Faltas esperadas",
    subtitle: "Infracciones estimadas por club",
    unit: "faltas",
  },
  {
    key: "yellow" as const,
    market: "yellow_total",
    title: "Amarillas esperadas",
    subtitle: "Tarjetas proyectadas por equipo",
    unit: "amarillas",
  },
] as const;

function sharePct(home: number, away: number): number {
  const sum = home + away;
  if (!Number.isFinite(sum) || sum <= 0) return 50;
  return Math.max(12, Math.min(88, Math.round((home / sum) * 100)));
}

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
      subtitle: isFinished ? "Marcador final registrado" : "Producción proyectada por equipo",
      homeValue: goalHome,
      awayValue: goalAway,
      homeSharePct: sharePct(homeNum, awayNum),
      totalValue: goalTotal,
      lineSummary: game.goalLine
        ? `Línea ${game.goalLine.line} · ${Math.round(game.goalLine.pOver * 100)} % más (${formatOddsValue(1 / Math.max(game.goalLine.pOver, 0.01), oddsFormat)})`
        : undefined,
      marketRows: goalRows.slice(0, 2),
    });

    if (!isNfl) {
      for (const meta of COUNT_MARKET_META) {
        const count = game.counts?.[meta.key];
        const marketRows = markets.filter((r) => r.market === meta.market);
        if (!count && marketRows.length === 0) continue;

        items.push({
          key: meta.key,
          title: meta.title,
          subtitle: meta.subtitle,
          homeValue: count ? count.home.toFixed(1) : "—",
          awayValue: count ? count.away.toFixed(1) : "—",
          homeSharePct: count ? sharePct(count.home, count.away) : 50,
          totalValue: count ? count.total.toFixed(1) : "Ver línea",
          lineSummary: formatLineSummary(count, marketRows, oddsFormat, meta.unit),
          marketRows,
        });
      }
    }

    return items;
  }, [canReadNumbers, decimals, game.counts, game.goalLine, game.projection, game.score, isFinished, isNfl, markets, oddsFormat]);

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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="num-expected-heading" className="m-0 text-lg font-extrabold">
            Números esperados por equipo
          </h2>
          <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
            {game.sport === "football"
              ? "Goles, tiros de esquina, faltas y tarjetas amarillas estimadas por club."
              : unit.plural === "goles"
                ? "Goles esperados por equipo, líneas de total y distribución proyectada."
                : "Puntos esperados por club, totales de línea y distribución proyectada."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5">
            <TeamBadge league={game.league} slug={game.home.slug} name={game.home.name} size={18} />
            <span>{game.home.shortName}</span>
          </span>
          <span style={{ color: "var(--pl-text-muted)" }}>vs</span>
          <span className="inline-flex items-center gap-1.5">
            <span>{game.away.shortName}</span>
            <TeamBadge league={game.league} slug={game.away.slug} name={game.away.name} size={18} />
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
            {cards.map((card) => {
              const homeNum = Number(card.homeValue);
              const awayNum = Number(card.awayValue);
              return (
                <DualStatComparisonCard
                  key={card.key}
                  dataCountCard={card.key}
                  label={card.title}
                  subtitle={card.subtitle}
                  badgeText={`Total ${card.totalValue}`}
                  homeLabel={game.home.shortName}
                  awayLabel={game.away.shortName}
                  homeValueText={card.homeValue}
                  awayValueText={card.awayValue}
                  homeNumeric={Number.isFinite(homeNum) ? homeNum : card.homeSharePct}
                  awayNumeric={Number.isFinite(awayNum) ? awayNum : 100 - card.homeSharePct}
                  footer={
                    card.lineSummary || card.marketRows.length > 0 ? (
                      <>
                        {card.lineSummary ? (
                          <p className="pl-num-line num m-0">{card.lineSummary}</p>
                        ) : null}
                        {card.marketRows.length > 0 ? (
                          <ul className="pl-num-rows num" role="list">
                            {card.marketRows.map((row) => (
                              <li key={`${row.market}-${row.selection}`}>
                                <span>{row.label}</span>
                                <strong>
                                  {Math.round(row.p * 100)} % ·{" "}
                                  {formatOddsValue(row.fairDecimal, oddsFormat)}
                                </strong>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </div>

          {!isNfl && !hasCountMetrics ? (
            <p className="pl-num-empty m-0 text-xs" data-no-counts="">
              Córners, faltas y tarjetas esperadas se muestran cuando ambos clubes acumulan historial reciente suficiente en la liga.
            </p>
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
              value={globalHouseOddRaw}
              onChange={(e) => onGlobalHouseOddChange(e.target.value)}
              placeholder="Ej. -110 o 2.05"
              className="glass-input px-3 py-1.5 text-xs font-bold num w-36"
            />
            {globalHouseOddRaw ? (
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-9 px-2.5"
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
