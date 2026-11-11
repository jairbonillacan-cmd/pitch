import React from "react";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../sports";
import type { LandingHeroLeagueCard } from "./PublicSiteSections";

function formatFairAmericanFromProb(probability: number): string {
  const clamped = Math.min(Math.max(probability, 0.01), 0.99);
  if (clamped >= 0.5) {
    const neg = Math.round((clamped / (1 - clamped)) * 100);
    return `−${Math.max(100, neg)}`;
  }
  const pos = Math.round(((1 - clamped) / clamped) * 100);
  return `+${Math.max(100, pos)}`;
}

export interface LoginPreviewPanelProps {
  primaryCard: LandingHeroLeagueCard;
  secondaryCard?: LandingHeroLeagueCard | null;
}

export function LoginPreviewPanel({
  primaryCard,
  secondaryCard = null,
}: LoginPreviewPanelProps): React.JSX.Element {
  const primaryPct = (primaryCard.mostProbable.p * 100).toFixed(1);
  const primaryAmerican =
    primaryCard.mostProbable.fairAmerican ||
    formatFairAmericanFromProb(primaryCard.mostProbable.p);

  const secondaryPct = secondaryCard
    ? (secondaryCard.mostProbable.p * 100).toFixed(1)
    : null;
  const secondaryAmerican = secondaryCard
    ? secondaryCard.mostProbable.fairAmerican ||
      formatFairAmericanFromProb(secondaryCard.mostProbable.p)
    : null;

  return (
    <aside
      className="pl-auth-preview glass-card glass-ring"
      aria-label="Así se ve PitchLab hoy"
    >
      <div className="pl-auth-preview-glow" aria-hidden="true" />

      <div className="pl-auth-preview-inner">
        <p className="pl-auth-eyebrow">Hoy en PitchLab</p>
        <p className="pl-auth-preview-title">
          Lo más probable,
          <br />
          con su momio justo.
        </p>

        <div className="pl-auth-match-card glass-lens glass-ring glass-ring--featured">
          <div className="pl-auth-match-meta">
            <span className="pl-auth-match-league">
              <LeagueBadge league={primaryCard.league} size={16} />
              <span>{primaryCard.roundLabel}</span>
            </span>
            <span className="num">{primaryCard.whenLabel}</span>
          </div>

          <div className="pl-auth-match-teams">
            <div className="pl-auth-team">
              <TeamBadge
                league={primaryCard.league}
                slug={primaryCard.home.slug}
                name={primaryCard.home.name}
                size={32}
                decorative
              />
              <span className="pl-auth-team-name">{primaryCard.home.name}</span>
            </div>
            <span className="pl-auth-vs">vs</span>
            <div className="pl-auth-team pl-auth-team--away">
              <span className="pl-auth-team-name">{primaryCard.away.name}</span>
              <TeamBadge
                league={primaryCard.league}
                slug={primaryCard.away.slug}
                name={primaryCard.away.name}
                size={32}
                decorative
              />
            </div>
          </div>

          <div className="pl-auth-match-rule" aria-hidden="true" />

          <div className="pl-auth-most-row">
            <div className="pl-auth-most-copy">
              <p className="pl-auth-eyebrow pl-auth-eyebrow--ok">
                Lo más probable
              </p>
              <p className="pl-auth-most-label">
                {primaryCard.mostProbable.label}
              </p>
              <p className="pl-auth-most-odds num">
                Momio justo{" "}
                <span className="pl-auth-most-odds-val">{primaryAmerican}</span>
              </p>
            </div>
            <p className="pl-auth-most-pct num">
              {primaryPct}
              <span className="pl-auth-most-pct-unit">%</span>
            </p>
          </div>

          <div className="pl-auth-split">
            <ProbSplit
              probabilities={primaryCard.splitProbabilities}
              labels={primaryCard.splitLabels}
              showLabels
            />
          </div>
        </div>

        {secondaryCard && secondaryPct && secondaryAmerican ? (
          <div className="pl-auth-secondary-card glass-card glass-ring">
            <div className="pl-auth-secondary-badges" aria-hidden="true">
              <TeamBadge
                league={secondaryCard.league}
                slug={secondaryCard.home.slug}
                name={secondaryCard.home.name}
                size={26}
                decorative
              />
              <span className="pl-auth-secondary-badge-overlap">
                <TeamBadge
                  league={secondaryCard.league}
                  slug={secondaryCard.away.slug}
                  name={secondaryCard.away.name}
                  size={26}
                  decorative
                />
              </span>
            </div>
            <div className="pl-auth-secondary-copy">
              <p className="pl-auth-secondary-label">
                {secondaryCard.mostProbable.label}
              </p>
              <p className="pl-auth-secondary-meta">
                {secondaryCard.leagueShort} · momio justo{" "}
                <span className="num">{secondaryAmerican}</span>
              </p>
            </div>
            <p className="pl-auth-secondary-pct num">{secondaryPct} %</p>
          </div>
        ) : null}

        <p className="pl-auth-preview-foot">
          Probabilidades de los motores de PitchLab. Tú comparas con el momio de
          tu casa y decides.
        </p>
      </div>
    </aside>
  );
}
