import React from "react";
import { PBar } from "../../sports";
import { formatOddsValue } from "../access-guard";
import type { MatchOutlookSummary } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";

type OddsFormat = Parameters<typeof formatOddsValue>[1];

const QUALITY_COPY: Record<MatchOutlookSummary["quality"]["flag"], string> = {
  ok: "Datos completos",
  low_coverage: "Datos parciales",
  fallback_base_rate: "Base histórica de la liga",
};

const pct = (p: number) => `${(p * 100).toFixed(1)} %`;

/**
 * Franja superior de «Mercados»: lo más probable, los marcadores más probables y qué tan
 * completos están los datos. Solo probabilidad y momio justo; la cuota de casa aparece
 * únicamente con captura real de menos de 72 h.
 */
export function MatchOutlookStrip({
  outlook,
  oddsFormat,
}: {
  outlook: MatchOutlookSummary;
  oddsFormat: OddsFormat;
}): React.JSX.Element {
  const { mostLikely, scorelines, quality, hasRecentQuote } = outlook;
  const partial = quality.flag !== "ok";

  return (
    <div
      className="rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4"
      style={{ background: "var(--pl-surface)" }}
      data-match-outlook=""
    >
      {mostLikely ? (
        <div className="min-w-0 space-y-1.5">
          <div className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
            Lo más probable
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <strong className="min-w-0 text-base leading-snug">{mostLikely.label}</strong>
            <strong className="num text-lg shrink-0">{pct(mostLikely.p)}</strong>
          </div>
          <PBar p={mostLikely.p} lead />
          <div className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
            Momio justo {formatOddsValue(mostLikely.fairDecimal, oddsFormat)}
          </div>
        </div>
      ) : null}

      {scorelines.length > 0 ? (
        <div className="min-w-0 space-y-1.5">
          <div className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
            Marcadores más probables
          </div>
          <ol className="m-0 p-0 list-none space-y-1" aria-label="Marcadores más probables">
            {scorelines.map((s, i) => (
              <li
                key={`${s.home}-${s.away}`}
                className="flex items-baseline justify-between gap-3 text-sm num"
              >
                <strong className={i === 0 ? "font-extrabold" : "font-semibold"}>
                  {s.home}–{s.away}
                </strong>
                <span>
                  <span className="font-bold">{pct(s.p)}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--pl-text-muted)" }}>
                    justo {formatOddsValue(s.fairDecimal, oddsFormat)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="min-w-0 space-y-2 text-xs">
        <div className="font-semibold" style={{ color: "var(--pl-text-muted)" }}>
          Calidad de los datos
        </div>
        <span
          className="inline-flex items-center gap-1.5 font-bold"
          style={{ color: partial ? "var(--pl-warning)" : "var(--pl-success)" }}
          data-outlook-quality={quality.flag}
        >
          <MaestroIcon name={partial ? "eye" : "check"} size={13} />
          <span style={{ color: "var(--pl-text)" }}>
            {QUALITY_COPY[quality.flag]}
            {quality.flag === "low_coverage" ? (
              <span className="num"> · {quality.coveragePct} % de los datos</span>
            ) : null}
          </span>
        </span>
        {hasRecentQuote ? null : (
          <p className="m-0 leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
            Sin cuota real reciente (menos de 72 h). Escribe el momio de tu casa en «Probar momio»
            para compararlo con el momio justo.
          </p>
        )}
      </div>
    </div>
  );
}
