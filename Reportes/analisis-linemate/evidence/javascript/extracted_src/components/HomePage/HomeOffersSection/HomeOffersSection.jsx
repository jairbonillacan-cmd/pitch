import React, { useEffect, useMemo, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import "./HomeOffersSection.scss";

import CardCarousel from "../../CardCarousel";
import EmptyState from "../../EmptyState";
import HomeAffiliateOfferCard from "../../HomeAffiliateOfferCard";
import InputSelection from "../../InputSelection";
import GlobalContext from "../../GlobalContext";

import { buildNonSignupOfferSections } from "../../../react-web-utils";
import { getOffersAffiliateTitle } from "../../../linemate-react-common/src/util";

export function HomeOffersSection({ offersByOperator, rawAffiliates }) {
  const context = useContext(GlobalContext);
  const { t } = useTranslation();

  const offerSections = useMemo(
    () => buildNonSignupOfferSections(offersByOperator || {}, [], t),
    [offersByOperator, t]
  );

  const availableOfferSections = useMemo(
    () => offerSections.filter((section) => (section.entries || []).length > 0),
    [offerSections]
  );

  const [selectedType, setSelectedType] = useState(
    availableOfferSections[0]?.type || ""
  );

  useEffect(() => {
    const nextTypes = availableOfferSections.map((section) => section.type);

    if (nextTypes.length === 0) {
      setSelectedType("");
      return;
    }

    if (!selectedType || !nextTypes.includes(selectedType)) {
      setSelectedType(nextTypes[0]);
    }
  }, [availableOfferSections, selectedType]);

  const selectedSection =
    availableOfferSections.find((section) => section.type === selectedType) || null;

  const dropdownOptions = Object.fromEntries(
    availableOfferSections.map((section) => [section.type, section.title])
  );

  if (availableOfferSections.length === 0 || !selectedSection) {
    return null;
  }

  return (
    <div className="home-offers-section-padding">
      <CardCarousel
        listOfElements={selectedSection.entries.map((entry, index) => ({
          ...entry,
          popupOffers: rawAffiliates?.[entry.operator] || entry.offers,
          impressionKey: `${selectedType}:${index}:${entry.operator}`,
        }))}
        elementsPerView={3}
        spaceBetweenSlides={16}
        title=""
        CardComponent={HomeAffiliateOfferCard}
        showHeader={true}
        headerContent={
          <div className="home-offers-title-row">
            <p className="text-style-h-3-semibold home-page-title-text-desktop">
              {getOffersAffiliateTitle(context.location.region.code, context.location.country.code, t)}
            </p>
            <p className="text-style-h-3-semibold home-page-title-text-mobile">
              {getOffersAffiliateTitle(context.location.region.code, context.location.country.code, t)}
            </p>

            <div className="home-offers-dropdown-wrapper">
              <InputSelection
                enabled={true}
                type="single"
                typography="sm"
                selection={selectedType}
                options={dropdownOptions}
                selectionHandler={setSelectedType}
              />
            </div>
          </div>
        }
      />
    </div>
  );
}
