"use client";

import React, { useMemo } from "react";
import { TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { usePlatformCore } from "../../platform-provider";
import type { MatchPick, PlatformGame } from "../../types";
import { shortDateLabel } from "../home/home-model";
import {
  buildCortexEditorialSections,
  buildCortexForecastSummary,
  keepCortexUnits,
} from "./cortex-narrative";

/**
 * Lectura estructurada de Cortex IA:
 * 1) Tarjeta "Pronóstico de Cortex IA" con proyección, total, margen, hándicap y probabilidad de victoria.
 * 2) Tarjeta "Análisis de IA" editorial por secciones (Resumen, Puntos/Goles, Margen, Bajas/Forma, A tener en cuenta).
 */
export interface CortexStatView {
  label: string;
  value?: string;
  home?: number;
  away?: number;
}

export interface CortexSectionView {
  key: string;
  title: string;
  text: string;
  origin?: "ia" | "plantilla";
  stats?: readonly CortexStatView[];
}

const fmt = (x: number) =>
  Number.isInteger(x) ? String(x) : x.toFixed(x < 10 ? 2 : 1).replace(/0$/, "");

function SplitStat({
  stat,
  home,
  away,
}: {
  stat: CortexStatView;
  home: string;
  away: string;
}): React.JSX.Element {
  const h = stat.home ?? 0;
  const a = stat.away ?? 0;
  const share = h + a > 0 ? (h / (h + a)) * 100 : 50;
  return (
    <div
      className="pl-cortex-split"
      role="group"
      aria-label={`${stat.label}: ${home} ${fmt(h)}, ${away} ${fmt(a)}`}
    >
      <span className="pl-cortex-split-num num" aria-hidden="true">
        {fmt(h)}
      </span>
      <span className="pl-cortex-split-mid" aria-hidden="true">
        <span className="pl-cortex-split-label">{stat.label}</span>
        <span className="pl-cortex-split-bar">
          <span className="is-home" style={{ inlineSize: `${share}%` }} />
          <span className="is-away" />
        </span>
      </span>
      <span className="pl-cortex-split-num num" aria-hidden="true">
        {fmt(a)}
      </span>
    </div>
  );
}

export function CortexAnalysisCard({
  game,
  synthesis,
  unlocked,
  sections,
  headline,
  onAddPickToParlay,
  inParlayPickIds,
  onUpgrade,
  sideSlot,
}: {
  game: PlatformGame;
  synthesis: string;
  unlocked: boolean;
  sections?: readonly CortexSectionView[] | null;
  headline?: string | null;
  onAddPickToParlay?: (pick: MatchPick) => void;
  inParlayPickIds?: ReadonlySet<string>;
  onUpgrade?: () => void;
  sideSlot?: React.ReactNode;
}): React.JSX.Element {
  const { oddsFormat } = usePlatformCore();

  const forecast = useMemo(
    () => (unlocked ? buildCortexForecastSummary(game, oddsFormat) : null),
    [unlocked, game, oddsFormat],
  );

  const editorial = useMemo(
    () =>
      unlocked
        ? buildCortexEditorialSections(game, synthesis, sections, oddsFormat)
        : [],
    [unlocked, game, synthesis, sections, oddsFormat],
  );

  const mainPick = unlocked ? game.picks[0] : undefined;
  const isMainPickInParlay = Boolean(mainPick && inParlayPickIds?.has(mainPick.id));
  const hasSnapshotWriteup = Boolean(sections && sections.length > 0);
  const effectiveHeadline = headline?.trim() ? keepCortexUnits(headline.trim()) : null;

  if (!unlocked) {
    return (
      <div className="pl-cortex-stack" data-cortex-card="">
        <article className="pl-cortex glass-card glass-ring">
          <header className="pl-cortex-head">
            <span className="pl-cortex-badge" aria-hidden="true">
              <MaestroIcon name="lock" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="cortex-title" className="m-0 text-base sm:text-lg font-extrabold">
                  Pronóstico y análisis de Cortex IA
                </h2>
                <span className="pl-pill pl-pill--brand text-[11px]">
                  <MaestroIcon name="cpu" size={11} />
                  <span>Cortex IA</span>
                </span>
              </div>
              <p className="m-0 text-xs mt-0.5 num" style={{ color: "var(--pl-text-muted)" }}>
                {game.home.shortName} vs {game.away.shortName} · {shortDateLabel(game.dayId)} ·{" "}
                {game.kickoffLocal}
              </p>
            </div>
          </header>

          <p className="pl-cortex-sec-text m-0">
            Radiografía cuantitativa, proyección exacta de puntos y análisis de Cortex IA están
            disponibles para socios con Pase PitchLab Ultra.
          </p>

          {onUpgrade ? (
            <div className="pt-1">
              <button
                type="button"
                className="pl-btn-primary text-xs min-h-10 px-4 inline-flex items-center gap-1.5"
                onClick={onUpgrade}
              >
                <MaestroIcon name="sparkles" size={13} />
                <span>Desbloquear con Pase PitchLab Ultra</span>
              </button>
            </div>
          ) : null}
        </article>
      </div>
    );
  }

  if (
    game.hasForecast === false &&
    synthesis.trim().length === 0 &&
    !hasSnapshotWriteup
  ) {
    return (
      <div className="pl-cortex-stack" data-cortex-card="">
        <article className="pl-cortex glass-card glass-ring">
          <header className="pl-cortex-head">
            <span className="pl-cortex-badge" aria-hidden="true">
              <MaestroIcon name="cpu" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="cortex-title" className="m-0 text-base font-extrabold">
                  Sin lectura publicada
                </h2>
                <span className="pl-pill pl-pill--brand text-[11px]">
                  <MaestroIcon name="cpu" size={11} />
                  <span>Cortex IA</span>
                </span>
              </div>
              <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                {game.home.shortName} vs {game.away.shortName} · {shortDateLabel(game.dayId)} ·{" "}
                {game.kickoffLocal}
              </p>
            </div>
          </header>
          <p className="pl-cortex-sec-text m-0" style={{ color: "var(--pl-text-muted)" }}>
            Aún sin pronóstico ni lectura previa publicados para este partido.
          </p>
        </article>
      </div>
    );
  }

  return (
    <div className="pl-cortex-board" data-cortex-card="">
      {/* Columna 1: Pronóstico estructurado de Cortex IA + señales del modelo */}
      <div className="pl-cortex-board-left">
      <article className="pl-cortex glass-card glass-ring" data-cortex-forecast="">
        <header className="pl-cortex-head">
          <span className="pl-cortex-badge" aria-hidden="true">
            <MaestroIcon name="sparkles" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="cortex-title" className="m-0 text-base sm:text-lg font-extrabold">
                Pronóstico de Cortex IA
              </h2>
            </div>
            <p className="m-0 text-xs mt-0.5 num" style={{ color: "var(--pl-text-muted)" }}>
              Generado antes del comienzo del partido · {shortDateLabel(game.dayId)} ·{" "}
              {game.kickoffLocal}
            </p>
          </div>
        </header>

        {forecast ? (
          <>
            <dl className="pl-cortex-kv">
              <div className="pl-cortex-kv-row pl-cortex-kv-row--scores">
                <dt>{forecast.scoreLabel}</dt>
                <dd className="pl-cortex-kv-teams num">
                  <span className="pl-cortex-kv-team">
                    <TeamBadge
                      league={game.league}
                      slug={game.home.slug}
                      name={game.home.name}
                      logoUrl={game.home.logoUrl}
                      size={18}
                    />
                    <span className="truncate">{game.home.name}</span>
                    <strong>{forecast.homeScore}</strong>
                  </span>
                  <span className="pl-cortex-kv-sep" aria-hidden="true">
                    |
                  </span>
                  <span className="pl-cortex-kv-team">
                    <TeamBadge
                      league={game.league}
                      slug={game.away.slug}
                      name={game.away.name}
                      logoUrl={game.away.logoUrl}
                      size={18}
                    />
                    <span className="truncate">{game.away.name}</span>
                    <strong>{forecast.awayScore}</strong>
                  </span>
                </dd>
              </div>

              <div className="pl-cortex-kv-row">
                <dt>{forecast.totalLabel}</dt>
                <dd className="num font-extrabold">{forecast.totalValue}</dd>
              </div>

              {forecast.totalsRow ? (
                <div className="pl-cortex-kv-row">
                  <dt>{forecast.totalsRow.label}</dt>
                  <dd className="num">
                    <strong>{forecast.totalsRow.valueLabel}</strong>
                    {forecast.totalsRow.fairLabel ? (
                      <span className="pl-cortex-kv-fair">{forecast.totalsRow.fairLabel}</span>
                    ) : null}
                  </dd>
                </div>
              ) : null}

              {forecast.marginText ? (
                <div className="pl-cortex-kv-row">
                  <dt>Margen esperado</dt>
                  <dd className="num">{forecast.marginText}</dd>
                </div>
              ) : null}

              {forecast.handicapRow ? (
                <div className="pl-cortex-kv-row">
                  <dt>{forecast.handicapRow.label}</dt>
                  <dd className="num">
                    <strong>{forecast.handicapRow.valueLabel}</strong>
                    {forecast.handicapRow.fairLabel ? (
                      <span className="pl-cortex-kv-fair">{forecast.handicapRow.fairLabel}</span>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>

            {/* Subpanel Probabilidad de victoria */}
            <div className="pl-cortex-winbox">
              <div className="pl-cortex-winbox-title">Probabilidad de victoria</div>

              <div
                className={
                  forecast.isThreeWay
                    ? "pl-cortex-win-cols is-three"
                    : "pl-cortex-win-cols"
                }
              >
                {forecast.winOutcomes.map((out) => (
                  <div
                    key={out.key}
                    className={`pl-cortex-win-col${out.isWinner ? " is-winner" : ""}`}
                  >
                    {out.key === "draw" ? (
                      <span className="pl-cortex-draw-emblem" aria-hidden="true">
                        X
                      </span>
                    ) : (
                      <TeamBadge
                        league={game.league}
                        slug={out.slug!}
                        name={out.name}
                        logoUrl={out.logoUrl}
                        size={28}
                      />
                    )}
                    <span className="pl-cortex-win-name">
                      {out.prefix} · {out.name}
                    </span>
                    <strong className="pl-cortex-win-pct num">{out.pct}{String.fromCharCode(160)}%</strong>
                    {out.fairLabel ? (
                      <span className="pl-cortex-win-fair num">{out.fairLabel}</span>
                    ) : null}
                    {out.isWinner ? (
                      <span className="pl-cortex-win-check" aria-label="Ganador real del partido">
                        <MaestroIcon name="check" size={14} />
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              {forecast.isFinished ? (
                <div className="pl-cortex-real-result num">
                  Resultado real del partido
                  {forecast.realScoreText ? ` · ${forecast.realScoreText}` : ""}
                </div>
              ) : null}
            </div>

            {/* Esencia PitchLab: Pick principal accionable con momio justo */}
            {!forecast.isFinished && mainPick ? (
              <div className="pl-cortex-pickbar">
                <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                  <span className="pl-pill pl-pill--success text-[11px]">
                    Pick principal
                  </span>
                  <strong className="text-sm font-extrabold truncate">
                    {mainPick.label}
                  </strong>
                  <span
                    className="text-xs num"
                    style={{ color: "var(--pl-text-secondary)" }}
                  >
                    {(mainPick.p * 100).toFixed(1)}{String.fromCharCode(160)}% · Justo{" "}
                    {formatOddsValue(mainPick.fairDecimal, oddsFormat)}
                  </span>
                </div>

                {onAddPickToParlay ? (
                  <button
                    type="button"
                    className={
                      isMainPickInParlay
                        ? "pl-btn-primary text-xs min-h-9 px-3 shrink-0"
                        : "pl-btn-glass text-xs min-h-9 px-3 shrink-0"
                    }
                    onClick={() => onAddPickToParlay(mainPick)}
                  >
                    {isMainPickInParlay ? "En tu parlay ✓" : "+ Parlay"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </article>
      {sideSlot}
      </div>

      {/* Columna 2: Análisis editorial de IA */}
      <div className="pl-cortex-board-right">
      <article className="pl-cortex glass-card glass-ring" data-cortex-analysis="">
        <header className="pl-cortex-narrative-head">
          <div className="min-w-0 space-y-0.5">
            <h2 className="m-0 text-base sm:text-lg font-extrabold">Análisis de IA</h2>
            {effectiveHeadline ? (
              <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-brand)" }}>
                {effectiveHeadline}
              </p>
            ) : null}
          </div>
          <span className="pl-pill text-[11px] shrink-0">Con los números del modelo</span>
        </header>

        <div className="pl-cortex-editorial">
          {editorial.map((sec) => {
            const splits = (sec.stats ?? []).filter(
              (st) => st.home !== undefined && st.away !== undefined,
            );
            return (
              <div
                key={sec.key}
                className={`pl-cortex-ed-item${sec.isWatch ? " is-watch" : ""}`}
              >
                <h3 className="pl-cortex-ed-title">{sec.title}</h3>
                <p className="pl-cortex-ed-body">{sec.text}</p>
                {splits.length > 0 ? (
                  <div className="pl-cortex-splits pt-1">
                    {splits.map((st) => (
                      <SplitStat
                        key={st.label}
                        stat={st}
                        home={game.home.shortName}
                        away={game.away.shortName}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="pl-cortex-footnote">
          Pronóstico estadístico de Cortex IA. No garantiza resultados.
        </p>

        <details className="pl-cortex-trust">
          <summary>Cómo se genera y verifica esta lectura</summary>
          <p>
            Todas las cifras provienen del modelo estadístico prepartido de PitchLab y de los
            reportes oficiales de bajas cargados en el corte. No se inventan jugadores, cuotas de
            casas ni factores externos no confirmados.
          </p>
        </details>
      </article>
      </div>
    </div>
  );
}
