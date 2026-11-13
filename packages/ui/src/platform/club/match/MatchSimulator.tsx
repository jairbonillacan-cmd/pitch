"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import type { PlatformGame } from "../../types";
import { mulberry32, playMatch, SimAccumulator, simulateScore, type PlayedMatch, type SimSummary } from "./simulation";

const RUNS = 10_000;
const BATCH = 800;

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

/**
 * Simulador del partido: «Simular 10,000» reparte resultados con los goles (o puntos)
 * esperados del modelo y se ve crecer por lotes; «Jugar un partido» narra uno al azar.
 */
export function MatchSimulator({ game }: { game: PlatformGame }): React.JSX.Element {
  const isNfl = game.sport === "american-football";
  const input = {
    sport: game.sport,
    homeExpected: game.projection.home,
    awayExpected: game.projection.away,
    pHome: game.x12[0] / Math.max(0.0001, game.x12[0] + game.x12[2]),
  } as const;

  const [summary, setSummary] = useState<SimSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [played, setPlayed] = useState<PlayedMatch | null>(null);
  const [clock, setClock] = useState(0);
  const raf = useRef<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (timer.current !== null) window.clearInterval(timer.current);
    },
    [],
  );

  const runMany = useCallback(() => {
    if (running) return;
    const rng = mulberry32(Date.now() & 0xffffffff);
    const acc = new SimAccumulator(game.sport);
    setRunning(true);
    setPlayed(null);
    if (reducedMotion()) {
      for (let i = 0; i < RUNS; i++) acc.add(simulateScore(input, rng));
      setSummary(acc.summary());
      setRunning(false);
      return;
    }
    const step = () => {
      for (let i = 0; i < BATCH && acc.runs < RUNS; i++) acc.add(simulateScore(input, rng));
      setSummary(acc.summary());
      if (acc.runs < RUNS) raf.current = requestAnimationFrame(step);
      else setRunning(false);
    };
    raf.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, running]);

  const playOne = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    const match = playMatch(input, mulberry32((Date.now() * 7) & 0xffffffff));
    setPlayed(match);
    if (reducedMotion()) {
      setClock(match.length);
      return;
    }
    setClock(0);
    const tick = isNfl ? 700 : 38;
    timer.current = window.setInterval(() => {
      setClock((c) => {
        if (c >= match.length) {
          if (timer.current !== null) window.clearInterval(timer.current);
          return c;
        }
        return c + 1;
      });
    }, tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, isNfl]);

  const liveEvents = played ? played.events.filter((e) => e.at <= clock) : [];
  const liveHome = liveEvents.filter((e) => e.side === "home").reduce((s, e) => s + e.points, 0);
  const liveAway = liveEvents.filter((e) => e.side === "away").reduce((s, e) => s + e.points, 0);
  const finished = played ? clock >= played.length : false;
  const maxTotal = summary ? Math.max(...summary.totals.map((t) => t.share), 0.0001) : 1;

  return (
    <section className="pl-sim glass-card glass-ring" aria-labelledby="sim-title">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="sim-title" className="m-0 text-base font-extrabold">
            Simulador del partido
          </h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Con lo que espera el modelo: {game.projection.home.toFixed(isNfl ? 1 : 2)} –{" "}
            {game.projection.away.toFixed(isNfl ? 1 : 2)} {isNfl ? "puntos" : "goles"}. Cada corrida es al azar.
          </p>
        </div>
        <MaestroIcon name="activity" size={18} style={{ color: "var(--pl-text-muted)" }} />
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="pl-btn-primary text-sm min-h-10 px-4 inline-flex items-center gap-1.5" onClick={runMany} disabled={running}>
          <MaestroIcon name="bolt" size={14} />
          <span>{running ? "Simulando…" : summary ? "Simular otra vez" : "Simular 10,000 partidos"}</span>
        </button>
        <button type="button" className="pl-btn-glass text-sm min-h-10 px-4 inline-flex items-center gap-1.5" onClick={playOne}>
          <MaestroIcon name="sparkles" size={14} />
          <span>Jugar un partido</span>
        </button>
      </div>

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
            <span style={{ width: `${(clock / played.length) * 100}%` }} />
          </div>
          <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
            {finished ? "Final" : isNfl ? `Cuarto ${Math.max(1, clock)}` : `Minuto ${clock}'`}
          </p>
          {liveEvents.length > 0 ? (
            <ul className="pl-sim-events">
              {liveEvents.map((e, i) => (
                <li key={i} className="num">
                  <span>{isNfl ? `C${e.at}` : `${e.at}'`}</span>
                  <span>
                    {isNfl ? (e.points === 7 ? "Touchdown" : e.points === 3 ? "Gol de campo" : `${e.points} pts`) : "Gol"} de{" "}
                    {e.side === "home" ? game.home.shortName : game.away.shortName}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {summary ? (
        <div className="pl-sim-results">
          <div className="pl-sim-split num">
            <SplitCell label={game.home.shortName} value={summary.home} model={game.x12[0]} />
            {isNfl ? null : <SplitCell label="Empate" value={summary.draw} model={game.x12[1]} />}
            <SplitCell label={game.away.shortName} value={summary.away} model={game.x12[2]} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h3 className="pl-cortex-label">Marcadores más repetidos</h3>
              <ul className="pl-sim-scores">
                {summary.topScores.map((s) => (
                  <li key={s.score} className="num">
                    <strong>{s.score}</strong>
                    <span className="pl-conf-bar">
                      <span style={{ width: `${(s.share / summary.topScores[0]!.share) * 100}%`, background: "var(--pl-brand)" }} />
                    </span>
                    <span>{pct(s.share)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="pl-cortex-label">{isNfl ? "Puntos totales" : "Goles totales"}</h3>
              <div className="pl-sim-hist" role="img" aria-label={`Reparto de ${isNfl ? "puntos" : "goles"} totales en ${summary.runs} simulaciones`}>
                {summary.totals.map((t) => (
                  <div key={t.label} className="pl-sim-col" title={`${t.label}: ${pct(t.share)}`}>
                    <span style={{ height: `${(t.share / maxTotal) * 100}%` }} />
                    <small className="num">{t.label}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="m-0 text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
            {summary.runs.toLocaleString("es-MX")} simulaciones. Se parecen a la probabilidad del modelo, pero no son
            iguales: cada corrida es al azar.
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
      <strong className="text-xl">{pct(value)}</strong>
      <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
        modelo {pct(model)}
      </span>
    </div>
  );
}
