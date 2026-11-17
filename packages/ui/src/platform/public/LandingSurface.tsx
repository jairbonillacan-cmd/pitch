import React from "react";
import { asLeagueId } from "@pitchlab/contracts";
import { LeagueBadge } from "../../sports";
import type { PlatformDataset } from "../types";
import {
  FeatureShowcaseIsland,
  HeroMatchDemoIsland,
} from "./LandingClientIslands";
import {
  buildFeaturedCommunityPick,
  buildFinishedResultItems,
  buildHeroLeagueCards,
  buildParlayDemoData,
  ClosingCtaSection,
  EnginesSection,
  FaqSection,
  IntegrityHistorySection,
  MultiAngleValidationSection,
  ParlaysAndCommunitySection,
  PricingSection,
  PublicSiteShell,
  type LandingFeaturedCommunityPick,
  type LandingFinishedResultItem,
  type LandingHeroLeagueCard,
  type LandingParlayDemoData,
} from "./PublicSiteSections";

export interface LandingSurfaceProps {
  hasSession?: boolean;
  heroCards?: readonly LandingHeroLeagueCard[];
  recentResults?: readonly LandingFinishedResultItem[];
  parlayDemo?: LandingParlayDemoData;
  featuredPick?: LandingFeaturedCommunityPick;
  dataset?: PlatformDataset;
}

export function LandingSurface({
  hasSession = false,
  heroCards,
  recentResults,
  parlayDemo,
  featuredPick,
  dataset,
}: LandingSurfaceProps = {}): React.JSX.Element {
  const resolvedHeroCards =
    heroCards ??
    (dataset ? buildHeroLeagueCards(dataset.games, dataset.leagues) : []);
  const resolvedResults =
    recentResults ??
    (dataset ? buildFinishedResultItems(dataset.games, 4) : []);
  const resolvedParlayDemo =
    parlayDemo ?? buildParlayDemoData(dataset ? dataset.games : []);
  const resolvedFeaturedPick =
    featuredPick ??
    (dataset
      ? buildFeaturedCommunityPick(dataset.games, dataset.tipsterWeeklyPickId)
      : undefined);

  return (
    <PublicSiteShell activePath="/" hasSession={hasSession}>
      <section id="top" className="pl-lp-hero pl-lp-hero--scout">
        <div className="pl-lp-atmo" aria-hidden="true">
          <div className="pl-lp-orb pl-lp-orb--1" />
          <div className="pl-lp-orb pl-lp-orb--2" />
          <div className="pl-lp-orb pl-lp-orb--3" />
          <div className="pl-lp-hero-sweep" />
        </div>
        <div className="pl-lp-fieldgrid" aria-hidden="true" />

        <div className="pl-lp-wrap pl-lp-hero-grid">
          <div className="pl-lp-hero-copy">
            <div className="pl-lp-hero-badge-pill">
              <span className="pl-lp-live-dot" aria-hidden="true" />
              <span className="num">+100,000 partidos en los motores · 7 ligas activas</span>
            </div>

            <h1 className="pl-lp-h1">
              Lo más probable de cada partido, con su momio justo.
            </h1>

            <p className="pl-lp-lede">
              Ves qué resultado es más probable según los datos, cuánto debería pagar y si el momio de tu casa paga más o menos que eso. Tú decides.
            </p>

            <div className="pl-lp-hero-ctas">
              <a
                className="pl-lp-btn pl-lp-btn-primary pl-lp-hero-primary-btn"
                href={hasSession ? "/app" : "/signup"}
              >
                Probar 7 días gratis{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
              <a className="pl-lp-btn pl-lp-btn-ghost" href="#hoy">
                Ver partidos de hoy
              </a>
            </div>

            <div className="pl-lp-hero-trust-strip">
              <div className="pl-lp-hero-leagues-mini" aria-label="Ligas cubiertas">
                {(["liga-mx", "nfl", "premier-league", "laliga"] as const).map((lg) => (
                  <span key={lg} className="pl-lp-hero-league-dot">
                    <LeagueBadge league={asLeagueId(lg)} size={18} />
                  </span>
                ))}
              </div>
              <p className="pl-lp-fine">
                Sin tarjeta · cancela cuando quieras · solo mayores de 18
              </p>
            </div>
          </div>

          <HeroMatchDemoIsland
            cards={resolvedHeroCards}
            inputId="tu-momio"
            containerId="hoy"
            maxLeagues={4}
          />
        </div>
      </section>

      <MultiAngleValidationSection heroCards={resolvedHeroCards} />
      <FeatureShowcaseIsland
        parlayDemo={resolvedParlayDemo}
        results={resolvedResults}
        heroCard={resolvedHeroCards[0]}
      />
      <EnginesSection variant="teaser" />
      <IntegrityHistorySection results={resolvedResults} variant="teaser" />
      <ParlaysAndCommunitySection
        parlayDemo={resolvedParlayDemo}
        featuredPick={resolvedFeaturedPick}
      />
      <PricingSection variant="teaser" hasSession={hasSession} />
      <FaqSection />
      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}
