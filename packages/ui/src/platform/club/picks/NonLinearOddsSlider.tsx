"use client";

import React, { useId, useMemo } from "react";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { formatOddsValue } from "../../access-guard";
import { oddsToSliderStep, sliderStepToOdds, smoothOddsWeight } from "../../screener-views";
import type { OddsFormat } from "../../types";

export interface OddsRangePreset {
  readonly id: string;
  readonly label: string;
  readonly minDecimal: number | null;
  readonly maxDecimal: number | null;
}

export const NON_LINEAR_ODDS_PRESETS: readonly OddsRangePreset[] = [
  { id: "all", label: "Todos", minDecimal: null, maxDecimal: null },
  { id: "safe", label: "1.10–1.65", minDecimal: 1.1, maxDecimal: 1.65 },
  { id: "sweet", label: "1.45–2.50", minDecimal: 1.45, maxDecimal: 2.5 },
  { id: "value", label: "2.00–5.00", minDecimal: 2.0, maxDecimal: 5.0 },
  { id: "longshot", label: "3.00+", minDecimal: 3.0, maxDecimal: null },
];

const SCALE_TICKS_DECIMAL = [1.1, 1.5, 2.0, 3.0, 6.0, 10.0] as const;

type SliderCustomStyle = React.CSSProperties & {
  readonly "--attr-min": string;
  readonly "--attr-max": string;
  readonly "--control-value": string;
};

export function formatOddsStepBound(
  step: number,
  oddsFormat: OddsFormat,
  isUpperBound = false,
): string {
  if (isUpperBound && step >= 100) {
    return oddsFormat === "american" ? "+900+" : "10.00+";
  }
  const dec = sliderStepToOdds(step);
  if (dec === null) {
    return oddsFormat === "american" ? "+900+" : "10.00+";
  }
  return formatOddsValue(dec, oddsFormat);
}

function formatPresetChipLabel(preset: OddsRangePreset, oddsFormat: OddsFormat): string {
  if (preset.minDecimal === null && preset.maxDecimal === null) return "Todos";
  if (oddsFormat === "decimal") return preset.label;
  const minTxt = preset.minDecimal ? formatOddsValue(preset.minDecimal, "american") : "";
  const maxTxt = preset.maxDecimal ? formatOddsValue(preset.maxDecimal, "american") : "";
  if (minTxt && maxTxt) return `${minTxt} a ${maxTxt}`;
  return `${minTxt}+`;
}

export interface NonLinearOddsSliderProps {
  readonly minStep: number;
  readonly maxStep: number;
  readonly oddsFormat: OddsFormat;
  readonly onChange: (nextMinStep: number, nextMaxStep: number) => void;
  readonly compact?: boolean;
}

export function NonLinearOddsSlider({
  minStep,
  maxStep,
  oddsFormat,
  onChange,
  compact = false,
}: NonLinearOddsSliderProps): React.JSX.Element {
  const minSliderId = useId();
  const maxSliderId = useId();

  const safeMin = Math.max(0, Math.min(99, Math.round(minStep)));
  const safeMax = Math.max(safeMin + 1, Math.min(100, Math.round(maxStep)));

  const minLabel = useMemo(
    () => formatOddsStepBound(safeMin, oddsFormat, false),
    [safeMin, oddsFormat],
  );
  const maxLabel = useMemo(
    () => formatOddsStepBound(safeMax, oddsFormat, true),
    [safeMax, oddsFormat],
  );

  const midpointLiquidityPct = useMemo(() => {
    const midStep = Math.round((safeMin + safeMax) / 2);
    const midOdds = sliderStepToOdds(midStep) ?? 10.0;
    return Math.round(smoothOddsWeight(midOdds) * 100);
  }, [safeMin, safeMax]);

  const minSliderStyle: SliderCustomStyle = {
    "--attr-min": "0",
    "--attr-max": "99",
    "--control-value": String(safeMin),
  };

  const maxSliderStyle: SliderCustomStyle = {
    "--attr-min": "1",
    "--attr-max": "100",
    "--control-value": String(safeMax),
  };

  const isUnrestricted = safeMin === 0 && safeMax === 100;

  return (
    <div
      className={`pl-nlos-box ${compact ? "is-compact" : ""}`.trim()}
      data-odds-range-slider=""
    >
      <div className="pl-nlos-head">
        <div className="pl-nlos-title-wrap">
          <span className="pl-nlos-title">Rango de momios</span>
          <span className="pl-nlos-sub">
            Curva C¹ · precisión 1.30–3.00 · amplia hasta 10.00+
            {!isUnrestricted ? ` · liquidez ${midpointLiquidityPct} %` : ""}
          </span>
        </div>
        <div className="pl-nlos-readout-row">
          <span className="pl-nlos-readout num" data-odds-range-readout="">
            {isUnrestricted ? "Sin límite" : `${minLabel} — ${maxLabel}`}
          </span>
          {!isUnrestricted ? (
            <button
              type="button"
              className="pl-nlos-reset"
              onClick={() => onChange(0, 100)}
            >
              Limpiar
            </button>
          ) : null}
        </div>
      </div>

      <div className="pl-nlos-visual" aria-hidden="true">
        <div className="pl-nlos-bar-track">
          <span className="pl-nlos-sweet-zone" />
          <span
            className="pl-nlos-bar-fill"
            style={{
              left: `${safeMin}%`,
              width: `${Math.max(2, safeMax - safeMin)}%`,
            }}
          />
        </div>
        <div className="pl-nlos-ticks num">
          {SCALE_TICKS_DECIMAL.map((dec) => {
            const tickStep = dec >= 10 ? 100 : oddsToSliderStep(dec);
            const txt =
              dec >= 10
                ? oddsFormat === "american"
                  ? "+900+"
                  : "10.0+"
                : formatOddsValue(dec, oddsFormat);
            const active = tickStep >= safeMin && tickStep <= safeMax;
            return (
              <span
                key={dec}
                className={`pl-nlos-tick ${active ? "is-in" : ""}`.trim()}
              >
                {txt}
              </span>
            );
          })}
        </div>
      </div>

      <div className="pl-nlos-presets" role="group" aria-label="Atajos de rango de momios">
        {NON_LINEAR_ODDS_PRESETS.map((preset) => {
          const targetMin = preset.minDecimal === null ? 0 : oddsToSliderStep(preset.minDecimal);
          const targetMax = preset.maxDecimal === null ? 100 : oddsToSliderStep(preset.maxDecimal);
          const active = safeMin === targetMin && safeMax === targetMax;
          return (
            <button
              key={preset.id}
              type="button"
              className={`pl-nlos-preset-btn num ${active ? "is-on" : ""}`.trim()}
              aria-pressed={active}
              onClick={() => onChange(targetMin, Math.max(targetMin + 1, targetMax))}
            >
              {formatPresetChipLabel(preset, oddsFormat)}
            </button>
          );
        })}
      </div>

      <div className="pl-nlos-inputs">
        <div className="pl-nlos-field">
          <div className="pl-nlos-field-head">
            <label htmlFor={minSliderId} className="pl-nlos-label">
              Momio mínimo
            </label>
            <strong className="pl-nlos-val num">{minLabel}</strong>
          </div>
          <input
            id={minSliderId}
            type="range"
            className="pl-scr-slider"
            style={minSliderStyle}
            min={0}
            max={99}
            step={1}
            value={safeMin}
            aria-label="Momio mínimo"
            aria-valuetext={`Momio mínimo ${minLabel}`}
            onChange={(e) => {
              const parsed = parseStrictFiniteNumber(e.target.value);
              if (parsed === null) return;
              onChange(Math.min(Math.round(parsed), safeMax - 1), safeMax);
            }}
          />
        </div>

        <div className="pl-nlos-field">
          <div className="pl-nlos-field-head">
            <label htmlFor={maxSliderId} className="pl-nlos-label">
              Momio máximo
            </label>
            <strong className="pl-nlos-val num">
              {safeMax >= 100 ? `Sin tope (${maxLabel})` : maxLabel}
            </strong>
          </div>
          <input
            id={maxSliderId}
            type="range"
            className="pl-scr-slider"
            style={maxSliderStyle}
            min={1}
            max={100}
            step={1}
            value={safeMax}
            aria-label="Momio máximo"
            aria-valuetext={
              safeMax >= 100
                ? `Momio máximo sin tope (${maxLabel})`
                : `Momio máximo ${maxLabel}`
            }
            onChange={(e) => {
              const parsed = parseStrictFiniteNumber(e.target.value);
              if (parsed === null) return;
              onChange(safeMin, Math.max(Math.round(parsed), safeMin + 1));
            }}
          />
        </div>
      </div>
    </div>
  );
}
