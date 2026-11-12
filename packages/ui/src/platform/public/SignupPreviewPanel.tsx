import React from "react";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../sports";
import type { LandingHeroLeagueCard } from "./PublicSiteSections";

/** Momio americano de ejemplo para «Tu momio» en la vista previa de /signup. */
export const SIGNUP_EXAMPLE_HOUSE_AMERICAN = -200;

function americanToImpliedProbability(american: number): number {
  if (american < 0) return -american / (-american + 100);
  return 100 / (american + 100);
}

function formatAmerican(american: number): string {
  return american < 0 ? `−${Math.abs(american)}` : `+${american}`;
}

function fairAmericanFromProbability(probability: number): string {
  const clamped = Math.min(Math.max(probability, 0.01), 0.99);
  if (clamped >= 0.5) {
    return `−${Math.max(100, Math.round((clamped / (1 - clamped)) * 100))}`;
  }
  return `+${Math.max(100, Math.round(((1 - clamped) / clamped) * 100))}`;
}

export interface SignupOddsComparison {
  houseAmerican: string;
  impliedPct: string;
  modelPct: string;
  /** Diferencia en puntos con signo y un decimal, p. ej. «+5.6». */
  diffPts: string;
  diffPositive: boolean;
}

/**
 * Compara la probabilidad del modelo con la implícita de un momio de casa.
 * Diferencia = (p − implícita) × 100, en puntos, con un decimal y signo.
 */
export function compareModelWithHouseOdds(
  probability: number,
  houseAmerican: number = SIGNUP_EXAMPLE_HOUSE_AMERICAN,
): SignupOddsComparison {
  const implied = americanToImpliedProbability(houseAmerican);
  const diff = Math.round((probability - implied) * 1000) / 10;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  return {
    houseAmerican: formatAmerican(houseAmerican),
    impliedPct: (implied * 100).toFixed(1),
    modelPct: (probability * 100).toFixed(1),
    diffPts: `${sign}${Math.abs(diff).toFixed(1)}`,
    diffPositive: diff > 0,
  };
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export interface SignupPreviewMarket {
  label: string;
  p: number;
  fairAmerican: string;
}

/**
 * Mercado de la vista previa: en fútbol, «{favorito} o empate» (doble
 * oportunidad, suma del favorito y el empate); si no hay empate, lo más
 * probable tal cual.
 */
export function selectSignupPreviewMarket(
  card: LandingHeroLeagueCard,
): SignupPreviewMarket {
  const split = card.splitProbabilities;
  if (split.length === 3) {
    const [home = 0, draw = 0, away = 0] = split;
    const favIsHome = home >= away;
    const p = (favIsHome ? home : away) + draw;
    const team = favIsHome ? card.home.name : card.away.name;
    return {
      label: `${team} o empate`,
      p,
      fairAmerican: fairAmericanFromProbability(p),
    };
  }
  return {
    label: card.mostProbable.label,
    p: card.mostProbable.p,
    fairAmerican:
      card.mostProbable.fairAmerican ||
      fairAmericanFromProbability(card.mostProbable.p),
  };
}

/**
 * Momio de casa de ejemplo: −200 cuando el mercado pasa de 60 %; si no, uno
 * cercano al justo (4 pts menos de probabilidad, redondeado a 5).
 */
export function exampleHouseAmerican(probability: number): number {
  if (probability >= 0.6) return SIGNUP_EXAMPLE_HOUSE_AMERICAN;
  const implied = Math.min(Math.max(probability - 0.04, 0.05), 0.95);
  const raw =
    implied >= 0.5
      ? -(implied / (1 - implied)) * 100
      : ((1 - implied) / implied) * 100;
  const rounded = Math.round(raw / 5) * 5;
  if (rounded > -100 && rounded < 100) return rounded < 0 ? -100 : 100;
  return rounded;
}

export interface SignupPreviewPanelProps {
  card: LandingHeroLeagueCard;
}

/** Columna derecha de /signup: «Así se ve un partido». Server Component. */
export function SignupPreviewPanel({
  card,
}: SignupPreviewPanelProps): React.JSX.Element {
  const market = selectSignupPreviewMarket(card);
  const comparison = compareModelWithHouseOdds(
    market.p,
    exampleHouseAmerican(market.p),
  );
  const fairAmerican = market.fairAmerican;

  return (
    <aside
      className="pl-auth-preview glass-card glass-ring"
      aria-label="Así se ve un partido en PitchLab"
    >
      <div className="pl-auth-preview-glow pl-auth-preview-glow--signup" aria-hidden="true" />

      <div className="pl-auth-preview-inner">
        <p className="pl-auth-eyebrow">Así se ve un partido</p>
        <p className="pl-auth-preview-title">
          Compara su momio justo
          <br />
          con el de tu casa.
        </p>

        <div className="pl-auth-match-card glass-lens glass-ring glass-ring--featured">
          <div className="pl-auth-match-meta">
            <span className="pl-auth-match-league">
              <LeagueBadge league={card.league} size={16} />
              <span>{card.roundLabel}</span>
            </span>
            <span className="num">{card.whenLabel}</span>
          </div>

          <div className="pl-auth-match-teams">
            <div className="pl-auth-team">
              <TeamBadge
                league={card.league}
                slug={card.home.slug}
                name={card.home.name}
                size={32}
                decorative
              />
              <span className="pl-auth-team-name">{card.home.name}</span>
            </div>
            <span className="pl-auth-vs">vs</span>
            <div className="pl-auth-team pl-auth-team--away">
              <span className="pl-auth-team-name">{card.away.name}</span>
              <TeamBadge
                league={card.league}
                slug={card.away.slug}
                name={card.away.name}
                size={32}
                decorative
              />
            </div>
          </div>

          <div className="pl-auth-split">
            <ProbSplit
              probabilities={card.splitProbabilities}
              labels={card.splitLabels}
            />
          </div>

          <div className="pl-auth-match-rule" aria-hidden="true" />

          <div className="pl-auth-most-row">
            <div className="pl-auth-most-copy">
              <p className="pl-auth-eyebrow pl-auth-eyebrow--ok">
                Lo más probable
              </p>
              <p className="pl-auth-most-label">{market.label}</p>
            </div>
            <p className="pl-auth-most-pct pl-auth-most-pct--sm num">
              {comparison.modelPct}
              <span className="pl-auth-most-pct-unit">%</span>
            </p>
          </div>

          <div className="pl-auth-odds-grid num">
            <div className="pl-auth-odds-cell glass-card glass-ring">
              <p className="pl-auth-odds-label">Momio justo</p>
              <p className="pl-auth-odds-value">{fairAmerican}</p>
            </div>
            <div className="pl-auth-odds-cell glass-card glass-ring">
              <p className="pl-auth-odds-label">Tu momio</p>
              <p className="pl-auth-odds-value">{comparison.houseAmerican}</p>
            </div>
            <div className="pl-auth-odds-cell glass-card glass-ring">
              <p className="pl-auth-odds-label">Diferencia</p>
              <p
                className={[
                  "pl-auth-odds-value",
                  comparison.diffPositive ? "pl-auth-odds-value--ok" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {comparison.diffPts} pts
              </p>
            </div>
          </div>
          <p className="pl-auth-odds-note num">
            {comparison.houseAmerican} equivale a {comparison.impliedPct} %. El
            modelo ve {comparison.modelPct} %.
          </p>
        </div>

        <ul className="pl-auth-incl">
          <li>
            <CheckIcon />
            Lo más probable de cada partido
          </li>
          <li>
            <CheckIcon />
            Momio justo y «Tu momio» en cada mercado
          </li>
          <li>
            <CheckIcon />
            Parlays sin choques lógicos
          </li>
        </ul>
      </div>
    </aside>
  );
}
