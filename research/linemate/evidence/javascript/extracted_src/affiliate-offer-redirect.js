import { useContext, useEffect, useMemo } from 'react';

import GlobalContext from './components/GlobalContext';
import Loader from './components/Loader';

const LOCATION_CODE_PATTERN = /^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/;
const REGION_LOCATION_CODE_PATTERN = /^[A-Za-z]{2}-[A-Za-z]{2}$/;
const DEFAULT_OFFER_TYPE = 'SPORTSBOOK_SIGNUP';

function normalizeLocationCode(locationCode) {
  const normalizedLocationCode = locationCode?.trim().toUpperCase();
  return LOCATION_CODE_PATTERN.test(normalizedLocationCode) ? normalizedLocationCode : null;
}

function normalizeOperatorId(operatorId) {
  const normalizedOperatorId = operatorId?.trim();
  return normalizedOperatorId ? normalizedOperatorId.toLowerCase() : null;
}

function normalizeOfferType(offerType) {
  return offerType?.trim().toUpperCase() || DEFAULT_OFFER_TYPE;
}

function getKeyIgnoringCase(object, expectedKey) {
  return Object.keys(object || {}).find((key) => key.toLowerCase() === expectedKey.toLowerCase());
}

function getAffiliateOffersForLocation(affiliateOffers, locationCode) {
  const locationKey = getKeyIgnoringCase(affiliateOffers, locationCode);
  if (locationKey) {
    return affiliateOffers[locationKey];
  }

  const countryCode = locationCode.split('-')[0];
  const countryKey = getKeyIgnoringCase(affiliateOffers, countryCode);
  return countryKey ? affiliateOffers[countryKey] : null;
}

export function getAffiliateOfferLink(affiliateOffers, operatorId, locationCode, offerType = DEFAULT_OFFER_TYPE) {
  const normalizedOperatorId = normalizeOperatorId(operatorId);
  const normalizedLocationCode = normalizeLocationCode(locationCode);
  const normalizedOfferType = normalizeOfferType(offerType);

  if (!normalizedOperatorId || !normalizedLocationCode) {
    return null;
  }

  const locationOffers = getAffiliateOffersForLocation(affiliateOffers, normalizedLocationCode);
  const operatorKey = getKeyIgnoringCase(locationOffers, normalizedOperatorId);
  const offers = operatorKey && Array.isArray(locationOffers[operatorKey]) ? locationOffers[operatorKey] : [];
  const link = offers.find((offer) =>
    offer?.type?.trim().toUpperCase() === normalizedOfferType &&
    typeof offer?.link === 'string' &&
    offer.link.trim()
  )?.link?.trim();

  if (!link) {
    return null;
  }

  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

/**
 * Redirects to the first configured affiliate offer for an operator and location.
 *
 * Canonical query parameters:
 *   /affiliate/offer?operator=fanduel&location=US-NY&offerType=SPORTSBOOK_SIGNUP
 *
 * The location is optional; when it is omitted, the location loaded by the app is used.
 */
// TODO: once the offers page is good to go we can fallback to that redirect instead of '/'
// TODO: metrics
function AffiliateOfferRedirect() {
  const { configuration, location } = useContext(GlobalContext);

  const redirectTarget = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const operatorId = searchParams.get('operator') || searchParams.get('operatorId');
    const requestedLocationCode = searchParams.get('location');
    const offerType = searchParams.get('offerType') || DEFAULT_OFFER_TYPE;
    const locationCode = requestedLocationCode || location?.region?.code || location?.country?.code;

    if (!normalizeOperatorId(operatorId)) {
      return '/';
    }

    // TODO: instead of returning / just fall back to one of the other options
    if (requestedLocationCode && !REGION_LOCATION_CODE_PATTERN.test(requestedLocationCode.trim())) {
      return '/';
    }

    // Wait for the app's location request when no explicit location was supplied.
    if (!requestedLocationCode && !locationCode) {
      return null;
    }

    return getAffiliateOfferLink(configuration?.affiliateOffers, operatorId, locationCode, offerType) || '/';
  }, [configuration, location]);

  useEffect(() => {
    if (!redirectTarget) {
      return undefined;
    }

    // Delay the navigation slightly so affiliate/ad-blocking extensions do not
    // treat this transient page as a direct affiliate navigation.
    const redirectTimeout = window.setTimeout(() => {
      console.log(redirectTarget)
      window.location.replace(redirectTarget);
    }, 500);

    return () => window.clearTimeout(redirectTimeout);
  }, [redirectTarget]);

  return (
    <div
      role="status"
      aria-label="Finding your offer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
    >
      <Loader />
    </div>
  );
}

export default AffiliateOfferRedirect;
