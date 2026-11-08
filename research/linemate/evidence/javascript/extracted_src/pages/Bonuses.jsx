import React, { useContext, useEffect, useMemo, useState } from 'react';

import Button from '../components/Button';
import GlobalContext from '../components/GlobalContext';
import InputSelection from '../components/InputSelection';
import { SPORTSBOOKS_CONFIG } from '../linemate-react-common/src/constants';

import './Bonuses.scss';
import '../components/App.scss';
import { getTheme } from '../react-web-utils';

const DEFAULT_REGION = 'US-CA';

const SIGNUP_OFFER_TYPES = new Set([
  'SPORTSBOOK_SIGNUP',
  'FANTASY_SIGNUP',
  'PREDICTION_SIGNUP',
  'SWEEPSTAKES_SIGNUP',
  'CASINO_SIGNUP',
]);

const PROMO_OFFER_TYPES = new Set([
  'FANTASY_FREE_PICK',
  'BOOST',
]);

const DISPLAY_OFFER_TYPES = new Set([
  ...SIGNUP_OFFER_TYPES,
  ...PROMO_OFFER_TYPES,
]);

const OPERATOR_TYPE_LABELS = {
  betr: 'DFS',
  betrpicks: 'DFS',
  chalkboard: 'DFS',
  dabble: 'DFS',
  fanduelpicks: 'DFS',
  prizepicks: 'DFS',
  sleeper: 'DFS',
  underdog: 'DFS',
  kalshi: 'Predictions',
  novig: 'Predictions',
  polymarket: 'Predictions',
  prophetx: 'Predictions',
  fliff: 'Social sportsbook',
  onyxodds: 'Social sportsbook',
  rebet: 'Social sportsbook',
  thrillzz: 'Social sportsbook',
};

const OFFER_TYPE_OPTIONS = {
  SPORTSBOOK_SIGNUP: 'Sportsbooks',
  FANTASY_SIGNUP: 'DFS',
  PREDICTION_SIGNUP: 'Predictions',
  FANTASY_FREE_PICK: 'Daily picks',
  BOOST: 'Boosts',
  SWEEPSTAKES_SIGNUP: 'Social sportsbooks',
  CASINO_SIGNUP: 'Real money casino',
};

const DEFAULT_CATEGORY = 'sports-betting';

const OFFER_CATEGORY_CONFIG = {
  'sports-betting': {
    title: 'Sports Betting',
    body: 'Compare today\'s offers from regulated sportsbooks available in your region. Filter welcome bonuses, odds boosts, profit boosts, player prop promotions, and more - all in one place.',
    offerTypes: ['SPORTSBOOK_SIGNUP', 'FANTASY_SIGNUP', 'FANTASY_FREE_PICK', 'BOOST', 'SWEEPSTAKES_SIGNUP'],
  },
  'prediction-markets': {
    title: 'Prediction Markets',
    body: 'Prediction market platforms allow eligible users to trade on the outcome of sports and other real-world events, where available. Compare participating platforms and current offers available in your region.',
    offerTypes: ['PREDICTION_SIGNUP'],
  },
  casino: {
    title: 'Casino',
    body: 'Explore offers from our trusted casino partners. Compare welcome bonuses, free spins, cashback offers, and ongoing promotions available in your region.',
    offerTypes: ['CASINO_SIGNUP'],
  },
};

const REGION_GROUP_LABELS = {
  US: 'United States',
  CA: 'Canada',
};

const TYPE_LABELS = {
  SPORTSBOOK_SIGNUP: ['Sportsbook', 'Signup offer'],
  FANTASY_SIGNUP: ['DFS', 'Signup offer'],
  PREDICTION_SIGNUP: ['Predictions', 'Signup offer'],
  SWEEPSTAKES_SIGNUP: ['Social sportsbook', 'Signup offer'],
  CASINO_SIGNUP: ['Casino', 'Signup offer'],
};

function getDisplayName(sportsbookId) {
  return SPORTSBOOKS_CONFIG?.[sportsbookId]?.displayName || sportsbookId;
}

function getFallbackOperatorTypeLabel(sportsbookId) {
  return OPERATOR_TYPE_LABELS[sportsbookId] || 'Sportsbook';
}

function getOperatorTypeLabel(sportsbookId, offers) {
  const signupOffer = offers.find((offer) => SIGNUP_OFFER_TYPES.has(offer.type));

  return TYPE_LABELS[signupOffer?.type]?.[0] || getFallbackOperatorTypeLabel(sportsbookId);
}

function getOfferTags(offer) {
  if (offer.type === 'FANTASY_FREE_PICK') {
    return [offer.operatorTypeLabel || getFallbackOperatorTypeLabel(offer.sportsbookId), 'Free pick'];
  }

  if (offer.type === 'BOOST') {
    return [offer.operatorTypeLabel || getFallbackOperatorTypeLabel(offer.sportsbookId), 'Free Boost'];
  }

  return TYPE_LABELS[offer.type] || [offer.type, 'Offer'];
}

function getOfferDisplayTitle(offer) {
  if (PROMO_OFFER_TYPES.has(offer.type)) {
    return offer.details || offer.title;
  }

  return offer.title;
}

function getOfferLegalDetails(offer) {
  if (PROMO_OFFER_TYPES.has(offer.type)) {
    return offer.signupOfferDetails;
  }

  return offer.details;
}

function getOfferLink(offer) {
  if (PROMO_OFFER_TYPES.has(offer.type)) {
    return offer.signupOfferLink || offer.link;
  }

  return offer.link;
}

function formatSentenceCase(text) {
  if (!text) {
    return text;
  }

  return `${text.slice(0, 1).toUpperCase()}${text.slice(1).toLowerCase()}`;
}

function getOfferActionText(offer) {
  if (PROMO_OFFER_TYPES.has(offer.type)) {
    return 'Claim offer';
  }

  return formatSentenceCase(offer.actionText || 'Bet now');
}

function getCategoryFromSearch(search) {
  const category = new URLSearchParams(search).get('category');

  if (OFFER_CATEGORY_CONFIG[category]) {
    return category;
  }

  return DEFAULT_CATEGORY;
}

function normalizeSearchWithCategory(category) {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.set('category', category);
  return searchParams.toString();
}

function getCategoryTypeOptions(category) {
  return OFFER_CATEGORY_CONFIG[category].offerTypes.reduce((options, offerType) => {
    options[offerType] = OFFER_TYPE_OPTIONS[offerType];
    return options;
  }, {});
}

function getDefaultOfferType(category) {
  return OFFER_CATEGORY_CONFIG[category].offerTypes[0];
}

function normalizeRegionOptions(configuration) {
  const affiliateOffers = configuration?.affiliateOffers || {};
  const locationSelection = configuration?.localizedFeatures?.locationSelection || {};
  const options = {};

  Object.keys(locationSelection).forEach((countryCode) => {
    locationSelection[countryCode].forEach((region) => {
      const regionCode = `${countryCode}-${region.code}`;
      if (affiliateOffers[regionCode]) {
        options[regionCode] = region.name;
      }
    });
  });

  return options;
}

function normalizeRegionOptionGroups(configuration) {
  const affiliateOffers = configuration?.affiliateOffers || {};
  const locationSelection = configuration?.localizedFeatures?.locationSelection || {};
  const countryCodes = [
    ...Object.keys(REGION_GROUP_LABELS).filter((countryCode) => locationSelection[countryCode]),
    ...Object.keys(locationSelection).filter((countryCode) => !REGION_GROUP_LABELS[countryCode]),
  ];

  return countryCodes
    .map((countryCode) => {
      const options = {};

      locationSelection[countryCode].forEach((region) => {
        const regionCode = `${countryCode}-${region.code}`;
        if (affiliateOffers[regionCode]) {
          options[regionCode] = region.name;
        }
      });

      return {
        label: REGION_GROUP_LABELS[countryCode] || countryCode,
        options,
      };
    })
    .filter((group) => Object.keys(group.options).length > 0);
}

function getInitialRegion(configuration, location) {
  const affiliateOffers = configuration?.affiliateOffers || {};
  const locationRegion = location?.region?.code;

  if (locationRegion && affiliateOffers[locationRegion]) {
    return locationRegion;
  }

  if (affiliateOffers[DEFAULT_REGION]) {
    return DEFAULT_REGION;
  }

  return Object.keys(affiliateOffers)[0] || DEFAULT_REGION;
}

function normalizeOffers(configuration, selectedRegion, selectedType, allowedOfferTypes) {
  const regionOffers = configuration?.affiliateOffers?.[selectedRegion] || {};
  const affiliateOrder = configuration?.affiliateOrder || [];
  const allowedOfferTypeLookup = new Set(allowedOfferTypes);
  const orderLookup = affiliateOrder.reduce((lookup, sportsbookId, index) => {
    lookup[sportsbookId] = index;
    return lookup;
  }, {});

  return Object.keys(regionOffers)
    .flatMap((sportsbookId, sportsbookIndex) => {
      const offers = regionOffers[sportsbookId] || [];
      const operatorTypeLabel = getOperatorTypeLabel(sportsbookId, offers);
      const signupOffer = offers.find((offer) => SIGNUP_OFFER_TYPES.has(offer.type));

      return offers.map((offer, offerIndex) => ({
        ...offer,
        id: `${sportsbookId}-${offer.type || 'offer'}-${offerIndex}`,
        operatorTypeLabel,
        sportsbookId,
        sportsbookIndex,
        signupOfferDetails: signupOffer?.details,
        signupOfferLink: signupOffer?.link,
        offerIndex,
      }));
    })
    .filter((offer) => allowedOfferTypeLookup.has(offer.type) && offer.type === selectedType)
    .sort((a, b) => {
      const aOrder = orderLookup[a.sportsbookId] ?? Number.MAX_SAFE_INTEGER;
      const bOrder = orderLookup[b.sportsbookId] ?? Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      if (a.sportsbookIndex !== b.sportsbookIndex) {
        return a.sportsbookIndex - b.sportsbookIndex;
      }
      return a.offerIndex - b.offerIndex;
    });
}

function LogoImage({ className, fallbackClassName, src, alt, fallbackText }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
  }, [src]);

  if (hidden) {
    if (!fallbackText) {
      return null;
    }

    return (
      <p className={fallbackClassName}>
        {fallbackText}
      </p>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      onError={() => setHidden(true)}
    />
  );
}

function OfferBlockCard({ offer }) {
  const sportsbookConfig = SPORTSBOOKS_CONFIG?.[offer.sportsbookId] || {};
  const displayName = getDisplayName(offer.sportsbookId);
  const ctaText = getOfferActionText(offer);
  const offerLink = getOfferLink(offer);
  const typeLabels = getOfferTags(offer);
  const legalDetails = getOfferLegalDetails(offer);
  const gradientColors = sportsbookConfig.gradientColors[getTheme()]
  var updatedGradientColor = 'var(--color-primary-bg)'
  if (gradientColors && gradientColors.length > 0) {
    const gradientColor = gradientColors[0]
    const gradientColorParts = gradientColor.replace('rgba(', '').replace(')', '').split(',')
    updatedGradientColor = `rgba(${gradientColorParts[0]}, ${gradientColorParts[1]}, ${gradientColorParts[2]}, 1)`
  }

  return (
    <article className="bonuses-block-card">
      <div className="bonuses-block-card-logo-panel" style={{ backgroundColor: updatedGradientColor }}>
        <LogoImage
          className="bonuses-block-card-logo"
          fallbackClassName="bonuses-logo-fallback text-style-h-4-semibold color-fig-on-bg"
          src={`/assets/sportsbook-wordmarks/${getTheme()}/${offer.sportsbookId}.svg`}
          alt={displayName}
          fallbackText={displayName}
        />
      </div>
      <div className="bonuses-block-card-content">
        <div className="bonuses-block-card-summary">
          <p className="bonuses-offer-type text-style-caption-medium color-fig-subtle">
            {typeLabels.join(' · ')}
          </p>
          <h2 className="bonuses-offer-title text-style-label-semibold color-fig-default">
            {getOfferDisplayTitle(offer)}
          </h2>
        </div>
        <div className="bonuses-cta-stack bonuses-block-card-action">
          <Button
            text={ctaText}
            typography="lg"
            type="secondary"
            enabled={Boolean(offerLink)}
            href={offerLink}
          />
          {legalDetails && (
            <p className="bonuses-terms-note text-style-caption-normal color-fig-disabled">
              {legalDetails}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function PromoOfferBlockCard({ offer }) {
  const sportsbookConfig = SPORTSBOOKS_CONFIG?.[offer.sportsbookId] || {};
  const displayName = getDisplayName(offer.sportsbookId);
  const ctaText = getOfferActionText(offer);
  const offerLink = getOfferLink(offer);
  const offerImage = offer.images?.square?.url;
  const typeLabels = getOfferTags(offer);
  const legalDetails = getOfferLegalDetails(offer);
  const gradientColors = sportsbookConfig.gradientColors[getTheme()]
  var updatedGradientColor = 'var(--color-primary-bg)'
  if (gradientColors && gradientColors.length > 0) {
    const gradientColor = gradientColors[0]
    const gradientColorParts = gradientColor.replace('rgba(', '').replace(')', '').split(',')
    updatedGradientColor = `rgba(${gradientColorParts[0]}, ${gradientColorParts[1]}, ${gradientColorParts[2]}, 1)`
  }

  return (
    <article className="bonuses-block-card bonuses-promo-block-card">
      <div className="bonuses-promo-block-image-panel" style={{ backgroundColor: updatedGradientColor }}>
        <div className="bonuses-promo-block-operator-logo">
          <LogoImage
            className="bonuses-promo-block-operator-logo-image"
            src={`/assets/sportsbooks/${offer.sportsbookId}.svg`}
            alt={displayName}
          />
        </div>
        {offerImage && (
          <img
            className="bonuses-promo-block-offer-image"
            src={offerImage}
            alt=""
          />
        )}
      </div>
      <div className="bonuses-block-card-content bonuses-promo-block-card-content">
        <div className="bonuses-block-card-summary">
          <p className="bonuses-offer-type text-style-caption-medium color-fig-subtle">
            {typeLabels.join(' · ')}
          </p>
          <p className="bonuses-promo-block-operator text-style-body-medium color-fig-default">
            {displayName}
          </p>
          <h2 className="bonuses-offer-title text-style-label-semibold color-fig-default">
            {getOfferDisplayTitle(offer)}
          </h2>
        </div>
        <div className="bonuses-cta-stack bonuses-block-card-action">
          <Button
            text={ctaText}
            typography="lg"
            type="secondary"
            enabled={Boolean(offerLink)}
            href={offerLink}
          />
          {legalDetails && (
            <p className="bonuses-terms-note text-style-caption-normal color-fig-disabled">
              {legalDetails}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function OfferRow({ offer }) {
  const displayName = getDisplayName(offer.sportsbookId);
  const typeLabels = getOfferTags(offer);
  const ctaText = getOfferActionText(offer);
  const offerLink = getOfferLink(offer);
  const legalDetails = getOfferLegalDetails(offer);

  return (
    <article className="bonuses-row">
      <div className="bonuses-row-content">
        <div className="bonuses-row-logo-cell">
          <LogoImage
            className="bonuses-row-logo"
            src={`/assets/sportsbooks/${offer.sportsbookId}.svg`}
            alt={displayName}
          />
        </div>
        <div className="bonuses-row-body">
          <div className="bonuses-row-header">
            <p className="bonuses-row-operator text-style-body-medium color-fig-default">
              {displayName}
            </p>
            <div className="bonuses-row-tags">
              <p className="text-style-caption-uppercase-medium color-fig-subtle">{typeLabels[0]}</p>
              <p className="text-style-caption-uppercase-medium color-fig-subtle">•</p>
              <p className="text-style-caption-uppercase-medium color-fig-subtle">{typeLabels[1]}</p>
            </div>
          </div>
          <p className="bonuses-row-title text-style-body-semibold color-fig-default">
            {getOfferDisplayTitle(offer)}
          </p>
        </div>
        <div className="bonuses-row-action">
          <Button
            text={ctaText}
            typography="sm"
            type="secondary"
            enabled={Boolean(offerLink)}
            href={offerLink}
          />
        </div>
      </div>
      {legalDetails && (
        <div className="bonuses-row-legal">
          <p className="bonuses-terms-note text-style-caption-normal color-fig-disabled">
            {legalDetails}
          </p>
        </div>
      )}
    </article>
  );
}

function PromoOfferRow({ offer }) {
  const displayName = getDisplayName(offer.sportsbookId);
  const typeLabels = getOfferTags(offer);
  const ctaText = getOfferActionText(offer);
  const offerLink = getOfferLink(offer);
  const legalDetails = getOfferLegalDetails(offer);

  return (
    <article className="bonuses-row bonuses-promo-row">
      <div className="bonuses-row-content">
        <div className="bonuses-row-logo-cell">
          <LogoImage
            className="bonuses-row-logo"
            src={`/assets/sportsbooks/${offer.sportsbookId}.svg`}
            alt={displayName}
          />
        </div>
        <div className="bonuses-row-body">
          <div className="bonuses-row-header">
            <p className="bonuses-row-operator text-style-body-medium color-fig-default">
              {displayName}
            </p>
            <div className="bonuses-row-tags">
              <p className="text-style-caption-uppercase-medium color-fig-subtle">{typeLabels[0]}</p>
              <p className="text-style-caption-uppercase-medium color-fig-subtle">•</p>
              <p className="text-style-caption-uppercase-medium color-fig-subtle">{typeLabels[1]}</p>
            </div>
          </div>
          <p className="bonuses-row-title bonuses-promo-row-title text-style-body-semibold color-fig-default">
            {getOfferDisplayTitle(offer)}
          </p>
        </div>
        <div className="bonuses-row-action bonuses-promo-row-action">
          <Button
            text={ctaText}
            typography="sm"
            type="secondary"
            enabled={Boolean(offerLink)}
            href={offerLink}
          />
        </div>
      </div>
      {legalDetails && (
        <div className="bonuses-row-legal">
          <p className="bonuses-terms-note text-style-caption-normal color-fig-disabled">
            {legalDetails}
          </p>
        </div>
      )}
    </article>
  );
}

function Bonuses() {
  const context = useContext(GlobalContext);
  const configuration = useMemo(() => context.configuration || {}, [context.configuration]);
  const activeCategory = useMemo(() => getCategoryFromSearch(window.location.search), []);
  const allowedOfferTypes = OFFER_CATEGORY_CONFIG[activeCategory].offerTypes;
  const showTypeFilter = activeCategory !== 'prediction-markets';
  const typeOptions = useMemo(() => getCategoryTypeOptions(activeCategory), [activeCategory]);
  const regionOptions = useMemo(() => normalizeRegionOptions(configuration), [configuration]);
  const regionOptionGroups = useMemo(() => normalizeRegionOptionGroups(configuration), [configuration]);
  const fallbackRegion = useMemo(
    () => getInitialRegion(configuration, context.location),
    [configuration, context.location]
  );
  const [selectedRegion, setSelectedRegion] = useState(fallbackRegion);
  const [selectedType, setSelectedType] = useState(getDefaultOfferType(activeCategory));

  useEffect(() => {
    if (!OFFER_CATEGORY_CONFIG[new URLSearchParams(window.location.search).get('category')]) {
      window.location.replace(`/bonuses?${normalizeSearchWithCategory(activeCategory)}`);
    }
  }, [activeCategory]);

  useEffect(() => {
    if (!regionOptions[selectedRegion]) {
      setSelectedRegion(fallbackRegion);
    }
  }, [fallbackRegion, regionOptions, selectedRegion]);

  useEffect(() => {
    if (!allowedOfferTypes.includes(selectedType)) {
      setSelectedType(getDefaultOfferType(activeCategory));
    }
  }, [activeCategory, allowedOfferTypes, selectedType]);

  const filteredOffers = useMemo(
    () => normalizeOffers(configuration, selectedRegion, selectedType, allowedOfferTypes),
    [allowedOfferTypes, configuration, selectedRegion, selectedType]
  );

  const displayOffers = filteredOffers.filter((offer) => DISPLAY_OFFER_TYPES.has(offer.type));
  const promoDisplayOffers = displayOffers.filter((offer) => PROMO_OFFER_TYPES.has(offer.type));
  const linkableSignupOffers = displayOffers.filter((offer) => (
    getOfferLink(offer) && SIGNUP_OFFER_TYPES.has(offer.type)
  ));
  const blockOffers = [
    ...promoDisplayOffers,
    ...linkableSignupOffers,
  ].slice(0, 6);
  const blockOfferIds = new Set(blockOffers.map((offer) => offer.id));
  const baseRowOffers = filteredOffers.filter((offer) => (
    DISPLAY_OFFER_TYPES.has(offer.type) && !blockOfferIds.has(offer.id)
  ));
  const rowOffers = baseRowOffers;
  const displayedOffers = [...blockOffers, ...rowOffers];

  return (
    <main className="bonuses-page">
      <section className="bonuses-container">
        <div className="bonuses-hero">
          <h1 className="text-style-h-2-semibold color-fig-default">{OFFER_CATEGORY_CONFIG[activeCategory].title}</h1>
          <img
            className="bonuses-hero-image"
            src={`/assets/bonuses/img-bonuses-${getTheme()}.png`}
            alt="Rankings preview"
          />
          <p className="bonuses-hero-copy text-style-body-medium color-fig-subtle">
            {OFFER_CATEGORY_CONFIG[activeCategory].body}
          </p>
        </div>

        <section className="bonuses-offers-section">
          <div className="bonuses-section-header">
            <h2 className="text-style-h-4-semibold color-fig-default">Offers</h2>
            <div className="bonuses-filters">
              <div className="bonuses-filter">
                <p className="text-style-label-medium color-fig-default">Region</p>
                <InputSelection
                  enabled={Object.keys(regionOptions).length > 0}
                  type="single"
                  typography="sm"
                  options={regionOptions}
                  optionGroups={regionOptionGroups}
                  selection={selectedRegion}
                  selectionHandler={setSelectedRegion}
                />
              </div>
              {showTypeFilter && (
                <div className="bonuses-filter">
                  <p className="text-style-label-medium color-fig-default">Type</p>
                  <InputSelection
                    enabled
                    type="single"
                    typography="sm"
                    options={typeOptions}
                    selection={selectedType}
                    selectionHandler={setSelectedType}
                  />
                </div>
              )}
            </div>
          </div>

          {displayedOffers.length === 0 && (
            <div className="bonuses-empty-state">
              <p className="text-style-label-semibold color-fig-default">No offers available</p>
              <p className="text-style-body-medium color-fig-subtle">
                Try a signup offer type or a different region to see more bonuses.
              </p>
            </div>
          )}

          {blockOffers.length > 0 && (
            <div className="bonuses-block-grid">
              {blockOffers.map((offer) => (
                PROMO_OFFER_TYPES.has(offer.type) ? (
                  <PromoOfferBlockCard
                    key={offer.id}
                    offer={offer}
                  />
                ) : (
                  <OfferBlockCard
                    key={offer.id}
                    offer={offer}
                  />
                )
              ))}
            </div>
          )}

          {rowOffers.length > 0 && (
            <div className="bonuses-row-list">
              {rowOffers.map((offer) => (
                PROMO_OFFER_TYPES.has(offer.type) ? (
                  <PromoOfferRow
                    key={offer.id}
                    offer={offer}
                  />
                ) : (
                  <OfferRow
                    key={offer.id}
                    offer={offer}
                  />
                )
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default Bonuses;
