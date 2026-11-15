"use client";

import React, { useMemo } from "react";
import { sportScoringUnit, type CountProjection } from "@pitchlab/contracts";
import { TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
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

  return (
    <div className="pl-num-wrap">
      <section
        className="glass-card glass-ring rounded-2xl p-5 space-y-4"
        data-numbers-expected=""
        aria-labelledby="num-expected-heading"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="num-expected-heading" className="m-0 text-lg font-extrabold">
              Números esperados por equipo
            </h2>
            <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
              {isNfl
                ? "Puntos esperados por club, totales de línea y distribución proyectada."
                : "Goles, tiros de esquina, faltas y tarjetas amarillas estimadas por club."}
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
            <div className="pl-num-grid">
              {cards.map((card) => (
                <article key={card.key} className="pl-num-card" data-count-card={card.key}>
                  <header className="pl-num-card-head">
                    <div>
                      <h3 className="m-0 text-sm font-extrabold">{card.title}</h3>
                      <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                        {card.subtitle}
                      </span>
                    </div>
                    <span className="pl-pill pl-pill--brand num text-xs">
                      Total {card.totalValue}
                    </span>
                  </header>

                  <div className="pl-num-split num">
                    <div className="pl-num-side">
                      <span className="pl-num-team">{game.home.shortName}</span>
                      <strong>{card.homeValue}</strong>
                    </div>
                    <div className="pl-num-side is-away">
                      <span className="pl-num-team">{game.away.shortName}</span>
                      <strong>{card.awayValue}</strong>
                    </div>
                  </div>

                  <div className="pl-num-bar" aria-hidden="true">
                    <span className="is-home" style={{ width: `${card.homeSharePct}%` }} />
                    <span className="is-away" style={{ width: `${100 - card.homeSharePct}%` }} />
                  </div>

                  {card.lineSummary ? (
                    <p className="pl-num-line num m-0">{card.lineSummary}</p>
                  ) : null}

                  {card.marketRows.length > 0 ? (
                    <ul className="pl-num-rows num" role="list">
                      {card.marketRows.map((row) => (
                        <li key={`${row.market}-${row.selection}`}>
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
          </>
        )}
      </section>

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
          locked={!unlocked && !isFinished && markets.length === 0}
          isFinished={isFinished}
          canSeal={canSeal}
          sealedKeys={sealedKeys}
          globalHouseOddRaw={globalHouseOddRaw}
          houseOddsByKey={houseOddsByKey}
          onHouseOddChange={onHouseOddChange}
          onSealRow={onSealRow}
        />
      </section>

      {isFinished || !unlocked ? null : (
        <section aria-label="Simulador de escenarios">
          <MatchSimulator game={game} />
        </section>
      )}
    </div>
  );
}
