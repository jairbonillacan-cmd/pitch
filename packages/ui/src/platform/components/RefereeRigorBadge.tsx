"use client";

import React from "react";
import type { RefereeAnalyticsItem } from "../referee-stats";

export interface RefereeRigorBadgeProps {
  readonly referee: RefereeAnalyticsItem;
  /** `compact`: para la ficha del partido (`MatchContextPanel`); `card`: para el directorio de liga. */
  readonly variant?: "compact" | "card";
  readonly onNavigate?: (href: string) => void;
}

/**
 * Termómetro visual de rigurosidad arbitral (`Permisivo ↔ Estricto`) basado en
 * contracción Empirical Bayes (κ = 15) contra la media de amarillas de su liga (ADR-048).
 */
export function RefereeRigorBadge({
  referee,
  variant = "compact",
  onNavigate,
}: RefereeRigorBadgeProps): React.JSX.Element {
  const toneClass =
    referee.rigorTier === "estricto"
      ? "is-strict"
      : referee.rigorTier === "permisivo"
        ? "is-lenient"
        : "is-average";

  const clampedPct = Math.max(4, Math.min(96, referee.rigorPercentile));

  if (variant === "compact") {
    return (
      <div className="pl-ref-rigor-compact" data-referee-rigor={referee.rigorTier}>
        <div className="pl-ref-rigor-row">
          <span className={`pl-ref-rigor-pill ${toneClass}`}>{referee.rigorLabel}</span>
          {referee.ebYellow !== null ? (
            <span className="text-[11px] num" style={{ color: "var(--pl-text-secondary)" }}>
              Ajust. <strong>{referee.ebYellow.toFixed(2)}</strong> amar./p
              {referee.totalInLeague > 1
                ? ` · N.º ${referee.rank} de ${referee.totalInLeague}`
                : ""}
            </span>
          ) : null}
        </div>
        <div
          className="pl-ref-thermo"
          role="img"
          aria-label={`Rigurosidad ${referee.rigorLabel}: percentil ${referee.rigorPercentile} de 100${referee.ebYellow !== null ? `, ${referee.ebYellow.toFixed(2)} amarillas ajustadas por partido frente a media de liga ${referee.leagueMeanYellow.toFixed(2)}` : ""}`}
        >
          <span className="pl-ref-thermo-track" aria-hidden="true">
            <span
              className={`pl-ref-thermo-marker ${toneClass}`}
              style={{ insetInlineStart: `${clampedPct}%` }}
            />
          </span>
          <span className="pl-ref-thermo-ends" aria-hidden="true">
            <span>Permisivo</span>
            <span>Media {referee.leagueMeanYellow.toFixed(1)}</span>
            <span>Estricto</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <article className="pl-ref-card glass-card glass-ring" data-referee-card={referee.name}>
      <header className="pl-ref-card-head">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-sm font-extrabold truncate">{referee.name}</h3>
          <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
            {[
              referee.country,
              referee.matches > 0 ? `${referee.matches} partidos` : null,
              referee.totalInLeague > 1 ? `N.º ${referee.rank} de ${referee.totalInLeague}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className={`pl-ref-rigor-pill ${toneClass}`}>{referee.rigorLabel}</span>
      </header>

      <div
        className="pl-ref-thermo"
        role="img"
        aria-label={`Rigurosidad ${referee.rigorLabel}: percentil ${referee.rigorPercentile} de 100`}
      >
        <span className="pl-ref-thermo-track" aria-hidden="true">
          <span
            className={`pl-ref-thermo-marker ${toneClass}`}
            style={{ insetInlineStart: `${clampedPct}%` }}
          />
        </span>
        <span className="pl-ref-thermo-ends" aria-hidden="true">
          <span>Permisivo</span>
          <span>Media {referee.leagueMeanYellow.toFixed(1)}</span>
          <span>Estricto</span>
        </span>
      </div>

      <dl className="pl-ref-kpis num">
        <div>
          <dt>Amarillas ajust.</dt>
          <dd>{referee.ebYellow !== null ? referee.ebYellow.toFixed(2) : "—"}</dd>
        </div>
        <div>
          <dt>Rojas / p</dt>
          <dd>{referee.avgRed !== null ? referee.avgRed.toFixed(2) : "—"}</dd>
        </div>
        <div>
          <dt>Faltas / p</dt>
          <dd>{referee.avgFouls !== null ? referee.avgFouls.toFixed(1) : "—"}</dd>
        </div>
        <div>
          <dt>Goles / p</dt>
          <dd>{referee.avgGoals !== null ? referee.avgGoals.toFixed(2) : "—"}</dd>
        </div>
      </dl>

      {referee.upcoming.length > 0 ? (
        <div className="pl-ref-upcoming">
          <span className="text-[11px] font-semibold" style={{ color: "var(--pl-text-muted)" }}>
            Próximo partido asignado:
          </span>
          <a
            href={referee.upcoming[0]!.href}
            className="pl-ref-upcoming-link"
            onClick={(e) => {
              if (!onNavigate) return;
              e.preventDefault();
              onNavigate(referee.upcoming[0]!.href);
            }}
          >
            <strong>{referee.upcoming[0]!.matchLabel}</strong>
            <span className="num">{referee.upcoming[0]!.dayLabel}</span>
          </a>
        </div>
      ) : null}
    </article>
  );
}
