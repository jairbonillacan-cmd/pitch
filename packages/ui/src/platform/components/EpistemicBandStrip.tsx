"use client";

import React from "react";
import { formatOddsValue } from "../access-guard";
import type { EpistemicBandView, OddsFormat } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";

export interface EpistemicBandStripProps {
  readonly homeLabel: string;
  readonly awayLabel: string;
  readonly homeBand: EpistemicBandView;
  readonly drawBand?: EpistemicBandView | null;
  readonly awayBand: EpistemicBandView;
  readonly oddsFormat: OddsFormat;
  /** Versión compacta de una fila para franjas angostas. */
  readonly compact?: boolean;
}

const GRADE_META: Readonly<
  Record<
    EpistemicBandView["grade"],
    { readonly label: string; readonly tone: string; readonly hint: string }
  >
> = {
  high: {
    label: "Estabilidad alta",
    tone: "var(--pl-success)",
    hint: "Muestra amplia y consistente: el rango al 90 % es estrecho.",
  },
  moderate: {
    label: "Varianza moderada",
    tone: "var(--pl-brand)",
    hint: "Incertidumbre habitual del partido; conviene comparar contra el piso del rango.",
  },
  elevated: {
    label: "Incertidumbre elevada",
    tone: "var(--pl-warning)",
    hint: "Bajas relevantes, muestra corta o arranque de torneo amplían el intervalo al 90 %.",
  },
};

const pct1 = (p: number) => `${(p * 100).toFixed(1)} %`;
const pct0 = (p: number) => `${Math.round(p * 100)} %`;

function worstGrade(
  bands: readonly EpistemicBandView[],
): EpistemicBandView["grade"] {
  if (bands.some((b) => b.grade === "elevated")) return "elevated";
  if (bands.some((b) => b.grade === "moderate")) return "moderate";
  return "high";
}

/**
 * Muestra el intervalo de confianza calibrado al 90 % (`[pLower90, pUpper90]`) para los
 * resultados principales del partido, con explicación secundaria plegada en `<details>`.
 */
export function EpistemicBandStrip({
  homeLabel,
  awayLabel,
  homeBand,
  drawBand = null,
  awayBand,
  oddsFormat,
  compact = false,
}: EpistemicBandStripProps): React.JSX.Element {
  const rows: Array<{ key: string; label: string; band: EpistemicBandView }> = [
    { key: "home", label: homeLabel, band: homeBand },
    ...(drawBand ? [{ key: "draw", label: "Empate", band: drawBand }] : []),
    { key: "away", label: awayLabel, band: awayBand },
  ];

  const overall = worstGrade(rows.map((r) => r.band));
  const meta = GRADE_META[overall];

  return (
    <section
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: "var(--pl-surface)",
        boxShadow: "inset 0 0 0 1px var(--pl-border)",
      }}
      data-epistemic-band-strip=""
      data-epistemic-grade={overall}
      aria-label="Rango de confianza al 90 por ciento"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3
            className="m-0 text-sm font-extrabold"
            style={{ textWrap: "balance" }}
          >
            Rango de confianza (90 %)
          </h3>
          {!compact ? (
            <p
              className="m-0 text-xs mt-0.5"
              style={{ color: "var(--pl-text-muted)", textWrap: "pretty" }}
            >
              Muestra cuánto puede moverse cada probabilidad según la muestra y las bajas.
            </p>
          ) : null}
        </div>
        <span
          className="pl-pill text-[11px] font-bold inline-flex items-center gap-1.5 shrink-0"
          style={{
            color: meta.tone,
            background: `color-mix(in srgb, ${meta.tone} 12%, var(--pl-surface-elevated))`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${meta.tone} 32%, var(--pl-border))`,
          }}
        >
          <MaestroIcon name="shield" size={12} />
          <span>{meta.label}</span>
        </span>
      </header>

      <div
        className={
          compact
            ? "grid grid-cols-1 sm:grid-cols-3 gap-2.5"
            : "grid grid-cols-1 md:grid-cols-3 gap-3"
        }
      >
        {rows.map(({ key, label, band }) => {
          const leftPct = Math.max(0, Math.min(100, band.pLower90 * 100));
          const widthPct = Math.max(
            3,
            Math.min(100 - leftPct, (band.pUpper90 - band.pLower90) * 100),
          );
          const pointPct = Math.max(0, Math.min(100, band.pPoint * 100));

          return (
            <div
              key={key}
              className="min-w-0 rounded-xl p-3 space-y-2"
              style={{
                background: "var(--pl-surface-elevated)",
                boxShadow: "inset 0 0 0 1px var(--pl-border)",
              }}
              data-epistemic-side={key}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-xs font-bold truncate">
                  {label}
                </span>
                <strong className="num text-sm font-extrabold shrink-0">
                  {pct1(band.pPoint)}
                </strong>
              </div>

              <div
                className="relative h-2.5 rounded-full"
                style={{ background: "var(--pl-surface-hover)" }}
                role="img"
                aria-label={`${label}: estimado ${pct1(band.pPoint)}, rango 90 % entre ${pct0(band.pLower90)} y ${pct0(band.pUpper90)}`}
              >
                <span
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 rounded-full"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    background:
                      "color-mix(in srgb, var(--pl-brand) 38%, transparent)",
                    boxShadow: "inset 0 0 0 1px var(--pl-brand)",
                  }}
                />
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
                  style={{
                    left: `${pointPct}%`,
                    background: "var(--pl-brand)",
                    boxShadow: "0 0 0 2px var(--pl-surface-elevated)",
                  }}
                />
              </div>

              <div
                className="flex flex-wrap items-center justify-between gap-1 text-[11px] num"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>
                  Rango {pct0(band.pLower90)}–{pct0(band.pUpper90)}
                </span>
                <span>
                  Piso justo{" "}
                  <strong style={{ color: "var(--pl-text-secondary)" }}>
                    {formatOddsValue(band.conservativeFairDecimal, oddsFormat)}
                  </strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <details className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>
        <summary
          className="cursor-pointer font-semibold select-none min-h-9 inline-flex items-center gap-1.5"
          style={{ color: "var(--pl-text-muted)" }}
        >
          <span>¿Cómo leer el rango al 90 % y el piso justo?</span>
        </summary>
        <p className="m-0 pt-1.5 leading-relaxed" style={{ textWrap: "pretty" }}>
          {meta.hint} El <strong>piso justo</strong> calcula el momio mínimo exigente usando el
          extremo conservador del intervalo para evitar sobreestimar ventaja en partidos volátiles.
        </p>
      </details>
    </section>
  );
}
