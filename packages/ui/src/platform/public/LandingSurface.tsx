import React from "react";
import type { PlatformDataset } from "../types";
import { HeroMatchDemoIsland } from "./LandingClientIslands";
import {
  buildFeaturedCommunityPick,
  buildFinishedResultItems,
  buildHeroLeagueCards,
  buildParlayDemoData,
  ClosingCtaSection,
  EnginesSection,
  FaqSection,
  HowItWorksSection,
  IntegrityHistorySection,
  ParlaysAndCommunitySection,
  PricingSection,
  PublicSiteShell,
  type LandingFeaturedCommunityPick,
  type LandingFinishedResultItem,
  type LandingHeroLeagueCard,
  type LandingParlayDemoData,
} from "./PublicSiteSections";

export interface LandingSurfaceProps {
  heroCards?: readonly LandingHeroLeagueCard[];
  recentResults?: readonly LandingFinishedResultItem[];
  parlayDemo?: LandingParlayDemoData;
  featuredPick?: LandingFeaturedCommunityPick;
  dataset?: PlatformDataset;
}

export function LandingSurface({
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
      ? buildFeaturedCommunityPick(dataset.games, dataset.tipstarWeeklyPickId)
      : undefined);

  return (
    <PublicSiteShell activePath="/">
      <section id="top" className="pl-lp-hero">
        <div className="pl-lp-atmo" aria-hidden="true">
          <div className="pl-lp-orb pl-lp-orb--1" />
          <div className="pl-lp-orb pl-lp-orb--2" />
          <div className="pl-lp-orb pl-lp-orb--3" />
        </div>
        <div className="pl-lp-fieldgrid" aria-hidden="true" />

        <div className="pl-lp-wrap pl-lp-hero-grid">
          <div className="pl-lp-hero-copy">
            <p className="pl-lp-eyebrow">Liga MX · NFL · Premier · LaLiga</p>
            <h1 className="pl-lp-h1">
              Lo más probable de cada partido, con su momio justo.
            </h1>
            <p className="pl-lp-lede">
              Ves qué resultado es más probable según los datos, cuánto debería pagar y si el momio de tu casa paga más o menos que eso. Tú decides.
            </p>
            <div className="pl-lp-hero-ctas">
              <a className="pl-lp-btn pl-lp-btn-primary" href="/signup">
                Probar 7 días gratis{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
              <a className="pl-lp-btn pl-lp-btn-ghost" href="#hoy">
                Ver partidos de hoy
              </a>
            </div>
            <p className="pl-lp-fine">
              Sin tarjeta · cancela cuando quieras · solo mayores de 18
            </p>
          </div>

          <HeroMatchDemoIsland
            cards={resolvedHeroCards}
            inputId="tu-momio"
            containerId="hoy"
            maxLeagues={4}
          />
        </div>
      </section>

      <HowItWorksSection variant="teaser" />
      <EnginesSection variant="teaser" />
      <IntegrityHistorySection results={resolvedResults} variant="teaser" />
      <ParlaysAndCommunitySection
        parlayDemo={resolvedParlayDemo}
        featuredPick={resolvedFeaturedPick}
      />
      <PricingSection variant="teaser" />
      <FaqSection />
      <ClosingCtaSection />
    </PublicSiteShell>
  );
}
