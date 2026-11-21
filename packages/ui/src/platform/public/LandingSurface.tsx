import React from "react";
import type { PlatformDataset } from "../types";
import { SPACETIME_ENGINES, SPACETIME_METRICS_HEADLINE } from "../spacetime-catalog";
import { FeatureShowcaseIsland, HeroMatchDemoIsland, PricingCardIsland } from "./LandingClientIslands";
import {
  buildFinishedResultItems,
  buildHeroLeagueCards,
  buildParlayDemoData,
  ClosingCtaSection,
  FaqSection,
  PublicSiteShell,
  type LandingFinishedResultItem,
  type LandingHeroLeagueCard,
  type LandingParlayDemoData,
} from "./PublicSiteSections";

export interface LandingSurfaceProps {
  hasSession?: boolean;
  heroCards?: readonly LandingHeroLeagueCard[];
  recentResults?: readonly LandingFinishedResultItem[];
  parlayDemo?: LandingParlayDemoData;
  dataset?: PlatformDataset;
}

function CalloutArrow({ reverse = false }: { reverse?: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 76 33" width="76" height="33" fill="none" aria-hidden="true" className={reverse ? "pl-clean-arrow pl-clean-arrow--reverse" : "pl-clean-arrow"}>
      <path d="M2 4c23-8 42 2 64 20m-13 0 14 1-3-12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LandingSurface({
  hasSession = false,
  heroCards,
  recentResults,
  parlayDemo,
  dataset,
}: LandingSurfaceProps = {}): React.JSX.Element {
  const cards = heroCards ?? (dataset ? buildHeroLeagueCards(dataset.games, dataset.leagues) : []);
  const results = recentResults ?? (dataset ? buildFinishedResultItems(dataset.games, 4) : []);
  const parlay = parlayDemo ?? buildParlayDemoData(dataset?.games ?? []);

  return (
    <PublicSiteShell activePath="/" hasSession={hasSession} className="pl-lp--clean">
      <section id="top" className="pl-clean-hero" aria-labelledby="pl-clean-title">
        <div className="pl-clean-hero-light" aria-hidden="true">
          <img
            src="/landing/hero-light.webp"
            width={1536}
            height={1024}
            fetchPriority="low"
            decoding="async"
            alt=""
          />
        </div>
        <div className="pl-lp-wrap pl-clean-hero-grid">
          <div className="pl-clean-hero-copy">
            <p className="pl-clean-proof">
              <span className="num">{SPACETIME_METRICS_HEADLINE.historicalMatches}</span> partidos históricos con datos reales
            </p>
            <h1 id="pl-clean-title">Lo más probable de cada partido, con su momio justo.</h1>
            <p className="pl-clean-lede">
              Ves la probabilidad estimada de cada resultado, su momio justo sin margen y si el precio de tu casa paga más o menos. Tú decides.
            </p>
            <div className="pl-clean-hero-actions">
              <a className="pl-lp-btn pl-lp-btn-primary" href={hasSession ? "/app" : "/signup"}>
                {hasSession ? "Ir a la app" : "Probar 7 días gratis"} <span aria-hidden="true">→</span>
              </a>
              <a className="pl-lp-btn pl-clean-secondary" href="#hoy">Comparar momio</a>
            </div>
            <p className="pl-lp-fine">7 días sin tarjeta · No somos casa de apuestas · Solo mayores de 18.</p>
          </div>
          <figure className="pl-clean-hero-device">
            <img
              src="/landing/app-phones.webp"
              width={913}
              height={1000}
              fetchPriority="high"
              decoding="async"
              alt="Inicio de PitchLab y ficha del partido Pumas UNAM contra Rayados de Monterrey"
            />
          </figure>
        </div>
      </section>

      <section id="motores" className="pl-clean-section" aria-labelledby="pl-clean-method">
        <div className="pl-lp-wrap">
          <header className="pl-clean-heading">
            <p className="pl-clean-proof">Partidos históricos en los motores</p>
            <h2 id="pl-clean-method">Cada partido, probado desde cinco ángulos.</h2>
            <p>
              Entrenados con <span className="num">{SPACETIME_METRICS_HEADLINE.historicalMatches}</span> partidos históricos y medidos fuera de muestra en{" "}
              <span className="num">{SPACETIME_METRICS_HEADLINE.holdoutTestMatches}</span> encuentros, sin datos posteriores al inicio.
            </p>
          </header>
          <div className="pl-clean-analysis">
            <div className="pl-clean-callouts pl-clean-callouts--left">
              <p><strong>Cinco motores propios</strong>Fuerza real, mercado sin margen y contexto previo.<CalloutArrow /></p>
              <p><strong>Probabilidad y reparto</strong>Resultado más probable y distribución completa del partido.<CalloutArrow /></p>
            </div>
            <div className="pl-clean-analysis-stage">
              <aside className="pl-clean-engine-sheet" aria-label="Cinco motores propios de PitchLab">
                <ul>{SPACETIME_ENGINES.map((engine) => <li key={engine.key}>{engine.shortName}</li>)}</ul>
              </aside>
              <HeroMatchDemoIsland cards={cards} variant="clean" />
            </div>
            <div className="pl-clean-callouts pl-clean-callouts--right">
              <p><strong>Tu momio contra el justo</strong>Escribe el momio de tu casa y mide la diferencia.<CalloutArrow reverse /></p>
            </div>
          </div>
        </div>
      </section>

      <FeatureShowcaseIsland parlayDemo={parlay} results={results} heroCard={cards[0]} />

      <section id="precio" className="pl-clean-section" aria-labelledby="pl-clean-pricing">
        <div className="pl-lp-wrap pl-clean-pricing">
          <header className="pl-clean-heading">
            <p className="pl-clean-proof">Un solo pase · sin niveles ocultos</p>
            <h2 id="pl-clean-pricing">Elige tu plan.</h2>
            <p>Usa el comparador público gratis o abre todos los partidos, mercados y parlays con el Pase PitchLab Ultra. Precios en MXN con IVA incluido.</p>
          </header>
          <PricingCardIsland layout="compare" hasSession={hasSession} />
        </div>
      </section>

      <FaqSection variant="landing" />
      <ClosingCtaSection variant="banner" hasSession={hasSession} />
    </PublicSiteShell>
  );
}
