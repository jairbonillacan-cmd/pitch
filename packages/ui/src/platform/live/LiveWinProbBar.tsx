"use client";

import React from "react";
import type { LiveInPlayWinProb } from "@pitchlab/contracts";
import { formatOddsValue } from "../access-guard";
import type { OddsFormat } from "../types";

export interface LiveWinProbBarProps {
  readonly homeLabel: string;
  readonly awayLabel: string;
  readonly inPlay: LiveInPlayWinProb;
  readonly oddsFormat: OddsFormat;
}

const pct0 = (p: number) => `${Math.round(p * 100)} %`;

/**
 * Barra viva de probabilidad 1X2 + «Siguiente gol» actualizada minuto a minuto según
 * marcador y expulsiones reales (`inPlayWinProb` del servidor).
 */
export function LiveWinProbBar({
  homeLabel,
  awayLabel,
  inPlay,
  oddsFormat,
}: LiveWinProbBarProps): React.JSX.Element {
  const pH = Math.max(0.01, Math.min(0.98, inPlay.pHome));
  const pD = inPlay.pDraw !== null ? Math.max(0, Math.min(0.98, inPlay.pDraw)) : 0;
  const pA = Math.max(0.01, Math.min(0.98, inPlay.pAway));
  const total = pH + pD + pA;
  const wH = (pH / total) * 100;
  const wD = (pD / total) * 100;
  const wA = Math.max(0, 100 - wH - wD);

  const hasReds = (inPlay.redCardsHome ?? 0) > 0 || (inPlay.redCardsAway ?? 0) > 0;

  return (
    <div
      className="rounded-2xl p-3.5 space-y-2.5"
      style={{
        background: "var(--pl-surface)",
        boxShadow: "inset 0 0 0 1px var(--pl-border)",
      }}
      data-live-win-prob=""
      aria-live="polite"
      aria-label={`Probabilidad en vivo minuto ${inPlay.minute}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-extrabold">Probabilidad en vivo · {inPlay.minute}&apos;</span>
        {typeof inPlay.expectedFinalTotal === "number" ? (
          <span className="num font-semibold" style={{ color: "var(--pl-text-muted)" }}>
            Goles finales esp. {inPlay.expectedFinalTotal.toFixed(2)}
            {hasReds ? " · ajuste por roja" : ""}
          </span>
        ) : null}
      </div>

      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--pl-surface-hover)" }}
        role="img"
        aria-label={`${homeLabel} ${pct0(pH)}${inPlay.pDraw !== null ? `, Empate ${pct0(pD)}` : ""}, ${awayLabel} ${pct0(pA)}`}
      >
        <span style={{ width: `${wH}%`, background: "var(--pl-brand)" }} />
        {inPlay.pDraw !== null ? (
          <span
            style={{
              width: `${wD}%`,
              background: "color-mix(in srgb, var(--pl-text-muted) 42%, transparent)",
            }}
          />
        ) : null}
        <span style={{ width: `${wA}%`, background: "var(--pl-info)" }} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs num">
        <div className="min-w-0">
          <span className="block truncate font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
            {homeLabel}
          </span>
          <strong className="font-extrabold">{pct0(pH)}</strong>{" "}
          <span style={{ color: "var(--pl-text-muted)" }}>
            {formatOddsValue(inPlay.fairHomeDecimal, oddsFormat)}
          </span>
        </div>
        {inPlay.pDraw !== null && inPlay.fairDrawDecimal !== null ? (
          <div className="min-w-0 text-center">
            <span className="block font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
              Empate
            </span>
            <strong className="font-extrabold">{pct0(pD)}</strong>{" "}
            <span style={{ color: "var(--pl-text-muted)" }}>
              {formatOddsValue(inPlay.fairDrawDecimal, oddsFormat)}
            </span>
          </div>
        ) : (
          <div />
        )}
        <div className="min-w-0 text-right">
          <span className="block truncate font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
            {awayLabel}
          </span>
          <strong className="font-extrabold">{pct0(pA)}</strong>{" "}
          <span style={{ color: "var(--pl-text-muted)" }}>
            {formatOddsValue(inPlay.fairAwayDecimal, oddsFormat)}
          </span>
        </div>
      </div>

      {typeof inPlay.pNextGoalHome === "number" &&
      typeof inPlay.pNextGoalAway === "number" &&
      typeof inPlay.pNoMoreGoals === "number" ? (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 text-[11px] num"
          style={{
            borderTop: "1px solid var(--pl-border)",
            color: "var(--pl-text-muted)",
          }}
        >
          <span className="font-bold" style={{ color: "var(--pl-text-secondary)" }}>
            Siguiente gol:
          </span>
          <span>
            {homeLabel} <strong>{pct0(inPlay.pNextGoalHome)}</strong>
          </span>
          <span>
            {awayLabel} <strong>{pct0(inPlay.pNextGoalAway)}</strong>
          </span>
          <span>
            Sin más goles <strong>{pct0(inPlay.pNoMoreGoals)}</strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}
