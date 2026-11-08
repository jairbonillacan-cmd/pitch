"use client";

import React from "react";
import type {
  LeagueId,
  MatchAnalysis,
  OutcomeMarket,
  CalcStep,
  FactorItem,
} from "@pitchlab/contracts";
import {
  formatAmerican,
  formatDecimal,
  formatPercent,
  probabilityToFairOdds,
  formatFreshnessEs,
} from "@pitchlab/contracts";
import { getEmblemPath, getLeagueEmblemPath } from "@pitchlab/sports-assets";
import { Icon } from "./icons.js";

export function TeamBadge({
  league,
  slug,
  name,
  size = 28,
}: {
  league: LeagueId | string;
  slug: string;
  name?: string;
  size?: number;
}): React.JSX.Element {
  return (
    <span className="crest" aria-hidden={name ? undefined : "true"} title={name}>
      <img
        src={getEmblemPath(league, slug)}
        alt={name ?? ""}
        width={size}
        height={size}
        loading="lazy"
      />
    </span>
  );
}

export function LeagueBadge({
  league,
  label,
  size = 22,
}: {
  league: LeagueId | string;
  label?: string;
  size?: number;
}): React.JSX.Element {
  return (
    <span className="crest" style={{ width: size + 6, height: size + 6 }}>
      <img
        src={getLeagueEmblemPath(league)}
        alt={label ?? ""}
        width={size}
        height={size}
        loading="lazy"
      />
    </span>
  );
}

export function ProbBar({
  outcomes,
}: {
  outcomes: readonly OutcomeMarket[];
}): React.JSX.Element {
  const total = outcomes.reduce((sum, o) => sum + o.probability, 0) || 1;
  const maxIdx = outcomes.reduce(
    (best, o, idx) => (o.probability > (outcomes[best]?.probability ?? 0) ? idx : best),
    0,
  );

  return (
    <div className="prob-bar" aria-hidden="true">
      {outcomes.map((o, idx) => {
        const widthPct = ((o.probability / total) * 100).toFixed(2);
        const segClass =
          outcomes.length === 2 && idx === 1
            ? "away"
            : idx === 0
              ? "home"
              : idx === 1
                ? "draw"
                : "away";
        return (
          <span
            key={o.key}
            className={`prob-seg ${segClass} ${idx === maxIdx ? "top" : ""}`.trim()}
            style={{ width: `${widthPct}%` }}
          />
        );
      })}
    </div>
  );
}

export function ProbSplit({
  outcomes,
}: {
  outcomes: readonly OutcomeMarket[];
}): React.JSX.Element {
  const maxIdx = outcomes.reduce(
    (best, o, idx) => (o.probability > (outcomes[best]?.probability ?? 0) ? idx : best),
    0,
  );

  return (
    <div
      className={`prob-split ${outcomes.length === 2 ? "two" : ""}`.trim()}
      aria-label="Probabilidades estimadas"
    >
      {outcomes.map((o, idx) => {
        const fair = o.fairOdds ?? probabilityToFairOdds(o.probability);
        return (
          <div
            key={o.key}
            className={`prob-cell ${idx === maxIdx ? "top" : ""}`.trim()}
          >
            <span className="label">{o.label}</span>
            <span className="pct num">{formatPercent(o.probability, 1)}</span>
            <span className="odds num">
              justo {formatDecimal(fair.decimal)} ({formatAmerican(fair.american)})
            </span>
          </div>
        );
      })}
      <ProbBar outcomes={outcomes} />
    </div>
  );
}

export function Freshness({
  generatedAt,
  now,
}: {
  generatedAt: string;
  now?: Date;
}): React.JSX.Element {
  const info = formatFreshnessEs(generatedAt, now);
  return (
    <span className="tag" title={generatedAt}>
      <span className="dot" />
      <span>{info.label}</span>
    </span>
  );
}

export function MatchCard({
  match,
  onSelect,
}: {
  match: MatchAnalysis;
  onSelect?: (match: MatchAnalysis) => void;
}): React.JSX.Element {
  const isFinished = match.status === "FT" && match.score !== undefined;
  const firstFactor = match.factors[0]?.detail ?? "";

  const handleOpen = () => {
    onSelect?.(match);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(match);
    }
  };

  return (
    <article
      className="match-card"
      data-game-id={match.id}
      tabIndex={0}
      role="button"
      aria-label={`${match.home.name} contra ${match.away.name}, ver análisis`}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
    >
      <div className="mc-head">
        <span>
          {match.round} · {match.venue}
        </span>
        <span className="mc-time">
          <span className="dot" />
          <span className="num">
            {isFinished
              ? `Final ${match.score?.home}-${match.score?.away}`
              : `${match.dayLabel} · ${match.kickoffLocal}`}
          </span>
        </span>
      </div>

      <div className="mc-teams">
        <div className="team-row">
          <div className="team-id">
            <TeamBadge
              league={match.league}
              slug={match.home.slug}
              name={match.home.name}
            />
            <div>
              <div className="team-name">{match.home.name}</div>
              <div className="team-sub">{match.home.record}</div>
            </div>
          </div>
          <span className="team-tag">Local</span>
        </div>

        <div className="team-row">
          <div className="team-id">
            <TeamBadge
              league={match.league}
              slug={match.away.slug}
              name={match.away.name}
            />
            <div>
              <div className="team-name">{match.away.name}</div>
              <div className="team-sub">{match.away.record}</div>
            </div>
          </div>
          <span className="team-tag">Visita</span>
        </div>
      </div>

      <ProbSplit outcomes={match.outcomes} />

      <div className="mc-foot">
        <span className="mc-factor">{firstFactor}</span>
        <span className="mc-cta">
          Ver análisis
          <Icon name="arrow" />
        </span>
      </div>
    </article>
  );
}

export function MarketTable({
  outcomes,
}: {
  outcomes: readonly OutcomeMarket[];
}): React.JSX.Element {
  return (
    <table className="market-table">
      <thead>
        <tr>
          <th>Opción</th>
          <th>Probabilidad</th>
          <th>Momio justo</th>
        </tr>
      </thead>
      <tbody>
        {outcomes.map((o) => {
          const fair = o.fairOdds ?? probabilityToFairOdds(o.probability);
          return (
            <tr key={o.key}>
              <td>
                <strong>{o.label}</strong>
              </td>
              <td className="num">{formatPercent(o.probability, 1)}</td>
              <td className="num">
                {formatDecimal(fair.decimal)} ({formatAmerican(fair.american)})
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function OddsCompare({
  outcomes,
}: {
  outcomes: readonly OutcomeMarket[];
}): React.JSX.Element {
  return <MarketTable outcomes={outcomes} />;
}

export function CalcTrace({
  trace,
}: {
  trace: readonly CalcStep[];
}): React.JSX.Element {
  return (
    <div className="trace-box">
      {trace.map((step, idx) => (
        <div key={`${step.step}-${idx}`} className="trace-row">
          <span className="k">{step.step}</span>
          <span className="v">{step.value}</span>
        </div>
      ))}
    </div>
  );
}

export function FactorsList({
  factors,
}: {
  factors: readonly FactorItem[];
}): React.JSX.Element {
  return (
    <div className="factor-list">
      {factors.map((f, idx) => (
        <div key={`${f.label}-${idx}`} className="factor-item">
          <div>
            <strong>{f.label}.</strong> {f.detail}
          </div>
          <span className="factor-impact">{f.impact}</span>
        </div>
      ))}
    </div>
  );
}
