"use client";

import React from "react";
import { formatOddsValue } from "../access-guard";
import type { EarlyPayoutSummaryView, OddsFormat } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";

export interface EarlyPayoutStripProps {
  readonly homeLabel: string;
  readonly awayLabel: string;
  readonly earlyPayout: EarlyPayoutSummaryView;
  readonly oddsFormat: OddsFormat;
}

const pct1 = (p: number) => `${(p * 100).toFixed(1)} %`;

/**
 * Muestra la probabilidad exacta con promoción de Pago Anticipado (+2 goles, +17 NFL, +20 NBA,
 * +5 MLB) y cuántos puntos porcentuales suma frente al resultado regular.
 */
export function EarlyPayoutStrip({
  homeLabel,
  awayLabel,
  earlyPayout,
  oddsFormat,
}: EarlyPayoutStripProps): React.JSX.Element {
  const sides = [
    {
      key: "home",
      label: homeLabel,
      prob: earlyPayout.homeWinProb,
      liftPts: earlyPayout.homeLiftPts,
      fairDec: earlyPayout.fairHomeDecimal,
    },
    {
      key: "away",
      label: awayLabel,
      prob: earlyPayout.awayWinProb,
      liftPts: earlyPayout.awayLiftPts,
      fairDec: earlyPayout.fairAwayDecimal,
    },
  ];

  return (
    <section
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: "var(--pl-surface)",
        boxShadow: "inset 0 0 0 1px var(--pl-border)",
      }}
      data-early-payout-strip=""
      aria-label={`Pago anticipado: ${earlyPayout.triggerLabel}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="m-0 text-sm font-extrabold"
              style={{ textWrap: "balance" }}
            >
              Pago anticipado
            </h3>
            <span className="pl-pill pl-pill--brand text-[11px] font-bold">
              {earlyPayout.triggerLabel}
            </span>
          </div>
          <p
            className="m-0 text-xs mt-0.5"
            style={{ color: "var(--pl-text-muted)", textWrap: "pretty" }}
          >
            Probabilidad efectiva si tu casa liquida ganadora al alcanzar esa ventaja en cualquier momento.
          </p>
        </div>
        {!earlyPayout.validatedOos ? (
          <span
            className="pl-pill text-[11px] shrink-0"
            style={{ color: "var(--pl-text-muted)" }}
          >
            Estimación estructural
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {sides.map((s) => (
          <div
            key={s.key}
            className="min-w-0 rounded-xl p-3 flex items-center justify-between gap-3"
            style={{
              background: "var(--pl-surface-elevated)",
              boxShadow: "inset 0 0 0 1px var(--pl-border)",
            }}
            data-early-payout-side={s.key}
          >
            <div className="min-w-0">
              <strong className="block text-xs font-extrabold truncate">
                {s.label}
              </strong>
              <span
                className="block text-[11px] num mt-0.5"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Momio justo {formatOddsValue(s.fairDec, oddsFormat)}
              </span>
            </div>
            <div className="text-right shrink-0 num">
              <strong className="block text-base font-extrabold leading-tight">
                {pct1(s.prob)}
              </strong>
              <span
                className="inline-flex items-center gap-0.5 text-[11px] font-bold"
                style={{ color: "var(--pl-success)" }}
              >
                <MaestroIcon name="bolt" size={11} />
                <span>+{s.liftPts.toFixed(1)} pp</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {typeof earlyPayout.bothTriggerProb === "number" &&
      earlyPayout.bothTriggerProb >= 0.001 ? (
        <p
          className="m-0 text-[11px] num"
          style={{ color: "var(--pl-text-muted)" }}
        >
          Probabilidad de doble cobro (ambos llegan a +2 en el mismo partido):{" "}
          <strong>{(earlyPayout.bothTriggerProb * 100).toFixed(2)} %</strong>.
        </p>
      ) : null}
    </section>
  );
}
