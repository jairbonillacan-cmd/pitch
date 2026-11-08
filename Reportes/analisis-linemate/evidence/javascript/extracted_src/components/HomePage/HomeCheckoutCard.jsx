import { useContext, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import GlobalContext from '../GlobalContext';
import { API_HOST } from '../../react-web-constants';
import {
    getBetslipDetailsV2,
    getBetslipLinks,
    getBookEntryBasedOnBestOdds,
    getParlayBestEligibleProvider
} from '../../linemate-react-common/src/util';
import {
    FEATURE_BETSLIP,
    SPORTSBOOKS_CONFIG
} from '../../linemate-react-common/src/constants';
import './HomeCheckoutCard.scss';

export default function HomeCheckoutCard({ trend, children }) {
    const context = useContext(GlobalContext);
    const { t } = useTranslation();
    const opening = useRef(false);
    const isParlay = Array.isArray(trend.legs);
    const legs = isParlay ? trend.legs : [trend];
    const checkoutProviders = context.betslipProviders || [];
    const candidates = isParlay && trend.featuredProvider
        ? checkoutProviders.includes(trend.featuredProvider)
            ? [trend.featuredProvider]
            : []
        : (context.resolvedPreferredProviders || []).filter((provider) =>
            checkoutProviders.includes(provider)
        );

    const provider = context.enabledFeatures?.has(FEATURE_BETSLIP) && candidates.length
        ? isParlay
            ? getParlayBestEligibleProvider(trend, candidates)
            : getBookEntryBasedOnBestOdds(
                trend.market?.books || {},
                trend.outcome,
                trend.line,
                candidates,
                trend.alternate
            )
        : null;

    const card = children(
        provider ? [provider] : context.resolvedPreferredProviders
    );

    async function openCheckout(event) {
        event.stopPropagation();
        if (opening.current || !provider) return;

        opening.current = true;
        const checkoutTab = window.open('about:blank', '_blank');
        if (checkoutTab) checkoutTab.opener = null;

        try {
            const country = context.location?.country?.code;
            const region = context.location?.region?.code;
            let links;

            if (isParlay) {
                const details = await getBetslipDetailsV2(API_HOST, {
                    [provider]: {
                        legs: legs.map((leg) => ({
                            line: leg.line || 0,
                            outcome: leg.outcome,
                            providerData: leg.market.providerData
                        }))
                    }
                }, country, region);
                links = details?.operators?.[provider]?.links;
            }

            if (!links?.web) {
                const operatorData = legs.map((leg) => {
                    const outcome = leg.market?.books?.[provider]?.[leg.outcome];
                    const selected = leg.line === outcome?.current?.value
                        ? outcome.current
                        : Object.values(outcome?.alternates || {})
                            .find((item) => item?.value === leg.line);
                    return selected?.operatorData;
                }).filter((data) => data != null);

                links = await getBetslipLinks(
                    API_HOST, provider, operatorData, country, region
                );
            }

            if (links?.web) {
                if (checkoutTab) checkoutTab.location.replace(links.web);
                else window.location.assign(links.web);
            } else {
                checkoutTab?.close();
            }
        } catch (error) {
            checkoutTab?.close();
            console.error('Unable to open checkout', error);
        } finally {
            opening.current = false;
        }
    }

    if (!provider) return card;

    return (
        <div className="home-parlay-checkout-card">
            {card}
            <button
                type="button"
                className="home-parlay-checkout-footer text-style-label-medium color-fig-default"
                onClick={openCheckout}
            >
                <span>{t('home.checkout.placeItOn')}</span>
                <img
                    className="home-parlay-checkout-book"
                    src={`/assets/sportsbooks/${provider}.svg`}
                    alt=""
                />
                <span className="home-parlay-checkout-name">
                    {SPORTSBOOKS_CONFIG[provider]?.displayName}
                </span>
                <img
                    className="home-parlay-checkout-external"
                    src="/assets/external.svg"
                    alt=""
                />
            </button>
        </div>
    );
}