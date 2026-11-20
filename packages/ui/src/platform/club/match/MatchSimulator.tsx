"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { sportHasDraw, sportScoringUnit } from "@pitchlab/contracts";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import type { PlatformGame } from "../../types";
import {
  mulberry32,
  playMatch,
  SimAccumulator,
  simulateScore,
  type PlayedMatch,
  type SimInput,
  type SimSummary,
} from "./simulation";

const RUNS = 10_000;
const BATCH = 800;
const ADJ_MIN_PCT = -25;
const ADJ_MAX_PCT = 25;
const ADJ_STEP_PCT = 5;

function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    void err;
    return false;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampPct100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Acota cada probabilidad a [0, 1] y normaliza el reparto para garantizar suma exacta = 1.
 * En deportes sin empate fuerza `draw = 0` y redistribuye únicamente entre local y visita.
 */
export function normalizeOutcomeProbs(
  home: number,
  draw: number,
  away: number,
  hasDraw: boolean,
): { readonly home: number; readonly draw: number; readonly away: number } {
  const h = clamp01(home);
  const d = hasDraw ? clamp01(draw) : 0;
  const a = clamp01(away);
  const total = h + d + a;
  if (total <= 0) {
    return hasDraw
      ? { home: 1 / 3, draw: 1 / 3, away: 1 / 3 }
      : { home: 0.5, draw: 0, away: 0.5 };
  }
  return {
    home: clamp01(h / total),
    draw: hasDraw ? clamp01(d / total) : 0,
    away: clamp01(a / total),
  };
}

const pct = (v: number) => `${(clamp01(v) * 100).toFixed(1)} %`;

const signedPctLabel = (delta: number): string =>
  delta > 0 ? `+${delta} %` : `${delta} %`;

/**
 * Simulador del partido: «Simular 10,000 partidos» reparte escenarios con la proyección
 * esperada del modelo (o un ajuste manual «¿Qué pasa si…?») y «Jugar un partido» narra uno al azar.
 * No se muestra si el snapshot aún no incluye pronóstico ni probabilidades válidas.
 */
export function MatchSimulator({ game }: { game: PlatformGame }): React.JSX.Element | null {
  if (
    !game.projection ||
    !game.x12 ||
    game.hasForecast === false ||
    !Number.isFinite(game.projection.home) ||
    !Number.isFinite(game.projection.away)
  ) {
    return null;
  }
  return <MatchSimulatorInner game={game} projection={game.projection} x12={game.x12} />;
}

function MatchSimulatorInner({
  game,
  projection,
  x12,
}: {
  game: PlatformGame;
  projection: NonNullable<PlatformGame["projection"]>;
  x12: NonNullable<PlatformGame["x12"]>;
}): React.JSX.Element {
  const uid = useId().replace(/:/g, "");
  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const isPoints = unit.short === "pts";
  const isFootball = game.sport === "football";
  const isHockey = game.sport === "ice-hockey";
  const isBaseball = game.sport === "baseball";
  const unitPlural = unit.plural;

  const [homeAdjPct, setHomeAdjPct] = useState(0);
  const [awayAdjPct, setAwayAdjPct] = useState(0);
  const [summary, setSummary] = useState<SimSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [played, setPlayed] = useState<PlayedMatch | null>(null);
  const [clock, setClock] = useState(0);
  const raf = useRef<number | null>(null);
  const timer = useRef<number | null>(null);

  const cancelPending = useCallback(() => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    setRunning(false);
  }, []);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (timer.current !== null) window.clearInterval(timer.current);
    },
    [],
  );

  // Al cambiar de partido, reinicia el escenario y cancela corridas previas.
  useEffect(() => {
    cancelPending();
    setHomeAdjPct(0);
    setAwayAdjPct(0);
    setSummary(null);
    setPlayed(null);
    setClock(0);
  }, [game.id, cancelPending]);

  const baseHomeExpected = Math.max(0.05, Number.isFinite(projection.home) ? projection.home : 0.05);
  const baseAwayExpected = Math.max(0.05, Number.isFinite(projection.away) ? projection.away : 0.05);
  const isAdjusted = homeAdjPct !== 0 || awayAdjPct !== 0;

  const modelProbs = useMemo(
    () => normalizeOutcomeProbs(x12[0], x12[1], x12[2], hasDraw),
    [x12, hasDraw],
  );

  const simInput = useMemo<SimInput>(() => {
    const homeExpected = Math.max(0.05, baseHomeExpected * (1 + homeAdjPct / 100));
    const awayExpected = Math.max(0.05, baseAwayExpected * (1 + awayAdjPct / 100));
    const baseTwoWay = modelProbs.home + modelProbs.away;
    const basePHome = baseTwoWay > 0 ? clamp01(modelProbs.home / baseTwoWay) : 0.5;
    const pHome = isAdjusted
      ? clamp01(homeExpected / Math.max(0.0001, homeExpected + awayExpected))
      : basePHome;
    return {
      sport: game.sport,
      homeExpected,
      awayExpected,
      pHome,
    };
  }, [game.sport, baseHomeExpected, baseAwayExpected, homeAdjPct, awayAdjPct, modelProbs, isAdjusted]);

  const handleAdjustHome = useCallback(
    (next: number) => {
      cancelPending();
      setHomeAdjPct(Math.max(ADJ_MIN_PCT, Math.min(ADJ_MAX_PCT, next)));
      setSummary(null);
      setPlayed(null);
    },
    [cancelPending],
  );

  const handleAdjustAway = useCallback(
    (next: number) => {
      cancelPending();
      setAwayAdjPct(Math.max(ADJ_MIN_PCT, Math.min(ADJ_MAX_PCT, next)));
      setSummary(null);
      setPlayed(null);
    },
    [cancelPending],
  );

  const handleResetScenario = useCallback(() => {
    cancelPending();
    setHomeAdjPct(0);
    setAwayAdjPct(0);
    setSummary(null);
    setPlayed(null);
  }, [cancelPending]);

  const runMany = useCallback(() => {
    if (running) return;
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    const rng = mulberry32(Date.now() & 0xffffffff);
    const acc = new SimAccumulator(simInput.sport);
    setRunning(true);
    setPlayed(null);
    if (reducedMotion()) {
      for (let i = 0; i < RUNS; i++) acc.add(simulateScore(simInput, rng));
      setSummary(acc.summary());
      setRunning(false);
      return;
    }
    const step = () => {
      for (let i = 0; i < BATCH && acc.runs < RUNS; i++) acc.add(simulateScore(simInput, rng));
      setSummary(acc.summary());
      if (acc.runs < RUNS) {
        raf.current = requestAnimationFrame(step);
      } else {
        raf.current = null;
        setRunning(false);
      }
    };
    raf.current = requestAnimationFrame(step);
  }, [running, simInput]);

  const playOne = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    const match = playMatch(simInput, mulberry32((Date.now() * 7) & 0xffffffff));
    setPlayed(match);
    if (reducedMotion()) {
      setClock(match.length);
      return;
    }
    setClock(0);
    const tick = isFootball ? 38 : isBaseball ? 420 : 700;
    timer.current = window.setInterval(() => {
      setClock((c) => {
        if (c >= match.length) {
          if (timer.current !== null) {
            window.clearInterval(timer.current);
            timer.current = null;
          }
          return c;
        }
        return c + 1;
      });
    }, tick);
  }, [simInput, isFootball, isBaseball]);

  const liveEvents = played ? played.events.filter((e) => e.at <= clock) : [];
  const liveHome = liveEvents.filter((e) => e.side === "home").reduce((s, e) => s + e.points, 0);
  const liveAway = liveEvents.filter((e) => e.side === "away").reduce((s, e) => s + e.points, 0);
  const finished = played ? clock >= played.length : false;

  const normalizedSummary = useMemo(
    () =>
      summary ? normalizeOutcomeProbs(summary.home, summary.draw, summary.away, hasDraw) : null,
    [summary, hasDraw],
  );
  const maxTopScore = summary ? Math.max(summary.topScores[0]?.share ?? 0, 0.0001) : 1;
  const maxTotal = summary
    ? Math.max(...summary.totals.map((t) => clamp01(t.share)), 0.0001)
    : 1;

  const titleId = `${uid}-sim-title`;
  const homeSliderId = `${uid}-sim-home-adj`;
  const awaySliderId = `${uid}-sim-away-adj`;

  return (
    <section className="pl-sim glass-card glass-ring" aria-labelledby={titleId} data-match-simulator="">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="m-0 text-base font-extrabold">
            Simulador del partido
          </h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            {isAdjusted ? "Escenario ajustado: " : "Con la proyección del modelo: "}
            <span className="num font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
              {simInput.homeExpected.toFixed(unit.decimals)} – {simInput.awayExpected.toFixed(unit.decimals)}{" "}
              {unitPlural}
            </span>
            . Cada corrida es aleatoria.
          </p>
        </div>
        <MaestroIcon name="activity" size={18} style={{ color: "var(--pl-text-muted)" }} />
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pl-btn-primary text-sm min-h-11 sm:min-h-10 px-4 inline-flex items-center gap-1.5 touch-manipulation"
          onClick={runMany}
          disabled={running}
        >
          <MaestroIcon name="bolt" size={14} />
          <span>{running ? "Simulando…" : summary ? "Simular otra vez" : "Simular 10,000 partidos"}</span>
        </button>
        <button
          type="button"
          className="pl-btn-glass text-sm min-h-11 sm:min-h-10 px-4 inline-flex items-center gap-1.5 touch-manipulation"
          onClick={playOne}
        >
          <MaestroIcon name="sparkles" size={14} />
          <span>Jugar un partido</span>
        </button>
      </div>

      <details className="pl-atom-disclosure" data-sim-scenario="">
        <summary className="min-h-11 sm:min-h-9">
          Ajustar escenario ({isAdjusted ? `${signedPctLabel(homeAdjPct)} / ${signedPctLabel(awayAdjPct)}` : "modelo base"})
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center justify-between gap-2 text-xs">
              <label htmlFor={homeSliderId} className="font-semibold truncate">
                {game.home.shortName}
              </label>
              <span className="num font-bold" style={{ color: "var(--pl-text-secondary)" }}>
                {simInput.homeExpected.toFixed(unit.decimals)} {unit.short} ({signedPctLabel(homeAdjPct)})
              </span>
            </div>
            <input
              id={homeSliderId}
              type="range"
              min={ADJ_MIN_PCT}
              max={ADJ_MAX_PCT}
              step={ADJ_STEP_PCT}
              value={homeAdjPct}
              aria-valuetext={`${game.home.shortName}: ${simInput.homeExpected.toFixed(unit.decimals)} ${unitPlural} (${signedPctLabel(homeAdjPct)})`}
              onChange={(e) => handleAdjustHome(Number(e.target.value))}
              className="w-full min-h-11 cursor-pointer touch-manipulation"
              style={{ accentColor: "var(--pl-brand)" }}
            />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center justify-between gap-2 text-xs">
              <label htmlFor={awaySliderId} className="font-semibold truncate">
                {game.away.shortName}
              </label>
              <span className="num font-bold" style={{ color: "var(--pl-text-secondary)" }}>
                {simInput.awayExpected.toFixed(unit.decimals)} {unit.short} ({signedPctLabel(awayAdjPct)})
              </span>
            </div>
            <input
              id={awaySliderId}
              type="range"
              min={ADJ_MIN_PCT}
              max={ADJ_MAX_PCT}
              step={ADJ_STEP_PCT}
              value={awayAdjPct}
              aria-valuetext={`${game.away.shortName}: ${simInput.awayExpected.toFixed(unit.decimals)} ${unitPlural} (${signedPctLabel(awayAdjPct)})`}
              onChange={(e) => handleAdjustAway(Number(e.target.value))}
              className="w-full min-h-11 cursor-pointer touch-manipulation"
              style={{ accentColor: "var(--pl-info)" }}
            />
          </div>

          {isAdjusted ? (
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-3 inline-flex items-center gap-1.5 touch-manipulation"
                onClick={handleResetScenario}
              >
                <span>Restablecer escenario</span>
              </button>
            </div>
          ) : null}
        </div>
      </details>

      {played ? (
        <div className="pl-sim-live" aria-live="polite">
          <div className="pl-sim-board num">
            <span className="truncate">{game.home.shortName}</span>
            <strong>
              {liveHome} – {liveAway}
            </strong>
            <span className="truncate text-right">{game.away.shortName}</span>
          </div>
          <div className="pl-sim-clock" aria-hidden="true">
            <span style={{ width: `${clampPct100((clock / Math.max(1, played.length)) * 100)}%` }} />
          </div>
          <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
            {finished
              ? "Final"
              : isFootball
                ? `Minuto ${clock}'`
                : isHockey
                  ? `Período ${Math.max(1, clock)}`
                  : isBaseball
                    ? `Entrada ${Math.max(1, clock)}`
                    : `Cuarto ${Math.max(1, clock)}`}
          </p>
          {liveEvents.length > 0 ? (
            <ul className="pl-sim-events">
              {liveEvents.map((e, i) => (
                <li key={i} className="num">
                  <span>
                    {isFootball
                      ? `${e.at}'`
                      : isHockey
                        ? `P${e.at}`
                        : isBaseball
                          ? `E${e.at}`
                          : `C${e.at}`}
                  </span>
                  <span>
                    {game.sport === "american-football"
                      ? e.points === 7
                        ? "Touchdown"
                        : e.points === 3
                          ? "Gol de campo"
                          : `${e.points} pts`
                      : game.sport === "basketball"
                        ? e.points === 3
                          ? "Triple (3 pts)"
                          : e.points === 2
                            ? "Canasta (2 pts)"
                            : "Tiro libre (1 pt)"
                        : isBaseball
                          ? "Carrera"
                          : "Gol"}{" "}
                    de {e.side === "home" ? game.home.shortName : game.away.shortName}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {summary && normalizedSummary ? (
        <div className="pl-sim-results">
          <div className="pl-sim-split num">
            <SplitCell label={game.home.shortName} value={normalizedSummary.home} model={modelProbs.home} />
            {hasDraw ? (
              <SplitCell label="Empate" value={normalizedSummary.draw} model={modelProbs.draw} />
            ) : null}
            <SplitCell label={game.away.shortName} value={normalizedSummary.away} model={modelProbs.away} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h3 className="pl-cortex-label">Marcadores más repetidos</h3>
              <ul className="pl-sim-scores">
                {summary.topScores.map((s) => (
                  <li key={s.score} className="num">
                    <strong>{s.score}</strong>
                    <span className="pl-conf-bar">
                      <span
                        style={{
                          width: `${clampPct100((clamp01(s.share) / maxTopScore) * 100)}%`,
                          background: "var(--pl-brand)",
                        }}
                      />
                    </span>
                    <span>{pct(s.share)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="pl-cortex-label">
                {isPoints ? "Puntos totales" : isBaseball ? "Carreras totales" : "Goles totales"}
              </h3>
              <div
                className="pl-sim-hist"
                role="img"
                aria-label={`Reparto de ${unitPlural} totales en ${summary.runs} simulaciones`}
              >
                {summary.totals.map((t) => (
                  <div key={t.label} className="pl-sim-col" title={`${t.label}: ${pct(t.share)}`}>
                    <span style={{ height: `${clampPct100((clamp01(t.share) / maxTotal) * 100)}%` }} />
                    <small className="num">{t.label}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="m-0 text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
            {summary.runs.toLocaleString("es-MX")} simulaciones aleatorias (suma normalizada al 100.0 %).
            Referencia estadística; no garantiza resultados.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function SplitCell({ label, value, model }: { label: string; value: number; model: number }): React.JSX.Element {
  return (
    <div className="pl-sim-cell">
      <span className="truncate text-xs" style={{ color: "var(--pl-text-muted)" }}>
        {label}
      </span>
      <strong className="text-xl num">{pct(value)}</strong>
      <span className="text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
        modelo {pct(model)}
      </span>
    </div>
  );
}
