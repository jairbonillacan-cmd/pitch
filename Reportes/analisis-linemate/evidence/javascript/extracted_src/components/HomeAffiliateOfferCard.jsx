import React, { useContext, useEffect, useState } from "react";

import "./HomeAffiliateOfferCard.scss";
import "./BonusCard.scss";

import GlobalContext from "./GlobalContext";
import OfferPopup from "./OfferPopup";

import { SPORTSBOOKS_CONFIG } from "../linemate-react-common/src/constants";
import { getTheme } from "../react-web-utils";
import { isPaidUser } from "../linemate-react-common/src/util";
import { logCustomEvent, trackAdImpression } from "../analytics";
import useImpressionTracker from "../hooks/useImpressionTracker";

function HomeAffiliateOfferCard({ element }) {
  const [openModalPopup, setOpenModalPopup] = useState(false);
  const [theme, setTheme] = useState(getTheme());
  const context = useContext(GlobalContext);
  const analyticsContext = {
    amplitudeInstance: context.amplitudeInstance,
    userAttributes: context.userAttributes,
    league: context.league,
  };

  useEffect(() => {
    const handler = (event) => {
      setTheme(event.detail.theme);
    };

    window.addEventListener("themeChange", handler);
    return () => window.removeEventListener("themeChange", handler);
  }, []);

  const operatorId = (element?.operator || "").toLowerCase();
  const operatorConfig = SPORTSBOOKS_CONFIG?.[operatorId];
  const operatorName = operatorConfig?.displayName || "";
  const offer = element?.offers?.[0];
  const squareImageUrl = offer?.images?.square?.url;
  const popupElement = {
    ...element,
    offers: element?.popupOffers || element?.offers || [],
  };
  const impressionRef = useImpressionTracker({
    enabled: Boolean(context.amplitudeInstance),
    resetKey: element?.impressionKey,
    onImpression: () => {
      trackAdImpression(analyticsContext, {
        operator: operatorId,
        affiliate: operatorName,
        source: "home_offers_section",
        additionalProperties: {
          isPaidUser: isPaidUser(context.userAttributes),
        },
      });
    },
  });

  if (!operatorConfig || !offer || !squareImageUrl) {
    return null;
  }

  const titleColor = operatorConfig.accentTextColor;
  const titleBackgroundColor =
    operatorConfig.accentBackgroundColor || operatorConfig.backgroundColor;

  return (
    <>
      <div
        ref={impressionRef}
        className="home-affiliate-offer-card"
        onClick={() => {
          logCustomEvent(analyticsContext, "home_daily_offer_click", {
            affiliate: operatorName,
          });
          setOpenModalPopup(true);
        }}
      >
        <div className="home-affiliate-offer-card-left">
          <img
            className="home-affiliate-offer-card-logomark"
            src={`assets/sportsbook-wordmarks/${theme}/${operatorId}.svg`}
            alt={operatorName}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = `assets/sportsbook-logos/${operatorId}.png`;
            }}
          />

          <div className="home-affiliate-offer-card-copy">
            {offer?.title && (
              <div
                className="home-affiliate-offer-card-badge text-style-caption-uppercase-extrabold"
                style={{
                  color: titleColor,
                  backgroundColor: titleBackgroundColor,
                  padding: '2px 4px',
                }}
              >
                {offer.title}
              </div>
            )}

            {(offer?.details || offer?.actionText) && (
              <p
                className="home-affiliate-offer-card-details text-style-caption-uppercase-extrabold color-fig-default"
              >
                {offer.details || offer.actionText}
              </p>
            )}
          </div>
        </div>

        <div className="home-affiliate-offer-card-right">
          <div
            className="home-affiliate-offer-card-image-blur"
            style={{ backgroundImage: `url(${squareImageUrl})` }}
          />
          <img
            className="home-affiliate-offer-card-image"
            src={squareImageUrl}
            alt={offer.title || operatorName}
          />
        </div>
      </div>

      <OfferPopup
        element={popupElement}
        openModalPopup={openModalPopup}
        setOpenModalPopup={setOpenModalPopup}
        source="home_bonus_section"
      />
    </>
  );
}

export default HomeAffiliateOfferCard;
