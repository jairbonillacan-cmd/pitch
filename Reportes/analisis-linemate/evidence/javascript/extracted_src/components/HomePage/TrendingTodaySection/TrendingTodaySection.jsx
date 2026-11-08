import React, { useContext } from "react";
import "./TrendingTodaySection.scss";
import TrendCard from "../TrendCard";
import HomeCheckoutCard from "../HomeCheckoutCard";
import "../ParlaysSection/ParlaysSection.scss";
import EmptyState from "../../EmptyState";
import GlobalContext from "../../GlobalContext";
import CardCarousel from "../../CardCarousel";
import { useTranslation } from "react-i18next";
import { base64Encode, getLineOutcomeFromCard } from "../../../linemate-react-common/src/util";
import { CROSS_GAME_PARLAY } from "../../../linemate-react-common/src/constants";

function TrendingTodayCarouselCard({ element }) {
  return (
    <HomeCheckoutCard trend={element.trend}>
      {(preferredProviders) => (
        <div className="parlays-list-item" onClick={element.onClick}>
          <TrendCard
            card={element.trend}
            league={element.league}
            parlay
            preferredProviders={preferredProviders}
          />
        </div>
      )}
    </HomeCheckoutCard>
  );
}

export function TrendingTodaySection({ crossGameParlays = {}, league }) {
  const context = useContext(GlobalContext);
  const { t } = useTranslation();
  const TITLE = t("home.sections.trendingParlays");
  const providers = context.resolvedPreferredProviders || [];
  const checkoutProviders = providers.filter((provider) =>
    (context.betslipProviders || []).includes(provider)
  );
  const signalCount = (parlay) =>
    (parlay.signals || []).filter((signal) => signal.summary).length;

  const uniqueParlays = Array.from(new Map(
    Object.values(crossGameParlays).flat().map((parlay) => [parlay.id, parlay])
  ).values());

  const parlays = uniqueParlays.map((parlay) => {
    let bestDecimalOdds = 0;
    let hasCheckout = false;
    for (const provider of providers) {
      if (!parlay.legs?.length) continue;
      const odds = parlay.legs.reduce((total, leg) => {
        if (total === null) return null;
        const decimal = getLineOutcomeFromCard(leg, [provider])?.odds?.decimal;
        return Number.isFinite(decimal) && decimal > 0 ? total * decimal : null;
      }, 1);
      if (odds === null) continue;
      bestDecimalOdds = Math.max(bestDecimalOdds, odds);
      if (checkoutProviders.includes(provider)) hasCheckout = true;
    }
    return { parlay, bestDecimalOdds, hasCheckout };
  }).filter(({ bestDecimalOdds }) => bestDecimalOdds > 0)
    .sort((a, b) =>
      Number(b.hasCheckout) - Number(a.hasCheckout)
      || signalCount(b.parlay) - signalCount(a.parlay)
      || b.bestDecimalOdds - a.bestDecimalOdds
    ).slice(0, 3).map(({ parlay }) => parlay);

  function openParlay(parlay) {
    const storageKey = "home-trending-parlays";
    sessionStorage.setItem(storageKey, JSON.stringify([
      parlay, ...parlays.filter((item) => item !== parlay)
    ]));
    const params = new URLSearchParams({
      feed: base64Encode(JSON.stringify({
        title: TITLE, importedTrendsKey: storageKey, includeFilters: false
      })),
      tabs: JSON.stringify(["crossGameParlay"]),
      tab: "crossGameParlay"
    });
    window.location.assign(`/${league}/trends?${params}`);
  }

  const header = (
    <div className="trending-today-title-copy">
      <span className="text-style-h-3-semibold color-fig-default">{TITLE}</span>
    </div>
  );

  return (
    <div className="trending-today-section-padding">
      {parlays.length === 0 ? (
        <>
          <div className="trending-today-title-container">{header}</div>
          <div className="trending-today-empty-state-container">
            <EmptyState className="trending-today-empty-state" text={t("home.empty.trend")} />
          </div>
        </>
      ) : (
        <CardCarousel
          listOfElements={parlays.map((trend) => ({
            trend, league, onClick: () => openParlay(trend)
          }))}
          elementsPerView={3}
          spaceBetweenSlides={16}
          title=""
          CardComponent={TrendingTodayCarouselCard}
          showHeader
          mobileOnlyControls
          headerContent={header}
        />
      )}
    </div>
  );
}